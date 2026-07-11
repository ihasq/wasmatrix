import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("component AssemblyScript declarations are generated from WIT", () => {
  const coreSource = readFileSync(
    new URL("../src/wasmatrix.ts", import.meta.url),
    "utf8",
  );
  const wit = readFileSync(
    new URL("../wit/wasmatrix.wit", import.meta.url),
    "utf8",
  );
  const generated = readFileSync(
    new URL("../src/mod.ts", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(coreSource, /declare namespace WasmatrixComponentWit/);
  assert.match(wit, /^package ihasq:wasmatrix@0\.1\.0;/m);
  assert.match(wit, /interface matrix-api/);
  assert.match(wit, /resource matrix/);
  assert.match(wit, /constructor\(rows: u32, cols: u32, data: option<list<f32>>\);/);
  assert.match(wit, /set: func\(row: u32, col: u32, value: f32\) -> result<_, matrix-error>;/);
  assert.match(wit, /world wasmatrix/);
  assert.match(generated, /^\/\/ Generated from wit\/wasmatrix\.wit/m);
  assert.match(generated, /declare namespace WasmatrixComponentWit/);
  assert.match(generated, /export class Matrix extends Resource/);
  assert.match(generated, /static zeros\(rows: u32, cols: u32\): Result<Matrix, MatrixError>;/);
  assert.match(generated, /set\(row: u32, col: u32, value: f32\): Result<void, MatrixError>;/);
});

test("JavaScript adapter is generated from the transpileable index source", () => {
  const assemblySource = readFileSync(
    new URL("../src/wasmatrix.ts", import.meta.url),
    "utf8",
  );
  const source = readFileSync(
    new URL("../src/index.ts", import.meta.url),
    "utf8",
  );
  const generated = readFileSync(
    new URL("../build/generated/index.ts", import.meta.url),
    "utf8",
  );
  const expected = [
    "// Generated from src/index.ts. Do not edit directly.",
    source.trim(),
    "",
  ].join("\n");

  assert.doesNotMatch(assemblySource, /@wasmatrix-js-adapter/);
  assert.equal(generated, expected);
  assert.match(generated, /export class Matrix/);
  assert.match(source, /class WasmRuntime/);
  assert.match(source, /call\(name, \.\.\.args\)/);
  assert.doesNotMatch(source, /\b(?:this\.#runtime|runtime)\.exports\./);
  assert.ok(generated.includes('new URL("./wasmatrix.wasm", import.meta.url)'));
});
