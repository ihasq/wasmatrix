import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const docsRoot = resolve("docs");
const docsRequire = createRequire(
  pathToFileURL(resolve(docsRoot, "package.json")),
);
const requiredPackages = [
  "@docusaurus/core",
  "@oxc-node/core",
  "assemblyscript",
  "typedoc",
  "typescript",
];

function hasPackage(packageName) {
  try {
    docsRequire.resolve(`${packageName}/package.json`);
    return true;
  } catch {
    return false;
  }
}

if (requiredPackages.every(hasPackage)) {
  process.exit(0);
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const child = spawn(npm, [
  "--prefix",
  "docs",
  "install",
  "--package-lock=false",
], {
  stdio: "inherit",
});

const code = await new Promise((resolveRun, rejectRun) => {
  child.once("error", rejectRun);
  child.once("exit", resolveRun);
});

if (code !== 0) {
  throw new Error(`npm --prefix docs install failed with ${code}`);
}
