import { beforeAll, describe, expect, it } from "vitest";
import { formatSelftest } from "../../src/cli/commands/info.js";
import { setLocale } from "../../src/i18n/index.js";

beforeAll(() => setLocale("en"));

describe("formatSelftest", () => {
  it("ends with the all-ok line when everything passed", () => {
    const out = formatSelftest({ ok: true, checks: [{ name: "a", ok: true }] });
    expect(out).toBe("PASS a\nAll checks passed");
  });

  it("never prints the failure line (the thrown error prints it once)", () => {
    const out = formatSelftest({ ok: false, checks: [{ name: "b", ok: false, detail: "x" }] });
    expect(out).toBe("FAIL b - x");
    expect(out).not.toMatch(/failed/i);
  });
});
