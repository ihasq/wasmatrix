import Matrix from "wasmatrix";

export type MutableArray = { length: number; [index: number]: number };
export type Vec2 = MutableArray;
export type Vec3 = MutableArray;
export type Vec4 = MutableArray;
export type Mat3 = MutableArray;
export type Mat4 = MutableArray;

const EPSILON = 0.000001;

function dst(length: number, out?: MutableArray) {
  return out ?? new Float32Array(length);
}

function write(out: MutableArray, values: ArrayLike<number>) {
  for (let i = 0; i < out.length; i++) out[i] = values[i] ?? 0;
  return out;
}

function createValues(length: number, values: ArrayLike<number>) {
  return write(new Float32Array(length), values);
}

function fromColumnMajorPacked(
  a: ArrayLike<number>,
  size: number,
  stride: number,
) {
  const rowMajor = new Float32Array(size * size);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      rowMajor[row * size + col] = a[col * stride + row] ?? 0;
    }
  }
  return Matrix.from(size, size, rowMajor);
}

function writeColumnMajorPacked(
  out: MutableArray,
  data: ArrayLike<number>,
  size: number,
  stride: number,
) {
  for (let col = 0; col < size; col++) {
    for (let row = 0; row < size; row++) {
      out[col * stride + row] = data[row * size + col] ?? 0;
    }
    for (let row = size; row < stride; row++) {
      out[col * stride + row] = 0;
    }
  }
  return out;
}

function multiplyPacked(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  size: number,
  stride: number,
  out?: MutableArray,
) {
  const target = dst(size * stride, out);
  const left = fromColumnMajorPacked(a, size, stride);
  const right = fromColumnMajorPacked(b, size, stride);
  const product = left.matmul(right);
  try {
    return writeColumnMajorPacked(
      target,
      product.toFloat32ArrayView(),
      size,
      stride,
    );
  } finally {
    product.dispose();
    left.dispose();
    right.dispose();
  }
}

function transformPackedVector(
  a: ArrayLike<number>,
  m: ArrayLike<number>,
  matrixSize: number,
  stride: number,
  inputLength: number,
  homogeneous: number | null,
  outputLength: number,
  divideByW: boolean,
  out?: MutableArray,
) {
  const target = dst(outputLength, out);
  const matrix = fromColumnMajorPacked(m, matrixSize, stride);
  const vector = new Float32Array(matrixSize);
  for (let i = 0; i < inputLength; i++) vector[i] = a[i] ?? 0;
  if (homogeneous != null) vector[matrixSize - 1] = homogeneous;

  const source = Matrix.from(matrixSize, 1, vector);
  const result = matrix.matmul(source);
  try {
    const data = result.toFloat32ArrayView();
    const w = divideByW ? data[matrixSize - 1] || 1 : 1;
    for (let i = 0; i < outputLength; i++) target[i] = data[i] / w;
    return target;
  } finally {
    result.dispose();
    source.dispose();
    matrix.dispose();
  }
}

function vectorCreate(length: number, values: number[]) {
  return createValues(length, values);
}

function vectorSet(values: number[], out?: MutableArray) {
  return write(dst(values.length, out), values);
}

function vectorCopy(a: ArrayLike<number>, length: number, out?: MutableArray) {
  return write(dst(length, out), a);
}

function vectorBinary(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  length: number,
  fn: (left: number, right: number) => number,
  out?: MutableArray,
) {
  const target = dst(length, out);
  for (let i = 0; i < length; i++) target[i] = fn(a[i] ?? 0, b[i] ?? 0);
  return target;
}

function vectorScalar(
  a: ArrayLike<number>,
  scalar: number,
  length: number,
  fn: (value: number, scalar: number) => number,
  out?: MutableArray,
) {
  const target = dst(length, out);
  for (let i = 0; i < length; i++) target[i] = fn(a[i] ?? 0, scalar);
  return target;
}

function vectorUnary(
  a: ArrayLike<number>,
  length: number,
  fn: (value: number) => number,
  out?: MutableArray,
) {
  const target = dst(length, out);
  for (let i = 0; i < length; i++) target[i] = fn(a[i] ?? 0);
  return target;
}

function dot(a: ArrayLike<number>, b: ArrayLike<number>, length: number) {
  let sum = 0;
  for (let i = 0; i < length; i++) sum += (a[i] ?? 0) * (b[i] ?? 0);
  return sum;
}

function lengthSq(a: ArrayLike<number>, length: number) {
  return dot(a, a, length);
}

function len(a: ArrayLike<number>, length: number) {
  return Math.sqrt(lengthSq(a, length));
}

function distanceSq(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  length: number,
) {
  let sum = 0;
  for (let i = 0; i < length; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    sum += diff * diff;
  }
  return sum;
}

function distance(a: ArrayLike<number>, b: ArrayLike<number>, length: number) {
  return Math.sqrt(distanceSq(a, b, length));
}

function normalize(a: ArrayLike<number>, length: number, out?: MutableArray) {
  const magnitude = len(a, length);
  const target = dst(length, out);
  if (magnitude === 0) return write(target, new Float32Array(length));
  for (let i = 0; i < length; i++) target[i] = (a[i] ?? 0) / magnitude;
  return target;
}

function equals(a: ArrayLike<number>, b: ArrayLike<number>, length: number) {
  for (let i = 0; i < length; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return false;
  }
  return true;
}

function equalsApproximately(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  length: number,
  epsilon = EPSILON,
) {
  for (let i = 0; i < length; i++) {
    if (Math.abs((a[i] ?? 0) - (b[i] ?? 0)) > epsilon) return false;
  }
  return true;
}

function lerp(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  t: number,
  length: number,
  out?: MutableArray,
) {
  return vectorBinary(
    a,
    b,
    length,
    (left, right) => left + (right - left) * t,
    out,
  );
}

function lerpV(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  t: ArrayLike<number>,
  length: number,
  out?: MutableArray,
) {
  const target = dst(length, out);
  for (let i = 0; i < length; i++) {
    const left = a[i] ?? 0;
    target[i] = left + ((b[i] ?? 0) - left) * (t[i] ?? 0);
  }
  return target;
}

function addScaled(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  scale: number,
  length: number,
  out?: MutableArray,
) {
  return vectorBinary(a, b, length, (left, right) => left + right * scale, out);
}

function setLength(
  a: ArrayLike<number>,
  targetLength: number,
  length: number,
  out?: MutableArray,
) {
  const normalized = normalize(a, length, out);
  return vectorScalar(
    normalized,
    targetLength,
    length,
    (value, scalar) => value * scalar,
    normalized,
  );
}

function clampVector(
  a: ArrayLike<number>,
  minValue: number,
  maxValue: number,
  length: number,
  out?: MutableArray,
) {
  return vectorUnary(
    a,
    length,
    (value) => Math.min(maxValue, Math.max(minValue, value)),
    out,
  );
}

function vecApi(length: number) {
  return {
    add: (a: ArrayLike<number>, b: ArrayLike<number>, out?: MutableArray) =>
      vectorBinary(a, b, length, (left, right) => left + right, out),
    addScaled: (
      a: ArrayLike<number>,
      b: ArrayLike<number>,
      scale: number,
      out?: MutableArray,
    ) => addScaled(a, b, scale, length, out),
    ceil: (a: ArrayLike<number>, out?: MutableArray) =>
      vectorUnary(a, length, Math.ceil, out),
    clamp: (
      a: ArrayLike<number>,
      minValue: number,
      maxValue: number,
      out?: MutableArray,
    ) => clampVector(a, minValue, maxValue, length, out),
    clone: (a: ArrayLike<number>) => vectorCopy(a, length),
    copy: (a: ArrayLike<number>, out?: MutableArray) =>
      vectorCopy(a, length, out),
    dist: (a: ArrayLike<number>, b: ArrayLike<number>) =>
      distance(a, b, length),
    distance: (a: ArrayLike<number>, b: ArrayLike<number>) =>
      distance(a, b, length),
    distSq: (a: ArrayLike<number>, b: ArrayLike<number>) =>
      distanceSq(a, b, length),
    distanceSq: (a: ArrayLike<number>, b: ArrayLike<number>) =>
      distanceSq(a, b, length),
    div: (a: ArrayLike<number>, b: ArrayLike<number>, out?: MutableArray) =>
      vectorBinary(a, b, length, (left, right) => left / right, out),
    divide: (a: ArrayLike<number>, b: ArrayLike<number>, out?: MutableArray) =>
      vectorBinary(a, b, length, (left, right) => left / right, out),
    divScalar: (a: ArrayLike<number>, scalar: number, out?: MutableArray) =>
      vectorScalar(a, scalar, length, (value, divisor) => value / divisor, out),
    dot: (a: ArrayLike<number>, b: ArrayLike<number>) => dot(a, b, length),
    equals: (a: ArrayLike<number>, b: ArrayLike<number>) =>
      equals(a, b, length),
    equalsApproximately: (
      a: ArrayLike<number>,
      b: ArrayLike<number>,
      epsilon?: number,
    ) => equalsApproximately(a, b, length, epsilon),
    floor: (a: ArrayLike<number>, out?: MutableArray) =>
      vectorUnary(a, length, Math.floor, out),
    inverse: (a: ArrayLike<number>, out?: MutableArray) =>
      vectorUnary(a, length, (value) => 1 / value, out),
    invert: (a: ArrayLike<number>, out?: MutableArray) =>
      vectorUnary(a, length, (value) => 1 / value, out),
    len: (a: ArrayLike<number>) => len(a, length),
    length: (a: ArrayLike<number>) => len(a, length),
    lenSq: (a: ArrayLike<number>) => lengthSq(a, length),
    lengthSq: (a: ArrayLike<number>) => lengthSq(a, length),
    lerp: (
      a: ArrayLike<number>,
      b: ArrayLike<number>,
      t: number,
      out?: MutableArray,
    ) => lerp(a, b, t, length, out),
    lerpV: (
      a: ArrayLike<number>,
      b: ArrayLike<number>,
      t: ArrayLike<number>,
      out?: MutableArray,
    ) => lerpV(a, b, t, length, out),
    max: (a: ArrayLike<number>, b: ArrayLike<number>, out?: MutableArray) =>
      vectorBinary(a, b, length, Math.max, out),
    midpoint: (
      a: ArrayLike<number>,
      b: ArrayLike<number>,
      out?: MutableArray,
    ) => vectorBinary(a, b, length, (left, right) => (left + right) * 0.5, out),
    min: (a: ArrayLike<number>, b: ArrayLike<number>, out?: MutableArray) =>
      vectorBinary(a, b, length, Math.min, out),
    mul: (a: ArrayLike<number>, b: ArrayLike<number>, out?: MutableArray) =>
      vectorBinary(a, b, length, (left, right) => left * right, out),
    multiply: (
      a: ArrayLike<number>,
      b: ArrayLike<number>,
      out?: MutableArray,
    ) => vectorBinary(a, b, length, (left, right) => left * right, out),
    mulScalar: (a: ArrayLike<number>, scalar: number, out?: MutableArray) =>
      vectorScalar(
        a,
        scalar,
        length,
        (value, multiplier) => value * multiplier,
        out,
      ),
    negate: (a: ArrayLike<number>, out?: MutableArray) =>
      vectorUnary(a, length, (value) => -value, out),
    normalize: (a: ArrayLike<number>, out?: MutableArray) =>
      normalize(a, length, out),
    round: (a: ArrayLike<number>, out?: MutableArray) =>
      vectorUnary(a, length, Math.round, out),
    scale: (a: ArrayLike<number>, scalar: number, out?: MutableArray) =>
      vectorScalar(
        a,
        scalar,
        length,
        (value, multiplier) => value * multiplier,
        out,
      ),
    setLength: (
      a: ArrayLike<number>,
      targetLength: number,
      out?: MutableArray,
    ) => setLength(a, targetLength, length, out),
    sub: (a: ArrayLike<number>, b: ArrayLike<number>, out?: MutableArray) =>
      vectorBinary(a, b, length, (left, right) => left - right, out),
    subtract: (
      a: ArrayLike<number>,
      b: ArrayLike<number>,
      out?: MutableArray,
    ) => vectorBinary(a, b, length, (left, right) => left - right, out),
    truncate: (a: ArrayLike<number>, maxLength: number, out?: MutableArray) => {
      const currentLength = len(a, length);
      return currentLength > maxLength
        ? setLength(a, maxLength, length, out)
        : vectorCopy(a, length, out);
    },
    zero: (out?: MutableArray) =>
      write(dst(length, out), new Float32Array(length)),
  };
}

function mat4Identity(out?: MutableArray) {
  return write(dst(16, out), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

function mat3Identity(out?: MutableArray) {
  return write(dst(12, out), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]);
}

function mat4Determinant(m: ArrayLike<number>) {
  const m00 = m[0] ?? 0, m01 = m[1] ?? 0, m02 = m[2] ?? 0, m03 = m[3] ?? 0;
  const m10 = m[4] ?? 0, m11 = m[5] ?? 0, m12 = m[6] ?? 0, m13 = m[7] ?? 0;
  const m20 = m[8] ?? 0, m21 = m[9] ?? 0, m22 = m[10] ?? 0, m23 = m[11] ?? 0;
  const m30 = m[12] ?? 0, m31 = m[13] ?? 0, m32 = m[14] ?? 0, m33 = m[15] ?? 0;
  const tmp0 = m22 * m33 - m32 * m23;
  const tmp1 = m12 * m33 - m32 * m13;
  const tmp2 = m12 * m23 - m22 * m13;
  const tmp3 = m02 * m33 - m32 * m03;
  const tmp4 = m02 * m23 - m22 * m03;
  const tmp5 = m02 * m13 - m12 * m03;
  return m00 * (m11 * tmp0 - m21 * tmp1 + m31 * tmp2) -
    m10 * (m01 * tmp0 - m21 * tmp3 + m31 * tmp4) +
    m20 * (m01 * tmp1 - m11 * tmp3 + m31 * tmp5) -
    m30 * (m01 * tmp2 - m11 * tmp4 + m21 * tmp5);
}

function mat4Inverse(m: ArrayLike<number>, out?: MutableArray) {
  const target = dst(16, out);
  const m00 = m[0] ?? 0, m01 = m[1] ?? 0, m02 = m[2] ?? 0, m03 = m[3] ?? 0;
  const m10 = m[4] ?? 0, m11 = m[5] ?? 0, m12 = m[6] ?? 0, m13 = m[7] ?? 0;
  const m20 = m[8] ?? 0, m21 = m[9] ?? 0, m22 = m[10] ?? 0, m23 = m[11] ?? 0;
  const m30 = m[12] ?? 0, m31 = m[13] ?? 0, m32 = m[14] ?? 0, m33 = m[15] ?? 0;

  const tmp0 = m22 * m33, tmp1 = m32 * m23, tmp2 = m12 * m33, tmp3 = m32 * m13;
  const tmp4 = m12 * m23, tmp5 = m22 * m13, tmp6 = m02 * m33, tmp7 = m32 * m03;
  const tmp8 = m02 * m23,
    tmp9 = m22 * m03,
    tmp10 = m02 * m13,
    tmp11 = m12 * m03;
  const tmp12 = m20 * m31,
    tmp13 = m30 * m21,
    tmp14 = m10 * m31,
    tmp15 = m30 * m11;
  const tmp16 = m10 * m21,
    tmp17 = m20 * m11,
    tmp18 = m00 * m31,
    tmp19 = m30 * m01;
  const tmp20 = m00 * m21,
    tmp21 = m20 * m01,
    tmp22 = m00 * m11,
    tmp23 = m10 * m01;

  const t0 = (tmp0 * m11 + tmp3 * m21 + tmp4 * m31) -
    (tmp1 * m11 + tmp2 * m21 + tmp5 * m31);
  const t1 = (tmp1 * m01 + tmp6 * m21 + tmp9 * m31) -
    (tmp0 * m01 + tmp7 * m21 + tmp8 * m31);
  const t2 = (tmp2 * m01 + tmp7 * m11 + tmp10 * m31) -
    (tmp3 * m01 + tmp6 * m11 + tmp11 * m31);
  const t3 = (tmp5 * m01 + tmp8 * m11 + tmp11 * m21) -
    (tmp4 * m01 + tmp9 * m11 + tmp10 * m21);
  const determinant = m00 * t0 + m10 * t1 + m20 * t2 + m30 * t3;
  if (determinant === 0) return null;
  const d = 1 / determinant;

  target[0] = d * t0;
  target[1] = d * t1;
  target[2] = d * t2;
  target[3] = d * t3;
  target[4] = d *
    ((tmp1 * m10 + tmp2 * m20 + tmp5 * m30) -
      (tmp0 * m10 + tmp3 * m20 + tmp4 * m30));
  target[5] = d *
    ((tmp0 * m00 + tmp7 * m20 + tmp8 * m30) -
      (tmp1 * m00 + tmp6 * m20 + tmp9 * m30));
  target[6] = d *
    ((tmp3 * m00 + tmp6 * m10 + tmp11 * m30) -
      (tmp2 * m00 + tmp7 * m10 + tmp10 * m30));
  target[7] = d *
    ((tmp4 * m00 + tmp9 * m10 + tmp10 * m20) -
      (tmp5 * m00 + tmp8 * m10 + tmp11 * m20));
  target[8] = d *
    ((tmp12 * m13 + tmp15 * m23 + tmp16 * m33) -
      (tmp13 * m13 + tmp14 * m23 + tmp17 * m33));
  target[9] = d *
    ((tmp13 * m03 + tmp18 * m23 + tmp21 * m33) -
      (tmp12 * m03 + tmp19 * m23 + tmp20 * m33));
  target[10] = d *
    ((tmp14 * m03 + tmp19 * m13 + tmp22 * m33) -
      (tmp15 * m03 + tmp18 * m13 + tmp23 * m33));
  target[11] = d *
    ((tmp17 * m03 + tmp20 * m13 + tmp23 * m23) -
      (tmp16 * m03 + tmp21 * m13 + tmp22 * m23));
  target[12] = d *
    ((tmp14 * m22 + tmp17 * m32 + tmp13 * m12) -
      (tmp16 * m32 + tmp12 * m12 + tmp15 * m22));
  target[13] = d *
    ((tmp20 * m32 + tmp12 * m02 + tmp19 * m22) -
      (tmp18 * m22 + tmp21 * m32 + tmp13 * m02));
  target[14] = d *
    ((tmp18 * m12 + tmp23 * m32 + tmp15 * m02) -
      (tmp22 * m32 + tmp14 * m02 + tmp19 * m12));
  target[15] = d *
    ((tmp22 * m22 + tmp16 * m02 + tmp21 * m12) -
      (tmp20 * m12 + tmp23 * m22 + tmp17 * m02));
  return target;
}

function transposePacked(
  a: ArrayLike<number>,
  size: number,
  stride: number,
  out?: MutableArray,
) {
  const target = dst(size * stride, out);
  const source = target === a ? Float32Array.from(a) : a;
  for (let col = 0; col < size; col++) {
    for (let row = 0; row < size; row++) {
      target[col * stride + row] = source[row * stride + col] ?? 0;
    }
    for (let row = size; row < stride; row++) target[col * stride + row] = 0;
  }
  return target;
}

export const vec2 = {
  ...vecApi(2),
  create: (x = 0, y = 0) => vectorCreate(2, [x, y]),
  fromValues: (x: number, y: number) => vectorCreate(2, [x, y]),
  set: (x: number, y: number, out?: MutableArray) => vectorSet([x, y], out),
  transformMat3: (
    a: ArrayLike<number>,
    m: ArrayLike<number>,
    out?: MutableArray,
  ) => transformPackedVector(a, m, 3, 4, 2, 1, 2, false, out),
  transformMat4: (
    a: ArrayLike<number>,
    m: ArrayLike<number>,
    out?: MutableArray,
  ) => transformPackedVector(a, m, 4, 4, 2, 1, 2, true, out),
};

export const vec3 = {
  ...vecApi(3),
  create: (x = 0, y = 0, z = 0) => vectorCreate(3, [x, y, z]),
  cross: (a: ArrayLike<number>, b: ArrayLike<number>, out?: MutableArray) =>
    write(dst(3, out), [
      (a[1] ?? 0) * (b[2] ?? 0) - (a[2] ?? 0) * (b[1] ?? 0),
      (a[2] ?? 0) * (b[0] ?? 0) - (a[0] ?? 0) * (b[2] ?? 0),
      (a[0] ?? 0) * (b[1] ?? 0) - (a[1] ?? 0) * (b[0] ?? 0),
    ]),
  fromValues: (x: number, y: number, z: number) => vectorCreate(3, [x, y, z]),
  getScaling: (m: ArrayLike<number>, out?: MutableArray) =>
    write(dst(3, out), [
      Math.hypot(m[0] ?? 0, m[1] ?? 0, m[2] ?? 0),
      Math.hypot(m[4] ?? 0, m[5] ?? 0, m[6] ?? 0),
      Math.hypot(m[8] ?? 0, m[9] ?? 0, m[10] ?? 0),
    ]),
  getTranslation: (m: ArrayLike<number>, out?: MutableArray) =>
    write(dst(3, out), [m[12] ?? 0, m[13] ?? 0, m[14] ?? 0]),
  set: (x: number, y: number, z: number, out?: MutableArray) =>
    vectorSet([x, y, z], out),
  transformMat3: (
    a: ArrayLike<number>,
    m: ArrayLike<number>,
    out?: MutableArray,
  ) => transformPackedVector(a, m, 3, 4, 3, null, 3, false, out),
  transformMat4: (
    a: ArrayLike<number>,
    m: ArrayLike<number>,
    out?: MutableArray,
  ) => transformPackedVector(a, m, 4, 4, 3, 1, 3, true, out),
  transformMat4Upper3x3: (
    a: ArrayLike<number>,
    m: ArrayLike<number>,
    out?: MutableArray,
  ) => transformPackedVector(a, mat3.fromMat4(m), 3, 4, 3, null, 3, false, out),
};

export const vec4 = {
  ...vecApi(4),
  create: (x = 0, y = 0, z = 0, w = 0) => vectorCreate(4, [x, y, z, w]),
  fromValues: (x: number, y: number, z: number, w: number) =>
    vectorCreate(4, [x, y, z, w]),
  set: (x: number, y: number, z: number, w: number, out?: MutableArray) =>
    vectorSet([x, y, z, w], out),
  transformMat4: (
    a: ArrayLike<number>,
    m: ArrayLike<number>,
    out?: MutableArray,
  ) => transformPackedVector(a, m, 4, 4, 4, null, 4, false, out),
};

export const mat3 = {
  add: (a: ArrayLike<number>, b: ArrayLike<number>, out?: MutableArray) =>
    vectorBinary(a, b, 12, (left, right) => left + right, out),
  clone: (a: ArrayLike<number>) => write(new Float32Array(12), a),
  copy: (a: ArrayLike<number>, out?: MutableArray) => write(dst(12, out), a),
  create: (...values: number[]) => createValues(12, values),
  determinant: (m: ArrayLike<number>) => {
    const a00 = m[0] ?? 0, a01 = m[1] ?? 0, a02 = m[2] ?? 0;
    const a10 = m[4] ?? 0, a11 = m[5] ?? 0, a12 = m[6] ?? 0;
    const a20 = m[8] ?? 0, a21 = m[9] ?? 0, a22 = m[10] ?? 0;
    return a00 * (a11 * a22 - a12 * a21) -
      a10 * (a01 * a22 - a02 * a21) +
      a20 * (a01 * a12 - a02 * a11);
  },
  equals: (a: ArrayLike<number>, b: ArrayLike<number>) => equals(a, b, 12),
  equalsApproximately: (
    a: ArrayLike<number>,
    b: ArrayLike<number>,
    epsilon?: number,
  ) => equalsApproximately(a, b, 12, epsilon),
  fromMat4: (m: ArrayLike<number>, out?: MutableArray) =>
    write(dst(12, out), [
      m[0] ?? 0,
      m[1] ?? 0,
      m[2] ?? 0,
      0,
      m[4] ?? 0,
      m[5] ?? 0,
      m[6] ?? 0,
      0,
      m[8] ?? 0,
      m[9] ?? 0,
      m[10] ?? 0,
      0,
    ]),
  identity: mat3Identity,
  inverse: (m: ArrayLike<number>, out?: MutableArray) => mat3.invert(m, out),
  invert: (m: ArrayLike<number>, out?: MutableArray) => {
    const determinant = mat3.determinant(m);
    if (determinant === 0) return null;
    const d = 1 / determinant;
    const a00 = m[0] ?? 0, a01 = m[1] ?? 0, a02 = m[2] ?? 0;
    const a10 = m[4] ?? 0, a11 = m[5] ?? 0, a12 = m[6] ?? 0;
    const a20 = m[8] ?? 0, a21 = m[9] ?? 0, a22 = m[10] ?? 0;
    return write(dst(12, out), [
      (a11 * a22 - a12 * a21) * d,
      (a02 * a21 - a01 * a22) * d,
      (a01 * a12 - a02 * a11) * d,
      0,
      (a12 * a20 - a10 * a22) * d,
      (a00 * a22 - a02 * a20) * d,
      (a02 * a10 - a00 * a12) * d,
      0,
      (a10 * a21 - a11 * a20) * d,
      (a01 * a20 - a00 * a21) * d,
      (a00 * a11 - a01 * a10) * d,
      0,
    ]);
  },
  mul: (a: ArrayLike<number>, b: ArrayLike<number>, out?: MutableArray) =>
    multiplyPacked(a, b, 3, 4, out),
  multiply: (a: ArrayLike<number>, b: ArrayLike<number>, out?: MutableArray) =>
    multiplyPacked(a, b, 3, 4, out),
  mulScalar: (m: ArrayLike<number>, scalar: number, out?: MutableArray) =>
    vectorScalar(m, scalar, 12, (value, multiplier) => value * multiplier, out),
  multiplyScalar: (m: ArrayLike<number>, scalar: number, out?: MutableArray) =>
    vectorScalar(m, scalar, 12, (value, multiplier) => value * multiplier, out),
  negate: (m: ArrayLike<number>, out?: MutableArray) =>
    vectorUnary(m, 12, (value) => -value, out),
  rotate: (m: ArrayLike<number>, radians: number, out?: MutableArray) =>
    mat3.multiply(m, mat3.rotation(radians), out),
  rotation: (radians: number, out?: MutableArray) => {
    const s = Math.sin(radians);
    const c = Math.cos(radians);
    return write(dst(12, out), [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0]);
  },
  scale: (m: ArrayLike<number>, v: ArrayLike<number>, out?: MutableArray) =>
    mat3.multiply(m, mat3.scaling(v), out),
  scaling: (v: ArrayLike<number>, out?: MutableArray) =>
    write(dst(12, out), [v[0] ?? 0, 0, 0, 0, 0, v[1] ?? 0, 0, 0, 0, 0, 1, 0]),
  set: (
    v0 = 0,
    v1 = 0,
    v2 = 0,
    v3 = 0,
    v4 = 0,
    v5 = 0,
    v6 = 0,
    v7 = 0,
    v8 = 0,
    v9 = 0,
    v10 = 0,
    v11 = 0,
    out?: MutableArray,
  ) => write(dst(12, out), [v0, v1, v2, v3, v4, v5, v6, v7, v8, v9, v10, v11]),
  setTranslation: (
    m: ArrayLike<number>,
    v: ArrayLike<number>,
    out?: MutableArray,
  ) => {
    const target = write(dst(12, out), m);
    target[8] = v[0] ?? 0;
    target[9] = v[1] ?? 0;
    target[10] = 1;
    target[11] = 0;
    return target;
  },
  translate: (m: ArrayLike<number>, v: ArrayLike<number>, out?: MutableArray) =>
    mat3.multiply(m, mat3.translation(v), out),
  translation: (v: ArrayLike<number>, out?: MutableArray) =>
    write(dst(12, out), [1, 0, 0, 0, 0, 1, 0, 0, v[0] ?? 0, v[1] ?? 0, 1, 0]),
  transpose: (m: ArrayLike<number>, out?: MutableArray) =>
    transposePacked(m, 3, 4, out),
  uniformScale: (m: ArrayLike<number>, scale: number, out?: MutableArray) =>
    mat3.scale(m, [scale, scale], out),
  uniformScaling: (scale: number, out?: MutableArray) =>
    mat3.scaling([scale, scale], out),
};

export const mat4 = {
  add: (a: ArrayLike<number>, b: ArrayLike<number>, out?: MutableArray) =>
    vectorBinary(a, b, 16, (left, right) => left + right, out),
  clone: (a: ArrayLike<number>) => write(new Float32Array(16), a),
  copy: (a: ArrayLike<number>, out?: MutableArray) => write(dst(16, out), a),
  create: (...values: number[]) => createValues(16, values),
  determinant: mat4Determinant,
  equals: (a: ArrayLike<number>, b: ArrayLike<number>) => equals(a, b, 16),
  equalsApproximately: (
    a: ArrayLike<number>,
    b: ArrayLike<number>,
    epsilon?: number,
  ) => equalsApproximately(a, b, 16, epsilon),
  fromMat3: (m: ArrayLike<number>, out?: MutableArray) =>
    write(dst(16, out), [
      m[0] ?? 0,
      m[1] ?? 0,
      m[2] ?? 0,
      0,
      m[4] ?? 0,
      m[5] ?? 0,
      m[6] ?? 0,
      0,
      m[8] ?? 0,
      m[9] ?? 0,
      m[10] ?? 0,
      0,
      0,
      0,
      0,
      1,
    ]),
  getScaling: (m: ArrayLike<number>, out?: MutableArray) =>
    vec3.getScaling(m, out),
  getTranslation: (m: ArrayLike<number>, out?: MutableArray) =>
    vec3.getTranslation(m, out),
  identity: mat4Identity,
  inverse: (m: ArrayLike<number>, out?: MutableArray) => mat4Inverse(m, out),
  invert: (m: ArrayLike<number>, out?: MutableArray) => mat4Inverse(m, out),
  lookAt: (
    eye: ArrayLike<number>,
    target: ArrayLike<number>,
    up: ArrayLike<number>,
    out?: MutableArray,
  ) => {
    const zAxis = vec3.normalize(vec3.subtract(eye, target));
    const xAxis = vec3.normalize(vec3.cross(up, zAxis));
    const yAxis = vec3.cross(zAxis, xAxis);
    return write(dst(16, out), [
      xAxis[0],
      xAxis[1],
      xAxis[2],
      0,
      yAxis[0],
      yAxis[1],
      yAxis[2],
      0,
      zAxis[0],
      zAxis[1],
      zAxis[2],
      0,
      eye[0] ?? 0,
      eye[1] ?? 0,
      eye[2] ?? 0,
      1,
    ]);
  },
  mul: (a: ArrayLike<number>, b: ArrayLike<number>, out?: MutableArray) =>
    multiplyPacked(a, b, 4, 4, out),
  multiply: (a: ArrayLike<number>, b: ArrayLike<number>, out?: MutableArray) =>
    multiplyPacked(a, b, 4, 4, out),
  mulScalar: (m: ArrayLike<number>, scalar: number, out?: MutableArray) =>
    vectorScalar(m, scalar, 16, (value, multiplier) => value * multiplier, out),
  multiplyScalar: (m: ArrayLike<number>, scalar: number, out?: MutableArray) =>
    vectorScalar(m, scalar, 16, (value, multiplier) => value * multiplier, out),
  negate: (m: ArrayLike<number>, out?: MutableArray) =>
    vectorUnary(m, 16, (value) => -value, out),
  ortho: (
    left: number,
    right: number,
    bottom: number,
    top: number,
    near: number,
    far: number,
    out?: MutableArray,
  ) => {
    return write(dst(16, out), [
      2 / (right - left),
      0,
      0,
      0,
      0,
      2 / (top - bottom),
      0,
      0,
      0,
      0,
      1 / (near - far),
      0,
      (left + right) / (left - right),
      (bottom + top) / (bottom - top),
      near / (near - far),
      1,
    ]);
  },
  perspective: (
    fovy: number,
    aspect: number,
    near: number,
    far: number,
    out?: MutableArray,
  ) => {
    const f = Math.tan(Math.PI * 0.5 - fovy * 0.5);
    const target = write(dst(16, out), new Float32Array(16));
    target[0] = f / aspect;
    target[5] = f;
    target[11] = -1;
    if (far === Infinity) {
      target[10] = -1;
      target[14] = -near;
    } else {
      const rangeInv = 1 / (near - far);
      target[10] = far * rangeInv;
      target[14] = near * far * rangeInv;
    }
    return target;
  },
  rotateX: (m: ArrayLike<number>, radians: number, out?: MutableArray) =>
    mat4.multiply(m, mat4.rotationX(radians), out),
  rotateY: (m: ArrayLike<number>, radians: number, out?: MutableArray) =>
    mat4.multiply(m, mat4.rotationY(radians), out),
  rotateZ: (m: ArrayLike<number>, radians: number, out?: MutableArray) =>
    mat4.multiply(m, mat4.rotationZ(radians), out),
  rotationX: (radians: number, out?: MutableArray) => {
    const s = Math.sin(radians);
    const c = Math.cos(radians);
    return write(dst(16, out), [
      1,
      0,
      0,
      0,
      0,
      c,
      s,
      0,
      0,
      -s,
      c,
      0,
      0,
      0,
      0,
      1,
    ]);
  },
  rotationY: (radians: number, out?: MutableArray) => {
    const s = Math.sin(radians);
    const c = Math.cos(radians);
    return write(dst(16, out), [
      c,
      0,
      -s,
      0,
      0,
      1,
      0,
      0,
      s,
      0,
      c,
      0,
      0,
      0,
      0,
      1,
    ]);
  },
  rotationZ: (radians: number, out?: MutableArray) => {
    const s = Math.sin(radians);
    const c = Math.cos(radians);
    return write(dst(16, out), [
      c,
      s,
      0,
      0,
      -s,
      c,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
    ]);
  },
  scale: (m: ArrayLike<number>, v: ArrayLike<number>, out?: MutableArray) =>
    mat4.multiply(m, mat4.scaling(v), out),
  scaling: (v: ArrayLike<number>, out?: MutableArray) =>
    write(dst(16, out), [
      v[0] ?? 0,
      0,
      0,
      0,
      0,
      v[1] ?? 0,
      0,
      0,
      0,
      0,
      v[2] ?? 0,
      0,
      0,
      0,
      0,
      1,
    ]),
  set: (
    v0 = 0,
    v1 = 0,
    v2 = 0,
    v3 = 0,
    v4 = 0,
    v5 = 0,
    v6 = 0,
    v7 = 0,
    v8 = 0,
    v9 = 0,
    v10 = 0,
    v11 = 0,
    v12 = 0,
    v13 = 0,
    v14 = 0,
    v15 = 0,
    out?: MutableArray,
  ) =>
    write(dst(16, out), [
      v0,
      v1,
      v2,
      v3,
      v4,
      v5,
      v6,
      v7,
      v8,
      v9,
      v10,
      v11,
      v12,
      v13,
      v14,
      v15,
    ]),
  setTranslation: (
    m: ArrayLike<number>,
    v: ArrayLike<number>,
    out?: MutableArray,
  ) => {
    const target = write(dst(16, out), m);
    target[12] = v[0] ?? 0;
    target[13] = v[1] ?? 0;
    target[14] = v[2] ?? 0;
    target[15] = 1;
    return target;
  },
  translate: (m: ArrayLike<number>, v: ArrayLike<number>, out?: MutableArray) =>
    mat4.multiply(m, mat4.translation(v), out),
  translation: (v: ArrayLike<number>, out?: MutableArray) =>
    write(dst(16, out), [
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      v[0] ?? 0,
      v[1] ?? 0,
      v[2] ?? 0,
      1,
    ]),
  transpose: (m: ArrayLike<number>, out?: MutableArray) =>
    transposePacked(m, 4, 4, out),
  uniformScale: (m: ArrayLike<number>, scale: number, out?: MutableArray) =>
    mat4.scale(m, [scale, scale, scale], out),
  uniformScaling: (scale: number, out?: MutableArray) =>
    mat4.scaling([scale, scale, scale], out),
};

export default {
  mat3,
  mat4,
  vec2,
  vec3,
  vec4,
};
