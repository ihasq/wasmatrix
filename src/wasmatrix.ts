const CERTIFICATE_LANES: i32 = 4;
const HOMOGENEOUS_LANE: i32 = 3;
const WEIGHT_CELLS: i32 = CERTIFICATE_LANES * CERTIFICATE_LANES;
const ONE_THIRD: f64 = 1.0 / 3.0;
const ONE_FOURTH: f64 = 1.0 / 4.0;
const BATCH_INSTRUCTION_I32_SLOTS: i32 = 8;
const BATCH_OP_MATMUL: i32 = 2;

const SKIP_COEFF_MASK: i32 = 0xffff;
const SKIP_DEAD_INPUT_SHIFT: i32 = 16;
const SKIP_DEAD_OUTPUT_SHIFT: i32 = 20;
const SKIP_DEAD_INPUT_MASK: i32 = 0xf << SKIP_DEAD_INPUT_SHIFT;
const SKIP_DEAD_OUTPUT_MASK: i32 = 0xf << SKIP_DEAD_OUTPUT_SHIFT;

function f32Offset(index: i32): usize {
  return <usize> index << 2;
}

function f64Offset(index: i32): usize {
  return <usize> index << 3;
}

function readF32(ptr: usize, index: i32): f32 {
  return load<f32>(ptr + f32Offset(index));
}

function writeF32(ptr: usize, index: i32, value: f32): void {
  store<f32>(ptr + f32Offset(index), value);
}

function readF64(ptr: usize, index: i32): f64 {
  return load<f64>(ptr + f64Offset(index));
}

function writeF64(ptr: usize, index: i32, value: f64): void {
  store<f64>(ptr + f64Offset(index), value);
}

function batchOffset(instructions: usize, instruction: i32, slot: i32): usize {
  return instructions +
    f32Offset(instruction * BATCH_INSTRUCTION_I32_SLOTS + slot);
}

function readBatchI32(instructions: usize, instruction: i32, slot: i32): i32 {
  return load<i32>(batchOffset(instructions, instruction, slot));
}

function simdLimit(length: i32): i32 {
  return length & -4;
}

function copyF32(input: usize, out: usize, length: i32): void {
  let i = 0;
  let limit = simdLimit(length);
  for (; i < limit; i += 4) {
    v128.store(out + f32Offset(i), v128.load(input + f32Offset(i)));
  }
  for (; i < length; i++) {
    writeF32(out, i, readF32(input, i));
  }
}

function zeroF32(out: usize, length: i32): void {
  let zero = f32x4.splat(0.0);
  let i = 0;
  let limit = simdLimit(length);
  for (; i < limit; i += 4) {
    v128.store(out + f32Offset(i), zero);
  }
  for (; i < length; i++) {
    writeF32(out, i, 0.0);
  }
}

function makeF32x4(a: f32, b: f32, c: f32, d: f32): v128 {
  let value = f32x4.splat(a);
  value = f32x4.replace_lane(value, 1, b);
  value = f32x4.replace_lane(value, 2, c);
  value = f32x4.replace_lane(value, 3, d);
  return value;
}

function weightIndex(row: i32, col: i32): i32 {
  return row * CERTIFICATE_LANES + col;
}

function coeffBit(row: i32, col: i32): i32 {
  return 1 << weightIndex(row, col);
}

function assertLane(index: i32): void {
  assert(index >= 0 && index < CERTIFICATE_LANES);
}

function assertWeightCell(row: i32, col: i32): void {
  assertLane(row);
  assertLane(col);
}

function readWeightCellUnchecked(weight: usize, row: i32, col: i32): f64 {
  return readF64(weight, weightIndex(row, col));
}

function writeWeightCellUnchecked(
  weight: usize,
  row: i32,
  col: i32,
  value: f64,
): void {
  writeF64(weight, weightIndex(row, col), value);
}

function isCoeffZero(weight: usize, row: i32, col: i32): bool {
  return readWeightCellUnchecked(weight, row, col) == 0.0;
}

function operatorZeroMask(weight: usize): i32 {
  let mask = 0;
  for (let row = 0; row < CERTIFICATE_LANES; row++) {
    for (let col = 0; col < CERTIFICATE_LANES; col++) {
      if (isCoeffZero(weight, row, col)) mask |= coeffBit(row, col);
    }
  }
  return mask;
}

function columnCoeffMask(col: i32): i32 {
  let mask = 0;
  for (let row = 0; row < CERTIFICATE_LANES; row++) {
    mask |= coeffBit(row, col);
  }
  return mask;
}

function rowCoeffMask(row: i32): i32 {
  let mask = 0;
  for (let col = 0; col < CERTIFICATE_LANES; col++) {
    mask |= coeffBit(row, col);
  }
  return mask;
}

function operatorDeadInputMask(zeroMask: i32): i32 {
  let mask = 0;
  for (let col = 0; col < CERTIFICATE_LANES; col++) {
    let columnMask = columnCoeffMask(col);
    if ((zeroMask & columnMask) == columnMask) {
      mask |= 1 << (SKIP_DEAD_INPUT_SHIFT + col);
    }
  }
  return mask;
}

function operatorDeadOutputMask(zeroMask: i32): i32 {
  let mask = 0;
  for (let row = 0; row < CERTIFICATE_LANES; row++) {
    let rowMask = rowCoeffMask(row);
    if ((zeroMask & rowMask) == rowMask) {
      mask |= 1 << (SKIP_DEAD_OUTPUT_SHIFT + row);
    }
  }
  return mask;
}

function dotWeightRow4(
  weight: usize,
  row: i32,
  a: f64,
  b: f64,
  c: f64,
  d: f64,
): f64 {
  let base = weight + f64Offset(row * CERTIFICATE_LANES);
  let low = f64x2.mul(v128.load(base), f64x2(a, b));
  let high = f64x2.mul(v128.load(base + f64Offset(2)), f64x2(c, d));
  return f64x2.extract_lane(low, 0) + f64x2.extract_lane(low, 1) +
    f64x2.extract_lane(high, 0) + f64x2.extract_lane(high, 1);
}

function certificateDistanceSquared(left: usize, right: usize): f64 {
  let lowDelta = f64x2.sub(v128.load(left), v128.load(right));
  let highDelta = f64x2.sub(
    v128.load(left + f64Offset(2)),
    v128.load(right + f64Offset(2)),
  );
  let lowSquared = f64x2.mul(lowDelta, lowDelta);
  let highSquared = f64x2.mul(highDelta, highDelta);
  return f64x2.extract_lane(lowSquared, 0) +
    f64x2.extract_lane(lowSquared, 1) +
    f64x2.extract_lane(highSquared, 0) +
    f64x2.extract_lane(highSquared, 1);
}

function loadIdentityCells(
  weight: usize,
  diagonal: f64,
  offDiagonal: f64,
): void {
  for (let row = 0; row < CERTIFICATE_LANES; row++) {
    for (let col = 0; col < CERTIFICATE_LANES; col++) {
      writeWeightCellUnchecked(
        weight,
        row,
        col,
        row == col ? diagonal : offDiagonal,
      );
    }
  }
}

function multiplyCell4(left: usize, right: usize, row: i32, col: i32): f64 {
  return readWeightCellUnchecked(left, row, 0) *
      readWeightCellUnchecked(right, 0, col) +
    readWeightCellUnchecked(left, row, 1) *
      readWeightCellUnchecked(right, 1, col) +
    readWeightCellUnchecked(left, row, 2) *
      readWeightCellUnchecked(right, 2, col) +
    readWeightCellUnchecked(left, row, 3) *
      readWeightCellUnchecked(right, 3, col);
}

function multiplyWeights(left: usize, right: usize, out: usize): void {
  let m00 = multiplyCell4(left, right, 0, 0);
  let m01 = multiplyCell4(left, right, 0, 1);
  let m02 = multiplyCell4(left, right, 0, 2);
  let m03 = multiplyCell4(left, right, 0, 3);
  let m10 = multiplyCell4(left, right, 1, 0);
  let m11 = multiplyCell4(left, right, 1, 1);
  let m12 = multiplyCell4(left, right, 1, 2);
  let m13 = multiplyCell4(left, right, 1, 3);
  let m20 = multiplyCell4(left, right, 2, 0);
  let m21 = multiplyCell4(left, right, 2, 1);
  let m22 = multiplyCell4(left, right, 2, 2);
  let m23 = multiplyCell4(left, right, 2, 3);
  let m30 = multiplyCell4(left, right, 3, 0);
  let m31 = multiplyCell4(left, right, 3, 1);
  let m32 = multiplyCell4(left, right, 3, 2);
  let m33 = multiplyCell4(left, right, 3, 3);

  writeWeightCellUnchecked(out, 0, 0, m00);
  writeWeightCellUnchecked(out, 0, 1, m01);
  writeWeightCellUnchecked(out, 0, 2, m02);
  writeWeightCellUnchecked(out, 0, 3, m03);
  writeWeightCellUnchecked(out, 1, 0, m10);
  writeWeightCellUnchecked(out, 1, 1, m11);
  writeWeightCellUnchecked(out, 1, 2, m12);
  writeWeightCellUnchecked(out, 1, 3, m13);
  writeWeightCellUnchecked(out, 2, 0, m20);
  writeWeightCellUnchecked(out, 2, 1, m21);
  writeWeightCellUnchecked(out, 2, 2, m22);
  writeWeightCellUnchecked(out, 2, 3, m23);
  writeWeightCellUnchecked(out, 3, 0, m30);
  writeWeightCellUnchecked(out, 3, 1, m31);
  writeWeightCellUnchecked(out, 3, 2, m32);
  writeWeightCellUnchecked(out, 3, 3, m33);
}

function isIdentityWeight(weight: usize): bool {
  for (let row = 0; row < CERTIFICATE_LANES; row++) {
    for (let col = 0; col < CERTIFICATE_LANES; col++) {
      let expected = row == col ? 1.0 : 0.0;
      if (readWeightCellUnchecked(weight, row, col) != expected) return false;
    }
  }
  return true;
}

function offDiagonalMask(): i32 {
  let mask = 0;
  for (let row = 0; row < CERTIFICATE_LANES; row++) {
    for (let col = 0; col < CERTIFICATE_LANES; col++) {
      if (row != col) mask |= coeffBit(row, col);
    }
  }
  return mask;
}

function isDiagonalWeight(zeroMask: i32): bool {
  let mask = offDiagonalMask();
  return (zeroMask & mask) == mask;
}

function isInvariantWeight(weight: usize): bool {
  for (let i = 0; i < WEIGHT_CELLS; i++) {
    if (readF64(weight, i) != ONE_FOURTH) return false;
  }
  return true;
}

function isPermutationWeight(weight: usize, shift: i32): bool {
  for (let row = 0; row < CERTIFICATE_LANES; row++) {
    let source = (row + shift) & 3;
    for (let col = 0; col < CERTIFICATE_LANES; col++) {
      let expected = col == source ? 1.0 : 0.0;
      if (readWeightCellUnchecked(weight, row, col) != expected) return false;
    }
  }
  return true;
}

function isCycleWeight(weight: usize): bool {
  return isPermutationWeight(weight, 1);
}

function isReverseCycleWeight(weight: usize): bool {
  return isPermutationWeight(weight, 3);
}

function diagonalVectorF32(weight: usize): v128 {
  return makeF32x4(
    <f32> readWeightCellUnchecked(weight, 0, 0),
    <f32> readWeightCellUnchecked(weight, 1, 1),
    <f32> readWeightCellUnchecked(weight, 2, 2),
    <f32> readWeightCellUnchecked(weight, 3, 3),
  );
}

function weightColumnF32(weight: usize, col: i32): v128 {
  return makeF32x4(
    <f32> readWeightCellUnchecked(weight, 0, col),
    <f32> readWeightCellUnchecked(weight, 1, col),
    <f32> readWeightCellUnchecked(weight, 2, col),
    <f32> readWeightCellUnchecked(weight, 3, col),
  );
}

function f32x4Loss(original: v128, result: v128): f64 {
  let d0 = <f64> f32x4.extract_lane(result, 0) -
    <f64> f32x4.extract_lane(original, 0);
  let d1 = <f64> f32x4.extract_lane(result, 1) -
    <f64> f32x4.extract_lane(original, 1);
  let d2 = <f64> f32x4.extract_lane(result, 2) -
    <f64> f32x4.extract_lane(original, 2);
  let d3 = <f64> f32x4.extract_lane(result, 3) -
    <f64> f32x4.extract_lane(original, 3);
  return d0 * d0 + d1 * d1 + d2 * d2 + d3 * d3;
}

function blockLaneValue(a: f32, b: f32, c: f32, d: f32, lane: i32): f32 {
  if (lane == 0) return a;
  if (lane == 1) return b;
  if (lane == 2) return c;
  return d;
}

function applyScalarBlockF32(
  weight: usize,
  zeroMask: i32,
  input: usize,
  base: i32,
  length: i32,
  out: usize,
  recordLoss: bool,
): f64 {
  let a: f32 = base < length ? readF32(input, base) : 0.0;
  let b: f32 = base + 1 < length ? readF32(input, base + 1) : 0.0;
  let c: f32 = base + 2 < length ? readF32(input, base + 2) : 0.0;
  let d: f32 = base + 3 < length ? readF32(input, base + 3) : 0.0;
  let loss = 0.0;

  for (let row = 0; row < CERTIFICATE_LANES; row++) {
    let outputIndex = base + row;
    if (outputIndex >= length) break;

    let y: f32 = 0.0;
    for (let col = 0; col < CERTIFICATE_LANES; col++) {
      if ((zeroMask & coeffBit(row, col)) == 0) {
        y += <f32> readWeightCellUnchecked(weight, row, col) *
          blockLaneValue(a, b, c, d, col);
      }
    }

    writeF32(out, outputIndex, y);
    if (recordLoss) {
      let delta = <f64> y - <f64> blockLaneValue(a, b, c, d, row);
      loss += delta * delta;
    }
  }

  return loss;
}

function applyDiagonalF32(
  weight: usize,
  input: usize,
  length: i32,
  out: usize,
): void {
  let diagonal = diagonalVectorF32(weight);
  let i = 0;
  let limit = simdLimit(length);
  for (; i < limit; i += CERTIFICATE_LANES) {
    let value = v128.load(input + f32Offset(i));
    v128.store(out + f32Offset(i), f32x4.mul(value, diagonal));
  }
  for (; i < length; i++) {
    let lane = i & 3;
    writeF32(
      out,
      i,
      readF32(input, i) * <f32> readWeightCellUnchecked(weight, lane, lane),
    );
  }
}

function applyCycleF32(input: usize, length: i32, out: usize): void {
  let i = 0;
  let limit = simdLimit(length);
  for (; i < limit; i += CERTIFICATE_LANES) {
    let value = v128.load(input + f32Offset(i));
    v128.store(out + f32Offset(i), f32x4.shuffle(value, value, 1, 2, 3, 0));
  }

  if (i < length) {
    let a: f32 = i < length ? readF32(input, i) : 0.0;
    let b: f32 = i + 1 < length ? readF32(input, i + 1) : 0.0;
    let c: f32 = i + 2 < length ? readF32(input, i + 2) : 0.0;
    let d: f32 = i + 3 < length ? readF32(input, i + 3) : 0.0;
    writeF32(out, i, b);
    if (i + 1 < length) writeF32(out, i + 1, c);
    if (i + 2 < length) writeF32(out, i + 2, d);
    if (i + 3 < length) writeF32(out, i + 3, a);
  }
}

function applyReverseCycleF32(input: usize, length: i32, out: usize): void {
  let i = 0;
  let limit = simdLimit(length);
  for (; i < limit; i += CERTIFICATE_LANES) {
    let value = v128.load(input + f32Offset(i));
    v128.store(out + f32Offset(i), f32x4.shuffle(value, value, 3, 0, 1, 2));
  }

  if (i < length) {
    let a: f32 = i < length ? readF32(input, i) : 0.0;
    let b: f32 = i + 1 < length ? readF32(input, i + 1) : 0.0;
    let c: f32 = i + 2 < length ? readF32(input, i + 2) : 0.0;
    let d: f32 = i + 3 < length ? readF32(input, i + 3) : 0.0;
    writeF32(out, i, d);
    if (i + 1 < length) writeF32(out, i + 1, a);
    if (i + 2 < length) writeF32(out, i + 2, b);
    if (i + 3 < length) writeF32(out, i + 3, c);
  }
}

function invariantF32x4(value: v128): v128 {
  let pairs = f32x4.add(value, f32x4.shuffle(value, value, 2, 3, 0, 1));
  let total = f32x4.add(pairs, f32x4.shuffle(pairs, pairs, 1, 0, 3, 2));
  return f32x4.mul(total, f32x4.splat(<f32> ONE_FOURTH));
}

function applyInvariantF32(input: usize, length: i32, out: usize): void {
  let i = 0;
  let limit = simdLimit(length);
  for (; i < limit; i += CERTIFICATE_LANES) {
    v128.store(
      out + f32Offset(i),
      invariantF32x4(v128.load(input + f32Offset(i))),
    );
  }

  if (i < length) {
    let a: f32 = i < length ? readF32(input, i) : 0.0;
    let b: f32 = i + 1 < length ? readF32(input, i + 1) : 0.0;
    let c: f32 = i + 2 < length ? readF32(input, i + 2) : 0.0;
    let d: f32 = i + 3 < length ? readF32(input, i + 3) : 0.0;
    let value = (a + b + c + d) * <f32> ONE_FOURTH;
    writeF32(out, i, value);
    if (i + 1 < length) writeF32(out, i + 1, value);
    if (i + 2 < length) writeF32(out, i + 2, value);
    if (i + 3 < length) writeF32(out, i + 3, value);
  }
}

function applySparseF32(
  weight: usize,
  zeroMask: i32,
  input: usize,
  length: i32,
  out: usize,
  recordLoss: bool,
): f64 {
  let column0 = columnCoeffMask(0);
  let column1 = columnCoeffMask(1);
  let column2 = columnCoeffMask(2);
  let column3 = columnCoeffMask(3);
  let live0 = (zeroMask & column0) != column0;
  let live1 = (zeroMask & column1) != column1;
  let live2 = (zeroMask & column2) != column2;
  let live3 = (zeroMask & column3) != column3;
  let c0 = weightColumnF32(weight, 0);
  let c1 = weightColumnF32(weight, 1);
  let c2 = weightColumnF32(weight, 2);
  let c3 = weightColumnF32(weight, 3);
  let loss = 0.0;

  let i = 0;
  let limit = simdLimit(length);
  for (; i < limit; i += CERTIFICATE_LANES) {
    let x = v128.load(input + f32Offset(i));
    let y = f32x4.splat(0.0);
    if (live0) {
      y = f32x4.add(y, f32x4.mul(f32x4.splat(f32x4.extract_lane(x, 0)), c0));
    }
    if (live1) {
      y = f32x4.add(y, f32x4.mul(f32x4.splat(f32x4.extract_lane(x, 1)), c1));
    }
    if (live2) {
      y = f32x4.add(y, f32x4.mul(f32x4.splat(f32x4.extract_lane(x, 2)), c2));
    }
    if (live3) {
      y = f32x4.add(y, f32x4.mul(f32x4.splat(f32x4.extract_lane(x, 3)), c3));
    }
    v128.store(out + f32Offset(i), y);
    if (recordLoss) loss += f32x4Loss(x, y);
  }

  if (i < length) {
    loss += applyScalarBlockF32(
      weight,
      zeroMask,
      input,
      i,
      length,
      out,
      recordLoss,
    );
  }
  return loss;
}

function applyDenseF32(
  weight: usize,
  input: usize,
  length: i32,
  out: usize,
  recordLoss: bool,
): f64 {
  let c0 = weightColumnF32(weight, 0);
  let c1 = weightColumnF32(weight, 1);
  let c2 = weightColumnF32(weight, 2);
  let c3 = weightColumnF32(weight, 3);
  let loss = 0.0;

  let i = 0;
  let limit = simdLimit(length);
  for (; i < limit; i += CERTIFICATE_LANES) {
    let x = v128.load(input + f32Offset(i));
    let y = f32x4.mul(f32x4.splat(f32x4.extract_lane(x, 0)), c0);
    y = f32x4.add(y, f32x4.mul(f32x4.splat(f32x4.extract_lane(x, 1)), c1));
    y = f32x4.add(y, f32x4.mul(f32x4.splat(f32x4.extract_lane(x, 2)), c2));
    y = f32x4.add(y, f32x4.mul(f32x4.splat(f32x4.extract_lane(x, 3)), c3));
    v128.store(out + f32Offset(i), y);
    if (recordLoss) loss += f32x4Loss(x, y);
  }

  if (i < length) {
    loss += applyScalarBlockF32(weight, 0, input, i, length, out, recordLoss);
  }
  return loss;
}

function washF32WithWeight(
  weight: usize,
  input: usize,
  length: i32,
  out: usize,
  recordLoss: bool,
): f64 {
  assert(length >= 0);

  let skipMask = operatorSkipMask(weight);
  let zeroMask = skipMask & SKIP_COEFF_MASK;

  if (zeroMask == SKIP_COEFF_MASK) {
    zeroF32(out, length);
    if (!recordLoss) return 0.0;
    let loss = 0.0;
    for (let i = 0; i < length; i++) {
      let value = <f64> readF32(input, i);
      loss += value * value;
    }
    return loss;
  }

  if (!recordLoss) {
    if (isIdentityWeight(weight)) {
      if (input != out) copyF32(input, out, length);
      return 0.0;
    }
    if (isInvariantWeight(weight)) {
      applyInvariantF32(input, length, out);
      return 0.0;
    }
    if (isCycleWeight(weight)) {
      applyCycleF32(input, length, out);
      return 0.0;
    }
    if (isReverseCycleWeight(weight)) {
      applyReverseCycleF32(input, length, out);
      return 0.0;
    }
    if (isDiagonalWeight(zeroMask)) {
      applyDiagonalF32(weight, input, length, out);
      return 0.0;
    }
  }

  if (zeroMask != 0) {
    return applySparseF32(weight, zeroMask, input, length, out, recordLoss);
  }
  return applyDenseF32(weight, input, length, out, recordLoss);
}

function matmulF32(
  left: usize,
  right: usize,
  out: usize,
  rows: i32,
  shared: i32,
  cols: i32,
): void {
  assert(rows >= 0 && shared >= 0 && cols >= 0);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      let sum: f32 = 0.0;
      for (let k = 0; k < shared; k++) {
        sum += readF32(left, row * shared + k) * readF32(right, k * cols + col);
      }
      writeF32(out, row * cols + col, sum);
    }
  }
}

export function abiVersion(): i32 {
  return 10;
}

export function weightSystemAbiVersion(): i32 {
  return 1;
}

export function operatorAbiVersion(): i32 {
  return 4;
}

export function simdProbe(): i32 {
  let value = f32x4.add(f32x4.splat(1.0), f32x4.splat(2.0));
  return f32x4.extract_lane(value, 0) == 3.0 ? 1 : 0;
}

export function allocF32(length: i32): usize {
  assert(length >= 0);
  return heap.alloc(<usize> length << 2);
}

export function allocF64(length: i32): usize {
  assert(length >= 0);
  return heap.alloc(<usize> length << 3);
}

export function allocI32(length: i32): usize {
  assert(length >= 0);
  return heap.alloc(<usize> length << 2);
}

export function free(ptr: usize): void {
  heap.free(ptr);
}

export function batchInstructionI32Slots(): i32 {
  return BATCH_INSTRUCTION_I32_SLOTS;
}

export function batchOpcodeMatmul(): i32 {
  return BATCH_OP_MATMUL;
}

export function executeBatch(instructions: usize, count: i32): i32 {
  assert(count >= 0);
  let executed = 0;
  for (let instruction = 0; instruction < count; instruction++) {
    let opcode = readBatchI32(instructions, instruction, 0);
    if (opcode == BATCH_OP_MATMUL) {
      matmulF32(
        <usize> readBatchI32(instructions, instruction, 1),
        <usize> readBatchI32(instructions, instruction, 2),
        <usize> readBatchI32(instructions, instruction, 3),
        readBatchI32(instructions, instruction, 4),
        readBatchI32(instructions, instruction, 5),
        readBatchI32(instructions, instruction, 6),
      );
      executed++;
    }
  }
  return executed;
}

export function certificateLanes(): i32 {
  return CERTIFICATE_LANES;
}

export function certificateHomogeneousLane(): i32 {
  return HOMOGENEOUS_LANE;
}

export function weightCells(): i32 {
  return WEIGHT_CELLS;
}

export function operatorWeightCells(): i32 {
  return WEIGHT_CELLS;
}

export function operatorStateF64Length(): i32 {
  return WEIGHT_CELLS;
}

export function operatorZeroCoefficientMaskBits(): i32 {
  return SKIP_COEFF_MASK;
}

export function operatorDeadInputMaskBits(): i32 {
  return SKIP_DEAD_INPUT_MASK;
}

export function operatorDeadOutputMaskBits(): i32 {
  return SKIP_DEAD_OUTPUT_MASK;
}

export function oneThird(): f64 {
  return ONE_THIRD;
}

export function oneFourth(): f64 {
  return ONE_FOURTH;
}

export function writeCertificate(
  out: usize,
  a: f64,
  b: f64,
  c: f64,
  d: f64,
): void {
  writeF64(out, 0, a);
  writeF64(out, 1, b);
  writeF64(out, 2, c);
  writeF64(out, 3, d);
}

export function readCertificateLane(input: usize, lane: i32): f64 {
  assertLane(lane);
  return readF64(input, lane);
}

export function initLossState(out: usize): void {
  writeF64(out, 0, 1.0);
  writeF64(out, 1, 0.0);
  writeF64(out, 2, 0.0);
}

export function pushLoss(state: usize, out: usize, localLoss: f64): void {
  writeF64(out, 0, readF64(state, 0));
  writeF64(out, 1, readF64(state, 1) + localLoss);
  writeF64(out, 2, localLoss);
}

export function accumulatedLoss(state: usize): f64 {
  return readF64(state, 1);
}

export function localLoss(state: usize): f64 {
  return readF64(state, 2);
}

export function initWeightIdentity(weight: usize): void {
  loadIdentityCells(weight, 1.0, 0.0);
}

export function clearWeight(weight: usize): void {
  for (let i = 0; i < WEIGHT_CELLS; i++) {
    writeF64(weight, i, 0.0);
  }
}

export function writeWeightCell(
  weight: usize,
  row: i32,
  col: i32,
  value: f64,
): void {
  assertWeightCell(row, col);
  writeWeightCellUnchecked(weight, row, col, value);
}

export function readWeightCell(weight: usize, row: i32, col: i32): f64 {
  assertWeightCell(row, col);
  return readWeightCellUnchecked(weight, row, col);
}

export function writeWeight(
  weight: usize,
  m00: f64,
  m01: f64,
  m02: f64,
  m03: f64,
  m10: f64,
  m11: f64,
  m12: f64,
  m13: f64,
  m20: f64,
  m21: f64,
  m22: f64,
  m23: f64,
  m30: f64,
  m31: f64,
  m32: f64,
  m33: f64,
): void {
  writeWeightCellUnchecked(weight, 0, 0, m00);
  writeWeightCellUnchecked(weight, 0, 1, m01);
  writeWeightCellUnchecked(weight, 0, 2, m02);
  writeWeightCellUnchecked(weight, 0, 3, m03);
  writeWeightCellUnchecked(weight, 1, 0, m10);
  writeWeightCellUnchecked(weight, 1, 1, m11);
  writeWeightCellUnchecked(weight, 1, 2, m12);
  writeWeightCellUnchecked(weight, 1, 3, m13);
  writeWeightCellUnchecked(weight, 2, 0, m20);
  writeWeightCellUnchecked(weight, 2, 1, m21);
  writeWeightCellUnchecked(weight, 2, 2, m22);
  writeWeightCellUnchecked(weight, 2, 3, m23);
  writeWeightCellUnchecked(weight, 3, 0, m30);
  writeWeightCellUnchecked(weight, 3, 1, m31);
  writeWeightCellUnchecked(weight, 3, 2, m32);
  writeWeightCellUnchecked(weight, 3, 3, m33);
}

export function operatorSkipMask(operator: usize): i32 {
  let zeroMask = operatorZeroMask(operator);
  return zeroMask | operatorDeadInputMask(zeroMask) |
    operatorDeadOutputMask(zeroMask);
}

export function applyWeight(
  weight: usize,
  certificate: usize,
  out: usize,
): void {
  let a = readF64(certificate, 0);
  let b = readF64(certificate, 1);
  let c = readF64(certificate, 2);
  let d = readF64(certificate, 3);

  writeF64(out, 0, dotWeightRow4(weight, 0, a, b, c, d));
  writeF64(out, 1, dotWeightRow4(weight, 1, a, b, c, d));
  writeF64(out, 2, dotWeightRow4(weight, 2, a, b, c, d));
  writeF64(out, 3, dotWeightRow4(weight, 3, a, b, c, d));
}

export function applyWeightF32(
  weight: usize,
  input: usize,
  length: i32,
  out: usize,
): void {
  washF32WithWeight(weight, input, length, out, false);
}

export function applyWeightF32AndRecordLoss(
  weight: usize,
  input: usize,
  length: i32,
  out: usize,
  lossState: usize,
): void {
  pushLoss(
    lossState,
    lossState,
    washF32WithWeight(weight, input, length, out, true),
  );
}

export function composeWeights(left: usize, right: usize, out: usize): void {
  multiplyWeights(left, right, out);
}

export function leftComposeWeight(weight: usize, update: usize): void {
  multiplyWeights(update, weight, weight);
}

export function rightComposeWeight(weight: usize, update: usize): void {
  multiplyWeights(weight, update, weight);
}

export function apiSetInvariantWeight(weight: usize): void {
  for (let i = 0; i < WEIGHT_CELLS; i++) {
    writeF64(weight, i, ONE_FOURTH);
  }
}

export function apiSetPhaseCycleWeight(weight: usize): void {
  clearWeight(weight);
  writeWeightCellUnchecked(weight, 0, 1, 1.0);
  writeWeightCellUnchecked(weight, 1, 2, 1.0);
  writeWeightCellUnchecked(weight, 2, 3, 1.0);
  writeWeightCellUnchecked(weight, 3, 0, 1.0);
}

export function apiSetPhaseReverseCycleWeight(weight: usize): void {
  clearWeight(weight);
  writeWeightCellUnchecked(weight, 0, 3, 1.0);
  writeWeightCellUnchecked(weight, 1, 0, 1.0);
  writeWeightCellUnchecked(weight, 2, 1, 1.0);
  writeWeightCellUnchecked(weight, 3, 2, 1.0);
}

export function apiScaleOutputLane(
  weight: usize,
  lane: i32,
  factor: f64,
): void {
  assertLane(lane);
  let base = weight + f64Offset(lane * CERTIFICATE_LANES);
  let scale = f64x2.splat(factor);
  v128.store(base, f64x2.mul(v128.load(base), scale));
  v128.store(
    base + f64Offset(2),
    f64x2.mul(v128.load(base + f64Offset(2)), scale),
  );
}

export function apiBlendOutputLanes(
  weight: usize,
  targetLane: i32,
  sourceLane: i32,
  amount: f64,
): void {
  assertLane(targetLane);
  assertLane(sourceLane);

  let target = weight + f64Offset(targetLane * CERTIFICATE_LANES);
  let source = weight + f64Offset(sourceLane * CERTIFICATE_LANES);
  let keep = f64x2.splat(1.0 - amount);
  let take = f64x2.splat(amount);
  let targetLow = v128.load(target);
  let targetHigh = v128.load(target + f64Offset(2));
  let sourceLow = v128.load(source);
  let sourceHigh = v128.load(source + f64Offset(2));

  v128.store(
    target,
    f64x2.add(f64x2.mul(targetLow, keep), f64x2.mul(sourceLow, take)),
  );
  v128.store(
    target + f64Offset(2),
    f64x2.add(f64x2.mul(targetHigh, keep), f64x2.mul(sourceHigh, take)),
  );
}

export function apiAddOutputLane(
  weight: usize,
  targetLane: i32,
  sourceLane: i32,
  factor: f64,
): void {
  assertLane(targetLane);
  assertLane(sourceLane);

  let target = weight + f64Offset(targetLane * CERTIFICATE_LANES);
  let source = weight + f64Offset(sourceLane * CERTIFICATE_LANES);
  let scale = f64x2.splat(factor);
  let targetLow = v128.load(target);
  let targetHigh = v128.load(target + f64Offset(2));
  let sourceLow = v128.load(source);
  let sourceHigh = v128.load(source + f64Offset(2));

  v128.store(target, f64x2.add(targetLow, f64x2.mul(sourceLow, scale)));
  v128.store(
    target + f64Offset(2),
    f64x2.add(targetHigh, f64x2.mul(sourceHigh, scale)),
  );
}

export function normalizeWeightRows(weight: usize): void {
  for (let row = 0; row < CERTIFICATE_LANES; row++) {
    let rowBase = weight + f64Offset(row * CERTIFICATE_LANES);
    let low = v128.load(rowBase);
    let high = v128.load(rowBase + f64Offset(2));
    let sum = f64x2.extract_lane(low, 0) + f64x2.extract_lane(low, 1) +
      f64x2.extract_lane(high, 0) + f64x2.extract_lane(high, 1);
    if (sum != 0.0) {
      let scale = f64x2.splat(1.0 / sum);
      v128.store(rowBase, f64x2.mul(low, scale));
      v128.store(rowBase + f64Offset(2), f64x2.mul(high, scale));
    }
  }
}

export function operatorResetIdentity(operator: usize): void {
  initWeightIdentity(operator);
}

export function operatorClear(operator: usize): void {
  clearWeight(operator);
}

export function operatorReadWeightCell(
  operator: usize,
  row: i32,
  col: i32,
): f64 {
  return readWeightCell(operator, row, col);
}

export function operatorWriteWeightCell(
  operator: usize,
  row: i32,
  col: i32,
  value: f64,
): void {
  writeWeightCell(operator, row, col, value);
}

export function operatorSetInvariant(operator: usize): void {
  apiSetInvariantWeight(operator);
}

export function operatorSetPhaseCycle(operator: usize): void {
  apiSetPhaseCycleWeight(operator);
}

export function operatorSetPhaseReverseCycle(operator: usize): void {
  apiSetPhaseReverseCycleWeight(operator);
}

export function operatorScaleOutputLane(
  operator: usize,
  lane: i32,
  factor: f64,
): void {
  apiScaleOutputLane(operator, lane, factor);
}

export function operatorBlendOutputLanes(
  operator: usize,
  targetLane: i32,
  sourceLane: i32,
  amount: f64,
): void {
  apiBlendOutputLanes(operator, targetLane, sourceLane, amount);
}

export function operatorAddOutputLane(
  operator: usize,
  targetLane: i32,
  sourceLane: i32,
  factor: f64,
): void {
  apiAddOutputLane(operator, targetLane, sourceLane, factor);
}

export function operatorNormalizeRows(operator: usize): void {
  normalizeWeightRows(operator);
}

export function operatorLeftCompose(operator: usize, update: usize): void {
  leftComposeWeight(operator, update);
}

export function operatorRightCompose(operator: usize, update: usize): void {
  rightComposeWeight(operator, update);
}

export function operatorApplyF32(
  operator: usize,
  input: usize,
  length: i32,
  out: usize,
): i32 {
  applyWeightF32(operator, input, length, out);
  return 1;
}

export function operatorApplyF32AndRecordLoss(
  operator: usize,
  input: usize,
  length: i32,
  out: usize,
  lossState: usize,
): i32 {
  applyWeightF32AndRecordLoss(operator, input, length, out, lossState);
  return 1;
}

export function compressF32ToCertificate(
  input: usize,
  length: i32,
  certificate: usize,
  lossState: usize,
): void {
  assert(length >= 0);

  let sum0 = 0.0;
  let sum1 = 0.0;
  let sum2 = 0.0;
  let sum3 = 0.0;
  let count0 = 0;
  let count1 = 0;
  let count2 = 0;
  let count3 = 0;

  for (let i = 0; i < length; i++) {
    let value = <f64> readF32(input, i);
    let lane = i & 3;
    if (lane == 0) {
      sum0 += value;
      count0++;
    } else if (lane == 1) {
      sum1 += value;
      count1++;
    } else if (lane == 2) {
      sum2 += value;
      count2++;
    } else {
      sum3 += value;
      count3++;
    }
  }

  let mean0 = count0 > 0 ? sum0 / <f64> count0 : 0.0;
  let mean1 = count1 > 0 ? sum1 / <f64> count1 : 0.0;
  let mean2 = count2 > 0 ? sum2 / <f64> count2 : 0.0;
  let mean3 = count3 > 0 ? sum3 / <f64> count3 : 0.0;
  writeCertificate(certificate, mean0, mean1, mean2, mean3);

  let loss = 0.0;
  for (let i = 0; i < length; i++) {
    let lane = i & 3;
    let mean = lane == 0
      ? mean0
      : lane == 1
      ? mean1
      : lane == 2
      ? mean2
      : mean3;
    let delta = <f64> readF32(input, i) - mean;
    loss += delta * delta;
  }

  pushLoss(lossState, lossState, loss);
}

export function applyWeightAndRecordLoss(
  weight: usize,
  certificate: usize,
  out: usize,
  lossState: usize,
): void {
  applyWeight(weight, certificate, out);
  pushLoss(lossState, lossState, certificateDistanceSquared(certificate, out));
}

export function certificateResidualSquared(left: usize, right: usize): f64 {
  return certificateDistanceSquared(left, right);
}
