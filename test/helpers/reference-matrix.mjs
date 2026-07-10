const F32_EPSILON = 1e-6;

function assertShape(a, b, operation) {
  if (a.rows !== b.rows || a.cols !== b.cols) {
    throw new RangeError(`${operation} shape mismatch: ${a.rows}x${a.cols} !== ${b.rows}x${b.cols}`);
  }
}

function assertSquare(a, operation) {
  if (a.rows !== a.cols) {
    throw new RangeError(`${operation} requires a square matrix`);
  }
}

function f32(value) {
  return Math.fround(value);
}

function workArray(matrix) {
  return Array.from(matrix.data, Number);
}

export function makeData(rows, cols, seed, options = {}) {
  const min = options.min ?? -1;
  const max = options.max ?? 1;
  const data = new Float32Array(rows * cols);
  let state = seed >>> 0;

  for (let i = 0; i < data.length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    data[i] = f32(min + (state / 0x100000000) * (max - min));
  }

  return data;
}

export function refMatrix(rows, cols, values) {
  if (values.length !== rows * cols) {
    throw new RangeError(`data length ${values.length} does not match ${rows}x${cols}`);
  }
  return { rows, cols, data: Float32Array.from(values) };
}

export function refZeros(rows, cols) {
  return refMatrix(rows, cols, new Float32Array(rows * cols));
}

export function refOnes(rows, cols) {
  const data = new Float32Array(rows * cols);
  data.fill(1);
  return refMatrix(rows, cols, data);
}

export function refIdentity(size) {
  const result = refZeros(size, size);
  for (let i = 0; i < size; i++) {
    result.data[i * size + i] = 1;
  }
  return result;
}

export function refDiagonalMatrix(vector) {
  const result = refZeros(vector.data.length, vector.data.length);
  for (let i = 0; i < vector.data.length; i++) {
    result.data[i * vector.data.length + i] = vector.data[i];
  }
  return result;
}

export function refMap(a, fn) {
  const data = new Float32Array(a.data.length);
  for (let i = 0; i < data.length; i++) {
    data[i] = f32(fn(a.data[i], i));
  }
  return refMatrix(a.rows, a.cols, data);
}

export function refBinary(a, b, fn) {
  assertShape(a, b, "binary");
  const data = new Float32Array(a.data.length);
  for (let i = 0; i < data.length; i++) {
    data[i] = f32(fn(a.data[i], b.data[i]));
  }
  return refMatrix(a.rows, a.cols, data);
}

export const refAdd = (a, b) => refBinary(a, b, (x, y) => x + y);
export const refSubtract = (a, b) => refBinary(a, b, (x, y) => x - y);
export const refHadamard = (a, b) => refBinary(a, b, (x, y) => x * y);
export const refDivide = (a, b) => refBinary(a, b, (x, y) => x / y);
export const refMin = (a, b) => refBinary(a, b, Math.min);
export const refMax = (a, b) => refBinary(a, b, Math.max);

export const refAddScalar = (a, value) => refMap(a, (x) => x + value);
export const refSubtractScalar = (a, value) => refMap(a, (x) => x - value);
export const refScale = (a, value) => refMap(a, (x) => x * value);
export const refDivideScalar = (a, value) => refMap(a, (x) => x / value);
export const refNegate = (a) => refMap(a, (x) => -x);
export const refAbs = (a) => refMap(a, Math.abs);
export const refSqrt = (a) => refMap(a, Math.sqrt);
export const refFloor = (a) => refMap(a, Math.floor);
export const refCeil = (a) => refMap(a, Math.ceil);
export const refClamp = (a, minValue, maxValue) => refMap(a, (x) => Math.min(Math.max(x, minValue), maxValue));

export function refTranspose(a) {
  const data = new Float32Array(a.data.length);
  for (let r = 0; r < a.rows; r++) {
    for (let c = 0; c < a.cols; c++) {
      data[c * a.rows + r] = a.data[r * a.cols + c];
    }
  }
  return refMatrix(a.cols, a.rows, data);
}

export function refMatmul(a, b) {
  if (a.cols !== b.rows) {
    throw new RangeError(`matmul shape mismatch: ${a.rows}x${a.cols} cannot multiply ${b.rows}x${b.cols}`);
  }

  const data = new Float32Array(a.rows * b.cols);
  for (let r = 0; r < a.rows; r++) {
    for (let c = 0; c < b.cols; c++) {
      let total = 0;
      for (let k = 0; k < a.cols; k++) {
        total += a.data[r * a.cols + k] * b.data[k * b.cols + c];
      }
      data[r * b.cols + c] = f32(total);
    }
  }
  return refMatrix(a.rows, b.cols, data);
}

export function refMatvec(a, vector) {
  if (vector.length !== a.cols) {
    throw new RangeError(`vector length ${vector.length} must match matrix columns ${a.cols}`);
  }
  const data = new Float32Array(a.rows);
  for (let r = 0; r < a.rows; r++) {
    let total = 0;
    for (let c = 0; c < a.cols; c++) {
      total += a.data[r * a.cols + c] * vector[c];
    }
    data[r] = f32(total);
  }
  return data;
}

export function refOuter(a, b) {
  const data = new Float32Array(a.length * b.length);
  for (let r = 0; r < a.length; r++) {
    for (let c = 0; c < b.length; c++) {
      data[r * b.length + c] = f32(a[r] * b[c]);
    }
  }
  return refMatrix(a.length, b.length, data);
}

export function refDot(a, b) {
  if (a.data.length !== b.data.length) {
    throw new RangeError(`dot length mismatch: ${a.data.length} !== ${b.data.length}`);
  }
  let total = 0;
  for (let i = 0; i < a.data.length; i++) {
    total += a.data[i] * b.data[i];
  }
  return f32(total);
}

export function refSum(a) {
  let total = 0;
  for (const value of a.data) total += value;
  return total;
}

export function refMinValue(a) {
  return Math.min(...a.data);
}

export function refMaxValue(a) {
  return Math.max(...a.data);
}

export function refTrace(a) {
  const length = Math.min(a.rows, a.cols);
  let total = 0;
  for (let i = 0; i < length; i++) {
    total += a.data[i * a.cols + i];
  }
  return total;
}

export function refFrobeniusNorm(a) {
  let total = 0;
  for (const value of a.data) {
    total += value * value;
  }
  return Math.sqrt(total);
}

export function refDiagonal(a) {
  const length = Math.min(a.rows, a.cols);
  const data = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    data[i] = a.data[i * a.cols + i];
  }
  return data;
}

export function refDeterminant(a) {
  assertSquare(a, "determinant");
  const size = a.rows;
  const work = workArray(a);
  let sign = 1;
  let result = 1;

  for (let k = 0; k < size; k++) {
    let pivot = k;
    let maxAbs = Math.abs(work[k * size + k]);
    for (let r = k + 1; r < size; r++) {
      const value = Math.abs(work[r * size + k]);
      if (value > maxAbs) {
        maxAbs = value;
        pivot = r;
      }
    }

    if (maxAbs <= F32_EPSILON) return 0;

    if (pivot !== k) {
      for (let c = k; c < size; c++) {
        const aIndex = k * size + c;
        const bIndex = pivot * size + c;
        const tmp = work[aIndex];
        work[aIndex] = work[bIndex];
        work[bIndex] = tmp;
      }
      sign = -sign;
    }

    const pivotValue = work[k * size + k];
    result *= pivotValue;
    for (let r = k + 1; r < size; r++) {
      const factor = work[r * size + k] / pivotValue;
      work[r * size + k] = 0;
      for (let c = k + 1; c < size; c++) {
        work[r * size + c] -= factor * work[k * size + c];
      }
    }
  }

  return result * sign;
}

export function refInverse(a) {
  assertSquare(a, "inverse");
  const size = a.rows;
  const cols = size * 2;
  const work = new Array(size * cols).fill(0);

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      work[r * cols + c] = a.data[r * size + c];
      work[r * cols + size + c] = r === c ? 1 : 0;
    }
  }

  gaussJordan(work, size, cols, size);

  const data = new Float32Array(size * size);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      data[r * size + c] = f32(work[r * cols + size + c]);
    }
  }
  return refMatrix(size, size, data);
}

export function refSolve(a, b) {
  assertSquare(a, "solve");
  if (b.rows !== a.rows) {
    throw new RangeError(`right-hand side rows ${b.rows} must match ${a.rows}`);
  }

  const size = a.rows;
  const cols = size + b.cols;
  const work = new Array(size * cols).fill(0);

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      work[r * cols + c] = a.data[r * size + c];
    }
    for (let c = 0; c < b.cols; c++) {
      work[r * cols + size + c] = b.data[r * b.cols + c];
    }
  }

  gaussJordan(work, size, cols, size);

  const data = new Float32Array(size * b.cols);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < b.cols; c++) {
      data[r * b.cols + c] = f32(work[r * cols + size + c]);
    }
  }
  return refMatrix(size, b.cols, data);
}

export function refRank(a, epsilon = 1e-6) {
  const work = workArray(a);
  let row = 0;
  let rank = 0;

  for (let col = 0; col < a.cols && row < a.rows; col++) {
    let pivot = row;
    let maxAbs = Math.abs(work[row * a.cols + col]);
    for (let r = row + 1; r < a.rows; r++) {
      const value = Math.abs(work[r * a.cols + col]);
      if (value > maxAbs) {
        maxAbs = value;
        pivot = r;
      }
    }

    if (maxAbs <= epsilon) continue;

    if (pivot !== row) {
      for (let c = col; c < a.cols; c++) {
        const aIndex = row * a.cols + c;
        const bIndex = pivot * a.cols + c;
        const tmp = work[aIndex];
        work[aIndex] = work[bIndex];
        work[bIndex] = tmp;
      }
    }

    const pivotValue = work[row * a.cols + col];
    for (let c = col; c < a.cols; c++) {
      work[row * a.cols + c] /= pivotValue;
    }

    for (let r = 0; r < a.rows; r++) {
      if (r === row) continue;
      const factor = work[r * a.cols + col];
      if (Math.abs(factor) <= epsilon) continue;
      for (let c = col; c < a.cols; c++) {
        work[r * a.cols + c] -= factor * work[row * a.cols + c];
      }
    }

    row++;
    rank++;
  }

  return rank;
}

function gaussJordan(work, rows, cols, size) {
  for (let col = 0; col < size; col++) {
    let pivot = col;
    let maxAbs = Math.abs(work[col * cols + col]);
    for (let r = col + 1; r < rows; r++) {
      const value = Math.abs(work[r * cols + col]);
      if (value > maxAbs) {
        maxAbs = value;
        pivot = r;
      }
    }

    if (maxAbs <= F32_EPSILON) {
      throw new RangeError("matrix is singular");
    }

    if (pivot !== col) {
      for (let c = 0; c < cols; c++) {
        const aIndex = col * cols + c;
        const bIndex = pivot * cols + c;
        const tmp = work[aIndex];
        work[aIndex] = work[bIndex];
        work[bIndex] = tmp;
      }
    }

    const pivotValue = work[col * cols + col];
    for (let c = 0; c < cols; c++) {
      work[col * cols + c] /= pivotValue;
    }

    for (let r = 0; r < rows; r++) {
      if (r === col) continue;
      const factor = work[r * cols + col];
      if (Math.abs(factor) <= F32_EPSILON) continue;
      for (let c = 0; c < cols; c++) {
        work[r * cols + c] -= factor * work[col * cols + c];
      }
    }
  }
}
