const EPSILON: f64 = 1.0e-12;

declare namespace WasmatrixComponentWit {
  export const packageId: "ihasq:wasmatrix@0.1.0";
  export const interfaceName: "matrix-api";
  export const worldName: "wasmatrix";

  export class Record {}
  export class Variant {}
  export class Resource {}
  export class Result<T, E> {}
  export class Borrow<T> {}
  export class List<T> {}
  export class Option<T> {}

  export class Shape extends Record {
    rows: u32;
    cols: u32;
  }

  export enum MatrixError {
    InvalidShape,
    ShapeMismatch,
    NotSquare,
    IndexOutOfRange,
    Singular,
    Disposed,
  }

  export class Operand extends Variant {
    scalar: f32;
    matrix: Borrow<Matrix>;
  }

  export class Matrix extends Resource {
    constructor(rows: u32, cols: u32, data: Option<List<f32>>);

    static zeros(rows: u32, cols: u32): Result<Matrix, MatrixError>;
    static ones(rows: u32, cols: u32): Result<Matrix, MatrixError>;
    static identity(size: u32): Result<Matrix, MatrixError>;
    static diagonal(values: List<f32>): Result<Matrix, MatrixError>;
    static outer(left: List<f32>, right: List<f32>): Result<Matrix, MatrixError>;

    shape(): Shape;
    version(): u32;
    at(row: u32, col: u32): Result<f32, MatrixError>;
    set(row: u32, col: u32, value: f32): Result<void, MatrixError>;
    clone(): Matrix;
    toList(): List<f32>;

    add(other: Operand): Result<Matrix, MatrixError>;
    subtract(other: Operand): Result<Matrix, MatrixError>;
    scale(value: f32): Matrix;
    divide(other: Operand): Result<Matrix, MatrixError>;
    hadamard(other: Borrow<Matrix>): Result<Matrix, MatrixError>;
    min(other: Borrow<Matrix>): Result<Matrix, MatrixError>;
    max(other: Borrow<Matrix>): Result<Matrix, MatrixError>;
    negate(): Matrix;
    abs(): Matrix;
    sqrt(): Matrix;
    floor(): Matrix;
    ceil(): Matrix;
    clamp(minValue: f32, maxValue: f32): Result<Matrix, MatrixError>;

    transpose(): Matrix;
    matmul(other: Borrow<Matrix>): Result<Matrix, MatrixError>;
    solve(rhs: Borrow<Matrix>): Result<Matrix, MatrixError>;
    leastSquares(rhs: Borrow<Matrix>): Result<Matrix, MatrixError>;
    inverse(): Result<Matrix, MatrixError>;

    sum(): f64;
    minValue(): f32;
    maxValue(): f32;
    trace(): f64;
    frobeniusNorm(): f64;
    determinant(): Result<f64, MatrixError>;
    logDet(): Result<f64, MatrixError>;
    rank(epsilon: f64): Result<u32, MatrixError>;
    equalsApprox(other: Borrow<Matrix>, epsilon: f64): Result<bool, MatrixError>;
  }
}

// @wasmatrix-js-adapter begin
// export const SIMD_REQUIRED = true;
//
// export interface WasmatrixOptions {
//   fastMath?: boolean;
//   cacheLimitBytes?: number;
// }
//
// type WasmBytes = any;
//
// const DEFAULT_WASM_URL = new URL("./wasmatrix.wasm", import.meta.url);
// let defaultWasmBytes: Uint8Array | null = null;
// const optimizationOptions = {
//   fastMath: false,
//   cacheLimitBytes: 64 * 1024 * 1024
// };
//
// const EW_ADD = 1;
// const EW_SUBTRACT = 2;
// const EW_MULTIPLY = 3;
// const EW_DIVIDE = 4;
// const EW_MIN = 5;
// const EW_MAX = 6;
// const EW_ADD_SCALAR = 7;
// const EW_MULTIPLY_SCALAR = 8;
// const EW_DIVIDE_SCALAR = 9;
// const EW_NEGATE = 10;
// const EW_ABS = 11;
// const EW_SQRT = 12;
// const EW_FLOOR = 13;
// const EW_CEIL = 14;
// const EW_CLAMP = 15;
//
// const OPERAND_FULL = 0;
// const OPERAND_ROW = 1;
// const OPERAND_COLUMN = 2;
//
// const MATMUL_NN = "NN";
// const MATMUL_TN = "TN";
// const MATMUL_NT = "NT";
// const MATMUL_TT = "TT";
//
// let defaultRuntime: any = null;
// let nextRuntimeId = 1;
// let nextMatrixId = 1;
//
// /* c8 ignore start */
// const matrixFinalizer: FinalizationRegistry<any> | null = typeof FinalizationRegistry === "function"
//   ? new FinalizationRegistry(({ runtime, ptr }) => runtime.free(ptr))
//   : null;
//
// const cacheFinalizer: FinalizationRegistry<any> | null = typeof FinalizationRegistry === "function"
//   ? new FinalizationRegistry((entry) => entry.dispose())
//   : null;
// /* c8 ignore stop */
//
// function assertInteger(value, name) {
//   if (!Number.isInteger(value)) {
//     throw new TypeError(`${name} must be an integer`);
//   }
// }
//
// function assertPositiveInteger(value, name) {
//   assertInteger(value, name);
//   if (value <= 0) {
//     throw new RangeError(`${name} must be greater than zero`);
//   }
// }
//
// function assertNonNegativeInteger(value, name) {
//   assertInteger(value, name);
//   if (value < 0) {
//     throw new RangeError(`${name} must be non-negative`);
//   }
// }
//
// function assertFiniteNumber(value, name) {
//   if (typeof value !== "number" || !Number.isFinite(value)) {
//     throw new TypeError(`${name} must be a finite number`);
//   }
// }
//
// function sizeOf(rows, cols) {
//   const length = rows * cols;
//   if (!Number.isSafeInteger(length)) {
//     throw new RangeError("matrix is too large");
//   }
//   return length;
// }
//
// function assertArrayLike(value, name) {
//   if (value == null || typeof value.length !== "number") {
//     throw new TypeError(`${name} must be array-like`);
//   }
// }
//
// function toFloat32Array(value, name) {
//   assertArrayLike(value, name);
//   return value instanceof Float32Array ? value : Float32Array.from(value);
// }
//
// /* c8 ignore start */
// function createAbort() {
//   return (_message, _file, line, column) => {
//     throw new Error(`wasmatrix wasm abort at ${line}:${column}`);
//   };
// }
// /* c8 ignore stop */
//
// async function readWasmBytes(url: URL): Promise<Uint8Array> {
//   if (url.protocol !== "file:") {
//     /* c8 ignore start */
//     if (typeof fetch !== "function") {
//       throw new Error(`wasmatrix cannot fetch ${url.href} in this JavaScript runtime`);
//     }
//
//     const response = await fetch(url);
//     if (!response.ok) {
//       throw new Error(`wasmatrix failed to fetch ${url.href}: ${response.status} ${response.statusText}`);
//     }
//     return new Uint8Array(await response.arrayBuffer());
//   }
//   /* c8 ignore stop */
//
//   const { readFile } = await import("node:fs/promises");
//   return new Uint8Array(await readFile(url));
// }
//
// export function isSimdSupported(wasmBytes: WasmBytes | null = null): boolean {
//   /* c8 ignore start */
//   if (typeof WebAssembly === "undefined" || typeof WebAssembly.validate !== "function") {
//     return false;
//   }
//
//   if (wasmBytes == null && defaultWasmBytes == null) {
//     return false;
//   }
//   /* c8 ignore stop */
//
//   return WebAssembly.validate(wasmBytes ?? defaultWasmBytes);
// }
//
// function instantiateRuntime(wasmBytes: WasmBytes) {
//   if (!isSimdSupported(wasmBytes)) {
//     throw new Error("wasmatrix requires a WebAssembly runtime with SIMD support");
//   }
//
//   const module = new WebAssembly.Module(wasmBytes);
//   const instance = new WebAssembly.Instance(module, {
//     env: {
//       abort: createAbort()
//     }
//   });
//   const exports = instance.exports as any;
//
//   /* c8 ignore start */
//   if (exports.simdProbe() !== 1) {
//     throw new Error("wasmatrix SIMD probe failed");
//   }
//   if (exports.abiVersion() !== 6) {
//     throw new Error(`Unsupported wasmatrix ABI version: ${exports.abiVersion()}`);
//   }
//   /* c8 ignore stop */
//
//   return new WasmRuntime(exports);
// }
//
// export function createRuntime(wasmBytes: WasmBytes | null = null): unknown {
//   /* c8 ignore start */
//   if (wasmBytes == null && defaultWasmBytes == null) {
//     throw new Error("wasmatrix default WebAssembly binary is not loaded");
//   }
//   /* c8 ignore stop */
//   return instantiateRuntime(wasmBytes ?? defaultWasmBytes);
// }
//
// export function configure(options: WasmatrixOptions = {}): void {
//   if (Object.hasOwn(options, "fastMath")) {
//     optimizationOptions.fastMath = Boolean(options.fastMath);
//   }
//   if (Object.hasOwn(options, "cacheLimitBytes")) {
//     assertNonNegativeInteger(options.cacheLimitBytes, "cacheLimitBytes");
//     optimizationOptions.cacheLimitBytes = options.cacheLimitBytes;
//     if (defaultRuntime != null) {
//       defaultRuntime.cacheLimitBytes = options.cacheLimitBytes;
//       defaultRuntime.trimCaches();
//     }
//   }
// }
//
// function getRuntime() {
//   /* c8 ignore start */
//   if (defaultRuntime == null) {
//     defaultRuntime = createRuntime();
//   }
//   /* c8 ignore stop */
//   return defaultRuntime;
// }
//
// class WasmRuntime {
//   id;
//   exports;
//   f64ScratchPtr;
//   f64ScratchLength;
//   cacheLimitBytes;
//   cacheBytes;
//   cacheEntries;
//   bufferCache;
//
//   constructor(exports) {
//     this.id = nextRuntimeId++;
//     this.exports = exports;
//     this.f64ScratchPtr = 0;
//     this.f64ScratchLength = 0;
//     this.cacheLimitBytes = optimizationOptions.cacheLimitBytes;
//     this.cacheBytes = 0;
//     this.cacheEntries = new Map();
//     this.bufferCache = new Map();
//   }
//
//   get memory() {
//     return this.exports.memory;
//   }
//
//   get f32() {
//     return new Float32Array(this.memory.buffer);
//   }
//
//   get i32() {
//     return new Int32Array(this.memory.buffer);
//   }
//
//   alloc(length) {
//     assertNonNegativeInteger(length, "length");
//     return this.exports.allocF32(length);
//   }
//
//   allocF64(length) {
//     assertNonNegativeInteger(length, "length");
//     return this.exports.allocF64(length);
//   }
//
//   allocI32(length) {
//     assertNonNegativeInteger(length, "length");
//     return this.exports.allocI32(length);
//   }
//
//   f64Scratch(length) {
//     assertNonNegativeInteger(length, "length");
//     if (length > this.f64ScratchLength) {
//       this.free(this.f64ScratchPtr);
//       this.f64ScratchPtr = this.exports.allocF64(length);
//       this.f64ScratchLength = length;
//     }
//     return this.f64ScratchPtr;
//   }
//
//   free(ptr) {
//     if (ptr) this.exports.free(ptr);
//   }
//
//   registerCacheEntry(bytes, dispose) {
//     assertNonNegativeInteger(bytes, "bytes");
//     const token = Symbol("wasmatrix-cache-entry");
//     const entry = {
//       token,
//       bytes,
//       disposed: false,
//       dispose: () => {
//         if (entry.disposed) return;
//         entry.disposed = true;
//         this.cacheEntries.delete(token);
//         this.cacheBytes -= bytes;
//         dispose();
//       }
//     };
//
//     this.cacheEntries.set(token, entry);
//     this.cacheBytes += bytes;
//     this.#evictCaches();
//     return entry;
//   }
//
//   touchCacheEntry(entry) {
//     if (entry == null || entry.disposed || !this.cacheEntries.has(entry.token)) return false;
//     this.cacheEntries.delete(entry.token);
//     this.cacheEntries.set(entry.token, entry);
//     return true;
//   }
//
//   #evictCaches() {
//     while (this.cacheBytes > this.cacheLimitBytes && this.cacheEntries.size > 0) {
//       const oldest = this.cacheEntries.values().next().value;
//       oldest.dispose();
//     }
//   }
//
//   trimCaches() {
//     this.#evictCaches();
//   }
//
//   getCachedBuffer(key, length) {
//     const entry = this.bufferCache.get(key);
//     if (entry == null || entry.disposed || entry.length !== length) {
//       this.bufferCache.delete(key);
//       return 0;
//     }
//
//     if (!this.touchCacheEntry(entry.cacheEntry)) {
//       /* c8 ignore next 3 */
//       this.bufferCache.delete(key);
//       return 0;
//     }
//
//     const ptr = this.alloc(length);
//     this.exports.copy(entry.ptr, ptr, length);
//     return ptr;
//   }
//
//   putCachedBuffer(key, sourcePtr, length) {
//     const bytes = length << 2;
//     if (bytes > this.cacheLimitBytes / 4) return;
//
//     const existing = this.bufferCache.get(key);
//     if (existing != null) existing.cacheEntry.dispose();
//
//     const ptr = this.alloc(length);
//     this.exports.copy(sourcePtr, ptr, length);
//     const entry = {
//       ptr,
//       length,
//       cacheEntry: null
//     };
//     entry.cacheEntry = this.registerCacheEntry(bytes, () => {
//       this.free(ptr);
//       this.bufferCache.delete(key);
//     });
//     this.bufferCache.set(key, entry);
//   }
//
//   write(data) {
//     const values = toFloat32Array(data, "data");
//     const ptr = this.alloc(values.length);
//     this.writeInto(ptr, values);
//     return ptr;
//   }
//
//   writeI32(data) {
//     const values = data instanceof Int32Array ? data : Int32Array.from(data);
//     const ptr = this.allocI32(values.length);
//     this.i32.set(values, ptr >>> 2);
//     return ptr;
//   }
//
//   writeInto(ptr, data) {
//     const values = toFloat32Array(data, "data");
//     this.f32.set(values, ptr >>> 2);
//   }
//
//   read(ptr, length) {
//     return new Float32Array(this.f32.subarray(ptr >>> 2, (ptr >>> 2) + length));
//   }
//
//   readValue(ptr, index) {
//     return this.f32[(ptr >>> 2) + index];
//   }
//
//   writeValue(ptr, index, value) {
//     this.f32[(ptr >>> 2) + index] = value;
//   }
// }
//
// defaultWasmBytes = await readWasmBytes(DEFAULT_WASM_URL);
// defaultRuntime = instantiateRuntime(defaultWasmBytes);
//
// export class Matrix {
//   readonly rows: number;
//   readonly cols: number;
//   #id = nextMatrixId++;
//   #version = 0;
//   #runtime;
//   #ptr;
//   #base = null;
//   #inverseOf = null;
//   #transposeOf = null;
//   #expr = null;
//   #matmulOf = null;
//   #affineScale = 1;
//   #affineBias = 0;
//   #structure = "dense";
//   #luCache = null;
//   #choleskyCache = null;
//   #qrCache = null;
//   #packedCache = null;
//   #transposeCache = null;
//   #rightMatmulUses = 0;
//   #reductionCache = new Map();
//   #diagonalCache = null;
//   #cacheEntries: Set<any> = new Set();
//   #disposed = false;
//   #owns = true;
//
//   constructor(rows, cols, data = null, options: any = {}) {
//     assertPositiveInteger(rows, "rows");
//     assertPositiveInteger(cols, "cols");
//
//     const length = sizeOf(rows, cols);
//     this.rows = rows;
//     this.cols = cols;
//     this.#runtime = options.runtime ?? getRuntime();
//     this.#structure = options.structure ?? "dense";
//
//     if (options.ptr != null) {
//       assertNonNegativeInteger(options.ptr, "ptr");
//       this.#ptr = options.ptr;
//       this.#owns = options.owns !== false;
//     } else if (
//       options.base != null
//       || options.inverseOf != null
//       || options.transposeOf != null
//       || options.expr != null
//       || options.matmulOf != null
//     ) {
//       this.#ptr = 0;
//       this.#owns = false;
//       this.#base = options.base ?? null;
//       this.#inverseOf = options.inverseOf ?? null;
//       this.#transposeOf = options.transposeOf ?? null;
//       this.#expr = options.expr ?? null;
//       this.#matmulOf = options.matmulOf ?? null;
//       this.#affineScale = options.affineScale ?? 1;
//       this.#affineBias = options.affineBias ?? 0;
//     } else {
//       if (data != null) {
//         assertArrayLike(data, "data");
//         if (data.length !== length) {
//           throw new RangeError(`data length ${data.length} does not match matrix shape ${rows}x${cols}`);
//         }
//       }
//
//       this.#ptr = this.#runtime.alloc(length);
//       if (data == null) {
//         this.#runtime.exports.fill(this.#ptr, length, 0);
//       } else {
//         this.#runtime.writeInto(this.#ptr, data);
//       }
//     }
//
//     if (this.#owns) {
//       matrixFinalizer?.register(this, { runtime: this.#runtime, ptr: this.#ptr }, this);
//     }
//   }
//
//   static #fromWasm(rows, cols, runtime, ptr, structure = "dense") {
//     return new Matrix(rows, cols, null, { runtime, ptr, structure });
//   }
//
//   static #affineStructure(base, scale, bias) {
//     if (bias !== 0) return "dense";
//     if (scale === 0) return "zero";
//     if (base.#structure === "identity") return scale === 1 ? "identity" : "diagonal";
//     return base.#structure;
//   }
//
//   static #affineView(base, scale, bias) {
//     base.#assertAlive();
//     assertFiniteNumber(scale, "scale");
//     assertFiniteNumber(bias, "bias");
//     const structure = Matrix.#affineStructure(base, scale, bias);
//
//     if (base.#base != null && base.#inverseOf == null && base.#transposeOf == null && base.#ptr === 0) {
//       return new Matrix(base.rows, base.cols, null, {
//         runtime: base.#runtime,
//         base: base.#base,
//         affineScale: base.#affineScale * scale,
//         affineBias: base.#affineBias * scale + bias,
//         structure
//       });
//     }
//
//     return new Matrix(base.rows, base.cols, null, {
//       runtime: base.#runtime,
//       base,
//       affineScale: scale,
//       affineBias: bias,
//       structure
//     });
//   }
//
//   static #elementwiseStructure(base, op) {
//     if (op.code === EW_ADD_SCALAR) {
//       return op.scalarA === 0 ? base.#structure : "dense";
//     }
//     if (op.code === EW_MULTIPLY_SCALAR || op.code === EW_DIVIDE_SCALAR) {
//       if (op.scalarA === 0 && op.code === EW_MULTIPLY_SCALAR) return "zero";
//       if (base.#structure === "zero") return "zero";
//       if (base.#structure === "diagonal") return "diagonal";
//       if (base.#structure === "identity") return op.scalarA === 1 ? "identity" : "diagonal";
//       if (base.#structure === "ones") return op.scalarA === 1 ? "ones" : "dense";
//       return base.#structure;
//     }
//     if (
//       op.code === EW_NEGATE
//       || op.code === EW_ABS
//       || op.code === EW_SQRT
//       || op.code === EW_FLOOR
//       || op.code === EW_CEIL
//     ) {
//       return base.#structure;
//     }
//     if (op.code === EW_CLAMP && op.scalarA <= 0 && op.scalarB >= 0) {
//       return base.#structure;
//     }
//     return "dense";
//   }
//
//   static #exprView(base, op) {
//     base.#assertAlive();
//     const source = base.#expr == null ? base : base.#expr.base;
//     const ops = base.#expr == null ? [op] : [...base.#expr.ops, op];
//     const structure = Matrix.#elementwiseStructure(base, op);
//
//     return new Matrix(base.rows, base.cols, null, {
//       runtime: base.#runtime,
//       expr: { base: source, ops },
//       structure
//     });
//   }
//
//   static #view(matrix) {
//     return Matrix.#affineView(matrix, 1, 0);
//   }
//
//   static #sameMatmul(left, right) {
//     return left != null
//       && right != null
//       && left.variant === right.variant
//       && left.left === right.left
//       && left.right === right.right
//       && left.gram === right.gram;
//   }
//
//   static #shouldDistributeMatmul(gemmCost, combineCost) {
//     const original = 2 * gemmCost;
//     const rewrite = gemmCost + combineCost;
//     return original >= 131_072 && rewrite < original * 0.85;
//   }
//
//   static #shouldUseTransposeKernel(variant, rows, shared, cols) {
//     if (variant === MATMUL_NN) return false;
//     return rows * shared * cols >= 8_000_000;
//   }
//
//   static #fastMathKey() {
//     return optimizationOptions.fastMath ? "fast" : "strict";
//   }
//
//   static configure(options = {}) {
//     configure(options);
//   }
//
//   static from(rows, cols, values) {
//     return new Matrix(rows, cols, values);
//   }
//
//   static zeros(rows, cols) {
//     return new Matrix(rows, cols, null, { structure: "zero" });
//   }
//
//   static ones(rows, cols) {
//     assertPositiveInteger(rows, "rows");
//     assertPositiveInteger(cols, "cols");
//
//     const runtime = getRuntime();
//     const length = sizeOf(rows, cols);
//     const ptr = runtime.alloc(length);
//     runtime.exports.fill(ptr, length, 1);
//     return new Matrix(rows, cols, null, { runtime, ptr, structure: "ones" });
//   }
//
//   static identity(size) {
//     assertPositiveInteger(size, "size");
//
//     const runtime = getRuntime();
//     const ptr = runtime.alloc(size * size);
//     runtime.exports.identity(ptr, size);
//     return new Matrix(size, size, null, { runtime, ptr, structure: "identity" });
//   }
//
//   static diagonal(values) {
//     const runtime = values instanceof Matrix ? values.#runtime : getRuntime();
//     let inputPtr;
//     let inputLength;
//     let freeInput = false;
//
//     if (values instanceof Matrix) {
//       values.#assertAlive();
//       inputPtr = values.#materializedPtr();
//       inputLength = values.length;
//     } else {
//       const vector = toFloat32Array(values, "values");
//       inputPtr = runtime.write(vector);
//       inputLength = vector.length;
//       freeInput = true;
//     }
//
//     assertPositiveInteger(inputLength, "values.length");
//
//     const ptr = runtime.alloc(inputLength * inputLength);
//     try {
//       runtime.exports.diagonalMatrix(inputPtr, ptr, inputLength);
//       return Matrix.#fromWasm(inputLength, inputLength, runtime, ptr, "diagonal");
//     } finally {
//       if (freeInput) runtime.free(inputPtr);
//     }
//   }
//
//   static random(rows, cols, rng = Math.random) {
//     assertPositiveInteger(rows, "rows");
//     assertPositiveInteger(cols, "cols");
//     const data = new Float32Array(sizeOf(rows, cols));
//     for (let i = 0; i < data.length; i++) {
//       data[i] = rng();
//     }
//     return new Matrix(rows, cols, data);
//   }
//
//   static outer(a, b) {
//     const runtime = a instanceof Matrix ? a.#runtime : b instanceof Matrix ? b.#runtime : getRuntime();
//     const left = Matrix.#vectorRef(a, "a", runtime);
//     const right = Matrix.#vectorRef(b, "b", runtime);
//     const ptr = runtime.alloc(left.length * right.length);
//
//     try {
//       runtime.exports.outer(left.ptr, right.ptr, ptr, left.length, right.length);
//       return Matrix.#fromWasm(left.length, right.length, runtime, ptr);
//     } finally {
//       left.free();
//       right.free();
//     }
//   }
//
//   static matmulChain(...matrices) {
//     if (matrices.length === 1 && Array.isArray(matrices[0])) {
//       matrices = matrices[0];
//     }
//     if (matrices.length === 0) {
//       throw new RangeError("matmulChain requires at least one matrix");
//     }
//     for (const matrix of matrices) {
//       if (!(matrix instanceof Matrix)) {
//         throw new TypeError("matmulChain expects Matrix instances");
//       }
//       matrix.#assertAlive();
//     }
//     for (let i = 1; i < matrices.length; i++) {
//       matrices[0].#assertSameRuntime(matrices[i]);
//       if (matrices[i - 1].cols !== matrices[i].rows) {
//         throw new RangeError(
//           `matmulChain shape mismatch at ${i - 1}/${i}: ${matrices[i - 1].rows}x${matrices[i - 1].cols} cannot multiply ${matrices[i].rows}x${matrices[i].cols}`
//         );
//       }
//     }
//     if (matrices.length === 1) {
//       return Matrix.#affineView(matrices[0], 1, 0);
//     }
//
//     const n = matrices.length;
//     const costs = Array.from({ length: n }, () => new Array(n).fill(0));
//     const splits = Array.from({ length: n }, () => new Array(n).fill(0));
//
//     for (let width = 2; width <= n; width++) {
//       for (let i = 0; i <= n - width; i++) {
//         const j = i + width - 1;
//         let best = Number.POSITIVE_INFINITY;
//         let bestSplit = i;
//
//         for (let k = i; k < j; k++) {
//           const cost = costs[i][k]
//             + costs[k + 1][j]
//             + matrices[i].rows * matrices[k].cols * matrices[j].cols;
//           if (cost < best) {
//             best = cost;
//             bestSplit = k;
//           }
//         }
//
//         costs[i][j] = best;
//         splits[i][j] = bestSplit;
//       }
//     }
//
//     const build = (i, j) => {
//       if (i === j) {
//         return { matrix: matrices[i], temporary: false };
//       }
//
//       const k = splits[i][j];
//       const left = build(i, k);
//       const right = build(k + 1, j);
//       const matrix = left.matrix.matmul(right.matrix);
//       matrix.#materializedPtr();
//
//       if (left.temporary) left.matrix.dispose();
//       if (right.temporary) right.matrix.dispose();
//
//       return { matrix, temporary: true };
//     };
//
//     return build(0, n - 1).matrix;
//   }
//
//   static #vectorRef(value, name, runtime) {
//     if (value instanceof Matrix) {
//       value.#assertAlive();
//       if (value.#runtime !== runtime) {
//         throw new RangeError(`${name} belongs to a different WASM runtime`);
//       }
//       return {
//         ptr: value.#materializedPtr(),
//         length: value.length,
//         free() {}
//       };
//     }
//
//     const data = toFloat32Array(value, name);
//     const ptr = runtime.write(data);
//     return {
//       ptr,
//       length: data.length,
//       free() {
//         runtime.free(ptr);
//       }
//     };
//   }
//
//   get length() {
//     return sizeOf(this.rows, this.cols);
//   }
//
//   get shape() {
//     return [this.rows, this.cols];
//   }
//
//   get data() {
//     this.#assertAlive();
//     return this.#runtime.read(this.#materializedPtr(), this.length);
//   }
//
//   get byteOffset() {
//     this.#assertAlive();
//     return this.#materializedPtr();
//   }
//
//   dispose() {
//     if (this.#disposed) return;
//
//     this.#clearComputedCaches();
//     if (this.#owns) {
//       matrixFinalizer?.unregister(this);
//       this.#runtime.free(this.#ptr);
//     }
//     this.#ptr = 0;
//     this.#base = null;
//     this.#inverseOf = null;
//     this.#transposeOf = null;
//     this.#expr = null;
//     this.#matmulOf = null;
//     this.#disposed = true;
//   }
//
//   [Symbol.dispose]() {
//     this.dispose();
//   }
//
//   clone() {
//     this.#assertAlive();
//     const ptr = this.#runtime.alloc(this.length);
//     this.#runtime.exports.copy(this.#materializedPtr(), ptr, this.length);
//     return Matrix.#fromWasm(this.rows, this.cols, this.#runtime, ptr);
//   }
//
//   at(row, col) {
//     this.#assertIndex(row, col);
//     return this.#runtime.readValue(this.#materializedPtr(), row * this.cols + col);
//   }
//
//   set(row, col, value) {
//     this.#assertIndex(row, col);
//     assertFiniteNumber(value, "value");
//     this.#runtime.writeValue(this.#materializedPtr(), row * this.cols + col, value);
//     this.#version++;
//     this.#clearComputedCaches();
//     this.#expr = null;
//     this.#matmulOf = null;
//     this.#structure = "dense";
//     return this;
//   }
//
//   row(index) {
//     this.#assertAlive();
//     assertInteger(index, "index");
//     if (index < 0 || index >= this.rows) {
//       throw new RangeError("row index is out of range");
//     }
//     const start = (this.#materializedPtr() >>> 2) + index * this.cols;
//     return new Float32Array(this.#runtime.f32.subarray(start, start + this.cols));
//   }
//
//   column(index) {
//     this.#assertAlive();
//     assertInteger(index, "index");
//     if (index < 0 || index >= this.cols) {
//       throw new RangeError("column index is out of range");
//     }
//     const out = new Float32Array(this.rows);
//     const memory = this.#runtime.f32;
//     const base = this.#materializedPtr() >>> 2;
//     for (let r = 0; r < this.rows; r++) {
//       out[r] = memory[base + r * this.cols + index];
//     }
//     return out;
//   }
//
//   diagonal() {
//     this.#assertAlive();
//     const cached = this.#diagonalCache;
//     if (cached != null && cached.version === this.#version) {
//       return new Float32Array(cached.value);
//     }
//
//     const length = Math.min(this.rows, this.cols);
//     const ptr = this.#runtime.alloc(length);
//     try {
//       this.#runtime.exports.diagonal(this.#materializedPtr(), ptr, this.rows, this.cols);
//       const value = this.#runtime.read(ptr, length);
//       this.#diagonalCache = { version: this.#version, value };
//       return new Float32Array(value);
//     } finally {
//       this.#runtime.free(ptr);
//     }
//   }
//
//   reshape(rows, cols) {
//     this.#assertAlive();
//     assertPositiveInteger(rows, "rows");
//     assertPositiveInteger(cols, "cols");
//     if (sizeOf(rows, cols) !== this.length) {
//       throw new RangeError("reshape must preserve element count");
//     }
//     const ptr = this.#runtime.alloc(this.length);
//     this.#runtime.exports.copy(this.#materializedPtr(), ptr, this.length);
//     return Matrix.#fromWasm(rows, cols, this.#runtime, ptr);
//   }
//
//   toFloat32Array() {
//     return this.data;
//   }
//
//   toFlatArray() {
//     return Array.from(this.data);
//   }
//
//   toArray() {
//     const data = this.data;
//     const rows = [];
//     for (let r = 0; r < this.rows; r++) {
//       rows.push(Array.from(data.subarray(r * this.cols, (r + 1) * this.cols)));
//     }
//     return rows;
//   }
//
//   add(other) {
//     if (typeof other === "number") return this.addScalar(other);
//     return this.#elementwise(other, EW_ADD);
//   }
//
//   addScalar(value) {
//     assertFiniteNumber(value, "value");
//     return Matrix.#exprView(this, { code: EW_ADD_SCALAR, scalarA: value, scalarB: 0 });
//   }
//
//   subtract(other) {
//     if (typeof other === "number") return this.addScalar(-other);
//     return this.#elementwise(other, EW_SUBTRACT);
//   }
//
//   scale(value) {
//     assertFiniteNumber(value, "value");
//     return Matrix.#exprView(this, { code: EW_MULTIPLY_SCALAR, scalarA: value, scalarB: 0 });
//   }
//
//   multiply(other) {
//     if (typeof other === "number") return this.scale(other);
//     if (other instanceof Matrix && this.#broadcastModeFor(other) !== null) {
//       return this.hadamard(other);
//     }
//     return this.matmul(other);
//   }
//
//   divide(other) {
//     if (typeof other === "number") {
//       assertFiniteNumber(other, "other");
//       return Matrix.#exprView(this, { code: EW_DIVIDE_SCALAR, scalarA: other, scalarB: 0 });
//     }
//     return this.#elementwise(other, EW_DIVIDE);
//   }
//
//   hadamard(other) {
//     return this.#elementwise(other, EW_MULTIPLY);
//   }
//
//   elementMultiply(other) {
//     return this.hadamard(other);
//   }
//
//   min(other) {
//     return this.#elementwise(other, EW_MIN);
//   }
//
//   max(other) {
//     return this.#elementwise(other, EW_MAX);
//   }
//
//   negate() {
//     return Matrix.#exprView(this, { code: EW_NEGATE, scalarA: 0, scalarB: 0 });
//   }
//
//   abs() {
//     return Matrix.#exprView(this, { code: EW_ABS, scalarA: 0, scalarB: 0 });
//   }
//
//   sqrt() {
//     return Matrix.#exprView(this, { code: EW_SQRT, scalarA: 0, scalarB: 0 });
//   }
//
//   floor() {
//     return Matrix.#exprView(this, { code: EW_FLOOR, scalarA: 0, scalarB: 0 });
//   }
//
//   ceil() {
//     return Matrix.#exprView(this, { code: EW_CEIL, scalarA: 0, scalarB: 0 });
//   }
//
//   clamp(minValue, maxValue) {
//     this.#assertAlive();
//     assertFiniteNumber(minValue, "minValue");
//     assertFiniteNumber(maxValue, "maxValue");
//     if (minValue > maxValue) {
//       throw new RangeError("minValue must be less than or equal to maxValue");
//     }
//
//     return Matrix.#exprView(this, { code: EW_CLAMP, scalarA: minValue, scalarB: maxValue });
//   }
//
//   map(fn) {
//     this.#assertAlive();
//     if (typeof fn !== "function") {
//       throw new TypeError("fn must be a function");
//     }
//     const input = this.data;
//     const data = new Float32Array(this.length);
//     for (let r = 0; r < this.rows; r++) {
//       for (let c = 0; c < this.cols; c++) {
//         const index = r * this.cols + c;
//         data[index] = fn(input[index], r, c);
//       }
//     }
//     return new Matrix(this.rows, this.cols, data, { runtime: this.#runtime });
//   }
//
//   transpose() {
//     this.#assertAlive();
//
//     if (this.#transposeOf != null) {
//       return Matrix.#affineView(this.#transposeOf, 1, 0);
//     }
//
//     if (this.#base != null && this.#inverseOf == null && this.#ptr === 0) {
//       return Matrix.#affineView(this.#base.transpose(), this.#affineScale, this.#affineBias);
//     }
//
//     let structure = "dense";
//     if (this.#structure === "identity") structure = "identity";
//     if (this.#structure === "zero") structure = "zero";
//     if (this.#structure === "ones") structure = "ones";
//     if (this.#structure === "diagonal") structure = "diagonal";
//     if (this.#structure === "spd") structure = "spd";
//
//     return new Matrix(this.cols, this.rows, null, {
//       runtime: this.#runtime,
//       transposeOf: this,
//       structure
//     });
//   }
//
//   matmul(other) {
//     this.#assertAlive();
//     if (!(other instanceof Matrix)) {
//       throw new TypeError("other must be a Matrix");
//     }
//     other.#assertAlive();
//     this.#assertSameRuntime(other);
//     if (this.cols !== other.rows) {
//       throw new RangeError(`matmul shape mismatch: ${this.rows}x${this.cols} cannot multiply ${other.rows}x${other.cols}`);
//     }
//
//     if (this.#inverseOf != null) {
//       return this.#inverseOf.solve(other);
//     }
//     if (optimizationOptions.fastMath && other.#inverseOf === this) {
//       return Matrix.identity(this.rows);
//     }
//     if (other.#inverseOf != null) {
//       return other.#inverseOf.transpose().solve(this.transpose()).transpose();
//     }
//     if (this.#structure === "identity") {
//       return Matrix.#affineView(other, 1, 0);
//     }
//     if (other.#structure === "identity") {
//       return Matrix.#affineView(this, 1, 0);
//     }
//     if (this.#structure === "zero" || other.#structure === "zero") {
//       return Matrix.zeros(this.rows, other.cols);
//     }
//     if (this.#structure === "diagonal") {
//       const ptr = this.#runtime.alloc(this.rows * other.cols);
//       this.#runtime.exports.scaleRowsByDiagonal(this.#materializedPtr(), other.#materializedPtr(), ptr, this.rows, other.cols);
//       const structure = other.#structure === "diagonal" ? "diagonal" : "dense";
//       return Matrix.#fromWasm(this.rows, other.cols, this.#runtime, ptr, structure);
//     }
//     if (other.#structure === "diagonal") {
//       const ptr = this.#runtime.alloc(this.rows * other.cols);
//       this.#runtime.exports.scaleColsByDiagonal(this.#materializedPtr(), other.#materializedPtr(), ptr, this.rows, other.cols);
//       const structure = this.#structure === "diagonal" ? "diagonal" : "dense";
//       return Matrix.#fromWasm(this.rows, other.cols, this.#runtime, ptr, structure);
//     }
//
//     const scalarRewrite = this.#matmulScalarRewrite(other);
//     if (scalarRewrite != null) return scalarRewrite;
//
//     const leftInput = this.#matmulInput();
//     const rightInput = other.#matmulInput();
//     let variant = MATMUL_NN;
//     if (leftInput.transposed && rightInput.transposed) variant = MATMUL_TT;
//     else if (leftInput.transposed) variant = MATMUL_TN;
//     else if (rightInput.transposed) variant = MATMUL_NT;
//
//     let gram = null;
//     let structure = "dense";
//     if (leftInput.source === rightInput.source && variant === MATMUL_TN) {
//       gram = "TN";
//       structure = "spd";
//     } else if (leftInput.source === rightInput.source && variant === MATMUL_NT) {
//       gram = "NT";
//       structure = "spd";
//     }
//
//     if (gram == null && variant !== MATMUL_NN && !Matrix.#shouldUseTransposeKernel(variant, this.rows, this.cols, other.cols)) {
//       if (leftInput.transposed) this.#materializedPtr();
//       if (rightInput.transposed) other.#materializedPtr();
//       return new Matrix(this.rows, other.cols, null, {
//         runtime: this.#runtime,
//         matmulOf: {
//           left: this,
//           right: other,
//           variant: MATMUL_NN,
//           gram: null
//         }
//       });
//     }
//
//     return new Matrix(this.rows, other.cols, null, {
//       runtime: this.#runtime,
//       matmulOf: {
//         left: leftInput.source,
//         right: rightInput.source,
//         variant,
//         gram
//       },
//       structure
//     });
//   }
//
//   matvec(vector) {
//     this.#assertAlive();
//     const vec = Matrix.#vectorRef(vector, "vector", this.#runtime);
//     if (vec.length !== this.cols) {
//       vec.free();
//       throw new RangeError(`vector length ${vec.length} must match matrix columns ${this.cols}`);
//     }
//
//     const ptr = this.#runtime.alloc(this.rows);
//     try {
//       this.#runtime.exports.matvec(this.#materializedPtr(), vec.ptr, ptr, this.rows, this.cols);
//       return this.#runtime.read(ptr, this.rows);
//     } finally {
//       this.#runtime.free(ptr);
//       vec.free();
//     }
//   }
//
//   dot(other) {
//     this.#assertAlive();
//     const values = Matrix.#vectorRef(other, "other", this.#runtime);
//     if (values.length !== this.length) {
//       values.free();
//       throw new RangeError(`dot length mismatch: ${this.length} !== ${values.length}`);
//     }
//
//     try {
//       return this.#runtime.exports.dot(this.#materializedPtr(), values.ptr, this.length);
//     } finally {
//       values.free();
//     }
//   }
//
//   sum() {
//     this.#assertAlive();
//     return this.#cachedReduction("sum", () => this.#runtime.exports.sum(this.#materializedPtr(), this.length));
//   }
//
//   minValue() {
//     this.#assertAlive();
//     return this.#cachedReduction("min", () => this.#runtime.exports.minValue(this.#materializedPtr(), this.length));
//   }
//
//   maxValue() {
//     this.#assertAlive();
//     return this.#cachedReduction("max", () => this.#runtime.exports.maxValue(this.#materializedPtr(), this.length));
//   }
//
//   trace() {
//     this.#assertAlive();
//     if (
//       this.#ptr === 0
//       && this.#matmulOf != null
//       && this.#matmulOf.variant === MATMUL_NN
//       && this.#matmulOf.gram == null
//       && this.rows === this.cols
//     ) {
//       const { left, right } = this.#matmulOf;
//       left.#assertAlive();
//       right.#assertAlive();
//       this.#assertSameRuntime(left);
//       this.#assertSameRuntime(right);
//       return this.#cachedReduction("trace-matmul", () => this.#runtime.exports.traceMatmul(left.#materializedPtr(), right.#materializedPtr(), left.rows, left.cols));
//     }
//     return this.#cachedReduction("trace", () => this.#runtime.exports.trace(this.#materializedPtr(), this.rows, this.cols));
//   }
//
//   frobeniusNorm() {
//     this.#assertAlive();
//     return this.#cachedReduction("frobenius", () => this.#runtime.exports.frobeniusNorm(this.#materializedPtr(), this.length));
//   }
//
//   determinant() {
//     this.#assertSquare("determinant");
//     const cached = this.#getCachedReduction("determinant");
//     if (cached != null) return cached;
//
//     let value;
//     if (this.#structure === "identity") return 1;
//     if (this.#structure === "zero") return 0;
//     if (this.#structure === "diagonal") {
//       value = this.#runtime.exports.diagonalProduct(this.#materializedPtr(), this.rows);
//       this.#setCachedReduction("determinant", value);
//       return value;
//     }
//     if (
//       optimizationOptions.fastMath
//       && this.#ptr === 0
//       && this.#matmulOf != null
//       && this.#matmulOf.variant === MATMUL_NN
//       && this.#matmulOf.gram == null
//       && this.#matmulOf.left.rows === this.#matmulOf.left.cols
//       && this.#matmulOf.right.rows === this.#matmulOf.right.cols
//     ) {
//       value = this.#matmulOf.left.determinant() * this.#matmulOf.right.determinant();
//       this.#setCachedReduction("determinant", value);
//       return value;
//     }
//
//     const cholesky = this.#choleskyFactor();
//     if (cholesky != null) {
//       value = this.#runtime.exports.choleskyDeterminant(cholesky.lowerPtr, this.rows);
//       this.#setCachedReduction("determinant", value);
//       return value;
//     }
//
//     const factor = this.#luFactor();
//     value = factor == null
//       ? 0
//       : this.#runtime.exports.luDeterminant(factor.luPtr, this.rows, factor.sign);
//     this.#setCachedReduction("determinant", value);
//     return value;
//   }
//
//   logDet() {
//     this.#assertSquare("logDet");
//     const cached = this.#getCachedReduction("logDet");
//     if (cached != null) return cached;
//
//     let value;
//     if (this.#structure === "identity") {
//       value = 0;
//     } else if (this.#structure === "diagonal") {
//       const diagonal = this.diagonal();
//       value = 0;
//       for (const item of diagonal) {
//         if (item <= 0) {
//           value = Number.NaN;
//           break;
//         }
//         value += Math.log(item);
//       }
//     } else {
//       const cholesky = this.#choleskyFactor();
//       if (cholesky != null) {
//         value = this.#runtime.exports.choleskyLogDet(cholesky.lowerPtr, this.rows);
//       } else {
//         const det = this.determinant();
//         value = det > 0 ? Math.log(det) : Number.NaN;
//       }
//     }
//
//     this.#setCachedReduction("logDet", value);
//     return value;
//   }
//
//   inverse() {
//     this.#assertSquare("inverse");
//     if (this.#structure === "identity") {
//       return Matrix.identity(this.rows);
//     }
//     if (this.#structure === "diagonal") {
//       const sourcePtr = this.#materializedPtr();
//       const ptr = this.#runtime.alloc(this.length);
//       const ok = this.#runtime.exports.invertDiagonal(sourcePtr, ptr, this.rows);
//       if (ok !== 1) {
//         this.#runtime.free(ptr);
//         throw new RangeError("matrix is singular");
//       }
//       return Matrix.#fromWasm(this.rows, this.cols, this.#runtime, ptr, "diagonal");
//     }
//     return new Matrix(this.rows, this.cols, null, {
//       runtime: this.#runtime,
//       inverseOf: this
//     });
//   }
//
//   solve(rhs) {
//     this.#assertSquare("solve");
//     const rhsIsMatrix = rhs instanceof Matrix;
//     const right = rhsIsMatrix ? rhs : new Matrix(this.rows, 1, rhs, { runtime: this.#runtime });
//     right.#assertAlive();
//     this.#assertSameRuntime(right);
//     if (right.rows !== this.rows) {
//       if (!rhsIsMatrix) right.dispose();
//       throw new RangeError(`right-hand side rows ${right.rows} must match ${this.rows}`);
//     }
//
//     let ptr = 0;
//     try {
//       if (this.#structure === "diagonal") {
//         const rhsPtr = right.#materializedPtr();
//         ptr = this.#runtime.alloc(right.length);
//         const ok = this.#runtime.exports.solveDiagonal(this.#materializedPtr(), rhsPtr, ptr, this.rows, right.cols);
//         if (ok !== 1) {
//           throw new RangeError("matrix is singular");
//         }
//         return Matrix.#fromWasm(this.rows, right.cols, this.#runtime, ptr);
//       }
//
//       const cholesky = this.#choleskyFactor();
//       if (cholesky != null) {
//         const rhsPtr = right.#materializedPtr();
//         ptr = this.#runtime.alloc(right.length);
//         const work = this.#runtime.f64Scratch(this.rows * right.cols);
//         const ok = this.#runtime.exports.choleskySolve(cholesky.lowerPtr, rhsPtr, ptr, this.rows, right.cols, work);
//         /* c8 ignore next 3 */
//         if (ok !== 1) {
//           throw new RangeError("matrix is singular");
//         }
//         return Matrix.#fromWasm(this.rows, right.cols, this.#runtime, ptr);
//       }
//
//       const factor = this.#luFactor();
//       if (factor == null) {
//         throw new RangeError("matrix is singular");
//       }
//
//       const rhsPtr = right.#materializedPtr();
//       ptr = this.#runtime.alloc(right.length);
//       const work = this.#runtime.f64Scratch(this.rows * right.cols);
//       const ok = this.#runtime.exports.luSolve(factor.luPtr, factor.pivotsPtr, rhsPtr, ptr, this.rows, right.cols, work);
//       /* c8 ignore next 3 */
//       if (ok !== 1) {
//         throw new RangeError("matrix is singular");
//       }
//       return Matrix.#fromWasm(this.rows, right.cols, this.#runtime, ptr);
//     } catch (error) {
//       this.#runtime.free(ptr);
//       throw error;
//     } finally {
//       if (!rhsIsMatrix) right.dispose();
//     }
//   }
//
//   leastSquares(rhs) {
//     this.#assertAlive();
//     if (this.rows < this.cols) {
//       throw new RangeError("leastSquares requires rows >= columns");
//     }
//
//     const rhsIsMatrix = rhs instanceof Matrix;
//     const right = rhsIsMatrix ? rhs : new Matrix(this.rows, 1, rhs, { runtime: this.#runtime });
//     right.#assertAlive();
//     this.#assertSameRuntime(right);
//     if (right.rows !== this.rows) {
//       if (!rhsIsMatrix) right.dispose();
//       throw new RangeError(`right-hand side rows ${right.rows} must match ${this.rows}`);
//     }
//
//     let ptr = 0;
//     try {
//       const factor = this.#qrFactor();
//       ptr = this.#runtime.alloc(this.cols * right.cols);
//       const work = this.#runtime.f64Scratch(this.cols * right.cols);
//       const ok = this.#runtime.exports.qrSolve(
//         factor.qPtr,
//         factor.rPtr,
//         right.#materializedPtr(),
//         ptr,
//         this.rows,
//         this.cols,
//         right.cols,
//         work
//       );
//       if (ok !== 1) {
//         throw new RangeError("matrix is rank deficient");
//       }
//       return Matrix.#fromWasm(this.cols, right.cols, this.#runtime, ptr);
//     } catch (error) {
//       this.#runtime.free(ptr);
//       throw error;
//     } finally {
//       if (!rhsIsMatrix) right.dispose();
//     }
//   }
//
//   rank(epsilon = 1e-6) {
//     this.#assertAlive();
//     assertFiniteNumber(epsilon, "epsilon");
//     const key = `rank:${epsilon}`;
//     const cached = this.#getCachedReduction(key);
//     if (cached != null) return cached;
//
//     let value;
//     if (this.#structure === "identity") {
//       value = Math.min(this.rows, this.cols);
//     } else if (this.#structure === "zero") {
//       value = 0;
//     } else {
//       const qr = this.#qrFactor();
//       value = this.#runtime.exports.qrRank(qr.rPtr, this.rows, this.cols, epsilon);
//     }
//
//     this.#setCachedReduction(key, value);
//     return value;
//   }
//
//   equalsApprox(other, epsilon = 1e-6) {
//     this.#assertSameShape(other);
//     assertFiniteNumber(epsilon, "epsilon");
//     return this.#runtime.exports.equalsApprox(this.#materializedPtr(), other.#materializedPtr(), this.length, epsilon) === 1;
//   }
//
//   toString() {
//     return this.toArray()
//       .map((row) => row.join("\t"))
//       .join("\n");
//   }
//
//   #identityKey() {
//     return `${this.#runtime.id}:${this.#id}:${this.#version}:${this.rows}x${this.cols}:f32:${Matrix.#fastMathKey()}`;
//   }
//
//   #valueKey() {
//     return this.#materializationCacheKey() ?? this.#identityKey();
//   }
//
//   #materializationCacheKey() {
//     if (this.#expr != null) {
//       const ops = this.#expr.ops.map((op) => [
//         op.code,
//         op.scalarA ?? 0,
//         op.scalarB ?? 0,
//         op.operandMode ?? OPERAND_FULL,
//         op.other == null ? "" : op.other.#valueKey()
//       ].join(",")).join(";");
//       return `expr:${this.rows}x${this.cols}:${this.#expr.base.#valueKey()}:${ops}`;
//     }
//
//     if (this.#matmulOf != null) {
//       const { left, right, variant, gram } = this.#matmulOf;
//       return `matmul:${this.rows}x${this.cols}:${variant}:${gram ?? ""}:${left.#valueKey()}:${right.#valueKey()}`;
//     }
//
//     if (this.#transposeOf != null) {
//       return `transpose:${this.rows}x${this.cols}:${this.#transposeOf.#valueKey()}`;
//     }
//
//     if (this.#inverseOf != null) {
//       return `inverse:${this.rows}x${this.cols}:${this.#inverseOf.#valueKey()}`;
//     }
//
//     if (this.#base != null) {
//       return `affine:${this.rows}x${this.cols}:${this.#base.#valueKey()}:${this.#affineScale}:${this.#affineBias}`;
//     }
//
//     return null;
//   }
//
//   #getCachedReduction(key) {
//     const cached = this.#reductionCache.get(key);
//     const dependencyKey = this.#materializationCacheKey() ?? this.#identityKey();
//     if (cached == null || cached.version !== this.#version || cached.dependencyKey !== dependencyKey) {
//       this.#reductionCache.delete(key);
//       return null;
//     }
//     return cached.value;
//   }
//
//   #setCachedReduction(key, value) {
//     this.#reductionCache.set(key, {
//       version: this.#version,
//       dependencyKey: this.#materializationCacheKey() ?? this.#identityKey(),
//       value
//     });
//   }
//
//   #cachedReduction(key, compute) {
//     const cached = this.#getCachedReduction(key);
//     if (cached != null) return cached;
//
//     const value = compute();
//     this.#setCachedReduction(key, value);
//     return value;
//   }
//
//   #addCacheEntry(entry) {
//     this.#cacheEntries.add(entry);
//     cacheFinalizer?.register(this, entry, entry);
//     return entry;
//   }
//
//   #releaseCacheEntry(entry) {
//     if (entry == null) return;
//     cacheFinalizer?.unregister(entry);
//     this.#cacheEntries.delete(entry);
//     entry.dispose();
//   }
//
//   #cacheEntryAlive(entry) {
//     return entry != null && !entry.disposed && this.#runtime.touchCacheEntry(entry);
//   }
//
//   #clearComputedCaches() {
//     for (const entry of this.#cacheEntries) {
//       cacheFinalizer?.unregister(entry);
//       entry.dispose();
//     }
//     this.#cacheEntries.clear();
//     this.#luCache = null;
//     this.#choleskyCache = null;
//     this.#qrCache = null;
//     this.#packedCache = null;
//     this.#transposeCache = null;
//     this.#reductionCache.clear();
//     this.#diagonalCache = null;
//   }
//
//   #choleskyFactor() {
//     this.#assertSquare("Cholesky factorization");
//     if (this.#structure !== "spd") return null;
//     if (
//       this.#choleskyCache != null
//       && this.#choleskyCache.version === this.#version
//       && this.#cacheEntryAlive(this.#choleskyCache.entry)
//     ) {
//       return this.#choleskyCache;
//     }
//     /* c8 ignore next 4 */
//     if (this.#choleskyCache != null) {
//       this.#releaseCacheEntry(this.#choleskyCache.entry);
//       this.#choleskyCache = null;
//     }
//
//     const lowerPtr = this.#runtime.allocF64(this.length);
//     let ok = 0;
//     try {
//       ok = this.#runtime.exports.choleskyFactor(this.#materializedPtr(), this.rows, lowerPtr);
//     /* c8 ignore next 4 */
//     } catch (error) {
//       this.#runtime.free(lowerPtr);
//       throw error;
//     }
//
//     if (ok !== 1) {
//       this.#runtime.free(lowerPtr);
//       return null;
//     }
//
//     const runtime = this.#runtime;
//     const entry = this.#addCacheEntry(runtime.registerCacheEntry(this.length * 8, () => runtime.free(lowerPtr)));
//     this.#choleskyCache = {
//       version: this.#version,
//       lowerPtr,
//       entry
//     };
//     return this.#choleskyCache;
//   }
//
//   #qrFactor() {
//     if (
//       this.#qrCache != null
//       && this.#qrCache.version === this.#version
//       && this.#cacheEntryAlive(this.#qrCache.entry)
//     ) {
//       return this.#qrCache;
//     }
//     /* c8 ignore next 4 */
//     if (this.#qrCache != null) {
//       this.#releaseCacheEntry(this.#qrCache.entry);
//       this.#qrCache = null;
//     }
//
//     const qLength = this.rows * this.cols;
//     const rLength = this.cols * this.cols;
//     const qPtr = this.#runtime.allocF64(qLength);
//     const rPtr = this.#runtime.allocF64(rLength);
//
//     try {
//       this.#runtime.exports.qrFactor(this.#materializedPtr(), this.rows, this.cols, qPtr, rPtr);
//     /* c8 ignore next 5 */
//     } catch (error) {
//       this.#runtime.free(qPtr);
//       this.#runtime.free(rPtr);
//       throw error;
//     }
//
//     const runtime = this.#runtime;
//     const entry = this.#addCacheEntry(runtime.registerCacheEntry((qLength + rLength) * 8, () => {
//       runtime.free(qPtr);
//       runtime.free(rPtr);
//     }));
//     this.#qrCache = {
//       version: this.#version,
//       qPtr,
//       rPtr,
//       entry
//     };
//     return this.#qrCache;
//   }
//
//   #packedMatmulPtr() {
//     if (
//       this.#packedCache != null
//       && this.#packedCache.version === this.#version
//       && this.#cacheEntryAlive(this.#packedCache.entry)
//     ) {
//       return this.#packedCache.ptr;
//     }
//     /* c8 ignore next 4 */
//     if (this.#packedCache != null) {
//       this.#releaseCacheEntry(this.#packedCache.entry);
//       this.#packedCache = null;
//     }
//
//     const ptr = this.#runtime.alloc(this.length);
//     try {
//       this.#runtime.exports.packForMatmul(this.#materializedPtr(), ptr, this.rows, this.cols);
//     /* c8 ignore next 4 */
//     } catch (error) {
//       this.#runtime.free(ptr);
//       throw error;
//     }
//
//     const runtime = this.#runtime;
//     const entry = this.#addCacheEntry(runtime.registerCacheEntry(this.length * 4, () => runtime.free(ptr)));
//     this.#packedCache = {
//       version: this.#version,
//       ptr,
//       entry
//     };
//     return ptr;
//   }
//
//   #transposeCachePtr() {
//     if (
//       this.#transposeCache != null
//       && this.#transposeCache.version === this.#version
//       && this.#cacheEntryAlive(this.#transposeCache.entry)
//     ) {
//       /* c8 ignore next 2 */
//       return this.#transposeCache.ptr;
//     }
//     /* c8 ignore next 4 */
//     if (this.#transposeCache != null) {
//       this.#releaseCacheEntry(this.#transposeCache.entry);
//       this.#transposeCache = null;
//     }
//
//     const ptr = this.#runtime.alloc(this.length);
//     try {
//       this.#runtime.exports.transpose(this.#materializedPtr(), ptr, this.rows, this.cols);
//     /* c8 ignore next 4 */
//     } catch (error) {
//       this.#runtime.free(ptr);
//       throw error;
//     }
//
//     const runtime = this.#runtime;
//     const entry = this.#addCacheEntry(runtime.registerCacheEntry(this.length * 4, () => runtime.free(ptr)));
//     this.#transposeCache = {
//       version: this.#version,
//       ptr,
//       entry
//     };
//     return ptr;
//   }
//
//   #broadcastModeFor(other) {
//     this.#assertAlive();
//     if (!(other instanceof Matrix)) {
//       throw new TypeError("other must be a Matrix");
//     }
//     other.#assertAlive();
//     this.#assertSameRuntime(other);
//
//     if (this.rows === other.rows && this.cols === other.cols) return OPERAND_FULL;
//     if (other.rows === 1 && other.cols === this.cols) return OPERAND_ROW;
//     if (other.rows === this.rows && other.cols === 1) return OPERAND_COLUMN;
//     return null;
//   }
//
//   #elementwise(other, code) {
//     const mode = this.#broadcastModeFor(other);
//     const commutative = code === EW_ADD || code === EW_MULTIPLY || code === EW_MIN || code === EW_MAX;
//
//     if (mode == null) {
//       if (commutative && other.#broadcastModeFor(this) !== null) {
//         return other.#elementwise(this, code);
//       }
//       throw new RangeError(`shape mismatch: ${this.rows}x${this.cols} cannot broadcast with ${other.rows}x${other.cols}`);
//     }
//
//     if (mode === OPERAND_FULL) {
//       if (code === EW_ADD && this.#structure === "zero") return Matrix.#view(other);
//       if (code === EW_ADD && other.#structure === "zero") return Matrix.#view(this);
//       if (code === EW_SUBTRACT && this === other) return Matrix.zeros(this.rows, this.cols);
//       if (code === EW_SUBTRACT && other.#structure === "zero") return Matrix.#view(this);
//       if (code === EW_MULTIPLY && (this.#structure === "zero" || other.#structure === "zero")) {
//         return Matrix.zeros(this.rows, this.cols);
//       }
//       if (code === EW_MULTIPLY && other.#structure === "ones") return Matrix.#view(this);
//       if (code === EW_MULTIPLY && this.#structure === "ones") return Matrix.#view(other);
//       if (code === EW_DIVIDE && optimizationOptions.fastMath && this === other) return Matrix.ones(this.rows, this.cols);
//
//       const rewrite = this.#tryMatmulElementwiseRewrite(other, code);
//       if (rewrite != null) return rewrite;
//     } else if (code === EW_MULTIPLY && other.#structure === "ones") {
//       return Matrix.#view(this);
//     } else if ((code === EW_ADD || code === EW_SUBTRACT) && other.#structure === "zero") {
//       return Matrix.#view(this);
//     }
//
//     return Matrix.#exprView(this, {
//       code,
//       other,
//       operandMode: mode,
//       scalarA: 0,
//       scalarB: 0
//     });
//   }
//
//   #tryMatmulElementwiseRewrite(other, code) {
//     if (code !== EW_ADD && code !== EW_SUBTRACT) return null;
//
//     const left = this.#matmulOf;
//     const right = other.#matmulOf;
//     if (left == null || right == null) return null;
//
//     if (Matrix.#sameMatmul(left, right)) {
//       return code === EW_ADD ? this.scale(2) : Matrix.zeros(this.rows, this.cols);
//     }
//
//     if (this.#ptr !== 0 || other.#ptr !== 0) return null;
//
//     if (left.gram != null || right.gram != null || left.variant !== MATMUL_NN || right.variant !== MATMUL_NN) {
//       return null;
//     }
//
//     const m = this.rows;
//     const k = left.left.cols;
//     const n = this.cols;
//     const gemmCost = m * k * n;
//
//     if (
//       left.left === right.left
//       && left.right.rows === right.right.rows
//       && left.right.cols === right.right.cols
//       && Matrix.#shouldDistributeMatmul(gemmCost, left.right.length)
//     ) {
//       const combined = code === EW_ADD ? left.right.add(right.right) : left.right.subtract(right.right);
//       return left.left.matmul(combined);
//     }
//
//     if (
//       left.right === right.right
//       && left.left.rows === right.left.rows
//       && left.left.cols === right.left.cols
//       && Matrix.#shouldDistributeMatmul(gemmCost, left.left.length)
//     ) {
//       const combined = code === EW_ADD ? left.left.add(right.left) : left.left.subtract(right.left);
//       return combined.matmul(left.right);
//     }
//
//     return null;
//   }
//
//   #matmulInput() {
//     if (
//       this.#ptr === 0
//       && this.#transposeOf != null
//       && this.#base == null
//       && this.#inverseOf == null
//       && this.#expr == null
//       && this.#matmulOf == null
//     ) {
//       return { source: this.#transposeOf, transposed: true };
//     }
//
//     return { source: this, transposed: false };
//   }
//
//   #scalarFactorInfo() {
//     if (this.#expr == null) return null;
//
//     let factor = 1;
//     for (const op of this.#expr.ops) {
//       if (op.code === EW_MULTIPLY_SCALAR) {
//         factor *= op.scalarA;
//       } else if (op.code === EW_DIVIDE_SCALAR) {
//         factor /= op.scalarA;
//       } else {
//         return null;
//       }
//     }
//
//     if (factor === 1) return null;
//     return {
//       matrix: this.#expr.base,
//       factor
//     };
//   }
//
//   #matmulScalarRewrite(other) {
//     let left = this;
//     let right = other;
//     let factor = 1;
//     const outputCost = this.rows * other.cols;
//
//     const leftFactor = this.#scalarFactorInfo();
//     if (leftFactor != null && outputCost <= this.length) {
//       left = leftFactor.matrix;
//       factor *= leftFactor.factor;
//     }
//
//     const rightFactor = other.#scalarFactorInfo();
//     if (rightFactor != null && outputCost <= other.length) {
//       right = rightFactor.matrix;
//       factor *= rightFactor.factor;
//     }
//
//     if (left === this && right === other) return null;
//     if (factor === 0) return Matrix.zeros(this.rows, other.cols);
//
//     const product = left.matmul(right);
//     return factor === 1 ? product : product.scale(factor);
//   }
//
//   #materializeExpression(ptr) {
//     const { base, ops } = this.#expr;
//     base.#assertAlive();
//     this.#assertSameRuntime(base);
//
//     const basePtr = base.#materializedPtr();
//     let affineScale = 1;
//     let affineBias = 0;
//     let affineOnly = true;
//
//     for (const op of ops) {
//       if (op.code === EW_ADD_SCALAR) {
//         affineBias += op.scalarA;
//       } else if (op.code === EW_MULTIPLY_SCALAR) {
//         affineScale *= op.scalarA;
//         affineBias *= op.scalarA;
//       } else if (op.code === EW_DIVIDE_SCALAR) {
//         affineScale /= op.scalarA;
//         affineBias /= op.scalarA;
//       } else {
//         affineOnly = false;
//         break;
//       }
//     }
//
//     if (affineOnly) {
//       this.#runtime.exports.affine(basePtr, ptr, this.length, affineScale, affineBias);
//       return;
//     }
//
//     const opcodes = new Int32Array(ops.length);
//     const scalarA = new Float32Array(ops.length);
//     const scalarB = new Float32Array(ops.length);
//     const operandPtrs = new Int32Array(ops.length);
//     const operandModes = new Int32Array(ops.length);
//
//     for (let i = 0; i < ops.length; i++) {
//       const op = ops[i];
//       opcodes[i] = op.code;
//       scalarA[i] = op.scalarA ?? 0;
//       scalarB[i] = op.scalarB ?? 0;
//
//       if (op.other != null) {
//         op.other.#assertAlive();
//         this.#assertSameRuntime(op.other);
//         operandPtrs[i] = op.other.#materializedPtr();
//         operandModes[i] = op.operandMode ?? OPERAND_FULL;
//       }
//     }
//
//     const opcodesPtr = this.#runtime.writeI32(opcodes);
//     const scalarAPtr = this.#runtime.write(scalarA);
//     const scalarBPtr = this.#runtime.write(scalarB);
//     const operandPtrsPtr = this.#runtime.writeI32(operandPtrs);
//     const operandModesPtr = this.#runtime.writeI32(operandModes);
//
//     try {
//       this.#runtime.exports.fusedElementwise(
//         basePtr,
//         ptr,
//         this.rows,
//         this.cols,
//         opcodesPtr,
//         scalarAPtr,
//         scalarBPtr,
//         operandPtrsPtr,
//         operandModesPtr,
//         ops.length
//       );
//     } finally {
//       this.#runtime.free(opcodesPtr);
//       this.#runtime.free(scalarAPtr);
//       this.#runtime.free(scalarBPtr);
//       this.#runtime.free(operandPtrsPtr);
//       this.#runtime.free(operandModesPtr);
//     }
//   }
//
//   #materializeMatmul(ptr) {
//     const { left, right, variant, gram } = this.#matmulOf;
//     left.#assertAlive();
//     right.#assertAlive();
//     this.#assertSameRuntime(left);
//     this.#assertSameRuntime(right);
//
//     const leftPtr = left.#materializedPtr();
//     if (gram === "TN") {
//       this.#runtime.exports.gramTN(leftPtr, ptr, left.rows, left.cols);
//       return;
//     }
//     if (gram === "NT") {
//       this.#runtime.exports.gramNT(leftPtr, ptr, left.rows, left.cols);
//       return;
//     }
//
//     const rightPtr = right.#materializedPtr();
//     if (variant === MATMUL_TN) {
//       this.#runtime.exports.matmulTN(leftPtr, rightPtr, ptr, left.rows, left.cols, right.cols);
//     } else if (variant === MATMUL_NT) {
//       this.#runtime.exports.matmulNT(leftPtr, rightPtr, ptr, left.rows, left.cols, right.rows);
//     } else if (variant === MATMUL_TT) {
//       this.#runtime.exports.matmulTT(leftPtr, rightPtr, ptr, left.rows, left.cols, right.rows);
//     } else {
//       const cost = left.rows * left.cols * right.cols;
//       right.#rightMatmulUses++;
//       if ((right.#packedCache != null || right.#rightMatmulUses > 1) && cost >= 262_144) {
//         this.#runtime.exports.matmulPackedB(leftPtr, right.#packedMatmulPtr(), ptr, left.rows, left.cols, right.cols);
//       } else {
//         this.#runtime.exports.matmul(leftPtr, rightPtr, ptr, left.rows, left.cols, right.cols);
//       }
//     }
//   }
//
//   #materializedPtr() {
//     this.#assertAlive();
//     if (this.#ptr) return this.#ptr;
//
//     const cacheKey = this.#materializationCacheKey();
//     if (cacheKey != null) {
//       const cachedPtr = this.#runtime.getCachedBuffer(cacheKey, this.length);
//       if (cachedPtr) {
//         this.#ptr = cachedPtr;
//         this.#owns = true;
//         matrixFinalizer?.register(this, { runtime: this.#runtime, ptr: this.#ptr }, this);
//         return this.#ptr;
//       }
//     }
//
//     const ptr = this.#runtime.alloc(this.length);
//
//     if (this.#inverseOf != null) {
//       this.#inverseOf.#assertAlive();
//       this.#assertSameRuntime(this.#inverseOf);
//       const cholesky = this.#inverseOf.#choleskyFactor();
//       if (cholesky != null) {
//         const work = this.#runtime.f64Scratch(this.rows * this.cols);
//         const ok = this.#runtime.exports.choleskyInvert(cholesky.lowerPtr, ptr, this.rows, work);
//         /* c8 ignore next 4 */
//         if (ok !== 1) {
//           this.#runtime.free(ptr);
//           throw new RangeError("matrix is singular");
//         }
//         this.#inverseOf = null;
//       } else {
//         const factor = this.#inverseOf.#luFactor();
//         if (factor == null) {
//           this.#runtime.free(ptr);
//           throw new RangeError("matrix is singular");
//         }
//
//         const work = this.#runtime.f64Scratch(this.rows * this.cols);
//         const ok = this.#runtime.exports.luInvert(factor.luPtr, factor.pivotsPtr, ptr, this.rows, work);
//         /* c8 ignore next 4 */
//         if (ok !== 1) {
//           this.#runtime.free(ptr);
//           throw new RangeError("matrix is singular");
//         }
//         this.#inverseOf = null;
//       }
//     } else if (this.#expr != null) {
//       this.#materializeExpression(ptr);
//     } else if (this.#matmulOf != null) {
//       this.#materializeMatmul(ptr);
//     } else if (this.#transposeOf != null) {
//       this.#transposeOf.#assertAlive();
//       this.#assertSameRuntime(this.#transposeOf);
//       this.#runtime.exports.copy(this.#transposeOf.#transposeCachePtr(), ptr, this.length);
//       this.#transposeOf = null;
//     } else if (this.#base != null) {
//       this.#base.#assertAlive();
//       this.#assertSameRuntime(this.#base);
//       this.#runtime.exports.affine(
//         this.#base.#materializedPtr(),
//         ptr,
//         this.length,
//         this.#affineScale,
//         this.#affineBias
//       );
//       this.#base = null;
//       this.#affineScale = 1;
//       this.#affineBias = 0;
//     /* c8 ignore next 4 */
//     } else {
//       this.#runtime.free(ptr);
//       throw new Error("matrix has no materializable backing");
//     }
//
//     this.#ptr = ptr;
//     this.#owns = true;
//     matrixFinalizer?.register(this, { runtime: this.#runtime, ptr: this.#ptr }, this);
//     if (cacheKey != null) {
//       this.#runtime.putCachedBuffer(cacheKey, this.#ptr, this.length);
//     }
//     return this.#ptr;
//   }
//
//   #luFactor() {
//     this.#assertSquare("LU factorization");
//     if (
//       this.#luCache != null
//       && this.#luCache.version === this.#version
//       && this.#cacheEntryAlive(this.#luCache.entry)
//     ) {
//       return this.#luCache;
//     }
//     /* c8 ignore next 4 */
//     if (this.#luCache != null) {
//       this.#releaseCacheEntry(this.#luCache.entry);
//       this.#luCache = null;
//     }
//
//     const sourcePtr = this.#materializedPtr();
//     const luPtr = this.#runtime.allocF64(this.length);
//     const pivotsPtr = this.#runtime.allocI32(this.rows);
//     let sign = 0;
//
//     try {
//       sign = this.#runtime.exports.luFactor(sourcePtr, this.rows, luPtr, pivotsPtr);
//     /* c8 ignore next 5 */
//     } catch (error) {
//       this.#runtime.free(luPtr);
//       this.#runtime.free(pivotsPtr);
//       throw error;
//     }
//
//     if (sign === 0) {
//       this.#runtime.free(luPtr);
//       this.#runtime.free(pivotsPtr);
//       return null;
//     }
//
//     const runtime = this.#runtime;
//     const entry = this.#addCacheEntry(runtime.registerCacheEntry(this.length * 8 + this.rows * 4, () => {
//       runtime.free(luPtr);
//       runtime.free(pivotsPtr);
//     }));
//     const cache = {
//       version: this.#version,
//       luPtr,
//       pivotsPtr,
//       sign,
//       entry
//     };
//     this.#luCache = cache;
//     return cache;
//   }
//
//   #assertAlive() {
//     if (this.#disposed) {
//       throw new Error("matrix has been disposed");
//     }
//   }
//
//   #assertIndex(row, col) {
//     this.#assertAlive();
//     assertInteger(row, "row");
//     assertInteger(col, "col");
//     if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) {
//       throw new RangeError("matrix index is out of range");
//     }
//   }
//
//   #assertSameShape(other) {
//     this.#assertAlive();
//     if (!(other instanceof Matrix)) {
//       throw new TypeError("other must be a Matrix");
//     }
//     other.#assertAlive();
//     this.#assertSameRuntime(other);
//     if (this.rows !== other.rows || this.cols !== other.cols) {
//       throw new RangeError(`shape mismatch: ${this.rows}x${this.cols} !== ${other.rows}x${other.cols}`);
//     }
//   }
//
//   #assertSameRuntime(other) {
//     if (this.#runtime !== other.#runtime) {
//       throw new RangeError("matrices belong to different WASM runtimes");
//     }
//   }
//
//   #assertSquare(operation) {
//     this.#assertAlive();
//     if (this.rows !== this.cols) {
//       throw new RangeError(`${operation} requires a square matrix`);
//     }
//   }
// }
//
// export default Matrix;
// @wasmatrix-js-adapter end

@inline
function f32Offset(index: i32): usize {
  return <usize>index << 2;
}

@inline
function f64Offset(index: i32): usize {
  return <usize>index << 3;
}

@inline
function readF32(ptr: usize, index: i32): f32 {
  return load<f32>(ptr + f32Offset(index));
}

@inline
function writeF32(ptr: usize, index: i32, value: f32): void {
  store<f32>(ptr + f32Offset(index), value);
}

@inline
function readF64(ptr: usize, index: i32): f64 {
  return load<f64>(ptr + f64Offset(index));
}

@inline
function writeF64(ptr: usize, index: i32, value: f64): void {
  store<f64>(ptr + f64Offset(index), value);
}

@inline
function readI32(ptr: usize, index: i32): i32 {
  return load<i32>(ptr + f32Offset(index));
}

@inline
function writeI32(ptr: usize, index: i32, value: i32): void {
  store<i32>(ptr + f32Offset(index), value);
}

@inline
function simdLimit(length: i32): i32 {
  return length & -4;
}

@inline
function horizontalSum4(value: v128): f32 {
  let pairSum = f32x4.add(value, f32x4.shuffle(value, value, 2, 3, 0, 1));
  let total = f32x4.add(pairSum, f32x4.shuffle(pairSum, pairSum, 1, 0, 3, 2));
  return f32x4.extract_lane(total, 0);
}

function copyF32ToF64(src: usize, dst: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    writeF64(dst, i, <f64>readF32(src, i));
  }
}

@inline
function f64PairLimit(start: i32, end: i32): i32 {
  return start + ((end - start) & -2);
}

function swapRowRangeF64(work: usize, rowA: i32, rowB: i32, start: i32, end: i32): void {
  let c = start;
  let limit = f64PairLimit(start, end);

  for (; c < limit; c += 2) {
    let aPtr = work + f64Offset(rowA + c);
    let bPtr = work + f64Offset(rowB + c);
    let tmp = v128.load(aPtr);
    v128.store(aPtr, v128.load(bPtr));
    v128.store(bPtr, tmp);
  }

  for (; c < end; c++) {
    let aIndex = rowA + c;
    let bIndex = rowB + c;
    let tmp = readF64(work, aIndex);
    writeF64(work, aIndex, readF64(work, bIndex));
    writeF64(work, bIndex, tmp);
  }
}

function divideRowF64(work: usize, rowBase: i32, start: i32, end: i32, divisor: f64): void {
  let divisorVector = f64x2.splat(divisor);
  let c = start;
  let limit = f64PairLimit(start, end);

  for (; c < limit; c += 2) {
    let ptr = work + f64Offset(rowBase + c);
    v128.store(ptr, f64x2.div(v128.load(ptr), divisorVector));
  }

  for (; c < end; c++) {
    let index = rowBase + c;
    writeF64(work, index, readF64(work, index) / divisor);
  }
}

function subtractScaledRowF64(work: usize, targetBase: i32, sourceBase: i32, start: i32, end: i32, factor: f64): void {
  let factorVector = f64x2.splat(factor);
  let c = start;
  let limit = f64PairLimit(start, end);

  for (; c < limit; c += 2) {
    let targetPtr = work + f64Offset(targetBase + c);
    let sourcePtr = work + f64Offset(sourceBase + c);
    let product = f64x2.mul(v128.load(sourcePtr), factorVector);
    v128.store(targetPtr, f64x2.sub(v128.load(targetPtr), product));
  }

  for (; c < end; c++) {
    let index = targetBase + c;
    writeF64(work, index, readF64(work, index) - factor * readF64(work, sourceBase + c));
  }
}

function dotSimd(a: usize, b: usize, length: i32): f32 {
  let acc0 = f32x4.splat(0.0);
  let acc1 = f32x4.splat(0.0);
  let acc2 = f32x4.splat(0.0);
  let acc3 = f32x4.splat(0.0);
  let i = 0;
  let unrolledLimit = length & -16;

  for (; i < unrolledLimit; i += 16) {
    let offset = f32Offset(i);
    acc0 = f32x4.add(acc0, f32x4.mul(v128.load(a + offset), v128.load(b + offset)));
    acc1 = f32x4.add(acc1, f32x4.mul(v128.load(a + offset + 16), v128.load(b + offset + 16)));
    acc2 = f32x4.add(acc2, f32x4.mul(v128.load(a + offset + 32), v128.load(b + offset + 32)));
    acc3 = f32x4.add(acc3, f32x4.mul(v128.load(a + offset + 48), v128.load(b + offset + 48)));
  }

  let acc = f32x4.add(f32x4.add(acc0, acc1), f32x4.add(acc2, acc3));
  let limit = simdLimit(length);
  for (; i < limit; i += 4) {
    let offset = f32Offset(i);
    acc = f32x4.add(acc, f32x4.mul(v128.load(a + offset), v128.load(b + offset)));
  }

  let result = horizontalSum4(acc);
  for (; i < length; i++) {
    result += readF32(a, i) * readF32(b, i);
  }
  return result;
}

export function abiVersion(): i32 {
  return 6;
}

export function simdProbe(): i32 {
  let value = f32x4.add(f32x4.splat(1.0), f32x4.splat(2.0));
  return f32x4.extract_lane(value, 0) == 3.0 ? 1 : 0;
}

export function allocF32(length: i32): usize {
  assert(length >= 0);
  return heap.alloc(<usize>length << 2);
}

export function allocF64(length: i32): usize {
  assert(length >= 0);
  return heap.alloc(<usize>length << 3);
}

export function allocI32(length: i32): usize {
  assert(length >= 0);
  return heap.alloc(<usize>length << 2);
}

export function free(ptr: usize): void {
  heap.free(ptr);
}

export function fill(out: usize, length: i32, value: f32): void {
  let vector = f32x4.splat(value);
  let i = 0;
  let limit = simdLimit(length);

  for (; i < limit; i += 4) {
    v128.store(out + f32Offset(i), vector);
  }
  for (; i < length; i++) {
    writeF32(out, i, value);
  }
}

export function copy(input: usize, out: usize, length: i32): void {
  let i = 0;
  let limit = simdLimit(length);

  for (; i < limit; i += 4) {
    let offset = f32Offset(i);
    v128.store(out + offset, v128.load(input + offset));
  }
  for (; i < length; i++) {
    writeF32(out, i, readF32(input, i));
  }
}

export function add(a: usize, b: usize, out: usize, length: i32): void {
  let i = 0;
  let limit = simdLimit(length);

  for (; i < limit; i += 4) {
    let offset = f32Offset(i);
    v128.store(out + offset, f32x4.add(v128.load(a + offset), v128.load(b + offset)));
  }
  for (; i < length; i++) {
    writeF32(out, i, readF32(a, i) + readF32(b, i));
  }
}

export function subtract(a: usize, b: usize, out: usize, length: i32): void {
  let i = 0;
  let limit = simdLimit(length);

  for (; i < limit; i += 4) {
    let offset = f32Offset(i);
    v128.store(out + offset, f32x4.sub(v128.load(a + offset), v128.load(b + offset)));
  }
  for (; i < length; i++) {
    writeF32(out, i, readF32(a, i) - readF32(b, i));
  }
}

export function hadamard(a: usize, b: usize, out: usize, length: i32): void {
  let i = 0;
  let limit = simdLimit(length);

  for (; i < limit; i += 4) {
    let offset = f32Offset(i);
    v128.store(out + offset, f32x4.mul(v128.load(a + offset), v128.load(b + offset)));
  }
  for (; i < length; i++) {
    writeF32(out, i, readF32(a, i) * readF32(b, i));
  }
}

export function divideElements(a: usize, b: usize, out: usize, length: i32): void {
  let i = 0;
  let limit = simdLimit(length);

  for (; i < limit; i += 4) {
    let offset = f32Offset(i);
    v128.store(out + offset, f32x4.div(v128.load(a + offset), v128.load(b + offset)));
  }
  for (; i < length; i++) {
    writeF32(out, i, readF32(a, i) / readF32(b, i));
  }
}

export function minElements(a: usize, b: usize, out: usize, length: i32): void {
  let i = 0;
  let limit = simdLimit(length);

  for (; i < limit; i += 4) {
    let offset = f32Offset(i);
    v128.store(out + offset, f32x4.min(v128.load(a + offset), v128.load(b + offset)));
  }
  for (; i < length; i++) {
    writeF32(out, i, Mathf.min(readF32(a, i), readF32(b, i)));
  }
}

export function maxElements(a: usize, b: usize, out: usize, length: i32): void {
  let i = 0;
  let limit = simdLimit(length);

  for (; i < limit; i += 4) {
    let offset = f32Offset(i);
    v128.store(out + offset, f32x4.max(v128.load(a + offset), v128.load(b + offset)));
  }
  for (; i < length; i++) {
    writeF32(out, i, Mathf.max(readF32(a, i), readF32(b, i)));
  }
}

export function addScalar(input: usize, out: usize, length: i32, value: f32): void {
  let scalar = f32x4.splat(value);
  let i = 0;
  let limit = simdLimit(length);

  for (; i < limit; i += 4) {
    let offset = f32Offset(i);
    v128.store(out + offset, f32x4.add(v128.load(input + offset), scalar));
  }
  for (; i < length; i++) {
    writeF32(out, i, readF32(input, i) + value);
  }
}

export function scale(input: usize, out: usize, length: i32, value: f32): void {
  let scalar = f32x4.splat(value);
  let i = 0;
  let limit = simdLimit(length);

  for (; i < limit; i += 4) {
    let offset = f32Offset(i);
    v128.store(out + offset, f32x4.mul(v128.load(input + offset), scalar));
  }
  for (; i < length; i++) {
    writeF32(out, i, readF32(input, i) * value);
  }
}

export function affine(input: usize, out: usize, length: i32, multiplier: f32, addend: f32): void {
  let multiplierVector = f32x4.splat(multiplier);
  let addendVector = f32x4.splat(addend);
  let i = 0;
  let limit = simdLimit(length);

  for (; i < limit; i += 4) {
    let offset = f32Offset(i);
    let value = f32x4.mul(v128.load(input + offset), multiplierVector);
    v128.store(out + offset, f32x4.add(value, addendVector));
  }
  for (; i < length; i++) {
    writeF32(out, i, readF32(input, i) * multiplier + addend);
  }
}

export function divideScalar(input: usize, out: usize, length: i32, value: f32): void {
  let scalar = f32x4.splat(value);
  let i = 0;
  let limit = simdLimit(length);

  for (; i < limit; i += 4) {
    let offset = f32Offset(i);
    v128.store(out + offset, f32x4.div(v128.load(input + offset), scalar));
  }
  for (; i < length; i++) {
    writeF32(out, i, readF32(input, i) / value);
  }
}

export function negate(input: usize, out: usize, length: i32): void {
  let i = 0;
  let limit = simdLimit(length);

  for (; i < limit; i += 4) {
    let offset = f32Offset(i);
    v128.store(out + offset, f32x4.neg(v128.load(input + offset)));
  }
  for (; i < length; i++) {
    writeF32(out, i, -readF32(input, i));
  }
}

export function absElements(input: usize, out: usize, length: i32): void {
  let i = 0;
  let limit = simdLimit(length);

  for (; i < limit; i += 4) {
    let offset = f32Offset(i);
    v128.store(out + offset, f32x4.abs(v128.load(input + offset)));
  }
  for (; i < length; i++) {
    writeF32(out, i, Mathf.abs(readF32(input, i)));
  }
}

export function sqrtElements(input: usize, out: usize, length: i32): void {
  let i = 0;
  let limit = simdLimit(length);

  for (; i < limit; i += 4) {
    let offset = f32Offset(i);
    v128.store(out + offset, f32x4.sqrt(v128.load(input + offset)));
  }
  for (; i < length; i++) {
    writeF32(out, i, Mathf.sqrt(readF32(input, i)));
  }
}

export function floorElements(input: usize, out: usize, length: i32): void {
  let i = 0;
  let limit = simdLimit(length);

  for (; i < limit; i += 4) {
    let offset = f32Offset(i);
    v128.store(out + offset, f32x4.floor(v128.load(input + offset)));
  }
  for (; i < length; i++) {
    writeF32(out, i, Mathf.floor(readF32(input, i)));
  }
}

export function ceilElements(input: usize, out: usize, length: i32): void {
  let i = 0;
  let limit = simdLimit(length);

  for (; i < limit; i += 4) {
    let offset = f32Offset(i);
    v128.store(out + offset, f32x4.ceil(v128.load(input + offset)));
  }
  for (; i < length; i++) {
    writeF32(out, i, Mathf.ceil(readF32(input, i)));
  }
}

export function clampElements(input: usize, out: usize, length: i32, minValue: f32, maxValue: f32): void {
  let minVector = f32x4.splat(minValue);
  let maxVector = f32x4.splat(maxValue);
  let i = 0;
  let limit = simdLimit(length);

  for (; i < limit; i += 4) {
    let offset = f32Offset(i);
    let value = f32x4.max(v128.load(input + offset), minVector);
    v128.store(out + offset, f32x4.min(value, maxVector));
  }
  for (; i < length; i++) {
    let value = readF32(input, i);
    writeF32(out, i, Mathf.min(Mathf.max(value, minValue), maxValue));
  }
}

@inline
function fusedOtherVector(ptr: usize, mode: i32, row: i32, col: i32, cols: i32, offset: i32): v128 {
  if (mode == 1) return v128.load(ptr + f32Offset(col));
  if (mode == 2) return f32x4.splat(readF32(ptr, row));
  return v128.load(ptr + f32Offset(offset));
}

@inline
function fusedOtherScalar(ptr: usize, mode: i32, row: i32, col: i32, cols: i32, offset: i32): f32 {
  if (mode == 1) return readF32(ptr, col);
  if (mode == 2) return readF32(ptr, row);
  return readF32(ptr, offset);
}

function applyFusedVectorOp(value: v128, code: i32, other: v128, scalarA: f32, scalarB: f32): v128 {
  if (code == 1) return f32x4.add(value, other);
  if (code == 2) return f32x4.sub(value, other);
  if (code == 3) return f32x4.mul(value, other);
  if (code == 4) return f32x4.div(value, other);
  if (code == 5) return f32x4.min(value, other);
  if (code == 6) return f32x4.max(value, other);
  if (code == 7) return f32x4.add(value, f32x4.splat(scalarA));
  if (code == 8) return f32x4.mul(value, f32x4.splat(scalarA));
  if (code == 9) return f32x4.div(value, f32x4.splat(scalarA));
  if (code == 10) return f32x4.neg(value);
  if (code == 11) return f32x4.abs(value);
  if (code == 12) return f32x4.sqrt(value);
  if (code == 13) return f32x4.floor(value);
  if (code == 14) return f32x4.ceil(value);
  if (code == 15) return f32x4.min(f32x4.max(value, f32x4.splat(scalarA)), f32x4.splat(scalarB));
  return value;
}

function applyFusedScalarOp(value: f32, code: i32, other: f32, scalarA: f32, scalarB: f32): f32 {
  if (code == 1) return value + other;
  if (code == 2) return value - other;
  if (code == 3) return value * other;
  if (code == 4) return value / other;
  if (code == 5) return Mathf.min(value, other);
  if (code == 6) return Mathf.max(value, other);
  if (code == 7) return value + scalarA;
  if (code == 8) return value * scalarA;
  if (code == 9) return value / scalarA;
  if (code == 10) return -value;
  if (code == 11) return Mathf.abs(value);
  if (code == 12) return Mathf.sqrt(value);
  if (code == 13) return Mathf.floor(value);
  if (code == 14) return Mathf.ceil(value);
  if (code == 15) return Mathf.min(Mathf.max(value, scalarA), scalarB);
  return value;
}

export function fusedElementwise(
  input: usize,
  out: usize,
  rows: i32,
  cols: i32,
  opcodes: usize,
  scalarA: usize,
  scalarB: usize,
  operandPtrs: usize,
  operandModes: usize,
  opCount: i32
): void {
  let colLimit = simdLimit(cols);

  for (let r = 0; r < rows; r++) {
    let rowBase = r * cols;
    let c = 0;

    for (; c < colLimit; c += 4) {
      let offset = rowBase + c;
      let value = v128.load(input + f32Offset(offset));

      for (let op = 0; op < opCount; op++) {
        let code = readI32(opcodes, op);
        let other = f32x4.splat(0.0);
        if (code <= 6) {
          let ptr = <usize>readI32(operandPtrs, op);
          let mode = readI32(operandModes, op);
          other = fusedOtherVector(ptr, mode, r, c, cols, offset);
        }
        value = applyFusedVectorOp(value, code, other, readF32(scalarA, op), readF32(scalarB, op));
      }

      v128.store(out + f32Offset(offset), value);
    }

    for (; c < cols; c++) {
      let offset = rowBase + c;
      let value = readF32(input, offset);

      for (let op = 0; op < opCount; op++) {
        let code = readI32(opcodes, op);
        let other: f32 = 0.0;
        if (code <= 6) {
          let ptr = <usize>readI32(operandPtrs, op);
          let mode = readI32(operandModes, op);
          other = fusedOtherScalar(ptr, mode, r, c, cols, offset);
        }
        value = applyFusedScalarOp(value, code, other, readF32(scalarA, op), readF32(scalarB, op));
      }

      writeF32(out, offset, value);
    }
  }
}

export function transpose(input: usize, out: usize, rows: i32, cols: i32): void {
  let block = 16;
  for (let rb = 0; rb < rows; rb += block) {
    let rEnd = rb + block < rows ? rb + block : rows;
    for (let cb = 0; cb < cols; cb += block) {
      let cEnd = cb + block < cols ? cb + block : cols;
      for (let r = rb; r < rEnd; r++) {
        let rowBase = r * cols;
        for (let c = cb; c < cEnd; c++) {
          writeF32(out, c * rows + r, readF32(input, rowBase + c));
        }
      }
    }
  }
}

export function identity(out: usize, size: i32): void {
  fill(out, size * size, 0.0);
  for (let i = 0; i < size; i++) {
    writeF32(out, i * size + i, 1.0);
  }
}

export function diagonal(input: usize, out: usize, rows: i32, cols: i32): void {
  let length = rows < cols ? rows : cols;
  for (let i = 0; i < length; i++) {
    writeF32(out, i, readF32(input, i * cols + i));
  }
}

export function diagonalMatrix(input: usize, out: usize, size: i32): void {
  fill(out, size * size, 0.0);
  for (let i = 0; i < size; i++) {
    writeF32(out, i * size + i, readF32(input, i));
  }
}

export function diagonalProduct(input: usize, size: i32): f64 {
  let result: f64 = 1.0;
  for (let i = 0; i < size; i++) {
    result *= <f64>readF32(input, i * size + i);
  }
  return result;
}

export function invertDiagonal(input: usize, out: usize, size: i32): i32 {
  fill(out, size * size, 0.0);
  for (let i = 0; i < size; i++) {
    let index = i * size + i;
    let value = readF32(input, index);
    if (Math.abs(<f64>value) <= EPSILON) return 0;
    writeF32(out, index, 1.0 / value);
  }
  return 1;
}

export function solveDiagonal(diagonalMatrix: usize, b: usize, out: usize, size: i32, rhsCols: i32): i32 {
  for (let r = 0; r < size; r++) {
    let diagonalValue = readF32(diagonalMatrix, r * size + r);
    if (Math.abs(<f64>diagonalValue) <= EPSILON) return 0;

    let inverseDiagonal = f32x4.splat(1.0 / diagonalValue);
    let rowBase = r * rhsCols;
    let c = 0;
    let limit = simdLimit(rhsCols);

    for (; c < limit; c += 4) {
      let offset = f32Offset(rowBase + c);
      v128.store(out + offset, f32x4.mul(v128.load(b + offset), inverseDiagonal));
    }
    for (; c < rhsCols; c++) {
      let index = rowBase + c;
      writeF32(out, index, readF32(b, index) / diagonalValue);
    }
  }

  return 1;
}

export function scaleRowsByDiagonal(diagonalMatrix: usize, input: usize, out: usize, rows: i32, cols: i32): void {
  for (let r = 0; r < rows; r++) {
    let scalar = f32x4.splat(readF32(diagonalMatrix, r * rows + r));
    let rowBase = r * cols;
    let c = 0;
    let limit = simdLimit(cols);

    for (; c < limit; c += 4) {
      let offset = f32Offset(rowBase + c);
      v128.store(out + offset, f32x4.mul(v128.load(input + offset), scalar));
    }
    for (; c < cols; c++) {
      let index = rowBase + c;
      writeF32(out, index, readF32(input, index) * f32x4.extract_lane(scalar, 0));
    }
  }
}

export function scaleColsByDiagonal(input: usize, diagonalMatrix: usize, out: usize, rows: i32, cols: i32): void {
  for (let r = 0; r < rows; r++) {
    let rowBase = r * cols;
    for (let c = 0; c < cols; c++) {
      writeF32(out, rowBase + c, readF32(input, rowBase + c) * readF32(diagonalMatrix, c * cols + c));
    }
  }
}

export function dot(a: usize, b: usize, length: i32): f32 {
  return dotSimd(a, b, length);
}

export function matmul(a: usize, b: usize, out: usize, rowsA: i32, colsA: i32, colsB: i32): void {
  for (let r = 0; r < rowsA; r++) {
    let aRow = a + f32Offset(r * colsA);
    let outBase = r * colsB;
    let c = 0;
    let colLimit = simdLimit(colsB);

    for (; c < colLimit; c += 4) {
      let acc0 = f32x4.splat(0.0);
      let acc1 = f32x4.splat(0.0);
      let acc2 = f32x4.splat(0.0);
      let acc3 = f32x4.splat(0.0);
      let k = 0;
      let kLimit = colsA & -4;

      for (; k < kLimit; k += 4) {
        let bOffset0 = f32Offset(k * colsB + c);
        let bOffset1 = f32Offset((k + 1) * colsB + c);
        let bOffset2 = f32Offset((k + 2) * colsB + c);
        let bOffset3 = f32Offset((k + 3) * colsB + c);

        acc0 = f32x4.add(acc0, f32x4.mul(f32x4.splat(load<f32>(aRow + f32Offset(k))), v128.load(b + bOffset0)));
        acc1 = f32x4.add(acc1, f32x4.mul(f32x4.splat(load<f32>(aRow + f32Offset(k + 1))), v128.load(b + bOffset1)));
        acc2 = f32x4.add(acc2, f32x4.mul(f32x4.splat(load<f32>(aRow + f32Offset(k + 2))), v128.load(b + bOffset2)));
        acc3 = f32x4.add(acc3, f32x4.mul(f32x4.splat(load<f32>(aRow + f32Offset(k + 3))), v128.load(b + bOffset3)));
      }

      let acc = f32x4.add(f32x4.add(acc0, acc1), f32x4.add(acc2, acc3));
      for (; k < colsA; k++) {
        let scalar = f32x4.splat(load<f32>(aRow + f32Offset(k)));
        acc = f32x4.add(acc, f32x4.mul(scalar, v128.load(b + f32Offset(k * colsB + c))));
      }

      v128.store(out + f32Offset(outBase + c), acc);
    }

    for (; c < colsB; c++) {
      let total: f32 = 0.0;
      for (let k = 0; k < colsA; k++) {
        total += load<f32>(aRow + f32Offset(k)) * readF32(b, k * colsB + c);
      }
      writeF32(out, outBase + c, total);
    }
  }
}

export function packForMatmul(input: usize, out: usize, rows: i32, cols: i32): void {
  for (let c = 0; c < cols; c++) {
    let outBase = c * rows;
    for (let r = 0; r < rows; r++) {
      writeF32(out, outBase + r, readF32(input, r * cols + c));
    }
  }
}

export function matmulPackedB(a: usize, packedB: usize, out: usize, rowsA: i32, colsA: i32, colsB: i32): void {
  for (let r = 0; r < rowsA; r++) {
    let aRow = a + f32Offset(r * colsA);
    let outBase = r * colsB;
    for (let c = 0; c < colsB; c++) {
      writeF32(out, outBase + c, dotSimd(aRow, packedB + f32Offset(c * colsA), colsA));
    }
  }
}

export function matmulTN(a: usize, b: usize, out: usize, rowsA: i32, colsA: i32, colsB: i32): void {
  for (let r = 0; r < colsA; r++) {
    let outBase = r * colsB;
    let c = 0;
    let colLimit = simdLimit(colsB);

    for (; c < colLimit; c += 4) {
      let acc = f32x4.splat(0.0);
      for (let k = 0; k < rowsA; k++) {
        let scalar = f32x4.splat(readF32(a, k * colsA + r));
        acc = f32x4.add(acc, f32x4.mul(scalar, v128.load(b + f32Offset(k * colsB + c))));
      }
      v128.store(out + f32Offset(outBase + c), acc);
    }

    for (; c < colsB; c++) {
      let total: f32 = 0.0;
      for (let k = 0; k < rowsA; k++) {
        total += readF32(a, k * colsA + r) * readF32(b, k * colsB + c);
      }
      writeF32(out, outBase + c, total);
    }
  }
}

export function matmulNT(a: usize, b: usize, out: usize, rowsA: i32, colsA: i32, rowsB: i32): void {
  for (let r = 0; r < rowsA; r++) {
    let outBase = r * rowsB;
    let aRow = a + f32Offset(r * colsA);
    let c = 0;
    let colBlockLimit = rowsB & -4;

    for (; c < colBlockLimit; c += 4) {
      let acc0 = f32x4.splat(0.0);
      let acc1 = f32x4.splat(0.0);
      let acc2 = f32x4.splat(0.0);
      let acc3 = f32x4.splat(0.0);
      let k = 0;
      let kLimit = simdLimit(colsA);

      for (; k < kLimit; k += 4) {
        let aVec = v128.load(aRow + f32Offset(k));
        acc0 = f32x4.add(acc0, f32x4.mul(aVec, v128.load(b + f32Offset(c * colsA + k))));
        acc1 = f32x4.add(acc1, f32x4.mul(aVec, v128.load(b + f32Offset((c + 1) * colsA + k))));
        acc2 = f32x4.add(acc2, f32x4.mul(aVec, v128.load(b + f32Offset((c + 2) * colsA + k))));
        acc3 = f32x4.add(acc3, f32x4.mul(aVec, v128.load(b + f32Offset((c + 3) * colsA + k))));
      }

      let total0 = horizontalSum4(acc0);
      let total1 = horizontalSum4(acc1);
      let total2 = horizontalSum4(acc2);
      let total3 = horizontalSum4(acc3);
      for (; k < colsA; k++) {
        let value = load<f32>(aRow + f32Offset(k));
        total0 += value * readF32(b, c * colsA + k);
        total1 += value * readF32(b, (c + 1) * colsA + k);
        total2 += value * readF32(b, (c + 2) * colsA + k);
        total3 += value * readF32(b, (c + 3) * colsA + k);
      }

      writeF32(out, outBase + c, total0);
      writeF32(out, outBase + c + 1, total1);
      writeF32(out, outBase + c + 2, total2);
      writeF32(out, outBase + c + 3, total3);
    }

    for (; c < rowsB; c++) {
      writeF32(out, outBase + c, dotSimd(aRow, b + f32Offset(c * colsA), colsA));
    }
  }
}

export function matmulTT(a: usize, b: usize, out: usize, rowsA: i32, colsA: i32, rowsB: i32): void {
  for (let r = 0; r < colsA; r++) {
    let outBase = r * rowsB;
    for (let c = 0; c < rowsB; c++) {
      let total: f32 = 0.0;
      for (let k = 0; k < rowsA; k++) {
        total += readF32(a, k * colsA + r) * readF32(b, c * rowsA + k);
      }
      writeF32(out, outBase + c, total);
    }
  }
}

export function gramTN(a: usize, out: usize, rows: i32, cols: i32): void {
  for (let r = 0; r < cols; r++) {
    for (let c = r; c < cols; c++) {
      let total: f32 = 0.0;
      for (let k = 0; k < rows; k++) {
        total += readF32(a, k * cols + r) * readF32(a, k * cols + c);
      }
      writeF32(out, r * cols + c, total);
      if (c != r) writeF32(out, c * cols + r, total);
    }
  }
}

export function gramNT(a: usize, out: usize, rows: i32, cols: i32): void {
  for (let r = 0; r < rows; r++) {
    for (let c = r; c < rows; c++) {
      let total = dotSimd(a + f32Offset(r * cols), a + f32Offset(c * cols), cols);
      writeF32(out, r * rows + c, total);
      if (c != r) writeF32(out, c * rows + r, total);
    }
  }
}

export function traceMatmul(a: usize, b: usize, rowsA: i32, colsA: i32): f64 {
  let total: f64 = 0.0;
  for (let r = 0; r < rowsA; r++) {
    for (let c = 0; c < colsA; c++) {
      total += <f64>readF32(a, r * colsA + c) * <f64>readF32(b, c * rowsA + r);
    }
  }
  return total;
}

export function matvec(a: usize, vector: usize, out: usize, rows: i32, cols: i32): void {
  for (let r = 0; r < rows; r++) {
    writeF32(out, r, dotSimd(a + f32Offset(r * cols), vector, cols));
  }
}

export function outer(a: usize, b: usize, out: usize, rows: i32, cols: i32): void {
  let limit = simdLimit(cols);
  for (let r = 0; r < rows; r++) {
    let scalarValue = readF32(a, r);
    let scalar = f32x4.splat(scalarValue);
    let outBase = r * cols;
    let c = 0;

    for (; c < limit; c += 4) {
      let offset = f32Offset(c);
      v128.store(out + f32Offset(outBase + c), f32x4.mul(scalar, v128.load(b + offset)));
    }
    for (; c < cols; c++) {
      writeF32(out, outBase + c, scalarValue * readF32(b, c));
    }
  }
}

export function sum(input: usize, length: i32): f64 {
  let acc0 = f32x4.splat(0.0);
  let acc1 = f32x4.splat(0.0);
  let acc2 = f32x4.splat(0.0);
  let acc3 = f32x4.splat(0.0);
  let i = 0;
  let unrolledLimit = length & -16;

  for (; i < unrolledLimit; i += 16) {
    let offset = f32Offset(i);
    acc0 = f32x4.add(acc0, v128.load(input + offset));
    acc1 = f32x4.add(acc1, v128.load(input + offset + 16));
    acc2 = f32x4.add(acc2, v128.load(input + offset + 32));
    acc3 = f32x4.add(acc3, v128.load(input + offset + 48));
  }

  let acc = f32x4.add(f32x4.add(acc0, acc1), f32x4.add(acc2, acc3));
  let limit = simdLimit(length);
  for (; i < limit; i += 4) {
    acc = f32x4.add(acc, v128.load(input + f32Offset(i)));
  }

  let result: f64 = <f64>horizontalSum4(acc);
  for (; i < length; i++) {
    result += <f64>readF32(input, i);
  }
  return result;
}

export function minValue(input: usize, length: i32): f32 {
  if (length <= 0) return f32.NaN;

  let i = 0;
  let limit = simdLimit(length);
  let value: f32;

  if (limit > 0) {
    let vector = v128.load(input);
    i = 4;
    for (; i < limit; i += 4) {
      vector = f32x4.min(vector, v128.load(input + f32Offset(i)));
    }
    value = Mathf.min(
      Mathf.min(f32x4.extract_lane(vector, 0), f32x4.extract_lane(vector, 1)),
      Mathf.min(f32x4.extract_lane(vector, 2), f32x4.extract_lane(vector, 3))
    );
  } else {
    value = readF32(input, 0);
    i = 1;
  }

  for (; i < length; i++) {
    value = Mathf.min(value, readF32(input, i));
  }
  return value;
}

export function maxValue(input: usize, length: i32): f32 {
  if (length <= 0) return f32.NaN;

  let i = 0;
  let limit = simdLimit(length);
  let value: f32;

  if (limit > 0) {
    let vector = v128.load(input);
    i = 4;
    for (; i < limit; i += 4) {
      vector = f32x4.max(vector, v128.load(input + f32Offset(i)));
    }
    value = Mathf.max(
      Mathf.max(f32x4.extract_lane(vector, 0), f32x4.extract_lane(vector, 1)),
      Mathf.max(f32x4.extract_lane(vector, 2), f32x4.extract_lane(vector, 3))
    );
  } else {
    value = readF32(input, 0);
    i = 1;
  }

  for (; i < length; i++) {
    value = Mathf.max(value, readF32(input, i));
  }
  return value;
}

export function trace(input: usize, rows: i32, cols: i32): f64 {
  let length = rows < cols ? rows : cols;
  let result: f64 = 0.0;
  for (let i = 0; i < length; i++) {
    result += <f64>readF32(input, i * cols + i);
  }
  return result;
}

export function frobeniusNorm(input: usize, length: i32): f64 {
  let acc0 = f32x4.splat(0.0);
  let acc1 = f32x4.splat(0.0);
  let acc2 = f32x4.splat(0.0);
  let acc3 = f32x4.splat(0.0);
  let i = 0;
  let unrolledLimit = length & -16;

  for (; i < unrolledLimit; i += 16) {
    let offset = f32Offset(i);
    let value0 = v128.load(input + offset);
    let value1 = v128.load(input + offset + 16);
    let value2 = v128.load(input + offset + 32);
    let value3 = v128.load(input + offset + 48);
    acc0 = f32x4.add(acc0, f32x4.mul(value0, value0));
    acc1 = f32x4.add(acc1, f32x4.mul(value1, value1));
    acc2 = f32x4.add(acc2, f32x4.mul(value2, value2));
    acc3 = f32x4.add(acc3, f32x4.mul(value3, value3));
  }

  let acc = f32x4.add(f32x4.add(acc0, acc1), f32x4.add(acc2, acc3));
  let limit = simdLimit(length);
  for (; i < limit; i += 4) {
    let value = v128.load(input + f32Offset(i));
    acc = f32x4.add(acc, f32x4.mul(value, value));
  }

  let total: f64 = <f64>horizontalSum4(acc);
  for (; i < length; i++) {
    let value = <f64>readF32(input, i);
    total += value * value;
  }
  return Math.sqrt(total);
}

export function determinant(input: usize, size: i32): f64 {
  if (size == 0) return 1.0;

  let length = size * size;
  let work = heap.alloc(<usize>length << 3);
  let result = determinantWithWork(input, size, work);
  heap.free(work);
  return result;
}

export function determinantWithWork(input: usize, size: i32, work: usize): f64 {
  if (size == 0) return 1.0;

  let length = size * size;
  copyF32ToF64(input, work, length);

  let sign: f64 = 1.0;
  let result: f64 = 1.0;

  for (let k = 0; k < size; k++) {
    let pivot = k;
    let maxAbs = Math.abs(readF64(work, k * size + k));

    for (let r = k + 1; r < size; r++) {
      let value = Math.abs(readF64(work, r * size + k));
      if (value > maxAbs) {
        maxAbs = value;
        pivot = r;
      }
    }

    if (maxAbs <= EPSILON) {
      return 0.0;
    }

    if (pivot != k) {
      swapRowRangeF64(work, k * size, pivot * size, k, size);
      sign = -sign;
    }

    let pivotValue = readF64(work, k * size + k);
    result *= pivotValue;

    for (let r = k + 1; r < size; r++) {
      let factor = readF64(work, r * size + k) / pivotValue;
      writeF64(work, r * size + k, 0.0);
      subtractScaledRowF64(work, r * size, k * size, k + 1, size, factor);
    }
  }

  return result * sign;
}

export function luFactor(input: usize, size: i32, lu: usize, pivots: usize): i32 {
  if (size == 0) return 1;

  let length = size * size;
  copyF32ToF64(input, lu, length);

  let sign = 1;
  for (let k = 0; k < size; k++) {
    let pivot = k;
    let maxAbs = Math.abs(readF64(lu, k * size + k));

    for (let r = k + 1; r < size; r++) {
      let value = Math.abs(readF64(lu, r * size + k));
      if (value > maxAbs) {
        maxAbs = value;
        pivot = r;
      }
    }

    writeI32(pivots, k, pivot);
    if (maxAbs <= EPSILON) {
      return 0;
    }

    if (pivot != k) {
      swapRowRangeF64(lu, k * size, pivot * size, 0, size);
      sign = -sign;
    }

    let pivotValue = readF64(lu, k * size + k);
    for (let r = k + 1; r < size; r++) {
      let factor = readF64(lu, r * size + k) / pivotValue;
      writeF64(lu, r * size + k, factor);
      subtractScaledRowF64(lu, r * size, k * size, k + 1, size, factor);
    }
  }

  return sign;
}

export function luDeterminant(lu: usize, size: i32, sign: i32): f64 {
  if (sign == 0) return 0.0;

  let result = <f64>sign;
  for (let i = 0; i < size; i++) {
    result *= readF64(lu, i * size + i);
  }
  return result;
}

function solveLuInPlace(lu: usize, pivots: usize, rhsWork: usize, size: i32, rhsCols: i32): i32 {
  for (let k = 0; k < size; k++) {
    let pivot = readI32(pivots, k);
    if (pivot != k) {
      swapRowRangeF64(rhsWork, k * rhsCols, pivot * rhsCols, 0, rhsCols);
    }
  }

  for (let i = 0; i < size; i++) {
    let targetBase = i * rhsCols;
    for (let j = 0; j < i; j++) {
      let factor = readF64(lu, i * size + j);
      if (Math.abs(factor) <= EPSILON) continue;
      subtractScaledRowF64(rhsWork, targetBase, j * rhsCols, 0, rhsCols, factor);
    }
  }

  let row = size;
  while (row > 0) {
    row--;
    let targetBase = row * rhsCols;
    for (let j = row + 1; j < size; j++) {
      let factor = readF64(lu, row * size + j);
      if (Math.abs(factor) <= EPSILON) continue;
      subtractScaledRowF64(rhsWork, targetBase, j * rhsCols, 0, rhsCols, factor);
    }

    let diagonal = readF64(lu, row * size + row);
    if (Math.abs(diagonal) <= EPSILON) {
      return 0;
    }
    divideRowF64(rhsWork, targetBase, 0, rhsCols, diagonal);
  }

  return 1;
}

function writeF64BlockToF32(src: usize, dst: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    writeF32(dst, i, <f32>readF64(src, i));
  }
}

export function luSolve(lu: usize, pivots: usize, b: usize, out: usize, size: i32, rhsCols: i32, rhsWork: usize): i32 {
  let length = size * rhsCols;
  copyF32ToF64(b, rhsWork, length);

  let ok = solveLuInPlace(lu, pivots, rhsWork, size, rhsCols);
  if (ok != 1) return 0;

  writeF64BlockToF32(rhsWork, out, length);
  return 1;
}

export function luInvert(lu: usize, pivots: usize, out: usize, size: i32, rhsWork: usize): i32 {
  let length = size * size;
  for (let i = 0; i < length; i++) {
    writeF64(rhsWork, i, 0.0);
  }
  for (let i = 0; i < size; i++) {
    writeF64(rhsWork, i * size + i, 1.0);
  }

  let ok = solveLuInPlace(lu, pivots, rhsWork, size, size);
  if (ok != 1) return 0;

  writeF64BlockToF32(rhsWork, out, length);
  return 1;
}

export function choleskyFactor(input: usize, size: i32, lower: usize): i32 {
  for (let i = 0; i < size * size; i++) {
    writeF64(lower, i, 0.0);
  }

  for (let i = 0; i < size; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = <f64>readF32(input, i * size + j);

      for (let k = 0; k < j; k++) {
        sum -= readF64(lower, i * size + k) * readF64(lower, j * size + k);
      }

      if (i == j) {
        if (sum <= EPSILON) return 0;
        writeF64(lower, i * size + j, Math.sqrt(sum));
      } else {
        let diagonal = readF64(lower, j * size + j);
        if (Math.abs(diagonal) <= EPSILON) return 0;
        writeF64(lower, i * size + j, sum / diagonal);
      }
    }
  }

  return 1;
}

export function choleskyDeterminant(lower: usize, size: i32): f64 {
  let result: f64 = 1.0;
  for (let i = 0; i < size; i++) {
    let diagonal = readF64(lower, i * size + i);
    result *= diagonal * diagonal;
  }
  return result;
}

export function choleskyLogDet(lower: usize, size: i32): f64 {
  let result: f64 = 0.0;
  for (let i = 0; i < size; i++) {
    result += Math.log(readF64(lower, i * size + i));
  }
  return result * 2.0;
}

function solveCholeskyInPlace(lower: usize, rhsWork: usize, size: i32, rhsCols: i32): i32 {
  for (let i = 0; i < size; i++) {
    let targetBase = i * rhsCols;

    for (let j = 0; j < i; j++) {
      let factor = readF64(lower, i * size + j);
      if (Math.abs(factor) <= EPSILON) continue;
      subtractScaledRowF64(rhsWork, targetBase, j * rhsCols, 0, rhsCols, factor);
    }

    let diagonal = readF64(lower, i * size + i);
    if (Math.abs(diagonal) <= EPSILON) return 0;
    divideRowF64(rhsWork, targetBase, 0, rhsCols, diagonal);
  }

  let row = size;
  while (row > 0) {
    row--;
    let targetBase = row * rhsCols;

    for (let j = row + 1; j < size; j++) {
      let factor = readF64(lower, j * size + row);
      if (Math.abs(factor) <= EPSILON) continue;
      subtractScaledRowF64(rhsWork, targetBase, j * rhsCols, 0, rhsCols, factor);
    }

    let diagonal = readF64(lower, row * size + row);
    if (Math.abs(diagonal) <= EPSILON) return 0;
    divideRowF64(rhsWork, targetBase, 0, rhsCols, diagonal);
  }

  return 1;
}

export function choleskySolve(lower: usize, b: usize, out: usize, size: i32, rhsCols: i32, rhsWork: usize): i32 {
  let length = size * rhsCols;
  copyF32ToF64(b, rhsWork, length);

  let ok = solveCholeskyInPlace(lower, rhsWork, size, rhsCols);
  if (ok != 1) return 0;

  writeF64BlockToF32(rhsWork, out, length);
  return 1;
}

export function choleskyInvert(lower: usize, out: usize, size: i32, rhsWork: usize): i32 {
  let length = size * size;
  for (let i = 0; i < length; i++) {
    writeF64(rhsWork, i, 0.0);
  }
  for (let i = 0; i < size; i++) {
    writeF64(rhsWork, i * size + i, 1.0);
  }

  let ok = solveCholeskyInPlace(lower, rhsWork, size, size);
  if (ok != 1) return 0;

  writeF64BlockToF32(rhsWork, out, length);
  return 1;
}

export function inverse(input: usize, out: usize, size: i32): i32 {
  let cols = size * 2;
  let work = heap.alloc(<usize>(size * cols) << 3);
  let result = inverseWithWork(input, out, size, work);
  heap.free(work);
  return result;
}

export function inverseWithWork(input: usize, out: usize, size: i32, work: usize): i32 {
  let cols = size * 2;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      writeF64(work, r * cols + c, <f64>readF32(input, r * size + c));
      writeF64(work, r * cols + size + c, r == c ? 1.0 : 0.0);
    }
  }

  for (let col = 0; col < size; col++) {
    let pivot = col;
    let maxAbs = Math.abs(readF64(work, col * cols + col));

    for (let r = col + 1; r < size; r++) {
      let value = Math.abs(readF64(work, r * cols + col));
      if (value > maxAbs) {
        maxAbs = value;
        pivot = r;
      }
    }

    if (maxAbs <= EPSILON) {
      return 0;
    }

    if (pivot != col) {
      swapRowRangeF64(work, col * cols, pivot * cols, 0, cols);
    }

    let pivotValue = readF64(work, col * cols + col);
    divideRowF64(work, col * cols, 0, cols, pivotValue);

    for (let r = 0; r < size; r++) {
      if (r == col) continue;

      let factor = readF64(work, r * cols + col);
      if (Math.abs(factor) <= EPSILON) continue;

      subtractScaledRowF64(work, r * cols, col * cols, 0, cols, factor);
    }
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      writeF32(out, r * size + c, <f32>readF64(work, r * cols + size + c));
    }
  }

  return 1;
}

export function solve(a: usize, b: usize, out: usize, size: i32, rhsCols: i32): i32 {
  let cols = size + rhsCols;
  let work = heap.alloc(<usize>(size * cols) << 3);
  let result = solveWithWork(a, b, out, size, rhsCols, work);
  heap.free(work);
  return result;
}

export function solveWithWork(a: usize, b: usize, out: usize, size: i32, rhsCols: i32, work: usize): i32 {
  let cols = size + rhsCols;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      writeF64(work, r * cols + c, <f64>readF32(a, r * size + c));
    }
    for (let c = 0; c < rhsCols; c++) {
      writeF64(work, r * cols + size + c, <f64>readF32(b, r * rhsCols + c));
    }
  }

  for (let col = 0; col < size; col++) {
    let pivot = col;
    let maxAbs = Math.abs(readF64(work, col * cols + col));

    for (let r = col + 1; r < size; r++) {
      let value = Math.abs(readF64(work, r * cols + col));
      if (value > maxAbs) {
        maxAbs = value;
        pivot = r;
      }
    }

    if (maxAbs <= EPSILON) {
      return 0;
    }

    if (pivot != col) {
      swapRowRangeF64(work, col * cols, pivot * cols, 0, cols);
    }

    let pivotValue = readF64(work, col * cols + col);
    divideRowF64(work, col * cols, col, cols, pivotValue);

    for (let r = 0; r < size; r++) {
      if (r == col) continue;

      let factor = readF64(work, r * cols + col);
      if (Math.abs(factor) <= EPSILON) continue;

      subtractScaledRowF64(work, r * cols, col * cols, col, cols, factor);
    }
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < rhsCols; c++) {
      writeF32(out, r * rhsCols + c, <f32>readF64(work, r * cols + size + c));
    }
  }

  return 1;
}

export function rank(input: usize, rows: i32, cols: i32, epsilon: f64): i32 {
  let length = rows * cols;
  let work = heap.alloc(<usize>length << 3);
  let result = rankWithWork(input, rows, cols, epsilon, work);
  heap.free(work);
  return result;
}

export function rankWithWork(input: usize, rows: i32, cols: i32, epsilon: f64, work: usize): i32 {
  let length = rows * cols;
  copyF32ToF64(input, work, length);

  let row = 0;
  let result = 0;

  for (let col = 0; col < cols && row < rows; col++) {
    let pivot = row;
    let maxAbs = Math.abs(readF64(work, row * cols + col));

    for (let r = row + 1; r < rows; r++) {
      let value = Math.abs(readF64(work, r * cols + col));
      if (value > maxAbs) {
        maxAbs = value;
        pivot = r;
      }
    }

    if (maxAbs <= epsilon) continue;

    if (pivot != row) {
      swapRowRangeF64(work, row * cols, pivot * cols, col, cols);
    }

    let pivotValue = readF64(work, row * cols + col);
    divideRowF64(work, row * cols, col, cols, pivotValue);

    for (let r = 0; r < rows; r++) {
      if (r == row) continue;

      let factor = readF64(work, r * cols + col);
      if (Math.abs(factor) <= epsilon) continue;

      subtractScaledRowF64(work, r * cols, row * cols, col, cols, factor);
    }

    row++;
    result++;
  }

  return result;
}

export function qrFactor(input: usize, rows: i32, cols: i32, q: usize, r: usize): i32 {
  let qLength = rows * cols;
  let rLength = cols * cols;
  for (let i = 0; i < qLength; i++) {
    writeF64(q, i, 0.0);
  }
  for (let i = 0; i < rLength; i++) {
    writeF64(r, i, 0.0);
  }

  let rank = 0;
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      writeF64(q, row * cols + col, <f64>readF32(input, row * cols + col));
    }

    for (let prev = 0; prev < col; prev++) {
      let projection: f64 = 0.0;
      for (let row = 0; row < rows; row++) {
        projection += readF64(q, row * cols + prev) * readF64(q, row * cols + col);
      }
      writeF64(r, prev * cols + col, projection);
      for (let row = 0; row < rows; row++) {
        let index = row * cols + col;
        writeF64(q, index, readF64(q, index) - projection * readF64(q, row * cols + prev));
      }
    }

    let normSquared: f64 = 0.0;
    for (let row = 0; row < rows; row++) {
      let value = readF64(q, row * cols + col);
      normSquared += value * value;
    }

    let norm = Math.sqrt(normSquared);
    writeF64(r, col * cols + col, norm);

    if (norm > EPSILON) {
      rank++;
      for (let row = 0; row < rows; row++) {
        let index = row * cols + col;
        writeF64(q, index, readF64(q, index) / norm);
      }
    } else {
      for (let row = 0; row < rows; row++) {
        writeF64(q, row * cols + col, 0.0);
      }
    }
  }

  return rank;
}

export function qrRank(r: usize, rows: i32, cols: i32, epsilon: f64): i32 {
  let diagonal = rows < cols ? rows : cols;
  let rank = 0;
  for (let i = 0; i < diagonal; i++) {
    if (Math.abs(readF64(r, i * cols + i)) > epsilon) rank++;
  }
  return rank;
}

export function qrSolve(q: usize, r: usize, b: usize, out: usize, rows: i32, cols: i32, rhsCols: i32, work: usize): i32 {
  for (let i = 0; i < cols * rhsCols; i++) {
    writeF64(work, i, 0.0);
  }

  for (let col = 0; col < cols; col++) {
    for (let rhs = 0; rhs < rhsCols; rhs++) {
      let total: f64 = 0.0;
      for (let row = 0; row < rows; row++) {
        total += readF64(q, row * cols + col) * <f64>readF32(b, row * rhsCols + rhs);
      }
      writeF64(work, col * rhsCols + rhs, total);
    }
  }

  let row = cols;
  while (row > 0) {
    row--;
    let targetBase = row * rhsCols;

    for (let j = row + 1; j < cols; j++) {
      let factor = readF64(r, row * cols + j);
      if (Math.abs(factor) <= EPSILON) continue;
      subtractScaledRowF64(work, targetBase, j * rhsCols, 0, rhsCols, factor);
    }

    let diagonal = readF64(r, row * cols + row);
    if (Math.abs(diagonal) <= EPSILON) return 0;
    divideRowF64(work, targetBase, 0, rhsCols, diagonal);
  }

  writeF64BlockToF32(work, out, cols * rhsCols);
  return 1;
}

export function equalsApprox(a: usize, b: usize, length: i32, epsilon: f64): i32 {
  let eps = f32x4.splat(<f32>epsilon);
  let i = 0;
  let limit = simdLimit(length);

  for (; i < limit; i += 4) {
    let offset = f32Offset(i);
    let delta = f32x4.abs(f32x4.sub(v128.load(a + offset), v128.load(b + offset)));
    if (v128.any_true(f32x4.gt(delta, eps))) return 0;
  }

  for (; i < length; i++) {
    let delta = Math.abs(<f64>readF32(a, i) - <f64>readF32(b, i));
    if (delta > epsilon) return 0;
  }
  return 1;
}
