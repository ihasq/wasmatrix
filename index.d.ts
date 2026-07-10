export const SIMD_REQUIRED: true;

export interface WasmatrixOptions {
  fastMath?: boolean;
  cacheLimitBytes?: number;
}

export type WasmBytes = ArrayBuffer | ArrayBufferView;

export function isSimdSupported(wasmBytes?: WasmBytes | null): boolean;
export function createRuntime(wasmBytes?: WasmBytes | null): unknown;
export function configure(options?: WasmatrixOptions): void;

export class Matrix {
  readonly rows: number;
  readonly cols: number;
  readonly byteOffset: number;
  /** Snapshot copied from WASM memory when accessed. */
  readonly data: Float32Array;
  readonly length: number;
  readonly shape: [number, number];

  constructor(rows: number, cols: number, data?: ArrayLike<number> | null, options?: { copy?: boolean });

  static from(rows: number, cols: number, values: ArrayLike<number>): Matrix;
  static zeros(rows: number, cols: number): Matrix;
  static ones(rows: number, cols: number): Matrix;
  static identity(size: number): Matrix;
  static diagonal(values: ArrayLike<number> | Matrix): Matrix;
  static random(rows: number, cols: number, rng?: () => number): Matrix;
  static outer(a: ArrayLike<number> | Matrix, b: ArrayLike<number> | Matrix): Matrix;
  static matmulChain(...matrices: Matrix[]): Matrix;
  static matmulChain(matrices: Matrix[]): Matrix;
  static configure(options?: WasmatrixOptions): void;

  dispose(): void;
  [Symbol.dispose](): void;
  clone(): Matrix;
  at(row: number, col: number): number;
  set(row: number, col: number, value: number): this;
  row(index: number): Float32Array;
  column(index: number): Float32Array;
  diagonal(): Float32Array;
  reshape(rows: number, cols: number): Matrix;
  toFloat32Array(): Float32Array;
  toFlatArray(): number[];
  toArray(): number[][];

  add(other: Matrix | number): Matrix;
  addScalar(value: number): Matrix;
  subtract(other: Matrix | number): Matrix;
  scale(value: number): Matrix;
  multiply(other: Matrix | number): Matrix;
  divide(other: Matrix | number): Matrix;
  hadamard(other: Matrix): Matrix;
  elementMultiply(other: Matrix): Matrix;
  min(other: Matrix): Matrix;
  max(other: Matrix): Matrix;
  negate(): Matrix;
  abs(): Matrix;
  sqrt(): Matrix;
  floor(): Matrix;
  ceil(): Matrix;
  clamp(minValue: number, maxValue: number): Matrix;
  map(fn: (value: number, row: number, col: number) => number): Matrix;

  transpose(): Matrix;
  matmul(other: Matrix): Matrix;
  matvec(vector: ArrayLike<number> | Matrix): Float32Array;
  dot(other: Matrix | ArrayLike<number>): number;
  sum(): number;
  minValue(): number;
  maxValue(): number;
  trace(): number;
  frobeniusNorm(): number;
  determinant(): number;
  logDet(): number;
  inverse(): Matrix;
  solve(rhs: Matrix | ArrayLike<number>): Matrix;
  leastSquares(rhs: Matrix | ArrayLike<number>): Matrix;
  rank(epsilon?: number): number;
  equalsApprox(other: Matrix, epsilon?: number): boolean;
  toString(): string;
}

export default Matrix;
