import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "../../src/cli/client.js";
import { serviceEntryPath } from "../../src/cli/service-control.js";
import { FlowPilotError } from "../../src/core/errors.js";

let server: http.Server;
let port: number;

beforeAll(async () => {
  // A service that accepts the connection and never answers.
  server = http.createServer(() => undefined);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise((r) => server.close(r));
});

describe("cli client", () => {
  it("gives up on a service that never answers", async () => {
    const client = new Client(port, { timeoutMs: 200 });
    await expect(client.health()).rejects.toMatchObject({ code: "service_timeout" });
  });

  it("reports a service that is not there", async () => {
    const client = new Client(1, { timeoutMs: 200 });
    const error = await client.health().catch((err: unknown) => err);
    expect(error).toBeInstanceOf(FlowPilotError);
    expect((error as FlowPilotError).code).toBe("service_unreachable");
  });
});

describe("service entry point", () => {
  it("points to the build output, whichever directory the CLI runs from", () => {
    // The package root is two levels up from `src/cli` and from `dist/cli` alike:
    // the path must not depend on where the CLI itself was started from.
    const expected = fileURLToPath(new URL("../../dist/server/main.js", import.meta.url));
    expect(serviceEntryPath()).toBe(expected);
    expect(path.basename(path.dirname(serviceEntryPath()))).toBe("server");
  });

  it("points to a file inside the package, not to the sources", () => {
    expect(serviceEntryPath().endsWith(path.join("dist", "server", "main.js"))).toBe(true);
    expect(fs.existsSync(path.join("src", "server", "main.ts"))).toBe(true);
  });
});
