import { eachMapping, TraceMap } from "@jridgewell/trace-mapping";
import { readFile, writeFile } from "node:fs/promises";
import { cwd } from "node:process";

const lcovPath = "coverage/lcov.info";
const targetPath = "coverage/codecov.lcov.info";
const sourceMapPath = "dist/index.js.map";
const adapterSourcePath = "src/index.ts";
const generatedAdapterPath = "build/generated/index.ts";
const distAdapterPath = "dist/index.js";
const generatedHeaderLineCount = 1;

function normalizedPath(path: string) {
  const normalized = path.replaceAll("\\", "/");
  const currentDirectory = `${cwd().replaceAll("\\", "/")}/`;
  return normalized.startsWith(currentDirectory)
    ? normalized.slice(currentDirectory.length)
    : normalized;
}

function c8IgnoredLines(source: string) {
  const ignored = new Set<number>();
  const lines = source.split(/\r?\n/);
  let inIgnoredBlock = false;

  const ignorePreviousCondition = (index: number) => {
    for (let previous = index - 1; previous >= 0; previous -= 1) {
      const text = lines[previous].trim();
      if (text === "") return;
      ignored.add(previous + 1);
      if (text.includes("if (")) return;
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index];

    if (line.includes("c8 ignore start")) {
      inIgnoredBlock = true;
      ignorePreviousCondition(index);
      ignored.add(lineNumber);
      continue;
    }

    if (line.includes("c8 ignore stop")) {
      ignored.add(lineNumber);
      inIgnoredBlock = false;
      continue;
    }

    if (inIgnoredBlock) {
      ignored.add(lineNumber);
      continue;
    }

    const nextMatch = line.match(/c8 ignore next(?:\s+(\d+))?/);
    if (nextMatch) {
      ignorePreviousCondition(index);
      ignored.add(lineNumber);
      const count = nextMatch[1] == null ? 1 : Number(nextMatch[1]);
      for (let offset = 1; offset <= count; offset += 1) {
        ignored.add(lineNumber + offset);
      }
    }
  }

  return ignored;
}

function generatedLineMap(sourceMap: string) {
  const traceMap = new TraceMap(JSON.parse(sourceMap));
  const lines = new Map<number, number>();

  eachMapping(traceMap, (mapping) => {
    if (
      mapping.source?.endsWith(generatedAdapterPath) &&
      mapping.originalLine != null &&
      !lines.has(mapping.generatedLine)
    ) {
      lines.set(mapping.generatedLine, mapping.originalLine);
    }
  });

  return lines;
}

function parseRecords(lcov: string) {
  const records: string[][] = [];
  let record: string[] = [];

  for (const line of lcov.split(/\r?\n/)) {
    if (line === "") continue;
    record.push(line);
    if (line === "end_of_record") {
      records.push(record);
      record = [];
    }
  }

  if (record.length > 0) records.push(record);
  return records;
}

function addLine(lines: Map<number, number>, lineNumber: number, hits: number) {
  lines.set(lineNumber, (lines.get(lineNumber) ?? 0) + hits);
}

const lcov = await readFile(lcovPath, "utf8");
const generatedAdapter = await readFile(generatedAdapterPath, "utf8");
const sourceMap = await readFile(sourceMapPath, "utf8");
const ignoredGeneratedLines = c8IgnoredLines(generatedAdapter);
const distToGeneratedLine = generatedLineMap(sourceMap);
const codecovLines = new Map<number, number>();

for (const record of parseRecords(lcov)) {
  const sourceLine = record.find((line) => line.startsWith("SF:"));
  if (sourceLine == null) continue;

  const source = normalizedPath(sourceLine.slice(3));
  const isDistAdapter = source === distAdapterPath;
  const isGeneratedAdapter = source === generatedAdapterPath;

  if (!isDistAdapter && !isGeneratedAdapter) continue;

  for (const line of record) {
    if (!line.startsWith("DA:")) continue;
    const [, lineNumberText, hitText] = line.match(/^DA:(\d+),(\d+)/) ?? [];
    const lineNumber = Number(lineNumberText);
    const hits = Number(hitText);
    if (!Number.isInteger(lineNumber) || !Number.isInteger(hits)) continue;

    const generatedLine = isDistAdapter
      ? distToGeneratedLine.get(lineNumber)
      : lineNumber;
    if (generatedLine == null || ignoredGeneratedLines.has(generatedLine)) {
      continue;
    }

    const adapterSourceLine = generatedLine - generatedHeaderLineCount;
    if (adapterSourceLine > 0) {
      addLine(codecovLines, adapterSourceLine, hits);
    }
  }
}

const sortedLines = [...codecovLines].sort(([left], [right]) => left - right);
const coveredLines = sortedLines.filter(([, hits]) => hits > 0).length;
const output = [
  "TN:",
  `SF:${adapterSourcePath}`,
  ...sortedLines.map(([lineNumber, hits]) => `DA:${lineNumber},${hits}`),
  `LF:${sortedLines.length}`,
  `LH:${coveredLines}`,
  "end_of_record",
  "",
].join("\n");

await writeFile(targetPath, output, "utf8");
