import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("component WIT is generated from the AssemblyScript source of truth", () => {
  const source = readFileSync(
    new URL("../wasmatrix.ts", import.meta.url),
    "utf8",
  );
  const generated = readFileSync(
    new URL("../wit/wasmatrix.wit", import.meta.url),
    "utf8",
  );

  assert.match(source, /declare namespace WasmatrixComponentWit/);
  assert.doesNotMatch(source, /@wasmatrix-component-wit/);
  assert.match(generated, /^\/\/ Generated from wasmatrix\.ts/m);
  assert.match(generated, /package ihasq:wasmatrix@0\.1\.0;/);
  assert.match(generated, /interface matrix-api/);
  assert.match(generated, /resource matrix/);
  assert.match(generated, /constructor\(rows: u32, cols: u32, data: option<list<f32>>\);/);
  assert.match(generated, /set: func\(row: u32, col: u32, value: f32\) -> result<_, matrix-error>;/);
  assert.match(generated, /world wasmatrix/);
});

test("JavaScript adapter is generated from the transpileable index source", () => {
  const assemblySource = readFileSync(
    new URL("../wasmatrix.ts", import.meta.url),
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
