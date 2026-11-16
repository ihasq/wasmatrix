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
  cacheLimitBytes: 64 * 1024 * 1024,
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
const EW_AFFINE = 16;

const OPERAND_FULL = 0;
const OPERAND_ROW = 1;
const OPERAND_COLUMN = 2;
const OPERAND_SCALAR = 3;

const DAG_TRACK_HEADER = -1;
const DAG_REF_LEAF = 0;
const DAG_REF_TRACK = 1;
const DAG_ENTRY_I32_SLOTS = 5;

const MATMUL_NN = "NN";
const MATMUL_TN = "TN";
const MATMUL_NT = "NT";
const MATMUL_TT = "TT";
const SMALL_LINALG_DIRECT_MAX_SIZE = 2;
const FACTOR_CACHE_SOLVE_MIN_SIZE = 24;
const PACKED_MATMUL_MIN_COST = 262_144;
const MIN_BUFFER_CACHE_BYTES = 64 * 1024;
const BATCH_INSTRUCTION_I32_SLOTS = 10;
const BATCH_OP_MATMUL = 2;
const BATCH_OP_SOLVE = 3;
const BATCH_OP_TRANSPOSE = 4;
const BATCH_OP_MATMUL_TN = 7;
const BATCH_OP_MATMUL_NT = 8;
const BATCH_OP_MATMUL_TT = 9;
const BATCH_OP_OUTER = 17;
const BATCH_OP_DIAGONAL_MATRIX = 18;
const BATCH_OP_INVERT_DIAGONAL = 19;
const BATCH_OP_AFFINE = 20;
const BATCH_OP_SCALE_ROWS_BY_VECTOR = 21;
const BATCH_OP_SCALE_COLS_BY_VECTOR = 22;
const BATCH_OP_ONES_LEFT_MATMUL = 23;
const BATCH_OP_ONES_RIGHT_MATMUL = 24;
const BATCH_OP_MATMUL_AFFINE = 27;

let defaultRuntime: any = null;
let nextRuntimeId = 1;
let nextMatrixId = 1;
const f32BitsBuffer = new ArrayBuffer(4);
const f32BitsView = new Float32Array(f32BitsBuffer);
const i32BitsView = new Int32Array(f32BitsBuffer);

/* c8 ignore start */
const matrixFinalizer: FinalizationRegistry<any> | null =
  typeof FinalizationRegistry === "function"
    ? new FinalizationRegistry(({ runtime, ptr }) => runtime.free(ptr))
    : null;

const cacheFinalizer: FinalizationRegistry<any> | null =
  typeof FinalizationRegistry === "function"
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

function f32Bits(value) {
  f32BitsView[0] = Math.fround(value);
  return i32BitsView[0];
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
      throw new Error(
        `wasmatrix cannot fetch ${url.href} in this JavaScript runtime`,
      );
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `wasmatrix failed to fetch ${url.href}: ${response.status} ${response.statusText}`,
      );
    }
    return new Uint8Array(await response.arrayBuffer());
  }
  /* c8 ignore stop */

  const { readFile } = await import("node:fs/promises");
  return new Uint8Array(await readFile(url));
}

export function isSimdSupported(wasmBytes: WasmBytes | null = null): boolean {
  /* c8 ignore start */
  if (
    typeof WebAssembly === "undefined" ||
    typeof WebAssembly.validate !== "function"
  ) {
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
    throw new Error(
      "wasmatrix requires a WebAssembly runtime with SIMD support",
    );
  }

  const module = new WebAssembly.Module(wasmBytes);
  const instance = new WebAssembly.Instance(module, {
    env: {
      abort: createAbort(),
    },
  });
  const runtime = new WasmRuntime(instance.exports as any);

  /* c8 ignore start */
  if (runtime.call("simdProbe") !== 1) {
    throw new Error("wasmatrix SIMD probe failed");
  }
  const abiVersion = runtime.call("abiVersion");
  if (abiVersion !== 11) {
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
  #memoryBuffer;
  #f32;
  #f64;
  #i32;
  f64ScratchPtr;
  f64ScratchLength;
  i32ScratchPtr;
  i32ScratchLength;
  cacheLimitBytes;
  cacheBytes;
  cacheEntries;
  bufferCache;
  scalarCache;
  structuralKeys;
  nextStructuralKeyId;

  constructor(exports) {
    this.id = nextRuntimeId++;
    this.#exports = exports;
    this.#memoryBuffer = null;
    this.#f32 = null;
    this.#f64 = null;
    this.#i32 = null;
    this.f64ScratchPtr = 0;
    this.f64ScratchLength = 0;
    this.i32ScratchPtr = 0;
    this.i32ScratchLength = 0;
    this.cacheLimitBytes = optimizationOptions.cacheLimitBytes;
    this.cacheBytes = 0;
    this.cacheEntries = new Map();
    this.bufferCache = new Map();
    this.scalarCache = new Map();
    this.structuralKeys = new Map();
    this.nextStructuralKeyId = 1;
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

  #refreshViews() {
    const buffer = this.memory.buffer;
    if (this.#memoryBuffer !== buffer) {
      this.#memoryBuffer = buffer;
      this.#f32 = new Float32Array(buffer);
      this.#f64 = new Float64Array(buffer);
      this.#i32 = new Int32Array(buffer);
    }
  }

  get f32() {
    this.#refreshViews();
    return this.#f32;
  }

  get i32() {
    this.#refreshViews();
    return this.#i32;
  }

  get f64() {
    this.#refreshViews();
    return this.#f64;
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
      },
    };

    this.cacheEntries.set(token, entry);
    this.cacheBytes += bytes;
    this.#evictCaches();
    return entry;
  }

  touchCacheEntry(entry) {
    if (
      entry == null || entry.disposed || !this.cacheEntries.has(entry.token)
    ) return false;
    this.cacheEntries.delete(entry.token);
    this.cacheEntries.set(entry.token, entry);
    return true;
  }

  #evictCaches() {
    while (
      this.cacheBytes > this.cacheLimitBytes && this.cacheEntries.size > 0
    ) {
      const oldest = this.cacheEntries.values().next().value;
      oldest.dispose();
    }
  }

  trimCaches() {
    this.#evictCaches();
    if (this.cacheLimitBytes === 0) this.scalarCache.clear();
  }

  getCachedScalar(key) {
    if (!this.scalarCache.has(key)) return undefined;
    const value = this.scalarCache.get(key);
    this.scalarCache.delete(key);
    this.scalarCache.set(key, value);
    return value;
  }

  putCachedScalar(key, value) {
    if (this.cacheLimitBytes === 0) return;
    this.scalarCache.delete(key);
    this.scalarCache.set(key, value);
    /* c8 ignore next 3 -- bounded-cache safety valve */
    while (this.scalarCache.size > 1024) {
      this.scalarCache.delete(this.scalarCache.keys().next().value);
    }
  }

  internStructuralKey(parts) {
    const canonical = parts.join("\u001f");
    const cached = this.structuralKeys.get(canonical);
    if (cached != null) return cached;
    const key = `s${this.nextStructuralKeyId++}`;
    this.structuralKeys.set(canonical, key);
    // Structural keys are only an interning aid. Bound the table so a process
    // that continually constructs unique graphs does not retain them forever.
    /* c8 ignore next 5 -- requires 65,537 unique live graph shapes */
    if (this.structuralKeys.size > 65_536) {
      const oldest = this.structuralKeys.keys().next().value;
      this.structuralKeys.delete(oldest);
    }
    return key;
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
      cacheEntry: null,
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

  writeInto(ptr, data) {
    const values = toFloat32Array(data, "data");
    this.f32.set(values, ptr >>> 2);
  }

  read(ptr, length) {
    return new Float32Array(this.viewF32(ptr, length));
  }

  viewF32(ptr, length) {
    const start = ptr >>> 2;
    return this.f32.subarray(start, start + length);
  }

  readValue(ptr, index) {
    return this.f32[(ptr >>> 2) + index];
  }

  writeValue(ptr, index, value) {
    this.f32[(ptr >>> 2) + index] = value;
  }
}

class FreeRegionAllocator {
  root = null;
  byStart = new Map();
  byEnd = new Map();
  sequence = 1;

  #compare(left, right) {
    return left.length - right.length || left.offset - right.offset;
  }

  /* c8 ignore start -- treap balancing is an internal allocation detail */
  #rotateLeft(node) {
    const right = node.right;
    node.right = right.left;
    right.left = node;
    return right;
  }

  #rotateRight(node) {
    const left = node.left;
    node.left = left.right;
    left.right = node;
    return left;
  }

  #insert(root, node) {
    if (root == null) return node;
    if (this.#compare(node, root) < 0) {
      root.left = this.#insert(root.left, node);
      if (root.left.priority < root.priority) root = this.#rotateRight(root);
    } else {
      root.right = this.#insert(root.right, node);
      if (root.right.priority < root.priority) root = this.#rotateLeft(root);
    }
    return root;
  }

  #remove(root, node) {
    if (root == null) return null;
    const comparison = this.#compare(node, root);
    if (comparison < 0) root.left = this.#remove(root.left, node);
    else if (comparison > 0) root.right = this.#remove(root.right, node);
    else if (root.left == null) return root.right;
    else if (root.right == null) return root.left;
    else if (root.left.priority < root.right.priority) {
      root = this.#rotateRight(root);
      root.right = this.#remove(root.right, node);
    } else {
      root = this.#rotateLeft(root);
      root.left = this.#remove(root.left, node);
    }
    return root;
  }
  /* c8 ignore stop */

  #add(offset, length) {
    if (length <= 0) return;
    const node = {
      offset,
      length,
      priority: (this.sequence++ * 2_654_435_761) >>> 0,
      left: null,
      right: null,
    };
    this.root = this.#insert(this.root, node);
    this.byStart.set(offset, node);
    this.byEnd.set(offset + length, node);
  }

  #delete(node) {
    this.root = this.#remove(this.root, node);
    this.byStart.delete(node.offset);
    this.byEnd.delete(node.offset + node.length);
  }

  release(offset, length) {
    let start = offset;
    let size = length;
    const left = this.byEnd.get(start);
    if (left != null) {
      this.#delete(left);
      start = left.offset;
      size += left.length;
    }
    const right = this.byStart.get(start + size);
    /* c8 ignore next 5 -- right-side coalescing depends on slab fragmentation */
    if (right != null) {
      this.#delete(right);
      size += right.length;
    }
    this.#add(start, size);
  }

  take(length) {
    let current = this.root;
    let best = null;
    while (current != null) {
      if (current.length >= length) {
        best = current;
        current = current.left;
      } else current = current.right;
    }
    if (best == null) return -1;
    this.#delete(best);
    const offset = best.offset;
    this.#add(offset + length, best.length - length);
    return offset;
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
  #leastSquaresOf = null;
  #outerOf = null;
  #diagonalOf = null;
  #diagonalTemporary = false;
  #literalData = null;
  #literalFill = null;
  #constantFill = null;
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
      options.base != null ||
      options.inverseOf != null ||
      options.transposeOf != null ||
      options.expr != null ||
      options.matmulOf != null ||
      options.solveOf != null ||
      options.leastSquaresOf != null ||
      options.outerOf != null ||
      options.diagonalOf != null
    ) {
      this.#ptr = 0;
      this.#owns = false;
      this.#base = options.base ?? null;
      this.#inverseOf = options.inverseOf ?? null;
      this.#transposeOf = options.transposeOf ?? null;
      this.#expr = options.expr ?? null;
      this.#matmulOf = options.matmulOf ?? null;
      this.#solveOf = options.solveOf ?? null;
      this.#leastSquaresOf = options.leastSquaresOf ?? null;
      this.#outerOf = options.outerOf ?? null;
      this.#diagonalOf = options.diagonalOf ?? null;
      this.#diagonalTemporary = options.diagonalTemporary === true;
      this.#affineScale = options.affineScale ?? 1;
      this.#affineBias = options.affineBias ?? 0;
    } else {
      if (data != null) {
        assertArrayLike(data, "data");
        if (data.length !== length) {
          throw new RangeError(
            `data length ${data.length} does not match matrix shape ${rows}x${cols}`,
          );
        }
      }

      this.#ptr = 0;
      this.#owns = false;
      if (data == null) {
        if (options.identity === true) {
          this.#literalIdentity = true;
        } else {
          this.#literalFill = options.fillValue ?? 0;
          this.#constantFill = this.#literalFill;
          if (options.structure == null) {
            this.#structure = Matrix.#constantStructure(this.#literalFill);
          }
        }
      } else {
        this.#literalData = new Float32Array(toFloat32Array(data, "data"));
      }
    }

    if (this.#owns && this.#ptr) {
      matrixFinalizer?.register(this, {
        runtime: this.#runtime,
        ptr: this.#ptr,
      }, this);
    }
  }

  static #fromWasm(rows, cols, runtime, ptr, structure = "dense") {
    return new Matrix(rows, cols, null, { runtime, ptr, structure });
  }

  static #constantStructure(value) {
    return value === 0 ? "zero" : value === 1 ? "ones" : "constant";
  }

  static #constant(rows, cols, value, runtime) {
    const rounded = Math.fround(value);
    return new Matrix(rows, cols, null, {
      runtime,
      fillValue: rounded,
      structure: Matrix.#constantStructure(rounded),
    });
  }

  static #identity(size, runtime) {
    return new Matrix(size, size, null, {
      runtime,
      structure: "identity",
      identity: true,
    });
  }

  #constantValue() {
    if (this.#structure === "zero") return 0;
    if (this.#structure === "ones") return 1;
    if (this.#structure === "constant") return this.#constantFill;
    return this.#ptr === 0 && this.#literalFill != null
      ? this.#literalFill
      : null;
  }

  static #rawExpressionOps(ops) {
    if (Array.isArray(ops)) return ops;
    const result = new Array(ops.length);
    let current = ops;
    let index = ops.length - 1;
    while (current != null && !Array.isArray(current)) {
      result[index] = current.op;
      current = current.prev;
      index--;
    }
    if (Array.isArray(current)) {
      for (let source = current.length - 1; source >= 0; source--) {
        result[index--] = current[source];
      }
    }
    return result;
  }

  static #expressionOps(expr) {
    const ops = expr.ops;
    if (Array.isArray(ops)) return ops;
    if (ops.normalized == null) {
      ops.normalized = Matrix.#normalizeElementwiseOps(
        Matrix.#rawExpressionOps(ops),
      );
    }
    return ops.normalized;
  }

  static #appendExpressionOp(previous, op) {
    return {
      prev: previous,
      op,
      length:
        (Array.isArray(previous) ? previous.length : previous?.length ?? 0) +
        1,
      normalized: null,
    };
  }

  static #applyConstantUnary(value, op) {
    const a = Math.fround(value);
    if (op.code === EW_ADD_SCALAR) return Math.fround(a + op.scalarA);
    if (op.code === EW_MULTIPLY_SCALAR) return Math.fround(a * op.scalarA);
    if (op.code === EW_DIVIDE_SCALAR) return Math.fround(a / op.scalarA);
    if (op.code === EW_NEGATE) return Math.fround(-a);
    if (op.code === EW_ABS) return Math.fround(Math.abs(a));
    if (op.code === EW_SQRT) return Math.fround(Math.sqrt(a));
    if (op.code === EW_FLOOR) return Math.fround(Math.floor(a));
    if (op.code === EW_CEIL) return Math.fround(Math.ceil(a));
    if (op.code === EW_CLAMP) {
      return Math.fround(Math.min(op.scalarB, Math.max(op.scalarA, a)));
    }
    /* c8 ignore next 4 -- constants are folded before affine normalization */
    if (op.code === EW_AFFINE) {
      return Math.fround(Math.fround(a * op.scalarA) + op.scalarB);
    }
    /* c8 ignore next 2 -- all public unary opcodes are handled above */
    return null;
  }

  static #affineStructure(base, scale, bias) {
    if (bias !== 0) return "dense";
    if (scale === 0) return "zero";
    /* c8 ignore next 3 */
    if (base.#structure === "identity") {
      return scale === 1 ? "identity" : "diagonal";
    }
    return base.#structure;
  }

  static #affineView(base, scale, bias) {
    base.#assertAlive();
    assertFiniteNumber(scale, "scale");
    assertFiniteNumber(bias, "bias");
    const constant = base.#constantValue();
    if (constant != null) {
      return Matrix.#constant(
        base.rows,
        base.cols,
        Math.fround(Math.fround(constant * scale) + bias),
        base.#runtime,
      );
    }
    const structure = Matrix.#affineStructure(base, scale, bias);

    if (
      base.#base != null && base.#inverseOf == null &&
      base.#transposeOf == null && base.#ptr === 0
    ) {
      return new Matrix(base.rows, base.cols, null, {
        runtime: base.#runtime,
        base: base.#base,
        affineScale: base.#affineScale * scale,
        affineBias: base.#affineBias * scale + bias,
        structure,
      });
    }

    return new Matrix(base.rows, base.cols, null, {
      runtime: base.#runtime,
      base,
      affineScale: scale,
      affineBias: bias,
      structure,
    });
  }

  static #elementwiseStructure(base, op) {
    if (op.code === EW_ADD_SCALAR) {
      return op.scalarA === 0 ? base.#structure : "dense";
    }
    if (
      op.code === EW_MULTIPLY_SCALAR || op.code === EW_DIVIDE_SCALAR ||
      op.code === EW_AFFINE
    ) {
      if (op.code === EW_AFFINE && op.scalarB !== 0) return "dense";
      if (
        op.scalarA === 0 &&
        (op.code === EW_MULTIPLY_SCALAR || op.code === EW_AFFINE)
      ) return "zero";
      if (base.#structure === "zero") return "zero";
      if (base.#structure === "diagonal") return "diagonal";
      /* c8 ignore next 3 */
      if (base.#structure === "identity") {
        return op.scalarA === 1 ? "identity" : "diagonal";
      }
      /* c8 ignore next 4 -- ones matrices are handled as constants first */
      if (base.#structure === "ones") {
        return op.scalarA === 1 ? "ones" : "dense";
      }
      return base.#structure;
    }
    if (op.code === EW_NEGATE) {
      if (base.#structure === "identity") return "diagonal";
      if (base.#structure === "ones") return "constant";
      return base.#structure;
    }
    if (
      op.code === EW_ABS ||
      op.code === EW_SQRT ||
      op.code === EW_FLOOR ||
      op.code === EW_CEIL
    ) {
      return base.#structure;
    }
    if (op.code === EW_CLAMP && op.scalarA <= 0 && op.scalarB >= 0) {
      /* c8 ignore next 4 -- identity clamp is lowered to a diagonal first */
      if (
        base.#structure === "identity" &&
        Math.min(op.scalarB, Math.max(op.scalarA, 1)) !== 1
      ) return "diagonal";
      /* c8 ignore next 5 -- ones matrices are handled as constants first */
      if (base.#structure === "ones") {
        return Math.min(op.scalarB, Math.max(op.scalarA, 1)) === 1
          ? "ones"
          : "constant";
      }
      return base.#structure;
    }
    return "dense";
  }

  static #exprView(base, op) {
    base.#assertAlive();
    const constant = base.#constantValue();
    if (constant != null && op.other == null) {
      const value = Matrix.#applyConstantUnary(constant, op);
      if (value != null) {
        return Matrix.#constant(base.rows, base.cols, value, base.#runtime);
      }
    }
    if (op.other == null) {
      const mappedZero = Matrix.#applyConstantUnary(0, op);
      if (mappedZero === 0 || Object.is(mappedZero, -0)) {
        const diagonalSource = base.#diagonalVectorSource();
        if (diagonalSource != null) {
          const mappedDiagonal = Matrix.#exprView(diagonalSource, op);
          return new Matrix(base.rows, base.cols, null, {
            runtime: base.#runtime,
            diagonalOf: mappedDiagonal,
            diagonalTemporary: true,
            structure: mappedDiagonal.#constantValue() === 1
              ? "identity"
              : "diagonal",
          });
        }
        if (base.#structure === "identity") {
          const mappedOne = Matrix.#applyConstantUnary(1, op);
          const diagonal = Matrix.#constant(
            base.rows,
            1,
            mappedOne,
            base.#runtime,
          );
          return new Matrix(base.rows, base.cols, null, {
            runtime: base.#runtime,
            diagonalOf: diagonal,
            diagonalTemporary: true,
            structure: mappedOne === 1 ? "identity" : "diagonal",
          });
        }
      }
    }
    const source = base.#expr == null ? base : base.#expr.base;
    const previous = base.#expr == null ? null : base.#expr.ops;
    const ops = Matrix.#appendExpressionOp(previous, op);
    const structure = Matrix.#elementwiseStructure(base, op);

    return new Matrix(base.rows, base.cols, null, {
      runtime: base.#runtime,
      expr: { base: source, ops },
      structure,
    });
  }

  static #normalizeElementwiseOps(ops) {
    const normalized = [];
    let scale = 1;
    let bias = 0;
    let scalarCount = 0;
    const flushAffine = () => {
      if (scalarCount === 0) return;
      normalized.push({
        code: EW_AFFINE,
        scalarA: scale,
        scalarB: bias,
      });
      scale = 1;
      bias = 0;
      scalarCount = 0;
    };

    for (const current of ops) {
      if (current.code === EW_ADD_SCALAR) {
        bias += current.scalarA;
        scalarCount++;
      } else if (current.code === EW_MULTIPLY_SCALAR) {
        scale *= current.scalarA;
        bias *= current.scalarA;
        scalarCount++;
      } else if (current.code === EW_DIVIDE_SCALAR) {
        scale /= current.scalarA;
        bias /= current.scalarA;
        scalarCount++;
      } else if (current.code === EW_AFFINE) {
        scale *= current.scalarA;
        bias = bias * current.scalarA + current.scalarB;
        scalarCount++;
      } else {
        flushAffine();
        const previous = normalized[normalized.length - 1];
        if (
          previous != null && previous.code === current.code &&
          (current.code === EW_ABS || current.code === EW_FLOOR ||
            current.code === EW_CEIL)
        ) continue;
        if (
          previous != null && previous.code === EW_NEGATE &&
          current.code === EW_NEGATE
        ) {
          normalized.pop();
          continue;
        }
        normalized.push(current);
      }
    }
    flushAffine();
    return normalized;
  }

  static #view(matrix) {
    return Matrix.#affineView(matrix, 1, 0);
  }

  static #sameMatmul(left, right) {
    return left != null &&
      right != null &&
      left.variant === right.variant &&
      left.left === right.left &&
      left.right === right.right &&
      left.gram === right.gram;
  }

  static #shouldDistributeMatmul(gemmCost, combineCost) {
    const original = 2 * gemmCost;
    const rewrite = gemmCost + combineCost;
    return original >= 131_072 && rewrite < original * 0.85;
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
    return Matrix.#identity(size, getRuntime());
  }

  static diagonal(values) {
    const runtime = values instanceof Matrix ? values.#runtime : getRuntime();
    let inputLength;

    if (values instanceof Matrix) {
      values.#assertAlive();
      inputLength = values.length;
      assertPositiveInteger(inputLength, "values.length");
      return new Matrix(inputLength, inputLength, null, {
        runtime,
        diagonalOf: values,
        structure: "diagonal",
      });
    } else {
      const vector = toFloat32Array(values, "values");
      inputLength = vector.length;
      assertPositiveInteger(inputLength, "values.length");
      const source = new Matrix(inputLength, 1, vector, { runtime });
      return new Matrix(inputLength, inputLength, null, {
        runtime,
        diagonalOf: source,
        diagonalTemporary: true,
        structure: "diagonal",
      });
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
    const runtime = a instanceof Matrix
      ? a.#runtime
      : b instanceof Matrix
      ? b.#runtime
      : getRuntime();
    const leftIsMatrix = a instanceof Matrix;
    const rightIsMatrix = b instanceof Matrix;
    const leftVector = leftIsMatrix ? null : toFloat32Array(a, "a");
    const rightVector = rightIsMatrix ? null : toFloat32Array(b, "b");
    const left = leftIsMatrix
      ? a
      : new Matrix(leftVector.length, 1, leftVector, { runtime });
    const right = rightIsMatrix
      ? b
      : new Matrix(rightVector.length, 1, rightVector, { runtime });
    left.#assertAlive();
    right.#assertAlive();
    if (left.#runtime !== runtime || right.#runtime !== runtime) {
      throw new RangeError("outer operands belong to different WASM runtimes");
    }
    return new Matrix(left.length, right.length, null, {
      runtime,
      outerOf: {
        left,
        right,
        temporaryLeft: !leftIsMatrix,
        temporaryRight: !rightIsMatrix,
      },
      structure: "outer",
    });
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
          `matmulChain shape mismatch at ${i - 1}/${i}: ${
            matrices[i - 1].rows
          }x${matrices[i - 1].cols} cannot multiply ${matrices[i].rows}x${
            matrices[i].cols
          }`,
        );
      }
    }
    if (matrices.length === 1) {
      return Matrix.#affineView(matrices[0], 1, 0);
    }

    const n = matrices.length;
    const costs = Array.from({ length: n }, () => new Array(n).fill(0));
    const splits = Array.from({ length: n }, () => new Array(n).fill(0));
    const structures = Array.from({ length: n }, () => new Array(n));
    for (let i = 0; i < n; i++) structures[i][i] = matrices[i].#structure;

    const productStructure = (left, right) => {
      if (left === "zero" || right === "zero") return "zero";
      if (left === "identity") return right;
      if (right === "identity") return left;
      if (left === "diagonal" && right === "diagonal") return "diagonal";
      return "dense";
    };

    const multiplicationCost = (rows, shared, cols, left, right) => {
      if (
        left === "zero" || right === "zero" || left === "identity" ||
        right === "identity"
      ) return 0;
      if (left === "diagonal" || right === "diagonal") return rows * cols;
      if (left === "ones") return shared * cols + rows * cols;
      if (right === "ones") return rows * shared + rows * cols;
      if (left === "outer") return shared * cols + rows * cols;
      if (right === "outer") return rows * shared + rows * cols;
      return rows * shared * cols;
    };

    for (let width = 2; width <= n; width++) {
      for (let i = 0; i <= n - width; i++) {
        const j = i + width - 1;
        let best = Number.POSITIVE_INFINITY;
        let bestSplit = i;

        for (let k = i; k < j; k++) {
          const cost = costs[i][k] +
            costs[k + 1][j] +
            multiplicationCost(
              matrices[i].rows,
              matrices[k].cols,
              matrices[j].cols,
              structures[i][k],
              structures[k + 1][j],
            );
          if (cost < best) {
            best = cost;
            bestSplit = k;
          }
        }

        costs[i][j] = best;
        splits[i][j] = bestSplit;
        structures[i][j] = productStructure(
          structures[i][bestSplit],
          structures[bestSplit + 1][j],
        );
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
        free() {},
      };
    }

    const data = toFloat32Array(value, name);
    const ptr = runtime.write(data);
    return {
      ptr,
      length: data.length,
      free() {
        runtime.free(ptr);
      },
    };
  }

  static #columnVectorCopy(vector, runtime) {
    const data = new Float32Array(vector.length);
    for (let i = 0; i < data.length; i++) data[i] = vector.#flatValueAt(i);
    return new Matrix(data.length, 1, data, { runtime });
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

  #dataView() {
    return this.#runtime.viewF32(this.#materializedPtr(), this.length);
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
    if (this.#leastSquaresOf?.temporaryRight) {
      this.#leastSquaresOf.right.dispose();
    }
    this.#leastSquaresOf = null;
    if (this.#outerOf?.temporaryLeft) {
      this.#outerOf.left.dispose();
    }
    if (this.#outerOf?.temporaryRight) {
      this.#outerOf.right.dispose();
    }
    this.#outerOf = null;
    if (this.#diagonalTemporary) {
      this.#diagonalOf.dispose();
    }
    this.#diagonalOf = null;
    this.#diagonalTemporary = false;
    this.#literalData = null;
    this.#literalFill = null;
    this.#constantFill = null;
    this.#literalIdentity = false;
    this.#disposed = true;
  }

  [Symbol.dispose]() {
    this.dispose();
  }

  clone() {
    this.#assertAlive();
    const constant = this.#constantValue();
    if (constant != null) {
      return Matrix.#constant(
        this.rows,
        this.cols,
        constant,
        this.#runtime,
      );
    }
    if (this.#structure === "identity") {
      return new Matrix(this.rows, this.cols, null, {
        runtime: this.#runtime,
        structure: "identity",
        identity: true,
      });
    }
    if (this.#literalData != null) {
      return new Matrix(this.rows, this.cols, this.#literalData, {
        runtime: this.#runtime,
        structure: this.#structure,
      });
    }

    const ptr = this.#runtime.alloc(this.length);
    this.#runtime.call("copy", this.#materializedPtr(), ptr, this.length);
    return Matrix.#fromWasm(this.rows, this.cols, this.#runtime, ptr);
  }

  #localValueAt(row, col) {
    const index = row * this.cols + col;
    if (this.#literalData != null) return this.#literalData[index];
    if (this.#literalFill != null) return this.#literalFill;
    if (this.#literalIdentity) return row === col ? 1 : 0;
    return null;
  }

  #flatValueAt(index) {
    return this.#valueAtUnchecked(
      Math.floor(index / this.cols),
      index % this.cols,
    );
  }

  static #applyScalarElementOp(value, op, row, col) {
    let other = 0;
    if (op.other != null) {
      if (op.operandMode === OPERAND_ROW) {
        other = op.other.#valueAtUnchecked(0, col);
      } else if (op.operandMode === OPERAND_COLUMN) {
        other = op.other.#valueAtUnchecked(row, 0);
        /* c8 ignore next 2 -- scalar mode only exists in compiled WASM DAGs */
      } else if (op.operandMode === OPERAND_SCALAR) {
        other = op.other.#valueAtUnchecked(0, 0);
      } else other = op.other.#valueAtUnchecked(row, col);
    }
    let result = value;
    if (op.code === EW_ADD) result = value + other;
    else if (op.code === EW_SUBTRACT) result = value - other;
    else if (op.code === EW_MULTIPLY) result = value * other;
    else if (op.code === EW_DIVIDE) result = value / other;
    else if (op.code === EW_MIN) result = Math.min(value, other);
    else if (op.code === EW_MAX) result = Math.max(value, other);
    else if (op.code === EW_ADD_SCALAR) result = value + op.scalarA;
    else if (op.code === EW_MULTIPLY_SCALAR) result = value * op.scalarA;
    else if (op.code === EW_DIVIDE_SCALAR) result = value / op.scalarA;
    else if (op.code === EW_NEGATE) result = -value;
    else if (op.code === EW_ABS) result = Math.abs(value);
    else if (op.code === EW_SQRT) result = Math.sqrt(value);
    else if (op.code === EW_FLOOR) result = Math.floor(value);
    else if (op.code === EW_CEIL) result = Math.ceil(value);
    else if (op.code === EW_CLAMP) {
      result = Math.min(op.scalarB, Math.max(op.scalarA, value));
    } else if (op.code === EW_AFFINE) {
      result = Math.fround(value * op.scalarA) + op.scalarB;
    }
    return Math.fround(result);
  }

  #valueAtUnchecked(row, col) {
    const local = this.#localValueAt(row, col);
    if (local != null) return local;
    if (this.#ptr) {
      return this.#runtime.readValue(this.#ptr, row * this.cols + col);
    }
    if (this.#base != null) {
      return Math.fround(
        Math.fround(
          this.#base.#valueAtUnchecked(row, col) * this.#affineScale,
        ) +
          this.#affineBias,
      );
    }
    if (this.#transposeOf != null) {
      return this.#transposeOf.#valueAtUnchecked(col, row);
    }
    if (this.#diagonalOf != null) {
      return row === col ? this.#diagonalOf.#flatValueAt(row) : 0;
    }
    if (this.#outerOf != null) {
      return Math.fround(
        this.#outerOf.left.#flatValueAt(row) *
          this.#outerOf.right.#flatValueAt(col),
      );
    }
    if (this.#expr != null) {
      let value = this.#expr.base.#valueAtUnchecked(row, col);
      for (const op of Matrix.#expressionOps(this.#expr)) {
        value = Matrix.#applyScalarElementOp(value, op, row, col);
      }
      return value;
    }
    if (this.#matmulOf != null) {
      const { left, right, variant } = this.#matmulOf;
      const shared = variant === MATMUL_NN || variant === MATMUL_NT
        ? left.cols
        : left.rows;
      let total = Math.fround(0);
      for (let k = 0; k < shared; k++) {
        const a = variant === MATMUL_TN || variant === MATMUL_TT
          ? left.#valueAtUnchecked(k, row)
          : left.#valueAtUnchecked(row, k);
        const b = variant === MATMUL_NT || variant === MATMUL_TT
          ? right.#valueAtUnchecked(col, k)
          : right.#valueAtUnchecked(k, col);
        total = Math.fround(total + Math.fround(a * b));
      }
      return total;
    }
    // Solves and inverses require global information; retain their optimized
    // factorization path and read the requested value afterwards.
    return this.#runtime.readValue(
      this.#materializedPtr(),
      row * this.cols + col,
    );
  }

  at(row, col) {
    this.#assertIndex(row, col);
    return this.#valueAtUnchecked(row, col);
  }

  set(row, col, value) {
    this.#assertIndex(row, col);
    assertFiniteNumber(value, "value");
    const local = this.#mutableLocalData();
    if (local != null) {
      local[row * this.cols + col] = value;
    } else {
      this.#runtime.writeValue(
        this.#materializedPtr(),
        row * this.cols + col,
        value,
      );
    }
    this.#version++;
    this.#clearComputedCaches();
    this.#expr = null;
    this.#matmulOf = null;
    this.#solveOf = null;
    this.#leastSquaresOf = null;
    this.#outerOf = null;
    this.#diagonalOf = null;
    this.#diagonalTemporary = false;
    this.#structure = "dense";
    this.#constantFill = null;
    return this;
  }

  row(index) {
    this.#assertAlive();
    assertInteger(index, "index");
    if (index < 0 || index >= this.rows) {
      throw new RangeError("row index is out of range");
    }
    if (!this.#ptr) {
      const out = new Float32Array(this.cols);
      for (let col = 0; col < this.cols; col++) {
        out[col] = this.#valueAtUnchecked(index, col);
      }
      return out;
    }
    const start = (this.#materializedPtr() >>> 2) + index * this.cols;
    return new Float32Array(
      this.#runtime.f32.subarray(start, start + this.cols),
    );
  }

  rowView(index) {
    this.#assertAlive();
    assertInteger(index, "index");
    if (index < 0 || index >= this.rows) {
      throw new RangeError("row index is out of range");
    }
    return this.#runtime.viewF32(
      this.#materializedPtr() +
        index * this.cols * Float32Array.BYTES_PER_ELEMENT,
      this.cols,
    );
  }

  column(index) {
    this.#assertAlive();
    assertInteger(index, "index");
    if (index < 0 || index >= this.cols) {
      throw new RangeError("column index is out of range");
    }
    const out = new Float32Array(this.rows);
    if (!this.#ptr) {
      for (let r = 0; r < this.rows; r++) {
        out[r] = this.#valueAtUnchecked(r, index);
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
    const dependencyKey = this.#materializationCacheKey() ??
      this.#identityKey();
    if (
      cached != null && cached.version === this.#version &&
      cached.dependencyKey === dependencyKey
    ) {
      return new Float32Array(cached.value);
    }

    const length = Math.min(this.rows, this.cols);
    const diagonalSource = this.#diagonalVectorSource();
    if (diagonalSource != null) {
      const value = diagonalSource.toFloat32Array();
      this.#diagonalCache = { version: this.#version, dependencyKey, value };
      return new Float32Array(value);
    }

    if (!this.#ptr) {
      const value = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        value[i] = this.#valueAtUnchecked(i, i);
      }
      this.#diagonalCache = { version: this.#version, dependencyKey, value };
      return new Float32Array(value);
    }

    const ptr = this.#runtime.alloc(length);
    try {
      this.#runtime.call(
        "diagonal",
        this.#materializedPtr(),
        ptr,
        this.rows,
        this.cols,
      );
      const value = this.#runtime.read(ptr, length);
      this.#diagonalCache = { version: this.#version, dependencyKey, value };
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
      return new Matrix(rows, cols, local, {
        runtime: this.#runtime,
        structure: this.#structure,
      });
    }

    const ptr = this.#runtime.alloc(this.length);
    this.#runtime.call("copy", this.#materializedPtr(), ptr, this.length);
    return Matrix.#fromWasm(rows, cols, this.#runtime, ptr);
  }

  toFloat32Array() {
    return this.data;
  }

  toFloat32ArrayView() {
    this.#assertAlive();
    return this.#dataView();
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

  toArrayView() {
    const data = this.toFloat32ArrayView();
    const rows = [];
    for (let r = 0; r < this.rows; r++) {
      rows.push(data.subarray(r * this.cols, (r + 1) * this.cols));
    }
    return rows;
  }

  add(other) {
    if (typeof other === "number") return this.addScalar(other);
    return this.#elementwise(other, EW_ADD);
  }

  addScalar(value) {
    assertFiniteNumber(value, "value");
    return Matrix.#exprView(this, {
      code: EW_ADD_SCALAR,
      scalarA: value,
      scalarB: 0,
    });
  }

  subtract(other) {
    if (typeof other === "number") return this.addScalar(-other);
    return this.#elementwise(other, EW_SUBTRACT);
  }

  scale(value) {
    assertFiniteNumber(value, "value");
    return Matrix.#exprView(this, {
      code: EW_MULTIPLY_SCALAR,
      scalarA: value,
      scalarB: 0,
    });
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
      return Matrix.#exprView(this, {
        code: EW_DIVIDE_SCALAR,
        scalarA: other,
        scalarB: 0,
      });
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

    return Matrix.#exprView(this, {
      code: EW_CLAMP,
      scalarA: minValue,
      scalarB: maxValue,
    });
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

    const constant = this.#constantValue();
    if (constant != null) {
      return Matrix.#constant(this.cols, this.rows, constant, this.#runtime);
    }
    if (this.#structure === "identity" || this.#structure === "spd") {
      return Matrix.#affineView(this, 1, 0);
    }
    const diagonalSource = this.#diagonalVectorSource();
    if (diagonalSource != null) {
      return new Matrix(this.rows, this.cols, null, {
        runtime: this.#runtime,
        diagonalOf: diagonalSource,
        structure: "diagonal",
      });
    }
    if (this.#ptr === 0 && this.#outerOf != null) {
      return new Matrix(this.cols, this.rows, null, {
        runtime: this.#runtime,
        outerOf: {
          left: this.#outerOf.right,
          right: this.#outerOf.left,
          temporaryLeft: false,
          temporaryRight: false,
        },
        structure: "outer",
      });
    }

    if (this.#base != null && this.#inverseOf == null && this.#ptr === 0) {
      return Matrix.#affineView(
        this.#base.transpose(),
        this.#affineScale,
        this.#affineBias,
      );
    }

    if (this.#ptr === 0 && this.#expr != null) {
      const ops = Matrix.#expressionOps(this.#expr).map((op) => {
        if (op.other == null) return { ...op };
        let operandMode = op.operandMode;
        if (operandMode === OPERAND_ROW) operandMode = OPERAND_COLUMN;
        else if (operandMode === OPERAND_COLUMN) operandMode = OPERAND_ROW;
        return {
          ...op,
          other: op.other.transpose(),
          operandMode,
        };
      });
      return new Matrix(this.cols, this.rows, null, {
        runtime: this.#runtime,
        transposeOf: this,
        expr: { base: this.#expr.base.transpose(), ops },
        structure: this.#structure,
      });
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
      structure,
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
      throw new RangeError(
        `matmul shape mismatch: ${this.rows}x${this.cols} cannot multiply ${other.rows}x${other.cols}`,
      );
    }

    if (this.#inverseOf != null) {
      return this.#inverseOf.solve(other);
    }
    if (optimizationOptions.fastMath && other.#inverseOf === this) {
      return Matrix.#identity(this.rows, this.#runtime);
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
      return Matrix.#constant(this.rows, other.cols, 0, this.#runtime);
    }
    const leftDiagonal = this.#diagonalVectorSource();
    const rightDiagonal = other.#diagonalVectorSource();
    if (leftDiagonal != null && rightDiagonal != null) {
      const productVector = leftDiagonal.hadamard(rightDiagonal);
      return new Matrix(this.rows, this.cols, null, {
        runtime: this.#runtime,
        diagonalOf: productVector,
        diagonalTemporary: true,
        structure: "diagonal",
      });
    }
    const leftConstant = this.#constantValue();
    const rightConstant = other.#constantValue();
    if (leftConstant != null && rightConstant != null) {
      const product = Math.fround(leftConstant * rightConstant);
      let value = Math.fround(0);
      for (let k = 0; k < this.cols; k++) {
        value = Math.fround(value + product);
      }
      return Matrix.#constant(
        this.rows,
        other.cols,
        value,
        this.#runtime,
      );
    }
    if (leftConstant != null && leftConstant !== 1) {
      const ones = Matrix.#constant(this.rows, this.cols, 1, this.#runtime);
      return ones.matmul(other).scale(leftConstant);
    }
    if (rightConstant != null && rightConstant !== 1) {
      const ones = Matrix.#constant(other.rows, other.cols, 1, this.#runtime);
      return this.matmul(ones).scale(rightConstant);
    }
    if (
      optimizationOptions.fastMath && this.#ptr === 0 && other.#ptr === 0 &&
      this.#outerOf != null && other.#outerOf != null
    ) {
      let factor = Math.fround(0);
      for (let i = 0; i < this.#outerOf.right.length; i++) {
        factor = Math.fround(
          factor + Math.fround(
            this.#outerOf.right.#flatValueAt(i) *
              other.#outerOf.left.#flatValueAt(i),
          ),
        );
      }
      const scaledLeft = this.#outerOf.left.scale(factor);
      return new Matrix(this.rows, other.cols, null, {
        runtime: this.#runtime,
        outerOf: {
          left: scaledLeft,
          right: other.#outerOf.right,
          temporaryLeft: true,
          temporaryRight: false,
        },
        structure: "outer",
      });
    }
    if (
      optimizationOptions.fastMath && this.#ptr === 0 && this.#outerOf != null
    ) {
      const vector = Matrix.#columnVectorCopy(
        this.#outerOf.right,
        this.#runtime,
      );
      const projection = other.transpose().matmul(vector);
      return new Matrix(this.rows, other.cols, null, {
        runtime: this.#runtime,
        outerOf: {
          left: this.#outerOf.left,
          right: projection,
          temporaryLeft: false,
          temporaryRight: true,
        },
        structure: "outer",
      });
    }
    if (
      optimizationOptions.fastMath && other.#ptr === 0 && other.#outerOf != null
    ) {
      const vector = Matrix.#columnVectorCopy(
        other.#outerOf.left,
        this.#runtime,
      );
      const projection = this.matmul(vector);
      return new Matrix(this.rows, other.cols, null, {
        runtime: this.#runtime,
        outerOf: {
          left: projection,
          right: other.#outerOf.right,
          temporaryLeft: true,
          temporaryRight: false,
        },
        structure: "outer",
      });
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
    } else if (
      leftInput.source === rightInput.source && variant === MATMUL_NT
    ) {
      gram = "NT";
      structure = "spd";
    }
    if (this.#structure === "diagonal" && other.#structure === "diagonal") {
      structure = "diagonal";
    }

    return new Matrix(this.rows, other.cols, null, {
      runtime: this.#runtime,
      matmulOf: {
        left: leftInput.source,
        right: rightInput.source,
        variant,
        gram,
      },
      structure,
    });
  }

  matvec(vector) {
    this.#assertAlive();
    if (this.#inverseOf != null) {
      const solved = this.#inverseOf.solve(vector);
      try {
        return solved.toFloat32Array();
      } finally {
        solved.dispose();
      }
    }
    const vec = Matrix.#vectorRef(vector, "vector", this.#runtime);
    if (vec.length !== this.cols) {
      vec.free();
      throw new RangeError(
        `vector length ${vec.length} must match matrix columns ${this.cols}`,
      );
    }

    try {
      if (this.#structure === "zero") return new Float32Array(this.rows);
      if (this.#structure === "identity") {
        return this.#runtime.read(vec.ptr, this.rows);
      }
      if (this.#structure === "ones") {
        const total = this.#runtime.call("sum", vec.ptr, vec.length);
        return new Float32Array(this.rows).fill(total);
      }

      const diagonalSource = this.#diagonalVectorSource();
      const ptr = this.#runtime.alloc(this.rows);
      try {
        if (diagonalSource != null) {
          this.#runtime.call(
            "diagonalMatvec",
            diagonalSource.#materializedPtr(),
            vec.ptr,
            ptr,
            this.rows,
          );
        } else {
          this.#runtime.call(
            "matvec",
            this.#materializedPtr(),
            vec.ptr,
            ptr,
            this.rows,
            this.cols,
          );
        }
        return this.#runtime.read(ptr, this.rows);
      } finally {
        this.#runtime.free(ptr);
      }
    } finally {
      vec.free();
    }
  }

  dot(other) {
    this.#assertAlive();
    const values = Matrix.#vectorRef(other, "other", this.#runtime);
    if (values.length !== this.length) {
      values.free();
      throw new RangeError(
        `dot length mismatch: ${this.length} !== ${values.length}`,
      );
    }

    try {
      return this.#runtime.call(
        "dot",
        this.#materializedPtr(),
        values.ptr,
        this.length,
      );
    } finally {
      values.free();
    }
  }

  sum() {
    this.#assertAlive();
    const constant = this.#constantValue();
    if (constant != null) return constant * this.length;
    if (this.#structure === "identity") return Math.min(this.rows, this.cols);
    if (this.#ptr === 0 && this.#outerOf != null) {
      return this.#cachedReduction(
        "sum-outer",
        () => this.#outerOf.left.sum() * this.#outerOf.right.sum(),
      );
    }
    if (
      this.#ptr === 0 && this.#base != null && this.#affineScale === 1 &&
      this.#affineBias === 0
    ) return this.#cachedReduction("sum", () => this.#base.sum());
    if (this.#ptr === 0 && this.#transposeOf != null) {
      return this.#cachedReduction("sum", () => this.#transposeOf.sum());
    }
    if (this.#ptr === 0 && this.#expr != null) {
      this.#computeExpressionStats("sum");
      return this.#getCachedReduction("sum");
    }
    const diagonalSource = this.#diagonalVectorSource();
    if (diagonalSource != null) {
      return this.#cachedReduction("sum", () => diagonalSource.sum());
    }
    return this.#cachedReduction(
      "sum",
      () => this.#runtime.call("sum", this.#materializedPtr(), this.length),
    );
  }

  minValue() {
    this.#assertAlive();
    const constant = this.#constantValue();
    if (constant != null) return constant;
    if (this.#structure === "identity") return this.length === 1 ? 1 : 0;
    if (
      this.#ptr === 0 && this.#base != null && this.#affineScale === 1 &&
      this.#affineBias === 0
    ) return this.#cachedReduction("min", () => this.#base.minValue());
    if (this.#ptr === 0 && this.#transposeOf != null) {
      return this.#cachedReduction("min", () => this.#transposeOf.minValue());
    }
    if (this.#ptr === 0 && this.#expr != null) {
      this.#computeExpressionStats("min");
      return this.#getCachedReduction("min");
    }
    const diagonalSource = this.#diagonalVectorSource();
    if (diagonalSource != null) {
      return this.#cachedReduction("min", () => {
        const value = diagonalSource.minValue();
        return this.rows === 1 ? value : Math.min(0, value);
      });
    }
    return this.#cachedReduction(
      "min",
      () =>
        this.#runtime.call("minValue", this.#materializedPtr(), this.length),
    );
  }

  maxValue() {
    this.#assertAlive();
    const constant = this.#constantValue();
    if (constant != null) return constant;
    if (this.#structure === "identity") return 1;
    if (
      this.#ptr === 0 && this.#base != null && this.#affineScale === 1 &&
      this.#affineBias === 0
    ) return this.#cachedReduction("max", () => this.#base.maxValue());
    if (this.#ptr === 0 && this.#transposeOf != null) {
      return this.#cachedReduction("max", () => this.#transposeOf.maxValue());
    }
    if (this.#ptr === 0 && this.#expr != null) {
      this.#computeExpressionStats("max");
      return this.#getCachedReduction("max");
    }
    const diagonalSource = this.#diagonalVectorSource();
    if (diagonalSource != null) {
      return this.#cachedReduction("max", () => {
        const value = diagonalSource.maxValue();
        return this.rows === 1 ? value : Math.max(0, value);
      });
    }
    return this.#cachedReduction(
      "max",
      () =>
        this.#runtime.call("maxValue", this.#materializedPtr(), this.length),
    );
  }

  trace() {
    this.#assertAlive();
    const constant = this.#constantValue();
    if (constant != null) return constant * Math.min(this.rows, this.cols);
    if (this.#structure === "identity") return Math.min(this.rows, this.cols);
    if (this.#ptr === 0 && this.#outerOf != null) {
      const { left, right } = this.#outerOf;
      const length = Math.min(left.length, right.length);
      return this.#cachedReduction("trace-outer", () => {
        let total = 0;
        for (let i = 0; i < length; i++) {
          total += Math.fround(left.#flatValueAt(i) * right.#flatValueAt(i));
        }
        return total;
      });
    }
    if (
      this.#ptr === 0 && this.#matmulOf?.gram != null
    ) {
      const source = this.#matmulOf.left;
      return this.#cachedReduction(
        "trace-gram",
        () =>
          this.#runtime.call(
            this.#matmulOf.gram === "TN" ? "gramTraceTN" : "gramTraceNT",
            source.#materializedPtr(),
            source.rows,
            source.cols,
          ),
      );
    }
    if (
      this.#ptr === 0 && this.#base != null && this.#affineScale === 1 &&
      this.#affineBias === 0
    ) return this.#cachedReduction("trace", () => this.#base.trace());
    if (this.#ptr === 0 && this.#transposeOf != null) {
      return this.#cachedReduction("trace", () => this.#transposeOf.trace());
    }
    const diagonalSource = this.#diagonalVectorSource();
    if (diagonalSource != null) {
      return this.#cachedReduction("trace", () => diagonalSource.sum());
    }
    const affine = this.#affineExpressionInfo();
    if (
      this.#ptr === 0 && affine != null &&
      affine.base.#ptr === 0 && affine.base.#matmulOf != null &&
      affine.base.#matmulOf.variant === MATMUL_NN &&
      affine.base.#matmulOf.gram == null && this.rows === this.cols
    ) {
      const { left, right } = affine.base.#matmulOf;
      return this.#cachedReduction(
        "trace-affine-matmul",
        () =>
          this.#runtime.call(
              "traceMatmul",
              left.#materializedPtr(),
              right.#materializedPtr(),
              left.rows,
              left.cols,
            ) * affine.scale + affine.bias * Math.min(this.rows, this.cols),
      );
    }
    if (this.#ptr === 0 && this.#expr != null) {
      return this.#computeExpressionTrace();
    }
    if (
      this.#ptr === 0 &&
      this.#matmulOf != null &&
      this.#matmulOf.variant === MATMUL_NN &&
      this.#matmulOf.gram == null &&
      this.rows === this.cols
    ) {
      const { left, right } = this.#matmulOf;
      left.#assertAlive();
      right.#assertAlive();
      this.#assertSameRuntime(left);
      this.#assertSameRuntime(right);
      return this.#cachedReduction(
        "trace-matmul",
        () =>
          this.#runtime.call(
            "traceMatmul",
            left.#materializedPtr(),
            right.#materializedPtr(),
            left.rows,
            left.cols,
          ),
      );
    }
    return this.#cachedReduction(
      "trace",
      () =>
        this.#runtime.call(
          "trace",
          this.#materializedPtr(),
          this.rows,
          this.cols,
        ),
    );
  }

  frobeniusNorm() {
    this.#assertAlive();
    const constant = this.#constantValue();
    if (constant != null) return Math.abs(constant) * Math.sqrt(this.length);
    if (this.#structure === "identity") {
      return Math.sqrt(Math.min(this.rows, this.cols));
    }
    if (this.#ptr === 0 && this.#outerOf != null) {
      return this.#cachedReduction(
        "frobenius-outer",
        () =>
          this.#outerOf.left.frobeniusNorm() *
          this.#outerOf.right.frobeniusNorm(),
      );
    }
    if (
      this.#ptr === 0 && this.#base != null && this.#affineScale === 1 &&
      this.#affineBias === 0
    ) {
      return this.#cachedReduction(
        "frobenius",
        () => this.#base.frobeniusNorm(),
      );
    }
    if (this.#ptr === 0 && this.#transposeOf != null) {
      return this.#cachedReduction(
        "frobenius",
        () => this.#transposeOf.frobeniusNorm(),
      );
    }
    if (this.#ptr === 0 && this.#expr != null) {
      this.#computeExpressionStats("frobenius");
      return this.#getCachedReduction("frobenius");
    }
    const diagonalSource = this.#diagonalVectorSource();
    if (diagonalSource != null) {
      return this.#cachedReduction(
        "frobenius",
        () => diagonalSource.frobeniusNorm(),
      );
    }
    return this.#cachedReduction(
      "frobenius",
      () =>
        this.#runtime.call(
          "frobeniusNorm",
          this.#materializedPtr(),
          this.length,
        ),
    );
  }

  determinant() {
    this.#assertSquare("determinant");
    const cached = this.#getCachedReduction("determinant");
    if (cached != null) return cached;

    let value;
    if (this.#structure === "identity") return 1;
    if (this.#structure === "zero") return 0;
    const constant = this.#constantValue();
    if (constant != null) return this.rows === 1 ? constant : 0;
    if (this.#structure === "ones") return this.rows === 1 ? 1 : 0;
    if (this.#ptr === 0 && this.#outerOf != null && this.rows > 1) return 0;
    if (this.#structure === "diagonal") {
      const diagonalSource = this.#diagonalVectorSource();
      value = diagonalSource == null
        ? this.#runtime.call(
          "diagonalProduct",
          this.#materializedPtr(),
          this.rows,
        )
        : this.#runtime.call(
          "diagonalVectorProduct",
          diagonalSource.#materializedPtr(),
          this.rows,
        );
      this.#setCachedReduction("determinant", value);
      return value;
    }
    if (
      optimizationOptions.fastMath &&
      this.#ptr === 0 &&
      this.#matmulOf != null &&
      this.#matmulOf.variant === MATMUL_NN &&
      this.#matmulOf.gram == null &&
      this.#matmulOf.left.rows === this.#matmulOf.left.cols &&
      this.#matmulOf.right.rows === this.#matmulOf.right.cols
    ) {
      value = this.#matmulOf.left.determinant() *
        this.#matmulOf.right.determinant();
      this.#setCachedReduction("determinant", value);
      return value;
    }

    if (this.rows <= SMALL_LINALG_DIRECT_MAX_SIZE) {
      value = this.#runtime.call(
        "determinant",
        this.#materializedPtr(),
        this.rows,
      );
      this.#setCachedReduction("determinant", value);
      return value;
    }

    const cholesky = this.#choleskyFactor();
    if (cholesky != null) {
      value = this.#runtime.call(
        "choleskyDeterminant",
        cholesky.lowerPtr,
        this.rows,
      );
      this.#setCachedReduction("determinant", value);
      return value;
    }

    const factor = this.#luFactor();
    value = factor == null ? 0 : this.#runtime.call(
      "luDeterminant",
      factor.luPtr,
      this.rows,
      factor.sign,
    );
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
    } else if (
      this.#constantValue() != null || this.#structure === "ones" ||
      (this.#ptr === 0 && this.#outerOf != null)
    ) {
      const det = this.determinant();
      value = det > 0 ? Math.log(det) : Number.NaN;
    } else if (this.#structure === "diagonal") {
      const diagonalSource = this.#diagonalVectorSource();
      if (diagonalSource != null) {
        value = this.#runtime.call(
          "diagonalVectorLogDet",
          diagonalSource.#materializedPtr(),
          this.rows,
        );
      } else {
        const diagonal = this.diagonal();
        value = 0;
        for (const item of diagonal) {
          if (item <= 0) {
            value = Number.NaN;
            break;
          }
          value += Math.log(item);
        }
      }
    } else {
      const cholesky = this.#choleskyFactor();
      if (cholesky != null) {
        value = this.#runtime.call(
          "choleskyLogDet",
          cholesky.lowerPtr,
          this.rows,
        );
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
      return Matrix.#identity(this.rows, this.#runtime);
    }
    return new Matrix(this.rows, this.cols, null, {
      runtime: this.#runtime,
      inverseOf: this,
      structure: this.#structure === "diagonal" ? "diagonal" : "dense",
    });
  }

  solve(rhs) {
    this.#assertSquare("solve");
    const rhsIsMatrix = rhs instanceof Matrix;
    const right = rhsIsMatrix
      ? rhs
      : new Matrix(this.rows, 1, rhs, { runtime: this.#runtime });
    right.#assertAlive();
    this.#assertSameRuntime(right);
    if (right.rows !== this.rows) {
      if (!rhsIsMatrix) right.dispose();
      throw new RangeError(
        `right-hand side rows ${right.rows} must match ${this.rows}`,
      );
    }

    if (this.#structure === "identity") {
      return rhsIsMatrix ? Matrix.#view(right) : right;
    }

    return new Matrix(this.rows, right.cols, null, {
      runtime: this.#runtime,
      solveOf: {
        left: this,
        right,
        temporaryRight: !rhsIsMatrix,
      },
    });
  }

  leastSquares(rhs) {
    this.#assertAlive();
    if (this.rows < this.cols) {
      throw new RangeError("leastSquares requires rows >= columns");
    }

    const rhsIsMatrix = rhs instanceof Matrix;
    const right = rhsIsMatrix
      ? rhs
      : new Matrix(this.rows, 1, rhs, { runtime: this.#runtime });
    right.#assertAlive();
    this.#assertSameRuntime(right);
    if (right.rows !== this.rows) {
      if (!rhsIsMatrix) right.dispose();
      throw new RangeError(
        `right-hand side rows ${right.rows} must match ${this.rows}`,
      );
    }

    if (this.#structure === "identity") {
      return rhsIsMatrix ? Matrix.#view(right) : right;
    }
    if (this.#structure === "diagonal" && this.rows === this.cols) {
      if (!rhsIsMatrix) {
        const result = this.solve(right);
        result.#solveOf.temporaryRight = true;
        return result;
      }
      return this.solve(right);
    }

    return new Matrix(this.cols, right.cols, null, {
      runtime: this.#runtime,
      leastSquaresOf: {
        left: this,
        right,
        temporaryRight: !rhsIsMatrix,
      },
    });
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
    } else if (this.#constantValue() != null || this.#structure === "ones") {
      value = Math.abs(this.#constantValue() ?? 1) > epsilon ? 1 : 0;
    } else if (this.#ptr === 0 && this.#outerOf != null) {
      let leftMax = 0;
      let rightMax = 0;
      for (let i = 0; i < this.#outerOf.left.length; i++) {
        leftMax = Math.max(
          leftMax,
          Math.abs(this.#outerOf.left.#flatValueAt(i)),
        );
      }
      for (let i = 0; i < this.#outerOf.right.length; i++) {
        rightMax = Math.max(
          rightMax,
          Math.abs(this.#outerOf.right.#flatValueAt(i)),
        );
      }
      value = leftMax * rightMax > epsilon ? 1 : 0;
    } else if (this.#structure === "diagonal") {
      const diagonalSource = this.#diagonalVectorSource();
      value = diagonalSource == null
        ? this.#runtime.call(
          "diagonalRank",
          this.#materializedPtr(),
          Math.min(this.rows, this.cols),
          epsilon,
        )
        : this.#runtime.call(
          "diagonalVectorRank",
          diagonalSource.#materializedPtr(),
          Math.min(this.rows, this.cols),
          epsilon,
        );
    } else {
      const qr = this.#qrFactor();
      value = this.#runtime.call(
        "qrRank",
        qr.rPtr,
        this.rows,
        this.cols,
        epsilon,
      );
    }

    this.#setCachedReduction(key, value);
    return value;
  }

  equalsApprox(other, epsilon = 1e-6) {
    this.#assertSameShape(other);
    assertFiniteNumber(epsilon, "epsilon");
    const leftLocal = this.#localDataSnapshot();
    const rightLocal = other.#localDataSnapshot();
    if (leftLocal != null && rightLocal != null) {
      return Matrix.#arraysEqualApprox(leftLocal, rightLocal, epsilon);
    }
    if (leftLocal != null) {
      return other.#equalsMaterializedToLocal(leftLocal, epsilon);
    }
    if (rightLocal != null) {
      return this.#equalsMaterializedToLocal(rightLocal, epsilon);
    }
    return this.#runtime.call(
      "equalsApprox",
      this.#materializedPtr(),
      other.#materializedPtr(),
      this.length,
      epsilon,
    ) === 1;
  }

  toString() {
    return this.toArray()
      .map((row) => row.join("\t"))
      .join("\n");
  }

  #identityKey() {
    return `${this.#runtime.id}:${this.#id}:${this.#version}:${this.rows}x${this.cols}:f32:${Matrix.#fastMathKey()}`;
  }

  #valueKey(memo = new Map()) {
    const cached = memo.get(this);
    if (cached != null) return cached;
    const key = this.#materializationCacheKey(memo) ?? this.#identityKey();
    memo.set(this, key);
    return key;
  }

  #materializationCacheKey(memo = new Map()) {
    const cached = memo.get(this);
    if (cached != null) return cached;
    let parts = null;
    if (this.#expr != null) {
      const ops = Matrix.#expressionOps(this.#expr).map((op) =>
        this.#runtime.internStructuralKey([
          "op",
          op.code,
          op.scalarA ?? 0,
          op.scalarB ?? 0,
          op.operandMode ?? OPERAND_FULL,
          op.other == null ? "" : op.other.#valueKey(memo),
        ])
      );
      parts = [
        "expr",
        this.rows,
        this.cols,
        this.#expr.base.#valueKey(memo),
        ...ops,
      ];
    }

    if (parts == null && this.#matmulOf != null) {
      const { left, right, variant, gram } = this.#matmulOf;
      parts = [
        "matmul",
        this.rows,
        this.cols,
        variant,
        gram ?? "",
        left.#valueKey(memo),
        right.#valueKey(memo),
      ];
    }

    if (parts == null && this.#transposeOf != null) {
      parts = [
        "transpose",
        this.rows,
        this.cols,
        this.#transposeOf.#valueKey(memo),
      ];
    }

    if (parts == null && this.#inverseOf != null) {
      parts = [
        "inverse",
        this.rows,
        this.cols,
        this.#inverseOf.#valueKey(memo),
      ];
    }

    if (parts == null && this.#solveOf != null) {
      parts = [
        "solve",
        this.rows,
        this.cols,
        this.#solveOf.left.#valueKey(memo),
        this.#solveOf.right.#valueKey(memo),
      ];
    }

    if (parts == null && this.#leastSquaresOf != null) {
      parts = [
        "least-squares",
        this.rows,
        this.cols,
        this.#leastSquaresOf.left.#valueKey(memo),
        this.#leastSquaresOf.right.#valueKey(memo),
      ];
    }

    if (parts == null && this.#outerOf != null) {
      parts = [
        "outer",
        this.rows,
        this.cols,
        this.#outerOf.left.#valueKey(memo),
        this.#outerOf.right.#valueKey(memo),
      ];
    }

    if (parts == null && this.#diagonalOf != null) {
      parts = [
        "diagonal",
        this.rows,
        this.cols,
        this.#diagonalOf.#valueKey(memo),
      ];
    }

    if (parts == null && this.#base != null) {
      parts = [
        "affine",
        this.rows,
        this.cols,
        this.#base.#valueKey(memo),
        this.#affineScale,
        this.#affineBias,
      ];
    }

    if (parts == null) return null;
    const key = this.#runtime.internStructuralKey(parts);
    memo.set(this, key);
    return key;
  }

  #getCachedReduction(key) {
    const cached = this.#reductionCache.get(key);
    const dependencyKey = this.#materializationCacheKey() ??
      this.#identityKey();
    if (
      cached == null || cached.version !== this.#version ||
      cached.dependencyKey !== dependencyKey
    ) {
      this.#reductionCache.delete(key);
      const shared = this.#runtime.getCachedScalar(
        `${key}:${dependencyKey}`,
      );
      if (shared === undefined) return null;
      this.#reductionCache.set(key, {
        version: this.#version,
        dependencyKey,
        value: shared,
      });
      return shared;
    }
    return cached.value;
  }

  #setCachedReduction(key, value) {
    const dependencyKey = this.#materializationCacheKey() ??
      this.#identityKey();
    this.#reductionCache.set(key, {
      version: this.#version,
      dependencyKey,
      value,
    });
    this.#runtime.putCachedScalar(`${key}:${dependencyKey}`, value);
  }

  #cachedReduction(key, compute) {
    const cached = this.#getCachedReduction(key);
    if (cached != null) return cached;

    const value = compute();
    this.#setCachedReduction(key, value);
    return value;
  }

  #computeExpressionStats(requested) {
    if (this.#getCachedReduction(requested) != null) return;
    const statsMask = requested === "sum" ? 1 : 14;

    let call;
    if (this.#hasNestedElementwiseDag()) {
      const compiled = this.#compileExpressionDag();
      call = (outPtr) =>
        this.#runtime.call(
          "fusedElementwiseDagStats",
          this.rows,
          this.cols,
          compiled.programPtr,
          compiled.trackCount,
          compiled.trackResultsPtr,
          compiled.resultTrack,
          statsMask,
          outPtr,
        );
    } else {
      const affine = this.#affineExpressionInfo();
      let base = this.#expr.base;
      let ops = Matrix.#expressionOps(this.#expr);
      if (affine != null) {
        base = affine.base;
        ops = [
          {
            code: EW_MULTIPLY_SCALAR,
            scalarA: affine.scale,
            scalarB: 0,
          },
          { code: EW_ADD_SCALAR, scalarA: affine.bias, scalarB: 0 },
        ];
      }
      const metadata = this.#compileElementwiseMetadata(base, ops);
      call = (outPtr) =>
        this.#runtime.call(
          "fusedElementwiseStats",
          metadata.basePtr,
          this.rows,
          this.cols,
          metadata.opcodesPtr,
          metadata.scalarAPtr,
          metadata.scalarBPtr,
          metadata.operandPtrsPtr,
          metadata.operandModesPtr,
          metadata.opCount,
          statsMask,
          outPtr,
        );
    }

    const outPtr = this.#runtime.f64Scratch(4);
    call(outPtr);
    const start = outPtr >>> 3;
    const values = this.#runtime.f64.slice(start, start + 4);
    if ((statsMask & 1) !== 0) this.#setCachedReduction("sum", values[0]);
    if ((statsMask & 2) !== 0) this.#setCachedReduction("min", values[1]);
    if ((statsMask & 4) !== 0) this.#setCachedReduction("max", values[2]);
    if ((statsMask & 8) !== 0) {
      this.#setCachedReduction("frobenius", values[3]);
    }
  }

  #computeExpressionTrace() {
    const cached = this.#getCachedReduction("trace");
    if (cached != null) return cached;

    let value;
    if (this.#hasNestedElementwiseDag()) {
      const compiled = this.#compileExpressionDag();
      value = this.#runtime.call(
        "fusedElementwiseDagTrace",
        this.rows,
        this.cols,
        compiled.programPtr,
        compiled.trackCount,
        compiled.trackResultsPtr,
        compiled.resultTrack,
      );
    } else {
      const affine = this.#affineExpressionInfo();
      let base = this.#expr.base;
      let ops = Matrix.#expressionOps(this.#expr);
      if (affine != null) {
        base = affine.base;
        ops = [
          {
            code: EW_MULTIPLY_SCALAR,
            scalarA: affine.scale,
            scalarB: 0,
          },
          { code: EW_ADD_SCALAR, scalarA: affine.bias, scalarB: 0 },
        ];
      }
      const metadata = this.#compileElementwiseMetadata(base, ops);
      value = this.#runtime.call(
        "fusedElementwiseTrace",
        metadata.basePtr,
        this.rows,
        this.cols,
        metadata.opcodesPtr,
        metadata.scalarAPtr,
        metadata.scalarBPtr,
        metadata.operandPtrsPtr,
        metadata.operandModesPtr,
        metadata.opCount,
      );
    }
    this.#setCachedReduction("trace", value);
    return value;
  }

  static #arraysEqualApprox(left, right, epsilon) {
    for (let i = 0; i < left.length; i++) {
      if (Math.abs(left[i] - right[i]) > epsilon) return false;
    }
    return true;
  }

  #equalsMaterializedToLocal(local, epsilon) {
    const ptr = this.#materializedPtr();
    const memory = this.#runtime.f32;
    const start = ptr >>> 2;
    for (let i = 0; i < this.length; i++) {
      if (Math.abs(memory[start + i] - local[i]) > epsilon) return false;
    }
    return true;
  }

  #addCacheEntry(entry) {
    this.#cacheEntries.add(entry);
    cacheFinalizer?.register(this, entry, entry);
    return entry;
  }

  #releaseCacheEntry(entry) {
    /* c8 ignore next 5 */
    if (entry == null) return;
    cacheFinalizer?.unregister(entry);
    this.#cacheEntries.delete(entry);
    entry.dispose();
  }

  #cacheEntryAlive(entry) {
    return entry != null && !entry.disposed &&
      this.#runtime.touchCacheEntry(entry);
  }

  #clearComputedCaches() {
    /* c8 ignore next 4 */
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
      this.#choleskyCache != null &&
      this.#choleskyCache.version === this.#version &&
      this.#cacheEntryAlive(this.#choleskyCache.entry)
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
      ok = this.#runtime.call(
        "choleskyFactor",
        this.#materializedPtr(),
        this.rows,
        lowerPtr,
      );
      /* c8 ignore next 4 */
    } catch (error) {
      this.#runtime.free(lowerPtr);
      throw error;
    }

    if (ok !== 1) {
      /* c8 ignore next 3 */
      this.#runtime.free(lowerPtr);
      return null;
    }

    const runtime = this.#runtime;
    const entry = this.#addCacheEntry(
      runtime.registerCacheEntry(this.length * 8, () => runtime.free(lowerPtr)),
    );
    this.#choleskyCache = {
      version: this.#version,
      lowerPtr,
      entry,
    };
    return this.#choleskyCache;
  }

  #qrFactor() {
    if (
      this.#qrCache != null &&
      this.#qrCache.version === this.#version &&
      this.#cacheEntryAlive(this.#qrCache.entry)
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
      this.#runtime.call(
        "qrFactor",
        this.#materializedPtr(),
        this.rows,
        this.cols,
        qPtr,
        rPtr,
      );
      /* c8 ignore next 5 */
    } catch (error) {
      this.#runtime.free(qPtr);
      this.#runtime.free(rPtr);
      throw error;
    }

    const runtime = this.#runtime;
    const entry = this.#addCacheEntry(
      runtime.registerCacheEntry((qLength + rLength) * 8, () => {
        runtime.free(qPtr);
        runtime.free(rPtr);
      }),
    );
    this.#qrCache = {
      version: this.#version,
      qPtr,
      rPtr,
      entry,
    };
    return this.#qrCache;
  }

  /* c8 ignore start */
  #packedMatmulPtr() {
    if (
      this.#packedCache != null &&
      this.#packedCache.version === this.#version &&
      this.#cacheEntryAlive(this.#packedCache.entry)
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
      this.#runtime.call(
        "packForMatmul",
        this.#materializedPtr(),
        ptr,
        this.rows,
        this.cols,
      );
      /* c8 ignore next 4 */
    } catch (error) {
      this.#runtime.free(ptr);
      throw error;
    }

    const runtime = this.#runtime;
    const entry = this.#addCacheEntry(
      runtime.registerCacheEntry(this.length * 4, () => runtime.free(ptr)),
    );
    this.#packedCache = {
      version: this.#version,
      ptr,
      entry,
    };
    return ptr;
  }
  /* c8 ignore stop */

  #transposeCachePtr() {
    if (
      this.#transposeCache != null &&
      this.#transposeCache.version === this.#version &&
      this.#cacheEntryAlive(this.#transposeCache.entry)
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
      this.#runtime.call(
        "transpose",
        this.#materializedPtr(),
        ptr,
        this.rows,
        this.cols,
      );
      /* c8 ignore next 4 */
    } catch (error) {
      this.#runtime.free(ptr);
      throw error;
    }

    const runtime = this.#runtime;
    const entry = this.#addCacheEntry(
      runtime.registerCacheEntry(this.length * 4, () => runtime.free(ptr)),
    );
    this.#transposeCache = {
      version: this.#version,
      ptr,
      entry,
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

    if (this.rows === other.rows && this.cols === other.cols) {
      return OPERAND_FULL;
    }
    if (other.rows === 1 && other.cols === this.cols) return OPERAND_ROW;
    if (other.rows === this.rows && other.cols === 1) return OPERAND_COLUMN;
    /* c8 ignore next */
    /* c8 ignore next 2 */
    return null;
  }

  #elementwise(other, code) {
    const mode = this.#broadcastModeFor(other);
    const commutative = code === EW_ADD || code === EW_MULTIPLY ||
      code === EW_MIN || code === EW_MAX;

    if (mode == null) {
      if (commutative && other.#broadcastModeFor(this) !== null) {
        return other.#elementwise(this, code);
      }
      throw new RangeError(
        `shape mismatch: ${this.rows}x${this.cols} cannot broadcast with ${other.rows}x${other.cols}`,
      );
    }

    const leftConstant = this.#constantValue();
    const rightConstant = other.#constantValue();
    if (leftConstant != null && rightConstant != null) {
      let value;
      if (code === EW_ADD) value = leftConstant + rightConstant;
      else if (code === EW_SUBTRACT) value = leftConstant - rightConstant;
      else if (code === EW_MULTIPLY) value = leftConstant * rightConstant;
      else if (code === EW_DIVIDE) value = leftConstant / rightConstant;
      else if (code === EW_MIN) value = Math.min(leftConstant, rightConstant);
      else value = Math.max(leftConstant, rightConstant);
      return Matrix.#constant(
        this.rows,
        this.cols,
        Math.fround(value),
        this.#runtime,
      );
    }

    if (mode === OPERAND_FULL) {
      if (code === EW_ADD && this.#structure === "zero") {
        return Matrix.#view(other);
      }
      if (code === EW_ADD && other.#structure === "zero") {
        return Matrix.#view(this);
      }
      if (code === EW_SUBTRACT && this === other) {
        return Matrix.#constant(this.rows, this.cols, 0, this.#runtime);
      }
      if (code === EW_SUBTRACT && other.#structure === "zero") {
        return Matrix.#view(this);
      }
      if (
        code === EW_MULTIPLY &&
        (this.#structure === "zero" || other.#structure === "zero")
      ) {
        return Matrix.#constant(this.rows, this.cols, 0, this.#runtime);
      }
      if (code === EW_MULTIPLY && other.#structure === "ones") {
        return Matrix.#view(this);
      }
      if (code === EW_MULTIPLY && this.#structure === "ones") {
        return Matrix.#view(other);
      }
      if (
        (code === EW_ADD || code === EW_SUBTRACT ||
          code === EW_MULTIPLY) &&
        this.#structure === "diagonal" && other.#structure === "diagonal"
      ) {
        const leftDiagonal = this.#diagonalVectorSource();
        const rightDiagonal = other.#diagonalVectorSource();
        if (leftDiagonal != null && rightDiagonal != null) {
          const diagonal = code === EW_ADD
            ? leftDiagonal.add(rightDiagonal)
            : code === EW_SUBTRACT
            ? leftDiagonal.subtract(rightDiagonal)
            : leftDiagonal.hadamard(rightDiagonal);
          return new Matrix(this.rows, this.cols, null, {
            runtime: this.#runtime,
            diagonalOf: diagonal,
            diagonalTemporary: true,
            structure: "diagonal",
          });
        }
      }
      if (
        code === EW_DIVIDE && optimizationOptions.fastMath && this === other
      ) return Matrix.#constant(this.rows, this.cols, 1, this.#runtime);

      const rewrite = this.#tryMatmulElementwiseRewrite(other, code);
      if (rewrite != null) return rewrite;
    } else if (code === EW_MULTIPLY && other.#structure === "ones") {
      return Matrix.#view(this);
    } else if (
      (code === EW_ADD || code === EW_SUBTRACT) && other.#structure === "zero"
    ) {
      return Matrix.#view(this);
    }

    return Matrix.#exprView(this, {
      code,
      other,
      operandMode: mode,
      scalarA: 0,
      scalarB: 0,
    });
  }

  #tryMatmulElementwiseRewrite(other, code) {
    if (code !== EW_ADD && code !== EW_SUBTRACT) return null;

    const left = this.#matmulOf;
    const right = other.#matmulOf;
    if (left == null || right == null) return null;

    if (Matrix.#sameMatmul(left, right)) {
      return code === EW_ADD
        ? this.scale(2)
        : Matrix.#constant(this.rows, this.cols, 0, this.#runtime);
    }

    if (this.#ptr !== 0 || other.#ptr !== 0) return null;

    if (
      left.gram != null || right.gram != null || left.variant !== MATMUL_NN ||
      right.variant !== MATMUL_NN
    ) {
      return null;
    }

    const m = this.rows;
    const k = left.left.cols;
    const n = this.cols;
    const gemmCost = m * k * n;

    if (
      left.left === right.left &&
      left.right.rows === right.right.rows &&
      left.right.cols === right.right.cols &&
      Matrix.#shouldDistributeMatmul(gemmCost, left.right.length)
    ) {
      const combined = code === EW_ADD
        ? left.right.add(right.right)
        : left.right.subtract(right.right);
      return left.left.matmul(combined);
    }

    if (
      left.right === right.right &&
      left.left.rows === right.left.rows &&
      left.left.cols === right.left.cols &&
      Matrix.#shouldDistributeMatmul(gemmCost, left.left.length)
    ) {
      const combined = code === EW_ADD
        ? left.left.add(right.left)
        : left.left.subtract(right.left);
      return combined.matmul(left.right);
    }
    /* c8 ignore start */
    return null;
  }
  /* c8 ignore stop */

  #matmulInput() {
    if (
      this.#ptr === 0 &&
      this.#transposeOf != null &&
      this.#base == null &&
      this.#inverseOf == null &&
      this.#matmulOf == null &&
      this.#solveOf == null
    ) {
      return { source: this.#transposeOf, transposed: true };
    }

    return { source: this, transposed: false };
  }

  #scalarFactorInfo() {
    if (this.#expr == null) return null;

    let factor = 1;
    for (const op of Matrix.#expressionOps(this.#expr)) {
      if (op.code === EW_AFFINE && op.scalarB === 0) {
        factor *= op.scalarA;
      } else {
        return null;
      }
    }

    if (factor === 1) return null;
    return {
      matrix: this.#expr.base,
      factor,
    };
  }

  #affineExpressionInfo() {
    if (this.#expr == null) return null;

    let scale = 1;
    let bias = 0;
    for (const op of Matrix.#expressionOps(this.#expr)) {
      if (op.code === EW_AFFINE) {
        scale *= op.scalarA;
        bias = bias * op.scalarA + op.scalarB;
      } else {
        return null;
      }
    }

    return {
      base: this.#expr.base,
      scale,
      bias,
    };
  }

  #affineMatmulInfo() {
    const affine = this.#affineExpressionInfo();
    if (
      affine == null || affine.base.#ptr !== 0 ||
      affine.base.#matmulOf == null ||
      affine.base.#matmulOf.variant !== MATMUL_NN ||
      affine.base.#matmulOf.gram != null
    ) return null;
    return { ...affine, matmul: affine.base.#matmulOf };
  }

  #matmulScalarRewrite(other) {
    let left = this;
    let right = other;
    let factor = 1;
    const outputCost = this.rows * other.cols;

    const leftFactor = this.#scalarFactorInfo();
    if (
      leftFactor != null &&
      (outputCost <= this.length ||
        leftFactor.matrix.#structure === "ones" ||
        leftFactor.matrix.#structure === "diagonal" ||
        leftFactor.matrix.#structure === "identity" ||
        leftFactor.matrix.#structure === "zero")
    ) {
      left = leftFactor.matrix;
      factor *= leftFactor.factor;
    }

    const rightFactor = other.#scalarFactorInfo();
    if (
      rightFactor != null &&
      (outputCost <= other.length ||
        rightFactor.matrix.#structure === "ones" ||
        rightFactor.matrix.#structure === "diagonal" ||
        rightFactor.matrix.#structure === "identity" ||
        rightFactor.matrix.#structure === "zero")
    ) {
      right = rightFactor.matrix;
      factor *= rightFactor.factor;
    }

    if (left === this && right === other) return null;
    /* c8 ignore next 3 -- zero-scaled matrices exit through structure folding */
    if (factor === 0) {
      return Matrix.#constant(this.rows, other.cols, 0, this.#runtime);
    }

    const product = left.matmul(right);
    return factor === 1 ? product : product.scale(factor);
  }

  #diagonalVectorSource() {
    if (
      this.#ptr === 0 &&
      this.#diagonalOf != null &&
      this.#base == null &&
      this.#inverseOf == null &&
      this.#transposeOf == null &&
      this.#expr == null &&
      this.#matmulOf == null &&
      this.#solveOf == null &&
      this.#leastSquaresOf == null &&
      this.#outerOf == null
    ) {
      return this.#diagonalOf;
    }

    return null;
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

  /* c8 ignore start */
  #materializeLocal(ptr) {
    if (this.#literalData != null) {
      this.#runtime.writeInto(ptr, this.#literalData);
      this.#literalData = null;
      return true;
    }

    if (this.#literalFill != null) {
      this.#runtime.f32.fill(
        this.#literalFill,
        ptr >>> 2,
        (ptr >>> 2) + this.length,
      );
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
  /* c8 ignore stop */

  #hasLocalBacking() {
    return this.#literalData != null || this.#literalFill != null ||
      this.#literalIdentity;
  }

  #writeLocalBacking(ptr, consume) {
    if (this.#literalData != null) {
      this.#runtime.writeInto(ptr, this.#literalData);
      if (consume) this.#literalData = null;
      return true;
    }

    if (this.#literalFill != null) {
      this.#runtime.f32.fill(
        this.#literalFill,
        ptr >>> 2,
        (ptr >>> 2) + this.length,
      );
      if (consume) this.#literalFill = null;
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
      if (consume) this.#literalIdentity = false;
      return true;
    }
    /* c8 ignore start */
    return false;
  }
  /* c8 ignore stop */

  #collectBatchMaterialization(nodes, seen) {
    if (this.#ptr) return true;
    if (seen.has(this)) return true;
    seen.add(this);

    if (this.#hasLocalBacking()) {
      nodes.push(this);
      return true;
    }

    const affineMatmul = this.#affineMatmulInfo();
    if (affineMatmul != null) {
      const { left, right } = affineMatmul.matmul;
      left.#assertAlive();
      right.#assertAlive();
      this.#assertSameRuntime(left);
      this.#assertSameRuntime(right);
      if (!left.#collectBatchMaterialization(nodes, seen)) return false;
      if (!right.#collectBatchMaterialization(nodes, seen)) return false;
      nodes.push(this);
      return true;
    }

    const affineExpression = this.#affineExpressionInfo();
    if (affineExpression != null) {
      affineExpression.base.#assertAlive();
      this.#assertSameRuntime(affineExpression.base);
      if (!affineExpression.base.#collectBatchMaterialization(nodes, seen)) {
        return false;
      }
      nodes.push(this);
      return true;
    }

    if (this.#base != null) {
      this.#base.#assertAlive();
      this.#assertSameRuntime(this.#base);
      if (!this.#base.#collectBatchMaterialization(nodes, seen)) return false;
      nodes.push(this);
      return true;
    }

    if (this.#inverseOf != null && this.#inverseOf.#structure === "diagonal") {
      this.#inverseOf.#assertAlive();
      this.#assertSameRuntime(this.#inverseOf);
      /* c8 ignore next 3 */
      if (!this.#inverseOf.#collectBatchMaterialization(nodes, seen)) {
        return false;
      }
      nodes.push(this);
      return true;
    }

    if (this.#outerOf != null) {
      const { left, right } = this.#outerOf;
      left.#assertAlive();
      right.#assertAlive();
      this.#assertSameRuntime(left);
      this.#assertSameRuntime(right);
      if (!left.#collectBatchMaterialization(nodes, seen)) return false;
      if (!right.#collectBatchMaterialization(nodes, seen)) return false;
      nodes.push(this);
      return true;
    }

    if (this.#diagonalOf != null) {
      this.#diagonalOf.#assertAlive();
      this.#assertSameRuntime(this.#diagonalOf);
      /* c8 ignore next 3 */
      if (!this.#diagonalOf.#collectBatchMaterialization(nodes, seen)) {
        return false;
      }
      nodes.push(this);
      return true;
    }

    if (this.#matmulOf != null) {
      const { left, right, gram } = this.#matmulOf;
      if (gram != null) return false;
      left.#assertAlive();
      right.#assertAlive();
      this.#assertSameRuntime(left);
      this.#assertSameRuntime(right);
      if (this.#matmulOf.variant === MATMUL_NN) {
        if (left.#structure === "ones") {
          if (!right.#collectBatchMaterialization(nodes, seen)) return false;
          nodes.push(this);
          return true;
        }
        if (right.#structure === "ones") {
          if (!left.#collectBatchMaterialization(nodes, seen)) return false;
          nodes.push(this);
          return true;
        }
        const leftDiagonal = left.#diagonalVectorSource();
        if (leftDiagonal != null) {
          leftDiagonal.#assertAlive();
          this.#assertSameRuntime(leftDiagonal);
          /* c8 ignore next 3 */
          if (!leftDiagonal.#collectBatchMaterialization(nodes, seen)) {
            return false;
          }
          if (!right.#collectBatchMaterialization(nodes, seen)) return false;
          nodes.push(this);
          return true;
        }

        const rightDiagonal = right.#diagonalVectorSource();
        if (rightDiagonal != null) {
          rightDiagonal.#assertAlive();
          this.#assertSameRuntime(rightDiagonal);
          if (!left.#collectBatchMaterialization(nodes, seen)) return false;
          /* c8 ignore next 3 */
          if (!rightDiagonal.#collectBatchMaterialization(nodes, seen)) {
            return false;
          }
          nodes.push(this);
          return true;
        }

        const cost = left.rows * left.cols * right.cols;
        if (cost >= PACKED_MATMUL_MIN_COST) {
          return false;
        }
      }
      if (!left.#collectBatchMaterialization(nodes, seen)) return false;
      if (!right.#collectBatchMaterialization(nodes, seen)) return false;
      nodes.push(this);
      return true;
    }

    if (this.#solveOf != null) {
      const { left, right } = this.#solveOf;
      left.#assertSquare("solve");
      right.#assertAlive();
      left.#assertSameRuntime(right);
      /* c8 ignore start */
      if (right.rows !== left.rows) {
        throw new RangeError(
          `right-hand side rows ${right.rows} must match ${left.rows}`,
        );
      }
      /* c8 ignore stop */
      if (
        left.#structure === "diagonal" ||
        left.rows >= FACTOR_CACHE_SOLVE_MIN_SIZE
      ) {
        return false;
      }
      if (!left.#collectBatchMaterialization(nodes, seen)) return false;
      if (!right.#collectBatchMaterialization(nodes, seen)) return false;
      nodes.push(this);
      return true;
    }

    if (this.#transposeOf != null) {
      this.#transposeOf.#assertAlive();
      this.#assertSameRuntime(this.#transposeOf);
      if (!this.#transposeOf.#collectBatchMaterialization(nodes, seen)) {
        return false;
      }
      nodes.push(this);
      return true;
    }

    return false;
  }

  #batchDependencies() {
    const affineMatmul = this.#affineMatmulInfo();
    if (affineMatmul != null) {
      return [affineMatmul.matmul.left, affineMatmul.matmul.right];
    }
    const affine = this.#affineExpressionInfo();
    if (affine != null) return [affine.base];
    if (this.#base != null) return [this.#base];
    if (this.#inverseOf != null) return [this.#inverseOf];
    if (this.#outerOf != null) {
      return [this.#outerOf.left, this.#outerOf.right];
    }
    if (this.#diagonalOf != null) return [this.#diagonalOf];
    if (this.#matmulOf != null) {
      const { left, right, variant } = this.#matmulOf;
      if (variant === MATMUL_NN && left.#structure === "ones") return [right];
      if (variant === MATMUL_NN && right.#structure === "ones") return [left];
      const leftDiagonal = left.#diagonalVectorSource();
      if (variant === MATMUL_NN && leftDiagonal != null) {
        return [leftDiagonal, right];
      }
      const rightDiagonal = right.#diagonalVectorSource();
      if (variant === MATMUL_NN && rightDiagonal != null) {
        return [left, rightDiagonal];
      }
      return [left, right];
    }
    if (this.#solveOf != null) {
      return [this.#solveOf.left, this.#solveOf.right];
    }
    if (this.#transposeOf != null) return [this.#transposeOf];
    return [];
  }

  #batchInstructionFor(ptrOf) {
    const affineMatmul = this.#affineMatmulInfo();
    if (affineMatmul != null) {
      const { left, right } = affineMatmul.matmul;
      return [
        BATCH_OP_MATMUL_AFFINE,
        ptrOf(left),
        ptrOf(right),
        ptrOf(this),
        left.rows,
        left.cols,
        right.cols,
        f32Bits(affineMatmul.scale),
        f32Bits(affineMatmul.bias),
      ];
    }

    const affineExpression = this.#affineExpressionInfo();
    if (affineExpression != null) {
      return [
        BATCH_OP_AFFINE,
        ptrOf(affineExpression.base),
        ptrOf(this),
        this.length,
        f32Bits(affineExpression.scale),
        f32Bits(affineExpression.bias),
      ];
    }

    if (this.#base != null) {
      return [
        BATCH_OP_AFFINE,
        ptrOf(this.#base),
        ptrOf(this),
        this.length,
        f32Bits(this.#affineScale),
        f32Bits(this.#affineBias),
      ];
    }

    if (this.#inverseOf != null && this.#inverseOf.#structure === "diagonal") {
      return [
        BATCH_OP_INVERT_DIAGONAL,
        ptrOf(this.#inverseOf),
        ptrOf(this),
        this.rows,
      ];
    }

    if (this.#outerOf != null) {
      const { left, right } = this.#outerOf;
      return [
        BATCH_OP_OUTER,
        ptrOf(left),
        ptrOf(right),
        ptrOf(this),
        left.length,
        right.length,
      ];
    }

    if (this.#diagonalOf != null) {
      return [
        BATCH_OP_DIAGONAL_MATRIX,
        ptrOf(this.#diagonalOf),
        ptrOf(this),
        this.#diagonalOf.length,
      ];
    }

    if (this.#matmulOf != null) {
      const { left, right, variant } = this.#matmulOf;
      if (variant === MATMUL_NN) {
        if (left.#structure === "ones") {
          return [
            BATCH_OP_ONES_LEFT_MATMUL,
            ptrOf(right),
            ptrOf(this),
            this.rows,
            left.cols,
            this.cols,
          ];
        }
        if (right.#structure === "ones") {
          return [
            BATCH_OP_ONES_RIGHT_MATMUL,
            ptrOf(left),
            ptrOf(this),
            this.rows,
            left.cols,
            this.cols,
          ];
        }
        const leftDiagonal = left.#diagonalVectorSource();
        if (leftDiagonal != null) {
          return [
            BATCH_OP_SCALE_ROWS_BY_VECTOR,
            ptrOf(leftDiagonal),
            ptrOf(right),
            ptrOf(this),
            right.rows,
            right.cols,
          ];
        }

        const rightDiagonal = right.#diagonalVectorSource();
        if (rightDiagonal != null) {
          return [
            BATCH_OP_SCALE_COLS_BY_VECTOR,
            ptrOf(left),
            ptrOf(rightDiagonal),
            ptrOf(this),
            left.rows,
            left.cols,
          ];
        }
      }

      if (variant === MATMUL_TN) {
        return [
          BATCH_OP_MATMUL_TN,
          ptrOf(left),
          ptrOf(right),
          ptrOf(this),
          left.rows,
          left.cols,
          right.cols,
        ];
      }
      if (variant === MATMUL_NT) {
        return [
          BATCH_OP_MATMUL_NT,
          ptrOf(left),
          ptrOf(right),
          ptrOf(this),
          left.rows,
          left.cols,
          right.rows,
        ];
      }
      if (variant === MATMUL_TT) {
        return [
          BATCH_OP_MATMUL_TT,
          ptrOf(left),
          ptrOf(right),
          ptrOf(this),
          left.rows,
          left.cols,
          right.rows,
        ];
      }
      return [
        BATCH_OP_MATMUL,
        ptrOf(left),
        ptrOf(right),
        ptrOf(this),
        left.rows,
        left.cols,
        right.cols,
      ];
    }

    if (this.#solveOf != null) {
      const { left, right } = this.#solveOf;
      return [
        BATCH_OP_SOLVE,
        ptrOf(left),
        ptrOf(right),
        ptrOf(this),
        left.rows,
        right.cols,
      ];
    }

    if (this.#transposeOf != null) {
      return [
        BATCH_OP_TRANSPOSE,
        ptrOf(this.#transposeOf),
        ptrOf(this),
        this.#transposeOf.rows,
        this.#transposeOf.cols,
      ];
    }

    return null;
  }

  #tryMaterializeBatch(cacheKey) {
    if (this.#ptr) return this.#ptr;

    let nodes = [];
    if (!this.#collectBatchMaterialization(nodes, new Set())) return 0;
    if (nodes.length === 0) return 0;

    // Persist literal dependencies once instead of copying them into every
    // result slab. This also prevents the result from retaining input-sized
    // regions after batch execution has finished.
    for (const node of nodes) {
      if (node !== this && !node.#ptr && node.#hasLocalBacking()) {
        node.#materializedPtr();
      }
    }

    // Merge separately-created but structurally identical subgraphs. The
    // elementwise DAG compiler already performs this CSE; batch algebra needs
    // the same treatment to avoid duplicate matrix products and transposes.
    const aliases = new Map();
    const structuralNodes = new Map();
    const structuralKeyMemo = new Map();
    const uniqueNodes = [];
    for (const node of nodes) {
      if (node !== this && !node.#ptr && !node.#hasLocalBacking()) {
        const key = node.#materializationCacheKey(structuralKeyMemo);
        const existing = key == null ? null : structuralNodes.get(key);
        if (existing != null) {
          aliases.set(node, existing);
          continue;
        }
        if (key != null) structuralNodes.set(key, node);
      }
      uniqueNodes.push(node);
    }
    nodes = uniqueNodes;
    const canonicalNode = (node) => aliases.get(node) ?? node;

    const offsets = new Map();
    offsets.set(this, 0);
    let totalLength = this.length;

    // Keep only simultaneously-live intermediates in the slab. The result owns
    // offset zero; all other regions are recycled after their final consumer.
    const positions = new Map();
    for (let i = 0; i < nodes.length; i++) positions.set(nodes[i], i);
    const lastUse = new Map();
    for (let i = 0; i < nodes.length; i++) {
      for (const dependency of nodes[i].#batchDependencies()) {
        const canonical = canonicalNode(dependency);
        if (positions.has(canonical)) {
          lastUse.set(
            canonical,
            Math.max(lastUse.get(canonical) ?? -1, i),
          );
        }
      }
    }

    const active = [];
    const freeRegions = new FreeRegionAllocator();
    const pushActive = (region) => {
      active.push(region);
      let index = active.length - 1;
      while (index > 0) {
        const parent = (index - 1) >> 1;
        if (active[parent].end <= region.end) break;
        /* c8 ignore next 3 -- heap tie ordering is allocation-only behavior */
        active[index] = active[parent];
        index = parent;
      }
      active[index] = region;
    };
    const popActive = () => {
      const first = active[0];
      const last = active.pop();
      if (active.length > 0) {
        let index = 0;
        while (true) {
          let child = index * 2 + 1;
          if (child >= active.length) break;
          /* c8 ignore next 4 -- either child yields the same live-range order */
          if (
            child + 1 < active.length &&
            active[child + 1].end < active[child].end
          ) child++;
          if (active[child].end >= last.end) break;
          active[index] = active[child];
          index = child;
        }
        active[index] = last;
      }
      return first;
    };
    const releaseBefore = (index) => {
      while (active.length > 0 && active[0].end < index) {
        const region = popActive();
        freeRegions.release(region.offset, region.length);
      }
    };

    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index];
      releaseBefore(index);
      if (node === this || node.#ptr || node.#hasLocalBacking()) continue;

      let offset = freeRegions.take(node.length);
      if (offset < 0) {
        offset = totalLength;
        totalLength += node.length;
      }
      offsets.set(node, offset);
      pushActive({
        offset,
        length: node.length,
        end: lastUse.get(node) ?? index,
      });
    }

    const slabPtr = this.#runtime.alloc(totalLength);
    const ptrOf = (matrix) => {
      matrix = canonicalNode(matrix);
      if (matrix.#ptr) return matrix.#ptr;
      const offset = offsets.get(matrix);
      return slabPtr + (offset << 2);
    };

    try {
      for (const node of nodes) {
        if (!node.#ptr && node.#hasLocalBacking()) {
          node.#writeLocalBacking(ptrOf(node), node === this);
        }
      }

      const instructions = [];
      for (const node of nodes) {
        if (node.#ptr || node.#hasLocalBacking()) continue;
        const instruction = node.#batchInstructionFor(ptrOf);
        if (instruction != null) instructions.push(instruction);
      }

      if (instructions.length > 0) {
        const ok = this.#runtime.executeBatch(instructions);
        if (ok !== 1) {
          throw new RangeError(
            ok === 0 ? "matrix is singular" : `wasmatrix batch failed: ${ok}`,
          );
        }
      }
    } catch (error) {
      this.#runtime.free(slabPtr);
      throw error;
    }

    this.#ptr = slabPtr;
    this.#owns = true;
    matrixFinalizer?.register(
      this,
      { runtime: this.#runtime, ptr: this.#ptr },
      this,
    );
    if (this.#solveOf?.temporaryRight) {
      this.#solveOf.right.dispose();
    }
    if (this.#diagonalTemporary) {
      this.#diagonalOf.dispose();
      this.#diagonalOf = null;
      this.#diagonalTemporary = false;
    }
    if (cacheKey != null) {
      this.#runtime.putCachedBuffer(cacheKey, this.#ptr, this.length);
    }
    return this.#ptr;
  }

  #compileElementwiseMetadata(base, ops) {
    base.#assertAlive();
    this.#assertSameRuntime(base);
    const basePtr = base.#materializedPtr();
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

    const fieldLength = ops.length;
    const metadataPtr = this.#runtime.i32Scratch(fieldLength * 5);
    const opcodesPtr = metadataPtr;
    const scalarAPtr = opcodesPtr + (fieldLength << 2);
    const scalarBPtr = scalarAPtr + (fieldLength << 2);
    const operandPtrsPtr = scalarBPtr + (fieldLength << 2);
    const operandModesPtr = operandPtrsPtr + (fieldLength << 2);

    this.#runtime.i32.set(opcodes, opcodesPtr >>> 2);
    this.#runtime.f32.set(scalarA, scalarAPtr >>> 2);
    this.#runtime.f32.set(scalarB, scalarBPtr >>> 2);
    this.#runtime.i32.set(operandPtrs, operandPtrsPtr >>> 2);
    this.#runtime.i32.set(operandModes, operandModesPtr >>> 2);

    return {
      basePtr,
      opcodesPtr,
      scalarAPtr,
      scalarBPtr,
      operandPtrsPtr,
      operandModesPtr,
      opCount: ops.length,
    };
  }

  #materializeExpression(ptr) {
    if (this.#hasNestedElementwiseDag()) {
      this.#materializeExpressionDag(ptr);
      return;
    }

    const base = this.#expr.base;
    const ops = Matrix.#expressionOps(this.#expr);
    const affine = this.#affineExpressionInfo();

    if (affine != null) {
      this.#runtime.call(
        "affine",
        affine.base.#materializedPtr(),
        ptr,
        this.length,
        affine.scale,
        affine.bias,
      );
      return;
    }

    const metadata = this.#compileElementwiseMetadata(base, ops);

    this.#runtime.call(
      "fusedElementwise",
      metadata.basePtr,
      ptr,
      this.rows,
      this.cols,
      metadata.opcodesPtr,
      metadata.scalarAPtr,
      metadata.scalarBPtr,
      metadata.operandPtrsPtr,
      metadata.operandModesPtr,
      metadata.opCount,
    );
  }

  #hasNestedElementwiseDag() {
    if (this.#expr == null) return false;
    if (this.#expr.base.#ptr === 0 && this.#expr.base.#base != null) {
      return true;
    }
    return Matrix.#expressionOps(this.#expr).some((op) =>
      op.other != null && op.other.#ptr === 0 &&
      (op.other.#expr != null || op.other.#base != null)
    );
  }

  #dagOperandMode(matrix) {
    if (matrix.rows === this.rows && matrix.cols === this.cols) {
      return OPERAND_FULL;
    }
    if (matrix.rows === 1 && matrix.cols === 1) return OPERAND_SCALAR;
    if (matrix.rows === 1 && matrix.cols === this.cols) return OPERAND_ROW;
    if (matrix.rows === this.rows && matrix.cols === 1) return OPERAND_COLUMN;
    /* c8 ignore next 4 -- public elementwise shape checks reject this first */
    throw new RangeError(
      `DAG operand ${matrix.rows}x${matrix.cols} cannot broadcast to ${this.rows}x${this.cols}`,
    );
  }

  #compileExpressionDag() {
    const tracks = [];
    const trackIndexes = new Map();
    const structuralTrackIndexes = new Map();
    const structuralKeyMemo = new Map();

    const leafReference = (matrix) => ({
      kind: DAG_REF_LEAF,
      value: matrix.#materializedPtr(),
      mode: this.#dagOperandMode(matrix),
    });

    const reference = (matrix) => {
      matrix.#assertAlive();
      this.#assertSameRuntime(matrix);
      if (
        matrix.#ptr === 0 &&
        (matrix.#expr != null || matrix.#base != null)
      ) {
        return {
          kind: DAG_REF_TRACK,
          value: compileTrack(matrix),
          mode: OPERAND_FULL,
        };
      }
      return leafReference(matrix);
    };

    const compileTrack = (matrix) => {
      const cached = trackIndexes.get(matrix);
      if (cached != null) return cached;
      const structuralKey = matrix.#materializationCacheKey(structuralKeyMemo);
      if (structuralKey != null) {
        const structuralCached = structuralTrackIndexes.get(structuralKey);
        if (structuralCached != null) {
          trackIndexes.set(matrix, structuralCached);
          return structuralCached;
        }
      }

      let base;
      const ops = [];
      if (matrix.#expr != null) {
        base = reference(matrix.#expr.base);
        for (const op of Matrix.#expressionOps(matrix.#expr)) {
          if (op.other != null) {
            const other = reference(op.other);
            ops.push([
              op.code,
              other.kind,
              other.value,
              other.mode,
              0,
            ]);
          } else {
            ops.push([
              op.code,
              0,
              0,
              f32Bits(op.scalarA ?? 0),
              f32Bits(op.scalarB ?? 0),
            ]);
          }
        }
      } else {
        base = reference(matrix.#base);
        /* c8 ignore next 8 -- affine views are currently identity aliases */
        if (matrix.#affineScale !== 1) {
          ops.push([
            EW_MULTIPLY_SCALAR,
            0,
            0,
            f32Bits(matrix.#affineScale),
            0,
          ]);
        }
        /* c8 ignore next 8 -- affine views are currently identity aliases */
        if (matrix.#affineBias !== 0) {
          ops.push([
            EW_ADD_SCALAR,
            0,
            0,
            f32Bits(matrix.#affineBias),
            0,
          ]);
          /* c8 ignore next -- closes an unreachable non-identity affine view */
        }
      }

      const index = tracks.length;
      tracks.push({ base, ops });
      trackIndexes.set(matrix, index);
      if (structuralKey != null) {
        structuralTrackIndexes.set(structuralKey, index);
      }
      return index;
    };

    const resultTrack = compileTrack(this);
    const entries = [];
    for (const track of tracks) {
      entries.push([
        DAG_TRACK_HEADER,
        track.base.kind,
        track.base.value,
        track.base.mode,
        track.ops.length,
      ]);
      entries.push(...track.ops);
    }
    const program = new Int32Array(entries.length * DAG_ENTRY_I32_SLOTS);
    for (let index = 0; index < entries.length; index++) {
      program.set(entries[index], index * DAG_ENTRY_I32_SLOTS);
    }

    const trackResultI32Slots = tracks.length * 4;
    const scratchPtr = this.#runtime.i32Scratch(
      program.length + trackResultI32Slots,
    );
    this.#runtime.i32.set(program, scratchPtr >>> 2);
    const trackResultsPtr = scratchPtr + (program.length << 2);

    return {
      programPtr: scratchPtr,
      trackCount: tracks.length,
      trackResultsPtr,
      resultTrack,
    };
  }

  #materializeExpressionDag(ptr) {
    const compiled = this.#compileExpressionDag();
    this.#runtime.call(
      "fusedElementwiseDag",
      ptr,
      this.rows,
      this.cols,
      compiled.programPtr,
      compiled.trackCount,
      compiled.trackResultsPtr,
      compiled.resultTrack,
    );
  }

  /* c8 ignore start */
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
        right.cols,
      ]]);
    } else if (variant === MATMUL_NT) {
      this.#runtime.executeBatch([[
        BATCH_OP_MATMUL_NT,
        leftPtr,
        rightPtr,
        ptr,
        left.rows,
        left.cols,
        right.rows,
      ]]);
    } else if (variant === MATMUL_TT) {
      this.#runtime.executeBatch([[
        BATCH_OP_MATMUL_TT,
        leftPtr,
        rightPtr,
        ptr,
        left.rows,
        left.cols,
        right.rows,
      ]]);
    } else {
      const cost = left.rows * left.cols * right.cols;
      right.#rightMatmulUses++;
      if (
        (right.#packedCache != null || right.#rightMatmulUses > 1) &&
        cost >= PACKED_MATMUL_MIN_COST
      ) {
        this.#runtime.call(
          "matmulPackedB",
          leftPtr,
          right.#packedMatmulPtr(),
          ptr,
          left.rows,
          left.cols,
          right.cols,
        );
      } else {
        this.#runtime.executeBatch([[
          BATCH_OP_MATMUL,
          leftPtr,
          rightPtr,
          ptr,
          left.rows,
          left.cols,
          right.cols,
        ]]);
      }
    }
  }
  /* c8 ignore stop */

  /* c8 ignore start */
  #materializeSolve(ptr) {
    const solve = this.#solveOf;
    const { left, right, temporaryRight } = solve;
    left.#assertSquare("solve");
    right.#assertAlive();
    left.#assertSameRuntime(right);
    if (right.rows !== left.rows) {
      throw new RangeError(
        `right-hand side rows ${right.rows} must match ${left.rows}`,
      );
    }

    try {
      if (
        left.rows > 1 &&
        (left.#structure === "zero" || left.#structure === "ones" ||
          left.#structure === "constant" || left.#structure === "outer")
      ) {
        throw new RangeError("matrix is singular");
      }
      if (left.#structure === "diagonal") {
        const diagonalSource = left.#diagonalVectorSource();
        const ok = diagonalSource == null
          ? this.#runtime.call(
            "solveDiagonal",
            left.#materializedPtr(),
            right.#materializedPtr(),
            ptr,
            left.rows,
            right.cols,
          )
          : this.#runtime.call(
            "solveDiagonalVector",
            diagonalSource.#materializedPtr(),
            right.#materializedPtr(),
            ptr,
            left.rows,
            right.cols,
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
          right.cols,
        ]]);
        if (ok !== 1) {
          throw new RangeError("matrix is singular");
        }
      } else {
        const cholesky = left.#choleskyFactor();
        if (cholesky != null) {
          const work = this.#runtime.f64Scratch(left.rows * right.cols);
          const ok = this.#runtime.call(
            "choleskySolve",
            cholesky.lowerPtr,
            right.#materializedPtr(),
            ptr,
            left.rows,
            right.cols,
            work,
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
          const ok = this.#runtime.call(
            "luSolve",
            factor.luPtr,
            factor.pivotsPtr,
            right.#materializedPtr(),
            ptr,
            left.rows,
            right.cols,
            work,
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
  /* c8 ignore stop */

  /* c8 ignore start */
  #materializeLeastSquares(ptr) {
    const leastSquares = this.#leastSquaresOf;
    const { left, right, temporaryRight } = leastSquares;
    left.#assertAlive();
    right.#assertAlive();
    left.#assertSameRuntime(right);
    if (left.rows < left.cols) {
      throw new RangeError("leastSquares requires rows >= columns");
    }
    if (right.rows !== left.rows) {
      throw new RangeError(
        `right-hand side rows ${right.rows} must match ${left.rows}`,
      );
    }

    try {
      const factor = left.#qrFactor();
      const work = this.#runtime.f64Scratch(left.cols * right.cols);
      const ok = this.#runtime.call(
        "qrSolve",
        factor.qPtr,
        factor.rPtr,
        right.#materializedPtr(),
        ptr,
        left.rows,
        left.cols,
        right.cols,
        work,
      );
      if (ok !== 1) {
        throw new RangeError("matrix is rank deficient");
      }
    } finally {
      this.#leastSquaresOf = null;
      if (temporaryRight) right.dispose();
    }
  }
  /* c8 ignore stop */

  /* c8 ignore start */
  #materializeOuter(ptr) {
    const { left, right, temporaryLeft, temporaryRight } = this.#outerOf;
    left.#assertAlive();
    right.#assertAlive();
    this.#assertSameRuntime(left);
    this.#assertSameRuntime(right);

    try {
      this.#runtime.call(
        "outer",
        left.#materializedPtr(),
        right.#materializedPtr(),
        ptr,
        left.length,
        right.length,
      );
    } finally {
      this.#outerOf = null;
      if (temporaryLeft) left.dispose();
      if (temporaryRight) right.dispose();
    }
  }
  /* c8 ignore stop */

  /* c8 ignore start */
  #materializeDiagonalOf(ptr) {
    const source = this.#diagonalOf;
    source.#assertAlive();
    this.#assertSameRuntime(source);
    try {
      this.#runtime.call(
        "diagonalMatrix",
        source.#materializedPtr(),
        ptr,
        source.length,
      );
    } finally {
      if (this.#diagonalTemporary) source.dispose();
    }
    this.#diagonalOf = null;
    this.#diagonalTemporary = false;
  }
  /* c8 ignore stop */

  #materializedPtr() {
    this.#assertAlive();
    if (this.#ptr) return this.#ptr;

    const cacheKey = this.#materializationCacheKey();
    if (cacheKey != null) {
      const cachedPtr = this.#runtime.getCachedBuffer(cacheKey, this.length);
      if (cachedPtr) {
        this.#ptr = cachedPtr;
        this.#owns = true;
        matrixFinalizer?.register(this, {
          runtime: this.#runtime,
          ptr: this.#ptr,
        }, this);
        return this.#ptr;
      }
    }

    const batchedPtr = this.#tryMaterializeBatch(cacheKey);
    if (batchedPtr) return batchedPtr;

    const ptr = this.#runtime.alloc(this.length);

    /* c8 ignore next 2 */
    if (this.#materializeLocal(ptr)) {
      // Local JS literals are copied into WASM memory only at the first boundary call.
    } else if (this.#inverseOf != null) {
      this.#inverseOf.#assertAlive();
      this.#assertSameRuntime(this.#inverseOf);
      if (
        this.rows > 1 &&
        (this.#inverseOf.#structure === "zero" ||
          this.#inverseOf.#structure === "ones" ||
          this.#inverseOf.#structure === "constant" ||
          this.#inverseOf.#structure === "outer")
      ) {
        this.#runtime.free(ptr);
        throw new RangeError("matrix is singular");
      }
      if (this.#inverseOf.#structure === "diagonal") {
        /* c8 ignore start */
        const ok = this.#runtime.call(
          "invertDiagonal",
          this.#inverseOf.#materializedPtr(),
          ptr,
          this.rows,
        );
        if (ok !== 1) {
          this.#runtime.free(ptr);
          throw new RangeError("matrix is singular");
        }
        this.#inverseOf = null;
        /* c8 ignore stop */
      } else {
        const cholesky = this.#inverseOf.#choleskyFactor();
        if (cholesky != null) {
          const work = this.#runtime.f64Scratch(this.rows * this.cols);
          const ok = this.#runtime.call(
            "choleskyInvert",
            cholesky.lowerPtr,
            ptr,
            this.rows,
            work,
          );
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
          const ok = this.#runtime.call(
            "luInvert",
            factor.luPtr,
            factor.pivotsPtr,
            ptr,
            this.rows,
            work,
          );
          /* c8 ignore next 4 */
          if (ok !== 1) {
            this.#runtime.free(ptr);
            throw new RangeError("matrix is singular");
          }
          this.#inverseOf = null;
        }
      }
    } else if (this.#expr != null) {
      this.#materializeExpression(ptr);
    } else if (this.#matmulOf != null) {
      this.#materializeMatmul(ptr);
      /* c8 ignore next 2 */
    } else if (this.#solveOf != null) {
      this.#materializeSolve(ptr);
    } else if (this.#leastSquaresOf != null) {
      this.#materializeLeastSquares(ptr);
      /* c8 ignore next 2 */
    } else if (this.#outerOf != null) {
      this.#materializeOuter(ptr);
      /* c8 ignore next 2 */
    } else if (this.#diagonalOf != null) {
      this.#materializeDiagonalOf(ptr);
    } else if (this.#transposeOf != null) {
      this.#transposeOf.#assertAlive();
      this.#assertSameRuntime(this.#transposeOf);
      this.#runtime.call(
        "copy",
        this.#transposeOf.#transposeCachePtr(),
        ptr,
        this.length,
      );
      this.#transposeOf = null;
    } else if (this.#base != null) {
      this.#base.#assertAlive();
      this.#assertSameRuntime(this.#base);
      this.#runtime.call(
        "affine",
        this.#base.#materializedPtr(),
        ptr,
        this.length,
        this.#affineScale,
        this.#affineBias,
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
    matrixFinalizer?.register(
      this,
      { runtime: this.#runtime, ptr: this.#ptr },
      this,
    );
    if (cacheKey != null) {
      this.#runtime.putCachedBuffer(cacheKey, this.#ptr, this.length);
    }
    return this.#ptr;
  }

  #luFactor() {
    this.#assertSquare("LU factorization");
    if (
      this.#luCache != null &&
      this.#luCache.version === this.#version &&
      this.#cacheEntryAlive(this.#luCache.entry)
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
      sign = this.#runtime.call(
        "luFactor",
        sourcePtr,
        this.rows,
        luPtr,
        pivotsPtr,
      );
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
    const entry = this.#addCacheEntry(
      runtime.registerCacheEntry(this.length * 8 + this.rows * 4, () => {
        runtime.free(luPtr);
        runtime.free(pivotsPtr);
      }),
    );
    const cache = {
      version: this.#version,
      luPtr,
      pivotsPtr,
      sign,
      entry,
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
      throw new RangeError(
        `shape mismatch: ${this.rows}x${this.cols} !== ${other.rows}x${other.cols}`,
      );
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
