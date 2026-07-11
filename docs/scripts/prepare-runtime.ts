import { spawn } from "node:child_process";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const docsDir = dirname(fileURLToPath(import.meta.url));
const docsRoot = resolve(docsDir, "..");
const repoRoot = resolve(docsDir, "../..");
const runtimeDir = resolve(docsRoot, "static/wasmatrix-runtime");
const require = createRequire(import.meta.url);

function packageRoot(packageName: string) {
  return dirname(require.resolve(`${packageName}/package.json`));
}

const oxcRegister = resolve(repoRoot, "scripts/oxc-ts-register.mjs");
const ascBin = resolve(packageRoot("assemblyscript"), "bin/asc.js");
const tscBin = resolve(packageRoot("typescript"), "bin/tsc");

async function run(command: string, args: string[], cwd: string) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, OXC_TS_PACKAGE_ROOT: docsRoot },
    stdio: "inherit",
  });

  const code = await new Promise<number | null>((resolveRun, rejectRun) => {
    child.once("error", rejectRun);
    child.once("exit", resolveRun);
  });

  if (code !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with ${code}`);
  }
}

await run(process.execPath, [
  "--import",
  oxcRegister,
  resolve(repoRoot, "scripts/generate-component-mod.ts"),
], repoRoot);
await run(process.execPath, [
  ascBin,
  "--config",
  "asconfig.json",
  "--target",
  "release",
], repoRoot);
await run(process.execPath, [
  "--import",
  oxcRegister,
  resolve(repoRoot, "scripts/generate-js-adapter.ts"),
], repoRoot);
await run(process.execPath, [tscBin, "-p", "tsconfig.json"], repoRoot);
await run(process.execPath, [
  "--import",
  oxcRegister,
  resolve(repoRoot, "scripts/prepare-dist.ts"),
  "build/wasmatrix.wasm",
], repoRoot);

await mkdir(runtimeDir, { recursive: true });
await copyFile(
  resolve(repoRoot, "dist/index.js"),
  resolve(runtimeDir, "index.js"),
);
await copyFile(
  resolve(repoRoot, "dist/wasmatrix.wasm"),
  resolve(runtimeDir, "wasmatrix.wasm"),
);
