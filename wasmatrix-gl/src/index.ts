export type GLArray = Float32Array;
export type Vec2 = Float32Array;
export type Vec3 = Float32Array;
export type Vec4 = Float32Array;
export type Mat2 = Float32Array;
export type Mat3 = Float32Array;
export type Mat4 = Float32Array;

export const glMatrix = {
  EPSILON: 0.000001,
  ARRAY_TYPE: Float32Array,
  RANDOM: Math.random,
};

function create(length: number) {
  return new Float32Array(length);
}

function write(out: Float32Array, values: ArrayLike<number>) {
  for (let i = 0; i < out.length; i++) out[i] = values[i] ?? 0;
  return out;
}

function copyArray(out: Float32Array, a: ArrayLike<number>) {
  for (let i = 0; i < out.length; i++) out[i] = a[i] ?? 0;
  return out;
}

function multiplyMatrix(
  out: Float32Array,
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  size: number,
) {
  const left = out === a ? Float32Array.from(a) : a;
  const right = out === b ? Float32Array.from(b) : b;
  for (let col = 0; col < size; col++) {
    for (let row = 0; row < size; row++) {
      let total = 0;
      for (let k = 0; k < size; k++) {
        total += (left[k * size + row] ?? 0) *
          (right[col * size + k] ?? 0);
      }
      out[col * size + row] = total;
    }
  }
  return out;
}

function transformVector(
  out: Float32Array,
  a: ArrayLike<number>,
  m: ArrayLike<number>,
  matrixSize: number,
  inputLength: number,
  homogeneous: number | null,
  divideByW = false,
) {
  const x0 = a[0] ?? 0;
  let x1 = inputLength > 1 ? a[1] ?? 0 : 0;
  let x2 = inputLength > 2 ? a[2] ?? 0 : 0;
  let x3 = inputLength > 3 ? a[3] ?? 0 : 0;
  if (homogeneous != null) {
    if (matrixSize === 2) x1 = homogeneous;
    else if (matrixSize === 3) x2 = homogeneous;
    else x3 = homogeneous;
  }
  let r0 = 0;
  let r1 = 0;
  let r2 = 0;
  let r3 = 0;
  for (let col = 0; col < matrixSize; col++) {
    const x = col === 0 ? x0 : col === 1 ? x1 : col === 2 ? x2 : x3;
    const base = col * matrixSize;
    r0 += (m[base] ?? 0) * x;
    r1 += (m[base + 1] ?? 0) * x;
    if (matrixSize > 2) r2 += (m[base + 2] ?? 0) * x;
    if (matrixSize > 3) r3 += (m[base + 3] ?? 0) * x;
  }
  const wValue = matrixSize === 2 ? r1 : matrixSize === 3 ? r2 : r3;
  const w = divideByW ? wValue || 1 : 1;
  if (out.length > 0) out[0] = r0 / w;
  if (out.length > 1) out[1] = r1 / w;
  if (out.length > 2) out[2] = r2 / w;
  if (out.length > 3) out[3] = r3 / w;
  return out;
}

function vectorLength(a: ArrayLike<number>, size: number) {
  let sum = 0;
  for (let i = 0; i < size; i++) sum += (a[i] ?? 0) ** 2;
  return Math.sqrt(sum);
}

function normalizeVector(
  out: Float32Array,
  a: ArrayLike<number>,
  size: number,
) {
  const length = vectorLength(a, size);
  if (length === 0) {
    out.fill(0);
    return out;
  }
  for (let i = 0; i < size; i++) out[i] = (a[i] ?? 0) / length;
  return out;
}

function dotVector(a: ArrayLike<number>, b: ArrayLike<number>, size: number) {
  let sum = 0;
  for (let i = 0; i < size; i++) sum += (a[i] ?? 0) * (b[i] ?? 0);
  return sum;
}

function addVector(
  out: Float32Array,
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  size: number,
) {
  for (let i = 0; i < size; i++) out[i] = (a[i] ?? 0) + (b[i] ?? 0);
  return out;
}

function subtractVector(
  out: Float32Array,
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  size: number,
) {
  for (let i = 0; i < size; i++) out[i] = (a[i] ?? 0) - (b[i] ?? 0);
  return out;
}

function scaleVector(
  out: Float32Array,
  a: ArrayLike<number>,
  scalar: number,
  size: number,
) {
  for (let i = 0; i < size; i++) out[i] = (a[i] ?? 0) * scalar;
  return out;
}

function transposeMatrix(
  out: Float32Array,
  a: ArrayLike<number>,
  size: number,
) {
  const source = out === a ? Float32Array.from(a) : a;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      out[col * size + row] = source[row * size + col] ?? 0;
    }
  }
  return out;
}

export const vec2 = {
  create: () => create(2),
  clone: (a: ArrayLike<number>) => write(create(2), a),
  fromValues: (x: number, y: number) => write(create(2), [x, y]),
  copy: (out: Vec2, a: ArrayLike<number>) => copyArray(out, a),
  set: (out: Vec2, x: number, y: number) => write(out, [x, y]),
  zero: (out: Vec2) => write(out, [0, 0]),
  add: (out: Vec2, a: ArrayLike<number>, b: ArrayLike<number>) =>
    addVector(out, a, b, 2),
  subtract: (out: Vec2, a: ArrayLike<number>, b: ArrayLike<number>) =>
    subtractVector(out, a, b, 2),
  sub: (out: Vec2, a: ArrayLike<number>, b: ArrayLike<number>) =>
    subtractVector(out, a, b, 2),
  scale: (out: Vec2, a: ArrayLike<number>, scalar: number) =>
    scaleVector(out, a, scalar, 2),
  length: (a: ArrayLike<number>) => vectorLength(a, 2),
  len: (a: ArrayLike<number>) => vectorLength(a, 2),
  normalize: (out: Vec2, a: ArrayLike<number>) => normalizeVector(out, a, 2),
  dot: (a: ArrayLike<number>, b: ArrayLike<number>) => dotVector(a, b, 2),
  transformMat2: (out: Vec2, a: ArrayLike<number>, m: ArrayLike<number>) =>
    transformVector(out, a, m, 2, 2, null),
  transformMat3: (out: Vec2, a: ArrayLike<number>, m: ArrayLike<number>) =>
    transformVector(out, a, m, 3, 2, 1),
};

export const vec3 = {
  create: () => create(3),
  clone: (a: ArrayLike<number>) => write(create(3), a),
  fromValues: (x: number, y: number, z: number) => write(create(3), [x, y, z]),
  copy: (out: Vec3, a: ArrayLike<number>) => copyArray(out, a),
  set: (out: Vec3, x: number, y: number, z: number) => write(out, [x, y, z]),
  zero: (out: Vec3) => write(out, [0, 0, 0]),
  add: (out: Vec3, a: ArrayLike<number>, b: ArrayLike<number>) =>
    addVector(out, a, b, 3),
  subtract: (out: Vec3, a: ArrayLike<number>, b: ArrayLike<number>) =>
    subtractVector(out, a, b, 3),
  sub: (out: Vec3, a: ArrayLike<number>, b: ArrayLike<number>) =>
    subtractVector(out, a, b, 3),
  scale: (out: Vec3, a: ArrayLike<number>, scalar: number) =>
    scaleVector(out, a, scalar, 3),
  length: (a: ArrayLike<number>) => vectorLength(a, 3),
  len: (a: ArrayLike<number>) => vectorLength(a, 3),
  normalize: (out: Vec3, a: ArrayLike<number>) => normalizeVector(out, a, 3),
  dot: (a: ArrayLike<number>, b: ArrayLike<number>) => dotVector(a, b, 3),
  transformMat3: (out: Vec3, a: ArrayLike<number>, m: ArrayLike<number>) =>
    transformVector(out, a, m, 3, 3, null),
  transformMat4: (out: Vec3, a: ArrayLike<number>, m: ArrayLike<number>) =>
    transformVector(out, a, m, 4, 3, 1, true),
};

export const vec4 = {
  create: () => create(4),
  clone: (a: ArrayLike<number>) => write(create(4), a),
  fromValues: (x: number, y: number, z: number, w: number) =>
    write(create(4), [x, y, z, w]),
  copy: (out: Vec4, a: ArrayLike<number>) => copyArray(out, a),
  set: (out: Vec4, x: number, y: number, z: number, w: number) =>
    write(out, [x, y, z, w]),
  zero: (out: Vec4) => write(out, [0, 0, 0, 0]),
  add: (out: Vec4, a: ArrayLike<number>, b: ArrayLike<number>) =>
    addVector(out, a, b, 4),
  subtract: (out: Vec4, a: ArrayLike<number>, b: ArrayLike<number>) =>
    subtractVector(out, a, b, 4),
  sub: (out: Vec4, a: ArrayLike<number>, b: ArrayLike<number>) =>
    subtractVector(out, a, b, 4),
  scale: (out: Vec4, a: ArrayLike<number>, scalar: number) =>
    scaleVector(out, a, scalar, 4),
  length: (a: ArrayLike<number>) => vectorLength(a, 4),
  len: (a: ArrayLike<number>) => vectorLength(a, 4),
  normalize: (out: Vec4, a: ArrayLike<number>) => normalizeVector(out, a, 4),
  dot: (a: ArrayLike<number>, b: ArrayLike<number>) => dotVector(a, b, 4),
  transformMat4: (out: Vec4, a: ArrayLike<number>, m: ArrayLike<number>) =>
    transformVector(out, a, m, 4, 4, null),
};

export const mat2 = {
  create: () => write(create(4), [1, 0, 0, 1]),
  clone: (a: ArrayLike<number>) => write(create(4), a),
  fromValues: (m00: number, m01: number, m10: number, m11: number) =>
    write(create(4), [m00, m01, m10, m11]),
  copy: (out: Mat2, a: ArrayLike<number>) => copyArray(out, a),
  identity: (out: Mat2) => write(out, [1, 0, 0, 1]),
  transpose: (out: Mat2, a: ArrayLike<number>) => transposeMatrix(out, a, 2),
  multiply: (out: Mat2, a: ArrayLike<number>, b: ArrayLike<number>) =>
    multiplyMatrix(out, a, b, 2),
  mul: (out: Mat2, a: ArrayLike<number>, b: ArrayLike<number>) =>
    multiplyMatrix(out, a, b, 2),
  fromRotation: (out: Mat2, radians: number) => {
    const s = Math.sin(radians);
    const c = Math.cos(radians);
    return write(out, [c, s, -s, c]);
  },
  fromScaling: (out: Mat2, v: ArrayLike<number>) =>
    write(out, [v[0] ?? 0, 0, 0, v[1] ?? 0]),
};

export const mat3 = {
  create: () => write(create(9), [1, 0, 0, 0, 1, 0, 0, 0, 1]),
  clone: (a: ArrayLike<number>) => write(create(9), a),
  fromValues: (...values: number[]) => write(create(9), values),
  copy: (out: Mat3, a: ArrayLike<number>) => copyArray(out, a),
  identity: (out: Mat3) => write(out, [1, 0, 0, 0, 1, 0, 0, 0, 1]),
  transpose: (out: Mat3, a: ArrayLike<number>) => transposeMatrix(out, a, 3),
  multiply: (out: Mat3, a: ArrayLike<number>, b: ArrayLike<number>) =>
    multiplyMatrix(out, a, b, 3),
  mul: (out: Mat3, a: ArrayLike<number>, b: ArrayLike<number>) =>
    multiplyMatrix(out, a, b, 3),
  fromTranslation: (out: Mat3, v: ArrayLike<number>) =>
    write(out, [1, 0, 0, 0, 1, 0, v[0] ?? 0, v[1] ?? 0, 1]),
  fromScaling: (out: Mat3, v: ArrayLike<number>) =>
    write(out, [v[0] ?? 0, 0, 0, 0, v[1] ?? 0, 0, 0, 0, 1]),
  fromRotation: (out: Mat3, radians: number) => {
    const s = Math.sin(radians);
    const c = Math.cos(radians);
    return write(out, [c, s, 0, -s, c, 0, 0, 0, 1]);
  },
  translate: (out: Mat3, a: ArrayLike<number>, v: ArrayLike<number>) => {
    const transform = mat3.fromTranslation(create(9), v);
    return mat3.multiply(out, a, transform);
  },
  scale: (out: Mat3, a: ArrayLike<number>, v: ArrayLike<number>) => {
    const transform = mat3.fromScaling(create(9), v);
    return mat3.multiply(out, a, transform);
  },
  rotate: (out: Mat3, a: ArrayLike<number>, radians: number) => {
    const transform = mat3.fromRotation(create(9), radians);
    return mat3.multiply(out, a, transform);
  },
};

export const mat4 = {
  create: () =>
    write(create(16), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
  clone: (a: ArrayLike<number>) => write(create(16), a),
  fromValues: (...values: number[]) => write(create(16), values),
  copy: (out: Mat4, a: ArrayLike<number>) => copyArray(out, a),
  identity: (out: Mat4) =>
    write(out, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
  transpose: (out: Mat4, a: ArrayLike<number>) => transposeMatrix(out, a, 4),
  multiply: (out: Mat4, a: ArrayLike<number>, b: ArrayLike<number>) =>
    multiplyMatrix(out, a, b, 4),
  mul: (out: Mat4, a: ArrayLike<number>, b: ArrayLike<number>) =>
    multiplyMatrix(out, a, b, 4),
  fromTranslation: (out: Mat4, v: ArrayLike<number>) =>
    write(out, [
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
  fromScaling: (out: Mat4, v: ArrayLike<number>) =>
    write(out, [
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
  fromZRotation: (out: Mat4, radians: number) => {
    const s = Math.sin(radians);
    const c = Math.cos(radians);
    return write(out, [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  },
  translate: (out: Mat4, a: ArrayLike<number>, v: ArrayLike<number>) => {
    const transform = mat4.fromTranslation(create(16), v);
    return mat4.multiply(out, a, transform);
  },
  scale: (out: Mat4, a: ArrayLike<number>, v: ArrayLike<number>) => {
    const transform = mat4.fromScaling(create(16), v);
    return mat4.multiply(out, a, transform);
  },
  rotateZ: (out: Mat4, a: ArrayLike<number>, radians: number) => {
    const transform = mat4.fromZRotation(create(16), radians);
    return mat4.multiply(out, a, transform);
  },
};

export default {
  glMatrix,
  mat2,
  mat3,
  mat4,
  vec2,
  vec3,
  vec4,
};
