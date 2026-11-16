import assert from "node:assert/strict";
import test from "node:test";
import Matrix, { configure } from "../dist/index.js";

function almostEqual(actual: number, expected: number, epsilon = 1e-5) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${expected}, got ${actual}`,
  );
}

test("constant and identity structures preserve values through shortcuts", () => {
  const a = Matrix.from(2, 2, [1, 2, 3, 4]);
  assert.deepEqual(Matrix.identity(2).negate().matmul(a).toArray(), [
    [-1, -2],
    [-3, -4],
  ]);
  assert.deepEqual(Matrix.identity(2).clamp(0, 0.5).matmul(a).toArray(), [
    [0.5, 1],
    [1.5, 2],
  ]);
  assert.deepEqual(Matrix.ones(2, 2).negate().matmul(a).toArray(), [
    [-4, -6],
    [-4, -6],
  ]);
  assert.deepEqual(
    Matrix.ones(2, 3).scale(2).matmul(
      Matrix.ones(3, 2).scale(-4),
    ).toArray(),
    [[-24, -24], [-24, -24]],
  );
});

test("local and lazy point access avoids whole-result materialization", () => {
  const listenersKey = Symbol.for("wasmatrix.wasmCallListeners");
  const calls: string[] = [];
  const previous = (globalThis as any)[listenersKey];
  (globalThis as any)[listenersKey] = new Set([
    (name: string) => calls.push(name),
  ]);
  try {
    const local = Matrix.from(128, 128, new Float32Array(128 * 128).fill(3));
    assert.equal(local.at(127, 127), 3);
    assert.equal(calls.length, 0);

    const left = Matrix.from(2, 3, [1, 2, 3, 4, 5, 6]);
    const right = Matrix.from(3, 2, [7, 8, 9, 10, 11, 12]);
    assert.equal(left.matmul(right).at(0, 0), 58);
    assert.equal(calls.includes("executeBatch"), false);
  } finally {
    if (previous === undefined) delete (globalThis as any)[listenersKey];
    else (globalThis as any)[listenersKey] = previous;
  }
});

test("constant, Gram, outer and transposed diagonal routes stay compact", () => {
  const identity = Matrix.identity(64);
  assert.equal(identity.sum(), 64);
  assert.equal(identity.trace(), 64);
  assert.equal(identity.frobeniusNorm(), 8);
  assert.equal(Matrix.ones(64, 64).determinant(), 0);
  assert.equal(Matrix.ones(64, 64).rank(), 1);

  const a = Matrix.from(3, 2, [1, 2, 3, 4, 5, 6]);
  almostEqual(a.transpose().matmul(a).trace(), 91);

  const u = Matrix.from(3, 1, [1, 2, 3]);
  const v = Matrix.from(3, 1, [4, 5, 6]);
  const outer = Matrix.outer(u, v);
  assert.equal(outer.trace(), 32);
  assert.equal(outer.sum(), 90);
  assert.equal(outer.rank(), 1);
  assert.equal(outer.determinant(), 0);

  const d = Matrix.diagonal([2, 3, 4]).transpose();
  assert.deepEqual(d.matmul(Matrix.ones(3, 2)).toArray(), [
    [2, 2],
    [3, 3],
    [4, 4],
  ]);
});

test("deep shared expression graphs compile without textual key expansion", () => {
  let expression = Matrix.from(2, 2, [1, 2, 3, 4]);
  for (let i = 0; i < 20; i++) {
    expression = expression.add(expression).scale(0.5);
  }
  assert.deepEqual(expression.toArray(), [[1, 2], [3, 4]]);
});

test("fast low-rank products preserve their outer representation", () => {
  configure({ fastMath: true });
  try {
    const u = Matrix.from(3, 1, [1, 2, 3]);
    const v = Matrix.from(2, 1, [4, 5]);
    const x = Matrix.from(2, 1, [6, 7]);
    const y = Matrix.from(4, 1, [1, -1, 2, -2]);
    const result = Matrix.outer(u, v).matmul(Matrix.outer(x, y));
    assert.equal(result.rank(), 1);
    assert.deepEqual(result.toArray(), [
      [59, -59, 118, -118],
      [118, -118, 236, -236],
      [177, -177, 354, -354],
    ]);
  } finally {
    configure({ fastMath: false });
  }
});
