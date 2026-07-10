/**
 * Whether this package requires WebAssembly SIMD support.
 *
 * @remarks
 * This is always `true`. WASMatrix does not ship a scalar fallback.
 *
 * @public
 */
export const SIMD_REQUIRED: true;

/**
 * Process-wide optimization and cache options.
 *
 * @public
 */
export interface WasmatrixOptions {
  /**
   * Enables more aggressive algebraic rewrites.
   *
   * @remarks
   * Keep this disabled when `NaN`, `Infinity`, `-0`, and strict floating-point
   * rounding behavior are observable in your workflow.
   *
   * @defaultValue `false`
   */
  fastMath?: boolean;

  /**
   * Maximum WASM heap budget used by reusable caches.
   *
   * @remarks
   * The limit covers factorization, transpose, packed operand, reduction, and
   * expression-result caches. Set to `0` to aggressively evict reusable cache
   * entries.
   *
   * @defaultValue `64 * 1024 * 1024`
   */
  cacheLimitBytes?: number;
}

/**
 * Raw WebAssembly module bytes accepted by runtime helpers.
 *
 * @public
 */
export type WasmBytes = ArrayBuffer | ArrayBufferView;

/**
 * Checks whether the current JavaScript runtime validates WASMatrix's SIMD WASM.
 *
 * @param wasmBytes - Optional explicit WASM bytes. When omitted, the default
 * package WASM bytes loaded by the ESM entrypoint are used.
 * @returns `true` when `WebAssembly.validate()` accepts the bytes.
 *
 * @public
 */
export function isSimdSupported(wasmBytes?: WasmBytes | null): boolean;

/**
 * Creates a separate WASM runtime instance.
 *
 * @remarks
 * Most users should use the default runtime initialized by the package
 * entrypoint. Separate runtimes are useful only when you intentionally want
 * isolated WASM memories and caches.
 *
 * @param wasmBytes - Optional explicit WASM bytes. When omitted, the default
 * package WASM bytes loaded by the ESM entrypoint are used.
 * @returns An opaque runtime handle used internally by matrix instances.
 *
 * @throws Error if no default WASM bytes are loaded.
 * @throws Error if SIMD validation or the ABI probe fails.
 *
 * @public
 */
export function createRuntime(wasmBytes?: WasmBytes | null): unknown;

/**
 * Configures global optimization behavior.
 *
 * @param options - Partial options to update.
 *
 * @remarks
 * Existing matrices keep their data, but cache sizing changes can evict cached
 * buffers immediately.
 *
 * @public
 */
export function configure(options?: WasmatrixOptions): void;

/**
 * Dense row-major `f32` matrix backed by WASM memory.
 *
 * @remarks
 * Most operations return another {@link Matrix}. Data stays in WASM memory until
 * you call a readback method such as {@link Matrix.toArray},
 * {@link Matrix.toFloat32Array}, {@link Matrix.row}, or {@link Matrix.column}.
 *
 * @public
 */
export class Matrix {
  /** Number of matrix rows. */
  readonly rows: number;

  /** Number of matrix columns. */
  readonly cols: number;

  /**
   * Byte offset of the materialized matrix buffer inside WASM memory.
   *
   * @remarks
   * Accessing this property can force lazy views or expressions to materialize.
   */
  readonly byteOffset: number;

  /**
   * Snapshot copied from WASM memory when accessed.
   *
   * @remarks
   * Mutating the returned typed array does not mutate the matrix. Use
   * {@link Matrix.set} for scalar in-place writes.
   */
  readonly data: Float32Array;

  /** Total number of elements, equal to `rows * cols`. */
  readonly length: number;

  /** Matrix shape as `[rows, cols]`. */
  readonly shape: [number, number];

  /**
   * Creates a matrix from row-major values.
   *
   * @param rows - Positive row count.
   * @param cols - Positive column count.
   * @param data - Optional row-major values. Omitted values create a zero matrix.
   * @param options - Reserved construction options.
   *
   * @throws RangeError if `rows`, `cols`, or `data.length` are invalid.
   */
  constructor(rows: number, cols: number, data?: ArrayLike<number> | null, options?: { copy?: boolean });

  /**
   * Creates a matrix from row-major values.
   *
   * @param rows - Positive row count.
   * @param cols - Positive column count.
   * @param values - Row-major values with length `rows * cols`.
   */
  static from(rows: number, cols: number, values: ArrayLike<number>): Matrix;

  /** Creates a zero-filled matrix. */
  static zeros(rows: number, cols: number): Matrix;

  /** Creates a one-filled matrix. */
  static ones(rows: number, cols: number): Matrix;

  /**
   * Creates an identity matrix.
   *
   * @remarks
   * Identity structure is tracked so operations such as `I.matmul(A)` can use
   * structural shortcuts.
   */
  static identity(size: number): Matrix;

  /**
   * Creates a dense diagonal matrix from vector values.
   *
   * @remarks
   * Diagonal structure is tracked for determinant, solve, inverse, and diagonal
   * matrix multiplication shortcuts.
   */
  static diagonal(values: ArrayLike<number> | Matrix): Matrix;

  /**
   * Creates a matrix using a random value generator.
   *
   * @param rows - Positive row count.
   * @param cols - Positive column count.
   * @param rng - Function returning each generated element. Defaults to
   * `Math.random`.
   */
  static random(rows: number, cols: number, rng?: () => number): Matrix;

  /**
   * Computes the outer product of two vectors.
   *
   * @param a - Left vector.
   * @param b - Right vector.
   * @returns A matrix with shape `a.length x b.length`.
   */
  static outer(a: ArrayLike<number> | Matrix, b: ArrayLike<number> | Matrix): Matrix;

  /**
   * Multiplies a compatible chain of matrices using a shape-based cost model.
   *
   * @remarks
   * The chain order is chosen by dynamic programming over matrix dimensions.
   * Intermediate products are materialized and disposed where possible.
   */
  static matmulChain(...matrices: Matrix[]): Matrix;

  /**
   * Multiplies a compatible chain of matrices using a shape-based cost model.
   *
   * @remarks
   * Array overload for callers that already hold the chain in a collection.
   */
  static matmulChain(matrices: Matrix[]): Matrix;

  /** Equivalent to the top-level {@link configure} helper. */
  static configure(options?: WasmatrixOptions): void;

  /**
   * Releases WASM memory and cached resources owned by this matrix.
   *
   * @remarks
   * Calling `dispose()` more than once is safe. Do not use the matrix after it
   * has been disposed.
   */
  dispose(): void;

  /** Integrates with runtimes that support explicit resource management. */
  [Symbol.dispose](): void;

  /**
   * Creates a deep copy with its own WASM buffer.
   *
   * @remarks
   * Lazy views are materialized before copying.
   */
  clone(): Matrix;

  /** Reads one scalar value from `row, col`. */
  at(row: number, col: number): number;

  /**
   * Writes one scalar value in place.
   *
   * @remarks
   * This increments the matrix version and invalidates cached factorizations,
   * reductions, materialized views, and packed operands.
   *
   * @returns This matrix.
   */
  set(row: number, col: number, value: number): this;

  /** Copies one row into a JavaScript `Float32Array`. */
  row(index: number): Float32Array;

  /** Copies one column into a JavaScript `Float32Array`. */
  column(index: number): Float32Array;

  /**
   * Copies the main diagonal into a JavaScript `Float32Array`.
   *
   * @remarks
   * The diagonal snapshot is cached by matrix version.
   */
  diagonal(): Float32Array;

  /**
   * Creates a reshaped copy with the same element count.
   *
   * @throws RangeError if `rows * cols !== this.length`.
   */
  reshape(rows: number, cols: number): Matrix;

  /** Copies matrix contents into a JavaScript `Float32Array`. */
  toFloat32Array(): Float32Array;

  /** Copies matrix contents into a row-major JavaScript number array. */
  toFlatArray(): number[];

  /** Copies matrix contents into nested JavaScript row arrays. */
  toArray(): number[][];

  /**
   * Adds a scalar, full matrix, row vector, or column vector.
   *
   * @remarks
   * Row vectors have shape `1 x cols`; column vectors have shape `rows x 1`.
   * Elementwise chains are represented lazily and fused when materialized.
   */
  add(other: Matrix | number): Matrix;

  /** Adds a scalar to every element lazily. */
  addScalar(value: number): Matrix;

  /**
   * Subtracts a scalar, full matrix, row vector, or column vector.
   *
   * @remarks
   * Scalar subtraction lowers to an affine lazy expression.
   */
  subtract(other: Matrix | number): Matrix;

  /** Multiplies every element by a scalar lazily. */
  scale(value: number): Matrix;

  /**
   * Multiplies by another value.
   *
   * @remarks
   * A numeric argument scales elementwise. A broadcast-compatible matrix uses
   * elementwise multiplication. Other matrix arguments use matrix
   * multiplication.
   */
  multiply(other: Matrix | number): Matrix;

  /**
   * Divides by a scalar, full matrix, row vector, or column vector.
   *
   * @remarks
   * Division follows JavaScript/WASM floating-point behavior for zero, `NaN`,
   * and infinities.
   */
  divide(other: Matrix | number): Matrix;

  /**
   * Elementwise matrix multiplication.
   *
   * @remarks
   * Supports full-shape operands and row/column broadcasts.
   */
  hadamard(other: Matrix): Matrix;

  /** Alias for {@link Matrix.hadamard}. */
  elementMultiply(other: Matrix): Matrix;

  /** Elementwise minimum with a full or broadcast-compatible matrix. */
  min(other: Matrix): Matrix;

  /** Elementwise maximum with a full or broadcast-compatible matrix. */
  max(other: Matrix): Matrix;

  /** Negates every element lazily. */
  negate(): Matrix;

  /** Applies absolute value lazily. */
  abs(): Matrix;

  /** Applies square root lazily. */
  sqrt(): Matrix;

  /** Applies floor lazily. */
  floor(): Matrix;

  /** Applies ceiling lazily. */
  ceil(): Matrix;

  /**
   * Clamps every element into `[minValue, maxValue]` lazily.
   *
   * @throws RangeError if `minValue > maxValue`.
   */
  clamp(minValue: number, maxValue: number): Matrix;

  /**
   * Applies a JavaScript callback to every element.
   *
   * @remarks
   * This reads the matrix into JavaScript and writes a new WASM-backed matrix.
   * Prefer built-in elementwise methods when possible.
   */
  map(fn: (value: number, row: number, col: number) => number): Matrix;

  /**
   * Returns a lazy transpose view.
   *
   * @remarks
   * The transposed buffer is materialized only when an operation requires a
   * concrete layout. `A.transpose().transpose()` collapses back to `A`.
   */
  transpose(): Matrix;

  /**
   * Matrix multiplication.
   *
   * @remarks
   * Transpose-aware kernels, diagonal shortcuts, identity/zero propagation,
   * inverse-view solves, Gram/SPD tags, and packed operand caches may be used
   * according to shape and structure.
   */
  matmul(other: Matrix): Matrix;

  /**
   * Multiplies this matrix by a vector.
   *
   * @param vector - Array-like or matrix vector with length equal to `cols`.
   * @returns A copied JavaScript `Float32Array` with length `rows`.
   */
  matvec(vector: ArrayLike<number> | Matrix): Float32Array;

  /**
   * Computes the dot product with another vector-like value.
   *
   * @remarks
   * Both operands are flattened row-major and must have the same length.
   */
  dot(other: Matrix | ArrayLike<number>): number;

  /** Sums all elements, cached by matrix version. */
  sum(): number;

  /** Returns the minimum element, cached by matrix version. */
  minValue(): number;

  /** Returns the maximum element, cached by matrix version. */
  maxValue(): number;

  /**
   * Returns the trace of the matrix.
   *
   * @remarks
   * For some lazy products, the trace can be computed without materializing the
   * full dense product.
   */
  trace(): number;

  /** Returns the Frobenius norm, cached by matrix version. */
  frobeniusNorm(): number;

  /**
   * Computes the determinant of a square matrix.
   *
   * @remarks
   * Uses structural shortcuts, Cholesky for SPD-tagged matrices when available,
   * and LU factorization otherwise. Results are cached by matrix version.
   *
   * @throws RangeError if the matrix is not square.
   */
  determinant(): number;

  /**
   * Computes the natural log of a positive determinant.
   *
   * @remarks
   * Returns `NaN` when the available path determines that the determinant is not
   * positive.
   */
  logDet(): number;

  /**
   * Returns an inverse view where possible.
   *
   * @remarks
   * The dense inverse is avoided until required. Expressions such as
   * `A.inverse().matmul(B)` lower to `A.solve(B)`.
   */
  inverse(): Matrix;

  /**
   * Solves `this * X = rhs`.
   *
   * @remarks
   * Square systems use diagonal, Cholesky, or LU paths depending on structure.
   * Factorizations are cached by matrix version and reused across compatible
   * `determinant`, `solve`, and `inverse` operations.
   *
   * @throws RangeError if the matrix is not square, the RHS shape is invalid, or
   * the system is singular.
   */
  solve(rhs: Matrix | ArrayLike<number>): Matrix;

  /**
   * Solves a least-squares system for tall or square matrices.
   *
   * @remarks
   * Uses QR factorization and shares the QR cache with {@link Matrix.rank}.
   *
   * @throws RangeError if `rows < cols`, the RHS shape is invalid, or the matrix
   * is rank deficient.
   */
  leastSquares(rhs: Matrix | ArrayLike<number>): Matrix;

  /**
   * Estimates matrix rank with a QR factorization.
   *
   * @param epsilon - Absolute threshold for nonzero diagonal entries of `R`.
   */
  rank(epsilon?: number): number;

  /**
   * Compares matrices with an absolute tolerance.
   *
   * @param other - Matrix with the same shape.
   * @param epsilon - Absolute tolerance. Defaults to `1e-6`.
   */
  equalsApprox(other: Matrix, epsilon?: number): boolean;

  /** Formats the matrix as tab-separated rows. */
  toString(): string;
}

export default Matrix;
