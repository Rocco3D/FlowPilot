import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { FlowPilotError } from "../core/errors.js";
import { profileDir as resolveProfileDir } from "../core/paths.js";
import type { SessionStatus } from "../core/schemas.js";
import { t } from "../i18n/index.js";
import { closeChromeGracefully, findChromeProcesses } from "./processes.js";

export interface SessionOptions {
  profile?: string;
  headed?: boolean;
  chromePath?: string;
}

const FLOW_URL = "https://flow.google.com/?hl=en";
const ACTION_TIMEOUT_MS = 20000;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Flow follows the Google account language; selectors expect English, so force hl=en. */
export function withEnglishUi(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (!["labs.google", "flow.google.com"].includes(parsed.hostname)) return url;
  parsed.searchParams.set("hl", "en");
  return parsed.toString();
}

export function chromeExecutable(
  opts: {
    platform?: NodeJS.Platform;
    env?: Record<string, string | undefined>;
    exists?: (file: string) => boolean;
  } = {},
): string {
  const platform = opts.platform ?? process.platform;
  const env = opts.env ?? process.env;
  const exists = opts.exists ?? existsSync;
  if (env.FLOWPILOT_CHROME_PATH) return env.FLOWPILOT_CHROME_PATH;
  if (platform === "darwin") return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (platform === "win32") {
    const candidates = [
      String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`,
      ...(env.LOCALAPPDATA
        ? [path.win32.join(env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe")]
        : []),
      String.raw`C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`,
    ];
    return candidates.find((c) => exists(c)) ?? candidates[0]!;
  }
  return "google-chrome";
}

/** Fails fast when an absolute Chrome path does not exist. */
export function assertChromeExists(exe: string, exists: (file: string) => boolean = existsSync) {
  if (path.isAbsolute(exe) && !exists(exe)) {
    throw new FlowPilotError("chrome_not_found", "flow.session.chromeNotFound", { tried: exe });
  }
}

export function automationArgs(profileDir: string, headed: boolean, url: string): string[] {
  return [
    `--user-data-dir=${profileDir}`,
    "--remote-debugging-port=0",
    "--remote-allow-origins=*",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-blink-features=AutomationControlled",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    ...(headed ? [] : ["--window-position=-32000,-32000", "--window-size=1280,800"]),
    url,
  ];
}

/** First line of DevToolsActivePort is the debugging port. */
export function parseDevToolsPort(contents: string): number | undefined {
  const port = Number.parseInt(contents.split("\n")[0]?.trim() ?? "", 10);
  return Number.isNaN(port) ? undefined : port;
}

async function readPort(profileDir: string): Promise<number | undefined> {
  try {
    return parseDevToolsPort(await readFile(path.join(profileDir, "DevToolsActivePort"), "utf8"));
  } catch {
    return undefined;
  }
}

async function waitForPort(profileDir: string, timeoutMs: number): Promise<number | undefined> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const port = await readPort(profileDir);
    if (port !== undefined) return port;
    await delay(150);
  }
  return undefined;
}

function connect(port: number): Promise<Browser> {
  return chromium.connectOverCDP(`http://127.0.0.1:${port}`);
}

export class BrowserSession {
  private readonly profileDir: string;
  private readonly headed: boolean;
  private readonly chromePath: string | undefined;
  private browser: Browser | undefined;

  constructor(options: SessionOptions = {}) {
    this.profileDir = resolveProfileDir(options.profile ?? "default");
    this.headed = options.headed ?? false;
    this.chromePath = options.chromePath;
  }

  private executable(): string {
    return this.chromePath ?? chromeExecutable();
  }

  private spawnChrome(args: string[]): void {
    const exe = this.executable();
    assertChromeExists(exe);
    const child = spawn(exe, args, { detached: true, stdio: "ignore" });
    // Without an error listener a missing executable would crash the process.
    child.on("error", () => undefined);
    child.unref();
  }

  /** Opens a plain Chrome (no debugging flags) so Google allows sign-in. */
  async openLogin(): Promise<string> {
    await mkdir(this.profileDir, { recursive: true });
    await rm(path.join(this.profileDir, "DevToolsActivePort"), { force: true });
    this.spawnChrome([
      `--user-data-dir=${this.profileDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      FLOW_URL,
    ]);
    return this.profileDir;
  }

  private async launchAutomationChrome(): Promise<number> {
    await mkdir(this.profileDir, { recursive: true });
    await rm(path.join(this.profileDir, "DevToolsActivePort"), { force: true });
    this.spawnChrome(automationArgs(this.profileDir, this.headed, FLOW_URL));
    const port = await waitForPort(this.profileDir, 30000);
    if (port === undefined) {
      // A bare command name (Linux) cannot be checked upfront.
      if (!path.isAbsolute(this.executable())) {
        throw new FlowPilotError("chrome_not_found", "flow.session.chromeNotFound", {
          tried: this.executable(),
        });
      }
      throw new FlowPilotError("chrome_no_debug_port", "flow.session.noDebugPort", {
        profileDir: this.profileDir,
      });
    }
    return port;
  }

  private async attach(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser;
    const running = await findChromeProcesses(this.profileDir);
    const existingPort = running.length > 0 ? await readPort(this.profileDir) : undefined;
    let browser: Browser | undefined;
    if (existingPort !== undefined) browser = await connect(existingPort).catch(() => undefined);
    if (!browser) {
      // A plain sign-in window holds the profile: quit it gracefully (flushes cookies) first.
      if (running.length > 0) await closeChromeGracefully(running);
      const port = await this.launchAutomationChrome();
      browser = await connect(port).catch((error: unknown) => {
        throw new FlowPilotError("chrome_connect_failed", "flow.session.connectFailed", {
          port,
          reason: error instanceof Error ? error.message : String(error),
        });
      });
    }
    this.browser = browser;
    return browser;
  }

  async page(): Promise<Page> {
    const browser = await this.attach();
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page =
      context
        .pages()
        .find((p) => p.url().includes("flow.google.com") || p.url().includes("labs.google")) ??
      context.pages()[0] ??
      (await context.newPage());
    page.setDefaultTimeout(ACTION_TIMEOUT_MS);
    const goto = page.goto.bind(page);
    page.goto = (url, options) => goto(withEnglishUi(url), options);
    await this.applyWindowVisibility(page);
    return page;
  }

  private async applyWindowVisibility(page: Page): Promise<void> {
    try {
      const cdp = await page.context().newCDPSession(page);
      try {
        const { windowId } = await cdp.send("Browser.getWindowForTarget");
        // Never minimize: Flow's menus stop working in a minimized window. Hidden means off-screen.
        await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "normal" } });
        const offset = this.headed ? 100 : -32000;
        await cdp.send("Browser.setWindowBounds", {
          windowId,
          bounds: { left: offset, top: offset, width: 1280, height: 800 },
        });
      } finally {
        await cdp.detach().catch(() => undefined);
      }
    } catch {
      // Cosmetic; never fail the session over it.
    }
  }

  async status(): Promise<SessionStatus> {
    const running = (await findChromeProcesses(this.profileDir)).length > 0;
    let connected = this.browser?.isConnected() ?? false;
    if (!connected && running) {
      const port = await readPort(this.profileDir);
      if (port !== undefined) {
        const probe = await connect(port).catch(() => undefined);
        if (probe) {
          connected = true;
          await probe.close();
        }
      }
    }
    const key = connected
      ? "flow.session.statusConnected"
      : running
        ? "flow.session.statusRunning"
        : "flow.session.statusStopped";
    return {
      chromeRunning: running,
      connected,
      signedIn: false,
      profileDir: this.profileDir,
      message: t(key),
    };
  }

  /** Disconnects only; the user's Chrome stays open. */
  async close(): Promise<void> {
    const browser = this.browser;
    this.browser = undefined;
    await browser?.close();
  }

  /** Disconnects, then quits this profile's Chrome gracefully so cookies are saved. */
  async closeBrowser(): Promise<void> {
    await this.close();
    const running = await findChromeProcesses(this.profileDir);
    if (running.length > 0) await closeChromeGracefully(running);
  }
}
