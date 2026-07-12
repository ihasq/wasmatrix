import assert from "node:assert/strict";
import test from "node:test";
import { mat2, mat3, mat4, vec2, vec3, vec4 } from "../dist/index.js";

function assertAlmostEqual(actual: number, expected: number, epsilon = 1e-5) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${expected}, got ${actual}`,
  );
}

function assertArrayAlmostEqual(
  actual: ArrayLike<number>,
  expected: ArrayLike<number>,
  epsilon = 1e-5,
) {
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < actual.length; i++) {
    assertAlmostEqual(actual[i], expected[i], epsilon);
  }
}

test("mat4 multiply and vec3 transform keep glMatrix column-major semantics", () => {
  const translation = mat4.fromTranslation(mat4.create(), [10, 20, 30]);
  const scaling = mat4.fromScaling(mat4.create(), [2, 3, 4]);
  const transform = mat4.multiply(mat4.create(), translation, scaling);

  assertArrayAlmostEqual(transform, [
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

  assertArrayAlmostEqual(
    vec3.transformMat4(vec3.create(), [1, 1, 1], transform),
    [12, 23, 34],
  );
});

test("mat3 multiply and vec2 transform use WASMatrix-backed templates", () => {
  const translation = mat3.fromTranslation(mat3.create(), [5, 6]);
  const scaling = mat3.fromScaling(mat3.create(), [2, 3]);
  const transform = mat3.multiply(mat3.create(), translation, scaling);

  assertArrayAlmostEqual(transform, [
    2,
    0,
    0,
    0,
    3,
    0,
    5,
    6,
    1,
  ]);
  assertArrayAlmostEqual(
    vec2.transformMat3(vec2.create(), [1, 1], transform),
    [7, 9],
  );
});

test("mat2 rotation and vec2 transform match glMatrix orientation", () => {
  const rotation = mat2.fromRotation(mat2.create(), Math.PI / 2);
  assertArrayAlmostEqual(
    vec2.transformMat2(vec2.create(), [1, 0], rotation),
    [0, 1],
  );
});

test("vector helpers keep mutable out contracts", () => {
  const out = vec4.create();
  assert.equal(vec4.add(out, [1, 2, 3, 4], [5, 6, 7, 8]), out);
  assertArrayAlmostEqual(out, [6, 8, 10, 12]);
  assertAlmostEqual(vec3.dot([1, 2, 3], [4, 5, 6]), 32);
  assertArrayAlmostEqual(vec3.normalize(vec3.create(), [0, 3, 4]), [
    0,
    0.6,
    0.8,
  ]);
});
