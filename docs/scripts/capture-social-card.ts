import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const docsRoot = resolve(scriptsDir, "..");
const defaultUrl = "https://wasmatrix.pages.dev/";
const defaultOutput = resolve(docsRoot, "static/img/social-card.png");
const targetUrl = Deno.args[0] ?? defaultUrl;
const outputPath = Deno.args[1]
  ? resolve(docsRoot, Deno.args[1])
  : defaultOutput;
const viewport = { width: 1200, height: 630 };

const chromeCandidates = [
  Deno.env.get("CHROME_PATH"),
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter((candidate): candidate is string => Boolean(candidate));

function delay(ms: number) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function findChrome() {
  for (const candidate of chromeCandidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next known Chrome path.
    }
  }

  throw new Error(
    "Chrome was not found. Set CHROME_PATH to a Chrome or Chromium executable.",
  );
}

async function readDevToolsPort(profileDir: string) {
  const portFile = resolve(profileDir, "DevToolsActivePort");
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const [port] = (await readFile(portFile, "utf8")).trim().split("\n");
      if (port) return Number(port);
    } catch {
      await delay(100);
    }
  }

  throw new Error("Timed out waiting for Chrome DevToolsActivePort.");
}

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

class CdpClient {
  nextId = 1;
  pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  events = new Map<string, Array<(params: unknown) => void>>();
  socket: WebSocket;
  ready: Promise<Event>;

  constructor(webSocketUrl: string) {
    this.socket = new WebSocket(webSocketUrl);
    this.ready = new Promise<Event>((resolveReady, rejectReady) => {
      this.socket.addEventListener("open", resolveReady, { once: true });
      this.socket.addEventListener("error", rejectReady, { once: true });
    });
    this.socket.addEventListener(
      "message",
      (event) => this.handleMessage(event),
    );
  }

  handleMessage(event: MessageEvent) {
    const message = JSON.parse(String(event.data));
    if (message.id != null) {
      const pending = this.pending.get(message.id);
      if (pending == null) return;
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    const listeners = this.events.get(message.method) ?? [];
    for (const listener of listeners) listener(message.params);
  }

  async send(method: string, params: Record<string, unknown> = {}) {
    await this.ready;
    const id = this.nextId;
    this.nextId += 1;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise<unknown>((resolveSend, rejectSend) => {
      this.pending.set(id, { resolve: resolveSend, reject: rejectSend });
    });
  }

  waitForEvent(method: string, timeoutMs = 15000) {
    return new Promise<unknown>((resolveEvent, rejectEvent) => {
      const timeout = setTimeout(() => {
        this.events.set(
          method,
          (this.events.get(method) ?? []).filter((listener) =>
            listener !== onEvent
          ),
        );
        rejectEvent(new Error(`Timed out waiting for ${method}.`));
      }, timeoutMs);
      const onEvent = (params: unknown) => {
        clearTimeout(timeout);
        this.events.set(
          method,
          (this.events.get(method) ?? []).filter((listener) =>
            listener !== onEvent
          ),
        );
        resolveEvent(params);
      };
      this.events.set(method, [...(this.events.get(method) ?? []), onEvent]);
    });
  }

  close() {
    this.socket.close();
  }
}

async function createPage(port: number) {
  const response = await fetch(
    `http://127.0.0.1:${port}/json/new?about:blank`,
    {
      method: "PUT",
    },
  );
  if (!response.ok) {
    throw new Error(
      `Failed to create Chrome target: ${response.status} ${response.statusText}`,
    );
  }
  const target = await response.json() as { webSocketDebuggerUrl: string };
  return new CdpClient(target.webSocketDebuggerUrl);
}

async function capture() {
  const chrome = await findChrome();
  const profileDir = await mkdtemp(resolve(tmpdir(), "wasmatrix-og-"));
  const chromeProcess = new Deno.Command(chrome, {
    args: [
      "--headless=new",
      "--hide-scrollbars",
      "--disable-gpu",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-sync",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-port=0",
      `--user-data-dir=${profileDir}`,
      "--lang=en-US",
      `--window-size=${viewport.width},${viewport.height}`,
      "about:blank",
    ],
    stdin: "null",
    stdout: "null",
    stderr: "null",
  }).spawn();

  let page;
  try {
    const port = await readDevToolsPort(profileDir);
    page = await createPage(port);
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await page.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: false,
    });

    const loaded = page.waitForEvent("Page.loadEventFired");
    await page.send("Page.navigate", { url: targetUrl });
    await loaded;
    await page.send("Runtime.evaluate", {
      awaitPromise: true,
      expression: `
        (async () => {
          document.documentElement.setAttribute("data-theme", "dark");
          document.documentElement.setAttribute("data-theme-choice", "dark");
          await document.fonts.ready;
          const style = document.createElement("style");
          style.textContent = \`
            html, body, #__docusaurus {
              background: #000 !important;
              height: ${viewport.height}px !important;
              margin: 0 !important;
              min-height: ${viewport.height}px !important;
              overflow: hidden !important;
              width: ${viewport.width}px !important;
            }
            .navbar,
            header,
            main > section:not(:first-child) {
              display: none !important;
            }
            main,
            main > section:first-child {
              background: #000 !important;
              height: ${viewport.height}px !important;
              margin-top: 0 !important;
              min-height: ${viewport.height}px !important;
              overflow: hidden !important;
              width: ${viewport.width}px !important;
            }
            main > section:first-child > div:last-child {
              height: ${viewport.height}px !important;
              justify-content: center !important;
              margin: 0 !important;
              max-width: none !important;
              padding: 0 76px !important;
            }
            main > section:first-child > div:last-child > :not(h1) {
              display: none !important;
            }
            main > section:first-child h1 {
              color: #fff !important;
              display: block !important;
              font-size: 136px !important;
              letter-spacing: 0 !important;
              line-height: 0.88 !important;
              margin: 0 !important;
              max-width: 820px !important;
              text-shadow: 0 24px 54px rgba(0, 0, 0, 0.44) !important;
            }
          \`;
          document.head.appendChild(style);
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          await new Promise((resolve) => setTimeout(resolve, 900));
        })();
      `,
    });

    const screenshot = await page.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      clip: {
        x: 0,
        y: 0,
        width: viewport.width,
        height: viewport.height,
        scale: 1,
      },
    }) as { data: string };

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, decodeBase64(screenshot.data));
  } finally {
    page?.close();
    chromeProcess.kill("SIGTERM");
    await chromeProcess.status.catch(() => undefined);
    await rm(profileDir, { recursive: true, force: true });
  }
}

await capture();
