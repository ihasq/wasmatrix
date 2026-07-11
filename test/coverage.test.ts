import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import Matrix, {
  configure,
  createRuntime,
  isSimdSupported,
} from "../dist/index.js";

function almostEqual(actual, expected, epsilon = 1e-5) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${expected}, got ${actual}`,
  );
}

function almostArray(actual, expected, epsilon = 1e-5) {
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < actual.length; i++) {
    almostEqual(actual[i], expected[i], epsilon);
  }
}

function values(length, modulus = 17) {
  return Array.from(
    { length },
    (_, i) => ((i % modulus) - Math.floor(modulus / 2)) / 10,
  );
}

test("coverage: runtime helpers and constructors", () => {
  const wasmBytes = readFileSync(
    new URL("../build/wasmatrix.wasm", import.meta.url),
  );
  assert.equal(isSimdSupported(wasmBytes), true);
  assert.equal(isSimdSupported(new Uint8Array([0])), false);
  assert.throws(() => createRuntime(new Uint8Array([0])), /SIMD support/);
  assert.ok(createRuntime(wasmBytes));
  assert.ok(createRuntime());

  Matrix.configure({ fastMath: false, cacheLimitBytes: 1024 * 1024 });
  configure({ fastMath: true, cacheLimitBytes: 1024 * 1024 });
  configure({ fastMath: false });

  assert.deepEqual(Matrix.zeros(2, 3).toArray(), [
    [0, 0, 0],
    [0, 0, 0],
  ]);

  let seed = 0;
  assert.deepEqual(Matrix.random(2, 2, () => ++seed).toArray(), [
    [1, 2],
    [3, 4],
  ]);

  assert.deepEqual(Matrix.diagonal(Matrix.from(1, 3, [2, 3, 4])).toArray(), [
    [2, 0, 0],
    [0, 3, 0],
    [0, 0, 4],
  ]);
});

test("coverage: readback, mutation, mapping and aliases", () => {
  const matrix = Matrix.from(2, 3, [1.2, -1.8, 2.1, -2.2, 3.9, 4.1]);
  const clone = matrix.clone();
  const diagonalCached = Matrix.from(2, 2, [1, 2, 3, 4]);

  assert.deepEqual(clone.toArray(), matrix.toArray());
  almostArray(diagonalCached.diagonal(), [1, 4]);
  almostArray(diagonalCached.diagonal(), [1, 4]);
  almostArray(
    matrix.elementMultiply(Matrix.ones(2, 3).scale(2)).toFlatArray(),
    [2.4, -3.6, 4.2, -4.4, 7.8, 8.2],
  );
  almostArray(matrix.min(Matrix.from(2, 3, [1, 1, 1, 1, 1, 1])).toFlatArray(), [
    1,
    -1.8,
    1,
    -2.2,
    1,
    1,
  ]);
  almostArray(matrix.max(Matrix.from(2, 3, [1, 1, 1, 1, 1, 1])).toFlatArray(), [
    1.2,
    1,
    2.1,
    1,
    3.9,
    4.1,
  ]);
  almostArray(matrix.negate().toFlatArray(), [
    -1.2,
    1.8,
    -2.1,
    2.2,
    -3.9,
    -4.1,
  ]);
  assert.deepEqual(matrix.floor().toArray(), [
    [1, -2, 2],
    [-3, 3, 4],
  ]);
  assert.deepEqual(matrix.ceil().toArray(), [
    [2, -1, 3],
    [-2, 4, 5],
  ]);
  almostArray(
    matrix.map((value, row, col) => value + row * 10 + col).toFlatArray(),
    [1.2, -0.8, 4.1, 7.8, 14.9, 16.1],
  );
  assert.equal(Matrix.from(2, 2, [1, 2, 3, 4]).toString(), "1\t2\n3\t4");

  clone[Symbol.dispose]();
  clone.dispose();
  assert.throws(() => clone.toArray(), /disposed/);
});

test("coverage: validation and error paths", () => {
  assert.throws(() => new Matrix(0, 1), /greater than zero/);
  assert.throws(() => new Matrix(1.5, 1), /integer/);
  assert.throws(() => Matrix.from(2, 2, [1, 2]), /data length/);
  assert.throws(() => Matrix.from(1, 1, {}), /array-like/);
  assert.throws(() => Matrix.from(Number.MAX_SAFE_INTEGER, 2, []), /too large/);
  assert.throws(() => Matrix.zeros(-1, 1), /greater than zero/);
  assert.throws(() => configure({ cacheLimitBytes: -1 }), /non-negative/);
  assert.throws(
    () => Matrix.from(1, 1, [1]).scale(Number.NaN),
    /finite number/,
  );
  assert.throws(
    () => Matrix.from(1, 1, [1]).addScalar(Infinity),
    /finite number/,
  );
  assert.throws(
    () => Matrix.from(1, 1, [1]).set(0, 0, Number.NaN),
    /finite number/,
  );

  const a = Matrix.from(2, 2, [1, 2, 3, 4]);
  assert.throws(() => a.at(-1, 0), /index is out of range/);
  assert.throws(() => a.at(0.1, 0), /integer/);
  assert.throws(() => a.row(2), /row index/);
  assert.throws(() => a.column(2), /column index/);
  assert.throws(() => a.reshape(3, 2), /preserve element count/);
  assert.throws(() => a.clamp(2, 1), /less than or equal/);
  assert.throws(() => a.map(null), /function/);
  assert.throws(() => a.matmul(null), /Matrix/);
  assert.throws(() => a.matmul(Matrix.ones(3, 1)), /matmul shape mismatch/);
  assert.throws(() => a.matvec([1]), /vector length/);
  assert.throws(() => a.dot([1]), /dot length mismatch/);
  assert.throws(() => a.equalsApprox(null), /Matrix/);
  assert.throws(() => a.equalsApprox(Matrix.ones(1, 4)), /shape mismatch/);
  assert.throws(
    () => Matrix.from(2, 3, [1, 2, 3, 4, 5, 6]).determinant(),
    /square/,
  );
  assert.throws(
    () => Matrix.from(2, 3, [1, 2, 3, 4, 5, 6]).leastSquares([1, 2]),
    /rows >= columns/,
  );
  assert.throws(
    () => Matrix.from(2, 2, [1, 0, 0, 1]).solve(Matrix.ones(3, 1)),
    /right-hand side/,
  );
  assert.throws(
    () => Matrix.from(3, 2, [1, 0, 0, 1, 1, 1]).leastSquares(Matrix.ones(2, 1)),
    /right-hand side/,
  );
  assert.throws(() => a.add(null), /Matrix/);
  assert.throws(() => Matrix.matmulChain(), /at least one/);
  assert.throws(() => Matrix.matmulChain(a, null), /Matrix instances/);
  assert.throws(
    () => Matrix.matmulChain(a, Matrix.ones(3, 1)),
    /shape mismatch/,
  );

  const isolated = new Matrix(1, 1, [1], { runtime: createRuntime() });
  assert.throws(
    () => Matrix.outer(Matrix.from(1, 1, [1]), isolated),
    /different WASM runtime/,
  );
  assert.throws(
    () => Matrix.from(1, 1, [1]).add(isolated),
    /different WASM runtimes/,
  );
});

test("coverage: singular, structural and cached linear algebra paths", () => {
  assert.equal(Matrix.identity(3).determinant(), 1);
  assert.equal(Matrix.zeros(2, 2).determinant(), 0);
  assert.equal(Matrix.identity(3).rank(), 3);
  assert.equal(Matrix.zeros(2, 3).rank(), 0);
  assert.equal(Matrix.identity(4).logDet(), 0);
  assert.equal(Number.isNaN(Matrix.diagonal([1, -2]).logDet()), true);
  assert.equal(Number.isNaN(Matrix.from(2, 2, [1, 2, 2, 4]).logDet()), true);
  assert.deepEqual(
    Matrix.identity(2).inverse().toArray(),
    Matrix.identity(2).toArray(),
  );

  assert.throws(() => Matrix.diagonal([1, 0]).inverse(), /singular/);
  assert.throws(() => Matrix.diagonal([1, 0]).solve([1, 2]).toArray(), /singular/);
  assert.throws(
    () => Matrix.from(2, 2, [1, 2, 2, 4]).inverse().toArray(),
    /singular/,
  );
  assert.throws(
    () => Matrix.from(2, 2, [1, 2, 2, 4]).solve([1, 1]).toArray(),
    /singular/,
  );
  assert.throws(
    () => Matrix.from(2, 2, [1, 2, 2, 4]).leastSquares([1, 1]),
    /rank deficient|singular/,
  );

  const spd = Matrix.from(3, 2, [1, 0, 0, 1, 1, 1]).transpose().matmul(
    Matrix.from(3, 2, [1, 0, 0, 1, 1, 1]),
  );
  spd.determinant();
  spd.determinant();
  spd.logDet();
  spd.inverse().toArray();
  spd.solve([1, 2]).toArray();

  const design = Matrix.from(3, 2, [1, 0, 0, 1, 1, 1]);
  design.transpose().matmul(design).inverse().toArray();

  const mutable = Matrix.from(2, 2, [3, 1, 1, 2]);
  mutable.determinant();
  mutable.determinant();
  mutable.set(0, 0, 4);
  mutable.determinant();

  const singularGramSource = Matrix.from(2, 2, [1, 2, 2, 4]);
  assert.equal(
    singularGramSource.transpose().matmul(singularGramSource).determinant(),
    0,
  );
});

test("coverage: algebraic shortcuts and broadcast edge cases", () => {
  const a = Matrix.from(2, 2, [1, 2, 3, 4]);
  assert.deepEqual(Matrix.zeros(2, 2).add(a).toArray(), a.toArray());
  assert.deepEqual(a.add(Matrix.zeros(2, 2)).toArray(), a.toArray());
  assert.deepEqual(a.subtract(Matrix.zeros(2, 2)).toArray(), a.toArray());
  assert.deepEqual(a.subtract(a).toArray(), Matrix.zeros(2, 2).toArray());
  assert.deepEqual(
    a.hadamard(Matrix.zeros(2, 2)).toArray(),
    Matrix.zeros(2, 2).toArray(),
  );
  assert.deepEqual(a.hadamard(Matrix.ones(2, 2)).toArray(), a.toArray());
  assert.deepEqual(Matrix.ones(2, 2).hadamard(a).toArray(), a.toArray());
  assert.deepEqual(a.hadamard(Matrix.ones(1, 2)).toArray(), a.toArray());
  assert.deepEqual(a.add(Matrix.zeros(1, 2)).toArray(), a.toArray());
  assert.deepEqual(a.subtract(Matrix.zeros(2, 1)).toArray(), a.toArray());

  configure({ fastMath: true });
  try {
    assert.deepEqual(a.divide(a).toArray(), Matrix.ones(2, 2).toArray());
    assert.deepEqual(
      a.matmul(a.inverse()).toArray(),
      Matrix.identity(2).toArray(),
    );
  } finally {
    configure({ fastMath: false });
  }

  assert.deepEqual(Matrix.identity(2).matmul(a).toArray(), a.toArray());
  assert.deepEqual(a.matmul(Matrix.identity(2)).toArray(), a.toArray());
  assert.deepEqual(
    a.matmul(Matrix.zeros(2, 3)).toArray(),
    Matrix.zeros(2, 3).toArray(),
  );
  assert.throws(() => a.add(Matrix.ones(3, 3)), /broadcast/);
  assert.deepEqual(Matrix.from(1, 2, [10, 20]).add(a).toArray(), [
    [11, 22],
    [13, 24],
  ]);

  const view = Matrix.identity(2).matmul(a);
  assert.deepEqual(Matrix.identity(2).matmul(view).toArray(), a.toArray());
  assert.deepEqual(view.transpose().toArray(), a.transpose().toArray());
  assert.deepEqual(
    Matrix.from(2, 3, [1, 2, 3, 4, 5, 6]).multiply(Matrix.from(3, 1, [1, 1, 1]))
      .toArray(),
    [
      [6],
      [15],
    ],
  );
});

test("coverage: matmul variants, packed operands and caches", () => {
  const x = Matrix.from(2, 3, [1, 2, 3, 4, 5, 6]);
  const y = Matrix.from(4, 2, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(x.transpose().matmul(y.transpose()).toArray(), [
    [9, 19, 29, 39],
    [12, 26, 40, 54],
    [15, 33, 51, 69],
  ]);

  const leftTN = Matrix.from(400, 200, values(400 * 200, 19));
  const rightTN = Matrix.from(400, 200, values(400 * 200, 23));
  leftTN.transpose().matmul(rightTN).at(0, 0);

  const leftNT = Matrix.from(200, 400, values(200 * 400, 17));
  const rightNT = Matrix.from(200, 400, values(200 * 400, 13));
  leftNT.matmul(rightNT.transpose()).at(0, 0);
  leftNT.matmul(leftNT.transpose()).at(0, 0);

  const leftTT = Matrix.from(400, 200, values(400 * 200, 11));
  const rightTT = Matrix.from(200, 400, values(200 * 400, 29));
  leftTT.transpose().matmul(rightTT.transpose()).at(0, 0);

  const packedLeft1 = Matrix.from(80, 80, values(80 * 80, 17));
  const packedLeft2 = Matrix.from(80, 80, values(80 * 80, 13));
  const packedLeft3 = Matrix.from(80, 80, values(80 * 80, 19));
  const packedRight = Matrix.from(80, 80, values(80 * 80, 11));
  packedLeft1.matmul(packedRight).at(0, 0);
  packedLeft2.matmul(packedRight).at(0, 0);
  packedLeft3.matmul(packedRight).at(0, 0);

  const source = Matrix.from(2, 2, [1, 2, 3, 4]);
  const exprA = source.scale(2).addScalar(1);
  const exprB = source.scale(2).addScalar(1);
  exprA.toArray();
  exprB.toArray();

  const transposedA = source.transpose();
  const transposedB = source.transpose();
  transposedA.toArray();
  transposedB.toArray();

  const largeA = Matrix.from(64, 64, values(64 * 64, 17));
  const largeB = Matrix.from(64, 64, values(64 * 64, 13));
  const largeC = Matrix.from(64, 64, values(64 * 64, 11));
  largeA.matmul(largeB).add(largeA.matmul(largeC)).at(0, 0);
  largeA.matmul(largeC).subtract(largeB.matmul(largeC)).at(0, 0);
  largeA.transpose().matmul(largeA).add(largeB.transpose().matmul(largeB)).at(
    0,
    0,
  );
  largeA.divide(2).matmul(largeB).at(0, 0);
  largeA.matmul(largeB.scale(2)).at(0, 0);

  const evictedSpd = Matrix.from(3, 2, [1, 0, 0, 1, 1, 1]).transpose().matmul(
    Matrix.from(3, 2, [1, 0, 0, 1, 1, 1]),
  );
  evictedSpd.determinant();
  const evictedQr = Matrix.from(3, 2, [1, 0, 0, 1, 1, 1]);
  evictedQr.rank();
  const evictedLu = Matrix.from(2, 2, [3, 1, 1, 2]);
  evictedLu.determinant();
  const evictedTranspose = Matrix.from(2, 2, [1, 2, 3, 4]);
  evictedTranspose.transpose().toArray();
  const evictedPackedRight = Matrix.from(80, 80, values(80 * 80, 31));
  Matrix.from(80, 80, values(80 * 80, 37)).matmul(evictedPackedRight).at(0, 0);
  Matrix.from(80, 80, values(80 * 80, 41)).matmul(evictedPackedRight).at(0, 0);

  configure({ cacheLimitBytes: 1 });
  try {
    evictedTranspose.transpose().toArray();
    Matrix.from(80, 80, values(80 * 80, 43)).matmul(evictedPackedRight).at(
      0,
      0,
    );

    Matrix.from(3, 3, [3, 1, 0, 1, 4, 2, 0, 2, 5]).determinant();
    const staleLu = Matrix.from(2, 2, [3, 1, 1, 2]);
    staleLu.determinant();
    staleLu.determinant();
    const staleQr = Matrix.from(3, 2, [1, 0, 0, 1, 1, 1]);
    staleQr.rank();
    staleQr.rank();
    const staleTranspose = Matrix.from(2, 2, [1, 2, 3, 4]);
    staleTranspose.transpose().toArray();
    staleTranspose.transpose().toArray();
    const stalePackedRight = Matrix.from(80, 80, values(80 * 80, 7));
    Matrix.from(80, 80, values(80 * 80, 5)).matmul(stalePackedRight).at(0, 0);
    Matrix.from(80, 80, values(80 * 80, 3)).matmul(stalePackedRight).at(0, 0);
    Matrix.from(80, 80, values(80 * 80, 23)).matmul(stalePackedRight).at(0, 0);
  } finally {
    configure({ cacheLimitBytes: 64 * 1024 * 1024 });
  }
});

test("coverage: array overloads and matrix chain one-item view", () => {
  const a = Matrix.from(2, 2, [1, 2, 3, 4]);
  const single = Matrix.matmulChain([a]);
  assert.deepEqual(single.toArray(), a.toArray());
  assert.deepEqual(
    Matrix.outer(Matrix.from(1, 2, [2, 3]), Matrix.from(1, 2, [4, 5]))
      .toArray(),
    [
      [8, 10],
      [12, 15],
    ],
  );
  almostEqual(a.dot(Matrix.from(2, 2, [1, 1, 1, 1])), 10);
  almostArray(a.matvec(Matrix.from(2, 1, [1, -1])), [-1, -1]);
});
