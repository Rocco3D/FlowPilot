import { describe, expect, it } from "vitest";
import { DOWNLOAD_ITEM_RE } from "../../src/flow/selectors.js";

describe("tile menu Download item", () => {
  it("matches the Download item with or without a space after the icon text", () => {
    expect(DOWNLOAD_ITEM_RE.test("downloadDownload")).toBe(true);
    expect(DOWNLOAD_ITEM_RE.test("download Download")).toBe(true);
  });

  it("ignores other download entries", () => {
    expect(DOWNLOAD_ITEM_RE.test("downloadDownload project")).toBe(false);
    expect(DOWNLOAD_ITEM_RE.test("download Download media")).toBe(false);
  });
});
