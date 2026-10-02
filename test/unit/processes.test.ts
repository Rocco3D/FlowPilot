import { describe, expect, it } from "vitest";
import { parseProcessList } from "../../src/browser/processes.js";

const win = String.raw`C:\Users\a\AppData\Local\FlowPilot\profiles\default`;

describe("parseProcessList", () => {
  it("matches Windows root processes with quoted and unquoted paths", () => {
    const out = [
      `100 "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" "--user-data-dir=${win}" --no-first-run`,
      `101 "C:\\chrome.exe" --user-data-dir=${win}`,
      `102 "C:\\chrome.exe" --type=renderer "--user-data-dir=${win}"`,
    ].join("\r\n");
    expect(parseProcessList(out, win, 1)).toEqual([100, 101]);
  });

  it("matches ps-style lines and skips helpers", () => {
    const dir = "/home/a/.local/share/flowpilot/profiles/default";
    const out = [
      ` 200 google-chrome --user-data-dir=${dir} --remote-debugging-port=0`,
      ` 201 google-chrome --type=gpu-process --user-data-dir=${dir}`,
      ` 202 google-chrome --user-data-dir=${dir}`,
    ].join("\n");
    expect(parseProcessList(out, dir, 1)).toEqual([200, 202]);
  });

  it("ignores other profiles, prefix-similar names and our own pid", () => {
    const dir = "/p/default";
    const out = [
      "300 chrome --user-data-dir=/p/default2 --x",
      "301 chrome --user-data-dir=/p/other",
      "302 chrome --user-data-dir=/p/default --x",
    ].join("\n");
    expect(parseProcessList(out, dir, 1)).toEqual([302]);
    expect(parseProcessList(out, dir, 302)).toEqual([]);
  });

  it("handles quoted paths with spaces", () => {
    const dir = String.raw`C:\Users\A B\profiles\default`;
    const out = `400 "C:\\chrome.exe" "--user-data-dir=${dir}" --x`;
    expect(parseProcessList(out, dir, 1)).toEqual([400]);
  });
});
