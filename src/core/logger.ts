import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./paths.js";

// Log lines are for developers: plain English, not translated.
export type LogLevel = "debug" | "info" | "warn" | "error";
const order: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export interface LoggerOptions {
  dir?: string;
  level?: LogLevel;
  now?: () => Date;
}

export type LogFn = (message: string, data?: Record<string, unknown>) => void;
export interface Logger {
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function createLogger({
  dir = path.join(dataDir(), "logs"),
  level = "info",
  now = () => new Date(),
}: LoggerOptions = {}): Logger {
  const make =
    (lvl: LogLevel): LogFn =>
    (message, data) => {
      if (order[lvl] < order[level]) return;
      const d = now();
      const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const extra = data ? ` ${JSON.stringify(data)}` : "";
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(
        path.join(dir, `${day}.log`),
        `${d.toISOString()} ${lvl.toUpperCase()} ${message}${extra}\n`,
      );
    };
  return { debug: make("debug"), info: make("info"), warn: make("warn"), error: make("error") };
}
