import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findChromeProcesses = vi.fn<() => Promise<{ pid: number }[]>>();
const closeChromeGracefully = vi.fn<(processes: { pid: number }[]) => Promise<void>>();

vi.mock("../../src/browser/processes.js", () => ({
  findChromeProcesses: () => findChromeProcesses(),
  closeChromeGracefully: (processes: { pid: number }[]) => closeChromeGracefully(processes),
}));

const connectedUrls: string[] = [];
const connectOverCDP = vi.fn((url: string): Promise<typeof fakeBrowser> => {
  connectedUrls.push(url);
  return Promise.resolve(fakeBrowser);
});

const fakePage = {
  url: () => "https://flow.google.com/",
  setDefaultTimeout: () => undefined,
  goto: () => Promise.resolve(null),
  context: () => {
    throw new Error("no CDP in tests");
  },
};
const fakeBrowser = {
  isConnected: () => true,
  contexts: () => [{ pages: () => [fakePage] }],
  close: () => Promise.resolve(),
};

vi.mock("playwright-core", () => ({
  chromium: { connectOverCDP: (url: string) => connectOverCDP(url) },
}));

let localAppData: string;
let profileDir: string;

beforeEach(() => {
  localAppData = path.resolve(
    import.meta.dirname,
    "../../temp/tests",
    `session-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  fs.mkdirSync(localAppData, { recursive: true });
  process.env.LOCALAPPDATA = localAppData;
  process.env.FLOWPILOT_LANG = "en";
  profileDir = path.join(localAppData, "FlowPilot", "profiles", "default");
  findChromeProcesses.mockReset().mockResolvedValue([]);
  closeChromeGracefully.mockReset().mockResolvedValue(undefined);
  connectOverCDP.mockClear();
  connectedUrls.length = 0;
});

afterEach(() => {
  fs.rmSync(localAppData, { recursive: true, force: true });
});

/**
 * A session on a temporary profile, with `spawn` replaced: the fake writes DevToolsActivePort, the file Chrome
 * writes once it has opened a debugging port, so the attach path finds the port the way it does in life.
 */
async function sessionOnFakeProfile(): Promise<{
  page: () => Promise<unknown>;
  status: () => Promise<{ message: string; connected: boolean }>;
}> {
  vi.doMock("node:child_process", () => ({
    spawn: () => {
      fs.mkdirSync(profileDir, { recursive: true });
      fs.writeFileSync(path.join(profileDir, "DevToolsActivePort"), "51234\n/devtools/browser/x");
      return { on: () => undefined, unref: () => undefined };
    },
  }));
  vi.resetModules();
  const { BrowserSession } = await import("../../src/browser/session.js");
  const session = new BrowserSession({ chromePath: process.execPath });
  return { page: () => session.page(), status: () => session.status() };
}

describe("a Chrome already open on the FlowPilot profile", () => {
  it("is closed and reopened with a debug port, and the status says so", async () => {
    findChromeProcesses.mockResolvedValue([{ pid: 111 }, { pid: 222 }]);
    const session = await sessionOnFakeProfile();

    await session.page();

    expect(closeChromeGracefully).toHaveBeenCalledWith([{ pid: 111 }, { pid: 222 }]);
    expect(connectedUrls).toEqual(["http://127.0.0.1:51234"]);
    const status = await session.status();
    expect(status.connected).toBe(true);
    expect(status.message).toBe(
      "Chrome was already open on the profile, so FlowPilot closed it and reopened it with a debugging connection.",
    );
  });

  it("is left alone when it already answers on a debug port", async () => {
    fs.mkdirSync(profileDir, { recursive: true });
    fs.writeFileSync(path.join(profileDir, "DevToolsActivePort"), "51234\n/devtools/browser/x");
    findChromeProcesses.mockResolvedValue([{ pid: 111 }]);
    const session = await sessionOnFakeProfile();

    await session.page();

    expect(closeChromeGracefully).not.toHaveBeenCalled();
    expect((await session.status()).message).toBe("Chrome is running and FlowPilot is connected.");
  });

  it("is left alone when nothing is open on the profile", async () => {
    const session = await sessionOnFakeProfile();

    await session.page();

    expect(closeChromeGracefully).not.toHaveBeenCalled();
    expect((await session.status()).message).toBe("Chrome is running and FlowPilot is connected.");
  });
});
