---
id: api-guide
title: API Guide
description: A practical guide to the WASMatrix Matrix API.
sidebar_position: 2
---

# API Guide

The default export is the `Matrix` class. Named exports include runtime helpers and global configuration.

```js
import Matrix, {
  SIMD_REQUIRED,
  configure,
  createRuntime,
  isSimdSupported
} from "wasmatrix";
```

## Runtime Helpers

### `SIMD_REQUIRED`

Always `true`. WASMatrix does not ship a scalar fallback.

### `isSimdSupported(wasmBytes?)`

Returns whether the loaded WASM bytes, or explicit bytes you pass in, validate in the current WebAssembly runtime.

```js
if (!isSimdSupported()) {
  throw new Error("WebAssembly SIMD is not available");
}
```

### `createRuntime(wasmBytes?)`

Creates a separate WASM runtime. Most users do not need this; the default runtime is initialized by the ESM entrypoint.

### `configure(options?)`

Configures process-wide optimization behavior.

```js
configure({
  fastMath: false,
  cacheLimitBytes: 64 * 1024 * 1024
});
```

## Creating Matrices

### `new Matrix(rows, cols, data?)`

Creates a matrix with `rows * cols` elements. Values are row-major.

```js
const a = new Matrix(2, 3, [
  1, 2, 3,
  4, 5, 6
]);
```

### Static Constructors

```js
Matrix.from(rows, cols, values);
Matrix.zeros(rows, cols);
Matrix.ones(rows, cols);
Matrix.identity(size);
Matrix.diagonal(values);
Matrix.random(rows, cols, rng);
Matrix.outer(a, b);
Matrix.matmulChain(a, b, c);
```

`Matrix.matmulChain(...)` chooses a multiplication order from matrix shapes and materializes the intermediate products in that order.

## Reading And Writing

```js
a.rows;
a.cols;
a.length;
a.shape;
a.byteOffset;
```

Use `at()` and `set()` for scalar access:

```js
const value = a.at(1, 2);
a.set(1, 2, value + 1);
```

Readback methods copy data from WASM memory into JavaScript:

```js
a.data;
a.toFloat32Array();
a.toFlatArray();
a.toArray();
a.row(0);
a.column(1);
a.diagonal();
```

`set()` increments the matrix version and invalidates cached factorizations, reductions, packed operands, and materialized views.

## Elementwise Operations

```js
a.add(b);
a.addScalar(1);
a.subtract(b);
a.scale(2);
a.multiply(b);
a.divide(b);
a.hadamard(b);
a.elementMultiply(b);
a.min(b);
a.max(b);
```

`multiply(matrix)` performs matrix multiplication unless the right-hand side is broadcast-compatible. Use `hadamard()` when you want explicit elementwise multiplication.

Supported broadcasts:

```js
A.add(rowVector);     // 1 x columns
A.add(columnVector);  // rows x 1
A.hadamard(rowVector);
```

Unary operations:

```js
a.negate();
a.abs();
a.sqrt();
a.floor();
a.ceil();
a.clamp(minValue, maxValue);
a.map((value, row, col) => value);
```

Elementwise chains are represented lazily and fused into a single WASM pass when materialized.

## Matrix Operations

```js
a.transpose();
a.matmul(b);
a.matvec(vector);
a.dot(other);
a.reshape(rows, cols);
a.clone();
```

Transposes are lazy views until a concrete buffer is required. Multiplication can select transpose-aware kernels and packed right-hand-side operands when the cost model says reuse is likely to pay off.

## Reductions

```js
a.sum();
a.minValue();
a.maxValue();
a.trace();
a.frobeniusNorm();
```

Reductions are cached by matrix version. Repeated scalar reads of the same immutable or lazy result avoid recomputing the same pass.

## Linear Algebra

```js
a.determinant();
a.logDet();
a.inverse();
a.solve(rhs);
a.leastSquares(rhs);
a.rank(epsilon);
```

Square systems use LU factorization by default. Gram and SPD-tagged matrices can use Cholesky. Rectangular rank and least-squares paths use QR.

Factorizations are cached per matrix version:

```js
const det = A.determinant();
const x = A.solve(B);
const inv = A.inverse();
```

The first call pays the factorization cost. Later compatible calls reuse it.

`A.inverse()` is represented lazily where possible. Expressions such as `A.inverse().matmul(B)` and `B.matmul(A.inverse())` lower to solve forms rather than eagerly materializing a dense inverse.

## Structural Shortcuts

WASMatrix keeps lightweight structure tags when construction paths make them obvious:

- identity
- zero
- ones
- diagonal
- Gram/SPD candidates

Examples:

```js
Matrix.identity(4).matmul(A); // A
Matrix.zeros(4, 4).matmul(A); // zero
Matrix.diagonal(d).matmul(A); // row scaling
A.matmul(Matrix.diagonal(d)); // column scaling
```

These shortcuts avoid dense work where the structure gives a cheaper kernel.

## Memory Management

Matrices own WASM-side memory. Use `dispose()` in long-running or allocation-heavy workflows:

```js
const tmp = A.matmul(B);
try {
  return tmp.sum();
} finally {
  tmp.dispose();
}
```

`Symbol.dispose` is also implemented for runtimes that support explicit resource management syntax.

## Approximate Equality

```js
a.equalsApprox(b, 1e-6);
```

This compares shapes and values within an absolute tolerance. It is the recommended way to compare results produced by floating-point matrix operations.
