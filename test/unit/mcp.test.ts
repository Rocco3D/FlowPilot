import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
let posted: unknown;
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
  if (url === "/jobs" && method === "POST") {
    posted = JSON.parse(raw);
    return reply(res, 201, { ...baseJob, status: "queued" });
  }
  if (url === "/jobs/j1") {
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
  await createMcpServer(new Client(port), 5).connect(b);
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

  it("maps FlowPilot errors to tool errors", async () => {
    const { isError, text } = await call("get_job", { id: "nope" });
    expect(isError).toBe(true);
    expect(text).toBe("not_found: No such job");
  });
});
