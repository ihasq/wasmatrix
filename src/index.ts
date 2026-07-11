export const SIMD_REQUIRED = true;

export interface WasmatrixOptions {
  fastMath?: boolean;
  cacheLimitBytes?: number;
}

type WasmBytes = any;

const DEFAULT_WASM_URL = new URL("./wasmatrix.wasm", import.meta.url);
const WASM_CALL_LISTENERS_KEY = Symbol.for("wasmatrix.wasmCallListeners");
let defaultWasmBytes: Uint8Array | null = null;
const optimizationOptions = {
  fastMath: false,
  cacheLimitBytes: 64 * 1024 * 1024
};

const EW_ADD = 1;
const EW_SUBTRACT = 2;
const EW_MULTIPLY = 3;
const EW_DIVIDE = 4;
const EW_MIN = 5;
const EW_MAX = 6;
const EW_ADD_SCALAR = 7;
const EW_MULTIPLY_SCALAR = 8;
const EW_DIVIDE_SCALAR = 9;
const EW_NEGATE = 10;
const EW_ABS = 11;
const EW_SQRT = 12;
const EW_FLOOR = 13;
const EW_CEIL = 14;
const EW_CLAMP = 15;

const OPERAND_FULL = 0;
const OPERAND_ROW = 1;
const OPERAND_COLUMN = 2;

const MATMUL_NN = "NN";
const MATMUL_TN = "TN";
const MATMUL_NT = "NT";
const MATMUL_TT = "TT";
const SMALL_LINALG_DIRECT_MAX_SIZE = 2;
const MIN_BUFFER_CACHE_BYTES = 64 * 1024;
const BATCH_INSTRUCTION_I32_SLOTS = 8;
const BATCH_OP_MATMUL = 2;
const BATCH_OP_SOLVE = 3;
const BATCH_OP_MATMUL_TN = 7;
const BATCH_OP_MATMUL_NT = 8;
const BATCH_OP_MATMUL_TT = 9;

let defaultRuntime: any = null;
let nextRuntimeId = 1;
let nextMatrixId = 1;

/* c8 ignore start */
const matrixFinalizer: FinalizationRegistry<any> | null = typeof FinalizationRegistry === "function"
  ? new FinalizationRegistry(({ runtime, ptr }) => runtime.free(ptr))
  : null;

const cacheFinalizer: FinalizationRegistry<any> | null = typeof FinalizationRegistry === "function"
  ? new FinalizationRegistry((entry) => entry.dispose())
  : null;
/* c8 ignore stop */

function assertInteger(value, name) {
  if (!Number.isInteger(value)) {
    throw new TypeError(`${name} must be an integer`);
  }
}

function assertPositiveInteger(value, name) {
  assertInteger(value, name);
  if (value <= 0) {
    throw new RangeError(`${name} must be greater than zero`);
  }
}

function assertNonNegativeInteger(value, name) {
  assertInteger(value, name);
  if (value < 0) {
    throw new RangeError(`${name} must be non-negative`);
  }
}

function assertFiniteNumber(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
}

function sizeOf(rows, cols) {
  const length = rows * cols;
  if (!Number.isSafeInteger(length)) {
    throw new RangeError("matrix is too large");
  }
  return length;
}

function assertArrayLike(value, name) {
  if (value == null || typeof value.length !== "number") {
    throw new TypeError(`${name} must be array-like`);
  }
}

function toFloat32Array(value, name) {
  assertArrayLike(value, name);
  return value instanceof Float32Array ? value : Float32Array.from(value);
}

function reportWasmCall(name) {
  const listeners = (globalThis as any)[WASM_CALL_LISTENERS_KEY];
  if (listeners == null) return;
  for (const listener of listeners) {
    listener(name);
  }
}

/* c8 ignore start */
function createAbort() {
  return (_message, _file, line, column) => {
    throw new Error(`wasmatrix wasm abort at ${line}:${column}`);
  };
}
/* c8 ignore stop */

async function readWasmBytes(url: URL): Promise<Uint8Array> {
  if (url.protocol !== "file:") {
    /* c8 ignore start */
    if (typeof fetch !== "function") {
      throw new Error(`wasmatrix cannot fetch ${url.href} in this JavaScript runtime`);
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`wasmatrix failed to fetch ${url.href}: ${response.status} ${response.statusText}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }
  /* c8 ignore stop */

  const { readFile } = await import("node:fs/promises");
  return new Uint8Array(await readFile(url));
}

export function isSimdSupported(wasmBytes: WasmBytes | null = null): boolean {
  /* c8 ignore start */
  if (typeof WebAssembly === "undefined" || typeof WebAssembly.validate !== "function") {
    return false;
  }

  if (wasmBytes == null && defaultWasmBytes == null) {
    return false;
  }
  /* c8 ignore stop */

  return WebAssembly.validate(wasmBytes ?? defaultWasmBytes);
}

function instantiateRuntime(wasmBytes: WasmBytes) {
  if (!isSimdSupported(wasmBytes)) {
    throw new Error("wasmatrix requires a WebAssembly runtime with SIMD support");
  }

  const module = new WebAssembly.Module(wasmBytes);
  const instance = new WebAssembly.Instance(module, {
    env: {
      abort: createAbort()
    }
  });
  const runtime = new WasmRuntime(instance.exports as any);

  /* c8 ignore start */
  if (runtime.call("simdProbe") !== 1) {
    throw new Error("wasmatrix SIMD probe failed");
  }
  const abiVersion = runtime.call("abiVersion");
  if (abiVersion !== 7) {
    throw new Error(`Unsupported wasmatrix ABI version: ${abiVersion}`);
  }
  runtime.primeBatch();
  /* c8 ignore stop */

  return runtime;
}

export function createRuntime(wasmBytes: WasmBytes | null = null): unknown {
  /* c8 ignore start */
  if (wasmBytes == null && defaultWasmBytes == null) {
    throw new Error("wasmatrix default WebAssembly binary is not loaded");
  }
  /* c8 ignore stop */
  return instantiateRuntime(wasmBytes ?? defaultWasmBytes);
}

export function configure(options: WasmatrixOptions = {}): void {
  if (Object.hasOwn(options, "fastMath")) {
    optimizationOptions.fastMath = Boolean(options.fastMath);
  }
  if (Object.hasOwn(options, "cacheLimitBytes")) {
    assertNonNegativeInteger(options.cacheLimitBytes, "cacheLimitBytes");
    optimizationOptions.cacheLimitBytes = options.cacheLimitBytes;
    if (defaultRuntime != null) {
      defaultRuntime.cacheLimitBytes = options.cacheLimitBytes;
      defaultRuntime.trimCaches();
    }
  }
}

function getRuntime() {
  /* c8 ignore start */
  if (defaultRuntime == null) {
    defaultRuntime = createRuntime();
  }
  /* c8 ignore stop */
  return defaultRuntime;
}

class WasmRuntime {
  id;
  #exports;
  f64ScratchPtr;
  f64ScratchLength;
  i32ScratchPtr;
  i32ScratchLength;
  cacheLimitBytes;
  cacheBytes;
  cacheEntries;
  bufferCache;

  constructor(exports) {
    this.id = nextRuntimeId++;
    this.#exports = exports;
    this.f64ScratchPtr = 0;
    this.f64ScratchLength = 0;
    this.i32ScratchPtr = 0;
    this.i32ScratchLength = 0;
    this.cacheLimitBytes = optimizationOptions.cacheLimitBytes;
    this.cacheBytes = 0;
    this.cacheEntries = new Map();
    this.bufferCache = new Map();
  }

  call(name, ...args) {
    const fn = this.#exports[name];
    if (typeof fn !== "function") {
      throw new Error(`wasmatrix WASM export is not callable: ${name}`);
    }
    reportWasmCall(name);
    return fn(...args);
  }

  get memory() {
    return this.#exports.memory;
  }

  get f32() {
    return new Float32Array(this.memory.buffer);
  }

  get i32() {
    return new Int32Array(this.memory.buffer);
  }

  alloc(length) {
    assertNonNegativeInteger(length, "length");
    return this.call("allocF32", length);
  }

  allocF64(length) {
    assertNonNegativeInteger(length, "length");
    return this.call("allocF64", length);
  }

  allocI32(length) {
    assertNonNegativeInteger(length, "length");
    return this.call("allocI32", length);
  }

  primeBatch() {
    this.i32Scratch(BATCH_INSTRUCTION_I32_SLOTS * 32);
  }

  f64Scratch(length) {
    assertNonNegativeInteger(length, "length");
    if (length > this.f64ScratchLength) {
      this.free(this.f64ScratchPtr);
      this.f64ScratchPtr = this.call("allocF64", length);
      this.f64ScratchLength = length;
    }
    return this.f64ScratchPtr;
  }

  i32Scratch(length) {
    assertNonNegativeInteger(length, "length");
    if (length > this.i32ScratchLength) {
      this.free(this.i32ScratchPtr);
      this.i32ScratchPtr = this.call("allocI32", length);
      this.i32ScratchLength = length;
    }
    return this.i32ScratchPtr;
  }

  executeBatch(instructions) {
    const slots = instructions.length * BATCH_INSTRUCTION_I32_SLOTS;
    const ptr = this.i32Scratch(slots);
    const memory = this.i32;
    const start = ptr >>> 2;

    memory.fill(0, start, start + slots);
    for (let i = 0; i < instructions.length; i++) {
      const base = start + i * BATCH_INSTRUCTION_I32_SLOTS;
      const instruction = instructions[i];
      for (let slot = 0; slot < instruction.length; slot++) {
        memory[base + slot] = instruction[slot];
      }
    }

    return this.call("executeBatch", ptr, instructions.length);
  }

  free(ptr) {
    if (ptr) this.call("free", ptr);
  }

  registerCacheEntry(bytes, dispose) {
    assertNonNegativeInteger(bytes, "bytes");
    const token = Symbol("wasmatrix-cache-entry");
    const entry = {
      token,
      bytes,
      disposed: false,
      dispose: () => {
        if (entry.disposed) return;
        entry.disposed = true;
        this.cacheEntries.delete(token);
        this.cacheBytes -= bytes;
        dispose();
      }
    };

    this.cacheEntries.set(token, entry);
    this.cacheBytes += bytes;
    this.#evictCaches();
    return entry;
  }

  touchCacheEntry(entry) {
    if (entry == null || entry.disposed || !this.cacheEntries.has(entry.token)) return false;
    this.cacheEntries.delete(entry.token);
    this.cacheEntries.set(entry.token, entry);
    return true;
  }

  #evictCaches() {
    while (this.cacheBytes > this.cacheLimitBytes && this.cacheEntries.size > 0) {
      const oldest = this.cacheEntries.values().next().value;
      oldest.dispose();
    }
  }

  trimCaches() {
    this.#evictCaches();
  }

  getCachedBuffer(key, length) {
    const entry = this.bufferCache.get(key);
    if (entry == null || entry.disposed || entry.length !== length) {
      this.bufferCache.delete(key);
      return 0;
    }

    if (!this.touchCacheEntry(entry.cacheEntry)) {
      /* c8 ignore next 3 */
      this.bufferCache.delete(key);
      return 0;
    }

    const ptr = this.alloc(length);
    this.call("copy", entry.ptr, ptr, length);
    return ptr;
  }

  putCachedBuffer(key, sourcePtr, length) {
    const bytes = length << 2;
    if (bytes < MIN_BUFFER_CACHE_BYTES) return;
    if (bytes > this.cacheLimitBytes / 4) return;

    const existing = this.bufferCache.get(key);
    if (existing != null) existing.cacheEntry.dispose();

    const ptr = this.alloc(length);
    this.call("copy", sourcePtr, ptr, length);
    const entry = {
      ptr,
      length,
      cacheEntry: null
    };
    entry.cacheEntry = this.registerCacheEntry(bytes, () => {
      this.free(ptr);
      this.bufferCache.delete(key);
    });
    this.bufferCache.set(key, entry);
  }

  write(data) {
    const values = toFloat32Array(data, "data");
    const ptr = this.alloc(values.length);
    this.writeInto(ptr, values);
    return ptr;
  }

  writeI32(data) {
    const values = data instanceof Int32Array ? data : Int32Array.from(data);
    const ptr = this.allocI32(values.length);
    this.i32.set(values, ptr >>> 2);
    return ptr;
  }

  writeInto(ptr, data) {
    const values = toFloat32Array(data, "data");
    this.f32.set(values, ptr >>> 2);
  }

  read(ptr, length) {
    return new Float32Array(this.f32.subarray(ptr >>> 2, (ptr >>> 2) + length));
  }

  readValue(ptr, index) {
    return this.f32[(ptr >>> 2) + index];
  }

  writeValue(ptr, index, value) {
    this.f32[(ptr >>> 2) + index] = value;
  }
}

defaultWasmBytes = await readWasmBytes(DEFAULT_WASM_URL);
defaultRuntime = instantiateRuntime(defaultWasmBytes);

export class Matrix {
  readonly rows: number;
  readonly cols: number;
  #id = nextMatrixId++;
  #version = 0;
  #runtime;
  #ptr;
  #base = null;
  #inverseOf = null;
  #transposeOf = null;
  #expr = null;
  #matmulOf = null;
  #solveOf = null;
  #literalData = null;
  #literalFill = null;
  #literalIdentity = false;
  #affineScale = 1;
  #affineBias = 0;
  #structure = "dense";
  #luCache = null;
  #choleskyCache = null;
  #qrCache = null;
  #packedCache = null;
  #transposeCache = null;
  #rightMatmulUses = 0;
  #reductionCache = new Map();
  #diagonalCache = null;
  #cacheEntries: Set<any> = new Set();
  #disposed = false;
  #owns = true;

  constructor(rows, cols, data = null, options: any = {}) {
    assertPositiveInteger(rows, "rows");
    assertPositiveInteger(cols, "cols");

    const length = sizeOf(rows, cols);
    this.rows = rows;
    this.cols = cols;
    this.#runtime = options.runtime ?? getRuntime();
    this.#structure = options.structure ?? "dense";

    if (options.ptr != null) {
      assertNonNegativeInteger(options.ptr, "ptr");
      this.#ptr = options.ptr;
      this.#owns = options.owns !== false;
    } else if (
      options.base != null
      || options.inverseOf != null
      || options.transposeOf != null
      || options.expr != null
      || options.matmulOf != null
      || options.solveOf != null
    ) {
      this.#ptr = 0;
      this.#owns = false;
      this.#base = options.base ?? null;
      this.#inverseOf = options.inverseOf ?? null;
      this.#transposeOf = options.transposeOf ?? null;
      this.#expr = options.expr ?? null;
      this.#matmulOf = options.matmulOf ?? null;
      this.#solveOf = options.solveOf ?? null;
      this.#affineScale = options.affineScale ?? 1;
      this.#affineBias = options.affineBias ?? 0;
    } else {
      if (data != null) {
        assertArrayLike(data, "data");
        if (data.length !== length) {
          throw new RangeError(`data length ${data.length} does not match matrix shape ${rows}x${cols}`);
        }
      }

      this.#ptr = 0;
      this.#owns = false;
      if (data == null) {
        if (options.identity === true) {
          this.#literalIdentity = true;
        } else {
          this.#literalFill = options.fillValue ?? 0;
        }
      } else {
        this.#literalData = new Float32Array(toFloat32Array(data, "data"));
      }
    }

    if (this.#owns && this.#ptr) {
      matrixFinalizer?.register(this, { runtime: this.#runtime, ptr: this.#ptr }, this);
    }
  }

  static #fromWasm(rows, cols, runtime, ptr, structure = "dense") {
    return new Matrix(rows, cols, null, { runtime, ptr, structure });
  }

  static #affineStructure(base, scale, bias) {
    if (bias !== 0) return "dense";
    if (scale === 0) return "zero";
    if (base.#structure === "identity") return scale === 1 ? "identity" : "diagonal";
    return base.#structure;
  }

  static #affineView(base, scale, bias) {
    base.#assertAlive();
    assertFiniteNumber(scale, "scale");
    assertFiniteNumber(bias, "bias");
    const structure = Matrix.#affineStructure(base, scale, bias);

    if (base.#base != null && base.#inverseOf == null && base.#transposeOf == null && base.#ptr === 0) {
      return new Matrix(base.rows, base.cols, null, {
        runtime: base.#runtime,
        base: base.#base,
        affineScale: base.#affineScale * scale,
        affineBias: base.#affineBias * scale + bias,
        structure
      });
    }

    return new Matrix(base.rows, base.cols, null, {
      runtime: base.#runtime,
      base,
      affineScale: scale,
      affineBias: bias,
      structure
    });
  }

  static #elementwiseStructure(base, op) {
    if (op.code === EW_ADD_SCALAR) {
      return op.scalarA === 0 ? base.#structure : "dense";
    }
    if (op.code === EW_MULTIPLY_SCALAR || op.code === EW_DIVIDE_SCALAR) {
      if (op.scalarA === 0 && op.code === EW_MULTIPLY_SCALAR) return "zero";
      if (base.#structure === "zero") return "zero";
      if (base.#structure === "diagonal") return "diagonal";
      if (base.#structure === "identity") return op.scalarA === 1 ? "identity" : "diagonal";
      if (base.#structure === "ones") return op.scalarA === 1 ? "ones" : "dense";
      return base.#structure;
    }
    if (
      op.code === EW_NEGATE
      || op.code === EW_ABS
      || op.code === EW_SQRT
      || op.code === EW_FLOOR
      || op.code === EW_CEIL
    ) {
      return base.#structure;
    }
    if (op.code === EW_CLAMP && op.scalarA <= 0 && op.scalarB >= 0) {
      return base.#structure;
    }
    return "dense";
  }

  static #exprView(base, op) {
    base.#assertAlive();
    const source = base.#expr == null ? base : base.#expr.base;
    const ops = base.#expr == null ? [op] : [...base.#expr.ops, op];
    const structure = Matrix.#elementwiseStructure(base, op);

    return new Matrix(base.rows, base.cols, null, {
      runtime: base.#runtime,
      expr: { base: source, ops },
      structure
    });
  }

  static #view(matrix) {
    return Matrix.#affineView(matrix, 1, 0);
  }

  static #sameMatmul(left, right) {
    return left != null
      && right != null
      && left.variant === right.variant
      && left.left === right.left
      && left.right === right.right
      && left.gram === right.gram;
  }

  static #shouldDistributeMatmul(gemmCost, combineCost) {
    const original = 2 * gemmCost;
    const rewrite = gemmCost + combineCost;
    return original >= 131_072 && rewrite < original * 0.85;
  }

  static #shouldUseTransposeKernel(variant, rows, shared, cols) {
    if (variant === MATMUL_NN) return false;
    return rows * shared * cols >= 8_000_000;
  }

  static #fastMathKey() {
    return optimizationOptions.fastMath ? "fast" : "strict";
  }

  static configure(options = {}) {
    configure(options);
  }

  static from(rows, cols, values) {
    return new Matrix(rows, cols, values);
  }

  static zeros(rows, cols) {
    return new Matrix(rows, cols, null, { structure: "zero", fillValue: 0 });
  }

  static ones(rows, cols) {
    assertPositiveInteger(rows, "rows");
    assertPositiveInteger(cols, "cols");

    return new Matrix(rows, cols, null, { structure: "ones", fillValue: 1 });
  }

  static identity(size) {
    assertPositiveInteger(size, "size");

    return new Matrix(size, size, null, { structure: "identity", identity: true });
  }

  static diagonal(values) {
    const runtime = values instanceof Matrix ? values.#runtime : getRuntime();
    let inputPtr;
    let inputLength;
    let freeInput = false;

    if (values instanceof Matrix) {
      values.#assertAlive();
      inputPtr = values.#materializedPtr();
      inputLength = values.length;
    } else {
      const vector = toFloat32Array(values, "values");
      inputPtr = runtime.write(vector);
      inputLength = vector.length;
      freeInput = true;
    }

    assertPositiveInteger(inputLength, "values.length");

    const ptr = runtime.alloc(inputLength * inputLength);
    try {
      runtime.call("diagonalMatrix", inputPtr, ptr, inputLength);
      return Matrix.#fromWasm(inputLength, inputLength, runtime, ptr, "diagonal");
    } finally {
      if (freeInput) runtime.free(inputPtr);
    }
  }

  static random(rows, cols, rng = Math.random) {
    assertPositiveInteger(rows, "rows");
    assertPositiveInteger(cols, "cols");
    const data = new Float32Array(sizeOf(rows, cols));
    for (let i = 0; i < data.length; i++) {
      data[i] = rng();
    }
    return new Matrix(rows, cols, data);
  }

  static outer(a, b) {
    const runtime = a instanceof Matrix ? a.#runtime : b instanceof Matrix ? b.#runtime : getRuntime();
    const left = Matrix.#vectorRef(a, "a", runtime);
    const right = Matrix.#vectorRef(b, "b", runtime);
    const ptr = runtime.alloc(left.length * right.length);

    try {
      runtime.call("outer", left.ptr, right.ptr, ptr, left.length, right.length);
      return Matrix.#fromWasm(left.length, right.length, runtime, ptr);
    } finally {
      left.free();
      right.free();
    }
  }

  static matmulChain(...matrices) {
    if (matrices.length === 1 && Array.isArray(matrices[0])) {
      matrices = matrices[0];
    }
    if (matrices.length === 0) {
      throw new RangeError("matmulChain requires at least one matrix");
    }
    for (const matrix of matrices) {
      if (!(matrix instanceof Matrix)) {
        throw new TypeError("matmulChain expects Matrix instances");
      }
      matrix.#assertAlive();
    }
    for (let i = 1; i < matrices.length; i++) {
      matrices[0].#assertSameRuntime(matrices[i]);
      if (matrices[i - 1].cols !== matrices[i].rows) {
        throw new RangeError(
          `matmulChain shape mismatch at ${i - 1}/${i}: ${matrices[i - 1].rows}x${matrices[i - 1].cols} cannot multiply ${matrices[i].rows}x${matrices[i].cols}`
        );
      }
    }
    if (matrices.length === 1) {
      return Matrix.#affineView(matrices[0], 1, 0);
    }

    const n = matrices.length;
    const costs = Array.from({ length: n }, () => new Array(n).fill(0));
    const splits = Array.from({ length: n }, () => new Array(n).fill(0));

    for (let width = 2; width <= n; width++) {
      for (let i = 0; i <= n - width; i++) {
        const j = i + width - 1;
        let best = Number.POSITIVE_INFINITY;
        let bestSplit = i;

        for (let k = i; k < j; k++) {
          const cost = costs[i][k]
            + costs[k + 1][j]
            + matrices[i].rows * matrices[k].cols * matrices[j].cols;
          if (cost < best) {
            best = cost;
            bestSplit = k;
          }
        }

        costs[i][j] = best;
        splits[i][j] = bestSplit;
      }
    }

    const build = (i, j) => {
      if (i === j) {
        return { matrix: matrices[i], temporary: false };
      }

      const k = splits[i][j];
      const left = build(i, k);
      const right = build(k + 1, j);
      const matrix = left.matrix.matmul(right.matrix);
      matrix.#materializedPtr();

      if (left.temporary) left.matrix.dispose();
      if (right.temporary) right.matrix.dispose();

      return { matrix, temporary: true };
    };

    return build(0, n - 1).matrix;
  }

  static #vectorRef(value, name, runtime) {
    if (value instanceof Matrix) {
      value.#assertAlive();
      if (value.#runtime !== runtime) {
        throw new RangeError(`${name} belongs to a different WASM runtime`);
      }
      return {
        ptr: value.#materializedPtr(),
        length: value.length,
        free() {}
      };
    }

    const data = toFloat32Array(value, name);
    const ptr = runtime.write(data);
    return {
      ptr,
      length: data.length,
      free() {
        runtime.free(ptr);
      }
    };
  }

  get length() {
    return sizeOf(this.rows, this.cols);
  }

  get shape() {
    return [this.rows, this.cols];
  }

  get data() {
    this.#assertAlive();
    const local = this.#localDataSnapshot();
    if (local != null) return local;
    return this.#runtime.read(this.#materializedPtr(), this.length);
  }

  get byteOffset() {
    this.#assertAlive();
    return this.#materializedPtr();
  }

  dispose() {
    if (this.#disposed) return;

    this.#clearComputedCaches();
    if (this.#owns) {
      matrixFinalizer?.unregister(this);
      this.#runtime.free(this.#ptr);
    }
    this.#ptr = 0;
    this.#base = null;
    this.#inverseOf = null;
    this.#transposeOf = null;
    this.#expr = null;
    this.#matmulOf = null;
    if (this.#solveOf?.temporaryRight) {
      this.#solveOf.right.dispose();
    }
    this.#solveOf = null;
    this.#literalData = null;
    this.#literalFill = null;
    this.#literalIdentity = false;
    this.#disposed = true;
  }

  [Symbol.dispose]() {
    this.dispose();
  }

  clone() {
    this.#assertAlive();
    const local = this.#localDataSnapshot();
    if (local != null) {
      return new Matrix(this.rows, this.cols, local, { runtime: this.#runtime, structure: this.#structure });
    }

    const ptr = this.#runtime.alloc(this.length);
    this.#runtime.call("copy", this.#materializedPtr(), ptr, this.length);
    return Matrix.#fromWasm(this.rows, this.cols, this.#runtime, ptr);
  }

  at(row, col) {
    this.#assertIndex(row, col);
    const local = this.#localDataSnapshot();
    if (local != null) {
      return local[row * this.cols + col];
    }
    return this.#runtime.readValue(this.#materializedPtr(), row * this.cols + col);
  }

  set(row, col, value) {
    this.#assertIndex(row, col);
    assertFiniteNumber(value, "value");
    const local = this.#mutableLocalData();
    if (local != null) {
      local[row * this.cols + col] = value;
    } else {
      this.#runtime.writeValue(this.#materializedPtr(), row * this.cols + col, value);
    }
    this.#version++;
    this.#clearComputedCaches();
    this.#expr = null;
    this.#matmulOf = null;
    this.#solveOf = null;
    this.#structure = "dense";
    return this;
  }

  row(index) {
    this.#assertAlive();
    assertInteger(index, "index");
    if (index < 0 || index >= this.rows) {
      throw new RangeError("row index is out of range");
    }
    const local = this.#localDataSnapshot();
    if (local != null) {
      return new Float32Array(local.subarray(index * this.cols, (index + 1) * this.cols));
    }
    const start = (this.#materializedPtr() >>> 2) + index * this.cols;
    return new Float32Array(this.#runtime.f32.subarray(start, start + this.cols));
  }

  column(index) {
    this.#assertAlive();
    assertInteger(index, "index");
    if (index < 0 || index >= this.cols) {
      throw new RangeError("column index is out of range");
    }
    const out = new Float32Array(this.rows);
    const local = this.#localDataSnapshot();
    if (local != null) {
      for (let r = 0; r < this.rows; r++) {
        out[r] = local[r * this.cols + index];
      }
      return out;
    }

    const memory = this.#runtime.f32;
    const base = this.#materializedPtr() >>> 2;
    for (let r = 0; r < this.rows; r++) {
      out[r] = memory[base + r * this.cols + index];
    }
    return out;
  }

  diagonal() {
    this.#assertAlive();
    const cached = this.#diagonalCache;
    if (cached != null && cached.version === this.#version) {
      return new Float32Array(cached.value);
    }

    const length = Math.min(this.rows, this.cols);
    const local = this.#localDataSnapshot();
    if (local != null) {
      const value = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        value[i] = local[i * this.cols + i];
      }
      this.#diagonalCache = { version: this.#version, value };
      return new Float32Array(value);
    }

    const ptr = this.#runtime.alloc(length);
    try {
      this.#runtime.call("diagonal", this.#materializedPtr(), ptr, this.rows, this.cols);
      const value = this.#runtime.read(ptr, length);
      this.#diagonalCache = { version: this.#version, value };
      return new Float32Array(value);
    } finally {
      this.#runtime.free(ptr);
    }
  }

  reshape(rows, cols) {
    this.#assertAlive();
    assertPositiveInteger(rows, "rows");
    assertPositiveInteger(cols, "cols");
    if (sizeOf(rows, cols) !== this.length) {
      throw new RangeError("reshape must preserve element count");
    }
    const local = this.#localDataSnapshot();
    if (local != null) {
      return new Matrix(rows, cols, local, { runtime: this.#runtime, structure: this.#structure });
    }

    const ptr = this.#runtime.alloc(this.length);
    this.#runtime.call("copy", this.#materializedPtr(), ptr, this.length);
    return Matrix.#fromWasm(rows, cols, this.#runtime, ptr);
  }

  toFloat32Array() {
    return this.data;
  }

  toFlatArray() {
    return Array.from(this.data);
  }

  toArray() {
    const data = this.data;
    const rows = [];
    for (let r = 0; r < this.rows; r++) {
      rows.push(Array.from(data.subarray(r * this.cols, (r + 1) * this.cols)));
    }
    return rows;
  }

  add(other) {
    if (typeof other === "number") return this.addScalar(other);
    return this.#elementwise(other, EW_ADD);
  }

  addScalar(value) {
    assertFiniteNumber(value, "value");
    return Matrix.#exprView(this, { code: EW_ADD_SCALAR, scalarA: value, scalarB: 0 });
  }

  subtract(other) {
    if (typeof other === "number") return this.addScalar(-other);
    return this.#elementwise(other, EW_SUBTRACT);
  }

  scale(value) {
    assertFiniteNumber(value, "value");
    return Matrix.#exprView(this, { code: EW_MULTIPLY_SCALAR, scalarA: value, scalarB: 0 });
  }

  multiply(other) {
    if (typeof other === "number") return this.scale(other);
    if (other instanceof Matrix && this.#broadcastModeFor(other) !== null) {
      return this.hadamard(other);
    }
    return this.matmul(other);
  }

  divide(other) {
    if (typeof other === "number") {
      assertFiniteNumber(other, "other");
      return Matrix.#exprView(this, { code: EW_DIVIDE_SCALAR, scalarA: other, scalarB: 0 });
    }
    return this.#elementwise(other, EW_DIVIDE);
  }

  hadamard(other) {
    return this.#elementwise(other, EW_MULTIPLY);
  }

  elementMultiply(other) {
    return this.hadamard(other);
  }

  min(other) {
    return this.#elementwise(other, EW_MIN);
  }

  max(other) {
    return this.#elementwise(other, EW_MAX);
  }

  negate() {
    return Matrix.#exprView(this, { code: EW_NEGATE, scalarA: 0, scalarB: 0 });
  }

  abs() {
    return Matrix.#exprView(this, { code: EW_ABS, scalarA: 0, scalarB: 0 });
  }

  sqrt() {
    return Matrix.#exprView(this, { code: EW_SQRT, scalarA: 0, scalarB: 0 });
  }

  floor() {
    return Matrix.#exprView(this, { code: EW_FLOOR, scalarA: 0, scalarB: 0 });
  }

  ceil() {
    return Matrix.#exprView(this, { code: EW_CEIL, scalarA: 0, scalarB: 0 });
  }

  clamp(minValue, maxValue) {
    this.#assertAlive();
    assertFiniteNumber(minValue, "minValue");
    assertFiniteNumber(maxValue, "maxValue");
    if (minValue > maxValue) {
      throw new RangeError("minValue must be less than or equal to maxValue");
    }

    return Matrix.#exprView(this, { code: EW_CLAMP, scalarA: minValue, scalarB: maxValue });
  }

  map(fn) {
    this.#assertAlive();
    if (typeof fn !== "function") {
      throw new TypeError("fn must be a function");
    }
    const input = this.data;
    const data = new Float32Array(this.length);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const index = r * this.cols + c;
        data[index] = fn(input[index], r, c);
      }
    }
    return new Matrix(this.rows, this.cols, data, { runtime: this.#runtime });
  }

  transpose() {
    this.#assertAlive();

    if (this.#transposeOf != null) {
      return Matrix.#affineView(this.#transposeOf, 1, 0);
    }

    if (this.#base != null && this.#inverseOf == null && this.#ptr === 0) {
      return Matrix.#affineView(this.#base.transpose(), this.#affineScale, this.#affineBias);
    }

    let structure = "dense";
    if (this.#structure === "identity") structure = "identity";
    if (this.#structure === "zero") structure = "zero";
    if (this.#structure === "ones") structure = "ones";
    if (this.#structure === "diagonal") structure = "diagonal";
    if (this.#structure === "spd") structure = "spd";

    return new Matrix(this.cols, this.rows, null, {
      runtime: this.#runtime,
      transposeOf: this,
      structure
    });
  }

  matmul(other) {
    this.#assertAlive();
    if (!(other instanceof Matrix)) {
      throw new TypeError("other must be a Matrix");
    }
    other.#assertAlive();
    this.#assertSameRuntime(other);
    if (this.cols !== other.rows) {
      throw new RangeError(`matmul shape mismatch: ${this.rows}x${this.cols} cannot multiply ${other.rows}x${other.cols}`);
    }

    if (this.#inverseOf != null) {
      return this.#inverseOf.solve(other);
    }
    if (optimizationOptions.fastMath && other.#inverseOf === this) {
      return Matrix.identity(this.rows);
    }
    if (other.#inverseOf != null) {
      return other.#inverseOf.transpose().solve(this.transpose()).transpose();
    }
    if (this.#structure === "identity") {
      return Matrix.#affineView(other, 1, 0);
    }
    if (other.#structure === "identity") {
      return Matrix.#affineView(this, 1, 0);
    }
    if (this.#structure === "zero" || other.#structure === "zero") {
      return Matrix.zeros(this.rows, other.cols);
    }
    if (this.#structure === "diagonal") {
      const ptr = this.#runtime.alloc(this.rows * other.cols);
      this.#runtime.call("scaleRowsByDiagonal", this.#materializedPtr(), other.#materializedPtr(), ptr, this.rows, other.cols);
      const structure = other.#structure === "diagonal" ? "diagonal" : "dense";
      return Matrix.#fromWasm(this.rows, other.cols, this.#runtime, ptr, structure);
    }
    if (other.#structure === "diagonal") {
      const ptr = this.#runtime.alloc(this.rows * other.cols);
      this.#runtime.call("scaleColsByDiagonal", this.#materializedPtr(), other.#materializedPtr(), ptr, this.rows, other.cols);
      const structure = this.#structure === "diagonal" ? "diagonal" : "dense";
      return Matrix.#fromWasm(this.rows, other.cols, this.#runtime, ptr, structure);
    }

    const scalarRewrite = this.#matmulScalarRewrite(other);
    if (scalarRewrite != null) return scalarRewrite;

    const leftInput = this.#matmulInput();
    const rightInput = other.#matmulInput();
    let variant = MATMUL_NN;
    if (leftInput.transposed && rightInput.transposed) variant = MATMUL_TT;
    else if (leftInput.transposed) variant = MATMUL_TN;
    else if (rightInput.transposed) variant = MATMUL_NT;

    let gram = null;
    let structure = "dense";
    if (leftInput.source === rightInput.source && variant === MATMUL_TN) {
      gram = "TN";
      structure = "spd";
    } else if (leftInput.source === rightInput.source && variant === MATMUL_NT) {
      gram = "NT";
      structure = "spd";
    }

    if (gram == null && variant !== MATMUL_NN && !Matrix.#shouldUseTransposeKernel(variant, this.rows, this.cols, other.cols)) {
      if (leftInput.transposed) this.#materializedPtr();
      if (rightInput.transposed) other.#materializedPtr();
      return new Matrix(this.rows, other.cols, null, {
        runtime: this.#runtime,
        matmulOf: {
          left: this,
          right: other,
          variant: MATMUL_NN,
          gram: null
        }
      });
    }

    return new Matrix(this.rows, other.cols, null, {
      runtime: this.#runtime,
      matmulOf: {
        left: leftInput.source,
        right: rightInput.source,
        variant,
        gram
      },
      structure
    });
  }

  matvec(vector) {
    this.#assertAlive();
    const vec = Matrix.#vectorRef(vector, "vector", this.#runtime);
    if (vec.length !== this.cols) {
      vec.free();
      throw new RangeError(`vector length ${vec.length} must match matrix columns ${this.cols}`);
    }

    const ptr = this.#runtime.alloc(this.rows);
    try {
      this.#runtime.call("matvec", this.#materializedPtr(), vec.ptr, ptr, this.rows, this.cols);
      return this.#runtime.read(ptr, this.rows);
    } finally {
      this.#runtime.free(ptr);
      vec.free();
    }
  }

  dot(other) {
    this.#assertAlive();
    const values = Matrix.#vectorRef(other, "other", this.#runtime);
    if (values.length !== this.length) {
      values.free();
      throw new RangeError(`dot length mismatch: ${this.length} !== ${values.length}`);
    }

    try {
      return this.#runtime.call("dot", this.#materializedPtr(), values.ptr, this.length);
    } finally {
      values.free();
    }
  }

  sum() {
    this.#assertAlive();
    return this.#cachedReduction("sum", () => this.#runtime.call("sum", this.#materializedPtr(), this.length));
  }

  minValue() {
    this.#assertAlive();
    return this.#cachedReduction("min", () => this.#runtime.call("minValue", this.#materializedPtr(), this.length));
  }

  maxValue() {
    this.#assertAlive();
    return this.#cachedReduction("max", () => this.#runtime.call("maxValue", this.#materializedPtr(), this.length));
  }

  trace() {
    this.#assertAlive();
    if (
      this.#ptr === 0
      && this.#matmulOf != null
      && this.#matmulOf.variant === MATMUL_NN
      && this.#matmulOf.gram == null
      && this.rows === this.cols
    ) {
      const { left, right } = this.#matmulOf;
      left.#assertAlive();
      right.#assertAlive();
      this.#assertSameRuntime(left);
      this.#assertSameRuntime(right);
      return this.#cachedReduction("trace-matmul", () => this.#runtime.call("traceMatmul", left.#materializedPtr(), right.#materializedPtr(), left.rows, left.cols));
    }
    return this.#cachedReduction("trace", () => this.#runtime.call("trace", this.#materializedPtr(), this.rows, this.cols));
  }

  frobeniusNorm() {
    this.#assertAlive();
    return this.#cachedReduction("frobenius", () => this.#runtime.call("frobeniusNorm", this.#materializedPtr(), this.length));
  }

  determinant() {
    this.#assertSquare("determinant");
    const cached = this.#getCachedReduction("determinant");
    if (cached != null) return cached;

    let value;
    if (this.#structure === "identity") return 1;
    if (this.#structure === "zero") return 0;
    if (this.#structure === "diagonal") {
      value = this.#runtime.call("diagonalProduct", this.#materializedPtr(), this.rows);
      this.#setCachedReduction("determinant", value);
      return value;
    }
    if (
      optimizationOptions.fastMath
      && this.#ptr === 0
      && this.#matmulOf != null
      && this.#matmulOf.variant === MATMUL_NN
      && this.#matmulOf.gram == null
      && this.#matmulOf.left.rows === this.#matmulOf.left.cols
      && this.#matmulOf.right.rows === this.#matmulOf.right.cols
    ) {
      value = this.#matmulOf.left.determinant() * this.#matmulOf.right.determinant();
      this.#setCachedReduction("determinant", value);
      return value;
    }

    if (this.rows <= SMALL_LINALG_DIRECT_MAX_SIZE) {
      value = this.#runtime.call("determinant", this.#materializedPtr(), this.rows);
      this.#setCachedReduction("determinant", value);
      return value;
    }

    const cholesky = this.#choleskyFactor();
    if (cholesky != null) {
      value = this.#runtime.call("choleskyDeterminant", cholesky.lowerPtr, this.rows);
      this.#setCachedReduction("determinant", value);
      return value;
    }

    const factor = this.#luFactor();
    value = factor == null
      ? 0
      : this.#runtime.call("luDeterminant", factor.luPtr, this.rows, factor.sign);
    this.#setCachedReduction("determinant", value);
    return value;
  }

  logDet() {
    this.#assertSquare("logDet");
    const cached = this.#getCachedReduction("logDet");
    if (cached != null) return cached;

    let value;
    if (this.#structure === "identity") {
      value = 0;
    } else if (this.#structure === "diagonal") {
      const diagonal = this.diagonal();
      value = 0;
      for (const item of diagonal) {
        if (item <= 0) {
          value = Number.NaN;
          break;
        }
        value += Math.log(item);
      }
    } else {
      const cholesky = this.#choleskyFactor();
      if (cholesky != null) {
        value = this.#runtime.call("choleskyLogDet", cholesky.lowerPtr, this.rows);
      } else {
        const det = this.determinant();
        value = det > 0 ? Math.log(det) : Number.NaN;
      }
    }

    this.#setCachedReduction("logDet", value);
    return value;
  }

  inverse() {
    this.#assertSquare("inverse");
    if (this.#structure === "identity") {
      return Matrix.identity(this.rows);
    }
    if (this.#structure === "diagonal") {
      const sourcePtr = this.#materializedPtr();
      const ptr = this.#runtime.alloc(this.length);
      const ok = this.#runtime.call("invertDiagonal", sourcePtr, ptr, this.rows);
      if (ok !== 1) {
        this.#runtime.free(ptr);
        throw new RangeError("matrix is singular");
      }
      return Matrix.#fromWasm(this.rows, this.cols, this.#runtime, ptr, "diagonal");
    }
    return new Matrix(this.rows, this.cols, null, {
      runtime: this.#runtime,
      inverseOf: this
    });
  }

  solve(rhs) {
    this.#assertSquare("solve");
    const rhsIsMatrix = rhs instanceof Matrix;
    const right = rhsIsMatrix ? rhs : new Matrix(this.rows, 1, rhs, { runtime: this.#runtime });
    right.#assertAlive();
    this.#assertSameRuntime(right);
    if (right.rows !== this.rows) {
      if (!rhsIsMatrix) right.dispose();
      throw new RangeError(`right-hand side rows ${right.rows} must match ${this.rows}`);
    }

    return new Matrix(this.rows, right.cols, null, {
      runtime: this.#runtime,
      solveOf: {
        left: this,
        right,
        temporaryRight: !rhsIsMatrix
      }
    });
  }

  leastSquares(rhs) {
    this.#assertAlive();
    if (this.rows < this.cols) {
      throw new RangeError("leastSquares requires rows >= columns");
    }

    const rhsIsMatrix = rhs instanceof Matrix;
    const right = rhsIsMatrix ? rhs : new Matrix(this.rows, 1, rhs, { runtime: this.#runtime });
    right.#assertAlive();
    this.#assertSameRuntime(right);
    if (right.rows !== this.rows) {
      if (!rhsIsMatrix) right.dispose();
      throw new RangeError(`right-hand side rows ${right.rows} must match ${this.rows}`);
    }

    let ptr = 0;
    try {
      const factor = this.#qrFactor();
      ptr = this.#runtime.alloc(this.cols * right.cols);
      const work = this.#runtime.f64Scratch(this.cols * right.cols);
      const ok = this.#runtime.call("qrSolve",
        factor.qPtr,
        factor.rPtr,
        right.#materializedPtr(),
        ptr,
        this.rows,
        this.cols,
        right.cols,
        work
      );
      if (ok !== 1) {
        throw new RangeError("matrix is rank deficient");
      }
      return Matrix.#fromWasm(this.cols, right.cols, this.#runtime, ptr);
    } catch (error) {
      this.#runtime.free(ptr);
      throw error;
    } finally {
      if (!rhsIsMatrix) right.dispose();
    }
  }

  rank(epsilon = 1e-6) {
    this.#assertAlive();
    assertFiniteNumber(epsilon, "epsilon");
    const key = `rank:${epsilon}`;
    const cached = this.#getCachedReduction(key);
    if (cached != null) return cached;

    let value;
    if (this.#structure === "identity") {
      value = Math.min(this.rows, this.cols);
    } else if (this.#structure === "zero") {
      value = 0;
    } else {
      const qr = this.#qrFactor();
      value = this.#runtime.call("qrRank", qr.rPtr, this.rows, this.cols, epsilon);
    }

    this.#setCachedReduction(key, value);
    return value;
  }

  equalsApprox(other, epsilon = 1e-6) {
    this.#assertSameShape(other);
    assertFiniteNumber(epsilon, "epsilon");
    return this.#runtime.call("equalsApprox", this.#materializedPtr(), other.#materializedPtr(), this.length, epsilon) === 1;
  }

  toString() {
    return this.toArray()
      .map((row) => row.join("\t"))
      .join("\n");
  }

  #identityKey() {
    return `${this.#runtime.id}:${this.#id}:${this.#version}:${this.rows}x${this.cols}:f32:${Matrix.#fastMathKey()}`;
  }

  #valueKey() {
    return this.#materializationCacheKey() ?? this.#identityKey();
  }

  #materializationCacheKey() {
    if (this.#expr != null) {
      const ops = this.#expr.ops.map((op) => [
        op.code,
        op.scalarA ?? 0,
        op.scalarB ?? 0,
        op.operandMode ?? OPERAND_FULL,
        op.other == null ? "" : op.other.#valueKey()
      ].join(",")).join(";");
      return `expr:${this.rows}x${this.cols}:${this.#expr.base.#valueKey()}:${ops}`;
    }

    if (this.#matmulOf != null) {
      const { left, right, variant, gram } = this.#matmulOf;
      return `matmul:${this.rows}x${this.cols}:${variant}:${gram ?? ""}:${left.#valueKey()}:${right.#valueKey()}`;
    }

    if (this.#transposeOf != null) {
      return `transpose:${this.rows}x${this.cols}:${this.#transposeOf.#valueKey()}`;
    }

    if (this.#inverseOf != null) {
      return `inverse:${this.rows}x${this.cols}:${this.#inverseOf.#valueKey()}`;
    }

    if (this.#solveOf != null) {
      return `solve:${this.rows}x${this.cols}:${this.#solveOf.left.#valueKey()}:${this.#solveOf.right.#valueKey()}`;
    }

    if (this.#base != null) {
      return `affine:${this.rows}x${this.cols}:${this.#base.#valueKey()}:${this.#affineScale}:${this.#affineBias}`;
    }

    return null;
  }

  #getCachedReduction(key) {
    const cached = this.#reductionCache.get(key);
    const dependencyKey = this.#materializationCacheKey() ?? this.#identityKey();
    if (cached == null || cached.version !== this.#version || cached.dependencyKey !== dependencyKey) {
      this.#reductionCache.delete(key);
      return null;
    }
    return cached.value;
  }

  #setCachedReduction(key, value) {
    this.#reductionCache.set(key, {
      version: this.#version,
      dependencyKey: this.#materializationCacheKey() ?? this.#identityKey(),
      value
    });
  }

  #cachedReduction(key, compute) {
    const cached = this.#getCachedReduction(key);
    if (cached != null) return cached;

    const value = compute();
    this.#setCachedReduction(key, value);
    return value;
  }

  #addCacheEntry(entry) {
    this.#cacheEntries.add(entry);
    cacheFinalizer?.register(this, entry, entry);
    return entry;
  }

  #releaseCacheEntry(entry) {
    if (entry == null) return;
    cacheFinalizer?.unregister(entry);
    this.#cacheEntries.delete(entry);
    entry.dispose();
  }

  #cacheEntryAlive(entry) {
    return entry != null && !entry.disposed && this.#runtime.touchCacheEntry(entry);
  }

  #clearComputedCaches() {
    for (const entry of this.#cacheEntries) {
      cacheFinalizer?.unregister(entry);
      entry.dispose();
    }
    this.#cacheEntries.clear();
    this.#luCache = null;
    this.#choleskyCache = null;
    this.#qrCache = null;
    this.#packedCache = null;
    this.#transposeCache = null;
    this.#reductionCache.clear();
    this.#diagonalCache = null;
  }

  #choleskyFactor() {
    this.#assertSquare("Cholesky factorization");
    if (this.#structure !== "spd") return null;
    if (
      this.#choleskyCache != null
      && this.#choleskyCache.version === this.#version
      && this.#cacheEntryAlive(this.#choleskyCache.entry)
    ) {
      return this.#choleskyCache;
    }
    /* c8 ignore next 4 */
    if (this.#choleskyCache != null) {
      this.#releaseCacheEntry(this.#choleskyCache.entry);
      this.#choleskyCache = null;
    }

    const lowerPtr = this.#runtime.allocF64(this.length);
    let ok = 0;
    try {
      ok = this.#runtime.call("choleskyFactor", this.#materializedPtr(), this.rows, lowerPtr);
    /* c8 ignore next 4 */
    } catch (error) {
      this.#runtime.free(lowerPtr);
      throw error;
    }

    if (ok !== 1) {
      this.#runtime.free(lowerPtr);
      return null;
    }

    const runtime = this.#runtime;
    const entry = this.#addCacheEntry(runtime.registerCacheEntry(this.length * 8, () => runtime.free(lowerPtr)));
    this.#choleskyCache = {
      version: this.#version,
      lowerPtr,
      entry
    };
    return this.#choleskyCache;
  }

  #qrFactor() {
    if (
      this.#qrCache != null
      && this.#qrCache.version === this.#version
      && this.#cacheEntryAlive(this.#qrCache.entry)
    ) {
      return this.#qrCache;
    }
    /* c8 ignore next 4 */
    if (this.#qrCache != null) {
      this.#releaseCacheEntry(this.#qrCache.entry);
      this.#qrCache = null;
    }

    const qLength = this.rows * this.cols;
    const rLength = this.cols * this.cols;
    const qPtr = this.#runtime.allocF64(qLength);
    const rPtr = this.#runtime.allocF64(rLength);

    try {
      this.#runtime.call("qrFactor", this.#materializedPtr(), this.rows, this.cols, qPtr, rPtr);
    /* c8 ignore next 5 */
    } catch (error) {
      this.#runtime.free(qPtr);
      this.#runtime.free(rPtr);
      throw error;
    }

    const runtime = this.#runtime;
    const entry = this.#addCacheEntry(runtime.registerCacheEntry((qLength + rLength) * 8, () => {
      runtime.free(qPtr);
      runtime.free(rPtr);
    }));
    this.#qrCache = {
      version: this.#version,
      qPtr,
      rPtr,
      entry
    };
    return this.#qrCache;
  }

  #packedMatmulPtr() {
    if (
      this.#packedCache != null
      && this.#packedCache.version === this.#version
      && this.#cacheEntryAlive(this.#packedCache.entry)
    ) {
      return this.#packedCache.ptr;
    }
    /* c8 ignore next 4 */
    if (this.#packedCache != null) {
      this.#releaseCacheEntry(this.#packedCache.entry);
      this.#packedCache = null;
    }

    const ptr = this.#runtime.alloc(this.length);
    try {
      this.#runtime.call("packForMatmul", this.#materializedPtr(), ptr, this.rows, this.cols);
    /* c8 ignore next 4 */
    } catch (error) {
      this.#runtime.free(ptr);
      throw error;
    }

    const runtime = this.#runtime;
    const entry = this.#addCacheEntry(runtime.registerCacheEntry(this.length * 4, () => runtime.free(ptr)));
    this.#packedCache = {
      version: this.#version,
      ptr,
      entry
    };
    return ptr;
  }

  #transposeCachePtr() {
    if (
      this.#transposeCache != null
      && this.#transposeCache.version === this.#version
      && this.#cacheEntryAlive(this.#transposeCache.entry)
    ) {
      /* c8 ignore next 2 */
      return this.#transposeCache.ptr;
    }
    /* c8 ignore next 4 */
    if (this.#transposeCache != null) {
      this.#releaseCacheEntry(this.#transposeCache.entry);
      this.#transposeCache = null;
    }

    const ptr = this.#runtime.alloc(this.length);
    try {
      this.#runtime.call("transpose", this.#materializedPtr(), ptr, this.rows, this.cols);
    /* c8 ignore next 4 */
    } catch (error) {
      this.#runtime.free(ptr);
      throw error;
    }

    const runtime = this.#runtime;
    const entry = this.#addCacheEntry(runtime.registerCacheEntry(this.length * 4, () => runtime.free(ptr)));
    this.#transposeCache = {
      version: this.#version,
      ptr,
      entry
    };
    return ptr;
  }

  #broadcastModeFor(other) {
    this.#assertAlive();
    if (!(other instanceof Matrix)) {
      throw new TypeError("other must be a Matrix");
    }
    other.#assertAlive();
    this.#assertSameRuntime(other);

    if (this.rows === other.rows && this.cols === other.cols) return OPERAND_FULL;
    if (other.rows === 1 && other.cols === this.cols) return OPERAND_ROW;
    if (other.rows === this.rows && other.cols === 1) return OPERAND_COLUMN;
    return null;
  }

  #elementwise(other, code) {
    const mode = this.#broadcastModeFor(other);
    const commutative = code === EW_ADD || code === EW_MULTIPLY || code === EW_MIN || code === EW_MAX;

    if (mode == null) {
      if (commutative && other.#broadcastModeFor(this) !== null) {
        return other.#elementwise(this, code);
      }
      throw new RangeError(`shape mismatch: ${this.rows}x${this.cols} cannot broadcast with ${other.rows}x${other.cols}`);
    }

    if (mode === OPERAND_FULL) {
      if (code === EW_ADD && this.#structure === "zero") return Matrix.#view(other);
      if (code === EW_ADD && other.#structure === "zero") return Matrix.#view(this);
      if (code === EW_SUBTRACT && this === other) return Matrix.zeros(this.rows, this.cols);
      if (code === EW_SUBTRACT && other.#structure === "zero") return Matrix.#view(this);
      if (code === EW_MULTIPLY && (this.#structure === "zero" || other.#structure === "zero")) {
        return Matrix.zeros(this.rows, this.cols);
      }
      if (code === EW_MULTIPLY && other.#structure === "ones") return Matrix.#view(this);
      if (code === EW_MULTIPLY && this.#structure === "ones") return Matrix.#view(other);
      if (code === EW_DIVIDE && optimizationOptions.fastMath && this === other) return Matrix.ones(this.rows, this.cols);

      const rewrite = this.#tryMatmulElementwiseRewrite(other, code);
      if (rewrite != null) return rewrite;
    } else if (code === EW_MULTIPLY && other.#structure === "ones") {
      return Matrix.#view(this);
    } else if ((code === EW_ADD || code === EW_SUBTRACT) && other.#structure === "zero") {
      return Matrix.#view(this);
    }

    return Matrix.#exprView(this, {
      code,
      other,
      operandMode: mode,
      scalarA: 0,
      scalarB: 0
    });
  }

  #tryMatmulElementwiseRewrite(other, code) {
    if (code !== EW_ADD && code !== EW_SUBTRACT) return null;

    const left = this.#matmulOf;
    const right = other.#matmulOf;
    if (left == null || right == null) return null;

    if (Matrix.#sameMatmul(left, right)) {
      return code === EW_ADD ? this.scale(2) : Matrix.zeros(this.rows, this.cols);
    }

    if (this.#ptr !== 0 || other.#ptr !== 0) return null;

    if (left.gram != null || right.gram != null || left.variant !== MATMUL_NN || right.variant !== MATMUL_NN) {
      return null;
    }

    const m = this.rows;
    const k = left.left.cols;
    const n = this.cols;
    const gemmCost = m * k * n;

    if (
      left.left === right.left
      && left.right.rows === right.right.rows
      && left.right.cols === right.right.cols
      && Matrix.#shouldDistributeMatmul(gemmCost, left.right.length)
    ) {
      const combined = code === EW_ADD ? left.right.add(right.right) : left.right.subtract(right.right);
      return left.left.matmul(combined);
    }

    if (
      left.right === right.right
      && left.left.rows === right.left.rows
      && left.left.cols === right.left.cols
      && Matrix.#shouldDistributeMatmul(gemmCost, left.left.length)
    ) {
      const combined = code === EW_ADD ? left.left.add(right.left) : left.left.subtract(right.left);
      return combined.matmul(left.right);
    }

    return null;
  }

  #matmulInput() {
    if (
      this.#ptr === 0
      && this.#transposeOf != null
      && this.#base == null
      && this.#inverseOf == null
      && this.#expr == null
      && this.#matmulOf == null
      && this.#solveOf == null
    ) {
      return { source: this.#transposeOf, transposed: true };
    }

    return { source: this, transposed: false };
  }

  #scalarFactorInfo() {
    if (this.#expr == null) return null;

    let factor = 1;
    for (const op of this.#expr.ops) {
      if (op.code === EW_MULTIPLY_SCALAR) {
        factor *= op.scalarA;
      } else if (op.code === EW_DIVIDE_SCALAR) {
        factor /= op.scalarA;
      } else {
        return null;
      }
    }

    if (factor === 1) return null;
    return {
      matrix: this.#expr.base,
      factor
    };
  }

  #matmulScalarRewrite(other) {
    let left = this;
    let right = other;
    let factor = 1;
    const outputCost = this.rows * other.cols;

    const leftFactor = this.#scalarFactorInfo();
    if (leftFactor != null && outputCost <= this.length) {
      left = leftFactor.matrix;
      factor *= leftFactor.factor;
    }

    const rightFactor = other.#scalarFactorInfo();
    if (rightFactor != null && outputCost <= other.length) {
      right = rightFactor.matrix;
      factor *= rightFactor.factor;
    }

    if (left === this && right === other) return null;
    if (factor === 0) return Matrix.zeros(this.rows, other.cols);

    const product = left.matmul(right);
    return factor === 1 ? product : product.scale(factor);
  }

  #localDataSnapshot() {
    if (this.#literalData != null) {
      return new Float32Array(this.#literalData);
    }

    if (this.#literalFill != null) {
      const data = new Float32Array(this.length);
      if (this.#literalFill !== 0) data.fill(this.#literalFill);
      return data;
    }

    if (this.#literalIdentity) {
      const data = new Float32Array(this.length);
      const stride = this.cols + 1;
      for (let i = 0; i < this.rows; i++) {
        data[i * stride] = 1;
      }
      return data;
    }

    return null;
  }

  #mutableLocalData() {
    if (this.#literalData != null) return this.#literalData;
    if (this.#literalFill == null && !this.#literalIdentity) return null;

    const data = this.#localDataSnapshot();
    this.#literalData = data;
    this.#literalFill = null;
    this.#literalIdentity = false;
    return data;
  }

  #materializeLocal(ptr) {
    if (this.#literalData != null) {
      this.#runtime.writeInto(ptr, this.#literalData);
      this.#literalData = null;
      return true;
    }

    if (this.#literalFill != null) {
      this.#runtime.f32.fill(this.#literalFill, ptr >>> 2, (ptr >>> 2) + this.length);
      this.#literalFill = null;
      return true;
    }

    if (this.#literalIdentity) {
      const memory = this.#runtime.f32;
      const start = ptr >>> 2;
      memory.fill(0, start, start + this.length);
      const stride = this.cols + 1;
      for (let i = 0; i < this.rows; i++) {
        memory[start + i * stride] = 1;
      }
      this.#literalIdentity = false;
      return true;
    }

    return false;
  }

  #materializeExpression(ptr) {
    const { base, ops } = this.#expr;
    base.#assertAlive();
    this.#assertSameRuntime(base);

    const basePtr = base.#materializedPtr();
    let affineScale = 1;
    let affineBias = 0;
    let affineOnly = true;

    for (const op of ops) {
      if (op.code === EW_ADD_SCALAR) {
        affineBias += op.scalarA;
      } else if (op.code === EW_MULTIPLY_SCALAR) {
        affineScale *= op.scalarA;
        affineBias *= op.scalarA;
      } else if (op.code === EW_DIVIDE_SCALAR) {
        affineScale /= op.scalarA;
        affineBias /= op.scalarA;
      } else {
        affineOnly = false;
        break;
      }
    }

    if (affineOnly) {
      this.#runtime.call("affine", basePtr, ptr, this.length, affineScale, affineBias);
      return;
    }

    const opcodes = new Int32Array(ops.length);
    const scalarA = new Float32Array(ops.length);
    const scalarB = new Float32Array(ops.length);
    const operandPtrs = new Int32Array(ops.length);
    const operandModes = new Int32Array(ops.length);

    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      opcodes[i] = op.code;
      scalarA[i] = op.scalarA ?? 0;
      scalarB[i] = op.scalarB ?? 0;

      if (op.other != null) {
        op.other.#assertAlive();
        this.#assertSameRuntime(op.other);
        operandPtrs[i] = op.other.#materializedPtr();
        operandModes[i] = op.operandMode ?? OPERAND_FULL;
      }
    }

    const opcodesPtr = this.#runtime.writeI32(opcodes);
    const scalarAPtr = this.#runtime.write(scalarA);
    const scalarBPtr = this.#runtime.write(scalarB);
    const operandPtrsPtr = this.#runtime.writeI32(operandPtrs);
    const operandModesPtr = this.#runtime.writeI32(operandModes);

    try {
      this.#runtime.call("fusedElementwise",
        basePtr,
        ptr,
        this.rows,
        this.cols,
        opcodesPtr,
        scalarAPtr,
        scalarBPtr,
        operandPtrsPtr,
        operandModesPtr,
        ops.length
      );
    } finally {
      this.#runtime.free(opcodesPtr);
      this.#runtime.free(scalarAPtr);
      this.#runtime.free(scalarBPtr);
      this.#runtime.free(operandPtrsPtr);
      this.#runtime.free(operandModesPtr);
    }
  }

  #materializeMatmul(ptr) {
    const { left, right, variant, gram } = this.#matmulOf;
    left.#assertAlive();
    right.#assertAlive();
    this.#assertSameRuntime(left);
    this.#assertSameRuntime(right);

    const leftPtr = left.#materializedPtr();
    if (gram === "TN") {
      this.#runtime.call("gramTN", leftPtr, ptr, left.rows, left.cols);
      return;
    }
    if (gram === "NT") {
      this.#runtime.call("gramNT", leftPtr, ptr, left.rows, left.cols);
      return;
    }

    const rightPtr = right.#materializedPtr();
    if (variant === MATMUL_TN) {
      this.#runtime.executeBatch([[
        BATCH_OP_MATMUL_TN,
        leftPtr,
        rightPtr,
        ptr,
        left.rows,
        left.cols,
        right.cols
      ]]);
    } else if (variant === MATMUL_NT) {
      this.#runtime.executeBatch([[
        BATCH_OP_MATMUL_NT,
        leftPtr,
        rightPtr,
        ptr,
        left.rows,
        left.cols,
        right.rows
      ]]);
    } else if (variant === MATMUL_TT) {
      this.#runtime.executeBatch([[
        BATCH_OP_MATMUL_TT,
        leftPtr,
        rightPtr,
        ptr,
        left.rows,
        left.cols,
        right.rows
      ]]);
    } else {
      const cost = left.rows * left.cols * right.cols;
      right.#rightMatmulUses++;
      if ((right.#packedCache != null || right.#rightMatmulUses > 1) && cost >= 262_144) {
        this.#runtime.call("matmulPackedB", leftPtr, right.#packedMatmulPtr(), ptr, left.rows, left.cols, right.cols);
      } else {
        this.#runtime.executeBatch([[
          BATCH_OP_MATMUL,
          leftPtr,
          rightPtr,
          ptr,
          left.rows,
          left.cols,
          right.cols
        ]]);
      }
    }
  }

  #materializeSolve(ptr) {
    const solve = this.#solveOf;
    const { left, right, temporaryRight } = solve;
    left.#assertSquare("solve");
    right.#assertAlive();
    left.#assertSameRuntime(right);
    if (right.rows !== left.rows) {
      throw new RangeError(`right-hand side rows ${right.rows} must match ${left.rows}`);
    }

    try {
      if (left.#structure === "diagonal") {
        const ok = this.#runtime.call("solveDiagonal",
          left.#materializedPtr(),
          right.#materializedPtr(),
          ptr,
          left.rows,
          right.cols
        );
        if (ok !== 1) {
          throw new RangeError("matrix is singular");
        }
      } else if (left.rows <= SMALL_LINALG_DIRECT_MAX_SIZE) {
        const ok = this.#runtime.executeBatch([[
          BATCH_OP_SOLVE,
          left.#materializedPtr(),
          right.#materializedPtr(),
          ptr,
          left.rows,
          right.cols
        ]]);
        if (ok !== 1) {
          throw new RangeError("matrix is singular");
        }
      } else {
        const cholesky = left.#choleskyFactor();
        if (cholesky != null) {
          const work = this.#runtime.f64Scratch(left.rows * right.cols);
          const ok = this.#runtime.call("choleskySolve",
            cholesky.lowerPtr,
            right.#materializedPtr(),
            ptr,
            left.rows,
            right.cols,
            work
          );
          /* c8 ignore next 3 */
          if (ok !== 1) {
            throw new RangeError("matrix is singular");
          }
        } else {
          const factor = left.#luFactor();
          if (factor == null) {
            throw new RangeError("matrix is singular");
          }

          const work = this.#runtime.f64Scratch(left.rows * right.cols);
          const ok = this.#runtime.call("luSolve",
            factor.luPtr,
            factor.pivotsPtr,
            right.#materializedPtr(),
            ptr,
            left.rows,
            right.cols,
            work
          );
          /* c8 ignore next 3 */
          if (ok !== 1) {
            throw new RangeError("matrix is singular");
          }
        }
      }
    } finally {
      this.#solveOf = null;
      if (temporaryRight) right.dispose();
    }
  }

  #materializedPtr() {
    this.#assertAlive();
    if (this.#ptr) return this.#ptr;

    const cacheKey = this.#materializationCacheKey();
    if (cacheKey != null) {
      const cachedPtr = this.#runtime.getCachedBuffer(cacheKey, this.length);
      if (cachedPtr) {
        this.#ptr = cachedPtr;
        this.#owns = true;
        matrixFinalizer?.register(this, { runtime: this.#runtime, ptr: this.#ptr }, this);
        return this.#ptr;
      }
    }

    const ptr = this.#runtime.alloc(this.length);

    if (this.#materializeLocal(ptr)) {
      // Local JS literals are copied into WASM memory only at the first boundary call.
    } else if (this.#inverseOf != null) {
      this.#inverseOf.#assertAlive();
      this.#assertSameRuntime(this.#inverseOf);
      const cholesky = this.#inverseOf.#choleskyFactor();
      if (cholesky != null) {
        const work = this.#runtime.f64Scratch(this.rows * this.cols);
        const ok = this.#runtime.call("choleskyInvert", cholesky.lowerPtr, ptr, this.rows, work);
        /* c8 ignore next 4 */
        if (ok !== 1) {
          this.#runtime.free(ptr);
          throw new RangeError("matrix is singular");
        }
        this.#inverseOf = null;
      } else {
        const factor = this.#inverseOf.#luFactor();
        if (factor == null) {
          this.#runtime.free(ptr);
          throw new RangeError("matrix is singular");
        }

        const work = this.#runtime.f64Scratch(this.rows * this.cols);
        const ok = this.#runtime.call("luInvert", factor.luPtr, factor.pivotsPtr, ptr, this.rows, work);
        /* c8 ignore next 4 */
        if (ok !== 1) {
          this.#runtime.free(ptr);
          throw new RangeError("matrix is singular");
        }
        this.#inverseOf = null;
      }
    } else if (this.#expr != null) {
      this.#materializeExpression(ptr);
    } else if (this.#matmulOf != null) {
      this.#materializeMatmul(ptr);
    } else if (this.#solveOf != null) {
      this.#materializeSolve(ptr);
    } else if (this.#transposeOf != null) {
      this.#transposeOf.#assertAlive();
      this.#assertSameRuntime(this.#transposeOf);
      this.#runtime.call("copy", this.#transposeOf.#transposeCachePtr(), ptr, this.length);
      this.#transposeOf = null;
    } else if (this.#base != null) {
      this.#base.#assertAlive();
      this.#assertSameRuntime(this.#base);
      this.#runtime.call("affine",
        this.#base.#materializedPtr(),
        ptr,
        this.length,
        this.#affineScale,
        this.#affineBias
      );
      this.#base = null;
      this.#affineScale = 1;
      this.#affineBias = 0;
    /* c8 ignore next 4 */
    } else {
      this.#runtime.free(ptr);
      throw new Error("matrix has no materializable backing");
    }

    this.#ptr = ptr;
    this.#owns = true;
    matrixFinalizer?.register(this, { runtime: this.#runtime, ptr: this.#ptr }, this);
    if (cacheKey != null) {
      this.#runtime.putCachedBuffer(cacheKey, this.#ptr, this.length);
    }
    return this.#ptr;
  }

  #luFactor() {
    this.#assertSquare("LU factorization");
    if (
      this.#luCache != null
      && this.#luCache.version === this.#version
      && this.#cacheEntryAlive(this.#luCache.entry)
    ) {
      return this.#luCache;
    }
    /* c8 ignore next 4 */
    if (this.#luCache != null) {
      this.#releaseCacheEntry(this.#luCache.entry);
      this.#luCache = null;
    }

    const sourcePtr = this.#materializedPtr();
    const luPtr = this.#runtime.allocF64(this.length);
    const pivotsPtr = this.#runtime.allocI32(this.rows);
    let sign = 0;

    try {
      sign = this.#runtime.call("luFactor", sourcePtr, this.rows, luPtr, pivotsPtr);
    /* c8 ignore next 5 */
    } catch (error) {
      this.#runtime.free(luPtr);
      this.#runtime.free(pivotsPtr);
      throw error;
    }

    if (sign === 0) {
      this.#runtime.free(luPtr);
      this.#runtime.free(pivotsPtr);
      return null;
    }

    const runtime = this.#runtime;
    const entry = this.#addCacheEntry(runtime.registerCacheEntry(this.length * 8 + this.rows * 4, () => {
      runtime.free(luPtr);
      runtime.free(pivotsPtr);
    }));
    const cache = {
      version: this.#version,
      luPtr,
      pivotsPtr,
      sign,
      entry
    };
    this.#luCache = cache;
    return cache;
  }

  #assertAlive() {
    if (this.#disposed) {
      throw new Error("matrix has been disposed");
    }
  }

  #assertIndex(row, col) {
    this.#assertAlive();
    assertInteger(row, "row");
    assertInteger(col, "col");
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) {
      throw new RangeError("matrix index is out of range");
    }
  }

  #assertSameShape(other) {
    this.#assertAlive();
    if (!(other instanceof Matrix)) {
      throw new TypeError("other must be a Matrix");
    }
    other.#assertAlive();
    this.#assertSameRuntime(other);
    if (this.rows !== other.rows || this.cols !== other.cols) {
      throw new RangeError(`shape mismatch: ${this.rows}x${this.cols} !== ${other.rows}x${other.cols}`);
    }
  }

  #assertSameRuntime(other) {
    if (this.#runtime !== other.#runtime) {
      throw new RangeError("matrices belong to different WASM runtimes");
    }
  }

  #assertSquare(operation) {
    this.#assertAlive();
    if (this.rows !== this.cols) {
      throw new RangeError(`${operation} requires a square matrix`);
    }
  }
}

export default Matrix;
