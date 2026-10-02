import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkSpend, monthTotal, readLedger, recordSpend } from "../../src/core/credits.js";
import { FlowPilotError } from "../../src/core/errors.js";
import { t } from "../../src/i18n/index.js";

let dir: string;
beforeEach(() => {
  dir = path.join(process.cwd(), "temp", "tests", `credits-${process.pid}-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const entry = (credits: number, at: Date) => ({
  jobId: "j",
  model: "m",
  credits,
  at: at.toISOString(),
});
const limits = { maxCreditsPerJob: 20, monthlyCreditLimit: 100 };

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (err) {
    return err instanceof FlowPilotError ? err.code : "other";
  }
  return undefined;
}

describe("credits ledger", () => {
  it("appends and reads, skipping blank and corrupt lines", () => {
    const now = new Date(2026, 4, 10, 12);
    expect(readLedger(dir)).toEqual([]);
    recordSpend(entry(5, now), dir);
    fs.appendFileSync(path.join(dir, "credits.jsonl"), "\n{broken\n");
    recordSpend(entry(7, now), dir);
    expect(readLedger(dir).map((e) => e.credits)).toEqual([5, 7]);
  });

  it("sums only the same local month", () => {
    recordSpend(entry(5, new Date(2026, 4, 1, 12)), dir);
    recordSpend(entry(7, new Date(2026, 4, 28, 12)), dir);
    recordSpend(entry(100, new Date(2026, 3, 28, 12)), dir);
    recordSpend(entry(100, new Date(2025, 4, 15, 12)), dir);
    expect(monthTotal(new Date(2026, 4, 15), dir)).toBe(12);
  });

  it("enforces the per-job and monthly limits, and confirm bypasses them", () => {
    const date = new Date(2026, 4, 15);
    recordSpend(entry(90, date), dir);
    expect(codeOf(() => checkSpend(25, { ...limits, date, dir }))).toBe("credits_over_job_limit");
    expect(codeOf(() => checkSpend(15, { ...limits, date, dir }))).toBe(
      "credits_over_monthly_limit",
    );
    expect(checkSpend(25, { ...limits, confirm: true, date, dir })).toEqual({
      monthTotal: 90,
      remaining: -15,
    });
    expect(checkSpend(10, { ...limits, date, dir })).toEqual({ monthTotal: 90, remaining: 0 });
  });

  it("replaces placeholders in the messages", () => {
    expect(t("core.credits.overJobLimit", { cost: 25, limit: 20 })).toBe(
      "This job costs 25 credits, above the per-job limit of 20. Use --confirm to allow it.",
    );
  });
});
