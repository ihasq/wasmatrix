import { readFile, writeFile } from "node:fs/promises";

const sourceUrl = new URL("../coverage/lcov.info", import.meta.url);
const targetUrl = new URL("../coverage/codecov.lcov.info", import.meta.url);

const lcov = await readFile(sourceUrl, "utf8");
const lineOnlyLcov = lcov
  .split(/\r?\n/)
  .filter((line) => !line.startsWith("BRDA:") && !line.startsWith("BRF:") && !line.startsWith("BRH:"))
  .join("\n");

await writeFile(targetUrl, lineOnlyLcov.endsWith("\n") ? lineOnlyLcov : `${lineOnlyLcov}\n`);
