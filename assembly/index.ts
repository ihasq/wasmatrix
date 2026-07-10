const EPSILON: f64 = 1.0e-12;

@inline
function f32Offset(index: i32): usize {
  return <usize>index << 2;
}

@inline
function f64Offset(index: i32): usize {
  return <usize>index << 3;
}

@inline
function readF32(ptr: usize, index: i32): f32 {
  return load<f32>(ptr + f32Offset(index));
}

@inline
function writeF32(ptr: usize, index: i32, value: f32): void {
  store<f32>(ptr + f32Offset(index), value);
}

@inline
function readF64(ptr: usize, index: i32): f64 {
  return load<f64>(ptr + f64Offset(index));
}

@inline
function writeF64(ptr: usize, index: i32, value: f64): void {
  store<f64>(ptr + f64Offset(index), value);
}

@inline
function readI32(ptr: usize, index: i32): i32 {
  return load<i32>(ptr + f32Offset(index));
}

@inline
function writeI32(ptr: usize, index: i32, value: i32): void {
  store<i32>(ptr + f32Offset(index), value);
}

@inline
function simdLimit(length: i32): i32 {
  return length & -4;
}

@inline
function horizontalSum4(value: v128): f32 {
  let pairSum = f32x4.add(value, f32x4.shuffle(value, value, 2, 3, 0, 1));
  let total = f32x4.add(pairSum, f32x4.shuffle(pairSum, pairSum, 1, 0, 3, 2));
  return f32x4.extract_lane(total, 0);
}

function copyF32ToF64(src: usize, dst: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    writeF64(dst, i, <f64>readF32(src, i));
  }
}

@inline
function f64PairLimit(start: i32, end: i32): i32 {
  return start + ((end - start) & -2);
}

function swapRowRangeF64(work: usize, rowA: i32, rowB: i32, start: i32, end: i32): void {
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

function divideRowF64(work: usize, rowBase: i32, start: i32, end: i32, divisor: f64): void {
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

function subtractScaledRowF64(work: usize, targetBase: i32, sourceBase: i32, start: i32, end: i32, factor: f64): void {
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
    writeF64(work, index, readF64(work, index) - factor * readF64(work, sourceBase + c));
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
    acc0 = f32x4.add(acc0, f32x4.mul(v128.load(a + offset), v128.load(b + offset)));
    acc1 = f32x4.add(acc1, f32x4.mul(v128.load(a + offset + 16), v128.load(b + offset + 16)));
    acc2 = f32x4.add(acc2, f32x4.mul(v128.load(a + offset + 32), v128.load(b + offset + 32)));
    acc3 = f32x4.add(acc3, f32x4.mul(v128.load(a + offset + 48), v128.load(b + offset + 48)));
  }

  let acc = f32x4.add(f32x4.add(acc0, acc1), f32x4.add(acc2, acc3));
  let limit = simdLimit(length);
  for (; i < limit; i += 4) {
    let offset = f32Offset(i);
    acc = f32x4.add(acc, f32x4.mul(v128.load(a + offset), v128.load(b + offset)));
  }

  let result = horizontalSum4(acc);
  for (; i < length; i++) {
    result += readF32(a, i) * readF32(b, i);
  }
  return result;
}

export function abiVersion(): i32 {
  return 6;
}

export function simdProbe(): i32 {
  let value = f32x4.add(f32x4.splat(1.0), f32x4.splat(2.0));
  return f32x4.extract_lane(value, 0) == 3.0 ? 1 : 0;
}

export function allocF32(length: i32): usize {
  assert(length >= 0);
  return heap.alloc(<usize>length << 2);
}

export function allocF64(length: i32): usize {
  assert(length >= 0);
  return heap.alloc(<usize>length << 3);
}

export function allocI32(length: i32): usize {
  assert(length >= 0);
  return heap.alloc(<usize>length << 2);
}

export function free(ptr: usize): void {
  heap.free(ptr);
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
  let i = 0;
  let limit = simdLimit(length);

  for (; i < limit; i += 4) {
    let offset = f32Offset(i);
    v128.store(out + offset, v128.load(input + offset));
  }
  for (; i < length; i++) {
    writeF32(out, i, readF32(input, i));
  }
}

export function add(a: usize, b: usize, out: usize, length: i32): void {
  let i = 0;
  let limit = simdLimit(length);

  for (; i < limit; i += 4) {
    let offset = f32Offset(i);
    v128.store(out + offset, f32x4.add(v128.load(a + offset), v128.load(b + offset)));
  }
  for (; i < length; i++) {
    writeF32(out, i, readF32(a, i) + readF32(b, i));
  }
}

export function subtract(a: usize, b: usize, out: usize, length: i32): void {
  let i = 0;
  let limit = simdLimit(length);

  for (; i < limit; i += 4) {
    let offset = f32Offset(i);
    v128.store(out + offset, f32x4.sub(v128.load(a + offset), v128.load(b + offset)));
  }
  for (; i < length; i++) {
    writeF32(out, i, readF32(a, i) - readF32(b, i));
  }
}

export function hadamard(a: usize, b: usize, out: usize, length: i32): void {
  let i = 0;
  let limit = simdLimit(length);

  for (; i < limit; i += 4) {
    let offset = f32Offset(i);
    v128.store(out + offset, f32x4.mul(v128.load(a + offset), v128.load(b + offset)));
  }
  for (; i < length; i++) {
    writeF32(out, i, readF32(a, i) * readF32(b, i));
  }
}

export function divideElements(a: usize, b: usize, out: usize, length: i32): void {
  let i = 0;
  let limit = simdLimit(length);

  for (; i < limit; i += 4) {
    let offset = f32Offset(i);
    v128.store(out + offset, f32x4.div(v128.load(a + offset), v128.load(b + offset)));
  }
  for (; i < length; i++) {
    writeF32(out, i, readF32(a, i) / readF32(b, i));
  }
}

export function minElements(a: usize, b: usize, out: usize, length: i32): void {
  let i = 0;
  let limit = simdLimit(length);

  for (; i < limit; i += 4) {
    let offset = f32Offset(i);
    v128.store(out + offset, f32x4.min(v128.load(a + offset), v128.load(b + offset)));
  }
  for (; i < length; i++) {
    writeF32(out, i, Mathf.min(readF32(a, i), readF32(b, i)));
  }
}

export function maxElements(a: usize, b: usize, out: usize, length: i32): void {
  let i = 0;
  let limit = simdLimit(length);

  for (; i < limit; i += 4) {
    let offset = f32Offset(i);
    v128.store(out + offset, f32x4.max(v128.load(a + offset), v128.load(b + offset)));
  }
  for (; i < length; i++) {
    writeF32(out, i, Mathf.max(readF32(a, i), readF32(b, i)));
  }
}

export function addScalar(input: usize, out: usize, length: i32, value: f32): void {
  let scalar = f32x4.splat(value);
  let i = 0;
  let limit = simdLimit(length);

  for (; i < limit; i += 4) {
    let offset = f32Offset(i);
    v128.store(out + offset, f32x4.add(v128.load(input + offset), scalar));
  }
  for (; i < length; i++) {
    writeF32(out, i, readF32(input, i) + value);
  }
}

export function scale(input: usize, out: usize, length: i32, value: f32): void {
  let scalar = f32x4.splat(value);
  let i = 0;
  let limit = simdLimit(length);

  for (; i < limit; i += 4) {
    let offset = f32Offset(i);
    v128.store(out + offset, f32x4.mul(v128.load(input + offset), scalar));
  }
  for (; i < length; i++) {
    writeF32(out, i, readF32(input, i) * value);
  }
}

export function affine(input: usize, out: usize, length: i32, multiplier: f32, addend: f32): void {
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

export function divideScalar(input: usize, out: usize, length: i32, value: f32): void {
  let scalar = f32x4.splat(value);
  let i = 0;
  let limit = simdLimit(length);

  for (; i < limit; i += 4) {
    let offset = f32Offset(i);
    v128.store(out + offset, f32x4.div(v128.load(input + offset), scalar));
  }
  for (; i < length; i++) {
    writeF32(out, i, readF32(input, i) / value);
  }
}

export function negate(input: usize, out: usize, length: i32): void {
  let i = 0;
  let limit = simdLimit(length);

  for (; i < limit; i += 4) {
    let offset = f32Offset(i);
    v128.store(out + offset, f32x4.neg(v128.load(input + offset)));
  }
  for (; i < length; i++) {
    writeF32(out, i, -readF32(input, i));
  }
}

export function absElements(input: usize, out: usize, length: i32): void {
  let i = 0;
  let limit = simdLimit(length);

  for (; i < limit; i += 4) {
    let offset = f32Offset(i);
    v128.store(out + offset, f32x4.abs(v128.load(input + offset)));
  }
  for (; i < length; i++) {
    writeF32(out, i, Mathf.abs(readF32(input, i)));
  }
}

export function sqrtElements(input: usize, out: usize, length: i32): void {
  let i = 0;
  let limit = simdLimit(length);

  for (; i < limit; i += 4) {
    let offset = f32Offset(i);
    v128.store(out + offset, f32x4.sqrt(v128.load(input + offset)));
  }
  for (; i < length; i++) {
    writeF32(out, i, Mathf.sqrt(readF32(input, i)));
  }
}

export function floorElements(input: usize, out: usize, length: i32): void {
  let i = 0;
  let limit = simdLimit(length);

  for (; i < limit; i += 4) {
    let offset = f32Offset(i);
    v128.store(out + offset, f32x4.floor(v128.load(input + offset)));
  }
  for (; i < length; i++) {
    writeF32(out, i, Mathf.floor(readF32(input, i)));
  }
}

export function ceilElements(input: usize, out: usize, length: i32): void {
  let i = 0;
  let limit = simdLimit(length);

  for (; i < limit; i += 4) {
    let offset = f32Offset(i);
    v128.store(out + offset, f32x4.ceil(v128.load(input + offset)));
  }
  for (; i < length; i++) {
    writeF32(out, i, Mathf.ceil(readF32(input, i)));
  }
}

export function clampElements(input: usize, out: usize, length: i32, minValue: f32, maxValue: f32): void {
  let minVector = f32x4.splat(minValue);
  let maxVector = f32x4.splat(maxValue);
  let i = 0;
  let limit = simdLimit(length);

  for (; i < limit; i += 4) {
    let offset = f32Offset(i);
    let value = f32x4.max(v128.load(input + offset), minVector);
    v128.store(out + offset, f32x4.min(value, maxVector));
  }
  for (; i < length; i++) {
    let value = readF32(input, i);
    writeF32(out, i, Mathf.min(Mathf.max(value, minValue), maxValue));
  }
}

@inline
function fusedOtherVector(ptr: usize, mode: i32, row: i32, col: i32, cols: i32, offset: i32): v128 {
  if (mode == 1) return v128.load(ptr + f32Offset(col));
  if (mode == 2) return f32x4.splat(readF32(ptr, row));
  return v128.load(ptr + f32Offset(offset));
}

@inline
function fusedOtherScalar(ptr: usize, mode: i32, row: i32, col: i32, cols: i32, offset: i32): f32 {
  if (mode == 1) return readF32(ptr, col);
  if (mode == 2) return readF32(ptr, row);
  return readF32(ptr, offset);
}

function applyFusedVectorOp(value: v128, code: i32, other: v128, scalarA: f32, scalarB: f32): v128 {
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
  if (code == 15) return f32x4.min(f32x4.max(value, f32x4.splat(scalarA)), f32x4.splat(scalarB));
  return value;
}

function applyFusedScalarOp(value: f32, code: i32, other: f32, scalarA: f32, scalarB: f32): f32 {
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
  opCount: i32
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
          let ptr = <usize>readI32(operandPtrs, op);
          let mode = readI32(operandModes, op);
          other = fusedOtherVector(ptr, mode, r, c, cols, offset);
        }
        value = applyFusedVectorOp(value, code, other, readF32(scalarA, op), readF32(scalarB, op));
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
          let ptr = <usize>readI32(operandPtrs, op);
          let mode = readI32(operandModes, op);
          other = fusedOtherScalar(ptr, mode, r, c, cols, offset);
        }
        value = applyFusedScalarOp(value, code, other, readF32(scalarA, op), readF32(scalarB, op));
      }

      writeF32(out, offset, value);
    }
  }
}

export function transpose(input: usize, out: usize, rows: i32, cols: i32): void {
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

export function identity(out: usize, size: i32): void {
  fill(out, size * size, 0.0);
  for (let i = 0; i < size; i++) {
    writeF32(out, i * size + i, 1.0);
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
    result *= <f64>readF32(input, i * size + i);
  }
  return result;
}

export function invertDiagonal(input: usize, out: usize, size: i32): i32 {
  fill(out, size * size, 0.0);
  for (let i = 0; i < size; i++) {
    let index = i * size + i;
    let value = readF32(input, index);
    if (Math.abs(<f64>value) <= EPSILON) return 0;
    writeF32(out, index, 1.0 / value);
  }
  return 1;
}

export function solveDiagonal(diagonalMatrix: usize, b: usize, out: usize, size: i32, rhsCols: i32): i32 {
  for (let r = 0; r < size; r++) {
    let diagonalValue = readF32(diagonalMatrix, r * size + r);
    if (Math.abs(<f64>diagonalValue) <= EPSILON) return 0;

    let inverseDiagonal = f32x4.splat(1.0 / diagonalValue);
    let rowBase = r * rhsCols;
    let c = 0;
    let limit = simdLimit(rhsCols);

    for (; c < limit; c += 4) {
      let offset = f32Offset(rowBase + c);
      v128.store(out + offset, f32x4.mul(v128.load(b + offset), inverseDiagonal));
    }
    for (; c < rhsCols; c++) {
      let index = rowBase + c;
      writeF32(out, index, readF32(b, index) / diagonalValue);
    }
  }

  return 1;
}

export function scaleRowsByDiagonal(diagonalMatrix: usize, input: usize, out: usize, rows: i32, cols: i32): void {
  for (let r = 0; r < rows; r++) {
    let scalar = f32x4.splat(readF32(diagonalMatrix, r * rows + r));
    let rowBase = r * cols;
    let c = 0;
    let limit = simdLimit(cols);

    for (; c < limit; c += 4) {
      let offset = f32Offset(rowBase + c);
      v128.store(out + offset, f32x4.mul(v128.load(input + offset), scalar));
    }
    for (; c < cols; c++) {
      let index = rowBase + c;
      writeF32(out, index, readF32(input, index) * f32x4.extract_lane(scalar, 0));
    }
  }
}

export function scaleColsByDiagonal(input: usize, diagonalMatrix: usize, out: usize, rows: i32, cols: i32): void {
  for (let r = 0; r < rows; r++) {
    let rowBase = r * cols;
    for (let c = 0; c < cols; c++) {
      writeF32(out, rowBase + c, readF32(input, rowBase + c) * readF32(diagonalMatrix, c * cols + c));
    }
  }
}

export function dot(a: usize, b: usize, length: i32): f32 {
  return dotSimd(a, b, length);
}

export function matmul(a: usize, b: usize, out: usize, rowsA: i32, colsA: i32, colsB: i32): void {
  for (let r = 0; r < rowsA; r++) {
    let aRow = a + f32Offset(r * colsA);
    let outBase = r * colsB;
    let c = 0;
    let colLimit = simdLimit(colsB);

    for (; c < colLimit; c += 4) {
      let acc0 = f32x4.splat(0.0);
      let acc1 = f32x4.splat(0.0);
      let acc2 = f32x4.splat(0.0);
      let acc3 = f32x4.splat(0.0);
      let k = 0;
      let kLimit = colsA & -4;

      for (; k < kLimit; k += 4) {
        let bOffset0 = f32Offset(k * colsB + c);
        let bOffset1 = f32Offset((k + 1) * colsB + c);
        let bOffset2 = f32Offset((k + 2) * colsB + c);
        let bOffset3 = f32Offset((k + 3) * colsB + c);

        acc0 = f32x4.add(acc0, f32x4.mul(f32x4.splat(load<f32>(aRow + f32Offset(k))), v128.load(b + bOffset0)));
        acc1 = f32x4.add(acc1, f32x4.mul(f32x4.splat(load<f32>(aRow + f32Offset(k + 1))), v128.load(b + bOffset1)));
        acc2 = f32x4.add(acc2, f32x4.mul(f32x4.splat(load<f32>(aRow + f32Offset(k + 2))), v128.load(b + bOffset2)));
        acc3 = f32x4.add(acc3, f32x4.mul(f32x4.splat(load<f32>(aRow + f32Offset(k + 3))), v128.load(b + bOffset3)));
      }

      let acc = f32x4.add(f32x4.add(acc0, acc1), f32x4.add(acc2, acc3));
      for (; k < colsA; k++) {
        let scalar = f32x4.splat(load<f32>(aRow + f32Offset(k)));
        acc = f32x4.add(acc, f32x4.mul(scalar, v128.load(b + f32Offset(k * colsB + c))));
      }

      v128.store(out + f32Offset(outBase + c), acc);
    }

    for (; c < colsB; c++) {
      let total: f32 = 0.0;
      for (let k = 0; k < colsA; k++) {
        total += load<f32>(aRow + f32Offset(k)) * readF32(b, k * colsB + c);
      }
      writeF32(out, outBase + c, total);
    }
  }
}

export function packForMatmul(input: usize, out: usize, rows: i32, cols: i32): void {
  for (let c = 0; c < cols; c++) {
    let outBase = c * rows;
    for (let r = 0; r < rows; r++) {
      writeF32(out, outBase + r, readF32(input, r * cols + c));
    }
  }
}

export function matmulPackedB(a: usize, packedB: usize, out: usize, rowsA: i32, colsA: i32, colsB: i32): void {
  for (let r = 0; r < rowsA; r++) {
    let aRow = a + f32Offset(r * colsA);
    let outBase = r * colsB;
    for (let c = 0; c < colsB; c++) {
      writeF32(out, outBase + c, dotSimd(aRow, packedB + f32Offset(c * colsA), colsA));
    }
  }
}

export function matmulTN(a: usize, b: usize, out: usize, rowsA: i32, colsA: i32, colsB: i32): void {
  for (let r = 0; r < colsA; r++) {
    let outBase = r * colsB;
    let c = 0;
    let colLimit = simdLimit(colsB);

    for (; c < colLimit; c += 4) {
      let acc = f32x4.splat(0.0);
      for (let k = 0; k < rowsA; k++) {
        let scalar = f32x4.splat(readF32(a, k * colsA + r));
        acc = f32x4.add(acc, f32x4.mul(scalar, v128.load(b + f32Offset(k * colsB + c))));
      }
      v128.store(out + f32Offset(outBase + c), acc);
    }

    for (; c < colsB; c++) {
      let total: f32 = 0.0;
      for (let k = 0; k < rowsA; k++) {
        total += readF32(a, k * colsA + r) * readF32(b, k * colsB + c);
      }
      writeF32(out, outBase + c, total);
    }
  }
}

export function matmulNT(a: usize, b: usize, out: usize, rowsA: i32, colsA: i32, rowsB: i32): void {
  for (let r = 0; r < rowsA; r++) {
    let outBase = r * rowsB;
    let aRow = a + f32Offset(r * colsA);
    let c = 0;
    let colBlockLimit = rowsB & -4;

    for (; c < colBlockLimit; c += 4) {
      let acc0 = f32x4.splat(0.0);
      let acc1 = f32x4.splat(0.0);
      let acc2 = f32x4.splat(0.0);
      let acc3 = f32x4.splat(0.0);
      let k = 0;
      let kLimit = simdLimit(colsA);

      for (; k < kLimit; k += 4) {
        let aVec = v128.load(aRow + f32Offset(k));
        acc0 = f32x4.add(acc0, f32x4.mul(aVec, v128.load(b + f32Offset(c * colsA + k))));
        acc1 = f32x4.add(acc1, f32x4.mul(aVec, v128.load(b + f32Offset((c + 1) * colsA + k))));
        acc2 = f32x4.add(acc2, f32x4.mul(aVec, v128.load(b + f32Offset((c + 2) * colsA + k))));
        acc3 = f32x4.add(acc3, f32x4.mul(aVec, v128.load(b + f32Offset((c + 3) * colsA + k))));
      }

      let total0 = horizontalSum4(acc0);
      let total1 = horizontalSum4(acc1);
      let total2 = horizontalSum4(acc2);
      let total3 = horizontalSum4(acc3);
      for (; k < colsA; k++) {
        let value = load<f32>(aRow + f32Offset(k));
        total0 += value * readF32(b, c * colsA + k);
        total1 += value * readF32(b, (c + 1) * colsA + k);
        total2 += value * readF32(b, (c + 2) * colsA + k);
        total3 += value * readF32(b, (c + 3) * colsA + k);
      }

      writeF32(out, outBase + c, total0);
      writeF32(out, outBase + c + 1, total1);
      writeF32(out, outBase + c + 2, total2);
      writeF32(out, outBase + c + 3, total3);
    }

    for (; c < rowsB; c++) {
      writeF32(out, outBase + c, dotSimd(aRow, b + f32Offset(c * colsA), colsA));
    }
  }
}

export function matmulTT(a: usize, b: usize, out: usize, rowsA: i32, colsA: i32, rowsB: i32): void {
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
      let total = dotSimd(a + f32Offset(r * cols), a + f32Offset(c * cols), cols);
      writeF32(out, r * rows + c, total);
      if (c != r) writeF32(out, c * rows + r, total);
    }
  }
}

export function traceMatmul(a: usize, b: usize, rowsA: i32, colsA: i32): f64 {
  let total: f64 = 0.0;
  for (let r = 0; r < rowsA; r++) {
    for (let c = 0; c < colsA; c++) {
      total += <f64>readF32(a, r * colsA + c) * <f64>readF32(b, c * rowsA + r);
    }
  }
  return total;
}

export function matvec(a: usize, vector: usize, out: usize, rows: i32, cols: i32): void {
  for (let r = 0; r < rows; r++) {
    writeF32(out, r, dotSimd(a + f32Offset(r * cols), vector, cols));
  }
}

export function outer(a: usize, b: usize, out: usize, rows: i32, cols: i32): void {
  let limit = simdLimit(cols);
  for (let r = 0; r < rows; r++) {
    let scalarValue = readF32(a, r);
    let scalar = f32x4.splat(scalarValue);
    let outBase = r * cols;
    let c = 0;

    for (; c < limit; c += 4) {
      let offset = f32Offset(c);
      v128.store(out + f32Offset(outBase + c), f32x4.mul(scalar, v128.load(b + offset)));
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

  let result: f64 = <f64>horizontalSum4(acc);
  for (; i < length; i++) {
    result += <f64>readF32(input, i);
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
      Mathf.min(f32x4.extract_lane(vector, 2), f32x4.extract_lane(vector, 3))
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
      Mathf.max(f32x4.extract_lane(vector, 2), f32x4.extract_lane(vector, 3))
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
    result += <f64>readF32(input, i * cols + i);
  }
  return result;
}

export function frobeniusNorm(input: usize, length: i32): f64 {
  let acc0 = f32x4.splat(0.0);
  let acc1 = f32x4.splat(0.0);
  let acc2 = f32x4.splat(0.0);
  let acc3 = f32x4.splat(0.0);
  let i = 0;
  let unrolledLimit = length & -16;

  for (; i < unrolledLimit; i += 16) {
    let offset = f32Offset(i);
    let value0 = v128.load(input + offset);
    let value1 = v128.load(input + offset + 16);
    let value2 = v128.load(input + offset + 32);
    let value3 = v128.load(input + offset + 48);
    acc0 = f32x4.add(acc0, f32x4.mul(value0, value0));
    acc1 = f32x4.add(acc1, f32x4.mul(value1, value1));
    acc2 = f32x4.add(acc2, f32x4.mul(value2, value2));
    acc3 = f32x4.add(acc3, f32x4.mul(value3, value3));
  }

  let acc = f32x4.add(f32x4.add(acc0, acc1), f32x4.add(acc2, acc3));
  let limit = simdLimit(length);
  for (; i < limit; i += 4) {
    let value = v128.load(input + f32Offset(i));
    acc = f32x4.add(acc, f32x4.mul(value, value));
  }

  let total: f64 = <f64>horizontalSum4(acc);
  for (; i < length; i++) {
    let value = <f64>readF32(input, i);
    total += value * value;
  }
  return Math.sqrt(total);
}

export function determinant(input: usize, size: i32): f64 {
  if (size == 0) return 1.0;

  let length = size * size;
  let work = heap.alloc(<usize>length << 3);
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

export function luFactor(input: usize, size: i32, lu: usize, pivots: usize): i32 {
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

  let result = <f64>sign;
  for (let i = 0; i < size; i++) {
    result *= readF64(lu, i * size + i);
  }
  return result;
}

function solveLuInPlace(lu: usize, pivots: usize, rhsWork: usize, size: i32, rhsCols: i32): i32 {
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
      subtractScaledRowF64(rhsWork, targetBase, j * rhsCols, 0, rhsCols, factor);
    }
  }

  let row = size;
  while (row > 0) {
    row--;
    let targetBase = row * rhsCols;
    for (let j = row + 1; j < size; j++) {
      let factor = readF64(lu, row * size + j);
      if (Math.abs(factor) <= EPSILON) continue;
      subtractScaledRowF64(rhsWork, targetBase, j * rhsCols, 0, rhsCols, factor);
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
    writeF32(dst, i, <f32>readF64(src, i));
  }
}

export function luSolve(lu: usize, pivots: usize, b: usize, out: usize, size: i32, rhsCols: i32, rhsWork: usize): i32 {
  let length = size * rhsCols;
  copyF32ToF64(b, rhsWork, length);

  let ok = solveLuInPlace(lu, pivots, rhsWork, size, rhsCols);
  if (ok != 1) return 0;

  writeF64BlockToF32(rhsWork, out, length);
  return 1;
}

export function luInvert(lu: usize, pivots: usize, out: usize, size: i32, rhsWork: usize): i32 {
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
      let sum = <f64>readF32(input, i * size + j);

      for (let k = 0; k < j; k++) {
        sum -= readF64(lower, i * size + k) * readF64(lower, j * size + k);
      }

      if (i == j) {
        if (sum <= EPSILON) return 0;
        writeF64(lower, i * size + j, Math.sqrt(sum));
      } else {
        let diagonal = readF64(lower, j * size + j);
        if (Math.abs(diagonal) <= EPSILON) return 0;
        writeF64(lower, i * size + j, sum / diagonal);
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

function solveCholeskyInPlace(lower: usize, rhsWork: usize, size: i32, rhsCols: i32): i32 {
  for (let i = 0; i < size; i++) {
    let targetBase = i * rhsCols;

    for (let j = 0; j < i; j++) {
      let factor = readF64(lower, i * size + j);
      if (Math.abs(factor) <= EPSILON) continue;
      subtractScaledRowF64(rhsWork, targetBase, j * rhsCols, 0, rhsCols, factor);
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
      subtractScaledRowF64(rhsWork, targetBase, j * rhsCols, 0, rhsCols, factor);
    }

    let diagonal = readF64(lower, row * size + row);
    if (Math.abs(diagonal) <= EPSILON) return 0;
    divideRowF64(rhsWork, targetBase, 0, rhsCols, diagonal);
  }

  return 1;
}

export function choleskySolve(lower: usize, b: usize, out: usize, size: i32, rhsCols: i32, rhsWork: usize): i32 {
  let length = size * rhsCols;
  copyF32ToF64(b, rhsWork, length);

  let ok = solveCholeskyInPlace(lower, rhsWork, size, rhsCols);
  if (ok != 1) return 0;

  writeF64BlockToF32(rhsWork, out, length);
  return 1;
}

export function choleskyInvert(lower: usize, out: usize, size: i32, rhsWork: usize): i32 {
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

export function inverse(input: usize, out: usize, size: i32): i32 {
  let cols = size * 2;
  let work = heap.alloc(<usize>(size * cols) << 3);
  let result = inverseWithWork(input, out, size, work);
  heap.free(work);
  return result;
}

export function inverseWithWork(input: usize, out: usize, size: i32, work: usize): i32 {
  let cols = size * 2;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      writeF64(work, r * cols + c, <f64>readF32(input, r * size + c));
      writeF64(work, r * cols + size + c, r == c ? 1.0 : 0.0);
    }
  }

  for (let col = 0; col < size; col++) {
    let pivot = col;
    let maxAbs = Math.abs(readF64(work, col * cols + col));

    for (let r = col + 1; r < size; r++) {
      let value = Math.abs(readF64(work, r * cols + col));
      if (value > maxAbs) {
        maxAbs = value;
        pivot = r;
      }
    }

    if (maxAbs <= EPSILON) {
      return 0;
    }

    if (pivot != col) {
      swapRowRangeF64(work, col * cols, pivot * cols, 0, cols);
    }

    let pivotValue = readF64(work, col * cols + col);
    divideRowF64(work, col * cols, 0, cols, pivotValue);

    for (let r = 0; r < size; r++) {
      if (r == col) continue;

      let factor = readF64(work, r * cols + col);
      if (Math.abs(factor) <= EPSILON) continue;

      subtractScaledRowF64(work, r * cols, col * cols, 0, cols, factor);
    }
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      writeF32(out, r * size + c, <f32>readF64(work, r * cols + size + c));
    }
  }

  return 1;
}

export function solve(a: usize, b: usize, out: usize, size: i32, rhsCols: i32): i32 {
  let cols = size + rhsCols;
  let work = heap.alloc(<usize>(size * cols) << 3);
  let result = solveWithWork(a, b, out, size, rhsCols, work);
  heap.free(work);
  return result;
}

export function solveWithWork(a: usize, b: usize, out: usize, size: i32, rhsCols: i32, work: usize): i32 {
  let cols = size + rhsCols;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      writeF64(work, r * cols + c, <f64>readF32(a, r * size + c));
    }
    for (let c = 0; c < rhsCols; c++) {
      writeF64(work, r * cols + size + c, <f64>readF32(b, r * rhsCols + c));
    }
  }

  for (let col = 0; col < size; col++) {
    let pivot = col;
    let maxAbs = Math.abs(readF64(work, col * cols + col));

    for (let r = col + 1; r < size; r++) {
      let value = Math.abs(readF64(work, r * cols + col));
      if (value > maxAbs) {
        maxAbs = value;
        pivot = r;
      }
    }

    if (maxAbs <= EPSILON) {
      return 0;
    }

    if (pivot != col) {
      swapRowRangeF64(work, col * cols, pivot * cols, 0, cols);
    }

    let pivotValue = readF64(work, col * cols + col);
    divideRowF64(work, col * cols, col, cols, pivotValue);

    for (let r = 0; r < size; r++) {
      if (r == col) continue;

      let factor = readF64(work, r * cols + col);
      if (Math.abs(factor) <= EPSILON) continue;

      subtractScaledRowF64(work, r * cols, col * cols, col, cols, factor);
    }
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < rhsCols; c++) {
      writeF32(out, r * rhsCols + c, <f32>readF64(work, r * cols + size + c));
    }
  }

  return 1;
}

export function rank(input: usize, rows: i32, cols: i32, epsilon: f64): i32 {
  let length = rows * cols;
  let work = heap.alloc(<usize>length << 3);
  let result = rankWithWork(input, rows, cols, epsilon, work);
  heap.free(work);
  return result;
}

export function rankWithWork(input: usize, rows: i32, cols: i32, epsilon: f64, work: usize): i32 {
  let length = rows * cols;
  copyF32ToF64(input, work, length);

  let row = 0;
  let result = 0;

  for (let col = 0; col < cols && row < rows; col++) {
    let pivot = row;
    let maxAbs = Math.abs(readF64(work, row * cols + col));

    for (let r = row + 1; r < rows; r++) {
      let value = Math.abs(readF64(work, r * cols + col));
      if (value > maxAbs) {
        maxAbs = value;
        pivot = r;
      }
    }

    if (maxAbs <= epsilon) continue;

    if (pivot != row) {
      swapRowRangeF64(work, row * cols, pivot * cols, col, cols);
    }

    let pivotValue = readF64(work, row * cols + col);
    divideRowF64(work, row * cols, col, cols, pivotValue);

    for (let r = 0; r < rows; r++) {
      if (r == row) continue;

      let factor = readF64(work, r * cols + col);
      if (Math.abs(factor) <= epsilon) continue;

      subtractScaledRowF64(work, r * cols, row * cols, col, cols, factor);
    }

    row++;
    result++;
  }

  return result;
}

export function qrFactor(input: usize, rows: i32, cols: i32, q: usize, r: usize): i32 {
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
      writeF64(q, row * cols + col, <f64>readF32(input, row * cols + col));
    }

    for (let prev = 0; prev < col; prev++) {
      let projection: f64 = 0.0;
      for (let row = 0; row < rows; row++) {
        projection += readF64(q, row * cols + prev) * readF64(q, row * cols + col);
      }
      writeF64(r, prev * cols + col, projection);
      for (let row = 0; row < rows; row++) {
        let index = row * cols + col;
        writeF64(q, index, readF64(q, index) - projection * readF64(q, row * cols + prev));
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

export function qrSolve(q: usize, r: usize, b: usize, out: usize, rows: i32, cols: i32, rhsCols: i32, work: usize): i32 {
  for (let i = 0; i < cols * rhsCols; i++) {
    writeF64(work, i, 0.0);
  }

  for (let col = 0; col < cols; col++) {
    for (let rhs = 0; rhs < rhsCols; rhs++) {
      let total: f64 = 0.0;
      for (let row = 0; row < rows; row++) {
        total += readF64(q, row * cols + col) * <f64>readF32(b, row * rhsCols + rhs);
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

export function equalsApprox(a: usize, b: usize, length: i32, epsilon: f64): i32 {
  let eps = f32x4.splat(<f32>epsilon);
  let i = 0;
  let limit = simdLimit(length);

  for (; i < limit; i += 4) {
    let offset = f32Offset(i);
    let delta = f32x4.abs(f32x4.sub(v128.load(a + offset), v128.load(b + offset)));
    if (v128.any_true(f32x4.gt(delta, eps))) return 0;
  }

  for (; i < length; i++) {
    let delta = Math.abs(<f64>readF32(a, i) - <f64>readF32(b, i));
    if (delta > epsilon) return 0;
  }
  return 1;
}
