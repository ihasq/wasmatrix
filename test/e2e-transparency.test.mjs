import assert from "node:assert/strict";
import test from "node:test";
import Matrix from "../dist/index.js";
import {
  makeData,
  refAbs,
  refAdd,
  refAddScalar,
  refClamp,
  refDeterminant,
  refDiagonal,
  refDivide,
  refFrobeniusNorm,
  refHadamard,
  refIdentity,
  refInverse,
  refMatmul,
  refMatrix,
  refMatvec,
  refMaxValue,
  refMinValue,
  refOuter,
  refRank,
  refScale,
  refSolve,
  refSqrt,
  refSubtractScalar,
  refSum,
  refTrace,
  refTranspose
} from "./helpers/reference-matrix.mjs";

function assertArrayAlmostEqual(actual, expected, epsilon = 1e-4) {
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < actual.length; i++) {
    assert.ok(
      Math.abs(actual[i] - expected[i]) <= epsilon,
      `index ${i}: expected ${expected[i]}, got ${actual[i]}`
    );
  }
}

function assertMatrixAlmostEqual(actual, expected, epsilon = 1e-4) {
  assert.deepEqual(actual.shape, [expected.rows, expected.cols]);
  assertArrayAlmostEqual(actual.toFloat32Array(), expected.data, epsilon);
}

test("E2E transparency: chained elementwise workflow matches JS reference", () => {
  const rows = 8;
  const cols = 11;
  const aData = makeData(rows, cols, 0x9e3779b9, { min: -2, max: 2 });
  const bData = makeData(rows, cols, 0x243f6a88, { min: -1.25, max: 1.25 });

  const a = Matrix.from(rows, cols, aData);
  const b = Matrix.from(rows, cols, bData);
  const actual = a
    .add(b)
    .subtract(0.25)
    .hadamard(b.abs().addScalar(0.5))
    .clamp(-2, 2)
    .addScalar(2.25)
    .sqrt();

  const refA = refMatrix(rows, cols, aData);
  const refB = refMatrix(rows, cols, bData);
  const expected = refSqrt(
    refAddScalar(
      refClamp(
        refHadamard(
          refSubtractScalar(refAdd(refA, refB), 0.25),
          refAddScalar(refAbs(refB), 0.5)
        ),
        -2,
        2
      ),
      2.25
    )
  );

  assertMatrixAlmostEqual(actual, expected);
  assert.equal(actual.sum() > 0, true);
});

test("E2E transparency: matrix workflow matches JS reference", () => {
  const leftRows = 9;
  const inner = 7;
  const rightCols = 5;
  const leftData = makeData(leftRows, inner, 0x13198a2e, { min: -1, max: 1 });
  const rightData = makeData(inner, rightCols, 0x03707344, { min: -1, max: 1 });
  const vector = makeData(inner, 1, 0xa4093822, { min: -0.5, max: 0.5 });

  const left = Matrix.from(leftRows, inner, leftData);
  const right = Matrix.from(inner, rightCols, rightData);
  const actual = left
    .addScalar(0.5)
    .matmul(right.subtract(0.2))
    .add(Matrix.ones(leftRows, rightCols).scale(0.125))
    .transpose()
    .scale(-0.75);

  const refLeft = refMatrix(leftRows, inner, leftData);
  const refRight = refMatrix(inner, rightCols, rightData);
  const expected = refScale(
    refTranspose(
      refAdd(
        refMatmul(refAddScalar(refLeft, 0.5), refSubtractScalar(refRight, 0.2)),
        refScale(refMatrix(leftRows, rightCols, new Float32Array(leftRows * rightCols).fill(1)), 0.125)
      )
    ),
    -0.75
  );

  assertMatrixAlmostEqual(actual, expected, 2e-4);
  assertArrayAlmostEqual(left.matvec(vector), refMatvec(refLeft, vector), 2e-4);
  assert.ok(Math.abs(left.dot(refLeft.data) - refSum(refHadamard(refLeft, refLeft))) < 2e-4);
  assertMatrixAlmostEqual(Matrix.outer(vector, makeData(3, 1, 0x299f31d0)), refOuter(vector, makeData(3, 1, 0x299f31d0)));
});

test("E2E transparency: reductions and readback surfaces match JS reference", () => {
  const data = makeData(5, 6, 0x082efa98, { min: -3, max: 3 });
  const actual = Matrix.from(5, 6, data);
  const expected = refMatrix(5, 6, data);

  assert.ok(Math.abs(actual.sum() - refSum(expected)) < 1e-4);
  assert.equal(actual.minValue(), refMinValue(expected));
  assert.equal(actual.maxValue(), refMaxValue(expected));
  assert.ok(Math.abs(actual.trace() - refTrace(expected)) < 1e-4);
  assert.ok(Math.abs(actual.frobeniusNorm() - refFrobeniusNorm(expected)) < 1e-4);
  assertArrayAlmostEqual(actual.diagonal(), refDiagonal(expected));

  const snapshot = actual.data;
  snapshot[0] = 12345;
  assert.equal(actual.at(0, 0), data[0]);
  assert.deepEqual(actual.toArray()[2], Array.from(data.subarray(12, 18)));
});

test("E2E transparency: linear algebra workflow matches JS reference", () => {
  const aData = new Float32Array([
    8, 1, -2, 0.5,
    2, 7, 1, -1,
    -1, 0.25, 6, 2,
    0.5, -1.5, 1, 5
  ]);
  const rhsData = new Float32Array([
    3, -2,
    4, 1,
    -1, 5,
    2, 0.5
  ]);
  const dependentData = new Float32Array([
    1, 2, 3, 4,
    2, 4, 6, 8,
    0, 1, 0, 1,
    1, 3, 3, 5
  ]);

  const a = Matrix.from(4, 4, aData);
  const rhs = Matrix.from(4, 2, rhsData);
  const refA = refMatrix(4, 4, aData);
  const refRhs = refMatrix(4, 2, rhsData);

  assert.ok(Math.abs(a.determinant() - refDeterminant(refA)) < 1e-4);
  assertMatrixAlmostEqual(a.inverse(), refInverse(refA), 2e-4);
  assertMatrixAlmostEqual(a.solve(rhs), refSolve(refA, refRhs), 2e-4);
  assert.ok(a.matmul(a.inverse()).equalsApprox(Matrix.identity(4), 2e-4));
  assertMatrixAlmostEqual(Matrix.identity(4), refIdentity(4));

  const dependent = Matrix.from(4, 4, dependentData);
  assert.equal(dependent.rank(), refRank(refMatrix(4, 4, dependentData)));
});
