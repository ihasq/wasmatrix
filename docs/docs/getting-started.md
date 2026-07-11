---
id: getting-started
title: Getting Started
description: Install WASMatrix, load its WebAssembly SIMD runtime, and run practical matrix workflows.
keywords: [
  WASMatrix,
  WebAssembly SIMD,
  AssemblyScript,
  TypeScript matrix library,
  JavaScript linear algebra,
]
sidebar_position: 1
---

# Getting Started

WASMatrix is a TypeScript-authored matrix library backed by an AssemblyScript
WebAssembly core. It keeps matrix buffers in WASM memory, uses `f32` row-major
storage, and requires WebAssembly SIMD.

This guide walks through the first things most users need:

- install the package
- create matrices
- run matrix, elementwise, and linear algebra operations
- read results back only when you need them
- understand when cached factorizations and lazy views help

## Installation

```bash
npm install wasmatrix
```

WASMatrix is ESM-only. Importing the package initializes the adjacent WASM asset
with top-level await:

```js
import Matrix from "wasmatrix";
```

The published package ships JavaScript and WASM separately:

```text
dist/index.js
dist/index.d.ts
dist/wasmatrix.wasm
```

The runtime resolves the WASM file with
`new URL("./wasmatrix.wasm", import.meta.url)`. That gives Node, Deno, Bun,
browsers, CDNs, and bundlers a standard asset reference to rewrite, host, or
inline according to their own rules.

## Runtime Requirements

WASMatrix needs:

- ESM
- top-level await
- WebAssembly SIMD

Modern SIMD-capable browsers satisfy these requirements. Node, Deno, and Bun use
the same ESM entrypoint.

You can check support after import:

```js
import { isSimdSupported } from "wasmatrix";

console.log(isSimdSupported());
```

If SIMD validation fails, WASMatrix throws during module initialization instead
of falling back to a slower scalar implementation.

## Run Your First Program

Create a file named `hello.ts`:

```js
import Matrix from "wasmatrix";

const A = Matrix.from(2, 2, [
  4,
  7,
  2,
  6,
]);

const b = Matrix.from(2, 1, [
  1,
  0,
]);

const x = A.solve(b);

console.log("det(A)", A.determinant());
console.log("solution", x.toArray());
console.log("check", A.matmul(x).equalsApprox(b));
```

Run it with Deno:

```bash
deno run --allow-read hello.ts
```

The same source works in Bun:

```bash
bun hello.ts
```

Node projects can run the same source through their normal TypeScript toolchain.
The important detail is that `solve`, `determinant`, and `matmul` run inside the
WASM runtime. JavaScript only receives the final values printed by `toArray()`,
`determinant()`, and `equalsApprox()`.

Try the batched write-out path in the sandbox:

<wasmatrix-sandbox code={`const A = Matrix.from(2, 2, [ 1, 2, 3, 4 ]);

const B = Matrix.from(2, 2, [ 5, 6, 7, 8 ]);

const C = A.matmul(B);

console.table(C.toArray());`}></wasmatrix-sandbox>

## Create Matrices

`Matrix.from(rows, cols, values)` is the most direct constructor. Values are
row-major:

```js
const A = Matrix.from(2, 3, [
  1,
  2,
  3,
  4,
  5,
  6,
]);
```

Use static constructors when the structure is known:

```js
const Z = Matrix.zeros(3, 3);
const O = Matrix.ones(3, 2);
const I = Matrix.identity(4);
const D = Matrix.diagonal([2, 4, 8]);
```

These constructors carry structure tags. For example,
`Matrix.identity(4).matmul(A)` can return an identity shortcut instead of doing
a full dense multiply.

For reproducible examples, pass your own random function:

```js
let seed = 1;
const rng = () => {
  seed = (seed * 48271) % 0x7fffffff;
  return seed / 0x7fffffff;
};

const R = Matrix.random(3, 3, rng);
```

## Keep Data In WASM

Most methods return another `Matrix`. The result stays in WASM memory:

```js
const result = A
  .scale(2)
  .addScalar(1)
  .sqrt()
  .clamp(0, 4);
```

Nothing is copied into a JavaScript array until you explicitly read it:

```js
result.toArray();
result.toFloat32Array();
result.toFlatArray();
result.row(0);
result.column(1);
result.diagonal();
```

Use this style for larger pipelines: build the expression in JavaScript, let
WASM do the numeric work, and read back only the final result.

## Elementwise Pipelines

Elementwise chains are represented lazily and fused into one WASM pass when
materialized. This avoids creating a temporary matrix for every step:

```js
const Y = A
  .add(B)
  .subtract(0.25)
  .hadamard(C)
  .clamp(-2, 2)
  .sqrt();
```

Broadcasting works with row and column vectors:

```js
const centered = X.subtract(rowMeans);
const scaled = centered.divide(columnStddev);
```

Here is the sandbox preview for the current write-out path:

<wasmatrix-sandbox code={`const X = Matrix.from(2, 3, [ 1, 2, 3, 4, 5, 6 ]);

const W = Matrix.from(3, 2, [ 7, 8, 9, 10, 11, 12 ]);

const Y = X.matmul(W);

console.table(Y.toArray());`}></wasmatrix-sandbox>

The row vector is applied across columns, and the column vector is applied down
rows. Neither one needs to be expanded into a dense matrix.

## Matrix Multiplication

Use `matmul()` for matrix multiplication:

```js
const C = A.matmul(B);
```

Use `hadamard()` or `elementMultiply()` for elementwise multiplication:

```js
const maskApplied = A.hadamard(mask);
```

Transposes are lazy views until a concrete buffer is required:

```js
const gram = X.transpose().matmul(X);
```

For large shapes, WASMatrix can select transpose-aware kernels instead of
materializing the transpose first. Gram matrices also carry structure
information that can connect to Cholesky-backed `solve`, `determinant`,
`logDet`, and `inverse` paths.

```js
const covarianceLike = X.transpose().matmul(X);
const regularized = covarianceLike.add(
  Matrix.identity(covarianceLike.rows).scale(1e-3),
);
const weights = regularized.solve(rhs);
```

## Linear Algebra Without Dense Inverses

Prefer `solve()` when you want `A^-1 B`:

```js
const x = A.solve(b);
```

This avoids explicitly forming a dense inverse. It is usually faster and more
numerically stable than:

```js
const x = A.inverse().matmul(b);
```

WASMatrix still supports `inverse()`, but inverse results are represented lazily
where possible. Expressions such as `A.inverse().matmul(B)` lower to solve forms
instead of eagerly materializing the inverse.

The factorization cache is versioned. Reusing the same matrix object lets
compatible linear algebra observations share work. The sandbox preview remains
on the current batched write-out path:

<wasmatrix-sandbox code={`const A = Matrix.from(3, 2, [ 1, 0, 0, 1, 1, 1 ]);

const B = Matrix.from(2, 2, [ 2, 3, 5, 7 ]);

const AB = A.matmul(B);

console.table(AB.toArray());`}></wasmatrix-sandbox>

The first compatible linear algebra call pays the factorization cost. Later
calls on the same matrix version can reuse the cached factorization.

## Mutation And Cache Invalidation

Matrices are mutable only through explicit scalar writes:

```js
A.set(0, 0, A.at(0, 0) + 1);
```

`set()` increments the matrix version and invalidates cached factorizations,
reductions, packed operands, and materialized views. This keeps cached results
tied to the data that produced them.

If you want cache reuse, keep the coefficient matrix object stable:

```js
const x1 = A.solve(b1);
const x2 = A.solve(b2); // can reuse A's factorization
```

If you mutate `A` between the two calls, WASMatrix recomputes the required
cached data.

## Configuration

```js
import { configure } from "wasmatrix";

configure({
  fastMath: false,
  cacheLimitBytes: 64 * 1024 * 1024,
});
```

`fastMath` enables more aggressive algebraic rewrites, such as exact identity
folding. Keep it off when you need conservative behavior around `NaN`,
`Infinity`, `-0`, and floating-point rounding.

`cacheLimitBytes` controls the WASM heap budget for reusable factorization,
transpose, packed operand, reduction, and expression-result caches. Set it lower
for memory-constrained environments, or higher for repeated solve and
multiplication workloads.

## Dispose Long-Lived Temporaries

Matrices own WASM-side memory. Short scripts can usually rely on garbage
collection and `FinalizationRegistry`, but long-running services, apps, and
benchmarks should dispose large temporaries deliberately:

```js
const tmp = A.matmul(B);
try {
  console.log(tmp.frobeniusNorm());
} finally {
  tmp.dispose();
}
```

Do not use a matrix after calling `dispose()`.

## Development Build

```bash
deno task build
deno task test
deno task test:e2e
deno task benchmark
```

`deno task build` compiles the AssemblyScript kernel, emits
`build/wasmatrix.wasm`, compiles the TypeScript runtime, and copies the
distributable WASM file into `dist/wasmatrix.wasm`.

The benchmark suite prints JSON with timings, speedups, and checksums so changes
can be compared against the JavaScript reference implementation.

## Where To Go Next

Read the [API Guide](./api-guide.md) for the full method list, structural
shortcuts, cache behavior, and memory-management details.
