import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { run } from "../../src/cli/program.js";

let server: http.Server;
let port: number;
let seen: string[];
let out: string[];

beforeEach(async () => {
  seen = [];
  out = [];
  server = http.createServer((req, res) => {
    seen.push(`${req.method} ${req.url}`);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify(req.url === "/health" ? { ok: true, version: "0.0.0-test" } : { ok: true }),
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
  vi.spyOn(console, "log").mockImplementation((...a) => void out.push(a.join(" ")));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await new Promise((r) => server.close(r));
});

describe("cli login", () => {
  it("stops the running service, opens the login window and prints instructions", async () => {
    const openLogin = vi.fn(async () => "/profiles/work");
    const code = await run(["--port", String(port), "login", "--profile", "work"], {
      pollMs: 5,
      openLogin,
    });
    expect(code).toBe(0);
    expect(openLogin).toHaveBeenCalledWith("work");
    expect(seen).toContain("POST /shutdown");
    expect(out.join("\n")).toContain("flowpilot doctor");
    expect(out.join("\n")).toContain("/profiles/work");
  });

  it("--json prints the profile directory", async () => {
    const code = await run(["--port", String(port), "login", "--json"], {
      pollMs: 5,
      openLogin: async () => "/profiles/default",
    });
    expect(code).toBe(0);
    expect(JSON.parse(out.join("\n"))).toEqual({ profileDir: "/profiles/default" });
  });
});
