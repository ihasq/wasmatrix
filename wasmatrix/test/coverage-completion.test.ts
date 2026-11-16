import assert from "node:assert/strict";
import test from "node:test";
import Matrix, { configure } from "../dist/index.js";

function almostEqual(actual: number, expected: number, epsilon = 1e-5) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${expected}, got ${actual}`,
  );
}

function dense(rows: number, cols: number, offset = 0) {
  return Matrix.from(
    rows,
    cols,
    Array.from(
      { length: rows * cols },
      (_, index) => ((index + offset) % 11) - 5,
    ),
  );
}

test("coverage completion: lazy structures and scalar normalization", () => {
  assert.deepEqual(new Matrix(2, 2).toArray(), [[0, 0], [0, 0]]);

  const source = Matrix.from(2, 2, [1, -2, 3, -4]);
  assert.deepEqual(source.clone().toArray(), source.toArray());
  assert.deepEqual(Matrix.ones(2, 3).clone().toArray(), [
    [1, 1, 1],
    [1, 1, 1],
  ]);
  assert.deepEqual(Matrix.identity(2).clone().toArray(), [[1, 0], [0, 1]]);

  assert.deepEqual(Matrix.identity(2).matmul(Matrix.ones(2, 3)).toArray(), [
    [1, 1, 1],
    [1, 1, 1],
  ]);
  assert.deepEqual(Matrix.diagonal([-2, 3]).abs().toArray(), [[2, 0], [0, 3]]);
  assert.deepEqual(Matrix.diagonal([1, 2]).negate().negate().toArray(), [
    [1, 0],
    [0, 2],
  ]);

  const affine = source.scale(2).addScalar(1).transpose().scale(3).addScalar(4);
  assert.deepEqual(affine.toArray(), [[13, 25], [-5, -17]]);
  assert.deepEqual(source.negate().negate().toArray(), source.toArray());

  assert.deepEqual(Matrix.ones(2, 2).add(Matrix.ones(2, 2)).toArray(), [
    [2, 2],
    [2, 2],
  ]);
  assert.deepEqual(Matrix.ones(2, 2).subtract(Matrix.ones(2, 2)).toArray(), [
    [0, 0],
    [0, 0],
  ]);
  assert.deepEqual(Matrix.ones(2, 2).multiply(Matrix.ones(2, 2)).toArray(), [
    [1, 1],
    [1, 1],
  ]);
  assert.deepEqual(Matrix.ones(2, 2).divide(Matrix.ones(2, 2)).toArray(), [
    [1, 1],
    [1, 1],
  ]);
  assert.deepEqual(Matrix.ones(2, 2).min(Matrix.zeros(2, 2)).toArray(), [
    [0, 0],
    [0, 0],
  ]);
  assert.deepEqual(Matrix.ones(2, 2).max(Matrix.zeros(2, 2)).toArray(), [
    [1, 1],
    [1, 1],
  ]);

  assert.deepEqual(
    Matrix.diagonal([1, 2]).add(Matrix.diagonal([3, 4])).toArray(),
    [[4, 0], [0, 6]],
  );
  assert.deepEqual(
    Matrix.diagonal([4, 6]).subtract(Matrix.diagonal([1, 2])).toArray(),
    [[3, 0], [0, 4]],
  );
  assert.deepEqual(
    Matrix.diagonal([2, 3]).multiply(Matrix.diagonal([4, 5])).toArray(),
    [[8, 0], [0, 15]],
  );
});

test("coverage completion: point reads traverse every lazy representation", () => {
  const base = Matrix.from(2, 3, [1, 2, 3, 4, 5, 6]);
  assert.equal(Matrix.identity(2).matmul(base).at(1, 2), 6);
  assert.equal(base.transpose().at(2, 1), 6);
  assert.equal(Matrix.diagonal([2, 3]).at(1, 1), 3);
  assert.equal(Matrix.outer([2, 3], [4, 5]).at(1, 0), 12);
  assert.equal(base.add(Matrix.from(1, 3, [10, 20, 30])).at(1, 2), 36);
  assert.equal(base.add(Matrix.from(2, 1, [10, 20])).at(1, 2), 26);
  assert.equal(
    base.add(Matrix.from(1, 3, [1, 2, 3]).add(Matrix.from(1, 1, [10])))
      .at(1, 2),
    19,
  );
  assert.equal(base.clamp(2, 5).at(0, 0), 2);
  almostEqual(Matrix.from(2, 2, [4, 1, 2, 3]).inverse().at(0, 0), 0.3);
});

test("coverage completion: structured reductions and linear algebra", () => {
  const base = Matrix.from(2, 2, [1, -2, 3, 4]);
  const view = Matrix.identity(2).matmul(base);
  assert.equal(view.sum(), 6);
  assert.equal(view.minValue(), -2);
  assert.equal(view.maxValue(), 4);
  assert.equal(view.trace(), 5);
  almostEqual(view.frobeniusNorm(), Math.sqrt(30));
  assert.deepEqual(Matrix.identity(2).transpose().toArray(), [[1, 0], [0, 1]]);

  const transposed = base.transpose();
  assert.equal(transposed.minValue(), -2);
  assert.equal(transposed.maxValue(), 4);
  assert.equal(transposed.trace(), 5);
  almostEqual(transposed.frobeniusNorm(), Math.sqrt(30));

  const diagonal = Matrix.diagonal([-2, 3]);
  assert.equal(diagonal.sum(), 1);
  assert.equal(diagonal.minValue(), -2);
  assert.equal(diagonal.maxValue(), 3);
  assert.equal(diagonal.trace(), 1);
  almostEqual(diagonal.frobeniusNorm(), Math.sqrt(13));

  const outer = Matrix.outer([1, 2], [3, 4, 5]);
  almostEqual(outer.frobeniusNorm(), Math.sqrt(5) * Math.sqrt(50));

  const rightConstant = base.matmul(Matrix.ones(2, 2).scale(2));
  assert.deepEqual(rightConstant.toArray(), [[-2, -2], [14, 14]]);

  const inverseDiagonal = Matrix.diagonal([2, 4]).inverse();
  almostEqual(inverseDiagonal.determinant(), 0.125);
  almostEqual(inverseDiagonal.logDet(), Math.log(0.125));
  assert.equal(inverseDiagonal.rank(), 2);
  assert.deepEqual(
    inverseDiagonal.matmul(Matrix.diagonal([4, 8]).inverse()).toArray(),
    [[0.125, 0], [0, 0.03125]],
  );
  const materializedDiagonalA = Matrix.diagonal([2, 4]);
  const materializedDiagonalB = Matrix.diagonal([3, 5]);
  materializedDiagonalA.toFloat32Array();
  materializedDiagonalB.toFloat32Array();
  assert.deepEqual(
    materializedDiagonalA.matmul(materializedDiagonalB).toArray(),
    [
      [6, 0],
      [0, 20],
    ],
  );
  assert.equal(Number.isNaN(Matrix.diagonal([-2, 4]).inverse().logDet()), true);

  assert.equal(Number.isNaN(Matrix.ones(2, 2).logDet()), true);
  assert.throws(() => Matrix.ones(2, 2).inverse().toArray(), /singular/);
  assert.deepEqual(Matrix.identity(2).leastSquares([3, 4]).toArray(), [[3], [
    4,
  ]]);
  assert.deepEqual(
    Matrix.identity(2).leastSquares(Matrix.from(2, 1, [3, 4])).toArray(),
    [[3], [4]],
  );
  assert.deepEqual(Matrix.diagonal([2, 4]).leastSquares([4, 8]).toArray(), [
    [2],
    [2],
  ]);
  assert.deepEqual(
    Matrix.diagonal([2, 4]).leastSquares(Matrix.from(2, 1, [4, 8])).toArray(),
    [[2], [2]],
  );

  almostEqual(
    Matrix.from(2, 2, [4, 1, 2, 3]).inverse().matvec([1, 2])[0],
    0.1,
  );
});

test("coverage completion: DAG terminals, affine rewrites, and cache reuse", () => {
  const left = dense(3, 3, 1);
  const right = dense(3, 3, 4);
  const shared = right.abs().addScalar(1);
  const structurallyEqualA = right.abs();
  const structurallyEqualB = right.abs();
  const dag = left.add(shared).multiply(
    shared.add(structurallyEqualA).add(structurallyEqualB),
  ).abs().sqrt();
  assert.ok(Number.isFinite(dag.sum()));
  assert.ok(Number.isFinite(dag.minValue()));
  assert.ok(Number.isFinite(dag.maxValue()));
  assert.ok(Number.isFinite(dag.frobeniusNorm()));
  assert.ok(Number.isFinite(dag.trace()));

  const affine = left.scale(2).addScalar(3).transpose().scale(4).addScalar(5);
  assert.ok(Number.isFinite(affine.sum()));
  assert.ok(Number.isFinite(affine.trace()));

  assert.deepEqual(
    left.scale(2).divide(2).matmul(right).toArray(),
    left.matmul(right).toArray(),
  );
  assert.deepEqual(
    left.scale(0).matmul(right).toArray(),
    Matrix.zeros(3, 3).toArray(),
  );

  const size = 129;
  const data = Float32Array.from(
    { length: size * size },
    (_, index) => (index % 7) - 3,
  );
  const cacheBase = Matrix.from(size, size, data);
  const first = cacheBase.abs().addScalar(1);
  const second = cacheBase.abs().addScalar(1);
  assert.equal(first.at(0, 0), 4);
  first.toFloat32Array();
  second.toFloat32Array();
  assert.deepEqual(second.row(0), first.row(0));

  configure({ cacheLimitBytes: 1 });
  try {
    cacheBase.negate().toFloat32Array();
  } finally {
    configure({ cacheLimitBytes: 64 * 1024 * 1024 });
  }

  const nestedView = Matrix.identity(3).matmul(left);
  assert.ok(Number.isFinite(nestedView.abs().add(right.abs()).sum()));
});

test("coverage completion: outer batch routes and reusable regions", () => {
  const u = Matrix.from(3, 1, [1, 2, 3]);
  const v = Matrix.from(2, 1, [4, 5]);
  const denseRight = Matrix.from(2, 3, [1, 2, 3, 4, 5, 6]);
  const denseLeft = Matrix.from(2, 3, [1, 2, 3, 4, 5, 6]);
  const x = Matrix.from(3, 1, [2, 3, 4]);
  const y = Matrix.from(4, 1, [1, -1, 2, -2]);

  configure({ fastMath: false });
  assert.deepEqual(Matrix.outer(u, v).matmul(denseRight).toArray(), [
    [24, 33, 42],
    [48, 66, 84],
    [72, 99, 126],
  ]);
  assert.deepEqual(denseLeft.matmul(Matrix.outer(x, y)).toArray(), [
    [20, -20, 40, -40],
    [47, -47, 94, -94],
  ]);

  const a = dense(8, 8, 1);
  const b = dense(8, 8, 2);
  const c = dense(8, 8, 3);
  const d = dense(8, 8, 4);
  const branch1 = a.matmul(b);
  const branch2 = branch1.matmul(c);
  const branch3 = a.matmul(d);
  const result = branch2.add(branch3).matmul(b).add(branch1);
  assert.equal(result.toFloat32Array().length, 64);

  const e = dense(8, 8, 5);
  const recyclable = a.matmul(b).matmul(c).matmul(d.matmul(e));
  assert.equal(recyclable.toFloat32Array().length, 64);

  assert.equal(a.matmul(b.transpose()).toFloat32Array().length, 64);
});
