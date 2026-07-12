import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const inputPath = "wit/wasmatrix.wit";
const outputPath = "src/mod.ts";

type RecordEntry = {
  kind: "record";
  name: string;
  fields: Array<{ name: string; type: string }>;
};

type VariantEntry = {
  kind: "variant";
  name: string;
  cases: Array<{ name: string; type: string | null }>;
};

type ResourceEntry = {
  kind: "resource";
  name: string;
  methods: Array<{
    name: string;
    params: Array<{ name: string; type: string }>;
    returnType: string | null;
    static: boolean;
    constructor: boolean;
  }>;
};

type Entry = RecordEntry | VariantEntry | ResourceEntry;

const source = await readFile(inputPath, "utf8");

function fail(message: string): never {
  throw new Error(`${message} in ${inputPath}`);
}

function findMatchingBrace(text: string, openIndex: number): number {
  let depth = 0;
  for (let index = openIndex; index < text.length; index++) {
    const char = text[index];
    if (char === "{") {
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0) return index;
    }
  }
  fail("Unclosed block");
}

function namedBlock(kind: string): { name: string; body: string } {
  const match = new RegExp(`^${kind}\\s+([\\w:-]+)\\s*\\{`, "m").exec(source);
  if (match == null || match.index == null) fail(`Missing ${kind} block`);
  const open = source.indexOf("{", match.index);
  const close = findMatchingBrace(source, open);
  return { name: match[1], body: source.slice(open + 1, close) };
}

function splitTopLevel(value: string, separator = ","): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (char === "<") depth++;
    if (char === ">") depth--;
    if (char === separator && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }

  const last = value.slice(start).trim();
  if (last !== "") parts.push(last);
  return parts;
}

function camelCase(value: string): string {
  return value.replace(/-([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}

function pascalCase(value: string): string {
  const camel = camelCase(value);
  return camel.slice(0, 1).toUpperCase() + camel.slice(1);
}

function typeToAssembly(type: string): string {
  const trimmed = type.trim();
  if (trimmed === "_") return "void";
  if (/^(bool|f32|f64|u8|u16|u32|u64)$/.test(trimmed)) return trimmed;

  const generic = /^([\w-]+)<(.+)>$/.exec(trimmed);
  if (generic != null) {
    const name = generic[1];
    const args = splitTopLevel(generic[2]);
    if (name === "list" && args.length === 1) return `List<${typeToAssembly(args[0])}>`;
    if (name === "option" && args.length === 1) return `Option<${typeToAssembly(args[0])}>`;
    if (name === "borrow" && args.length === 1) return `Borrow<${typeToAssembly(args[0])}>`;
    if (name === "result" && args.length === 2) {
      return `Result<${typeToAssembly(args[0])}, ${typeToAssembly(args[1])}>`;
    }
    fail(`Unsupported generic type ${trimmed}`);
  }

  return pascalCase(trimmed);
}

function parseParams(params: string): Array<{ name: string; type: string }> {
  if (params.trim() === "") return [];
  return splitTopLevel(params).map((param) => {
    const match = /^([\w-]+):\s*(.+)$/.exec(param);
    if (match == null) fail(`Invalid parameter ${param}`);
    return { name: camelCase(match[1]), type: typeToAssembly(match[2]) };
  });
}

function parseRecord(name: string, body: string): RecordEntry {
  const fields = body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = /^([\w-]+):\s*(.+),$/.exec(line);
      if (match == null) fail(`Invalid record field ${line}`);
      return { name: camelCase(match[1]), type: typeToAssembly(match[2]) };
    });
  return { kind: "record", name, fields };
}

function parseVariant(name: string, body: string): VariantEntry {
  const cases = body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = /^([\w-]+)(?:\((.+)\))?,$/.exec(line);
      if (match == null) fail(`Invalid variant case ${line}`);
      return { name: match[1], type: match[2] == null ? null : typeToAssembly(match[2]) };
    });
  return { kind: "variant", name, cases };
}

function parseResource(name: string, body: string): ResourceEntry {
  const methods = body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const constructorMatch = /^constructor\((.*)\);$/.exec(line);
      if (constructorMatch != null) {
        return {
          name: "constructor",
          params: parseParams(constructorMatch[1]),
          returnType: null,
          static: false,
          constructor: true,
        };
      }

      const methodMatch = /^([\w-]+):\s*(static\s+)?func\((.*)\)(?:\s*->\s*(.+))?;$/.exec(line);
      if (methodMatch == null) fail(`Invalid resource method ${line}`);
      return {
        name: camelCase(methodMatch[1]),
        params: parseParams(methodMatch[3]),
        returnType: methodMatch[4] == null ? "void" : typeToAssembly(methodMatch[4]),
        static: methodMatch[2] != null,
        constructor: false,
      };
    });
  return { kind: "resource", name, methods };
}

function parseInterface(body: string): Entry[] {
  const entries: Entry[] = [];
  let index = 0;

  while (index < body.length) {
    const rest = body.slice(index);
    const match = /\S/.exec(rest);
    if (match == null) break;
    index += match.index;

    const header = /^(record|variant|resource)\s+([\w-]+)\s*\{/.exec(body.slice(index));
    if (header == null) fail(`Unexpected interface content near ${body.slice(index, index + 40).trim()}`);

    const open = body.indexOf("{", index);
    const close = findMatchingBrace(body, open);
    const kind = header[1];
    const name = header[2];
    const block = body.slice(open + 1, close);

    if (kind === "record") entries.push(parseRecord(name, block));
    if (kind === "variant") entries.push(parseVariant(name, block));
    if (kind === "resource") entries.push(parseResource(name, block));

    index = close + 1;
  }

  return entries;
}

function renderParams(params: Array<{ name: string; type: string }>): string {
  return params.map((param) => `${param.name}: ${param.type}`).join(", ");
}

function renderEntry(entry: Entry): string[] {
  if (entry.kind === "record") {
    const lines = [`  export class ${pascalCase(entry.name)} extends Record {`];
    for (const field of entry.fields) {
      lines.push(`    ${field.name}: ${field.type};`);
    }
    lines.push("  }");
    return lines;
  }

  if (entry.kind === "variant") {
    const hasPayloads = entry.cases.some((item) => item.type != null);
    if (!hasPayloads) {
      const lines = [`  export enum ${pascalCase(entry.name)} {`];
      for (const item of entry.cases) {
        lines.push(`    ${pascalCase(item.name)},`);
      }
      lines.push("  }");
      return lines;
    }

    const lines = [`  export class ${pascalCase(entry.name)} extends Variant {`];
    for (const item of entry.cases) {
      if (item.type == null) fail(`Variant ${entry.name} mixes payload and empty cases`);
      lines.push(`    ${camelCase(item.name)}: ${item.type};`);
    }
    lines.push("  }");
    return lines;
  }

  const lines = [`  export class ${pascalCase(entry.name)} extends Resource {`];
  for (const method of entry.methods) {
    const params = renderParams(method.params);
    if (method.constructor) {
      lines.push(`    constructor(${params});`);
      continue;
    }
    const prefix = method.static ? "static " : "";
    lines.push(`    ${prefix}${method.name}(${params}): ${method.returnType};`);
  }
  lines.push("  }");
  return lines;
}

const packageMatch = /^package\s+([^;]+);/m.exec(source);
if (packageMatch == null) fail("Missing package declaration");
const { name: interfaceName, body: interfaceBody } = namedBlock("interface");
const world = namedBlock("world");
const entries = parseInterface(interfaceBody);

const output = [
  `// Generated from ${inputPath}. Do not edit directly.`,
  'import * as core from "./wasmatrix";',
  "",
  "declare namespace WasmatrixComponentWit {",
  `  export const packageId: "${packageMatch[1]}";`,
  `  export const interfaceName: "${interfaceName}";`,
  `  export const worldName: "${world.name}";`,
  "",
  "  export class Record {}",
  "  export class Variant {}",
  "  export class Resource {}",
  "  export class Result<T, E> {}",
  "  export class Borrow<T> {}",
  "  export class List<T> {}",
  "  export class Option<T> {}",
  "",
];

entries.forEach((entry, index) => {
  if (index > 0) output.push("");
  output.push(...renderEntry(entry));
});

output.push("}", "");
output.push(
  "export function componentAbiVersion(): i32 {",
  "  return core.abiVersion();",
  "}",
  "",
  "export function executeCoreBatch(instructions: usize, count: i32): i32 {",
  "  return core.executeBatch(instructions, count);",
  "}",
  "",
);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, output.join("\n"), "utf8");
