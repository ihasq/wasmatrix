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

The npm package ships TSDoc in `dist/index.d.ts`. Editors can show the same summaries, parameter notes, cache behavior, and common error conditions that are described here.

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

Options:

| Option | Default | Description |
| --- | ---: | --- |
| `fastMath` | `false` | Enables more aggressive algebraic rewrites. Keep it disabled when `NaN`, `Infinity`, `-0`, or strict rounding behavior is observable. |
| `cacheLimitBytes` | `64 * 1024 * 1024` | WASM heap budget for factorization, transpose, packed operand, reduction, and expression-result caches. |

## Creating Matrices

### `new Matrix(rows, cols, data?)`

Creates a matrix with `rows * cols` elements. Values are row-major. Omitting `data` creates a zero-filled matrix.

```js
const a = new Matrix(2, 3, [
  1, 2, 3,
  4, 5, 6
]);
```

### Static Constructors

| Method | Description |
| --- | --- |
| `Matrix.from(rows, cols, values)` | Creates a row-major matrix from `rows * cols` values. |
| `Matrix.zeros(rows, cols)` | Creates a zero-filled matrix with a zero structure tag. |
| `Matrix.ones(rows, cols)` | Creates a one-filled matrix with a ones structure tag. |
| `Matrix.identity(size)` | Creates an identity matrix. Identity structure enables shortcuts such as `I.matmul(A)`. |
| `Matrix.diagonal(values)` | Creates a dense diagonal matrix with a diagonal structure tag. |
| `Matrix.random(rows, cols, rng?)` | Creates values from `rng`, defaulting to `Math.random`. |
| `Matrix.outer(a, b)` | Computes the outer product with shape `a.length x b.length`. |
| `Matrix.matmulChain(a, b, c)` | Multiplies a compatible chain using a shape-based cost model. |

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

Readback snapshots do not mutate the matrix if you change the returned array. Use `set(row, col, value)` for scalar in-place writes.

`set()` increments the matrix version and invalidates cached factorizations, reductions, packed operands, and materialized views.

## Elementwise Operations

| Method | Description |
| --- | --- |
| `a.add(other)` | Adds a scalar, full matrix, row vector, or column vector. |
| `a.addScalar(value)` | Adds a scalar lazily. |
| `a.subtract(other)` | Subtracts a scalar, full matrix, row vector, or column vector. |
| `a.scale(value)` | Multiplies each element by a scalar lazily. |
| `a.multiply(other)` | Scales for numbers, performs broadcast elementwise multiplication for compatible row/column vectors, otherwise performs matrix multiplication. |
| `a.divide(other)` | Divides by a scalar, full matrix, row vector, or column vector. |
| `a.hadamard(other)` | Explicit elementwise multiplication. |
| `a.elementMultiply(other)` | Alias for `hadamard()`. |
| `a.min(other)` | Elementwise minimum. |
| `a.max(other)` | Elementwise maximum. |

`multiply(matrix)` performs matrix multiplication unless the right-hand side is broadcast-compatible. Use `hadamard()` when you want explicit elementwise multiplication.

Supported broadcasts:

```js
A.add(rowVector);     // 1 x columns
A.add(columnVector);  // rows x 1
A.hadamard(rowVector);
```

Unary operations:

| Method | Description |
| --- | --- |
| `a.negate()` | Negates every element lazily. |
| `a.abs()` | Applies absolute value lazily. |
| `a.sqrt()` | Applies square root lazily. |
| `a.floor()` | Applies floor lazily. |
| `a.ceil()` | Applies ceiling lazily. |
| `a.clamp(minValue, maxValue)` | Clamps values into `[minValue, maxValue]`; throws if `minValue > maxValue`. |
| `a.map(fn)` | Applies a JavaScript callback. This reads through JavaScript and is less efficient than built-in elementwise methods. |

Elementwise chains are represented lazily and fused into a single WASM pass when materialized.

## Matrix Operations

| Method | Description |
| --- | --- |
| `a.transpose()` | Returns a lazy transpose view. Double transpose collapses back to the original view. |
| `a.matmul(b)` | Matrix multiplication with transpose-aware kernels, structural shortcuts, inverse-view solves, and packed operand caches where applicable. |
| `a.matvec(vector)` | Matrix-vector multiplication returning a copied `Float32Array`. |
| `a.dot(other)` | Dot product over flattened row-major values. |
| `a.reshape(rows, cols)` | Creates a reshaped copy with the same element count. |
| `a.clone()` | Creates a deep copy with its own WASM buffer. |

Transposes are lazy views until a concrete buffer is required. Multiplication can select transpose-aware kernels and packed right-hand-side operands when the cost model says reuse is likely to pay off.

## Reductions

| Method | Description |
| --- | --- |
| `a.sum()` | Sum of all elements. |
| `a.minValue()` | Minimum element. |
| `a.maxValue()` | Maximum element. |
| `a.trace()` | Sum of the main diagonal. Some lazy products can compute trace without materializing the full product. |
| `a.frobeniusNorm()` | Frobenius norm. |

Reductions are cached by matrix version. Repeated scalar reads of the same immutable or lazy result avoid recomputing the same pass.

## Linear Algebra

| Method | Description |
| --- | --- |
| `a.determinant()` | Determinant of a square matrix. Uses structural shortcuts, Cholesky for SPD-tagged matrices where available, and LU otherwise. |
| `a.logDet()` | Natural log of a positive determinant; returns `NaN` when the determinant is not positive on the available path. |
| `a.inverse()` | Returns an inverse view where possible instead of eagerly forming a dense inverse. |
| `a.solve(rhs)` | Solves `A * X = rhs` using diagonal, Cholesky, or LU paths depending on structure. |
| `a.leastSquares(rhs)` | Solves a least-squares system for square or tall matrices using QR. |
| `a.rank(epsilon?)` | Estimates rank from QR, sharing the QR cache with `leastSquares()`. |

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

After `dispose()`, do not call methods or read properties on that matrix. Calling `dispose()` more than once is safe.

## Approximate Equality

```js
a.equalsApprox(b, 1e-6);
```

This compares shapes and values within an absolute tolerance. It is the recommended way to compare results produced by floating-point matrix operations.
