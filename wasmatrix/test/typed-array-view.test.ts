import assert from "node:assert/strict";
import test from "node:test";
import Matrix from "../dist/index.js";

function assertArrayAlmostEqual(actual, expected, epsilon = 1e-6) {
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < actual.length; i++) {
    assert.ok(
      Math.abs(actual[i] - expected[i]) <= epsilon,
      `index ${i}: expected ${expected[i]}, got ${actual[i]}`,
    );
  }
}

test("Matrix exposes zero-copy Float32Array views while preserving copy APIs", () => {
  const a = Matrix.from(2, 2, [1, 2, 3, 4]);
  const b = Matrix.from(2, 2, [5, 6, 7, 8]);
  const product = a.matmul(b);

  const view = product.toFloat32ArrayView();
  assert.ok(view instanceof Float32Array);
  assert.equal(view.byteOffset, product.byteOffset);
  assertArrayAlmostEqual(Array.from(view), [19, 22, 43, 50]);

  const copy = product.toFloat32Array();
  assert.ok(copy instanceof Float32Array);
  assert.notEqual(copy.buffer, view.buffer);
  assertArrayAlmostEqual(Array.from(copy), [19, 22, 43, 50]);

  const secondRow = product.rowView(1);
  assert.equal(secondRow.buffer, view.buffer);
  assert.equal(
    secondRow.byteOffset,
    view.byteOffset + 2 * Float32Array.BYTES_PER_ELEMENT,
  );
  assertArrayAlmostEqual(Array.from(secondRow), [43, 50]);

  const rowViews = product.toArrayView();
  assert.equal(rowViews.length, 2);
  assert.equal(rowViews[0].buffer, view.buffer);
  assert.equal(rowViews[1].buffer, view.buffer);
  assertArrayAlmostEqual(Array.from(rowViews[0]), [19, 22]);
  assertArrayAlmostEqual(Array.from(rowViews[1]), [43, 50]);

  view[0] = 99;
  assert.equal(product.at(0, 0), 99);

  copy[1] = 88;
  assert.equal(product.at(0, 1), 22);
});
