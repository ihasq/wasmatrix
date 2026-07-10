import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const docsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(docsDir, "../..");
const runtimeDir = resolve(docsDir, "../static/wasmatrix-runtime");

await execFileAsync("npm", ["run", "build"], {
  cwd: repoRoot,
  stdio: "inherit"
});

await mkdir(runtimeDir, { recursive: true });
await copyFile(resolve(repoRoot, "dist/index.js"), resolve(runtimeDir, "index.js"));
await copyFile(resolve(repoRoot, "dist/wasmatrix.wasm"), resolve(runtimeDir, "wasmatrix.wasm"));
