import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function extractCommentBlock(source, beginMarker, endMarker, label) {
  const begin = source.indexOf(beginMarker);
  const end = source.indexOf(endMarker);
  assert.ok(begin >= 0, `missing ${label} begin marker`);
  assert.ok(end > begin, `missing ${label} end marker`);

  return source
    .slice(begin + beginMarker.length, end)
    .split("\n")
    .map((line) => {
      if (line.startsWith("// ")) return line.slice(3);
      if (line === "//") return "";
      if (line.trim() === "") return "";
      throw new Error(`invalid ${label} source line: ${line}`);
    })
    .join("\n")
    .trim();
}

test("component WIT is generated from the AssemblyScript source of truth", () => {
  const source = readFileSync(new URL("../wasmatrix.ts", import.meta.url), "utf8");
  const generated = readFileSync(new URL("../wit/wasmatrix.wit", import.meta.url), "utf8");
  const expected = [
    "// Generated from wasmatrix.ts. Do not edit directly.",
    extractCommentBlock(
      source,
      "// @wasmatrix-component-wit begin",
      "// @wasmatrix-component-wit end",
      "WIT"
    ),
    ""
  ].join("\n");

  assert.equal(generated, expected);
  assert.match(generated, /resource matrix/);
  assert.match(generated, /world wasmatrix/);
});

test("JavaScript adapter is generated from the AssemblyScript source of truth", () => {
  const source = readFileSync(new URL("../wasmatrix.ts", import.meta.url), "utf8");
  const generated = readFileSync(new URL("../build/generated/index.ts", import.meta.url), "utf8");
  const expected = [
    "// Generated from wasmatrix.ts. Do not edit directly.",
    extractCommentBlock(
      source,
      "// @wasmatrix-js-adapter begin",
      "// @wasmatrix-js-adapter end",
      "JavaScript adapter"
    ),
    ""
  ].join("\n");

  assert.equal(generated, expected);
  assert.match(generated, /export class Matrix/);
  assert.ok(generated.includes('new URL("./wasmatrix.wasm", import.meta.url)'));
});
