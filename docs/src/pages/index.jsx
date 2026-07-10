import Link from "@docusaurus/Link";
import Layout from "@theme/Layout";
import clsx from "clsx";
import styles from "./index.module.css";

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

export default function Home() {
  return (
    <Layout
      title="WASMatrix"
      description="AssemblyScript matrix operations for WebAssembly SIMD runtimes."
    >
      <main>
        <section className={styles.hero}>
          <div className={styles.matrixScene} aria-hidden="true">
            {Array.from({ length: 72 }).map((_, index) => (
              <span key={index}>{((index * 7 + 3) % 19) - 9}</span>
            ))}
          </div>
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
