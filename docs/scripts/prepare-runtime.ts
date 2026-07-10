import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const docsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(docsDir, "../..");
const runtimeDir = resolve(docsDir, "../static/wasmatrix-runtime");

const build = await new Deno.Command(Deno.execPath(), {
  args: ["task", "build"],
  cwd: repoRoot,
  stdout: "inherit",
  stderr: "inherit",
}).output();

if (!build.success) {
  throw new Error(`deno task build failed with ${build.code}`);
}

await mkdir(runtimeDir, { recursive: true });
await copyFile(
  resolve(repoRoot, "dist/index.js"),
  resolve(runtimeDir, "index.js"),
);
await copyFile(
  resolve(repoRoot, "dist/wasmatrix.wasm"),
  resolve(runtimeDir, "wasmatrix.wasm"),
);
