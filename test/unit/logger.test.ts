import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLogger } from "../../src/core/logger.js";

let dir: string;
beforeEach(() => {
  dir = path.join(process.cwd(), "temp", "tests", `logger-${process.pid}-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("logger", () => {
  it("filters by level and writes formatted lines", () => {
    const now = new Date(2026, 0, 5, 10, 0, 0);
    const log = createLogger({ dir, level: "warn", now: () => now });
    log.info("skipped");
    log.warn("careful", { a: 1 });
    log.error("boom");
    const lines = fs.readFileSync(path.join(dir, "2026-01-05.log"), "utf8").trim().split("\n");
    expect(lines).toEqual([
      `${now.toISOString()} WARN careful {"a":1}`,
      `${now.toISOString()} ERROR boom`,
    ]);
  });

  it("names the file by local date and creates the folder lazily", () => {
    const sub = path.join(dir, "logs");
    let now = new Date(2026, 0, 5, 23, 59);
    const log = createLogger({ dir: sub, level: "debug", now: () => now });
    expect(fs.existsSync(sub)).toBe(false);
    log.debug("a");
    now = new Date(2026, 0, 6, 0, 1);
    log.debug("b");
    expect(fs.readdirSync(sub).sort()).toEqual(["2026-01-05.log", "2026-01-06.log"]);
  });
});
