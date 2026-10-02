import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { run } from "../../src/cli/program.js";
import { dataDir } from "../../src/core/paths.js";
import { setLocale } from "../../src/i18n/index.js";

const root = path.resolve("temp", "tests", `cli-stop-${process.pid}-${Date.now()}`);
const envKeys = [
  "APPDATA",
  "LOCALAPPDATA",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "HOME",
  "USERPROFILE",
];
const savedEnv = Object.fromEntries(envKeys.map((k) => [k, process.env[k]]));

let server: http.Server;
let port: number;
let seen: string[];
let out: string[];

beforeAll(async () => {
  fs.mkdirSync(root, { recursive: true });
  process.env.APPDATA = path.join(root, "roaming");
  process.env.LOCALAPPDATA = path.join(root, "local");
  process.env.XDG_CONFIG_HOME = path.join(root, "roaming");
  process.env.XDG_DATA_HOME = path.join(root, "local");
  process.env.HOME = root;
  process.env.USERPROFILE = root;
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(
    path.join(dataDir(), "service.json"),
    JSON.stringify({ pid: 4242, port: 1, startedAt: "" }),
  );
  server = http.createServer((req, res) => {
    seen.push(`${req.method} ${req.url}`);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(req.url === "/health" ? { ok: true, version: "t" } : { ok: true }));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise((r) => server.close(r));
  for (const k of envKeys) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  fs.rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
  setLocale("en");
  seen = [];
  out = [];
  vi.spyOn(console, "log").mockImplementation((...a) => void out.push(a.join(" ")));
});

afterEach(() => vi.restoreAllMocks());

describe("cli stop", () => {
  it("shuts the service down, waits for the pid and closes the browser", async () => {
    let checks = 0;
    const kill = vi.fn();
    const closeBrowser = vi.fn(async () => undefined);
    const stopDeps = { isAlive: () => ++checks < 3, kill, closeBrowser, pollMs: 1 };
    expect(await run(["--port", String(port), "stop"], { pollMs: 5, stopDeps })).toBe(0);
    expect(seen).toContain("POST /shutdown");
    expect(kill).not.toHaveBeenCalled();
    expect(closeBrowser).toHaveBeenCalledOnce();
    expect(out.join("\n")).toContain("FlowPilot stopped");
  });

  it("kills the process when it outlives the timeout", async () => {
    const kill = vi.fn();
    const stopDeps = { isAlive: () => true, kill, closeBrowser: async () => undefined };
    const code = await run(["--port", String(port), "service", "stop"], {
      pollMs: 5,
      stopDeps: { ...stopDeps, timeoutMs: 20, pollMs: 5 },
    });
    expect(code).toBe(0);
    expect(kill).toHaveBeenCalledWith(4242);
  });
});
