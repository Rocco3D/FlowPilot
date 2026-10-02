import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "../../src/cli/client.js";
import { run } from "../../src/cli/program.js";
import { configDir } from "../../src/core/paths.js";

const root = path.resolve("temp", "tests", `cli-${process.pid}-${Date.now()}`);
const envKeys = [
  "APPDATA",
  "LOCALAPPDATA",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "HOME",
  "USERPROFILE",
];
const savedEnv = Object.fromEntries(envKeys.map((k) => [k, process.env[k]]));

interface Seen {
  method: string;
  url: string;
  auth?: string;
  body?: unknown;
}

let seen: Seen[] = [];
let jobPolls = 0;
let finalStatus: "done" | "failed" = "done";
let server: http.Server;
let port: number;

const baseJob = {
  id: "j1",
  request: { type: "video", prompt: "p", outputs: 1 },
  createdAt: "2026-01-01T00:00:00Z",
  results: [] as unknown[],
};

function reply(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function handle(req: http.IncomingMessage, res: http.ServerResponse, raw: string): void {
  const url = req.url ?? "";
  const method = req.method ?? "";
  seen.push({
    method,
    url,
    auth: req.headers.authorization,
    body: raw ? JSON.parse(raw) : undefined,
  });
  if (url === "/health") return reply(res, 200, { ok: true, version: "0.0.0-test" });
  if (url === "/models") return reply(res, 200, []);
  if (url === "/credits") {
    return reply(res, 200, {
      monthTotal: 5,
      maxCreditsPerJob: 20,
      monthlyCreditLimit: 1000,
      remaining: 995,
    });
  }
  if (url === "/config" && method === "GET") return reply(res, 200, { port: 47820, outputs: 1 });
  if (url === "/config/outputs" && method === "PUT")
    return reply(res, 200, { port: 47820, outputs: 3 });
  if (url === "/config/bad") {
    return reply(res, 400, { error: { code: "config_invalid", message: "Bad value" } });
  }
  if (url === "/jobs" && method === "POST") {
    return reply(res, 201, { ...baseJob, status: "queued" });
  }
  if (url === "/jobs" && method === "GET") {
    return reply(res, 200, [{ ...baseJob, status: "done" }]);
  }
  if (url === "/jobs/j1" && method === "GET") {
    jobPolls++;
    if (jobPolls < 2) return reply(res, 200, { ...baseJob, status: "running" });
    return reply(
      res,
      200,
      finalStatus === "done"
        ? { ...baseJob, status: "done", results: [{ path: "/out/a.mp4", type: "video" }] }
        : { ...baseJob, status: "failed", error: { code: "flow_error", message: "Flow said no" } },
    );
  }
  if (url === "/jobs/j1" && method === "DELETE") {
    return reply(res, 200, { ...baseJob, status: "cancelled" });
  }
  reply(res, 404, { error: { code: "not_found", message: "Nope" } });
}

let out: string[];
let err: string[];

async function cli(...args: string[]): Promise<number> {
  return run(["--port", String(port), ...args], { pollMs: 5 });
}

beforeAll(async () => {
  fs.mkdirSync(root, { recursive: true });
  process.env.APPDATA = path.join(root, "roaming");
  process.env.LOCALAPPDATA = path.join(root, "local");
  process.env.XDG_CONFIG_HOME = path.join(root, "roaming");
  process.env.XDG_DATA_HOME = path.join(root, "local");
  process.env.HOME = root;
  process.env.USERPROFILE = root;
  fs.mkdirSync(configDir(), { recursive: true });
  fs.writeFileSync(path.join(configDir(), "token"), "secret-token\n");
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c: Buffer) => (raw += c));
    req.on("end", () => handle(req, res, raw));
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
  seen = [];
  jobPolls = 0;
  finalStatus = "done";
  out = [];
  err = [];
  vi.spyOn(console, "log").mockImplementation((...a) => void out.push(a.join(" ")));
  vi.spyOn(console, "error").mockImplementation((...a) => void err.push(a.join(" ")));
});

afterEach(() => vi.restoreAllMocks());

describe("cli client", () => {
  it("sends the bearer token and maps server errors", async () => {
    const client = new Client(port);
    await client.health();
    await expect(client.setConfig("bad", "x")).rejects.toMatchObject({
      code: "config_invalid",
      message: "Bad value",
    });
    expect(seen[1]?.auth).toBe("Bearer secret-token");
  });

  it("maps a refused connection to service_unreachable", async () => {
    const closed = http.createServer();
    await new Promise<void>((r) => closed.listen(0, "127.0.0.1", r));
    const freePort = (closed.address() as AddressInfo).port;
    await new Promise((r) => closed.close(r));
    await expect(new Client(freePort).models()).rejects.toMatchObject({
      code: "service_unreachable",
    });
  });
});

describe("cli generation", () => {
  it("image with --prompt-file and --no-wait sends the file text and prints the id", async () => {
    const file = path.join(root, "prompt.txt");
    fs.writeFileSync(file, "line one\nline two\n");
    const code = await cli("image", "--prompt-file", file, "--no-wait", "--start-frame", "a.png");
    expect(code).toBe(0);
    const post = seen.find((s) => s.method === "POST");
    expect(post?.body).toMatchObject({
      type: "image",
      prompt: "line one\nline two\n",
      startFrame: path.resolve("a.png"),
    });
    expect(out.join("\n")).toContain("j1");
    expect(seen.some((s) => s.url === "/jobs/j1")).toBe(false);
  });

  it("video waits until done and prints the result paths", async () => {
    const code = await cli("video", "--prompt", "hi", "--duration", "8");
    expect(code).toBe(0);
    expect(seen.find((s) => s.method === "POST")?.body).toMatchObject({
      type: "video",
      duration: 8,
    });
    expect(out).toContain("Status: running");
    expect(out.at(-1)).toBe("/out/a.mp4");
  });

  it("a failed job exits with 1 and reports the error on stderr", async () => {
    finalStatus = "failed";
    const code = await cli("video", "--prompt", "hi");
    expect(code).toBe(1);
    expect(err.join("\n")).toContain("Flow said no");
  });

  it("--json prints the raw job and errors as JSON", async () => {
    expect(await cli("video", "--prompt", "hi", "--json")).toBe(0);
    expect(JSON.parse(out.join("\n"))).toMatchObject({ id: "j1", status: "done" });
    finalStatus = "failed";
    jobPolls = 0;
    expect(await cli("video", "--prompt", "hi", "--json")).toBe(1);
    expect(JSON.parse(err.join("\n"))).toEqual({
      error: { code: "flow_error", message: expect.stringContaining("Flow said no") },
    });
  });

  it("--prompt together with --prompt-file is an error and sends nothing", async () => {
    const code = await cli("image", "--prompt", "x", "--prompt-file", "y.txt");
    expect(code).toBe(1);
    expect(err.join("\n")).toContain("exactly one");
    expect(seen.some((s) => s.method === "POST")).toBe(false);
  });
});

describe("cli jobs, credits and config", () => {
  it("lists, shows and cancels jobs", async () => {
    expect(await cli("jobs")).toBe(0);
    expect(out.at(-1)).toContain("j1  video  done");
    expect(await cli("job", "j1", "--json")).toBe(0);
    expect(await cli("cancel", "j1")).toBe(0);
    expect(out.at(-1)).toContain("cancelled");
  });

  it("prints credits", async () => {
    expect(await cli("credits")).toBe(0);
    expect(out.join("\n")).toContain("995");
  });

  it("gets and sets configuration", async () => {
    expect(await cli("config", "get", "port")).toBe(0);
    expect(out.at(-1)).toBe("47820");
    expect(await cli("config", "get")).toBe(0);
    expect(out.at(-1)).toBe("port=47820\noutputs=1");
    expect(await cli("config", "get", "nope")).toBe(1);
    expect(await cli("config", "set", "outputs", "3")).toBe(0);
    expect(out.at(-1)).toBe("outputs=3");
    expect(seen.find((s) => s.method === "PUT")?.body).toEqual({ value: "3" });
  });

  it("service status reports a running service", async () => {
    expect(await cli("service", "status")).toBe(0);
    expect(out.join("\n")).toContain("0.0.0-test");
  });
});
