import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isServiceAlive, readServiceInfo, startService } from "../../src/core/service.js";
import { FakeDriver } from "../fakes/fake-driver.js";

let dir: string;

beforeEach(() => {
  dir = path.resolve(
    import.meta.dirname,
    "../../temp/tests",
    `service-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("service lifecycle", () => {
  it("writes service.json on start and removes it on stop", async () => {
    const dataDir = path.join(dir, "data");
    const service = await startService({
      driver: new FakeDriver(),
      configDir: path.join(dir, "config"),
      dataDir,
      port: 0,
    });
    const info = readServiceInfo(dataDir);
    expect(info).toMatchObject({ pid: process.pid, port: service.port });
    expect(service.url).toBe(`http://127.0.0.1:${service.port}`);
    expect(isServiceAlive(info!)).toBe(true);
    await service.stop();
    await service.stop();
    expect(readServiceInfo(dataDir)).toBeUndefined();
  });

  it("reports a dead pid as not alive", () => {
    expect(isServiceAlive({ pid: 2 ** 22 + 12345, port: 1, startedAt: "" })).toBe(false);
  });
});
