import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "../../src/cli/client.js";
import { createMcpServer } from "../../src/server/mcp.js";

const root = path.resolve("temp", "tests", `mcp-${process.pid}-${Date.now()}`);
const envKeys = [
  "APPDATA",
  "LOCALAPPDATA",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "HOME",
  "USERPROFILE",
];
const savedEnv = Object.fromEntries(envKeys.map((k) => [k, process.env[k]]));

const baseJob = {
  id: "j1",
  request: { type: "image", prompt: "p", outputs: 1 },
  createdAt: "2026-01-01T00:00:00Z",
  results: [] as unknown[],
};

let polls = 0;
/** When true the fake job never finishes, to exercise the wait limit. */
let stall = false;
let posted: unknown;
/** The last configuration write the assistant asked for. */
let written: unknown;
let server: http.Server;
let mcp: McpClient;

function reply(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function handle(req: http.IncomingMessage, res: http.ServerResponse, raw: string): void {
  const url = req.url ?? "";
  const method = req.method ?? "";
  if (url === "/health") return reply(res, 200, { ok: true, version: "0.0.0-test" });
  if (url === "/models") return reply(res, 200, [{ name: "Nano Banana" }]);
  if (url === "/credits") return reply(res, 200, { monthTotal: 0, remaining: 1000 });
  if (url === "/selftest" && method === "POST") return reply(res, 200, { ok: true, checks: [] });
  if (url === "/doctor" && method === "POST")
    return reply(res, 200, { chromeRunning: true, connected: true });
  if (url === "/config" && method === "GET")
    return reply(res, 200, { outputs: 2, maxCreditsPerJob: 20, locale: "it" });
  if (url.startsWith("/config/") && method === "PUT") {
    const key = decodeURIComponent(url.slice("/config/".length));
    const { value } = JSON.parse(raw) as { value: string };
    written = { key, value };
    return reply(res, 200, { [key]: value, outputs: 2, maxCreditsPerJob: 20 });
  }
  if (url === "/jobs" && method === "POST") {
    posted = JSON.parse(raw);
    return reply(res, 201, { ...baseJob, status: "queued" });
  }
  if (url === "/jobs/j1") {
    if (stall) return reply(res, 200, { ...baseJob, status: "running" });
    return reply(
      res,
      200,
      ++polls < 2
        ? { ...baseJob, status: "running" }
        : { ...baseJob, status: "done", results: [{ path: "/out/a.png", type: "image" }] },
    );
  }
  reply(res, 404, { error: { code: "not_found", message: "No such job" } });
}

async function call(name: string, args: Record<string, unknown> = {}) {
  const res = await mcp.callTool({ name, arguments: args });
  const text = (res.content as { text: string }[])[0]?.text ?? "";
  return { isError: res.isError, text };
}

/** Calls a tool the way a client that omits `arguments` does. */
async function callWithoutArguments(name: string) {
  const res = await mcp.callTool({ name, arguments: undefined });
  const text = (res.content as { text: string }[])[0]?.text ?? "";
  return { isError: res.isError, text };
}

beforeAll(async () => {
  fs.mkdirSync(root, { recursive: true });
  process.env.APPDATA = path.join(root, "roaming");
  process.env.LOCALAPPDATA = path.join(root, "local");
  process.env.XDG_CONFIG_HOME = path.join(root, "roaming");
  process.env.XDG_DATA_HOME = path.join(root, "local");
  process.env.HOME = root;
  process.env.USERPROFILE = root;
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c: Buffer) => (raw += c));
    req.on("end", () => handle(req, res, raw));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createMcpServer(new Client(port), 5, 40).connect(b);
  mcp = new McpClient({ name: "test", version: "0" });
  await mcp.connect(a);
});

afterAll(async () => {
  await mcp.close();
  await new Promise((r) => server.close(r));
  for (const k of envKeys) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  fs.rmSync(root, { recursive: true, force: true });
});

describe("mcp server", () => {
  beforeEach(() => {
    written = undefined;
  });

  it("lists the tools and calls list_models", async () => {
    const { tools } = await mcp.listTools();
    expect(tools.map((t) => t.name)).toContain("generate_video");
    expect(JSON.parse((await call("list_models")).text)).toEqual([{ name: "Nano Banana" }]);
  });

  it("generate_image waits until the job is done", async () => {
    const { isError, text } = await call("generate_image", { prompt: "a cat" });
    expect(isError).toBeFalsy();
    expect(posted).toMatchObject({ type: "image", prompt: "a cat" });
    expect(JSON.parse(text)).toMatchObject({
      status: "done",
      results: [{ path: "/out/a.png" }],
    });
  });

  it("generate_image with wait=false returns the job id", async () => {
    const { text } = await call("generate_image", { prompt: "a cat", wait: false });
    expect(JSON.parse(text)).toEqual({ id: "j1", status: "queued" });
  });

  it("answers still_running when the job is not finished yet", async () => {
    stall = true;
    try {
      const { isError, text } = await call("generate_video", { prompt: "a cat" });
      const body = JSON.parse(text);
      expect(isError).toBeFalsy();
      expect(body.still_running).toBe(true);
      expect(body.id).toBe("j1");
      expect(body.status).toBe("running");
      expect(body.hint).toContain("get_job");
    } finally {
      stall = false;
    }
  });

  it("maps FlowPilot errors to tool errors", async () => {
    const { isError, text } = await call("get_job", { id: "nope" });
    expect(isError).toBe(true);
    expect(text).toBe("not_found: No such job");
  });

  it("accepts tools without parameters when arguments is omitted", async () => {
    for (const name of ["list_models", "get_credits", "selftest", "doctor"]) {
      const { isError, text } = await callWithoutArguments(name);
      expect(isError, `${name}: ${text}`).toBeFalsy();
      expect(() => JSON.parse(text)).not.toThrow();
    }
  });

  it("keeps the parameters of the tools that have some", async () => {
    const { tools } = await mcp.listTools();
    const jobs = tools.find((t) => t.name === "list_jobs")?.inputSchema as {
      properties?: Record<string, unknown>;
    };
    expect(Object.keys(jobs?.properties ?? {})).toEqual(["limit"]);
    const model = tools.find((t) => t.name === "get_job")?.inputSchema as {
      required?: string[];
    };
    expect(model?.required).toEqual(["id"]);
  });

  it("reads the configuration with get_config", async () => {
    const { isError, text } = await call("get_config");
    expect(isError).toBeFalsy();
    expect(JSON.parse(text)).toMatchObject({ outputs: 2, maxCreditsPerJob: 20 });
  });

  it("writes a setting the assistant is allowed to change", async () => {
    const { isError, text } = await call("set_config", {
      key: "defaultImageModel",
      value: "Nano Banana 2",
    });
    expect(isError).toBeFalsy();
    expect(JSON.parse(text)).toEqual({ defaultImageModel: "Nano Banana 2" });
    expect(written).toEqual({ key: "defaultImageModel", value: "Nano Banana 2" });
  });

  it("refuses a credit limit, so an assistant cannot raise what it can spend", async () => {
    const { tools } = await mcp.listTools();
    const shape = tools.find((t) => t.name === "set_config")?.inputSchema as {
      properties?: { key?: { enum?: string[] } };
    };
    expect(shape.properties?.key?.enum).toEqual([
      "defaultVideoModel",
      "defaultImageModel",
      "outputs",
      "locale",
    ]);
    for (const key of ["maxCreditsPerJob", "monthlyCreditLimit", "port"]) {
      const { isError } = await call("set_config", { key, value: "500" });
      expect(isError, `${key} should be refused`).toBe(true);
    }
    expect(written).toBeUndefined();
  });
});
