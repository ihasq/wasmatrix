import Link from "@docusaurus/Link";
import Head from "@docusaurus/Head";
import Layout from "@theme/Layout";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import clsx from "clsx";
import { useEffect, useRef } from "react";
import siteContent from "../i18n/siteContent.ts";
import styles from "./index.module.css";

const { getContentForLocale, homeContent } = siteContent;

const GITHUB_URL = "https://github.com/ihasq/wasmatrix";
const NPM_URL = "https://www.npmjs.com/package/wasmatrix";
const INSTALL_COMMAND = "npm install wasmatrix";
const SEO_KEYWORDS = [
  "WASMatrix",
  "WebAssembly SIMD",
  "AssemblyScript",
  "TypeScript matrix library",
  "JavaScript linear algebra",
  "WASM matrix operations",
];
const MATRIX_TILE_COLUMNS = 16;
const MATRIX_TILE_ROWS = 16;
const MATRIX_CELL_WIDTH = 86;
const MATRIX_CELL_HEIGHT = 52;
const MATRIX_TILE_WIDTH = MATRIX_TILE_COLUMNS * MATRIX_CELL_WIDTH;
const MATRIX_TILE_HEIGHT = MATRIX_TILE_ROWS * MATRIX_CELL_HEIGHT;
const MATRIX_CELL_COUNT = MATRIX_TILE_COLUMNS * MATRIX_TILE_ROWS;
const MATRIX_FRAME_UPDATE_COUNT = Math.ceil(MATRIX_CELL_COUNT / 3);
const MATRIX_VALUE_SPAN = 257;
const MATRIX_VALUE_OFFSET = 128;
const MATRIX_CELLS = Array.from({ length: MATRIX_CELL_COUNT }, (_, index) => {
  const column = index % MATRIX_TILE_COLUMNS;
  const row = Math.floor(index / MATRIX_TILE_COLUMNS);

  return {
    index,
    x: column * MATRIX_CELL_WIDTH + MATRIX_CELL_WIDTH / 2,
    y: row * MATRIX_CELL_HEIGHT + MATRIX_CELL_HEIGHT * 0.66,
    value: matrixInteger(index + 1),
    strong: (index + row) % 9 === 0,
  };
});
const MATRIX_VERTICAL_LINES = Array.from(
  { length: MATRIX_TILE_COLUMNS + 1 },
  (_, index) => index * MATRIX_CELL_WIDTH,
);
const MATRIX_HORIZONTAL_LINES = Array.from(
  { length: MATRIX_TILE_ROWS + 1 },
  (_, index) => index * MATRIX_CELL_HEIGHT,
);

function matrixInteger(seed) {
  let value = Math.imul(seed ^ 0x85ebca6b, 0xc2b2ae35) >>> 0;
  value = (value ^ (value >>> 15)) >>> 0;
  return String((value % MATRIX_VALUE_SPAN) - MATRIX_VALUE_OFFSET);
}

async function copyTextToClipboard(value) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch (_error) {
      // Fall through to the selection-based copy path.
    }
  }

  if (typeof document === "undefined") {
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  document.body.append(textarea);
  textarea.select();

  try {
    document.execCommand("copy");
  } finally {
    textarea.remove();
  }
}

function MatrixProcessingBackdrop() {
  const patternRef = useRef(null);
  const valueRefs = useRef([]);

  useEffect(() => {
    const pattern = patternRef.current;
    if (pattern == null) {
      return undefined;
    }

    const reducedMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    if (reducedMotion) {
      return undefined;
    }

    let frameId = 0;
    let randomState = 0x6d2b79f5;
    const nextRandom = () => {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
      return randomState;
    };
    const nextInteger = () =>
      String((nextRandom() % MATRIX_VALUE_SPAN) - MATRIX_VALUE_OFFSET);
    const nextIntegerExcept = (previous) => {
      let next = nextInteger();
      if (next === previous) {
        next = String(
          ((Number(next) + MATRIX_VALUE_OFFSET + 1) % MATRIX_VALUE_SPAN) -
            MATRIX_VALUE_OFFSET,
        );
      }
      return next;
    };
    const updateOrder = Array.from(
      { length: MATRIX_CELL_COUNT },
      (_, index) => index,
    );
    const shuffleUpdateOrder = () => {
      for (let index = updateOrder.length - 1; index > 0; index -= 1) {
        const swapIndex = nextRandom() % (index + 1);
        [updateOrder[index], updateOrder[swapIndex]] = [
          updateOrder[swapIndex],
          updateOrder[index],
        ];
      }
    };
    let updateCursor = MATRIX_CELL_COUNT;
    const updateValues = () => {
      for (let offset = 0; offset < MATRIX_FRAME_UPDATE_COUNT; offset += 1) {
        if (updateCursor >= MATRIX_CELL_COUNT) {
          shuffleUpdateOrder();
          updateCursor = 0;
        }
        const index = updateOrder[updateCursor];
        updateCursor += 1;
        const node = valueRefs.current[index];
        if (node != null) {
          node.textContent = nextIntegerExcept(node.textContent);
        }
      }
    };
    const animate = (timestamp) => {
      const phase = (timestamp * 0.032) % MATRIX_TILE_WIDTH;
      pattern.setAttribute(
        "patternTransform",
        `translate(${-phase} ${phase * 0.42})`,
      );
      updateValues();
      frameId = window.requestAnimationFrame(animate);
    };

    frameId = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <div className={styles.matrixScene} aria-hidden="true">
      <svg
        className={styles.matrixSvg}
        viewBox="0 0 1920 1080"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <pattern
            id="matrix-processing-tile"
            ref={patternRef}
            width={MATRIX_TILE_WIDTH}
            height={MATRIX_TILE_HEIGHT}
            patternUnits="userSpaceOnUse"
          >
            <rect
              className={styles.matrixTileBase}
              width={MATRIX_TILE_WIDTH}
              height={MATRIX_TILE_HEIGHT}
            />
            {MATRIX_VERTICAL_LINES.map((x) => (
              <line
                className={styles.matrixGridLine}
                key={`v-${x}`}
                x1={x}
                x2={x}
                y1="0"
                y2={MATRIX_TILE_HEIGHT}
              />
            ))}
            {MATRIX_HORIZONTAL_LINES.map((y) => (
              <line
                className={styles.matrixGridLine}
                key={`h-${y}`}
                x1="0"
                x2={MATRIX_TILE_WIDTH}
                y1={y}
                y2={y}
              />
            ))}
            {MATRIX_CELLS.map((cell) => (
              <text
                className={clsx(
                  styles.matrixNumber,
                  cell.strong && styles.matrixNumberStrong,
                )}
                key={cell.index}
                ref={(node) => {
                  valueRefs.current[cell.index] = node;
                }}
                x={cell.x}
                y={cell.y}
                textAnchor="middle"
              >
                {cell.value}
              </text>
            ))}
          </pattern>
        </defs>
        <rect
          className={styles.matrixFill}
          x="-50%"
          y="-50%"
          width="200%"
          height="200%"
          fill="url(#matrix-processing-tile)"
        />
      </svg>
    </div>
  );
}

export default function Home() {
  const {
    i18n: { currentLocale, defaultLocale },
    siteConfig,
  } = useDocusaurusContext();
  const content = getContentForLocale(homeContent, currentLocale);
  const siteUrl = siteConfig.url.replace(/\/+$/, "");
  const pageUrl = currentLocale === defaultLocale
    ? siteUrl
    : `${siteUrl}/${currentLocale}`;
  const socialImageUrl = `${siteUrl}/img/social-card.png`;
  const seoTitle = `${content.title} - WebAssembly SIMD matrix operations`;
  const seoDescription = content.lede || content.description;
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareSourceCode",
      name: "WASMatrix",
      description: seoDescription,
      url: pageUrl,
      image: socialImageUrl,
      codeRepository: GITHUB_URL,
      programmingLanguage: ["TypeScript", "AssemblyScript"],
      runtimePlatform: ["WebAssembly", "Node.js", "Deno", "Bun", "Web browser"],
      license: "https://opensource.org/licenses/MIT",
      keywords: SEO_KEYWORDS.join(", "),
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "WASMatrix",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Cross-platform",
      description: seoDescription,
      url: pageUrl,
      installUrl: NPM_URL,
      softwareVersion: "0.0.4",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "WASMatrix Docs",
      url: siteUrl,
      description: content.description,
      inLanguage: currentLocale,
    },
  ];

  return (
    <Layout
      title={content.title}
      description={content.description}
    >
      <Head>
        <meta name="description" content={seoDescription} />
        <meta name="keywords" content={SEO_KEYWORDS.join(", ")} />
        <meta property="og:title" content={seoTitle} />
        <meta property="og:description" content={seoDescription} />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:image" content={socialImageUrl} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="WASMatrix documentation" />
        <meta name="twitter:title" content={seoTitle} />
        <meta name="twitter:description" content={seoDescription} />
        <meta name="twitter:image" content={socialImageUrl} />
        <meta name="twitter:image:alt" content="WASMatrix documentation" />
        <link rel="canonical" href={pageUrl} />
        <script type="application/ld+json">
          {JSON.stringify(structuredData)}
        </script>
      </Head>
      <main className={styles.page}>
        <section className={styles.hero}>
          <MatrixProcessingBackdrop />
          <div className={styles.heroInner}>
            <p className={styles.eyebrow}>{content.eyebrow}</p>
            <h1>WASMatrix</h1>
            <p className={styles.lede}>
              {content.lede}
            </p>
            <div className={styles.actions}>
              <Link
                className="button button--primary button--lg"
                to="/docs/getting-started"
              >
                {content.getStarted}
              </Link>
              <Link
                className="button button--secondary button--lg"
                to="/docs/api-guide"
              >
                {content.apiGuide}
              </Link>
            </div>
            <button
              className={styles.install}
              type="button"
              aria-label={`${content.installAria}: ${INSTALL_COMMAND}`}
              title={content.installAria}
              onClick={() => {
                void copyTextToClipboard(INSTALL_COMMAND);
              }}
            >
              <code>{INSTALL_COMMAND}</code>
            </button>
          </div>
        </section>

        <section className={styles.band}>
          <div className={styles.sectionInner}>
            <div className={styles.featureGrid}>
              {content.features.map((feature) => (
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
                <p className={styles.eyebrow}>{content.tryEyebrow}</p>
                <h2>{content.tryTitle}</h2>
                <p>
                  {content.tryBody}
                </p>
              </div>
              <wasmatrix-sandbox
                code={`const a = Matrix.from(2, 2, [
  1, 2,
  3, 4
]);

const b = Matrix.from(2, 2, [
  5, 6,
  7, 8
]);

const product = a.matmul(b);

console.table(product.toArray());`}
              >
              </wasmatrix-sandbox>
            </div>
          </div>
        </section>

        <section className={clsx(styles.band, styles.tightBand)}>
          <div className={styles.sectionInner}>
            <div className={styles.opsHeader}>
              <p className={styles.eyebrow}>{content.optimizeEyebrow}</p>
              <h2>{content.optimizeTitle}</h2>
            </div>
            <div className={styles.operationList}>
              {content.operations.map((operation) => (
                <span key={operation}>{operation}</span>
              ))}
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
