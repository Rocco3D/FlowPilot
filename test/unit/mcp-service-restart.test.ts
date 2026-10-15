import http from "node:http";
import type { AddressInfo } from "node:net";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Client } from "../../src/cli/client.js";
import { createMcpServer } from "../../src/server/mcp.js";

const mocks = vi.hoisted(() => ({ ensureServiceRunning: vi.fn() }));

vi.mock("../../src/cli/service-control.js", () => ({
  ensureServiceRunning: mocks.ensureServiceRunning,
}));

/** Takes a port number nothing is listening on, so a call to it fails like a service that has stopped. */
async function freePort(): Promise<number> {
  const probe = http.createServer();
  await new Promise<void>((r) => probe.listen(0, "127.0.0.1", r));
  const { port } = probe.address() as AddressInfo;
  await new Promise<void>((r) => probe.close(() => r()));
  return port;
}

/** Stands in for the FlowPilot service. */
function listen(port: number): Promise<http.Server> {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify([{ name: "Nano Banana" }]));
  });
  return new Promise((r) => server.listen(port, "127.0.0.1", () => r(server)));
}

let port: number;
let service: http.Server | undefined;
let starts = 0;
let mcp: McpClient;

beforeAll(async () => {
  port = await freePort();
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createMcpServer(new Client(port), 5).connect(b);
  mcp = new McpClient({ name: "test", version: "0" });
  await mcp.connect(a);
});

afterAll(async () => {
  await mcp.close();
  if (service) await new Promise<void>((r) => service!.close(() => r()));
});

async function callNoArgs(name: string) {
  const res = await mcp.callTool({ name, arguments: {} });
  return { isError: res.isError, text: (res.content as { text: string }[])[0]?.text ?? "" };
}

describe("mcp server when the service stops", () => {
  it("starts it again and completes the call", async () => {
    // The first attempt finds nothing running, exactly like after an idle shutdown.
    starts = 0;
    mocks.ensureServiceRunning.mockImplementation(async () => {
      starts += 1;
      if (starts === 1 || service) return;
      service = await listen(port);
    });

    const { isError, text } = await callNoArgs("list_models");

    expect(isError, text).toBeFalsy();
    expect(JSON.parse(text)).toEqual([{ name: "Nano Banana" }]);
    expect(starts).toBe(2);
  });

  it("gives up after one retry instead of looping", async () => {
    if (service) {
      await new Promise<void>((r) => service!.close(() => r()));
      service = undefined;
    }
    const before = starts;
    mocks.ensureServiceRunning.mockImplementation(async () => {
      starts += 1;
    });

    const { isError, text } = await callNoArgs("list_models");

    expect(isError).toBe(true);
    expect(text.startsWith("service_unreachable:")).toBe(true);
    expect(starts - before).toBe(1);
  });
});
