import { describe, expect, it } from "vitest";
import {
  automationArgs,
  chromeExecutable,
  parseDevToolsPort,
  withEnglishUi,
} from "../../src/browser/session.js";

describe("parseDevToolsPort", () => {
  it("reads the first line", () => {
    expect(parseDevToolsPort("51234\n/devtools/browser/abc")).toBe(51234);
    expect(parseDevToolsPort("51234\r\nx")).toBe(51234);
  });
  it("returns undefined when invalid", () => {
    expect(parseDevToolsPort("")).toBeUndefined();
    expect(parseDevToolsPort("abc\n1")).toBeUndefined();
  });
});

describe("withEnglishUi", () => {
  it("adds hl=en on Flow hosts and keeps existing params", () => {
    expect(withEnglishUi("https://flow.google.com/")).toBe("https://flow.google.com/?hl=en");
    expect(withEnglishUi("https://labs.google/fx/tools/flow?a=1&hl=it")).toBe(
      "https://labs.google/fx/tools/flow?a=1&hl=en",
    );
  });
  it("leaves other hosts untouched", () => {
    expect(withEnglishUi("https://example.com/x")).toBe("https://example.com/x");
    expect(withEnglishUi("not a url")).toBe("not a url");
  });
});

describe("automationArgs", () => {
  it("hides the window when not headed", () => {
    const args = automationArgs("/p", false, "https://x/");
    expect(args).toContain("--user-data-dir=/p");
    expect(args).toContain("--remote-debugging-port=0");
    expect(args).toContain("--start-minimized");
    expect(args.at(-1)).toBe("https://x/");
  });
  it("does not hide the window when headed", () => {
    const args = automationArgs("/p", true, "https://x/");
    expect(args).not.toContain("--start-minimized");
    expect(args.some((a) => a.startsWith("--window-position"))).toBe(false);
  });
});

describe("chromeExecutable", () => {
  it("honours the env override", () => {
    expect(chromeExecutable({ env: { FLOWPILOT_CHROME_PATH: "/x/chrome" } })).toBe("/x/chrome");
  });
  it("picks the first existing Windows candidate", () => {
    const local = String.raw`C:\L\Google\Chrome\Application\chrome.exe`;
    expect(
      chromeExecutable({
        platform: "win32",
        env: { LOCALAPPDATA: String.raw`C:\L` },
        exists: (f) => f === local,
      }),
    ).toBe(local);
  });
  it("defaults per platform", () => {
    expect(chromeExecutable({ platform: "linux", env: {} })).toBe("google-chrome");
    expect(chromeExecutable({ platform: "darwin", env: {} })).toContain("Google Chrome.app");
  });
});
