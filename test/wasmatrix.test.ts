import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import Matrix, {
  configure,
  isSimdSupported,
  SIMD_REQUIRED,
} from "../dist/index.js";

function assertArrayAlmostEqual(actual, expected, epsilon = 1e-5) {
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < actual.length; i++) {
    assert.ok(
      Math.abs(actual[i] - expected[i]) <= epsilon,
      `index ${i}: expected ${expected[i]}, got ${actual[i]}`,
    );
  }
}

async function createCoreExports() {
  const bytes = readFileSync(new URL("../build/wasmatrix.wasm", import.meta.url));
  const { instance } = await WebAssembly.instantiate(bytes, {
    env: {
      abort(_message, _file, line, column) {
        throw new Error(`wasmatrix wasm abort at ${line}:${column}`);
      },
    },
  });
  return instance.exports;
}

function writeF32(exports, values) {
  const ptr = exports.allocF32(values.length);
  new Float32Array(exports.memory.buffer, ptr, values.length).set(values);
  return ptr;
}

function readF32(exports, ptr, length) {
  return Array.from(new Float32Array(exports.memory.buffer, ptr, length));
}

function readF64(exports, ptr, length) {
  return Array.from(new Float64Array(exports.memory.buffer, ptr, length));
}

function writeI32(exports, values) {
  const ptr = exports.allocI32(values.length);
  new Int32Array(exports.memory.buffer, ptr, values.length).set(values);
  return ptr;
}

function readI32(exports, ptr, length) {
  return Array.from(new Int32Array(exports.memory.buffer, ptr, length));
}

const f32BitsBuffer = new ArrayBuffer(4);
const f32BitsView = new Float32Array(f32BitsBuffer);
const i32BitsView = new Int32Array(f32BitsBuffer);

function f32Bits(value) {
  f32BitsView[0] = Math.fround(value);
  return i32BitsView[0];
}

test("requires a SIMD-capable wasm build", () => {
  assert.equal(SIMD_REQUIRED, true);
  assert.equal(isSimdSupported(), true);

  const wat = readFileSync(
    new URL("../build/wasmatrix.wat", import.meta.url),
    "utf8",
  );
  assert.match(wat, /f32x4\.(add|mul|div|sqrt)/);
  assert.match(wat, /v128\.load/);
  assert.match(wat, /\(export "executeBatch"/);
  assert.match(wat, /\(export "normalizeBatchPlan"/);
  assert.match(wat, /\(export "moments"/);
  assert.match(wat, /\(export "affineMatmulPostprocess"/);
  assert.match(wat, /\(export "batchOpcodeMatmul"/);
  assert.match(wat, /\(export "batchOpcodeOuter"/);
});

test("exposes algebraic core kernels for affine and rank-one schemes", async () => {
  const core = await createCoreExports();
  assert.equal(core.abiVersion(), 9);

  const a = writeF32(core, [1, 2, 3, 4, 5, 6]);
  const b = writeF32(core, [7, 8, 9, 10, 11, 12]);
  const product = core.allocF32(4);
  const row = core.allocF32(2);
  const col = core.allocF32(2);
  const out = core.allocF32(4);
  const stats = core.allocF64(4);
  const short = writeF32(core, [5, -2, 3]);
  const shortStats = core.allocF64(4);

  core.matmul(a, b, product, 2, 3, 2);
  core.rowSums(a, row, 2, 3);
  core.colSums(b, col, 3, 2);
  core.affineMatmulPostprocess(product, row, col, out, 2, 3, 2, 2, 1, 3, -2);
  core.moments(a, stats, 6);
  core.moments(short, shortStats, 3);

  assertArrayAlmostEqual(readF32(core, row, 2), [6, 15]);
  assertArrayAlmostEqual(readF32(core, col, 2), [27, 30]);
  assertArrayAlmostEqual(readF32(core, out, 4), [399, 444, 849, 948]);
  assertArrayAlmostEqual(readF64(core, stats, 4), [21, 91, 1, 6]);
  assertArrayAlmostEqual(readF64(core, shortStats, 4), [6, 38, -2, 5]);
});

test("applies rank-one determinant and solve updates in the core", async () => {
  const core = await createCoreExports();
  const solvedU = writeF32(core, [0.1, 0.6]);
  const v = writeF32(core, [3, -1]);
  const baseSolution = writeF32(core, [0.8, 1.8]);
  const out = core.allocF32(2);

  assert.ok(Math.abs(core.detRankOneUpdate(10, solvedU, v, 2) - 7) < 1e-6);
  assert.equal(core.solveRankOneUpdate(baseSolution, solvedU, v, out, 2, 1), 1);
  assertArrayAlmostEqual(readF32(core, out, 2), [5 / 7, 9 / 7], 1e-5);
});

test("normalizes raw batch plans inside the algebraic core", async () => {
  const core = await createCoreExports();
  const a = writeF32(core, [1, 2, 3, 4]);
  const b = writeF32(core, [5, 6, 7, 8]);
  const product = core.allocF32(4);
  const stats = core.allocF64(4);
  const plan = core.allocI32(2);
  const slots = core.batchInstructionI32Slots();

  const instructions = new Int32Array(slots * 2);
  instructions.set([core.batchOpcodeMatmul(), a, b, product, 2, 2, 2, 0], 0);
  instructions.set([core.batchOpcodeMoments(), a, stats, 4, 0, 0, 0, 0], slots);
  const ptr = writeI32(core, instructions);

  assert.equal(core.normalizeBatchPlan(ptr, 2, plan), 2);
  assert.deepEqual(readI32(core, plan, 2), [1, 0]);
  assert.equal(core.executeBatch(ptr, 2), 1);
  assertArrayAlmostEqual(readF64(core, stats, 4), [10, 30, 1, 4]);
  assertArrayAlmostEqual(readF32(core, product, 4), [19, 22, 43, 50]);
});

test("executes structural matrix constructors through raw batch", async () => {
  const core = await createCoreExports();
  const vector = writeF32(core, [2, 4]);
  const left = writeF32(core, [1, 2]);
  const right = writeF32(core, [3, 4]);
  const diagonal = core.allocF32(4);
  const inverse = core.allocF32(4);
  const outer = core.allocF32(4);
  const affine = core.allocF32(4);
  const slots = core.batchInstructionI32Slots();
  const instructions = new Int32Array(slots * 4);

  instructions.set([core.batchOpcodeDiagonalMatrix(), vector, diagonal, 2, 0, 0, 0, 0], 0);
  instructions.set([core.batchOpcodeInvertDiagonal(), diagonal, inverse, 2, 0, 0, 0, 0], slots);
  instructions.set([core.batchOpcodeOuter(), left, right, outer, 2, 2, 0, 0], slots * 2);
  instructions.set([core.batchOpcodeAffine(), outer, affine, 4, f32Bits(2), f32Bits(1), 0, 0], slots * 3);

  assert.equal(core.executeBatch(writeI32(core, instructions), 4), 1);
  assertArrayAlmostEqual(readF32(core, inverse, 4), [0.5, 0, 0, 0.25]);
  assertArrayAlmostEqual(readF32(core, outer, 4), [3, 4, 6, 8]);
  assertArrayAlmostEqual(readF32(core, affine, 4), [7, 9, 13, 17]);
});

test("constructs matrices and exposes row-major data", () => {
  const matrix = Matrix.from(2, 3, [1, 2, 3, 4, 5, 6]);

  assert.deepEqual(matrix.shape, [2, 3]);
  assert.equal(Number.isInteger(matrix.byteOffset), true);
  assert.equal(matrix.at(1, 2), 6);
  assertArrayAlmostEqual(matrix.row(1), [4, 5, 6]);
  assertArrayAlmostEqual(matrix.column(1), [2, 5]);

  matrix.set(0, 1, 8);
  assert.equal(matrix.at(0, 1), 8);
});

test("keeps matrix results in WASM until explicit readback", () => {
  const a = Matrix.from(2, 2, [1, 2, 3, 4]);
  const result = a.add(Matrix.ones(2, 2)).scale(3).transpose();

  assert.deepEqual(result.toArray(), [
    [6, 12],
    [9, 15],
  ]);

  const snapshot = result.data;
  snapshot[0] = 999;
  assert.equal(result.at(0, 0), 6);

  result.dispose();
  assert.throws(() => result.at(0, 0), /disposed/);
});

test("does not cross the WASM boundary for matrix-returning operations", () => {
  const key = Symbol.for("wasmatrix.wasmCallListeners");
  const previous = globalThis[key];
  const calls = [];
  globalThis[key] = new Set([(name) => calls.push(name)]);

  try {
    const diagonal = Matrix.diagonal([2, 3]);
    const inverse = diagonal.inverse();
    const outer = Matrix.outer([1, 2], [3, 4]);
    const chain = Matrix.matmulChain(
      Matrix.from(2, 2, [1, 0, 0, 1]),
      outer,
      inverse,
    );
    const leastSquares = Matrix.from(3, 2, [1, 0, 0, 1, 1, 1]).leastSquares([1, 2, 3]);

    assert.deepEqual(leastSquares.shape, [2, 1]);
    assert.deepEqual(calls, []);
    assertArrayAlmostEqual(chain.toFlatArray(), [1.5, 4 / 3, 3, 8 / 3]);
    assert.deepEqual(calls, ["allocF32", "executeBatch"]);
  } finally {
    if (previous === undefined) {
      delete globalThis[key];
    } else {
      globalThis[key] = previous;
    }
  }
});

test("uses the minimum WASM boundary calls for the getting started workflow", () => {
  const key = Symbol.for("wasmatrix.wasmCallListeners");
  const previous = globalThis[key];
  const calls = [];
  globalThis[key] = new Set([(name) => calls.push(name)]);

  try {
    const A = Matrix.from(2, 2, [4, 7, 2, 6]);
    const b = Matrix.from(2, 1, [1, 0]);
    const x = A.solve(b);
    const check = A.matmul(x);

    assert.deepEqual(calls, []);
    assert.ok(Math.abs(A.determinant() - 10) < 1e-6);
    assert.deepEqual(calls, ["allocF32", "determinant"]);

    assertArrayAlmostEqual(x.toFlatArray(), [0.6, -0.2], 1e-5);
    assert.deepEqual(calls, [
      "allocF32",
      "determinant",
      "allocF32",
      "executeBatch",
    ]);

    assertArrayAlmostEqual(check.toFlatArray(), [1, 0], 1e-5);
    assert.deepEqual(calls, [
      "allocF32",
      "determinant",
      "allocF32",
      "executeBatch",
      "allocF32",
      "executeBatch",
    ]);

    assert.equal(check.equalsApprox(b), true);
    assert.deepEqual(calls, [
      "allocF32",
      "determinant",
      "allocF32",
      "executeBatch",
      "allocF32",
      "executeBatch",
    ]);
  } finally {
    if (previous === undefined) {
      delete globalThis[key];
    } else {
      globalThis[key] = previous;
    }
  }
});

test("runs SIMD elementwise and scalar operations", () => {
  const a = Matrix.from(2, 4, [1, -2, 3, -4, 5, -6, 7, -8]);
  const b = Matrix.ones(2, 4).scale(2);

  assertArrayAlmostEqual(a.add(b).toFlatArray(), [3, 0, 5, -2, 7, -4, 9, -6]);
  assertArrayAlmostEqual(a.subtract(1).toFlatArray(), [
    0,
    -3,
    2,
    -5,
    4,
    -7,
    6,
    -9,
  ]);
  assertArrayAlmostEqual(a.hadamard(b).toFlatArray(), [
    2,
    -4,
    6,
    -8,
    10,
    -12,
    14,
    -16,
  ]);
  assertArrayAlmostEqual(a.divide(b).toFlatArray(), [
    0.5,
    -1,
    1.5,
    -2,
    2.5,
    -3,
    3.5,
    -4,
  ]);
  assertArrayAlmostEqual(a.abs().sqrt().toFlatArray(), [
    1,
    Math.sqrt(2),
    Math.sqrt(3),
    2,
    Math.sqrt(5),
    Math.sqrt(6),
    Math.sqrt(7),
    Math.sqrt(8),
  ]);
  assertArrayAlmostEqual(a.clamp(-3, 4).toFlatArray(), [
    1,
    -2,
    3,
    -3,
    4,
    -3,
    4,
    -3,
  ]);
});

test("supports transpose, matrix multiplication, vector multiplication and outer products", () => {
  const a = Matrix.from(2, 3, [1, 2, 3, 4, 5, 6]);
  const b = Matrix.from(3, 2, [7, 8, 9, 10, 11, 12]);

  assert.deepEqual(a.transpose().toArray(), [
    [1, 4],
    [2, 5],
    [3, 6],
  ]);
  assert.deepEqual(a.matmul(b).toArray(), [
    [58, 64],
    [139, 154],
  ]);
  assertArrayAlmostEqual(a.matvec([1, 0, -1]), [-2, -2]);
  assert.deepEqual(Matrix.outer([2, 3], [4, 5, 6]).toArray(), [
    [8, 10, 12],
    [12, 15, 18],
  ]);
  assert.ok(a.transpose().transpose().equalsApprox(a));
});

test("computes reductions and structural operations", () => {
  const matrix = Matrix.from(3, 3, [2, -1, 0, 4, 3, 1, -2, 5, 6]);

  assert.equal(matrix.sum(), 18);
  assert.equal(matrix.minValue(), -2);
  assert.equal(matrix.maxValue(), 6);
  assert.equal(matrix.trace(), 11);
  assert.ok(Math.abs(matrix.frobeniusNorm() - Math.sqrt(96)) < 1e-5);
  assertArrayAlmostEqual(matrix.diagonal(), [2, 3, 6]);
  assert.deepEqual(matrix.reshape(1, 9).shape, [1, 9]);
});

test("supports determinant, inverse, solve and rank", () => {
  const a = Matrix.from(2, 2, [4, 7, 2, 6]);

  assert.ok(Math.abs(a.determinant() - 10) < 1e-6);
  assertArrayAlmostEqual(
    a.inverse().toFlatArray(),
    [0.6, -0.7, -0.2, 0.4],
    1e-5,
  );
  assert.ok(a.matmul(a.inverse()).equalsApprox(Matrix.identity(2), 1e-5));

  const solution = a.solve([1, 0]);
  assertArrayAlmostEqual(solution.toFlatArray(), [0.6, -0.2], 1e-5);

  const dependent = Matrix.from(3, 3, [1, 2, 3, 2, 4, 6, 1, 1, 1]);
  assert.equal(dependent.rank(), 2);
});

test("reuses and invalidates LU-backed linear algebra paths", () => {
  const a = Matrix.from(3, 3, [3, 1, 2, 0, 4, -1, 2, 0, 5]);
  const rhs = Matrix.from(3, 2, [1, 2, 3, 4, 5, 6]);

  assert.ok(Math.abs(a.determinant() - 42) < 1e-5);
  assert.ok(a.matmul(a.inverse()).equalsApprox(Matrix.identity(3), 1e-5));
  assert.ok(a.matmul(a.solve(rhs)).equalsApprox(rhs, 1e-5));

  const mutable = Matrix.from(2, 2, [1, 2, 3, 4]);
  assert.ok(Math.abs(mutable.determinant() + 2) < 1e-6);
  mutable.set(0, 0, 2);
  assert.ok(Math.abs(mutable.determinant() - 2) < 1e-6);
  assert.ok(
    mutable.matmul(mutable.inverse()).equalsApprox(Matrix.identity(2), 1e-5),
  );
});

test("specializes diagonal matrix operations", () => {
  const d = Matrix.diagonal([2, 3, 4]);
  const right = Matrix.from(3, 2, [1, 2, 3, 4, 5, 6]);
  const left = Matrix.from(2, 3, [1, 2, 3, 4, 5, 6]);

  assert.deepEqual(d.matmul(right).toArray(), [
    [2, 4],
    [9, 12],
    [20, 24],
  ]);
  assert.deepEqual(left.matmul(d).toArray(), [
    [2, 6, 12],
    [8, 15, 24],
  ]);
  assert.equal(d.determinant(), 24);
  assertArrayAlmostEqual(d.inverse().diagonal(), [0.5, 1 / 3, 0.25], 1e-6);
  assertArrayAlmostEqual(d.solve([4, 9, 8]).toFlatArray(), [2, 3, 2], 1e-6);
  assert.deepEqual(d.scale(2).matmul(right).toArray(), [
    [4, 8],
    [18, 24],
    [40, 48],
  ]);
});

test("applies algebraic rewrites for affine chains and inverse matmul", () => {
  const a = Matrix.from(2, 2, [4, 7, 2, 6]);
  const b = Matrix.from(2, 2, [1, 2, 3, 4]);

  assertArrayAlmostEqual(
    b.scale(2).scale(3).addScalar(1).subtract(0.5).divide(2).toFlatArray(),
    [3.25, 6.25, 9.25, 12.25],
  );

  assert.ok(a.inverse().matmul(b).equalsApprox(a.solve(b), 1e-5));

  configure({ fastMath: true });
  try {
    assert.deepEqual(
      a.matmul(a.inverse()).toArray(),
      Matrix.identity(2).toArray(),
    );
  } finally {
    configure({ fastMath: false });
  }
});

test("fuses elementwise DAGs and broadcasts row and column vectors", () => {
  const a = Matrix.from(2, 3, [1, 2, 3, 4, 5, 6]);
  const b = Matrix.from(2, 3, [0.5, 1, 1.5, 2, 2.5, 3]);
  const c = Matrix.from(2, 3, [1, 0.5, 2, 0.25, 1.5, 0.75]);

  assertArrayAlmostEqual(
    a.add(b).subtract(0.25).hadamard(c).clamp(0, 8).sqrt().toFlatArray(),
    [
      Math.sqrt(1.25),
      Math.sqrt(1.375),
      Math.sqrt(8),
      Math.sqrt(1.4375),
      Math.sqrt(8),
      Math.sqrt(6.5625),
    ],
  );

  assert.deepEqual(a.add(Matrix.from(1, 3, [10, 20, 30])).toArray(), [
    [11, 22, 33],
    [14, 25, 36],
  ]);
  assert.deepEqual(a.add(Matrix.from(2, 1, [10, 20])).toArray(), [
    [11, 12, 13],
    [24, 25, 26],
  ]);
  assert.deepEqual(a.multiply(Matrix.from(1, 3, [2, 3, 4])).toArray(), [
    [2, 6, 12],
    [8, 15, 24],
  ]);
});

test("rewrites lazy matmul expressions and selects transpose-aware kernels", () => {
  const a = Matrix.from(
    32,
    16,
    Array.from({ length: 32 * 16 }, (_, i) => ((i % 17) - 8) / 10),
  );
  const b = Matrix.from(
    16,
    24,
    Array.from({ length: 16 * 24 }, (_, i) => ((i % 13) - 6) / 10),
  );
  const c = Matrix.from(
    16,
    24,
    Array.from({ length: 16 * 24 }, (_, i) => ((i % 11) - 5) / 10),
  );

  assert.ok(
    a.matmul(b).add(a.matmul(c)).equalsApprox(a.matmul(b.add(c)), 1e-4),
  );
  assert.ok(
    a.matmul(b).add(a.matmul(b)).equalsApprox(a.matmul(b).scale(2), 1e-4),
  );

  const x = Matrix.from(3, 2, [1, 2, 3, 4, 5, 6]);
  const y = Matrix.from(3, 2, [7, 8, 9, 10, 11, 12]);
  assert.deepEqual(x.transpose().matmul(y).toArray(), [
    [89, 98],
    [116, 128],
  ]);
  assert.deepEqual(x.matmul(y.transpose()).toArray(), [
    [23, 29, 35],
    [53, 67, 81],
    [83, 105, 127],
  ]);
  assert.equal(x.matmul(y.transpose()).trace(), 217);
});

test("applies scalar matmul reassociation, right inverse solve and determinant algebra", () => {
  const a = Matrix.from(2, 2, [4, 7, 2, 6]);
  const b = Matrix.from(2, 2, [1, 2, 3, 4]);

  assert.ok(a.scale(3).matmul(b).equalsApprox(a.matmul(b).scale(3), 1e-5));
  assert.ok(
    b.matmul(a.inverse()).equalsApprox(
      a.transpose().solve(b.transpose()).transpose(),
      1e-5,
    ),
  );

  configure({ fastMath: true });
  try {
    assert.ok(
      Math.abs(a.matmul(b).determinant() - a.determinant() * b.determinant()) <
        1e-4,
    );
  } finally {
    configure({ fastMath: false });
  }
});

test("caches Cholesky, QR, reductions and transpose materialization with invalidation", () => {
  const design = Matrix.from(3, 2, [1, 0, 0, 1, 1, 1]);
  const gram = design.transpose().matmul(design);

  assert.deepEqual(gram.toArray(), [
    [2, 1],
    [1, 2],
  ]);
  assert.ok(Math.abs(gram.determinant() - 3) < 1e-5);
  assert.ok(Math.abs(gram.logDet() - Math.log(3)) < 1e-5);
  assert.ok(
    gram.matmul(gram.solve(Matrix.identity(2))).equalsApprox(
      Matrix.identity(2),
      1e-5,
    ),
  );
  assert.ok(gram.inverse().matmul(gram).equalsApprox(Matrix.identity(2), 1e-5));

  assert.equal(design.rank(), 2);
  assert.equal(design.rank(), 2);
  assertArrayAlmostEqual(
    design.leastSquares([1, 2, 3]).toFlatArray(),
    [1, 2],
    1e-5,
  );

  const mutable = Matrix.from(2, 2, [1, 2, 3, 4]);
  assert.equal(mutable.sum(), 10);
  assert.equal(mutable.sum(), 10);
  assert.deepEqual(mutable.transpose().toArray(), [
    [1, 3],
    [2, 4],
  ]);
  mutable.set(0, 0, 10);
  assert.equal(mutable.sum(), 19);
  assert.deepEqual(mutable.transpose().toArray(), [
    [10, 3],
    [2, 4],
  ]);
});

test("optimizes matrix chain multiplication order", () => {
  const a = Matrix.from(
    64,
    8,
    Array.from({ length: 64 * 8 }, (_, i) => ((i % 17) - 8) / 10),
  );
  const b = Matrix.from(
    8,
    64,
    Array.from({ length: 8 * 64 }, (_, i) => ((i % 13) - 6) / 10),
  );
  const c = Matrix.from(
    64,
    8,
    Array.from({ length: 64 * 8 }, (_, i) => ((i % 11) - 5) / 10),
  );

  const ordered = Matrix.matmulChain(a, b, c);
  const leftAssociated = a.matmul(b).matmul(c);

  assert.ok(ordered.equalsApprox(leftAssociated, 1e-4));
  assert.deepEqual(ordered.shape, [64, 8]);
});
