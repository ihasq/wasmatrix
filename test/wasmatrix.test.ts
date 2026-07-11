import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

async function createCoreExports(): Promise<any> {
  const bytes = readFileSync(
    new URL("../build/wasmatrix.wasm", import.meta.url),
  );
  const { instance } = await WebAssembly.instantiate(bytes, {
    env: {
      abort(_message, _file, line, column) {
        throw new Error(`wasmatrix wasm abort at ${line}:${column}`);
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

function writeI32(exports: any, values: number[]) {
  const ptr = exports.allocI32(values.length);
  new Int32Array(exports.memory.buffer, ptr, values.length).set(values);
  return ptr;
}

function readF32(exports: any, ptr: number, length: number) {
  return Array.from(new Float32Array(exports.memory.buffer, ptr, length));
}

function readF64(exports: any, ptr: number, length: number) {
  return Array.from(new Float64Array(exports.memory.buffer, ptr, length));
}

function assertAlmostEqual(actual: number, expected: number, epsilon = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${expected}, got ${actual}`,
  );
}

function assertArrayAlmostEqual(
  actual: number[],
  expected: number[],
  epsilon = 1e-9,
) {
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < actual.length; i++) {
    assertAlmostEqual(actual[i], expected[i], epsilon);
  }
}

test("wasmatrix exposes the compact 4x4 weight operator as the primary core", async () => {
  const exports = await createCoreExports();

  assert.equal(exports.abiVersion(), 10);
  assert.equal(exports.weightSystemAbiVersion(), 1);
  assert.equal(exports.operatorAbiVersion(), 4);
  assert.equal(exports.simdProbe(), 1);
  assert.equal(exports.certificateLanes(), 4);
  assert.equal(exports.certificateHomogeneousLane(), 3);
  assert.equal(exports.weightCells(), 16);
  assert.equal(exports.operatorWeightCells(), 16);
  assert.equal(exports.operatorStateF64Length(), 16);
  assertAlmostEqual(exports.oneFourth(), 1 / 4);

  assert.equal(exports.operatorSlabF32Length, undefined);
  assert.equal(exports.executeLoadedOperator, undefined);
  assert.equal(exports.loadLeftMatmulOperator, undefined);
});

test("wasmatrix computes the anti-weight skip mask in O(1)", async () => {
  const exports = await createCoreExports();
  const operator = exports.allocF64(exports.operatorStateF64Length());

  exports.operatorResetIdentity(operator);
  assert.equal(
    exports.operatorSkipMask(operator) &
      exports.operatorZeroCoefficientMaskBits(),
    0x7bde,
  );

  exports.operatorSetInvariant(operator);
  assert.equal(exports.operatorSkipMask(operator), 0);

  exports.operatorClear(operator);
  assert.equal(
    exports.operatorSkipMask(operator) &
      exports.operatorZeroCoefficientMaskBits(),
    exports.operatorZeroCoefficientMaskBits(),
  );
  assert.equal(
    exports.operatorSkipMask(operator) & exports.operatorDeadInputMaskBits(),
    exports.operatorDeadInputMaskBits(),
  );
  assert.equal(
    exports.operatorSkipMask(operator) & exports.operatorDeadOutputMaskBits(),
    exports.operatorDeadOutputMaskBits(),
  );
});

test("wasmatrix API calls mutate only the 4x4 operator weight", async () => {
  const exports = await createCoreExports();
  const operator = exports.allocF64(exports.operatorStateF64Length());

  exports.operatorResetIdentity(operator);
  exports.operatorBlendOutputLanes(operator, 0, 2, 0.5);
  exports.operatorScaleOutputLane(operator, 1, 1.25);
  exports.operatorAddOutputLane(operator, 2, 0, -0.25);

  assertArrayAlmostEqual(
    [
      exports.operatorReadWeightCell(operator, 0, 0),
      exports.operatorReadWeightCell(operator, 0, 1),
      exports.operatorReadWeightCell(operator, 0, 2),
      exports.operatorReadWeightCell(operator, 0, 3),
      exports.operatorReadWeightCell(operator, 1, 0),
      exports.operatorReadWeightCell(operator, 1, 1),
      exports.operatorReadWeightCell(operator, 1, 2),
      exports.operatorReadWeightCell(operator, 1, 3),
      exports.operatorReadWeightCell(operator, 2, 0),
      exports.operatorReadWeightCell(operator, 2, 1),
      exports.operatorReadWeightCell(operator, 2, 2),
      exports.operatorReadWeightCell(operator, 2, 3),
      exports.operatorReadWeightCell(operator, 3, 0),
      exports.operatorReadWeightCell(operator, 3, 1),
      exports.operatorReadWeightCell(operator, 3, 2),
      exports.operatorReadWeightCell(operator, 3, 3),
    ],
    [0.5, 0, 0.5, 0, 0, 1.25, 0, 0, -0.125, 0, 0.875, 0, 0, 0, 0, 1],
  );
});

test("wasmatrix writes out by washing the target F32 matrix once", async () => {
  const exports = await createCoreExports();
  const input = writeF32(exports, [1, 4, 7, 10, 2, 5, 8, 11]);
  const output = exports.allocF32(8);
  const operator = exports.allocF64(exports.operatorStateF64Length());

  exports.operatorResetIdentity(operator);
  exports.operatorSetInvariant(operator);
  assert.equal(exports.operatorApplyF32(operator, input, 8, output), 1);
  assertArrayAlmostEqual(
    readF32(exports, output, 8),
    [5.5, 5.5, 5.5, 5.5, 6.5, 6.5, 6.5, 6.5],
    1e-6,
  );

  exports.operatorResetIdentity(operator);
  exports.operatorBlendOutputLanes(operator, 0, 2, 0.5);
  exports.operatorScaleOutputLane(operator, 1, 1.25);
  exports.operatorAddOutputLane(operator, 2, 0, -0.25);
  assert.equal(exports.operatorApplyF32(operator, input, 8, output), 1);
  assertArrayAlmostEqual(
    readF32(exports, output, 8),
    [4, 5, 6, 10, 5, 6.25, 6.75, 11],
    1e-6,
  );
});

test("wasmatrix chooses skip-mask kernels without changing results", async () => {
  const exports = await createCoreExports();
  const operator = exports.allocF64(exports.operatorStateF64Length());
  const input = writeF32(exports, [1, 2, 3, 4, 5, 6, 7, 8]);
  const output = exports.allocF32(8);

  exports.operatorResetIdentity(operator);
  assert.equal(exports.operatorApplyF32(operator, input, 8, output), 1);
  assertArrayAlmostEqual(readF32(exports, output, 8), [1, 2, 3, 4, 5, 6, 7, 8]);

  exports.operatorSetPhaseCycle(operator);
  assert.equal(exports.operatorApplyF32(operator, input, 8, output), 1);
  assertArrayAlmostEqual(readF32(exports, output, 8), [2, 3, 4, 1, 6, 7, 8, 5]);

  exports.operatorSetPhaseReverseCycle(operator);
  assert.equal(exports.operatorApplyF32(operator, input, 8, output), 1);
  assertArrayAlmostEqual(readF32(exports, output, 8), [4, 1, 2, 3, 8, 5, 6, 7]);

  exports.operatorClear(operator);
  exports.operatorWriteWeightCell(operator, 0, 0, 2);
  exports.operatorWriteWeightCell(operator, 1, 1, -3);
  exports.operatorWriteWeightCell(operator, 2, 2, 4);
  exports.operatorWriteWeightCell(operator, 3, 3, 5);
  assert.equal(exports.operatorApplyF32(operator, input, 8, output), 1);
  assertArrayAlmostEqual(
    readF32(exports, output, 8),
    [2, -6, 12, 20, 10, -18, 28, 40],
  );
});

test("wasmatrix operator wash is safe for in-place materialization", async () => {
  const exports = await createCoreExports();
  const data = writeF32(exports, [1, 2, 3, 4, 5, 6, 7, 8]);
  const operator = exports.allocF64(exports.operatorStateF64Length());

  exports.operatorSetPhaseCycle(operator);
  assert.equal(exports.operatorApplyF32(operator, data, 8, data), 1);
  assertArrayAlmostEqual(
    readF32(exports, data, 8),
    [2, 3, 4, 1, 6, 7, 8, 5],
    1e-6,
  );
});

test("wasmatrix records write-out loss without requiring an extra pass", async () => {
  const exports = await createCoreExports();
  const input = writeF32(exports, [1, 4, 7, 10, 2, 5, 8, 11]);
  const output = exports.allocF32(8);
  const operator = exports.allocF64(exports.operatorStateF64Length());
  const loss = exports.allocF64(3);

  exports.initLossState(loss);
  exports.operatorSetInvariant(operator);
  assert.equal(
    exports.operatorApplyF32AndRecordLoss(operator, input, 8, output, loss),
    1,
  );

  assertArrayAlmostEqual(
    readF32(exports, output, 8),
    [5.5, 5.5, 5.5, 5.5, 6.5, 6.5, 6.5, 6.5],
    1e-6,
  );
  assertAlmostEqual(exports.localLoss(loss), 90);
  assertAlmostEqual(exports.accumulatedLoss(loss), 90);
});

test("wasmatrix still supports compressed certificates and raw matmul batch", async () => {
  const exports = await createCoreExports();
  const data = writeF32(exports, [1, 4, 7, 10, 2, 5, 8, 11]);
  const certificate = exports.allocF64(4);
  const invariant = exports.allocF64(4);
  const weight = exports.allocF64(16);
  const loss = exports.allocF64(3);

  exports.initLossState(loss);
  exports.compressF32ToCertificate(data, 8, certificate, loss);
  assertArrayAlmostEqual(readF64(exports, certificate, 4), [
    1.5,
    4.5,
    7.5,
    10.5,
  ]);
  assertAlmostEqual(exports.accumulatedLoss(loss), 2);

  exports.apiSetInvariantWeight(weight);
  exports.applyWeightAndRecordLoss(weight, certificate, invariant, loss);
  assertArrayAlmostEqual(readF64(exports, invariant, 4), [6, 6, 6, 6]);
  assertAlmostEqual(
    exports.certificateResidualSquared(certificate, invariant),
    45,
  );
  assertAlmostEqual(exports.accumulatedLoss(loss), 47);

  const left = writeF32(exports, [1, 2, 3, 4]);
  const right = writeF32(exports, [5, 6, 7, 8]);
  const output = exports.allocF32(4);
  const slots = exports.batchInstructionI32Slots();
  const instruction = new Int32Array(slots);
  instruction.set([
    exports.batchOpcodeMatmul(),
    left,
    right,
    output,
    2,
    2,
    2,
  ]);

  assert.equal(
    exports.executeBatch(writeI32(exports, Array.from(instruction)), 1),
    1,
  );
  assertArrayAlmostEqual(readF32(exports, output, 4), [19, 22, 43, 50], 1e-5);

  const wat = readFileSync(
    new URL("../build/wasmatrix.wat", import.meta.url),
    "utf8",
  );
  assert.match(wat, /\(export "executeBatch"/);
  assert.match(wat, /\(export "operatorApplyF32"/);
  assert.match(wat, /\(export "operatorSkipMask"/);
  assert.doesNotMatch(wat, /\(export "executeLoadedOperator"/);
  assert.doesNotMatch(wat, /\(export "operatorSlabF32Length"/);
  assert.doesNotMatch(wat, /\(export "loadLeftMatmulOperator"/);
});
