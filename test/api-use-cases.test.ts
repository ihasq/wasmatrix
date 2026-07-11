import assert from "node:assert/strict";
import test from "node:test";
import Matrix from "../dist/index.js";

const covered = new Set();

const EXPECTED_MATRIX_API = [
  "Matrix.constructor",
  "Matrix.configure",
  "Matrix.diagonal",
  "Matrix.from",
  "Matrix.identity",
  "Matrix.matmulChain",
  "Matrix.ones",
  "Matrix.outer",
  "Matrix.random",
  "Matrix.zeros",
  "Matrix#abs",
  "Matrix#add",
  "Matrix#addScalar",
  "Matrix#at",
  "Matrix#byteOffset",
  "Matrix#ceil",
  "Matrix#clamp",
  "Matrix#clone",
  "Matrix#column",
  "Matrix#data",
  "Matrix#determinant",
  "Matrix#diagonal",
  "Matrix#dispose",
  "Matrix#divide",
  "Matrix#dot",
  "Matrix#elementMultiply",
  "Matrix#equalsApprox",
  "Matrix#floor",
  "Matrix#frobeniusNorm",
  "Matrix#hadamard",
  "Matrix#inverse",
  "Matrix#leastSquares",
  "Matrix#length",
  "Matrix#logDet",
  "Matrix#map",
  "Matrix#matmul",
  "Matrix#matvec",
  "Matrix#max",
  "Matrix#maxValue",
  "Matrix#min",
  "Matrix#minValue",
  "Matrix#multiply",
  "Matrix#negate",
  "Matrix#rank",
  "Matrix#reshape",
  "Matrix#row",
  "Matrix#scale",
  "Matrix#set",
  "Matrix#shape",
  "Matrix#solve",
  "Matrix#sqrt",
  "Matrix#subtract",
  "Matrix#sum",
  "Matrix#toArray",
  "Matrix#toFlatArray",
  "Matrix#toFloat32Array",
  "Matrix#toString",
  "Matrix#trace",
  "Matrix#transpose",
];

function mark(name) {
  covered.add(name);
}

function construct(rows, cols, values) {
  mark("Matrix.constructor");
  return new Matrix(rows, cols, values);
}

function callStatic(name, ...args) {
  mark(`Matrix.${name}`);
  return Matrix[name](...args);
}

function configure(options) {
  mark("Matrix.configure");
  Matrix.configure(options);
}

function call(matrix, name, ...args) {
  mark(`Matrix#${name}`);
  return matrix[name](...args);
}

function get(matrix, name) {
  mark(`Matrix#${name}`);
  return matrix[name];
}

function assertAlmostEqual(actual, expected, epsilon = 1e-5) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${expected}, got ${actual}`,
  );
}

function assertArrayAlmostEqual(actual, expected, epsilon = 1e-5) {
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < actual.length; i++) {
    assertAlmostEqual(actual[i], expected[i], epsilon);
  }
}

function assertMatrixAlmostEqual(matrix, rows, cols, expected, epsilon = 1e-5) {
  assert.deepEqual(get(matrix, "shape"), [rows, cols]);
  assertArrayAlmostEqual(call(matrix, "toFlatArray"), expected, epsilon);
}

function assertMatrixValues(matrix, rows, cols, expected, epsilon = 1e-5) {
  assert.deepEqual(matrix.shape, [rows, cols]);
  assertArrayAlmostEqual(matrix.toFlatArray(), expected, epsilon);
}

function sorted(values) {
  return Array.from(values).sort();
}

test("API use cases perform real calculations across every Matrix method", () => {
  configure({ fastMath: false, cacheLimitBytes: 64 * 1024 * 1024 });

  const constructed = construct(1, 2, [9, -3]);
  assertMatrixAlmostEqual(constructed, 1, 2, [9, -3]);

  const measurements = callStatic("from", 2, 3, [1.2, -1.8, 2.5, 4.1, 0, -3.3]);
  assert.equal(get(measurements, "length"), 6);
  assert.equal(Number.isInteger(get(measurements, "byteOffset")), true);
  assertArrayAlmostEqual(get(measurements, "data"), [1.2, -1.8, 2.5, 4.1, 0, -3.3]);

  const frozenMeasurements = call(measurements, "clone");
  call(measurements, "set", 0, 0, 2.2);
  assertAlmostEqual(call(measurements, "at", 0, 0), 2.2);
  assertAlmostEqual(call(frozenMeasurements, "at", 0, 0), 1.2);
  assertArrayAlmostEqual(call(measurements, "row", 1), [4.1, 0, -3.3]);
  assertArrayAlmostEqual(call(measurements, "column", 1), [-1.8, 0]);
  assertArrayAlmostEqual(call(measurements, "diagonal"), [2.2, 0]);
  assertMatrixAlmostEqual(
    call(measurements, "reshape", 3, 2),
    3,
    2,
    [2.2, -1.8, 2.5, 4.1, 0, -3.3],
  );
  assertArrayAlmostEqual(call(measurements, "toFloat32Array"), [2.2, -1.8, 2.5, 4.1, 0, -3.3]);
  assert.deepEqual(call(callStatic("from", 2, 2, [1, 2, 3, 4]), "toArray"), [
    [1, 2],
    [3, 4],
  ]);
  assert.equal(call(callStatic("from", 2, 2, [1, 2, 3, 4]), "toString"), "1\t2\n3\t4");

  const zeros = callStatic("zeros", 2, 3);
  const ones = callStatic("ones", 2, 3);
  const identity = callStatic("identity", 2);
  const diagonal = callStatic("diagonal", [2, 3]);
  const diagonalFromMatrix = callStatic("diagonal", callStatic("from", 1, 3, [2, 3, 4]));
  let seed = 0;
  const random = callStatic("random", 2, 2, () => {
    seed++;
    return seed / 10;
  });

  assertMatrixAlmostEqual(zeros, 2, 3, [0, 0, 0, 0, 0, 0]);
  assertMatrixAlmostEqual(ones, 2, 3, [1, 1, 1, 1, 1, 1]);
  assertMatrixAlmostEqual(identity, 2, 2, [1, 0, 0, 1]);
  assertMatrixAlmostEqual(diagonal, 2, 2, [2, 0, 0, 3]);
  assertMatrixAlmostEqual(diagonalFromMatrix, 3, 3, [2, 0, 0, 0, 3, 0, 0, 0, 4]);
  assertMatrixAlmostEqual(random, 2, 2, [0.1, 0.2, 0.3, 0.4]);

  const a = callStatic("from", 2, 3, [1, 2, 3, 4, 5, 6]);
  const b = callStatic("from", 2, 3, [6, 5, 4, 3, 2, 1]);
  assertMatrixAlmostEqual(call(a, "add", b), 2, 3, [7, 7, 7, 7, 7, 7]);
  assertMatrixAlmostEqual(call(a, "add", 1), 2, 3, [2, 3, 4, 5, 6, 7]);
  assertMatrixAlmostEqual(call(a, "addScalar", -0.5), 2, 3, [0.5, 1.5, 2.5, 3.5, 4.5, 5.5]);
  assertMatrixAlmostEqual(call(a, "subtract", b), 2, 3, [-5, -3, -1, 1, 3, 5]);
  assertMatrixAlmostEqual(call(a, "subtract", 2), 2, 3, [-1, 0, 1, 2, 3, 4]);
  assertMatrixAlmostEqual(call(a, "scale", 2), 2, 3, [2, 4, 6, 8, 10, 12]);
  assertMatrixAlmostEqual(call(a, "multiply", callStatic("from", 1, 3, [2, 3, 4])), 2, 3, [2, 6, 12, 8, 15, 24]);
  assertMatrixAlmostEqual(call(a, "multiply", 2), 2, 3, [2, 4, 6, 8, 10, 12]);
  assertMatrixAlmostEqual(call(a, "divide", callStatic("from", 2, 3, [1, 2, 3, 4, 5, 6])), 2, 3, [1, 1, 1, 1, 1, 1]);
  assertMatrixAlmostEqual(call(a, "divide", 2), 2, 3, [0.5, 1, 1.5, 2, 2.5, 3]);
  assertMatrixAlmostEqual(call(a, "hadamard", b), 2, 3, [6, 10, 12, 12, 10, 6]);
  assertMatrixAlmostEqual(call(a, "elementMultiply", b), 2, 3, [6, 10, 12, 12, 10, 6]);
  assertMatrixAlmostEqual(call(a, "min", b), 2, 3, [1, 2, 3, 3, 2, 1]);
  assertMatrixAlmostEqual(call(a, "max", b), 2, 3, [6, 5, 4, 4, 5, 6]);

  const transform = callStatic("from", 2, 3, [-1.2, -0.2, 0.2, 1.2, 2.7, 3.1]);
  assertMatrixAlmostEqual(call(transform, "negate"), 2, 3, [1.2, 0.2, -0.2, -1.2, -2.7, -3.1]);
  assertMatrixAlmostEqual(call(transform, "abs"), 2, 3, [1.2, 0.2, 0.2, 1.2, 2.7, 3.1]);
  assertMatrixAlmostEqual(call(call(transform, "abs"), "sqrt"), 2, 3, [
    Math.sqrt(1.2),
    Math.sqrt(0.2),
    Math.sqrt(0.2),
    Math.sqrt(1.2),
    Math.sqrt(2.7),
    Math.sqrt(3.1),
  ]);
  assertMatrixAlmostEqual(call(transform, "floor"), 2, 3, [-2, -1, 0, 1, 2, 3]);
  assertMatrixAlmostEqual(call(transform, "ceil"), 2, 3, [-1, 0, 1, 2, 3, 4]);
  assertMatrixAlmostEqual(call(transform, "clamp", -0.5, 2), 2, 3, [-0.5, -0.2, 0.2, 1.2, 2, 2]);
  assertMatrixAlmostEqual(call(transform, "map", (value, row, col) => value + row * 10 + col), 2, 3, [-1.2, 0.8, 2.2, 11.2, 13.7, 15.1]);

  const left = callStatic("from", 2, 3, [1, 2, 3, 4, 5, 6]);
  const right = callStatic("from", 3, 2, [7, 8, 9, 10, 11, 12]);
  const post = callStatic("from", 2, 2, [1, 2, 3, 4]);
  assertMatrixAlmostEqual(call(left, "transpose"), 3, 2, [1, 4, 2, 5, 3, 6]);
  assertMatrixAlmostEqual(call(left, "matmul", right), 2, 2, [58, 64, 139, 154]);
  assertMatrixAlmostEqual(callStatic("matmulChain", left, right, post), 2, 2, [250, 372, 601, 894]);
  assertArrayAlmostEqual(call(left, "matvec", [1, 0, -1]), [-2, -2]);
  assertAlmostEqual(call(left, "dot", left), 91);
  assertMatrixAlmostEqual(callStatic("outer", [1, 2], [3, 4]), 2, 2, [3, 4, 6, 8]);
  assertMatrixAlmostEqual(
    callStatic("outer", callStatic("from", 2, 1, [2, 3]), callStatic("from", 1, 2, [4, 5])),
    2,
    2,
    [8, 10, 12, 15],
  );

  const stats = callStatic("from", 3, 3, [2, -1, 0, 4, 3, 1, -2, 5, 6]);
  assertAlmostEqual(call(stats, "sum"), 18);
  assertAlmostEqual(call(stats, "minValue"), -2);
  assertAlmostEqual(call(stats, "maxValue"), 6);
  assertAlmostEqual(call(stats, "trace"), 11);
  assertAlmostEqual(call(stats, "frobeniusNorm"), Math.sqrt(96));

  const system = callStatic("from", 2, 2, [4, 7, 2, 6]);
  assertAlmostEqual(call(system, "determinant"), 10);
  assertAlmostEqual(call(system, "logDet"), Math.log(10));
  const inverse = call(system, "inverse");
  assertMatrixAlmostEqual(inverse, 2, 2, [0.6, -0.7, -0.2, 0.4]);
  assertMatrixAlmostEqual(call(system, "matmul", inverse), 2, 2, [1, 0, 0, 1]);
  assertMatrixAlmostEqual(
    call(callStatic("from", 2, 2, [3, -1, 5, 2]), "matmul", call(system, "inverse")),
    2,
    2,
    [2, -2.5, 2.6, -2.7],
    1e-5,
  );
  assertMatrixAlmostEqual(
    call(call(system, "inverse"), "matmul", callStatic("from", 2, 2, [3, -1, 5, 2])),
    2,
    2,
    [-1.7, -2, 1.4, 1],
    1e-5,
  );
  assertMatrixAlmostEqual(call(system, "solve", [1, 0]), 2, 1, [0.6, -0.2]);
  assert.equal(call(system, "rank"), 2);
  assert.equal(call(call(system, "matmul", call(system, "inverse")), "equalsApprox", identity, 1e-5), true);

  const design = callStatic("from", 3, 2, [1, 1, 1, 2, 1, 3]);
  assertMatrixAlmostEqual(call(design, "leastSquares", [1, 2, 2]), 2, 1, [2 / 3, 0.5], 1e-5);

  const disposable = callStatic("ones", 1, 1);
  call(disposable, "dispose");
  assert.throws(() => call(disposable, "at", 0, 0), /disposed/);

  assert.deepEqual(sorted(covered), sorted(EXPECTED_MATRIX_API));
});

test("algebraic traps reject invalid commutative and transpose rewrites", () => {
  const a = Matrix.from(2, 2, [1, 2, 3, 4]);
  const b = Matrix.from(2, 2, [0, 1, -2, 3]);

  const ab = a.matmul(b);
  const ba = b.matmul(a);
  assertMatrixValues(ab, 2, 2, [-4, 7, -8, 15]);
  assertMatrixValues(ba, 2, 2, [3, 4, 7, 8]);
  assert.equal(ab.equalsApprox(ba), false);

  assertMatrixValues(ab.transpose(), 2, 2, [-4, -8, 7, 15]);
  assertMatrixValues(b.transpose().matmul(a.transpose()), 2, 2, [-4, -8, 7, 15]);
  assert.equal(
    ab.transpose().equalsApprox(a.transpose().matmul(b.transpose())),
    false,
  );
});

test("algebraic traps keep diagonal side and broadcast axis distinct", () => {
  const matrix = Matrix.from(2, 2, [1, 2, 3, 4]);
  const diagonal = Matrix.diagonal([2, 3]);

  assertMatrixValues(diagonal.matmul(matrix), 2, 2, [2, 4, 9, 12]);
  assertMatrixValues(matrix.matmul(diagonal), 2, 2, [2, 6, 6, 12]);
  assert.equal(diagonal.matmul(matrix).equalsApprox(matrix.matmul(diagonal)), false);

  assertMatrixValues(matrix.add(Matrix.from(1, 2, [10, 20])), 2, 2, [11, 22, 13, 24]);
  assertMatrixValues(matrix.add(Matrix.from(2, 1, [10, 20])), 2, 2, [11, 12, 23, 24]);
  assert.equal(
    matrix.add(Matrix.from(1, 2, [10, 20])).equalsApprox(
      matrix.add(Matrix.from(2, 1, [10, 20])),
    ),
    false,
  );
});

test("algebraic traps preserve raw batch dependencies across structural nodes", () => {
  const result = Matrix.outer([1, -2], [3, 4])
    .addScalar(1)
    .scale(-2)
    .matmul(Matrix.diagonal([2, -4]).inverse());

  assertMatrixValues(result, 2, 2, [-4, 2.5, 5, -3.5]);
});

test("algebraic traps do not over-apply inverse identity folding", () => {
  const a = Matrix.from(2, 2, [4, 7, 2, 6]);
  const perturbation = 0.01;

  Matrix.configure({ fastMath: true });
  try {
    const perturbedInverse = a.inverse().addScalar(perturbation);
    const product = a.matmul(perturbedInverse);

    assertMatrixValues(product, 2, 2, [1.11, 0.11, 0.08, 1.08], 1e-5);
    assert.equal(product.equalsApprox(Matrix.identity(2), 1e-5), false);
  } finally {
    Matrix.configure({ fastMath: false });
  }
});
