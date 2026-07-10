import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";
import Matrix from "../dist/index.js";
import {
  makeData,
  refAbs,
  refAdd,
  refAddScalar,
  refClamp,
  refDeterminant,
  refDiagonalMatrix,
  refHadamard,
  refInverse,
  refMatmul,
  refMatrix,
  refRank,
  refScale,
  refSolve,
  refSqrt,
  refSubtractScalar,
  refSum,
  refTrace,
  refTranspose
} from "./helpers/reference-matrix.mjs";

function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }
  return value;
}

function timed(fn) {
  const start = performance.now();
  const result = fn();
  return {
    ...result,
    elapsedMs: performance.now() - start
  };
}

function assertClose(actual, expected, name, relativeTolerance = 1e-4) {
  const tolerance = Math.max(1e-3, Math.abs(expected) * relativeTolerance);
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${name}: expected ${expected}, got ${actual}, tolerance ${tolerance}`
  );
}

function makeDominantData(size, seed) {
  const data = makeData(size, size, seed, { min: -1, max: 1 });
  for (let i = 0; i < size; i++) {
    data[i * size + i] += size * 1.5;
  }
  return data;
}

function runWasmElementwise(rows, cols, iterations) {
  const a = Matrix.from(rows, cols, makeData(rows, cols, 0x85ebca6b, { min: -2, max: 2 }));
  const b = Matrix.from(rows, cols, makeData(rows, cols, 0xc2b2ae35, { min: -1.5, max: 1.5 }));
  let checksum = 0;

  const result = timed(() => {
    for (let i = 0; i < iterations; i++) {
      const added = a.add(b);
      const shifted = added.subtract(0.125 + (i % 5) * 0.01);
      const weights = b.abs().addScalar(0.75);
      const mixed = shifted.hadamard(weights);
      const clipped = mixed.clamp(-3, 3);
      const rooted = clipped.addScalar(3.25).sqrt();

      checksum += rooted.sum();

      added.dispose();
      shifted.dispose();
      weights.dispose();
      mixed.dispose();
      clipped.dispose();
      rooted.dispose();
    }
    return { checksum };
  });

  a.dispose();
  b.dispose();
  return result;
}

function runJsElementwise(rows, cols, iterations) {
  const a = refMatrix(rows, cols, makeData(rows, cols, 0x85ebca6b, { min: -2, max: 2 }));
  const b = refMatrix(rows, cols, makeData(rows, cols, 0xc2b2ae35, { min: -1.5, max: 1.5 }));
  let checksum = 0;

  return timed(() => {
    for (let i = 0; i < iterations; i++) {
      const rooted = refSqrt(
        refAddScalar(
          refClamp(
            refHadamard(
              refSubtractScalar(refAdd(a, b), 0.125 + (i % 5) * 0.01),
              refAddScalar(refAbs(b), 0.75)
            ),
            -3,
            3
          ),
          3.25
        )
      );

      checksum += refSum(rooted);
    }
    return { checksum };
  });
}

function runWasmAffineChain(rows, cols, iterations) {
  const matrix = Matrix.from(rows, cols, makeData(rows, cols, 0x7f4a7c15, { min: -4, max: 4 }));
  let checksum = 0;

  const result = timed(() => {
    for (let i = 0; i < iterations; i++) {
      const transformed = matrix
        .scale(2)
        .scale(3)
        .addScalar(1 + (i % 3) * 0.01)
        .subtract(0.5)
        .divide(2);

      checksum += transformed.sum();
      transformed.dispose();
    }
    return { checksum };
  });

  matrix.dispose();
  return result;
}

function runJsAffineChain(rows, cols, iterations) {
  const matrix = refMatrix(rows, cols, makeData(rows, cols, 0x7f4a7c15, { min: -4, max: 4 }));
  let checksum = 0;

  return timed(() => {
    for (let i = 0; i < iterations; i++) {
      const transformed = refScale(
        refSubtractScalar(
          refAddScalar(refScale(refScale(matrix, 2), 3), 1 + (i % 3) * 0.01),
          0.5
        ),
        0.5
      );
      checksum += refSum(transformed);
    }
    return { checksum };
  });
}

function runWasmMatmul(size, iterations) {
  const left = Matrix.from(size, size, makeData(size, size, 0x27d4eb2f, { min: -1, max: 1 }));
  const right = Matrix.from(size, size, makeData(size, size, 0x165667b1, { min: -1, max: 1 }));
  let checksum = 0;

  const result = timed(() => {
    for (let i = 0; i < iterations; i++) {
      const shifted = left.addScalar((i % 7) * 0.005);
      const product = shifted.matmul(right);
      const scaled = product.scale(0.001);

      checksum += scaled.trace();

      shifted.dispose();
      product.dispose();
      scaled.dispose();
    }
    return { checksum };
  });

  left.dispose();
  right.dispose();
  return result;
}

function runJsMatmul(size, iterations) {
  const left = refMatrix(size, size, makeData(size, size, 0x27d4eb2f, { min: -1, max: 1 }));
  const right = refMatrix(size, size, makeData(size, size, 0x165667b1, { min: -1, max: 1 }));
  let checksum = 0;

  return timed(() => {
    for (let i = 0; i < iterations; i++) {
      const scaled = refScale(refMatmul(refAddScalar(left, (i % 7) * 0.005), right), 0.001);
      checksum += refTrace(scaled);
    }
    return { checksum };
  });
}

function runWasmDiagonalSpecialization(size, rhsCols, iterations) {
  const values = makeData(size, 1, 0x22f0f1a5, { min: 0.5, max: 2 });
  const diagonal = Matrix.diagonal(values);
  const right = Matrix.from(size, rhsCols, makeData(size, rhsCols, 0x3bd39e10, { min: -1, max: 1 }));
  const left = Matrix.from(rhsCols, size, makeData(rhsCols, size, 0x7cab1231, { min: -1, max: 1 }));
  const rhs = Matrix.from(size, rhsCols, makeData(size, rhsCols, 0x51f15eaa, { min: -2, max: 2 }));
  let checksum = 0;

  const result = timed(() => {
    for (let i = 0; i < iterations; i++) {
      const rowScaled = diagonal.matmul(right);
      const colScaled = left.matmul(diagonal);
      const inverse = diagonal.inverse();
      const solution = diagonal.solve(rhs);

      checksum += rowScaled.sum() * 1e-3;
      checksum += colScaled.sum() * 1e-3;
      checksum += inverse.trace();
      checksum += solution.sum();

      rowScaled.dispose();
      colScaled.dispose();
      inverse.dispose();
      solution.dispose();
    }
    return { checksum };
  });

  diagonal.dispose();
  right.dispose();
  left.dispose();
  rhs.dispose();
  return result;
}

function runJsDiagonalSpecialization(size, rhsCols, iterations) {
  const values = makeData(size, 1, 0x22f0f1a5, { min: 0.5, max: 2 });
  const diagonal = refDiagonalMatrix(refMatrix(size, 1, values));
  const right = refMatrix(size, rhsCols, makeData(size, rhsCols, 0x3bd39e10, { min: -1, max: 1 }));
  const left = refMatrix(rhsCols, size, makeData(rhsCols, size, 0x7cab1231, { min: -1, max: 1 }));
  const rhs = refMatrix(size, rhsCols, makeData(size, rhsCols, 0x51f15eaa, { min: -2, max: 2 }));
  let checksum = 0;

  return timed(() => {
    for (let i = 0; i < iterations; i++) {
      const rowScaled = refMatmul(diagonal, right);
      const colScaled = refMatmul(left, diagonal);
      const inverse = refInverse(diagonal);
      const solution = refSolve(diagonal, rhs);

      checksum += refSum(rowScaled) * 1e-3;
      checksum += refSum(colScaled) * 1e-3;
      checksum += refTrace(inverse);
      checksum += refSum(solution);
    }
    return { checksum };
  });
}

function runWasmBroadcastFusion(rows, cols, iterations) {
  const matrix = Matrix.from(rows, cols, makeData(rows, cols, 0x8102ac4d, { min: 0, max: 2 }));
  const row = Matrix.from(1, cols, makeData(1, cols, 0x6d2b79f5, { min: 0.5, max: 1.5 }));
  const column = Matrix.from(rows, 1, makeData(rows, 1, 0x42f0e1bd, { min: 0.5, max: 1.5 }));
  let checksum = 0;

  const result = timed(() => {
    for (let i = 0; i < iterations; i++) {
      const transformed = matrix
        .add(row)
        .multiply(column)
        .subtract(0.125 + (i % 3) * 0.01)
        .clamp(-2, 4)
        .addScalar(2.25)
        .sqrt();

      checksum += transformed.sum();
      transformed.dispose();
    }
    return { checksum };
  });

  matrix.dispose();
  row.dispose();
  column.dispose();
  return result;
}

function runJsBroadcastFusion(rows, cols, iterations) {
  const matrix = makeData(rows, cols, 0x8102ac4d, { min: 0, max: 2 });
  const row = makeData(1, cols, 0x6d2b79f5, { min: 0.5, max: 1.5 });
  const column = makeData(rows, 1, 0x42f0e1bd, { min: 0.5, max: 1.5 });
  let checksum = 0;

  return timed(() => {
    for (let i = 0; i < iterations; i++) {
      const shift = 0.125 + (i % 3) * 0.01;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const index = r * cols + c;
          const value = Math.min(Math.max((matrix[index] + row[c]) * column[r] - shift, -2), 4) + 2.25;
          checksum += Math.sqrt(value);
        }
      }
    }
    return { checksum };
  });
}

function makeDistributiveData() {
  return {
    a: makeData(128, 64, 0x1f357a9d, { min: -1, max: 1 }),
    b: makeData(64, 96, 0x92a1b3cd, { min: -1, max: 1 }),
    c: makeData(64, 96, 0x52be99f1, { min: -1, max: 1 })
  };
}

function runWasmDistributiveOptimized(iterations) {
  const data = makeDistributiveData();
  const a = Matrix.from(128, 64, data.a);
  const b = Matrix.from(64, 96, data.b);
  const c = Matrix.from(64, 96, data.c);
  let checksum = 0;

  const result = timed(() => {
    for (let i = 0; i < iterations; i++) {
      const sum = a.matmul(b).add(a.matmul(c));
      checksum += sum.sum();
      sum.dispose();
    }
    return { checksum };
  });

  a.dispose();
  b.dispose();
  c.dispose();
  return result;
}

function runWasmDistributiveMaterialized(iterations) {
  const data = makeDistributiveData();
  const a = Matrix.from(128, 64, data.a);
  const b = Matrix.from(64, 96, data.b);
  const c = Matrix.from(64, 96, data.c);
  let checksum = 0;

  const result = timed(() => {
    for (let i = 0; i < iterations; i++) {
      const ab = a.matmul(b);
      const ac = a.matmul(c);
      ab.byteOffset;
      ac.byteOffset;
      const sum = ab.add(ac);

      checksum += sum.sum();

      ab.dispose();
      ac.dispose();
      sum.dispose();
    }
    return { checksum };
  });

  a.dispose();
  b.dispose();
  c.dispose();
  return result;
}

function makeTransposeData() {
  return {
    a: makeData(256, 64, 0x17a7c08f, { min: -1, max: 1 }),
    b: makeData(128, 64, 0x8f2c7ab1, { min: -1, max: 1 })
  };
}

function runWasmTransposeAware(iterations) {
  const data = makeTransposeData();
  const a = Matrix.from(256, 64, data.a);
  const b = Matrix.from(128, 64, data.b);
  let checksum = 0;

  const result = timed(() => {
    for (let i = 0; i < iterations; i++) {
      const product = a.matmul(b.transpose());
      checksum += product.sum();
      product.dispose();
    }
    return { checksum };
  });

  a.dispose();
  b.dispose();
  return result;
}

function runWasmTransposeMaterialized(iterations) {
  const data = makeTransposeData();
  const a = Matrix.from(256, 64, data.a);
  const b = Matrix.from(128, 64, data.b);
  let checksum = 0;

  const result = timed(() => {
    for (let i = 0; i < iterations; i++) {
      const transposed = b.transpose();
      transposed.byteOffset;
      const product = a.matmul(transposed);

      checksum += product.sum();

      transposed.dispose();
      product.dispose();
    }
    return { checksum };
  });

  a.dispose();
  b.dispose();
  return result;
}

function makeChainData() {
  return {
    a: makeData(256, 8, 0x12b9b0a1, { min: -1, max: 1 }),
    b: makeData(8, 256, 0x4c2f19dd, { min: -1, max: 1 }),
    c: makeData(256, 8, 0x6d1f2a71, { min: -1, max: 1 })
  };
}

function runWasmMatmulChainOptimized(iterations) {
  const data = makeChainData();
  const a = Matrix.from(256, 8, data.a);
  const b = Matrix.from(8, 256, data.b);
  const c = Matrix.from(256, 8, data.c);
  let checksum = 0;

  const result = timed(() => {
    for (let i = 0; i < iterations; i++) {
      const product = Matrix.matmulChain(a, b, c);
      checksum += product.sum();
      product.dispose();
    }
    return { checksum };
  });

  a.dispose();
  b.dispose();
  c.dispose();
  return result;
}

function runWasmMatmulChainLeftAssociated(iterations) {
  const data = makeChainData();
  const a = Matrix.from(256, 8, data.a);
  const b = Matrix.from(8, 256, data.b);
  const c = Matrix.from(256, 8, data.c);
  let checksum = 0;

  const result = timed(() => {
    for (let i = 0; i < iterations; i++) {
      const ab = a.matmul(b);
      const abc = ab.matmul(c);

      checksum += abc.sum();

      ab.dispose();
      abc.dispose();
    }
    return { checksum };
  });

  a.dispose();
  b.dispose();
  c.dispose();
  return result;
}

function runWasmLinearAlgebra(size, rhsCols, iterations) {
  const matrix = Matrix.from(size, size, makeDominantData(size, 0xd3a2646c));
  const rhs = Matrix.from(size, rhsCols, makeData(size, rhsCols, 0xfd7046c5, { min: -2, max: 2 }));
  let checksum = 0;

  const result = timed(() => {
    for (let i = 0; i < iterations; i++) {
      const shifted = matrix.addScalar((i % 5) * 0.002);
      const inverse = shifted.inverse();
      const solution = shifted.solve(rhs);

      checksum += shifted.determinant() * 1e-9;
      checksum += inverse.trace();
      checksum += solution.sum();
      checksum += shifted.rank();

      shifted.dispose();
      inverse.dispose();
      solution.dispose();
    }
    return { checksum };
  });

  matrix.dispose();
  rhs.dispose();
  return result;
}

function runJsLinearAlgebra(size, rhsCols, iterations) {
  const matrix = refMatrix(size, size, makeDominantData(size, 0xd3a2646c));
  const rhs = refMatrix(size, rhsCols, makeData(size, rhsCols, 0xfd7046c5, { min: -2, max: 2 }));
  let checksum = 0;

  return timed(() => {
    for (let i = 0; i < iterations; i++) {
      const shifted = refAddScalar(matrix, (i % 5) * 0.002);
      const inverse = refInverse(shifted);
      const solution = refSolve(shifted, rhs);

      checksum += refDeterminant(shifted) * 1e-9;
      checksum += refTrace(inverse);
      checksum += refSum(solution);
      checksum += refRank(shifted);
    }
    return { checksum };
  });
}

function makeSpdPipeline(size, rhsCols) {
  const designRows = size + 4;
  const design = makeData(designRows, size, 0x6a09e667, { min: -1, max: 1 });
  const rhs = makeData(size, rhsCols, 0xbb67ae85, { min: -1, max: 1 });
  return { designRows, design, rhs };
}

function runWasmCholeskyCache(size, rhsCols, iterations) {
  const { designRows, design, rhs } = makeSpdPipeline(size, rhsCols);
  const matrix = Matrix.from(designRows, size, design);
  const gram = matrix.transpose().matmul(matrix);
  const right = Matrix.from(size, rhsCols, rhs);
  let checksum = 0;

  const result = timed(() => {
    for (let i = 0; i < iterations; i++) {
      const solution = gram.solve(right);
      const inverse = gram.inverse();

      checksum += gram.determinant() * 1e-6;
      checksum += gram.logDet();
      checksum += solution.sum();
      checksum += inverse.trace();

      solution.dispose();
      inverse.dispose();
    }
    return { checksum };
  });

  matrix.dispose();
  gram.dispose();
  right.dispose();
  return result;
}

function runJsCholeskyReference(size, rhsCols, iterations) {
  const { designRows, design, rhs } = makeSpdPipeline(size, rhsCols);
  const matrix = refMatrix(designRows, size, design);
  const gram = refMatmul(refTranspose(matrix), matrix);
  const right = refMatrix(size, rhsCols, rhs);
  let checksum = 0;

  return timed(() => {
    for (let i = 0; i < iterations; i++) {
      const solution = refSolve(gram, right);
      const inverse = refInverse(gram);
      const determinant = refDeterminant(gram);

      checksum += determinant * 1e-6;
      checksum += Math.log(determinant);
      checksum += refSum(solution);
      checksum += refTrace(inverse);
    }
    return { checksum };
  });
}

function makeLeastSquaresPipeline(rows, cols, rhsCols) {
  const design = makeData(rows, cols, 0x3c6ef372, { min: -1, max: 1 });
  for (let i = 0; i < cols; i++) {
    design[i * cols + i] += 2;
  }
  const rhs = makeData(rows, rhsCols, 0xa54ff53a, { min: -2, max: 2 });
  return { design, rhs };
}

function refLeastSquares(matrix, rhs) {
  const transposed = refTranspose(matrix);
  const normal = refMatmul(transposed, matrix);
  const projected = refMatmul(transposed, rhs);
  return refSolve(normal, projected);
}

function runWasmQrCache(rows, cols, rhsCols, iterations) {
  const { design, rhs } = makeLeastSquaresPipeline(rows, cols, rhsCols);
  const matrix = Matrix.from(rows, cols, design);
  const right = Matrix.from(rows, rhsCols, rhs);
  let checksum = 0;

  const result = timed(() => {
    for (let i = 0; i < iterations; i++) {
      const solution = matrix.leastSquares(right);
      checksum += matrix.rank();
      checksum += solution.sum();
      solution.dispose();
    }
    return { checksum };
  });

  matrix.dispose();
  right.dispose();
  return result;
}

function runJsQrReference(rows, cols, rhsCols, iterations) {
  const { design, rhs } = makeLeastSquaresPipeline(rows, cols, rhsCols);
  const matrix = refMatrix(rows, cols, design);
  const right = refMatrix(rows, rhsCols, rhs);
  let checksum = 0;

  return timed(() => {
    for (let i = 0; i < iterations; i++) {
      const solution = refLeastSquares(matrix, right);
      checksum += refRank(matrix);
      checksum += refSum(solution);
    }
    return { checksum };
  });
}

function runWasmReductionCache(rows, cols, iterations) {
  const a = Matrix.from(rows, cols, makeData(rows, cols, 0x510e527f, { min: 0.1, max: 2 }));
  const b = Matrix.from(rows, cols, makeData(rows, cols, 0x9b05688c, { min: 0.1, max: 2 }));
  const expr = a.add(b).hadamard(a).sqrt();
  let checksum = 0;

  const result = timed(() => {
    for (let i = 0; i < iterations; i++) {
      checksum += expr.sum();
      checksum += expr.minValue();
      checksum += expr.maxValue();
      checksum += expr.frobeniusNorm();
      checksum += expr.diagonal()[0];
    }
    return { checksum };
  });

  a.dispose();
  b.dispose();
  expr.dispose();
  return result;
}

function runWasmReductionFresh(rows, cols, iterations) {
  const a = Matrix.from(rows, cols, makeData(rows, cols, 0x510e527f, { min: 0.1, max: 2 }));
  const b = Matrix.from(rows, cols, makeData(rows, cols, 0x9b05688c, { min: 0.1, max: 2 }));
  let checksum = 0;

  const result = timed(() => {
    for (let i = 0; i < iterations; i++) {
      const expr = a.add(b).hadamard(a).sqrt();
      checksum += expr.sum();
      checksum += expr.minValue();
      checksum += expr.maxValue();
      checksum += expr.frobeniusNorm();
      checksum += expr.diagonal()[0];
      expr.dispose();
    }
    return { checksum };
  });

  a.dispose();
  b.dispose();
  return result;
}

function runWasmInverseMatmul(size, rhsCols, iterations) {
  const matrix = Matrix.from(size, size, makeDominantData(size, 0x94d049bb));
  const rhs = Matrix.from(size, rhsCols, makeData(size, rhsCols, 0x8538ECB5, { min: -1, max: 1 }));
  let checksum = 0;

  const result = timed(() => {
    for (let i = 0; i < iterations; i++) {
      const shifted = matrix.addScalar((i % 4) * 0.003);
      const product = shifted.inverse().matmul(rhs);

      checksum += product.sum();

      shifted.dispose();
      product.dispose();
    }
    return { checksum };
  });

  matrix.dispose();
  rhs.dispose();
  return result;
}

function runJsInverseMatmul(size, rhsCols, iterations) {
  const matrix = refMatrix(size, size, makeDominantData(size, 0x94d049bb));
  const rhs = refMatrix(size, rhsCols, makeData(size, rhsCols, 0x8538ECB5, { min: -1, max: 1 }));
  let checksum = 0;

  return timed(() => {
    for (let i = 0; i < iterations; i++) {
      const shifted = refAddScalar(matrix, (i % 4) * 0.003);
      checksum += refSum(refMatmul(refInverse(shifted), rhs));
    }
    return { checksum };
  });
}

test("E2E benchmark: matrix pipelines are measurable and checksum-stable", { timeout: 120_000 }, () => {
  const elementRows = envInt("WASMATRIX_BENCH_ELEMENT_ROWS", 128);
  const elementCols = envInt("WASMATRIX_BENCH_ELEMENT_COLS", 128);
  const elementIterations = envInt("WASMATRIX_BENCH_ELEMENT_ITERS", 40);
  const affineIterations = envInt("WASMATRIX_BENCH_AFFINE_ITERS", 100);
  const matmulSize = envInt("WASMATRIX_BENCH_MATMUL_SIZE", 48);
  const matmulIterations = envInt("WASMATRIX_BENCH_MATMUL_ITERS", 6);
  const diagonalSize = envInt("WASMATRIX_BENCH_DIAGONAL_SIZE", 64);
  const diagonalRhsCols = envInt("WASMATRIX_BENCH_DIAGONAL_RHS_COLS", 8);
  const diagonalIterations = envInt("WASMATRIX_BENCH_DIAGONAL_ITERS", 6);
  const broadcastIterations = envInt("WASMATRIX_BENCH_BROADCAST_ITERS", 40);
  const distributiveIterations = envInt("WASMATRIX_BENCH_DISTRIBUTIVE_ITERS", 4);
  const transposeIterations = envInt("WASMATRIX_BENCH_TRANSPOSE_ITERS", 3);
  const chainIterations = envInt("WASMATRIX_BENCH_CHAIN_ITERS", 10);
  const linalgSize = envInt("WASMATRIX_BENCH_LINALG_SIZE", 12);
  const linalgRhsCols = envInt("WASMATRIX_BENCH_LINALG_RHS_COLS", 3);
  const linalgIterations = envInt("WASMATRIX_BENCH_LINALG_ITERS", 8);
  const choleskyIterations = envInt("WASMATRIX_BENCH_CHOLESKY_ITERS", 8);
  const qrRows = envInt("WASMATRIX_BENCH_QR_ROWS", 24);
  const qrCols = envInt("WASMATRIX_BENCH_QR_COLS", 8);
  const qrIterations = envInt("WASMATRIX_BENCH_QR_ITERS", 10);
  const reductionCacheIterations = envInt("WASMATRIX_BENCH_REDUCTION_CACHE_ITERS", 200);
  const inverseMatmulIterations = envInt("WASMATRIX_BENCH_INVERSE_MATMUL_ITERS", 12);

  const elementWasm = runWasmElementwise(elementRows, elementCols, elementIterations);
  const elementJs = runJsElementwise(elementRows, elementCols, elementIterations);
  const affineWasm = runWasmAffineChain(elementRows, elementCols, affineIterations);
  const affineJs = runJsAffineChain(elementRows, elementCols, affineIterations);
  const matmulWasm = runWasmMatmul(matmulSize, matmulIterations);
  const matmulJs = runJsMatmul(matmulSize, matmulIterations);
  const diagonalWasm = runWasmDiagonalSpecialization(diagonalSize, diagonalRhsCols, diagonalIterations);
  const diagonalJs = runJsDiagonalSpecialization(diagonalSize, diagonalRhsCols, diagonalIterations);
  const broadcastWasm = runWasmBroadcastFusion(elementRows, elementCols, broadcastIterations);
  const broadcastJs = runJsBroadcastFusion(elementRows, elementCols, broadcastIterations);
  const distributiveOptimized = runWasmDistributiveOptimized(distributiveIterations);
  const distributiveMaterialized = runWasmDistributiveMaterialized(distributiveIterations);
  const transposeAware = runWasmTransposeAware(transposeIterations);
  const transposeMaterialized = runWasmTransposeMaterialized(transposeIterations);
  const chainOptimized = runWasmMatmulChainOptimized(chainIterations);
  const chainLeftAssociated = runWasmMatmulChainLeftAssociated(chainIterations);
  const linalgWasm = runWasmLinearAlgebra(linalgSize, linalgRhsCols, linalgIterations);
  const linalgJs = runJsLinearAlgebra(linalgSize, linalgRhsCols, linalgIterations);
  const choleskyWasm = runWasmCholeskyCache(linalgSize, linalgRhsCols, choleskyIterations);
  const choleskyJs = runJsCholeskyReference(linalgSize, linalgRhsCols, choleskyIterations);
  const qrWasm = runWasmQrCache(qrRows, qrCols, linalgRhsCols, qrIterations);
  const qrJs = runJsQrReference(qrRows, qrCols, linalgRhsCols, qrIterations);
  const reductionCached = runWasmReductionCache(elementRows, elementCols, reductionCacheIterations);
  const reductionFresh = runWasmReductionFresh(elementRows, elementCols, reductionCacheIterations);
  const inverseMatmulWasm = runWasmInverseMatmul(linalgSize, linalgRhsCols, inverseMatmulIterations);
  const inverseMatmulJs = runJsInverseMatmul(linalgSize, linalgRhsCols, inverseMatmulIterations);

  assertClose(elementWasm.checksum, elementJs.checksum, "elementwise checksum", 2e-4);
  assertClose(affineWasm.checksum, affineJs.checksum, "affine checksum", 2e-4);
  assertClose(matmulWasm.checksum, matmulJs.checksum, "matmul checksum", 5e-4);
  assertClose(diagonalWasm.checksum, diagonalJs.checksum, "diagonal checksum", 1e-3);
  assertClose(broadcastWasm.checksum, broadcastJs.checksum, "broadcast checksum", 2e-4);
  assertClose(distributiveOptimized.checksum, distributiveMaterialized.checksum, "distributive checksum", 5e-4);
  assertClose(transposeAware.checksum, transposeMaterialized.checksum, "transpose-aware checksum", 5e-4);
  assertClose(chainOptimized.checksum, chainLeftAssociated.checksum, "matmul chain checksum", 5e-4);
  assertClose(linalgWasm.checksum, linalgJs.checksum, "linear algebra checksum", 1e-3);
  assertClose(choleskyWasm.checksum, choleskyJs.checksum, "cholesky cache checksum", 5e-3);
  assertClose(qrWasm.checksum, qrJs.checksum, "qr cache checksum", 5e-2);
  assertClose(reductionCached.checksum, reductionFresh.checksum, "reduction cache checksum", 1e-6);
  assertClose(inverseMatmulWasm.checksum, inverseMatmulJs.checksum, "inverse matmul checksum", 1e-3);

  const summary = {
    elementwise: {
      shape: [elementRows, elementCols],
      iterations: elementIterations,
      wasmMs: Number(elementWasm.elapsedMs.toFixed(3)),
      jsMs: Number(elementJs.elapsedMs.toFixed(3)),
      speedup: Number((elementJs.elapsedMs / elementWasm.elapsedMs).toFixed(3)),
      checksum: Number(elementWasm.checksum.toFixed(6))
    },
    affineChain: {
      shape: [elementRows, elementCols],
      iterations: affineIterations,
      wasmMs: Number(affineWasm.elapsedMs.toFixed(3)),
      jsMs: Number(affineJs.elapsedMs.toFixed(3)),
      speedup: Number((affineJs.elapsedMs / affineWasm.elapsedMs).toFixed(3)),
      checksum: Number(affineWasm.checksum.toFixed(6))
    },
    matmul: {
      shape: [matmulSize, matmulSize],
      iterations: matmulIterations,
      wasmMs: Number(matmulWasm.elapsedMs.toFixed(3)),
      jsMs: Number(matmulJs.elapsedMs.toFixed(3)),
      speedup: Number((matmulJs.elapsedMs / matmulWasm.elapsedMs).toFixed(3)),
      checksum: Number(matmulWasm.checksum.toFixed(6))
    },
    diagonalSpecialization: {
      optimization: "diagonal matmul/inverse/solve specialization",
      shape: [diagonalSize, diagonalSize],
      rhsCols: diagonalRhsCols,
      iterations: diagonalIterations,
      wasmMs: Number(diagonalWasm.elapsedMs.toFixed(3)),
      jsMs: Number(diagonalJs.elapsedMs.toFixed(3)),
      speedup: Number((diagonalJs.elapsedMs / diagonalWasm.elapsedMs).toFixed(3)),
      checksum: Number(diagonalWasm.checksum.toFixed(6))
    },
    broadcastFusion: {
      optimization: "row/column broadcast fused into elementwise DAG",
      shape: [elementRows, elementCols],
      iterations: broadcastIterations,
      wasmMs: Number(broadcastWasm.elapsedMs.toFixed(3)),
      jsMs: Number(broadcastJs.elapsedMs.toFixed(3)),
      speedup: Number((broadcastJs.elapsedMs / broadcastWasm.elapsedMs).toFixed(3)),
      checksum: Number(broadcastWasm.checksum.toFixed(6))
    },
    distributiveGemm: {
      optimization: "A*B + A*C -> A*(B+C)",
      shapes: [[128, 64], [64, 96], [64, 96]],
      iterations: distributiveIterations,
      optimizedMs: Number(distributiveOptimized.elapsedMs.toFixed(3)),
      materializedMs: Number(distributiveMaterialized.elapsedMs.toFixed(3)),
      speedup: Number((distributiveMaterialized.elapsedMs / distributiveOptimized.elapsedMs).toFixed(3)),
      checksum: Number(distributiveOptimized.checksum.toFixed(6))
    },
    transposeAwareMatmul: {
      optimization: "transpose-aware matmul cost model selection",
      shapes: [[256, 64], [128, 64]],
      iterations: transposeIterations,
      awareMs: Number(transposeAware.elapsedMs.toFixed(3)),
      materializedMs: Number(transposeMaterialized.elapsedMs.toFixed(3)),
      speedup: Number((transposeMaterialized.elapsedMs / transposeAware.elapsedMs).toFixed(3)),
      checksum: Number(transposeAware.checksum.toFixed(6))
    },
    matmulChain: {
      shapes: [[256, 8], [8, 256], [256, 8]],
      iterations: chainIterations,
      optimizedMs: Number(chainOptimized.elapsedMs.toFixed(3)),
      leftAssociatedMs: Number(chainLeftAssociated.elapsedMs.toFixed(3)),
      speedup: Number((chainLeftAssociated.elapsedMs / chainOptimized.elapsedMs).toFixed(3)),
      checksum: Number(chainOptimized.checksum.toFixed(6))
    },
    linearAlgebra: {
      optimization: "LU cache shared by determinant/inverse/solve",
      shape: [linalgSize, linalgSize],
      rhsCols: linalgRhsCols,
      iterations: linalgIterations,
      wasmMs: Number(linalgWasm.elapsedMs.toFixed(3)),
      jsMs: Number(linalgJs.elapsedMs.toFixed(3)),
      speedup: Number((linalgJs.elapsedMs / linalgWasm.elapsedMs).toFixed(3)),
      checksum: Number(linalgWasm.checksum.toFixed(6))
    },
    choleskyCache: {
      optimization: "Gram/SPD Cholesky cache shared by determinant/logDet/inverse/solve",
      shape: [linalgSize, linalgSize],
      rhsCols: linalgRhsCols,
      iterations: choleskyIterations,
      wasmMs: Number(choleskyWasm.elapsedMs.toFixed(3)),
      jsMs: Number(choleskyJs.elapsedMs.toFixed(3)),
      speedup: Number((choleskyJs.elapsedMs / choleskyWasm.elapsedMs).toFixed(3)),
      checksum: Number(choleskyWasm.checksum.toFixed(6))
    },
    qrCache: {
      optimization: "QR cache shared by rank and leastSquares",
      shape: [qrRows, qrCols],
      rhsCols: linalgRhsCols,
      iterations: qrIterations,
      wasmMs: Number(qrWasm.elapsedMs.toFixed(3)),
      jsMs: Number(qrJs.elapsedMs.toFixed(3)),
      speedup: Number((qrJs.elapsedMs / qrWasm.elapsedMs).toFixed(3)),
      checksum: Number(qrWasm.checksum.toFixed(6))
    },
    reductionCache: {
      optimization: "expression result and scalar reduction cache reuse",
      shape: [elementRows, elementCols],
      iterations: reductionCacheIterations,
      cachedMs: Number(reductionCached.elapsedMs.toFixed(3)),
      freshMs: Number(reductionFresh.elapsedMs.toFixed(3)),
      speedup: Number((reductionFresh.elapsedMs / reductionCached.elapsedMs).toFixed(3)),
      checksum: Number(reductionCached.checksum.toFixed(6))
    },
    inverseMatmul: {
      shape: [linalgSize, linalgSize],
      rhsCols: linalgRhsCols,
      iterations: inverseMatmulIterations,
      wasmMs: Number(inverseMatmulWasm.elapsedMs.toFixed(3)),
      jsMs: Number(inverseMatmulJs.elapsedMs.toFixed(3)),
      speedup: Number((inverseMatmulJs.elapsedMs / inverseMatmulWasm.elapsedMs).toFixed(3)),
      checksum: Number(inverseMatmulWasm.checksum.toFixed(6))
    }
  };

  console.log(`[wasmatrix:e2e-benchmark] ${JSON.stringify(summary)}`);
});
