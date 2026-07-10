import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import {
  defaultHighlightStyle,
  syntaxHighlighting,
} from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import siteConfig from "@generated/docusaurus.config";
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";

const DEFAULT_CODE = `const a = Matrix.from(2, 2, [
  4, 7,
  2, 6
]);

const inverse = a.inverse();
const identity = a.matmul(inverse);

console.log("det(A)", a.determinant());
console.table(identity.toArray());`;

const DEFAULT_RUNTIME_PATH = "wasmatrix-runtime/index.js";
const MATRIX_MODULE_CACHE_KEY = Symbol.for(
  "wasmatrix.docs.sandbox.matrixModuleCache",
);

function formatValue(value) {
  if (value instanceof Float32Array) {
    return `[${
      Array.from(value).map((item) => Number(item.toFixed(6))).join(", ")
    }]`;
  }
  if (Array.isArray(value) || (value && typeof value === "object")) {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function matrixModuleCache() {
  window[MATRIX_MODULE_CACHE_KEY] ??= new Map();
  return window[MATRIX_MODULE_CACHE_KEY];
}

function defaultPackageUrl() {
  return `${siteConfig.baseUrl}${DEFAULT_RUNTIME_PATH}`;
}

function importMatrixModule(url) {
  const cache = matrixModuleCache();
  if (!cache.has(url)) {
    const externalImport = new Function("url", "return import(url)");
    const promise = externalImport(url).catch((error) => {
      cache.delete(url);
      throw error;
    });
    cache.set(url, promise);
  }
  return cache.get(url);
}

function preloadMatrixModule(url = defaultPackageUrl()) {
  return importMatrixModule(url);
}

if (
  typeof window !== "undefined" && typeof HTMLElement !== "undefined" &&
  !window.customElements.get("wasmatrix-sandbox")
) {
  preloadMatrixModule().catch(() => {
    // The sandbox will surface the concrete loading error when the user runs code.
  });

  class WasmatrixSandbox extends HTMLElement {
    static observedAttributes = ["code", "package-url"];

    #editor = null;
    #consoleEl = null;
    #runButton = null;
    #statusEl = null;

    constructor() {
      super();
      this.attachShadow({ mode: "open" });
    }

    connectedCallback() {
      if (this.#editor != null) return;
      this.#render();
    }

    disconnectedCallback() {
      this.#editor?.destroy();
      this.#editor = null;
    }

    attributeChangedCallback() {
      if (this.#editor == null) return;
      const code = this.#initialCode();
      this.#editor.dispatch({
        changes: {
          from: 0,
          to: this.#editor.state.doc.length,
          insert: code,
        },
      });
    }

    #initialCode() {
      const attr = this.getAttribute("code");
      if (attr != null && attr.trim() !== "") return attr;
      const text = this.textContent?.trim();
      return text || DEFAULT_CODE;
    }

    #packageUrl() {
      const override = this.getAttribute("package-url");
      if (override != null && override.trim() !== "") return override;
      return defaultPackageUrl();
    }

    #render() {
      preloadMatrixModule(this.#packageUrl()).catch(() => {
        // Keep failed preloads quiet until an explicit sandbox run can report them.
      });

      this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          margin: 1.5rem 0;
        }

        .sandbox {
          border: 1px solid var(--ifm-color-emphasis-200, #d0d7de);
          border-radius: 8px;
          background: var(--ifm-background-surface-color, #fff);
          box-shadow: 0 18px 52px rgba(15, 23, 42, 0.12);
          overflow: hidden;
        }

        .toolbar {
          align-items: center;
          border-bottom: 1px solid var(--ifm-color-emphasis-200, #d0d7de);
          display: flex;
          gap: 0.75rem;
          justify-content: space-between;
          min-height: 3rem;
          padding: 0.55rem 0.75rem;
        }

        .title {
          color: var(--ifm-color-emphasis-800, #1f2937);
          font: 600 0.88rem "Geist", ui-sans-serif, system-ui, sans-serif;
        }

        .status {
          color: var(--ifm-color-emphasis-600, #64748b);
          font: 500 0.78rem "Geist", ui-sans-serif, system-ui, sans-serif;
          margin-left: auto;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        button {
          align-items: center;
          appearance: none;
          background: #1f6feb;
          border: 1px solid #1f6feb;
          border-radius: 6px;
          color: #fff;
          cursor: pointer;
          display: inline-flex;
          font: 700 0.82rem "Geist", ui-sans-serif, system-ui, sans-serif;
          gap: 0.35rem;
          height: 2rem;
          padding: 0 0.85rem;
        }

        button:hover {
          background: #1858c2;
          border-color: #1858c2;
        }

        button:disabled {
          cursor: wait;
          opacity: 0.72;
        }

        .body {
          display: grid;
          grid-template-columns: minmax(0, 1.08fr) minmax(18rem, 0.92fr);
          min-height: 22rem;
        }

        .editor,
        .console {
          min-width: 0;
        }

        .editor {
          border-right: 1px solid var(--ifm-color-emphasis-200, #d0d7de);
        }

        .console {
          background: #0f172a;
          color: #dbeafe;
          display: flex;
          flex-direction: column;
          font: 0.84rem "Geist Mono", ui-monospace, SFMono-Regular, Menlo, Monaco,
            Consolas, monospace;
        }

        .consoleHeader {
          align-items: center;
          border-bottom: 1px solid rgba(148, 163, 184, 0.2);
          color: #93c5fd;
          display: flex;
          font-weight: 700;
          height: 2.4rem;
          padding: 0 0.85rem;
        }

        .consoleOutput {
          flex: 1;
          margin: 0;
          overflow: auto;
          padding: 0.85rem;
          white-space: pre-wrap;
        }

        .logLine {
          border-bottom: 1px solid rgba(148, 163, 184, 0.12);
          padding: 0.32rem 0;
        }

        .logLine.error {
          color: #fecaca;
        }

        .logLine.warn {
          color: #fde68a;
        }

        .cm-editor {
          height: 100%;
          min-height: 22rem;
        }

        .cm-scroller {
          font-family: "Geist Mono", ui-monospace, SFMono-Regular, Menlo, Monaco,
            Consolas, monospace;
          font-size: 0.86rem;
          line-height: 1.55;
        }

        @media (max-width: 820px) {
          .body {
            grid-template-columns: 1fr;
          }

          .editor {
            border-bottom: 1px solid var(--ifm-color-emphasis-200, #d0d7de);
            border-right: 0;
          }
        }
      </style>
      <section class="sandbox" aria-label="WASMatrix code sandbox">
        <div class="toolbar">
          <span class="title">WASMatrix sandbox</span>
          <span class="status">Ready</span>
          <button type="button">Run</button>
        </div>
        <div class="body">
          <div class="editor"></div>
          <div class="console">
            <div class="consoleHeader">Console</div>
            <pre class="consoleOutput" aria-live="polite"></pre>
          </div>
        </div>
      </section>
    `;

      const editorHost = this.shadowRoot.querySelector(".editor");
      this.#consoleEl = this.shadowRoot.querySelector(".consoleOutput");
      this.#runButton = this.shadowRoot.querySelector("button");
      this.#statusEl = this.shadowRoot.querySelector(".status");

      this.#editor = new EditorView({
        parent: editorHost,
        state: EditorState.create({
          doc: this.#initialCode(),
          extensions: [
            lineNumbers(),
            highlightActiveLineGutter(),
            history(),
            drawSelection(),
            dropCursor(),
            rectangularSelection(),
            crosshairCursor(),
            highlightActiveLine(),
            syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
            javascript(),
            keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
            EditorView.lineWrapping,
            EditorView.theme({
              "&": {
                backgroundColor: "var(--ifm-background-surface-color, #fff)",
              },
              ".cm-content": {
                padding: "0.75rem 0",
              },
              ".cm-gutters": {
                backgroundColor: "var(--ifm-background-surface-color, #fff)",
                borderRight: "1px solid var(--ifm-color-emphasis-200, #d0d7de)",
              },
            }),
          ],
        }),
      });

      this.#runButton.addEventListener("click", () => {
        void this.#run();
      });
    }

    #write(kind, values) {
      const line = document.createElement("div");
      line.className = `logLine ${kind}`;
      line.textContent = values.map(formatValue).join(" ");
      this.#consoleEl.append(line);
      this.#consoleEl.scrollTop = this.#consoleEl.scrollHeight;
    }

    #clearConsole() {
      this.#consoleEl.textContent = "";
    }

    #setStatus(value) {
      this.#statusEl.textContent = value;
    }

    async #loadMatrix() {
      const mod = await importMatrixModule(this.#packageUrl());
      return mod.default ?? mod.Matrix;
    }

    async #run() {
      this.#clearConsole();
      this.#setStatus("Loading WASM");
      this.#runButton.disabled = true;

      const sandboxConsole = {
        log: (...values) => this.#write("log", values),
        info: (...values) => this.#write("log", values),
        warn: (...values) => this.#write("warn", values),
        error: (...values) => this.#write("error", values),
        table: (value) => this.#write("log", [value]),
      };

      try {
        const Matrix = await this.#loadMatrix();
        this.#setStatus("Running");
        const source = this.#editor.state.doc.toString();
        const AsyncFunction =
          Object.getPrototypeOf(async function () {}).constructor;
        const fn = new AsyncFunction("Matrix", "console", source);
        await fn(Matrix, sandboxConsole);
        this.#setStatus("Done");
      } catch (error) {
        this.#write("error", [error?.stack || error?.message || error]);
        this.#setStatus("Error");
      } finally {
        this.#runButton.disabled = false;
      }
    }
  }

  window.customElements.define("wasmatrix-sandbox", WasmatrixSandbox);
}
