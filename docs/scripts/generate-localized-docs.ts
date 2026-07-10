import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import siteContent from "../src/i18n/siteContent.cjs";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const docsRoot = resolve(scriptsDir, "..");
const {
  DEFAULT_LOCALE,
  LOCALES,
  getContentForLocale,
  gettingStartedContent,
} = siteContent;

function localizedDocPath(locale, docName) {
  return resolve(
    docsRoot,
    "i18n",
    locale,
    "docusaurus-plugin-content-docs",
    "current",
    `${docName}.md`,
  );
}

function bulletList(items) {
  return items.map((item) => `- ${item}`).join("\n");
}

function gettingStartedMarkdown(content) {
  return `---
id: getting-started
title: ${content.title}
description: ${content.description}
sidebar_position: 1
---

# ${content.title}

${content.intro}

${content.checklistIntro}

${bulletList(content.checklist)}

## ${content.installation}

\`\`\`bash
npm install wasmatrix
\`\`\`

${content.installationBody}

\`\`\`js
import Matrix from "wasmatrix";
\`\`\`

${content.packageBody}

## ${content.requirements}

${content.requirementsBody}

\`\`\`js
import { isSimdSupported } from "wasmatrix";

console.log(isSimdSupported());
\`\`\`

## ${content.firstProgram}

${content.firstProgramBody}

\`\`\`js
import Matrix from "wasmatrix";

const A = Matrix.from(2, 2, [
  4, 7,
  2, 6
]);

const b = Matrix.from(2, 1, [
  1,
  0
]);

const x = A.solve(b);

console.log("det(A)", A.determinant());
console.log("solution", x.toArray());
console.log("check", A.matmul(x).equalsApprox(b));
\`\`\`

\`\`\`bash
node hello.mjs
bun hello.mjs
deno run --allow-read hello.mjs
\`\`\`

${content.firstProgramResult}

<wasmatrix-sandbox code={\`const A = Matrix.from(2, 2, [
  4, 7,
  2, 6
]);

const b = Matrix.from(2, 1, [
  1,
  0
]);

const x = A.solve(b);
const check = A.matmul(x);

console.log("det(A)", A.determinant());
console.log("x");
console.table(x.toArray());
console.log("A * x");
console.table(check.toArray());
console.log("matches b", check.equalsApprox(b));\`}></wasmatrix-sandbox>

## ${content.createMatrices}

${content.createMatricesBody}

\`\`\`js
const A = Matrix.from(2, 3, [
  1, 2, 3,
  4, 5, 6
]);

const Z = Matrix.zeros(3, 3);
const O = Matrix.ones(3, 2);
const I = Matrix.identity(4);
const D = Matrix.diagonal([2, 4, 8]);
\`\`\`

## ${content.keepData}

${content.keepDataBody}

\`\`\`js
const result = A
  .scale(2)
  .addScalar(1)
  .sqrt()
  .clamp(0, 4);

const values = result.toArray();
\`\`\`

## ${content.elementwise}

${content.elementwiseBody}

\`\`\`js
const Y = A
  .add(B)
  .subtract(0.25)
  .hadamard(C)
  .clamp(-2, 2)
  .sqrt();

const centered = X.subtract(rowMeans);
const scaled = centered.divide(columnStddev);
\`\`\`

## ${content.linear}

${content.linearBody}

\`\`\`js
const x = A.solve(b);
const det = A.determinant();
const again = A.solve(otherRightHandSide);
\`\`\`

## ${content.mutation}

${content.mutationBody}

\`\`\`js
A.set(0, 0, A.at(0, 0) + 1);
\`\`\`

## ${content.configuration}

${content.configurationBody}

\`\`\`js
import { configure } from "wasmatrix";

configure({
  fastMath: false,
  cacheLimitBytes: 64 * 1024 * 1024
});
\`\`\`

## ${content.dispose}

${content.disposeBody}

\`\`\`js
const tmp = A.matmul(B);
try {
  console.log(tmp.frobeniusNorm());
} finally {
  tmp.dispose();
}
\`\`\`

## ${content.development}

${content.developmentBody}

\`\`\`bash
deno task build
deno task test
deno task test:e2e
deno task benchmark
\`\`\`

## ${content.next}

${content.nextBody}
`;
}

for (const { code } of LOCALES) {
  if (code === DEFAULT_LOCALE) continue;
  const outputPath = localizedDocPath(code, "getting-started");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    gettingStartedMarkdown(getContentForLocale(gettingStartedContent, code)),
  );
}
