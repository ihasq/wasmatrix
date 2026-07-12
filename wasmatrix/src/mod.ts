// Generated from wit/wasmatrix.wit. Do not edit directly.
import * as core from "./wasmatrix";

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

export function componentAbiVersion(): i32 {
  return core.abiVersion();
}

export function executeCoreBatch(instructions: usize, count: i32): i32 {
  return core.executeBatch(instructions, count);
}
