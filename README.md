# WASMatrix

[![npm](https://img.shields.io/npm/v/wasmatrix.svg)](https://www.npmjs.com/package/wasmatrix)
[![codecov](https://codecov.io/gh/ihasq/wasmatrix/branch/main/graph/badge.svg)](https://codecov.io/gh/ihasq/wasmatrix)

Fast matrix operations for JavaScript runtimes, powered by AssemblyScript and WebAssembly SIMD.

WASMatrix gives you a small TypeScript API on top of a row-major `Float32` WASM core. It is built for projects that want real linear algebra without turning every operation into a JavaScript heap round trip.

- WebAssembly SIMD is required.
- Browser, Node, Deno, and Bun are first-class targets.
- The npm package ships ESM JavaScript and WASM as separate files.
- Matrix buffers stay in WASM memory until you explicitly read them back.
- Lazy views, expression fusion, factorization caches, and structural shortcuts are enabled by default where they preserve normal semantics.

Repository: [github.com/ihasq/wasmatrix](https://github.com/ihasq/wasmatrix)

## Install

```sh
npm install wasmatrix
```

WASMatrix is ESM-only. The published entrypoint uses top-level await to instantiate the adjacent WASM asset before exports are available:

```js
import Matrix from "wasmatrix";

const a = Matrix.from(2, 2, [4, 7, 2, 6]);
const inverse = a.inverse();

console.log(a.determinant()); // 10
console.log(a.matmul(inverse).equalsApprox(Matrix.identity(2))); // true
```

## Runtime Loading

The package publishes:

- `dist/index.js`
- `dist/index.d.ts`
- `dist/wasmatrix.wasm`

`dist/index.js` loads the WASM file with:

```js
new URL("./wasmatrix.wasm", import.meta.url)
```

That shape is intentional. npm installs keep JavaScript and WASM as separate files, while CDNs and bundlers such as esm.sh can rewrite, host, or inline the WASM asset using their own pipeline.

Node local `file:` imports are handled internally. Browser, Deno, Bun, and CDN usage follow the normal fetchable asset path.

## Quick Tour

```js
import Matrix, { configure, isSimdSupported } from "wasmatrix";

console.log(isSimdSupported()); // true when the loaded WASM validates

configure({
  fastMath: false,
  cacheLimitBytes: 64 * 1024 * 1024
});

const a = Matrix.from(2, 3, [
  1, 2, 3,
  4, 5, 6
]);

const row = Matrix.from(1, 3, [10, 20, 30]);
const b = a.add(row).scale(0.5).sqrt();

console.log(b.toArray()); // explicit readback from WASM memory
```

Most operations return another `Matrix`. The data stays in WASM memory until you ask for `data`, `toFloat32Array()`, `toFlatArray()`, `toArray()`, `row()`, `column()`, or `diagonal()`.

## API At A Glance

Creation:

```js
Matrix.from(rows, cols, values);
Matrix.zeros(rows, cols);
Matrix.ones(rows, cols);
Matrix.identity(size);
Matrix.diagonal(values);
Matrix.random(rows, cols);
Matrix.outer(a, b);
```

Elementwise and scalar operations:

```js
a.add(b);
a.subtract(b);
a.hadamard(b);
a.divide(b);
a.scale(2);
a.addScalar(1);
a.clamp(-1, 1);
a.sqrt();
```

Matrix operations:

```js
a.transpose();
a.matmul(b);
a.matvec(vector);
Matrix.matmulChain(a, b, c, d);
```

Reductions and linear algebra:

```js
a.sum();
a.minValue();
a.maxValue();
a.trace();
a.frobeniusNorm();

a.determinant();
a.logDet();
a.inverse();
a.solve(rhs);
a.leastSquares(rhs);
a.rank();
```

Utilities:

```js
a.at(row, col);
a.set(row, col, value);
a.reshape(rows, cols);
a.equalsApprox(other);
a.dispose();
```

## What Gets Optimized

WASMatrix tries to remove avoidable work before it reaches the kernel layer.

Elementwise chains are fused into a single WASM pass where possible:

```js
A.add(B).subtract(0.25).hadamard(C).clamp(-2, 2).sqrt();
```

Scalar chains fold into affine forms:

```js
A.scale(2).scale(3).addScalar(1); // one pass: 6 * x + 1
```

Broadcast row and column vectors stay compact:

```js
A.add(rowVector);
A.add(columnVector);
A.hadamard(rowVector);
```

Linear algebra operations share factorization work:

```js
const det = A.determinant();
const x = A.solve(B);
const inv = A.inverse();
```

The same matrix can reuse LU, Cholesky, QR, transpose, packed GEMM operands, reductions, and materialized expression results as long as its version has not changed.

Some algebraic rewrites can change floating-point edge cases around `NaN`, `Infinity`, `-0`, or rounding. These remain conservative by default. More aggressive identity folding can be enabled explicitly:

```js
configure({ fastMath: true });
```

## Memory Model

`Matrix` instances own WASM-side buffers. A JavaScript typed array is created only when you read data back.

```js
const result = A.matmul(B).add(C).sqrt(); // stays in WASM/lazy form
const values = result.toFloat32Array();   // snapshot copied to JS
```

Use `dispose()` when you know a matrix is no longer needed, especially in long-running pipelines. FinalizationRegistry is used when available, but explicit disposal gives tighter control over WASM heap pressure.

## Platform Notes

WASMatrix needs:

- ESM
- top-level await
- WebAssembly SIMD

Modern SIMD-capable browsers satisfy these requirements. Node support follows the package `engines` field. Deno and Bun work through the same ESM + WASM asset path.

When bundling, make sure your tool treats `new URL("./wasmatrix.wasm", import.meta.url)` as an asset reference. This is the format expected by modern bundlers and CDN transforms.

## Development

```sh
npm install
npm run build
npm test
npm run coverage
npm run test:e2e
npm run benchmark
```

`npm run build` compiles `src/assembly/index.ts` with SIMD enabled, emits `build/wasmatrix.wasm` and `build/wasmatrix.wat`, compiles `src/index.ts` to `dist/index.js`, and copies the WASM binary to `dist/wasmatrix.wasm`.

`npm test` runs unit tests and E2E transparency tests. `npm run coverage` writes `coverage/lcov.info`; CI derives `coverage/codecov.lcov.info` from it for the Codecov badge. `npm run benchmark` runs the E2E benchmark suite and prints a JSON summary with timings, speedups, and checksums.

Benchmark sizes can be adjusted with environment variables such as `WASMATRIX_BENCH_MATMUL_SIZE`, `WASMATRIX_BENCH_ELEMENT_ROWS`, `WASMATRIX_BENCH_ELEMENT_COLS`, and `WASMATRIX_BENCH_LINALG_SIZE`.

## Status

WASMatrix is early software. The API is already useful for dense `f32` workflows, but more structures and higher-level algebraic representations are still being explored. Issues and focused benchmarks are welcome on [GitHub](https://github.com/ihasq/wasmatrix).
