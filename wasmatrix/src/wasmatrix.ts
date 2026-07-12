const CERTIFICATE_LANES: i32 = 4;
const HOMOGENEOUS_LANE: i32 = 3;
const WEIGHT_CELLS: i32 = CERTIFICATE_LANES * CERTIFICATE_LANES;
const EPSILON: f64 = 1.0e-12;
const ONE_THIRD: f64 = 1.0 / 3.0;
const ONE_FOURTH: f64 = 1.0 / 4.0;
const BATCH_INSTRUCTION_I32_SLOTS: i32 = 8;
const BATCH_OP_MATMUL: i32 = 2;
const BATCH_OP_SOLVE: i32 = 3;
const BATCH_OP_TRANSPOSE: i32 = 4;
const BATCH_OP_MATMUL_TN: i32 = 7;
const BATCH_OP_MATMUL_NT: i32 = 8;
const BATCH_OP_MATMUL_TT: i32 = 9;
const BATCH_OP_OUTER: i32 = 17;
const BATCH_OP_DIAGONAL_MATRIX: i32 = 18;
const BATCH_OP_INVERT_DIAGONAL: i32 = 19;
const BATCH_OP_AFFINE: i32 = 20;
const BATCH_OP_SCALE_ROWS_BY_VECTOR: i32 = 21;
const BATCH_OP_SCALE_COLS_BY_VECTOR: i32 = 22;

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

function readI32(ptr: usize, index: i32): i32 {
  return load<i32>(ptr + f32Offset(index));
}

function writeI32(ptr: usize, index: i32, value: i32): void {
  store<i32>(ptr + f32Offset(index), value);
}

function f32FromBits(bits: i32): f32 {
  return reinterpret<f32>(bits);
}

function simdLimit(length: i32): i32 {
  return length & -4;
}

function horizontalSum4(value: v128): f32 {
  let pairSum = f32x4.add(value, f32x4.shuffle(value, value, 2, 3, 0, 1));
  let total = f32x4.add(pairSum, f32x4.shuffle(pairSum, pairSum, 1, 0, 3, 2));
  return f32x4.extract_lane(total, 0);
}

function copyF32ToF64(src: usize, dst: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    writeF64(dst, i, <f64> readF32(src, i));
  }
}

function f64PairLimit(start: i32, end: i32): i32 {
  return start + ((end - start) & -2);
}

function swapRowRangeF64(
  work: usize,
  rowA: i32,
  rowB: i32,
  start: i32,
  end: i32,
): void {
  let c = start;
  let limit = f64PairLimit(start, end);

  for (; c < limit; c += 2) {
    let aPtr = work + f64Offset(rowA + c);
    let bPtr = work + f64Offset(rowB + c);
    let tmp = v128.load(aPtr);
    v128.store(aPtr, v128.load(bPtr));
    v128.store(bPtr, tmp);
  }

  for (; c < end; c++) {
    let aIndex = rowA + c;
    let bIndex = rowB + c;
    let tmp = readF64(work, aIndex);
    writeF64(work, aIndex, readF64(work, bIndex));
    writeF64(work, bIndex, tmp);
  }
}

function divideRowF64(
  work: usize,
  rowBase: i32,
  start: i32,
  end: i32,
  divisor: f64,
): void {
  let divisorVector = f64x2.splat(divisor);
  let c = start;
  let limit = f64PairLimit(start, end);

  for (; c < limit; c += 2) {
    let ptr = work + f64Offset(rowBase + c);
    v128.store(ptr, f64x2.div(v128.load(ptr), divisorVector));
  }

  for (; c < end; c++) {
    let index = rowBase + c;
    writeF64(work, index, readF64(work, index) / divisor);
  }
}

function subtractScaledRowF64(
  work: usize,
  targetBase: i32,
  sourceBase: i32,
  start: i32,
  end: i32,
  factor: f64,
): void {
  let factorVector = f64x2.splat(factor);
  let c = start;
  let limit = f64PairLimit(start, end);

  for (; c < limit; c += 2) {
    let targetPtr = work + f64Offset(targetBase + c);
    let sourcePtr = work + f64Offset(sourceBase + c);
    let product = f64x2.mul(v128.load(sourcePtr), factorVector);
    v128.store(targetPtr, f64x2.sub(v128.load(targetPtr), product));
  }

  for (; c < end; c++) {
    let index = targetBase + c;
    writeF64(
      work,
      index,
      readF64(work, index) - factor * readF64(work, sourceBase + c),
    );
  }
}

function dotSimd(a: usize, b: usize, length: i32): f32 {
  let acc0 = f32x4.splat(0.0);
  let acc1 = f32x4.splat(0.0);
  let acc2 = f32x4.splat(0.0);
  let acc3 = f32x4.splat(0.0);
  let i = 0;
  let unrolledLimit = length & -16;

  for (; i < unrolledLimit; i += 16) {
    let offset = f32Offset(i);
    acc0 = f32x4.add(
      acc0,
      f32x4.mul(v128.load(a + offset), v128.load(b + offset)),
    );
    acc1 = f32x4.add(
      acc1,
      f32x4.mul(v128.load(a + offset + 16), v128.load(b + offset + 16)),
    );
    acc2 = f32x4.add(
      acc2,
      f32x4.mul(v128.load(a + offset + 32), v128.load(b + offset + 32)),
    );
    acc3 = f32x4.add(
      acc3,
      f32x4.mul(v128.load(a + offset + 48), v128.load(b + offset + 48)),
    );
  }

  let acc = f32x4.add(f32x4.add(acc0, acc1), f32x4.add(acc2, acc3));
  let limit = simdLimit(length);
  for (; i < limit; i += 4) {
    let offset = f32Offset(i);
    acc = f32x4.add(
      acc,
      f32x4.mul(v128.load(a + offset), v128.load(b + offset)),
    );
  }

  let result = horizontalSum4(acc);
  for (; i < length; i++) {
    result += readF32(a, i) * readF32(b, i);
  }
  return result;
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

export function fill(out: usize, length: i32, value: f32): void {
  let vector = f32x4.splat(value);
  let i = 0;
  let limit = simdLimit(length);

  for (; i < limit; i += 4) {
    v128.store(out + f32Offset(i), vector);
  }
  for (; i < length; i++) {
    writeF32(out, i, value);
  }
}

export function copy(input: usize, out: usize, length: i32): void {
  copyF32(input, out, length);
}

export function affine(
  input: usize,
  out: usize,
  length: i32,
  multiplier: f32,
  addend: f32,
): void {
  let multiplierVector = f32x4.splat(multiplier);
  let addendVector = f32x4.splat(addend);
  let i = 0;
  let limit = simdLimit(length);

  for (; i < limit; i += 4) {
    let offset = f32Offset(i);
    let value = f32x4.mul(v128.load(input + offset), multiplierVector);
    v128.store(out + offset, f32x4.add(value, addendVector));
  }
  for (; i < length; i++) {
    writeF32(out, i, readF32(input, i) * multiplier + addend);
  }
}

function fusedOtherVector(
  ptr: usize,
  mode: i32,
  row: i32,
  col: i32,
  cols: i32,
  offset: i32,
): v128 {
  if (mode == 1) return v128.load(ptr + f32Offset(col));
  if (mode == 2) return f32x4.splat(readF32(ptr, row));
  return v128.load(ptr + f32Offset(offset));
}

function fusedOtherScalar(
  ptr: usize,
  mode: i32,
  row: i32,
  col: i32,
  cols: i32,
  offset: i32,
): f32 {
  if (mode == 1) return readF32(ptr, col);
  if (mode == 2) return readF32(ptr, row);
  return readF32(ptr, offset);
}

function applyFusedVectorOp(
  value: v128,
  code: i32,
  other: v128,
  scalarA: f32,
  scalarB: f32,
): v128 {
  if (code == 1) return f32x4.add(value, other);
  if (code == 2) return f32x4.sub(value, other);
  if (code == 3) return f32x4.mul(value, other);
  if (code == 4) return f32x4.div(value, other);
  if (code == 5) return f32x4.min(value, other);
  if (code == 6) return f32x4.max(value, other);
  if (code == 7) return f32x4.add(value, f32x4.splat(scalarA));
  if (code == 8) return f32x4.mul(value, f32x4.splat(scalarA));
  if (code == 9) return f32x4.div(value, f32x4.splat(scalarA));
  if (code == 10) return f32x4.neg(value);
  if (code == 11) return f32x4.abs(value);
  if (code == 12) return f32x4.sqrt(value);
  if (code == 13) return f32x4.floor(value);
  if (code == 14) return f32x4.ceil(value);
  if (code == 15) {
    return f32x4.min(
      f32x4.max(value, f32x4.splat(scalarA)),
      f32x4.splat(scalarB),
    );
  }
  return value;
}

function applyFusedScalarOp(
  value: f32,
  code: i32,
  other: f32,
  scalarA: f32,
  scalarB: f32,
): f32 {
  if (code == 1) return value + other;
  if (code == 2) return value - other;
  if (code == 3) return value * other;
  if (code == 4) return value / other;
  if (code == 5) return Mathf.min(value, other);
  if (code == 6) return Mathf.max(value, other);
  if (code == 7) return value + scalarA;
  if (code == 8) return value * scalarA;
  if (code == 9) return value / scalarA;
  if (code == 10) return -value;
  if (code == 11) return Mathf.abs(value);
  if (code == 12) return Mathf.sqrt(value);
  if (code == 13) return Mathf.floor(value);
  if (code == 14) return Mathf.ceil(value);
  if (code == 15) return Mathf.min(Mathf.max(value, scalarA), scalarB);
  return value;
}

export function fusedElementwise(
  input: usize,
  out: usize,
  rows: i32,
  cols: i32,
  opcodes: usize,
  scalarA: usize,
  scalarB: usize,
  operandPtrs: usize,
  operandModes: usize,
  opCount: i32,
): void {
  let colLimit = simdLimit(cols);

  for (let r = 0; r < rows; r++) {
    let rowBase = r * cols;
    let c = 0;

    for (; c < colLimit; c += 4) {
      let offset = rowBase + c;
      let value = v128.load(input + f32Offset(offset));

      for (let op = 0; op < opCount; op++) {
        let code = readI32(opcodes, op);
        let other = f32x4.splat(0.0);
        if (code <= 6) {
          let ptr = <usize> readI32(operandPtrs, op);
          let mode = readI32(operandModes, op);
          other = fusedOtherVector(ptr, mode, r, c, cols, offset);
        }
        value = applyFusedVectorOp(
          value,
          code,
          other,
          readF32(scalarA, op),
          readF32(scalarB, op),
        );
      }

      v128.store(out + f32Offset(offset), value);
    }

    for (; c < cols; c++) {
      let offset = rowBase + c;
      let value = readF32(input, offset);

      for (let op = 0; op < opCount; op++) {
        let code = readI32(opcodes, op);
        let other: f32 = 0.0;
        if (code <= 6) {
          let ptr = <usize> readI32(operandPtrs, op);
          let mode = readI32(operandModes, op);
          other = fusedOtherScalar(ptr, mode, r, c, cols, offset);
        }
        value = applyFusedScalarOp(
          value,
          code,
          other,
          readF32(scalarA, op),
          readF32(scalarB, op),
        );
      }

      writeF32(out, offset, value);
    }
  }
}

export function transpose(
  input: usize,
  out: usize,
  rows: i32,
  cols: i32,
): void {
  let block = 16;
  for (let rb = 0; rb < rows; rb += block) {
    let rEnd = rb + block < rows ? rb + block : rows;
    for (let cb = 0; cb < cols; cb += block) {
      let cEnd = cb + block < cols ? cb + block : cols;
      for (let r = rb; r < rEnd; r++) {
        let rowBase = r * cols;
        for (let c = cb; c < cEnd; c++) {
          writeF32(out, c * rows + r, readF32(input, rowBase + c));
        }
      }
    }
  }
}

export function diagonal(input: usize, out: usize, rows: i32, cols: i32): void {
  let length = rows < cols ? rows : cols;
  for (let i = 0; i < length; i++) {
    writeF32(out, i, readF32(input, i * cols + i));
  }
}

export function diagonalMatrix(input: usize, out: usize, size: i32): void {
  fill(out, size * size, 0.0);
  for (let i = 0; i < size; i++) {
    writeF32(out, i * size + i, readF32(input, i));
  }
}

export function diagonalProduct(input: usize, size: i32): f64 {
  let result: f64 = 1.0;
  for (let i = 0; i < size; i++) {
    result *= <f64> readF32(input, i * size + i);
  }
  return result;
}

export function invertDiagonal(input: usize, out: usize, size: i32): i32 {
  fill(out, size * size, 0.0);
  for (let i = 0; i < size; i++) {
    let index = i * size + i;
    let value = readF32(input, index);
    if (Math.abs(<f64> value) <= EPSILON) return 0;
    writeF32(out, index, 1.0 / value);
  }
  return 1;
}

export function solveDiagonal(
  diagonalMatrix: usize,
  b: usize,
  out: usize,
  size: i32,
  rhsCols: i32,
): i32 {
  for (let r = 0; r < size; r++) {
    let diagonalValue = readF32(diagonalMatrix, r * size + r);
    if (Math.abs(<f64> diagonalValue) <= EPSILON) return 0;

    let inverseDiagonal = f32x4.splat(1.0 / diagonalValue);
    let rowBase = r * rhsCols;
    let c = 0;
    let limit = simdLimit(rhsCols);

    for (; c < limit; c += 4) {
      let offset = f32Offset(rowBase + c);
      v128.store(
        out + offset,
        f32x4.mul(v128.load(b + offset), inverseDiagonal),
      );
    }
    for (; c < rhsCols; c++) {
      let index = rowBase + c;
      writeF32(out, index, readF32(b, index) / diagonalValue);
    }
  }

  return 1;
}

export function scaleRowsByVector(
  vector: usize,
  input: usize,
  out: usize,
  rows: i32,
  cols: i32,
): void {
  for (let r = 0; r < rows; r++) {
    let scalar = f32x4.splat(readF32(vector, r));
    let rowBase = r * cols;
    let c = 0;
    let limit = simdLimit(cols);

    for (; c < limit; c += 4) {
      let offset = f32Offset(rowBase + c);
      v128.store(out + offset, f32x4.mul(v128.load(input + offset), scalar));
    }
    for (; c < cols; c++) {
      let index = rowBase + c;
      writeF32(
        out,
        index,
        readF32(input, index) * f32x4.extract_lane(scalar, 0),
      );
    }
  }
}

export function scaleColsByVector(
  input: usize,
  vector: usize,
  out: usize,
  rows: i32,
  cols: i32,
): void {
  for (let r = 0; r < rows; r++) {
    let rowBase = r * cols;
    for (let c = 0; c < cols; c++) {
      writeF32(
        out,
        rowBase + c,
        readF32(input, rowBase + c) * readF32(vector, c),
      );
    }
  }
}

export function dot(a: usize, b: usize, length: i32): f32 {
  return dotSimd(a, b, length);
}

export function matmul(
  a: usize,
  b: usize,
  out: usize,
  rowsA: i32,
  colsA: i32,
  colsB: i32,
): void {
  matmulF32(a, b, out, rowsA, colsA, colsB);
}

export function packForMatmul(
  input: usize,
  out: usize,
  rows: i32,
  cols: i32,
): void {
  for (let c = 0; c < cols; c++) {
    let outBase = c * rows;
    for (let r = 0; r < rows; r++) {
      writeF32(out, outBase + r, readF32(input, r * cols + c));
    }
  }
}

export function matmulPackedB(
  a: usize,
  packedB: usize,
  out: usize,
  rowsA: i32,
  colsA: i32,
  colsB: i32,
): void {
  for (let r = 0; r < rowsA; r++) {
    let aRow = a + f32Offset(r * colsA);
    let outBase = r * colsB;
    for (let c = 0; c < colsB; c++) {
      writeF32(
        out,
        outBase + c,
        dotSimd(aRow, packedB + f32Offset(c * colsA), colsA),
      );
    }
  }
}

export function matmulTN(
  a: usize,
  b: usize,
  out: usize,
  rowsA: i32,
  colsA: i32,
  colsB: i32,
): void {
  for (let r = 0; r < colsA; r++) {
    let outBase = r * colsB;
    for (let c = 0; c < colsB; c++) {
      let total: f32 = 0.0;
      for (let k = 0; k < rowsA; k++) {
        total += readF32(a, k * colsA + r) * readF32(b, k * colsB + c);
      }
      writeF32(out, outBase + c, total);
    }
  }
}

export function matmulNT(
  a: usize,
  b: usize,
  out: usize,
  rowsA: i32,
  colsA: i32,
  rowsB: i32,
): void {
  for (let r = 0; r < rowsA; r++) {
    let outBase = r * rowsB;
    let aRow = a + f32Offset(r * colsA);
    for (let c = 0; c < rowsB; c++) {
      writeF32(
        out,
        outBase + c,
        dotSimd(aRow, b + f32Offset(c * colsA), colsA),
      );
    }
  }
}

export function matmulTT(
  a: usize,
  b: usize,
  out: usize,
  rowsA: i32,
  colsA: i32,
  rowsB: i32,
): void {
  for (let r = 0; r < colsA; r++) {
    let outBase = r * rowsB;
    for (let c = 0; c < rowsB; c++) {
      let total: f32 = 0.0;
      for (let k = 0; k < rowsA; k++) {
        total += readF32(a, k * colsA + r) * readF32(b, c * rowsA + k);
      }
      writeF32(out, outBase + c, total);
    }
  }
}

export function gramTN(a: usize, out: usize, rows: i32, cols: i32): void {
  for (let r = 0; r < cols; r++) {
    for (let c = r; c < cols; c++) {
      let total: f32 = 0.0;
      for (let k = 0; k < rows; k++) {
        total += readF32(a, k * cols + r) * readF32(a, k * cols + c);
      }
      writeF32(out, r * cols + c, total);
      if (c != r) writeF32(out, c * cols + r, total);
    }
  }
}

export function gramNT(a: usize, out: usize, rows: i32, cols: i32): void {
  for (let r = 0; r < rows; r++) {
    for (let c = r; c < rows; c++) {
      let total = dotSimd(
        a + f32Offset(r * cols),
        a + f32Offset(c * cols),
        cols,
      );
      writeF32(out, r * rows + c, total);
      if (c != r) writeF32(out, c * rows + r, total);
    }
  }
}

export function traceMatmul(a: usize, b: usize, rowsA: i32, colsA: i32): f64 {
  let total: f64 = 0.0;
  for (let r = 0; r < rowsA; r++) {
    for (let c = 0; c < colsA; c++) {
      total += <f64> readF32(a, r * colsA + c) *
        <f64> readF32(b, c * rowsA + r);
    }
  }
  return total;
}

export function matvec(
  a: usize,
  vector: usize,
  out: usize,
  rows: i32,
  cols: i32,
): void {
  for (let r = 0; r < rows; r++) {
    writeF32(out, r, dotSimd(a + f32Offset(r * cols), vector, cols));
  }
}

export function outer(
  a: usize,
  b: usize,
  out: usize,
  rows: i32,
  cols: i32,
): void {
  let limit = simdLimit(cols);
  for (let r = 0; r < rows; r++) {
    let scalarValue = readF32(a, r);
    let scalar = f32x4.splat(scalarValue);
    let outBase = r * cols;
    let c = 0;

    for (; c < limit; c += 4) {
      let offset = f32Offset(c);
      v128.store(
        out + f32Offset(outBase + c),
        f32x4.mul(scalar, v128.load(b + offset)),
      );
    }
    for (; c < cols; c++) {
      writeF32(out, outBase + c, scalarValue * readF32(b, c));
    }
  }
}

export function sum(input: usize, length: i32): f64 {
  let acc0 = f32x4.splat(0.0);
  let acc1 = f32x4.splat(0.0);
  let acc2 = f32x4.splat(0.0);
  let acc3 = f32x4.splat(0.0);
  let i = 0;
  let unrolledLimit = length & -16;

  for (; i < unrolledLimit; i += 16) {
    let offset = f32Offset(i);
    acc0 = f32x4.add(acc0, v128.load(input + offset));
    acc1 = f32x4.add(acc1, v128.load(input + offset + 16));
    acc2 = f32x4.add(acc2, v128.load(input + offset + 32));
    acc3 = f32x4.add(acc3, v128.load(input + offset + 48));
  }

  let acc = f32x4.add(f32x4.add(acc0, acc1), f32x4.add(acc2, acc3));
  let limit = simdLimit(length);
  for (; i < limit; i += 4) {
    acc = f32x4.add(acc, v128.load(input + f32Offset(i)));
  }

  let result: f64 = <f64> horizontalSum4(acc);
  for (; i < length; i++) {
    result += <f64> readF32(input, i);
  }
  return result;
}

export function minValue(input: usize, length: i32): f32 {
  if (length <= 0) return f32.NaN;

  let i = 0;
  let limit = simdLimit(length);
  let value: f32;

  if (limit > 0) {
    let vector = v128.load(input);
    i = 4;
    for (; i < limit; i += 4) {
      vector = f32x4.min(vector, v128.load(input + f32Offset(i)));
    }
    value = Mathf.min(
      Mathf.min(f32x4.extract_lane(vector, 0), f32x4.extract_lane(vector, 1)),
      Mathf.min(f32x4.extract_lane(vector, 2), f32x4.extract_lane(vector, 3)),
    );
  } else {
    value = readF32(input, 0);
    i = 1;
  }

  for (; i < length; i++) {
    value = Mathf.min(value, readF32(input, i));
  }
  return value;
}

export function maxValue(input: usize, length: i32): f32 {
  if (length <= 0) return f32.NaN;

  let i = 0;
  let limit = simdLimit(length);
  let value: f32;

  if (limit > 0) {
    let vector = v128.load(input);
    i = 4;
    for (; i < limit; i += 4) {
      vector = f32x4.max(vector, v128.load(input + f32Offset(i)));
    }
    value = Mathf.max(
      Mathf.max(f32x4.extract_lane(vector, 0), f32x4.extract_lane(vector, 1)),
      Mathf.max(f32x4.extract_lane(vector, 2), f32x4.extract_lane(vector, 3)),
    );
  } else {
    value = readF32(input, 0);
    i = 1;
  }

  for (; i < length; i++) {
    value = Mathf.max(value, readF32(input, i));
  }
  return value;
}

export function trace(input: usize, rows: i32, cols: i32): f64 {
  let length = rows < cols ? rows : cols;
  let result: f64 = 0.0;
  for (let i = 0; i < length; i++) {
    result += <f64> readF32(input, i * cols + i);
  }
  return result;
}

export function frobeniusNorm(input: usize, length: i32): f64 {
  let total: f64 = 0.0;
  for (let i = 0; i < length; i++) {
    let value = <f64> readF32(input, i);
    total += value * value;
  }
  return Math.sqrt(total);
}

export function determinant(input: usize, size: i32): f64 {
  if (size == 0) return 1.0;

  let length = size * size;
  let work = heap.alloc(<usize> length << 3);
  let result = determinantWithWork(input, size, work);
  heap.free(work);
  return result;
}

export function determinantWithWork(input: usize, size: i32, work: usize): f64 {
  if (size == 0) return 1.0;

  let length = size * size;
  copyF32ToF64(input, work, length);

  let sign: f64 = 1.0;
  let result: f64 = 1.0;

  for (let k = 0; k < size; k++) {
    let pivot = k;
    let maxAbs = Math.abs(readF64(work, k * size + k));

    for (let r = k + 1; r < size; r++) {
      let value = Math.abs(readF64(work, r * size + k));
      if (value > maxAbs) {
        maxAbs = value;
        pivot = r;
      }
    }

    if (maxAbs <= EPSILON) {
      return 0.0;
    }

    if (pivot != k) {
      swapRowRangeF64(work, k * size, pivot * size, k, size);
      sign = -sign;
    }

    let pivotValue = readF64(work, k * size + k);
    result *= pivotValue;

    for (let r = k + 1; r < size; r++) {
      let factor = readF64(work, r * size + k) / pivotValue;
      writeF64(work, r * size + k, 0.0);
      subtractScaledRowF64(work, r * size, k * size, k + 1, size, factor);
    }
  }

  return result * sign;
}

export function luFactor(
  input: usize,
  size: i32,
  lu: usize,
  pivots: usize,
): i32 {
  if (size == 0) return 1;

  let length = size * size;
  copyF32ToF64(input, lu, length);

  let sign = 1;
  for (let k = 0; k < size; k++) {
    let pivot = k;
    let maxAbs = Math.abs(readF64(lu, k * size + k));

    for (let r = k + 1; r < size; r++) {
      let value = Math.abs(readF64(lu, r * size + k));
      if (value > maxAbs) {
        maxAbs = value;
        pivot = r;
      }
    }

    writeI32(pivots, k, pivot);
    if (maxAbs <= EPSILON) {
      return 0;
    }

    if (pivot != k) {
      swapRowRangeF64(lu, k * size, pivot * size, 0, size);
      sign = -sign;
    }

    let pivotValue = readF64(lu, k * size + k);
    for (let r = k + 1; r < size; r++) {
      let factor = readF64(lu, r * size + k) / pivotValue;
      writeF64(lu, r * size + k, factor);
      subtractScaledRowF64(lu, r * size, k * size, k + 1, size, factor);
    }
  }

  return sign;
}

export function luDeterminant(lu: usize, size: i32, sign: i32): f64 {
  if (sign == 0) return 0.0;

  let result = <f64> sign;
  for (let i = 0; i < size; i++) {
    result *= readF64(lu, i * size + i);
  }
  return result;
}

function solveLuInPlace(
  lu: usize,
  pivots: usize,
  rhsWork: usize,
  size: i32,
  rhsCols: i32,
): i32 {
  for (let k = 0; k < size; k++) {
    let pivot = readI32(pivots, k);
    if (pivot != k) {
      swapRowRangeF64(rhsWork, k * rhsCols, pivot * rhsCols, 0, rhsCols);
    }
  }

  for (let i = 0; i < size; i++) {
    let targetBase = i * rhsCols;
    for (let j = 0; j < i; j++) {
      let factor = readF64(lu, i * size + j);
      if (Math.abs(factor) <= EPSILON) continue;
      subtractScaledRowF64(
        rhsWork,
        targetBase,
        j * rhsCols,
        0,
        rhsCols,
        factor,
      );
    }
  }

  let row = size;
  while (row > 0) {
    row--;
    let targetBase = row * rhsCols;
    for (let j = row + 1; j < size; j++) {
      let factor = readF64(lu, row * size + j);
      if (Math.abs(factor) <= EPSILON) continue;
      subtractScaledRowF64(
        rhsWork,
        targetBase,
        j * rhsCols,
        0,
        rhsCols,
        factor,
      );
    }

    let diagonal = readF64(lu, row * size + row);
    if (Math.abs(diagonal) <= EPSILON) {
      return 0;
    }
    divideRowF64(rhsWork, targetBase, 0, rhsCols, diagonal);
  }

  return 1;
}

function writeF64BlockToF32(src: usize, dst: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    writeF32(dst, i, <f32> readF64(src, i));
  }
}

export function luSolve(
  lu: usize,
  pivots: usize,
  b: usize,
  out: usize,
  size: i32,
  rhsCols: i32,
  rhsWork: usize,
): i32 {
  let length = size * rhsCols;
  copyF32ToF64(b, rhsWork, length);

  let ok = solveLuInPlace(lu, pivots, rhsWork, size, rhsCols);
  if (ok != 1) return 0;

  writeF64BlockToF32(rhsWork, out, length);
  return 1;
}

export function luInvert(
  lu: usize,
  pivots: usize,
  out: usize,
  size: i32,
  rhsWork: usize,
): i32 {
  let length = size * size;
  for (let i = 0; i < length; i++) {
    writeF64(rhsWork, i, 0.0);
  }
  for (let i = 0; i < size; i++) {
    writeF64(rhsWork, i * size + i, 1.0);
  }

  let ok = solveLuInPlace(lu, pivots, rhsWork, size, size);
  if (ok != 1) return 0;

  writeF64BlockToF32(rhsWork, out, length);
  return 1;
}

export function choleskyFactor(input: usize, size: i32, lower: usize): i32 {
  for (let i = 0; i < size * size; i++) {
    writeF64(lower, i, 0.0);
  }

  for (let i = 0; i < size; i++) {
    for (let j = 0; j <= i; j++) {
      let value = <f64> readF32(input, i * size + j);

      for (let k = 0; k < j; k++) {
        value -= readF64(lower, i * size + k) * readF64(lower, j * size + k);
      }

      if (i == j) {
        if (value <= EPSILON) return 0;
        writeF64(lower, i * size + j, Math.sqrt(value));
      } else {
        let diagonal = readF64(lower, j * size + j);
        if (Math.abs(diagonal) <= EPSILON) return 0;
        writeF64(lower, i * size + j, value / diagonal);
      }
    }
  }

  return 1;
}

export function choleskyDeterminant(lower: usize, size: i32): f64 {
  let result: f64 = 1.0;
  for (let i = 0; i < size; i++) {
    let diagonal = readF64(lower, i * size + i);
    result *= diagonal * diagonal;
  }
  return result;
}

export function choleskyLogDet(lower: usize, size: i32): f64 {
  let result: f64 = 0.0;
  for (let i = 0; i < size; i++) {
    result += Math.log(readF64(lower, i * size + i));
  }
  return result * 2.0;
}

function solveCholeskyInPlace(
  lower: usize,
  rhsWork: usize,
  size: i32,
  rhsCols: i32,
): i32 {
  for (let i = 0; i < size; i++) {
    let targetBase = i * rhsCols;

    for (let j = 0; j < i; j++) {
      let factor = readF64(lower, i * size + j);
      if (Math.abs(factor) <= EPSILON) continue;
      subtractScaledRowF64(
        rhsWork,
        targetBase,
        j * rhsCols,
        0,
        rhsCols,
        factor,
      );
    }

    let diagonal = readF64(lower, i * size + i);
    if (Math.abs(diagonal) <= EPSILON) return 0;
    divideRowF64(rhsWork, targetBase, 0, rhsCols, diagonal);
  }

  let row = size;
  while (row > 0) {
    row--;
    let targetBase = row * rhsCols;

    for (let j = row + 1; j < size; j++) {
      let factor = readF64(lower, j * size + row);
      if (Math.abs(factor) <= EPSILON) continue;
      subtractScaledRowF64(
        rhsWork,
        targetBase,
        j * rhsCols,
        0,
        rhsCols,
        factor,
      );
    }

    let diagonal = readF64(lower, row * size + row);
    if (Math.abs(diagonal) <= EPSILON) return 0;
    divideRowF64(rhsWork, targetBase, 0, rhsCols, diagonal);
  }

  return 1;
}

export function choleskySolve(
  lower: usize,
  b: usize,
  out: usize,
  size: i32,
  rhsCols: i32,
  rhsWork: usize,
): i32 {
  let length = size * rhsCols;
  copyF32ToF64(b, rhsWork, length);

  let ok = solveCholeskyInPlace(lower, rhsWork, size, rhsCols);
  if (ok != 1) return 0;

  writeF64BlockToF32(rhsWork, out, length);
  return 1;
}

export function choleskyInvert(
  lower: usize,
  out: usize,
  size: i32,
  rhsWork: usize,
): i32 {
  let length = size * size;
  for (let i = 0; i < length; i++) {
    writeF64(rhsWork, i, 0.0);
  }
  for (let i = 0; i < size; i++) {
    writeF64(rhsWork, i * size + i, 1.0);
  }

  let ok = solveCholeskyInPlace(lower, rhsWork, size, size);
  if (ok != 1) return 0;

  writeF64BlockToF32(rhsWork, out, length);
  return 1;
}

export function solve(
  a: usize,
  b: usize,
  out: usize,
  size: i32,
  rhsCols: i32,
): i32 {
  let lu = heap.alloc(<usize> (size * size) << 3);
  let pivots = heap.alloc(<usize> size << 2);
  let work = heap.alloc(<usize> (size * rhsCols) << 3);
  let sign = luFactor(a, size, lu, pivots);
  let result = sign == 0 ? 0 : luSolve(lu, pivots, b, out, size, rhsCols, work);
  heap.free(lu);
  heap.free(pivots);
  heap.free(work);
  return result;
}

export function qrFactor(
  input: usize,
  rows: i32,
  cols: i32,
  q: usize,
  r: usize,
): i32 {
  let qLength = rows * cols;
  let rLength = cols * cols;
  for (let i = 0; i < qLength; i++) {
    writeF64(q, i, 0.0);
  }
  for (let i = 0; i < rLength; i++) {
    writeF64(r, i, 0.0);
  }

  let rank = 0;
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      writeF64(q, row * cols + col, <f64> readF32(input, row * cols + col));
    }

    for (let prev = 0; prev < col; prev++) {
      let projection: f64 = 0.0;
      for (let row = 0; row < rows; row++) {
        projection += readF64(q, row * cols + prev) *
          readF64(q, row * cols + col);
      }
      writeF64(r, prev * cols + col, projection);
      for (let row = 0; row < rows; row++) {
        let index = row * cols + col;
        writeF64(
          q,
          index,
          readF64(q, index) - projection * readF64(q, row * cols + prev),
        );
      }
    }

    let normSquared: f64 = 0.0;
    for (let row = 0; row < rows; row++) {
      let value = readF64(q, row * cols + col);
      normSquared += value * value;
    }

    let norm = Math.sqrt(normSquared);
    writeF64(r, col * cols + col, norm);

    if (norm > EPSILON) {
      rank++;
      for (let row = 0; row < rows; row++) {
        let index = row * cols + col;
        writeF64(q, index, readF64(q, index) / norm);
      }
    } else {
      for (let row = 0; row < rows; row++) {
        writeF64(q, row * cols + col, 0.0);
      }
    }
  }

  return rank;
}

export function qrRank(r: usize, rows: i32, cols: i32, epsilon: f64): i32 {
  let diagonal = rows < cols ? rows : cols;
  let rank = 0;
  for (let i = 0; i < diagonal; i++) {
    if (Math.abs(readF64(r, i * cols + i)) > epsilon) rank++;
  }
  return rank;
}

export function qrSolve(
  q: usize,
  r: usize,
  b: usize,
  out: usize,
  rows: i32,
  cols: i32,
  rhsCols: i32,
  work: usize,
): i32 {
  for (let i = 0; i < cols * rhsCols; i++) {
    writeF64(work, i, 0.0);
  }

  for (let col = 0; col < cols; col++) {
    for (let rhs = 0; rhs < rhsCols; rhs++) {
      let total: f64 = 0.0;
      for (let row = 0; row < rows; row++) {
        total += readF64(q, row * cols + col) *
          <f64> readF32(b, row * rhsCols + rhs);
      }
      writeF64(work, col * rhsCols + rhs, total);
    }
  }

  let row = cols;
  while (row > 0) {
    row--;
    let targetBase = row * rhsCols;

    for (let j = row + 1; j < cols; j++) {
      let factor = readF64(r, row * cols + j);
      if (Math.abs(factor) <= EPSILON) continue;
      subtractScaledRowF64(work, targetBase, j * rhsCols, 0, rhsCols, factor);
    }

    let diagonal = readF64(r, row * cols + row);
    if (Math.abs(diagonal) <= EPSILON) return 0;
    divideRowF64(work, targetBase, 0, rhsCols, diagonal);
  }

  writeF64BlockToF32(work, out, cols * rhsCols);
  return 1;
}

export function equalsApprox(
  a: usize,
  b: usize,
  length: i32,
  epsilon: f64,
): i32 {
  let eps = f32x4.splat(<f32> epsilon);
  let i = 0;
  let limit = simdLimit(length);

  for (; i < limit; i += 4) {
    let offset = f32Offset(i);
    let delta = f32x4.abs(
      f32x4.sub(v128.load(a + offset), v128.load(b + offset)),
    );
    if (v128.any_true(f32x4.gt(delta, eps))) return 0;
  }

  for (; i < length; i++) {
    let delta = Math.abs(<f64> readF32(a, i) - <f64> readF32(b, i));
    if (delta > epsilon) return 0;
  }
  return 1;
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
    } else if (opcode == BATCH_OP_SOLVE) {
      let ok = solve(
        <usize> readBatchI32(instructions, instruction, 1),
        <usize> readBatchI32(instructions, instruction, 2),
        <usize> readBatchI32(instructions, instruction, 3),
        readBatchI32(instructions, instruction, 4),
        readBatchI32(instructions, instruction, 5),
      );
      if (ok != 1) return 0;
    } else if (opcode == BATCH_OP_TRANSPOSE) {
      transpose(
        <usize> readBatchI32(instructions, instruction, 1),
        <usize> readBatchI32(instructions, instruction, 2),
        readBatchI32(instructions, instruction, 3),
        readBatchI32(instructions, instruction, 4),
      );
    } else if (opcode == BATCH_OP_MATMUL_TN) {
      matmulTN(
        <usize> readBatchI32(instructions, instruction, 1),
        <usize> readBatchI32(instructions, instruction, 2),
        <usize> readBatchI32(instructions, instruction, 3),
        readBatchI32(instructions, instruction, 4),
        readBatchI32(instructions, instruction, 5),
        readBatchI32(instructions, instruction, 6),
      );
    } else if (opcode == BATCH_OP_MATMUL_NT) {
      matmulNT(
        <usize> readBatchI32(instructions, instruction, 1),
        <usize> readBatchI32(instructions, instruction, 2),
        <usize> readBatchI32(instructions, instruction, 3),
        readBatchI32(instructions, instruction, 4),
        readBatchI32(instructions, instruction, 5),
        readBatchI32(instructions, instruction, 6),
      );
    } else if (opcode == BATCH_OP_MATMUL_TT) {
      matmulTT(
        <usize> readBatchI32(instructions, instruction, 1),
        <usize> readBatchI32(instructions, instruction, 2),
        <usize> readBatchI32(instructions, instruction, 3),
        readBatchI32(instructions, instruction, 4),
        readBatchI32(instructions, instruction, 5),
        readBatchI32(instructions, instruction, 6),
      );
    } else if (opcode == BATCH_OP_OUTER) {
      outer(
        <usize> readBatchI32(instructions, instruction, 1),
        <usize> readBatchI32(instructions, instruction, 2),
        <usize> readBatchI32(instructions, instruction, 3),
        readBatchI32(instructions, instruction, 4),
        readBatchI32(instructions, instruction, 5),
      );
    } else if (opcode == BATCH_OP_DIAGONAL_MATRIX) {
      diagonalMatrix(
        <usize> readBatchI32(instructions, instruction, 1),
        <usize> readBatchI32(instructions, instruction, 2),
        readBatchI32(instructions, instruction, 3),
      );
    } else if (opcode == BATCH_OP_INVERT_DIAGONAL) {
      let ok = invertDiagonal(
        <usize> readBatchI32(instructions, instruction, 1),
        <usize> readBatchI32(instructions, instruction, 2),
        readBatchI32(instructions, instruction, 3),
      );
      if (ok != 1) return 0;
    } else if (opcode == BATCH_OP_AFFINE) {
      affine(
        <usize> readBatchI32(instructions, instruction, 1),
        <usize> readBatchI32(instructions, instruction, 2),
        readBatchI32(instructions, instruction, 3),
        f32FromBits(readBatchI32(instructions, instruction, 4)),
        f32FromBits(readBatchI32(instructions, instruction, 5)),
      );
    } else if (opcode == BATCH_OP_SCALE_ROWS_BY_VECTOR) {
      scaleRowsByVector(
        <usize> readBatchI32(instructions, instruction, 1),
        <usize> readBatchI32(instructions, instruction, 2),
        <usize> readBatchI32(instructions, instruction, 3),
        readBatchI32(instructions, instruction, 4),
        readBatchI32(instructions, instruction, 5),
      );
    } else if (opcode == BATCH_OP_SCALE_COLS_BY_VECTOR) {
      scaleColsByVector(
        <usize> readBatchI32(instructions, instruction, 1),
        <usize> readBatchI32(instructions, instruction, 2),
        <usize> readBatchI32(instructions, instruction, 3),
        readBatchI32(instructions, instruction, 4),
        readBatchI32(instructions, instruction, 5),
      );
    } else {
      return -1;
    }
  }
  return 1;
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
