import assert from "node:assert/strict";
import test from "node:test";
import { mat3, mat4, vec2, vec3, vec4 } from "../dist/index.js";

function assertArrayAlmostEqual(
  actual: ArrayLike<number>,
  expected: ArrayLike<number>,
  epsilon = 0.00001,
) {
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < actual.length; i++) {
    assert.ok(
      Math.abs((actual[i] ?? 0) - (expected[i] ?? 0)) <= epsilon,
      `index ${i}: expected ${expected[i]}, got ${actual[i]}`,
    );
  }
}

test("mat4 follows wgpu-matrix dst-last transform conventions", () => {
  const translation = mat4.translation([10, 20, 30]);
  const scaling = mat4.scaling([2, 3, 4]);
  const model = mat4.multiply(translation, scaling);

  assertArrayAlmostEqual(model, [
    2,
    0,
    0,
    0,
    0,
    3,
    0,
    0,
    0,
    0,
    4,
    0,
    10,
    20,
    30,
    1,
  ]);
  assertArrayAlmostEqual(vec3.transformMat4([1, 1, 1], model), [12, 23, 34]);

  const out = mat4.create();
  assert.equal(mat4.translate(mat4.identity(), [1, 2, 3], out), out);
  assertArrayAlmostEqual(out, [
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
    1,
    2,
    3,
    1,
  ]);
});

test("mat3 uses WebGPU 12-float padding", () => {
  const transform = mat3.multiply(
    mat3.translation([5, 6]),
    mat3.scaling([2, 3]),
  );

  assert.equal(transform.length, 12);
  assertArrayAlmostEqual(transform, [2, 0, 0, 0, 0, 3, 0, 0, 5, 6, 1, 0]);
  assertArrayAlmostEqual(vec2.transformMat3([1, 1], transform), [7, 9]);
});

test("projection helpers use WebGPU clip-space depth", () => {
  const projection = mat4.perspective(Math.PI / 2, 2, 1, 101);

  assertArrayAlmostEqual(projection, [
    0.5,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    -1.01,
    -1,
    0,
    0,
    -1.01,
    0,
  ]);
});

test("inverse and determinant round-trip affine transforms", () => {
  const model = mat4.translate(mat4.scaling([2, 3, 4]), [5, 6, 7]);
  const inverse = mat4.inverse(model);

  assert.ok(inverse);
  assert.equal(mat4.determinant(model), 24);
  assertArrayAlmostEqual(mat4.multiply(model, inverse), mat4.identity());
  assertArrayAlmostEqual(vec3.transformMat4([10, 18, 28], inverse), [0, 0, 0]);
});

test("vector helpers cover mutable dst-last arithmetic", () => {
  const out = vec4.create();
  assert.equal(vec4.add([1, 2, 3, 4], [5, 6, 7, 8], out), out);
  assertArrayAlmostEqual(out, [6, 8, 10, 12]);

  assertArrayAlmostEqual(vec3.cross([1, 0, 0], [0, 1, 0]), [0, 0, 1]);
  assertArrayAlmostEqual(vec3.normalize([0, 3, 4]), [0, 0.6, 0.8]);
  assertArrayAlmostEqual(
    vec3.lerpV([0, 10, 100], [10, 20, 200], [0.5, 0.25, 0.1]),
    [
      5,
      12.5,
      110,
    ],
  );
});
