import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const wasmInput = process.argv[2] ?? "build/wasmatrix.wasm";

await mkdir("dist", { recursive: true });
await copyFile(resolve(wasmInput), "dist/wasmatrix.wasm");
await copyFile("index.d.ts", "dist/index.d.ts");
await copyFile("wit/wasmatrix.wit", "dist/wasmatrix.wit");
