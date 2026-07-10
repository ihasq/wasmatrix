import Link from "@docusaurus/Link";
import Layout from "@theme/Layout";
import clsx from "clsx";
import { useEffect, useMemo, useRef } from "react";
import styles from "./index.module.css";

const MATRIX_COLUMNS = 32;
const MATRIX_ROWS = 22;
const MATRIX_CELL_COUNT = MATRIX_COLUMNS * MATRIX_ROWS;
const MATRIX_LAYER_SALTS = [3];
const MATRIX_TOTAL_CELLS = MATRIX_CELL_COUNT * MATRIX_LAYER_SALTS.length;
const MATRIX_FRAME_UPDATE_COUNT = Math.ceil(MATRIX_TOTAL_CELLS / 3);

const features = [
  {
    title: "WASM memory first",
    body: "Matrix buffers stay in WebAssembly memory until an explicit readback asks for JavaScript values."
  },
  {
    title: "Algebra-aware execution",
    body: "Lazy elementwise DAGs, transpose views, structure tags, and factorization caches reduce avoidable passes."
  },
  {
    title: "Browser and server",
    body: "The ESM package ships JavaScript and WASM separately, using a bundler-friendly asset URL."
  }
];

const operations = [
  "elementwise fusion",
  "matrix multiplication",
  "LU / Cholesky / QR",
  "Gram specialization",
  "broadcast vectors",
  "lazy inverse solves"
];

function matrixValue(index, tick, salt) {
  const mixed = (index * 73 + tick * 37 + salt * 131 + ((index + tick + salt) % 11) * 19) % 199;
  return mixed - 99;
}

function randomMatrixValue(previous) {
  let next = Math.floor(Math.random() * 199) - 99;
  if (next === previous) next = next === 99 ? -99 : next + 1;
  return next;
}

function initialMatrixValues() {
  return Array.from({ length: MATRIX_TOTAL_CELLS }, (_, globalIndex) => {
    const layerIndex = Math.floor(globalIndex / MATRIX_CELL_COUNT);
    const cellIndex = globalIndex % MATRIX_CELL_COUNT;
    return matrixValue(cellIndex, layerIndex * 17, MATRIX_LAYER_SALTS[layerIndex]);
  });
}

function MatrixProcessingBackdrop() {
  const initialValues = useMemo(() => initialMatrixValues(), []);
  const valuesRef = useRef(initialValues);
  const cellsRef = useRef([]);
  const cellIndexes = useMemo(
    () => Array.from({ length: MATRIX_CELL_COUNT }, (_, index) => index),
    []
  );

  useEffect(() => {
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (reducedMotion?.matches) return undefined;

    let frameId = 0;
    const animate = () => {
      const updated = new Set();

      while (updated.size < MATRIX_FRAME_UPDATE_COUNT) {
        updated.add(Math.floor(Math.random() * MATRIX_TOTAL_CELLS));
      }

      for (const globalIndex of updated) {
        const nextValue = randomMatrixValue(valuesRef.current[globalIndex]);
        valuesRef.current[globalIndex] = nextValue;
        const cell = cellsRef.current[globalIndex];
        if (cell != null) cell.textContent = String(nextValue);
      }

      frameId = window.requestAnimationFrame(animate);
    };

    frameId = window.requestAnimationFrame(animate);

    return () => window.cancelAnimationFrame(frameId);
  }, []);

  return (
    <div className={styles.matrixScene} aria-hidden="true">
      {MATRIX_LAYER_SALTS.map((salt, layerIndex) => (
        <div
          className={clsx(styles.matrixLayer, styles.matrixLayerPrimary)}
          key={salt}
          style={{ "--matrix-columns": String(MATRIX_COLUMNS) }}
        >
          {cellIndexes.map((index) => {
            const globalIndex = layerIndex * MATRIX_CELL_COUNT + index;
            return (
              <span
                key={index}
                ref={(node) => {
                  cellsRef.current[globalIndex] = node;
                }}
              >
                {initialValues[globalIndex]}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  return (
    <Layout
      title="WASMatrix"
      description="AssemblyScript matrix operations for WebAssembly SIMD runtimes."
    >
      <main>
        <section className={styles.hero}>
          <MatrixProcessingBackdrop />
          <div className={styles.heroInner}>
            <p className={styles.eyebrow}>AssemblyScript + WebAssembly SIMD</p>
            <h1>WASMatrix</h1>
            <p className={styles.lede}>
              Fast dense matrix operations for JavaScript runtimes, with a TypeScript API and a SIMD-required WASM core.
            </p>
            <div className={styles.actions}>
              <Link className="button button--primary button--lg" to="/docs/getting-started">
                Get started
              </Link>
              <Link className="button button--secondary button--lg" to="/docs/api-guide">
                API guide
              </Link>
            </div>
            <div className={styles.install} aria-label="Install command">
              <code>npm install wasmatrix</code>
            </div>
          </div>
        </section>

        <section className={styles.band}>
          <div className={styles.sectionInner}>
            <div className={styles.featureGrid}>
              {features.map((feature) => (
                <article className={styles.feature} key={feature.title}>
                  <h2>{feature.title}</h2>
                  <p>{feature.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.splitBand}>
          <div className={styles.sectionInner}>
            <div className={styles.split}>
              <div>
                <p className={styles.eyebrow}>Try the runtime</p>
                <h2>Use the same Matrix API in the guide.</h2>
                <p>
                  The documentation includes a CodeMirror-based sandbox custom element with a live console, so examples can stay close to the API they describe.
                </p>
              </div>
              <wasmatrix-sandbox
                code={`const a = Matrix.from(2, 2, [
  4, 7,
  2, 6
]);

const inverse = a.inverse();
const identity = a.matmul(inverse);

console.log("det(A)", a.determinant());
console.table(identity.toArray());`}
              ></wasmatrix-sandbox>
            </div>
          </div>
        </section>

        <section className={clsx(styles.band, styles.tightBand)}>
          <div className={styles.sectionInner}>
            <div className={styles.opsHeader}>
              <p className={styles.eyebrow}>What it optimizes</p>
              <h2>Less copying, fewer passes, reusable decomposition work.</h2>
            </div>
            <div className={styles.operationList}>
              {operations.map((operation) => (
                <span key={operation}>{operation}</span>
              ))}
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
