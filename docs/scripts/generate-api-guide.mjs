import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptsDir = dirname(fileURLToPath(import.meta.url));
const docsRoot = resolve(scriptsDir, "..");
const repoRoot = resolve(docsRoot, "..");
const jsonPath = resolve(docsRoot, ".docusaurus/api-reference.json");
const apiGuidePath = resolve(docsRoot, "docs/api-guide.md");
const typedocCli = resolve(docsRoot, "node_modules/typedoc/dist/cli.js");

const METHOD_GROUPS = [
  {
    title: "Reading And Writing",
    names: ["at", "set", "row", "column", "diagonal", "reshape", "toFloat32Array", "toFlatArray", "toArray"]
  },
  {
    title: "Elementwise Operations",
    names: [
      "add",
      "addScalar",
      "subtract",
      "scale",
      "multiply",
      "divide",
      "hadamard",
      "elementMultiply",
      "min",
      "max",
      "negate",
      "abs",
      "sqrt",
      "floor",
      "ceil",
      "clamp",
      "map"
    ]
  },
  {
    title: "Matrix Operations",
    names: ["transpose", "matmul", "matvec", "dot", "clone"]
  },
  {
    title: "Reductions",
    names: ["sum", "minValue", "maxValue", "trace", "frobeniusNorm"]
  },
  {
    title: "Linear Algebra",
    names: ["determinant", "logDet", "inverse", "solve", "leastSquares", "rank"]
  },
  {
    title: "Memory Management",
    names: ["dispose", "[dispose]"]
  },
  {
    title: "Utilities",
    names: ["equalsApprox", "toString"]
  }
];

function byName(children = []) {
  return new Map(children.map((child) => [child.name, child]));
}

function escapeTable(value) {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function collapseWhitespace(value) {
  return value.replace(/[ \t]*\n[ \t]*/g, " ").replace(/[ \t]{2,}/g, " ").trim();
}

function renderCommentParts(parts = []) {
  return parts.map((part) => {
    if (part.kind === "text") return part.text;
    if (part.kind === "code") return part.text;
    if (part.kind === "inline-tag") {
      return part.text ? `\`${part.text}\`` : "";
    }
    return "";
  }).join("");
}

function summaryOf(reflection) {
  return collapseWhitespace(renderCommentParts(reflection?.comment?.summary));
}

function blockTags(reflection, tag) {
  return reflection?.comment?.blockTags
    ?.filter((blockTag) => blockTag.tag === tag)
    ?.map((blockTag) => collapseWhitespace(renderCommentParts(blockTag.content)))
    ?.filter(Boolean) ?? [];
}

function typeToString(type) {
  if (type == null) return "void";
  switch (type.type) {
    case "intrinsic":
      return type.name;
    case "literal":
      return JSON.stringify(type.value);
    case "reference": {
      const args = type.typeArguments?.length
        ? `<${type.typeArguments.map(typeToString).join(", ")}>`
        : "";
      return `${type.name}${args}`;
    }
    case "array":
      return `${typeToString(type.elementType)}[]`;
    case "union":
      return type.types.map(typeToString).join(" | ");
    case "tuple":
      return `[${type.elements.map(typeToString).join(", ")}]`;
    case "reflection": {
      const signatures = type.declaration?.signatures ?? [];
      if (signatures.length > 0) {
        const signature = signatures[0];
        const params = signature.parameters?.map(paramToString).join(", ") ?? "";
        return `(${params}) => ${typeToString(signature.type)}`;
      }
      const children = type.declaration?.children ?? [];
      if (children.length === 0) return "object";
      return `{ ${children.map((child) => `${child.name}${child.flags?.isOptional ? "?" : ""}: ${typeToString(child.type)}`).join("; ")} }`;
    }
    case "predicate":
      return "boolean";
    default:
      return type.name ?? type.type ?? "unknown";
  }
}

function paramToString(param) {
  const prefix = param.flags?.isRest ? "..." : "";
  const optional = param.flags?.isOptional ? "?" : "";
  return `${prefix}${param.name}${optional}: ${typeToString(param.type)}`;
}

function displayName(name) {
  return name === "[dispose]" ? "[Symbol.dispose]" : name;
}

function signatureName(member, signature, owner) {
  if (member.name === "constructor") {
    return `new ${owner}`;
  }
  if (member.flags?.isStatic) {
    return `${owner}.${displayName(signature.name)}`;
  }
  return `${displayName(signature.name)}`;
}

function signatureToString(member, signature, owner = "Matrix") {
  const params = signature.parameters?.map(paramToString).join(", ") ?? "";
  const name = signatureName(member, signature, owner);
  const returnType = member.name === "constructor" ? owner : typeToString(signature.type);
  return `${name}(${params})${member.name === "constructor" ? "" : `: ${returnType}`}`;
}

function shortCall(member, signature, owner = "Matrix") {
  const params = signature.parameters?.map((param) => {
    const prefix = param.flags?.isRest ? "..." : "";
    const suffix = param.flags?.isOptional ? "?" : "";
    return `${prefix}${param.name}${suffix}`;
  }).join(", ") ?? "";
  return `${signatureName(member, signature, owner)}(${params})`;
}

function renderDetails(reflection) {
  const lines = [];
  const remarks = blockTags(reflection, "@remarks");
  const returns = blockTags(reflection, "@returns");
  const throws = blockTags(reflection, "@throws");
  const defaults = blockTags(reflection, "@defaultValue");

  for (const item of remarks) lines.push(`**Remarks:** ${item}`);
  for (const item of returns) lines.push(`**Returns:** ${item}`);
  for (const item of throws) lines.push(`**Throws:** ${item}`);
  for (const item of defaults) lines.push(`**Default:** ${item}`);

  return lines.length ? `\n${lines.join("\n\n")}\n` : "";
}

function renderParameters(signature) {
  const params = signature.parameters ?? [];
  if (params.length === 0) return "";
  const rows = params.map((param) => {
    const name = `${param.name}${param.flags?.isOptional ? "?" : ""}`;
    const description = summaryOf(param) || "-";
    return `| \`${escapeTable(name)}\` | \`${escapeTable(typeToString(param.type))}\` | ${escapeTable(description)} |`;
  });
  return [
    "| Parameter | Type | Description |",
    "| --- | --- | --- |",
    ...rows,
    ""
  ].join("\n");
}

function renderSignatureMember(member, owner = "Matrix") {
  const signatures = member.signatures ?? [];
  const lines = [];

  for (const signature of signatures) {
    const title = shortCall(member, signature, owner);
    const summary = summaryOf(signature) || summaryOf(member);

    lines.push(`### \`${title}\``);
    lines.push("");
    lines.push("```ts");
    lines.push(signatureToString(member, signature, owner));
    lines.push("```");
    lines.push("");
    if (summary) {
      lines.push(summary);
      lines.push("");
    }
    const params = renderParameters(signature);
    if (params) lines.push(params);
    const details = renderDetails(signature);
    if (details) lines.push(details.trim(), "");
  }

  return lines.join("\n").trim();
}

function renderPropertyTable(title, properties) {
  const rows = properties.map((property) => {
    const marker = property.flags?.isReadonly ? "readonly " : "";
    const description = [summaryOf(property), ...blockTags(property, "@remarks")]
      .filter(Boolean)
      .join(" ");
    return `| \`${property.name}\` | \`${escapeTable(marker + typeToString(property.type))}\` | ${escapeTable(description || "-")} |`;
  });

  return [
    `## ${title}`,
    "",
    "| Property | Type | Description |",
    "| --- | --- | --- |",
    ...rows,
    ""
  ].join("\n");
}

function renderOptionTable(optionsReflection) {
  const rows = (optionsReflection.children ?? []).map((property) => {
    const defaultValue = blockTags(property, "@defaultValue")[0] ?? "-";
    const description = [summaryOf(property), ...blockTags(property, "@remarks")]
      .filter(Boolean)
      .join(" ");
    return `| \`${property.name}\` | \`${escapeTable(typeToString(property.type))}\` | ${escapeTable(defaultValue)} | ${escapeTable(description || "-")} |`;
  });

  return [
    "## Configuration Options",
    "",
    summaryOf(optionsReflection),
    "",
    "| Option | Type | Default | Description |",
    "| --- | --- | ---: | --- |",
    ...rows,
    ""
  ].join("\n");
}

function renderTypeAlias(typeAlias) {
  return [
    `## \`${typeAlias.name}\``,
    "",
    "```ts",
    `type ${typeAlias.name} = ${typeToString(typeAlias.type)}`,
    "```",
    "",
    summaryOf(typeAlias),
    renderDetails(typeAlias)
  ].join("\n").trim();
}

function renderTopLevel(reflection) {
  if (reflection.signatures?.length) {
    return renderSignatureMember(reflection, "");
  }

  return [
    `### \`${reflection.name}\``,
    "",
    "```ts",
    `const ${reflection.name}: ${typeToString(reflection.type)}`,
    "```",
    "",
    summaryOf(reflection),
    renderDetails(reflection)
  ].join("\n").trim();
}

function renderMethodGroup(title, names, membersByName) {
  const rendered = names
    .map((name) => membersByName.get(name))
    .filter(Boolean)
    .map((member) => renderSignatureMember(member))
    .filter(Boolean);

  if (rendered.length === 0) return "";
  return [`## ${title}`, "", ...rendered].join("\n\n");
}

function generatedMarkdown(project) {
  const rootMembers = byName(project.children);
  const matrix = rootMembers.get("Matrix");
  const matrixMembers = byName((matrix.children ?? []).filter((child) => !child.flags?.isStatic));
  const staticMethods = (matrix.children ?? [])
    .filter((child) => child.flags?.isStatic && child.signatures?.length)
    .sort((a, b) => a.name.localeCompare(b.name));
  const properties = (matrix.children ?? [])
    .filter((child) => child.type && !child.signatures?.length && !child.flags?.isStatic)
    .sort((a, b) => a.name.localeCompare(b.name));
  const runtimeHelpers = ["SIMD_REQUIRED", "isSimdSupported", "createRuntime", "configure"]
    .map((name) => rootMembers.get(name))
    .filter(Boolean);

  const sections = [
    "---",
    "id: api-guide",
    "title: API Guide",
    "description: A generated guide to the WASMatrix public API.",
    "sidebar_position: 2",
    "---",
    "",
    "<!-- This file is generated by docs/scripts/generate-api-guide.mjs from index.d.ts TSDoc. Do not edit it directly. -->",
    "",
    "# API Guide",
    "",
    "The default export is the `Matrix` class. Named exports include runtime helpers and global configuration.",
    "",
    "```js",
    "import Matrix, {",
    "  SIMD_REQUIRED,",
    "  configure,",
    "  createRuntime,",
    "  isSimdSupported",
    "} from \"wasmatrix\";",
    "```",
    "",
    "This page is generated from the TSDoc comments in `index.d.ts`, which is copied to `dist/index.d.ts` during the package build.",
    "",
    "## Runtime Helpers",
    "",
    ...runtimeHelpers.map(renderTopLevel).flatMap((item) => [item, ""]),
    renderOptionTable(rootMembers.get("WasmatrixOptions")),
    renderTypeAlias(rootMembers.get("WasmBytes")),
    "## `Matrix`",
    "",
    summaryOf(matrix),
    renderDetails(matrix).trim(),
    "",
    "## Constructor",
    "",
    renderSignatureMember(matrixMembers.get("constructor")),
    "",
    renderPropertyTable("Properties", properties),
    "## Static Methods",
    "",
    ...staticMethods.map((member) => renderSignatureMember(member)).flatMap((item) => [item, ""]),
    ...METHOD_GROUPS.map((group) => renderMethodGroup(group.title, group.names, matrixMembers)).filter(Boolean)
  ];

  return `${sections.filter((section) => section != null).join("\n\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

await mkdir(dirname(jsonPath), { recursive: true });

await execFileAsync(process.execPath, [
  typedocCli,
  "--tsconfig",
  resolve(docsRoot, "tsconfig.typedoc.json"),
  "--json",
  jsonPath,
  resolve(repoRoot, "index.d.ts"),
  "--name",
  "WASMatrix",
  "--readme",
  "none",
  "--disableSources",
  "--excludePrivate",
  "--excludeProtected"
], {
  cwd: docsRoot,
  maxBuffer: 1024 * 1024 * 16
});

const project = JSON.parse(await readFile(jsonPath, "utf8"));
await writeFile(apiGuidePath, generatedMarkdown(project));
