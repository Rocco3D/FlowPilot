import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  Config,
  getConfigValue,
  loadConfig,
  saveConfig,
  setConfigValue,
} from "../../src/core/config.js";
import { FlowPilotError } from "../../src/core/errors.js";
import { defaultOutputDir } from "../../src/core/paths.js";

let dir: string;
beforeEach(() => {
  dir = path.join(process.cwd(), "temp", "tests", `config-${process.pid}-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (err) {
    return err instanceof FlowPilotError ? err.code : "other";
  }
  return undefined;
}

describe("config", () => {
  it("returns defaults when the file is missing", () => {
    const c = loadConfig(dir);
    expect(c.outputDir).toBe(defaultOutputDir());
    expect(c).toMatchObject({
      outputs: 1,
      maxCreditsPerJob: 20,
      monthlyCreditLimit: 1000,
      port: 47820,
      logLevel: "info",
    });
  });

  it("round-trips save and load", () => {
    const nested = path.join(dir, "nested");
    const c = { ...Config.parse({}), port: 5000, locale: "it" };
    saveConfig(c, nested);
    expect(loadConfig(nested)).toEqual(c);
    expect(fs.readdirSync(nested)).toEqual(["config.json"]);
  });

  it("throws config_invalid on bad JSON, including the path", () => {
    fs.writeFileSync(path.join(dir, "config.json"), "{nope");
    expect(codeOf(() => loadConfig(dir))).toBe("config_invalid");
    expect(() => loadConfig(dir)).toThrow(path.join(dir, "config.json"));
  });

  it("throws config_invalid on invalid values", () => {
    fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ outputs: 9 }));
    expect(codeOf(() => loadConfig(dir))).toBe("config_invalid");
  });

  it("coerces values in setConfigValue", () => {
    expect(setConfigValue("port", "5001", dir).port).toBe(5001);
    expect(setConfigValue("locale", "it", dir).locale).toBe("it");
    expect(getConfigValue("port", dir)).toBe(5001);
    expect(loadConfig(dir).locale).toBe("it");
  });

  it("rejects unknown keys and out-of-range values", () => {
    expect(codeOf(() => setConfigValue("nope", "1", dir))).toBe("config_unknown_key");
    expect(codeOf(() => getConfigValue("nope", dir))).toBe("config_unknown_key");
    expect(codeOf(() => setConfigValue("outputs", "7", dir))).toBe("config_invalid");
    expect(codeOf(() => setConfigValue("port", "abc", dir))).toBe("config_invalid");
    expect(fs.existsSync(path.join(dir, "config.json"))).toBe(false);
  });
});
