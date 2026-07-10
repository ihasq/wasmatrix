import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import Matrix, { SIMD_REQUIRED, configure, isSimdSupported } from "../dist/index.js";

function assertArrayAlmostEqual(actual, expected, epsilon = 1e-5) {
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < actual.length; i++) {
    assert.ok(
      Math.abs(actual[i] - expected[i]) <= epsilon,
      `index ${i}: expected ${expected[i]}, got ${actual[i]}`
    );
  }
}

test("requires a SIMD-capable wasm build", () => {
  assert.equal(SIMD_REQUIRED, true);
  assert.equal(isSimdSupported(), true);

  const wat = readFileSync(new URL("../build/wasmatrix.wat", import.meta.url), "utf8");
  assert.match(wat, /f32x4\.(add|mul|div|sqrt)/);
  assert.match(wat, /v128\.load/);
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
    [9, 15]
  ]);

  const snapshot = result.data;
  snapshot[0] = 999;
  assert.equal(result.at(0, 0), 6);

  result.dispose();
  assert.throws(() => result.at(0, 0), /disposed/);
});

test("runs SIMD elementwise and scalar operations", () => {
  const a = Matrix.from(2, 4, [1, -2, 3, -4, 5, -6, 7, -8]);
  const b = Matrix.ones(2, 4).scale(2);

  assertArrayAlmostEqual(a.add(b).toFlatArray(), [3, 0, 5, -2, 7, -4, 9, -6]);
  assertArrayAlmostEqual(a.subtract(1).toFlatArray(), [0, -3, 2, -5, 4, -7, 6, -9]);
  assertArrayAlmostEqual(a.hadamard(b).toFlatArray(), [2, -4, 6, -8, 10, -12, 14, -16]);
  assertArrayAlmostEqual(a.divide(b).toFlatArray(), [0.5, -1, 1.5, -2, 2.5, -3, 3.5, -4]);
  assertArrayAlmostEqual(a.abs().sqrt().toFlatArray(), [
    1,
    Math.sqrt(2),
    Math.sqrt(3),
    2,
    Math.sqrt(5),
    Math.sqrt(6),
    Math.sqrt(7),
    Math.sqrt(8)
  ]);
  assertArrayAlmostEqual(a.clamp(-3, 4).toFlatArray(), [1, -2, 3, -3, 4, -3, 4, -3]);
});

test("supports transpose, matrix multiplication, vector multiplication and outer products", () => {
  const a = Matrix.from(2, 3, [1, 2, 3, 4, 5, 6]);
  const b = Matrix.from(3, 2, [7, 8, 9, 10, 11, 12]);

  assert.deepEqual(a.transpose().toArray(), [
    [1, 4],
    [2, 5],
    [3, 6]
  ]);
  assert.deepEqual(a.matmul(b).toArray(), [
    [58, 64],
    [139, 154]
  ]);
  assertArrayAlmostEqual(a.matvec([1, 0, -1]), [-2, -2]);
  assert.deepEqual(Matrix.outer([2, 3], [4, 5, 6]).toArray(), [
    [8, 10, 12],
    [12, 15, 18]
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
  assertArrayAlmostEqual(a.inverse().toFlatArray(), [0.6, -0.7, -0.2, 0.4], 1e-5);
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
  assert.ok(mutable.matmul(mutable.inverse()).equalsApprox(Matrix.identity(2), 1e-5));
});

test("specializes diagonal matrix operations", () => {
  const d = Matrix.diagonal([2, 3, 4]);
  const right = Matrix.from(3, 2, [1, 2, 3, 4, 5, 6]);
  const left = Matrix.from(2, 3, [1, 2, 3, 4, 5, 6]);

  assert.deepEqual(d.matmul(right).toArray(), [
    [2, 4],
    [9, 12],
    [20, 24]
  ]);
  assert.deepEqual(left.matmul(d).toArray(), [
    [2, 6, 12],
    [8, 15, 24]
  ]);
  assert.equal(d.determinant(), 24);
  assertArrayAlmostEqual(d.inverse().diagonal(), [0.5, 1 / 3, 0.25], 1e-6);
  assertArrayAlmostEqual(d.solve([4, 9, 8]).toFlatArray(), [2, 3, 2], 1e-6);
  assert.deepEqual(d.scale(2).matmul(right).toArray(), [
    [4, 8],
    [18, 24],
    [40, 48]
  ]);
});

test("applies algebraic rewrites for affine chains and inverse matmul", () => {
  const a = Matrix.from(2, 2, [4, 7, 2, 6]);
  const b = Matrix.from(2, 2, [1, 2, 3, 4]);

  assertArrayAlmostEqual(
    b.scale(2).scale(3).addScalar(1).subtract(0.5).divide(2).toFlatArray(),
    [3.25, 6.25, 9.25, 12.25]
  );

  assert.ok(a.inverse().matmul(b).equalsApprox(a.solve(b), 1e-5));

  configure({ fastMath: true });
  try {
    assert.deepEqual(a.matmul(a.inverse()).toArray(), Matrix.identity(2).toArray());
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
    [Math.sqrt(1.25), Math.sqrt(1.375), Math.sqrt(8), Math.sqrt(1.4375), Math.sqrt(8), Math.sqrt(6.5625)]
  );

  assert.deepEqual(a.add(Matrix.from(1, 3, [10, 20, 30])).toArray(), [
    [11, 22, 33],
    [14, 25, 36]
  ]);
  assert.deepEqual(a.add(Matrix.from(2, 1, [10, 20])).toArray(), [
    [11, 12, 13],
    [24, 25, 26]
  ]);
  assert.deepEqual(a.multiply(Matrix.from(1, 3, [2, 3, 4])).toArray(), [
    [2, 6, 12],
    [8, 15, 24]
  ]);
});

test("rewrites lazy matmul expressions and selects transpose-aware kernels", () => {
  const a = Matrix.from(32, 16, Array.from({ length: 32 * 16 }, (_, i) => ((i % 17) - 8) / 10));
  const b = Matrix.from(16, 24, Array.from({ length: 16 * 24 }, (_, i) => ((i % 13) - 6) / 10));
  const c = Matrix.from(16, 24, Array.from({ length: 16 * 24 }, (_, i) => ((i % 11) - 5) / 10));

  assert.ok(a.matmul(b).add(a.matmul(c)).equalsApprox(a.matmul(b.add(c)), 1e-4));
  assert.ok(a.matmul(b).add(a.matmul(b)).equalsApprox(a.matmul(b).scale(2), 1e-4));

  const x = Matrix.from(3, 2, [1, 2, 3, 4, 5, 6]);
  const y = Matrix.from(3, 2, [7, 8, 9, 10, 11, 12]);
  assert.deepEqual(x.transpose().matmul(y).toArray(), [
    [89, 98],
    [116, 128]
  ]);
  assert.deepEqual(x.matmul(y.transpose()).toArray(), [
    [23, 29, 35],
    [53, 67, 81],
    [83, 105, 127]
  ]);
  assert.equal(x.matmul(y.transpose()).trace(), 217);
});

test("applies scalar matmul reassociation, right inverse solve and determinant algebra", () => {
  const a = Matrix.from(2, 2, [4, 7, 2, 6]);
  const b = Matrix.from(2, 2, [1, 2, 3, 4]);

  assert.ok(a.scale(3).matmul(b).equalsApprox(a.matmul(b).scale(3), 1e-5));
  assert.ok(b.matmul(a.inverse()).equalsApprox(a.transpose().solve(b.transpose()).transpose(), 1e-5));

  configure({ fastMath: true });
  try {
    assert.ok(Math.abs(a.matmul(b).determinant() - a.determinant() * b.determinant()) < 1e-4);
  } finally {
    configure({ fastMath: false });
  }
});

test("caches Cholesky, QR, reductions and transpose materialization with invalidation", () => {
  const design = Matrix.from(3, 2, [1, 0, 0, 1, 1, 1]);
  const gram = design.transpose().matmul(design);

  assert.deepEqual(gram.toArray(), [
    [2, 1],
    [1, 2]
  ]);
  assert.ok(Math.abs(gram.determinant() - 3) < 1e-5);
  assert.ok(Math.abs(gram.logDet() - Math.log(3)) < 1e-5);
  assert.ok(gram.matmul(gram.solve(Matrix.identity(2))).equalsApprox(Matrix.identity(2), 1e-5));
  assert.ok(gram.inverse().matmul(gram).equalsApprox(Matrix.identity(2), 1e-5));

  assert.equal(design.rank(), 2);
  assert.equal(design.rank(), 2);
  assertArrayAlmostEqual(design.leastSquares([1, 2, 3]).toFlatArray(), [1, 2], 1e-5);

  const mutable = Matrix.from(2, 2, [1, 2, 3, 4]);
  assert.equal(mutable.sum(), 10);
  assert.equal(mutable.sum(), 10);
  assert.deepEqual(mutable.transpose().toArray(), [
    [1, 3],
    [2, 4]
  ]);
  mutable.set(0, 0, 10);
  assert.equal(mutable.sum(), 19);
  assert.deepEqual(mutable.transpose().toArray(), [
    [10, 3],
    [2, 4]
  ]);
});

test("optimizes matrix chain multiplication order", () => {
  const a = Matrix.from(64, 8, Array.from({ length: 64 * 8 }, (_, i) => ((i % 17) - 8) / 10));
  const b = Matrix.from(8, 64, Array.from({ length: 8 * 64 }, (_, i) => ((i % 13) - 6) / 10));
  const c = Matrix.from(64, 8, Array.from({ length: 64 * 8 }, (_, i) => ((i % 11) - 5) / 10));

  const ordered = Matrix.matmulChain(a, b, c);
  const leftAssociated = a.matmul(b).matmul(c);

  assert.ok(ordered.equalsApprox(leftAssociated, 1e-4));
  assert.deepEqual(ordered.shape, [64, 8]);
});
