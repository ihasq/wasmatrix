import { readFile, writeFile } from "node:fs/promises";

const sourceUrl = new URL("../coverage/lcov.info", import.meta.url);
const targetUrl = new URL("../coverage/codecov.lcov.info", import.meta.url);
const sourceOfTruthUrl = new URL("../wasmatrix.ts", import.meta.url);
const generatedAdapterPath = "build/generated/index.ts";
const sourceOfTruthPath = "wasmatrix.ts";
const adapterBeginMarker = "// @wasmatrix-js-adapter begin";

function adapterLineOffset(source) {
  const lines = source.split(/\r?\n/);
  const markerIndex = lines.findIndex((line) => line === adapterBeginMarker);
  if (markerIndex < 0) {
    throw new Error(`Missing ${adapterBeginMarker} in ${sourceOfTruthPath}`);
  }

  return markerIndex;
}

function remapLineNumber(line, prefix, offset) {
  if (!line.startsWith(prefix)) return line;

  const valueStart = prefix.length;
  const valueEnd = line.indexOf(",", valueStart);
  if (valueEnd < 0) return line;

  const lineNumber = Number(line.slice(valueStart, valueEnd));
  if (!Number.isInteger(lineNumber)) return line;

  return `${prefix}${lineNumber + offset}${line.slice(valueEnd)}`;
}

const lcov = await readFile(sourceUrl, "utf8");
const sourceOfTruth = await readFile(sourceOfTruthUrl, "utf8");
const lineOffset = adapterLineOffset(sourceOfTruth);
let inGeneratedAdapterRecord = false;

const lineOnlyLcov = lcov
  .split(/\r?\n/)
  .filter((line) => !line.startsWith("BRDA:") && !line.startsWith("BRF:") && !line.startsWith("BRH:"))
  .map((line) => {
    if (line === `SF:${generatedAdapterPath}`) {
      inGeneratedAdapterRecord = true;
      return `SF:${sourceOfTruthPath}`;
    }

    if (line === "end_of_record") {
      inGeneratedAdapterRecord = false;
      return line;
    }

    if (!inGeneratedAdapterRecord) return line;

    const remappedFunction = remapLineNumber(line, "FN:", lineOffset);
    if (remappedFunction !== line) return remappedFunction;
    return remapLineNumber(line, "DA:", lineOffset);
  })
  .join("\n");

await writeFile(targetUrl, lineOnlyLcov.endsWith("\n") ? lineOnlyLcov : `${lineOnlyLcov}\n`);
