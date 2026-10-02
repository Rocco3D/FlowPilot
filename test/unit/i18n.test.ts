import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getLocale, setLocale, t } from "../../src/i18n/index.js";

beforeEach(() => {
  setLocale("en");
});

afterEach(() => {
  setLocale(undefined);
  delete process.env.FLOWPILOT_LANG;
});

describe("i18n", () => {
  it("returns the catalog text and ignores unused params", () => {
    expect(t("core.error.internal", { x: 1 })).toBe("Internal error");
  });

  it("falls back to the key when missing", () => {
    expect(t("cli.nope")).toBe("cli.nope");
  });

  it("reads the locale from the environment", () => {
    process.env.FLOWPILOT_LANG = "en-US";
    expect(getLocale()).toBe("en");
  });

  it("ignores unsupported locales", () => {
    process.env.FLOWPILOT_LANG = "xx";
    expect(getLocale()).toBe("en");
  });
});
