import { describe, expect, it } from "vitest";
import { configDir, dataDir, defaultOutputDir, profileDir } from "../../src/core/paths.js";

describe("paths", () => {
  it("resolves Windows paths", () => {
    const opts = {
      platform: "win32" as const,
      home: String.raw`C:\Users\a`,
      env: {
        APPDATA: String.raw`C:\Users\a\AppData\Roaming`,
        LOCALAPPDATA: String.raw`C:\Users\a\AppData\Local`,
      },
    };
    expect(configDir(opts)).toBe(String.raw`C:\Users\a\AppData\Roaming\FlowPilot`);
    expect(dataDir(opts)).toBe(String.raw`C:\Users\a\AppData\Local\FlowPilot`);
    expect(defaultOutputDir(opts)).toBe(String.raw`C:\Users\a\Documents\FlowPilot`);
    expect(profileDir("p", opts)).toBe(String.raw`C:\Users\a\AppData\Local\FlowPilot\profiles\p`);
  });

  it("resolves macOS paths", () => {
    const opts = { platform: "darwin" as const, home: "/Users/a", env: {} };
    const base = "/Users/a/Library/Application Support/FlowPilot";
    expect(configDir(opts)).toBe(base);
    expect(dataDir(opts)).toBe(base);
    expect(defaultOutputDir(opts)).toBe("/Users/a/Documents/FlowPilot");
    expect(profileDir(undefined, opts)).toBe(`${base}/profiles/default`);
  });

  it("resolves Linux paths with defaults", () => {
    const opts = { platform: "linux" as const, home: "/home/a", env: {} };
    expect(configDir(opts)).toBe("/home/a/.config/flowpilot");
    expect(dataDir(opts)).toBe("/home/a/.local/share/flowpilot");
    expect(defaultOutputDir(opts)).toBe("/home/a/Documents/FlowPilot");
  });

  it("honours XDG variables on Linux", () => {
    const opts = {
      platform: "linux" as const,
      home: "/home/a",
      env: { XDG_CONFIG_HOME: "/x/c", XDG_DATA_HOME: "/x/d" },
    };
    expect(configDir(opts)).toBe("/x/c/flowpilot");
    expect(dataDir(opts)).toBe("/x/d/flowpilot");
  });
});
