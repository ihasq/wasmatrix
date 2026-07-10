import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import siteContent from "../src/i18n/siteContent.ts";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const docsRoot = resolve(scriptsDir, "..");
const repoRoot = resolve(docsRoot, "..");
const jsonPath = resolve(docsRoot, ".docusaurus/api-reference.json");
const {
  DEFAULT_LOCALE,
  LOCALES,
  apiGuideContent,
  getContentForLocale,
} = siteContent;

const METHOD_GROUPS = [
  {
    titleKey: "readingAndWriting",
    names: [
      "at",
      "set",
      "row",
      "column",
      "diagonal",
      "reshape",
      "toFloat32Array",
      "toFlatArray",
      "toArray",
    ],
  },
  {
    titleKey: "elementwise",
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
      "map",
    ],
  },
  {
    titleKey: "matrixOperations",
    names: ["transpose", "matmul", "matvec", "dot", "clone"],
  },
  {
    titleKey: "reductions",
    names: ["sum", "minValue", "maxValue", "trace", "frobeniusNorm"],
  },
  {
    titleKey: "linearAlgebra",
    names: [
      "determinant",
      "logDet",
      "inverse",
      "solve",
      "leastSquares",
      "rank",
    ],
  },
  {
    titleKey: "memoryManagement",
    names: ["dispose", "[dispose]"],
  },
  {
    titleKey: "utilities",
    names: ["equalsApprox", "toString"],
  },
];

function byName(children = []) {
  return new Map(children.map((child) => [child.name, child]));
}

function escapeTable(value) {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function collapseWhitespace(value) {
  return value.replace(/[ \t]*\n[ \t]*/g, " ").replace(/[ \t]{2,}/g, " ")
    .trim();
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
    ?.map((blockTag) =>
      collapseWhitespace(renderCommentParts(blockTag.content))
    )
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
        const params = signature.parameters?.map(paramToString).join(", ") ??
          "";
        return `(${params}) => ${typeToString(signature.type)}`;
      }
      const children = type.declaration?.children ?? [];
      if (children.length === 0) return "object";
      return `{ ${
        children.map((child) =>
          `${child.name}${child.flags?.isOptional ? "?" : ""}: ${
            typeToString(child.type)
          }`
        ).join("; ")
      } }`;
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
  const returnType = member.name === "constructor"
    ? owner
    : typeToString(signature.type);
  return `${name}(${params})${
    member.name === "constructor" ? "" : `: ${returnType}`
  }`;
}

function shortCall(member, signature, owner = "Matrix") {
  const params = signature.parameters?.map((param) => {
    const prefix = param.flags?.isRest ? "..." : "";
    const suffix = param.flags?.isOptional ? "?" : "";
    return `${prefix}${param.name}${suffix}`;
  }).join(", ") ?? "";
  return `${signatureName(member, signature, owner)}(${params})`;
}

function apiGuidePathForLocale(locale) {
  if (locale === DEFAULT_LOCALE) return resolve(docsRoot, "docs/api-guide.md");
  return resolve(
    docsRoot,
    "i18n",
    locale,
    "docusaurus-plugin-content-docs",
    "current",
    "api-guide.md",
  );
}

function renderDetails(reflection, content) {
  const lines = [];
  const remarks = blockTags(reflection, "@remarks");
  const returns = blockTags(reflection, "@returns");
  const throws = blockTags(reflection, "@throws");
  const defaults = blockTags(reflection, "@defaultValue");

  for (const item of remarks) lines.push(`**${content.remarks}:** ${item}`);
  for (const item of returns) lines.push(`**${content.returns}:** ${item}`);
  for (const item of throws) lines.push(`**${content.throws}:** ${item}`);
  for (const item of defaults) {
    lines.push(`**${content.defaultLabel}:** ${item}`);
  }

  return lines.length ? `\n${lines.join("\n\n")}\n` : "";
}

function renderParameters(signature, content) {
  const params = signature.parameters ?? [];
  if (params.length === 0) return "";
  const rows = params.map((param) => {
    const name = `${param.name}${param.flags?.isOptional ? "?" : ""}`;
    const description = summaryOf(param) || "-";
    return `| \`${escapeTable(name)}\` | \`${
      escapeTable(typeToString(param.type))
    }\` | ${escapeTable(description)} |`;
  });
  return [
    `| ${content.parameter} | ${content.type} | ${content.descriptionLabel} |`,
    "| --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

function renderSignatureMember(member, content, owner = "Matrix") {
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
    const params = renderParameters(signature, content);
    if (params) lines.push(params);
    const details = renderDetails(signature, content);
    if (details) lines.push(details.trim(), "");
  }

  return lines.join("\n").trim();
}

function renderPropertyTable(title, properties, content) {
  const rows = properties.map((property) => {
    const marker = property.flags?.isReadonly ? "readonly " : "";
    const description = [
      summaryOf(property),
      ...blockTags(property, "@remarks"),
    ]
      .filter(Boolean)
      .join(" ");
    return `| \`${property.name}\` | \`${
      escapeTable(marker + typeToString(property.type))
    }\` | ${escapeTable(description || "-")} |`;
  });

  return [
    `## ${title}`,
    "",
    `| ${
      content.property ?? "Property"
    } | ${content.type} | ${content.descriptionLabel} |`,
    "| --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

function renderOptionTable(optionsReflection, content) {
  const rows = (optionsReflection.children ?? []).map((property) => {
    const defaultValue = blockTags(property, "@defaultValue")[0] ?? "-";
    const description = [
      summaryOf(property),
      ...blockTags(property, "@remarks"),
    ]
      .filter(Boolean)
      .join(" ");
    return `| \`${property.name}\` | \`${
      escapeTable(typeToString(property.type))
    }\` | ${escapeTable(defaultValue)} | ${escapeTable(description || "-")} |`;
  });

  return [
    `## ${content.configurationOptions}`,
    "",
    summaryOf(optionsReflection),
    "",
    `| ${content.option} | ${content.type} | ${content.defaultLabel} | ${content.descriptionLabel} |`,
    "| --- | --- | ---: | --- |",
    ...rows,
    "",
  ].join("\n");
}

function renderTypeAlias(typeAlias, content) {
  return [
    `## \`${typeAlias.name}\``,
    "",
    "```ts",
    `type ${typeAlias.name} = ${typeToString(typeAlias.type)}`,
    "```",
    "",
    summaryOf(typeAlias),
    renderDetails(typeAlias, content),
  ].join("\n").trim();
}

function renderTopLevel(reflection, content) {
  if (reflection.signatures?.length) {
    return renderSignatureMember(reflection, content, "");
  }

  return [
    `### \`${reflection.name}\``,
    "",
    "```ts",
    `const ${reflection.name}: ${typeToString(reflection.type)}`,
    "```",
    "",
    summaryOf(reflection),
    renderDetails(reflection, content),
  ].join("\n").trim();
}

function renderMethodGroup(group, membersByName, content) {
  const rendered = group.names
    .map((name) => membersByName.get(name))
    .filter(Boolean)
    .map((member) => renderSignatureMember(member, content))
    .filter(Boolean);

  if (rendered.length === 0) return "";
  return [`## ${content.methodGroups[group.titleKey]}`, "", ...rendered].join(
    "\n\n",
  );
}

function generatedMarkdown(project, content) {
  const rootMembers = byName(project.children);
  const matrix = rootMembers.get("Matrix");
  const matrixMembers = byName(
    (matrix.children ?? []).filter((child) => !child.flags?.isStatic),
  );
  const staticMethods = (matrix.children ?? [])
    .filter((child) => child.flags?.isStatic && child.signatures?.length)
    .sort((a, b) => a.name.localeCompare(b.name));
  const properties = (matrix.children ?? [])
    .filter((child) =>
      child.type && !child.signatures?.length && !child.flags?.isStatic
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const runtimeHelpers = [
    "SIMD_REQUIRED",
    "isSimdSupported",
    "createRuntime",
    "configure",
  ]
    .map((name) => rootMembers.get(name))
    .filter(Boolean);

  const sections = [
    "---",
    "id: api-guide",
    `title: ${content.title}`,
    `description: ${content.description}`,
    "keywords: [WASMatrix API, Matrix class, WebAssembly SIMD, AssemblyScript, TypeScript matrix library]",
    "sidebar_position: 2",
    "---",
    "",
    `<!-- ${content.generatedComment} -->`,
    "",
    `# ${content.title}`,
    "",
    content.intro,
    "",
    "```js",
    "import Matrix, {",
    "  SIMD_REQUIRED,",
    "  configure,",
    "  createRuntime,",
    "  isSimdSupported",
    '} from "wasmatrix";',
    "```",
    "",
    content.generatedNote,
    "",
    `## ${content.runtimeHelpers}`,
    "",
    ...runtimeHelpers.map((member) => renderTopLevel(member, content)).flatMap((
      item,
    ) => [item, ""]),
    renderOptionTable(rootMembers.get("WasmatrixOptions"), content),
    renderTypeAlias(rootMembers.get("WasmBytes"), content),
    "## `Matrix`",
    "",
    summaryOf(matrix),
    renderDetails(matrix, content).trim(),
    "",
    `## ${content.constructor}`,
    "",
    renderSignatureMember(matrixMembers.get("constructor"), content),
    "",
    renderPropertyTable(content.properties, properties, content),
    `## ${content.staticMethods}`,
    "",
    ...staticMethods.map((member) => renderSignatureMember(member, content))
      .flatMap((item) => [item, ""]),
    ...METHOD_GROUPS.map((group) =>
      renderMethodGroup(group, matrixMembers, content)
    ).filter(Boolean),
  ];

  return `${
    sections.filter((section) => section != null).join("\n\n").replace(
      /\n{3,}/g,
      "\n\n",
    ).trimEnd()
  }\n`;
}

await mkdir(dirname(jsonPath), { recursive: true });

const typedoc = await new Deno.Command(Deno.execPath(), {
  args: [
    "run",
    "-A",
    "npm:typedoc@0.28.20",
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
    "--excludeProtected",
  ],
  cwd: docsRoot,
  stdout: "inherit",
  stderr: "inherit",
}).output();

if (!typedoc.success) {
  throw new Error(`typedoc failed with ${typedoc.code}`);
}

const project = JSON.parse(await readFile(jsonPath, "utf8"));
const generatedPaths = [];

for (const { code } of LOCALES) {
  const outputPath = apiGuidePathForLocale(code);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    generatedMarkdown(project, getContentForLocale(apiGuideContent, code)),
  );
  generatedPaths.push(outputPath);
}

const formatter = await new Deno.Command(Deno.execPath(), {
  args: ["fmt", ...generatedPaths],
  stdout: "piped",
  stderr: "piped",
}).output();

if (!formatter.success) {
  await Deno.stderr.write(formatter.stdout);
  await Deno.stderr.write(formatter.stderr);
  throw new Error(`deno fmt failed with ${formatter.code}`);
}
