import assert from "node:assert/strict";
import test from "node:test";

function readEnv(name) {
  if (typeof Deno !== "undefined") {
    return Deno.env.get(name);
  }
  return process.env[name];
}

function envInt(name, fallback) {
  const raw = readEnv(name);
  if (raw == null || raw === "") return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }
  return value;
}

function envIntList(name, fallback) {
  const raw = readEnv(name);
  if (raw == null || raw === "") return fallback;

  const values = raw.split(",").map((part) => {
    const value = Number(part.trim());
    if (!Number.isInteger(value) || value <= 0) {
      throw new RangeError(`${name} must contain positive integers`);
    }
    return value;
  });

  if (values.length === 0) {
    throw new RangeError(`${name} must contain at least one integer`);
  }
  return values;
}

function benchmarkConfigFromEnv() {
  return {
    elementRows: envInt("WASMATRIX_BENCH_ELEMENT_ROWS", 64),
    elementCols: envInt("WASMATRIX_BENCH_ELEMENT_COLS", 64),
    elementIterations: envInt("WASMATRIX_BENCH_ELEMENT_ITERS", 8),
    affineIterations: envInt("WASMATRIX_BENCH_AFFINE_ITERS", 24),
    matmulSize: envInt("WASMATRIX_BENCH_MATMUL_SIZE", 48),
    matmulIterations: envInt("WASMATRIX_BENCH_MATMUL_ITERS", 6),
    diagonalSize: envInt("WASMATRIX_BENCH_DIAGONAL_SIZE", 64),
    diagonalRhsCols: envInt("WASMATRIX_BENCH_DIAGONAL_RHS_COLS", 8),
    diagonalIterations: envInt("WASMATRIX_BENCH_DIAGONAL_ITERS", 6),
    broadcastIterations: envInt("WASMATRIX_BENCH_BROADCAST_ITERS", 8),
    distributiveIterations: envInt("WASMATRIX_BENCH_DISTRIBUTIVE_ITERS", 4),
    transposeIterations: envInt("WASMATRIX_BENCH_TRANSPOSE_ITERS", 3),
    chainIterations: envInt("WASMATRIX_BENCH_CHAIN_ITERS", 10),
    linalgSize: envInt("WASMATRIX_BENCH_LINALG_SIZE", 12),
    linalgRhsCols: envInt("WASMATRIX_BENCH_LINALG_RHS_COLS", 3),
    linalgIterations: envInt("WASMATRIX_BENCH_LINALG_ITERS", 8),
    choleskyIterations: envInt("WASMATRIX_BENCH_CHOLESKY_ITERS", 8),
    qrRows: envInt("WASMATRIX_BENCH_QR_ROWS", 24),
    qrCols: envInt("WASMATRIX_BENCH_QR_COLS", 8),
    qrIterations: envInt("WASMATRIX_BENCH_QR_ITERS", 10),
    reductionCacheIterations: envInt(
      "WASMATRIX_BENCH_REDUCTION_CACHE_ITERS",
      24,
    ),
    inverseMatmulIterations: envInt("WASMATRIX_BENCH_INVERSE_MATMUL_ITERS", 12),
    sweepElementSizes: envIntList("WASMATRIX_BENCH_SWEEP_ELEMENT_SIZES", [
      64,
      128,
      192,
    ]),
    sweepElementIterations: envInt("WASMATRIX_BENCH_SWEEP_ELEMENT_ITERS", 4),
    sweepMatmulSizes: envIntList("WASMATRIX_BENCH_SWEEP_MATMUL_SIZES", [
      32,
      64,
      96,
    ]),
    sweepMatmulIterations: envInt("WASMATRIX_BENCH_SWEEP_MATMUL_ITERS", 2),
    sweepTorusSizes: envIntList("WASMATRIX_BENCH_SWEEP_TORUS_SIZES", [
      64,
      128,
      192,
    ]),
    sweepTorusRhsCols: envInt("WASMATRIX_BENCH_SWEEP_TORUS_RHS_COLS", 32),
    sweepTorusIterations: envInt("WASMATRIX_BENCH_SWEEP_TORUS_ITERS", 4),
  };
}

function assertDataComputeSweep(summary) {
  const sweep = summary.dataComputeSweep;
  assert.ok(sweep.elementwise.length >= 2);
  assert.ok(sweep.matmul.length >= 2);
  assert.ok(sweep.torusAction.length >= 2);
  assert.equal(sweep.analysis.elementwiseIntensityGrowth, 1);
  assert.equal(sweep.analysis.torusIntensityGrowth, 1);
  assert.ok(sweep.analysis.matmulIntensityGrowth > 1);

  for (let i = 1; i < sweep.matmul.length; i++) {
    assert.ok(
      sweep.matmul[i].operationsPerByte > sweep.matmul[i - 1].operationsPerByte,
      "dense GEMM arithmetic intensity must increase with matrix size",
    );
  }
}

function runBenchmarkInDenoWorker(config) {
  const worker = new Worker(
    new URL("./e2e-benchmark-worker.ts?worker=1", import.meta.url).href,
    {
      type: "module",
    },
  );

  return new Promise((resolve, reject) => {
    worker.onmessage = (event) => {
      const message = event.data;

      if (message.ready === true) {
        worker.postMessage(config);
        return;
      }

      worker.terminate();

      if (message.capturedConsoleCount !== 0) {
        reject(
          new Error(
            `benchmark worker wrote to console: ${
              JSON.stringify(message.capturedConsolePreview)
            }`,
          ),
        );
        return;
      }

      if (!message.ok) {
        const error = new Error(message.error.message);
        error.name = message.error.name;
        error.stack = message.error.stack;
        reject(error);
        return;
      }

      resolve(message.summary);
    };

    worker.onerror = (event) => {
      worker.terminate();
      reject(event.error ?? new Error(event.message));
    };
  });
}

async function runBenchmark(config) {
  if (typeof Deno !== "undefined") {
    return await runBenchmarkInDenoWorker(config);
  }

  const workerModule = await import("./e2e-benchmark-worker.ts");
  return workerModule.runBenchmarkSuite(config);
}

test("E2E benchmark: Deno Worker computes matrix load ratios silently", {
  timeout: 180_000,
}, async () => {
  const summary = await runBenchmark(benchmarkConfigFromEnv());

  assertDataComputeSweep(summary);
  console.log(`[wasmatrix:e2e-benchmark] ${JSON.stringify(summary)}`);
});
