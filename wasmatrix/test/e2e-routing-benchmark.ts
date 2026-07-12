import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import test from "node:test";
import { makeData } from "./helpers/reference-matrix.ts";

function readEnv(name: string) {
  if (typeof Deno !== "undefined") {
    return Deno.env.get(name);
  }
  return process.env[name];
}

function envInt(name: string, fallback: number) {
  const raw = readEnv(name);
  if (raw == null || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }
  return value;
}

async function instantiate(path: string) {
  const bytes = readFileSync(new URL(path, import.meta.url));
  const { instance } = await WebAssembly.instantiate(bytes, {
    env: {
      abort(_message, _file, line, column) {
        throw new Error(`${path} wasm abort at ${line}:${column}`);
      },
    },
  });
  return instance.exports as any;
}

function writeF32(exports: any, values: ArrayLike<number>) {
  const ptr = exports.allocF32(values.length);
  new Float32Array(exports.memory.buffer, ptr, values.length).set(values);
  return ptr;
}

function checksumF32(exports: any, ptr: number, length: number) {
  const values = new Float32Array(exports.memory.buffer, ptr, length);
  let checksum = 0;
  for (let i = 0; i < values.length; i++) {
    checksum += values[i] * ((i % 17) + 1);
  }
  return checksum;
}

function checksumArray(values: ArrayLike<number>) {
  let checksum = 0;
  for (let i = 0; i < values.length; i++) {
    checksum += values[i] * ((i % 17) + 1);
  }
  return checksum;
}

function assertClose(
  actual: number,
  expected: number,
  name: string,
  tolerance = 1e-3,
) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${name}: expected ${expected}, got ${actual}`,
  );
}

function timed(fn: () => number) {
  const start = performance.now();
  const checksum = fn();
  return {
    checksum,
    elapsedMs: performance.now() - start,
  };
}

function round(value: number, digits = 3) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function ratio(referenceMs: number, candidateMs: number) {
  return round(referenceMs / candidateMs, 6);
}

function applyReferenceWeight(input: Float32Array) {
  const output = new Float32Array(input.length);
  for (let i = 0; i < input.length; i += 4) {
    const a = input[i] ?? 0;
    const b = input[i + 1] ?? 0;
    const c = input[i + 2] ?? 0;
    const d = input[i + 3] ?? 0;
    output[i] = Math.fround(0.5 * a + 0.5 * c);
    if (i + 1 < input.length) output[i + 1] = Math.fround(1.25 * b);
    if (i + 2 < input.length) {
      output[i + 2] = Math.fround(-0.125 * a + 0.875 * c);
    }
    if (i + 3 < input.length) output[i + 3] = d;
  }
  return output;
}

function runReferenceWash(input: Float32Array, iterations: number) {
  return timed(() => {
    let checksum = 0;
    for (let i = 0; i < iterations; i++) {
      checksum += checksumArray(applyReferenceWeight(input));
    }
    return checksum;
  });
}

function runWasmatrixWash(
  wasmatrix: any,
  input: Float32Array,
  iterations: number,
) {
  const inputPtr = writeF32(wasmatrix, input);
  const outputPtr = wasmatrix.allocF32(input.length);
  const operator = wasmatrix.allocF64(wasmatrix.operatorStateF64Length());

  const setup = timed(() => {
    wasmatrix.operatorResetIdentity(operator);
    wasmatrix.operatorBlendOutputLanes(operator, 0, 2, 0.5);
    wasmatrix.operatorScaleOutputLane(operator, 1, 1.25);
    wasmatrix.operatorAddOutputLane(operator, 2, 0, -0.25);
    return 0;
  });

  const wash = timed(() => {
    let checksum = 0;
    for (let i = 0; i < iterations; i++) {
      assert.equal(
        wasmatrix.operatorApplyF32(
          operator,
          inputPtr,
          input.length,
          outputPtr,
        ),
        1,
      );
      checksum += checksumF32(wasmatrix, outputPtr, input.length);
    }
    return checksum;
  });

  return {
    setupMs: setup.elapsedMs,
    washMs: wash.elapsedMs,
    checksum: wash.checksum,
  };
}

test(
  "E2E benchmark: wasmatrix compact operator washes matrix data once",
  {
    timeout: 180_000,
  },
  async () => {
    const wasmatrix = await instantiate("../build/wasmatrix.wasm");
    const rows = envInt("WASMATRIX_ROUTE_BENCH_ROWS", 192);
    const cols = envInt("WASMATRIX_ROUTE_BENCH_COLS", 192);
    const iterations = envInt("WASMATRIX_ROUTE_BENCH_ITERS", 50);
    const input = makeData(rows, cols, 0x1a2b3c4d, { min: -2, max: 2 });

    assert.equal(wasmatrix.operatorAbiVersion(), 4);
    assert.equal(wasmatrix.operatorStateF64Length(), 16);
    assert.equal(wasmatrix.operatorSlabF32Length, undefined);
    assert.equal(wasmatrix.executeLoadedOperator, undefined);

    const reference = runReferenceWash(input, iterations);
    const wasm = runWasmatrixWash(wasmatrix, input, iterations);
    assertClose(
      wasm.checksum,
      reference.checksum,
      "wasmatrix compact operator checksum",
      Math.max(1e-3, Math.abs(reference.checksum) * 2e-5),
    );

    const summary = {
      config: { rows, cols, iterations, cells: rows * cols },
      wasmatrix: {
        setupMs: round(wasm.setupMs),
        washMs: round(wasm.washMs),
        totalMs: round(wasm.setupMs + wasm.washMs),
        wasmCallsPerIteration: 1,
      },
      reference: {
        washMs: round(reference.elapsedMs),
      },
      speedupVsJsReference: ratio(reference.elapsedMs, wasm.washMs),
      topology: {
        apiCallsTouchMatrix: false,
        operatorWeightCells: 16,
        writeOutPasses: 1,
        denseWeightMaterialized: false,
      },
      checksum: round(reference.checksum, 6),
    };

    console.log(`[wasmatrix:routing-benchmark] ${JSON.stringify(summary)}`);
  },
);
