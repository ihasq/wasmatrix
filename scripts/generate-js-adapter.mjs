import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const sourcePath = "wasmatrix.ts";
const outputPath = "build/generated/index.ts";
const beginMarker = "// @wasmatrix-js-adapter begin";
const endMarker = "// @wasmatrix-js-adapter end";

const source = await readFile(sourcePath, "utf8");
const begin = source.indexOf(beginMarker);
const end = source.indexOf(endMarker);

if (begin < 0 || end < 0 || end <= begin) {
  throw new Error(`Missing JavaScript adapter block in ${sourcePath}`);
}

const body = source
  .slice(begin + beginMarker.length, end)
  .split("\n")
  .map((line) => {
    if (line.startsWith("// ")) return line.slice(3);
    if (line === "//") return "";
    if (line.trim() === "") return "";
    throw new Error(`Invalid JavaScript adapter source line: ${line}`);
  })
  .join("\n")
  .trim();

const generated = [
  "// Generated from wasmatrix.ts. Do not edit directly.",
  body,
  ""
].join("\n");

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, generated, "utf8");
