import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

  it("POST /shutdown stops the service, closes the browser and calls onExit", async () => {
    const dataDir = path.join(dir, "data");
    const configDir = path.join(dir, "config");
    const driver = new FakeDriver();
    const close = vi.spyOn(driver, "close");
    const onExit = vi.fn();
    const service = await startService({ driver, configDir, dataDir, port: 0, onExit });
    const token = fs.readFileSync(path.join(configDir, "token"), "utf8");
    await fetch(`${service.url}/shutdown`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
    await vi.waitFor(() => expect(onExit).toHaveBeenCalledOnce());
    expect(close).toHaveBeenCalledWith({ closeBrowser: true });
    expect(readServiceInfo(dataDir)).toBeUndefined();
  });

  describe("idle shutdown", () => {
    afterEach(() => vi.useRealTimers());

    async function start(onExit: () => void) {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      return startService({
        driver: new FakeDriver(),
        configDir: path.join(dir, "config"),
        dataDir: path.join(dir, "data"),
        port: 0,
        onExit,
        idleMs: 1000,
      });
    }

    it("fires after idleMs without activity", async () => {
      const onExit = vi.fn();
      await start(onExit);
      await vi.advanceTimersByTimeAsync(999);
      expect(onExit).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await vi.waitFor(() => expect(onExit).toHaveBeenCalledOnce());
    });

    it("is reset by requests other than /health", async () => {
      const onExit = vi.fn();
      const service = await start(onExit);
      await vi.advanceTimersByTimeAsync(800);
      await fetch(`${service.url}/health`);
      await vi.advanceTimersByTimeAsync(100);
      await fetch(`${service.url}/models`); // unauthorized, still counts as activity
      await vi.advanceTimersByTimeAsync(800);
      expect(onExit).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(200);
      await vi.waitFor(() => expect(onExit).toHaveBeenCalledOnce());
    });
  });

  it("reports a dead pid as not alive", () => {
    expect(isServiceAlive({ pid: 2 ** 22 + 12345, port: 1, startedAt: "" })).toBe(false);
  });
});
