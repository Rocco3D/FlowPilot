import fs from "node:fs";
import path from "node:path";
import { FlowPilotError } from "./errors.js";
import { dataDir } from "./paths.js";

export interface LedgerEntry {
  jobId: string;
  model: string;
  credits: number;
  at: string;
}

export interface SpendLimits {
  maxCreditsPerJob: number;
  monthlyCreditLimit: number;
  confirm?: boolean;
  date?: Date;
  dir?: string;
}

function ledgerFile(dir: string): string {
  return path.join(dir, "credits.jsonl");
}

export function recordSpend(entry: LedgerEntry, dir: string = dataDir()): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(ledgerFile(dir), `${JSON.stringify(entry)}\n`);
}

export function readLedger(dir: string = dataDir()): LedgerEntry[] {
  let raw: string;
  try {
    raw = fs.readFileSync(ledgerFile(dir), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const entries: LedgerEntry[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line) as LedgerEntry);
    } catch {
      // Skip a corrupt line.
    }
  }
  return entries;
}

export function monthTotal(date: Date = new Date(), dir?: string): number {
  return readLedger(dir)
    .filter((e) => {
      const at = new Date(e.at);
      return at.getFullYear() === date.getFullYear() && at.getMonth() === date.getMonth();
    })
    .reduce((sum, e) => sum + e.credits, 0);
}

export function checkSpend(
  cost: number,
  { maxCreditsPerJob, monthlyCreditLimit, confirm = false, date, dir }: SpendLimits,
): { monthTotal: number; remaining: number } {
  if (cost > maxCreditsPerJob && !confirm) {
    throw new FlowPilotError("credits_over_job_limit", "core.credits.overJobLimit", {
      cost,
      limit: maxCreditsPerJob,
    });
  }
  const spent = monthTotal(date, dir);
  if (spent + cost > monthlyCreditLimit && !confirm) {
    throw new FlowPilotError("credits_over_monthly_limit", "core.credits.overMonthlyLimit", {
      spent,
      cost,
      limit: monthlyCreditLimit,
    });
  }
  return { monthTotal: spent, remaining: monthlyCreditLimit - spent - cost };
}
