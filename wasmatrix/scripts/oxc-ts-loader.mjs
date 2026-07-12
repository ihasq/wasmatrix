import { createRequire } from "node:module";
import { extname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const TS_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);
let oxcCore;

function loadOxcCore() {
  if (oxcCore == null) {
    const packageRoot = process.env.OXC_TS_PACKAGE_ROOT ?? process.cwd();
    const require = createRequire(
      pathToFileURL(resolvePath(packageRoot, "package.json")),
    );
    oxcCore = require("@oxc-node/core");
    oxcCore.initTracing();
  }
  return oxcCore;
}

export function resolve(specifier, context, nextResolve) {
  return loadOxcCore().createResolve(
    {
      getCurrentDirectory: () => process.cwd(),
    },
    specifier,
    context,
    nextResolve,
  );
}

export async function load(url, context, nextLoad) {
  if (!url.startsWith("file:")) {
    return nextLoad(url, context);
  }

  const filename = fileURLToPath(url);
  const extension = extname(filename);
  if (!TS_EXTENSIONS.has(extension)) {
    return nextLoad(url, context);
  }

  return loadOxcCore().load(url, context, nextLoad);
}
