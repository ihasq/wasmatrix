import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const sourcePath = "src/index.ts";
const outputPath = "build/generated/index.ts";

const source = await readFile(sourcePath, "utf8");

const generated = [
  "// Generated from src/index.ts. Do not edit directly.",
  source.trim(),
  "",
].join("\n");

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, generated, "utf8");
