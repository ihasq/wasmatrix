import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const sourcePath = "wasmatrix.ts";
const outputPath = "wit/wasmatrix.wit";
const namespaceName = "WasmatrixComponentWit";
const markerNames = new Set([
  "Record",
  "Variant",
  "Resource",
  "Result",
  "Borrow",
  "List",
  "Option",
]);
const primitiveNames = new Set(["bool", "f32", "f64", "u8", "u16", "u32", "u64"]);
const packageRoot = process.env.OXC_TS_PACKAGE_ROOT ?? process.cwd();
const require = createRequire(pathToFileURL(resolve(packageRoot, "package.json")));
const { parseSync } = require("oxc-parser");

const source = await readFile(sourcePath, "utf8");
const namespaceStart = source.indexOf(`declare namespace ${namespaceName}`);
if (namespaceStart < 0) {
  throw new Error(`Missing ${namespaceName} namespace in ${sourcePath}`);
}

const namespaceOpen = source.indexOf("{", namespaceStart);
if (namespaceOpen < 0) {
  throw new Error(`Missing ${namespaceName} namespace body in ${sourcePath}`);
}

let namespaceEnd = -1;
let depth = 0;
for (let index = namespaceOpen; index < source.length; index++) {
  const character = source[index];
  if (character === "{") {
    depth++;
  } else if (character === "}") {
    depth--;
    if (depth === 0) {
      namespaceEnd = index + 1;
      break;
    }
  }
}

if (namespaceEnd < 0) {
  throw new Error(`Unclosed ${namespaceName} namespace in ${sourcePath}`);
}

const namespaceSource = source.slice(namespaceStart, namespaceEnd);
const parsed = parseSync(`${sourcePath}#${namespaceName}`, namespaceSource, {
  lang: "ts",
  sourceType: "module",
});

if (parsed.errors.length > 0) {
  const first = parsed.errors[0];
  throw new Error(`Unable to parse ${sourcePath}: ${first.message}`);
}

function fail(message: string, node?: any): never {
  if (node?.start == null) {
    throw new Error(message);
  }
  const line = source.slice(0, namespaceStart + node.start).split("\n").length;
  throw new Error(`${message} at ${sourcePath}:${line}`);
}

function assertIdentifierName(node: any, label: string): string {
  if (node?.type !== "Identifier") {
    fail(`Expected identifier for ${label}`, node);
  }
  return node.name;
}

function exportedDeclaration(statement: any): any | null {
  if (statement?.type !== "ExportNamedDeclaration") {
    return null;
  }
  return statement.declaration;
}

function findNamespace(): any {
  for (const statement of parsed.program.body) {
    if (
      statement.type === "TSModuleDeclaration"
      && statement.id?.type === "Identifier"
      && statement.id.name === namespaceName
    ) {
      if (statement.body?.type !== "TSModuleBlock") {
        fail(`${namespaceName} must use a namespace block`, statement);
      }
      return statement.body;
    }
  }
  fail(`Missing ${namespaceName} namespace`);
}

function literalTypeValue(typeAnnotation: any, label: string): string {
  const typeNode = typeAnnotation?.typeAnnotation;
  if (
    typeNode?.type !== "TSLiteralType"
    || typeNode.literal?.type !== "Literal"
    || typeof typeNode.literal.value !== "string"
  ) {
    fail(`${label} must be a string literal type`, typeAnnotation);
  }
  return typeNode.literal.value;
}

function kebabCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase();
}

function typeReferenceName(node: any): string {
  if (node?.type !== "TSTypeReference") {
    fail("Expected type reference", node);
  }
  return assertIdentifierName(node.typeName, "type reference");
}

function typeArguments(node: any, count: number): any[] {
  const params = node.typeArguments?.params ?? [];
  if (params.length !== count) {
    fail(`${typeReferenceName(node)} expects ${count} type argument(s)`, node);
  }
  return params;
}

function typeToWit(node: any): string {
  switch (node?.type) {
    case "TSVoidKeyword":
      return "_";
    case "TSBooleanKeyword":
      return "bool";
    case "TSArrayType":
      return `list<${typeToWit(node.elementType)}>`;
    case "TSTypeReference": {
      const name = typeReferenceName(node);
      if (primitiveNames.has(name)) {
        return name;
      }
      if (name === "Result") {
        const [ok, error] = typeArguments(node, 2);
        return `result<${typeToWit(ok)}, ${typeToWit(error)}>`;
      }
      if (name === "Borrow") {
        const [inner] = typeArguments(node, 1);
        return `borrow<${typeToWit(inner)}>`;
      }
      if (name === "List") {
        const [inner] = typeArguments(node, 1);
        return `list<${typeToWit(inner)}>`;
      }
      if (name === "Option") {
        const [inner] = typeArguments(node, 1);
        return `option<${typeToWit(inner)}>`;
      }
      return kebabCase(name);
    }
    default:
      fail(`Unsupported WIT type node ${node?.type ?? "<missing>"}`, node);
  }
}

function memberName(member: any): string {
  return assertIdentifierName(member.key, "member name");
}

function propertyType(member: any): string {
  const typeNode = member.typeAnnotation?.typeAnnotation;
  if (typeNode == null) {
    fail(`${memberName(member)} is missing a type annotation`, member);
  }
  return typeToWit(typeNode);
}

function functionParams(value: any): string {
  return value.params.map((param: any) => {
    if (param.type !== "Identifier") {
      fail("WIT functions only support identifier parameters", param);
    }
    const typeNode = param.typeAnnotation?.typeAnnotation;
    if (typeNode == null) {
      fail(`${param.name} is missing a type annotation`, param);
    }
    return `${kebabCase(param.name)}: ${typeToWit(typeNode)}`;
  }).join(", ");
}

function functionReturn(value: any): string {
  const typeNode = value.returnType?.typeAnnotation;
  if (typeNode == null || typeNode.type === "TSVoidKeyword") {
    return "";
  }
  return ` -> ${typeToWit(typeNode)}`;
}

function superclassName(declaration: any): string | null {
  if (declaration.superClass == null) return null;
  return assertIdentifierName(declaration.superClass, "superclass");
}

type ComponentEntry = {
  kind: "record" | "variant" | "resource";
  declaration: any;
};

const metadata = new Map<string, string>();
const entries: ComponentEntry[] = [];
const namespace = findNamespace();

for (const statement of namespace.body) {
  const declaration = exportedDeclaration(statement);
  if (declaration == null) continue;

  if (declaration.type === "VariableDeclaration") {
    for (const declarator of declaration.declarations) {
      const name = assertIdentifierName(declarator.id, "metadata name");
      metadata.set(name, literalTypeValue(declarator.id.typeAnnotation, name));
    }
    continue;
  }

  if (declaration.type === "TSEnumDeclaration") {
    entries.push({ kind: "variant", declaration });
    continue;
  }

  if (declaration.type !== "ClassDeclaration") {
    continue;
  }

  const name = assertIdentifierName(declaration.id, "class name");
  if (markerNames.has(name)) {
    continue;
  }

  const base = superclassName(declaration);
  if (base === "Record") {
    entries.push({ kind: "record", declaration });
  } else if (base === "Variant") {
    entries.push({ kind: "variant", declaration });
  } else if (base === "Resource") {
    entries.push({ kind: "resource", declaration });
  } else {
    fail(`${name} must extend Record, Variant, or Resource`, declaration);
  }
}

function requiredMetadata(name: string): string {
  const value = metadata.get(name);
  if (value == null) {
    fail(`${namespaceName}.${name} is required`);
  }
  return value;
}

function renderRecord(declaration: any): string[] {
  const name = kebabCase(assertIdentifierName(declaration.id, "record name"));
  const lines = [`  record ${name} {`];
  for (const member of declaration.body.body) {
    if (member.type !== "PropertyDefinition" || member.static) {
      fail(`${name} records only support instance properties`, member);
    }
    lines.push(`    ${kebabCase(memberName(member))}: ${propertyType(member)},`);
  }
  lines.push("  }");
  return lines;
}

function renderVariant(declaration: any): string[] {
  const name = kebabCase(assertIdentifierName(declaration.id, "variant name"));
  const lines = [`  variant ${name} {`];

  if (declaration.type === "TSEnumDeclaration") {
    for (const member of declaration.body.members) {
      lines.push(`    ${kebabCase(assertIdentifierName(member.id, "variant case"))},`);
    }
  } else {
    for (const member of declaration.body.body) {
      if (member.type !== "PropertyDefinition" || member.static) {
        fail(`${name} variants only support instance properties`, member);
      }
      lines.push(`    ${kebabCase(memberName(member))}(${propertyType(member)}),`);
    }
  }

  lines.push("  }");
  return lines;
}

function renderResource(declaration: any): string[] {
  const name = kebabCase(assertIdentifierName(declaration.id, "resource name"));
  const lines = [`  resource ${name} {`];

  for (const member of declaration.body.body) {
    if (member.type !== "MethodDefinition") {
      fail(`${name} resources only support methods`, member);
    }
    const methodName = memberName(member);
    const params = functionParams(member.value);
    if (member.kind === "constructor") {
      lines.push(`    constructor(${params});`);
    } else if (member.static) {
      lines.push(
        `    ${kebabCase(methodName)}: static func(${params})${functionReturn(member.value)};`,
      );
    } else {
      lines.push(
        `    ${kebabCase(methodName)}: func(${params})${functionReturn(member.value)};`,
      );
    }
  }

  lines.push("  }");
  return lines;
}

const packageId = requiredMetadata("packageId");
const interfaceName = requiredMetadata("interfaceName");
const worldName = requiredMetadata("worldName");
const output = [
  "// Generated from wasmatrix.ts. Do not edit directly.",
  `package ${packageId};`,
  "",
  `interface ${interfaceName} {`,
];

entries.forEach((entry, index) => {
  if (index > 0) output.push("");
  if (entry.kind === "record") {
    output.push(...renderRecord(entry.declaration));
  } else if (entry.kind === "variant") {
    output.push(...renderVariant(entry.declaration));
  } else {
    output.push(...renderResource(entry.declaration));
  }
});

output.push(
  "}",
  "",
  `world ${worldName} {`,
  `  export ${interfaceName};`,
  "}",
  "",
);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, output.join("\n"), "utf8");
