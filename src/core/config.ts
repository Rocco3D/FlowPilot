import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { FlowPilotError } from "./errors.js";
import { configDir, defaultOutputDir } from "./paths.js";

export const Config = z.object({
  outputDir: z.string().default(() => defaultOutputDir()),
  defaultVideoModel: z.string().optional(),
  defaultImageModel: z.string().optional(),
  outputs: z.number().int().min(1).max(4).default(1),
  maxCreditsPerJob: z.number().int().min(0).default(20),
  monthlyCreditLimit: z.number().int().min(0).default(1000),
  locale: z.string().optional(),
  port: z.number().int().min(1024).max(65535).default(47820),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
  /** Click "I agree" on the rights dialog Flow shows after each upload. */
  acceptUploadRights: z.boolean().default(true),
});
export type Config = z.infer<typeof Config>;

// Fields whose raw string is parsed as a number; all others stay strings.
const numericKeys = new Set<string>(["outputs", "maxCreditsPerJob", "monthlyCreditLimit", "port"]);

// Fields whose "true"/"false" string becomes a boolean.
const booleanKeys = new Set<string>(["acceptUploadRights"]);

function configFile(dir: string): string {
  return path.join(dir, "config.json");
}

function invalid(file: string, reason: string): FlowPilotError {
  return new FlowPilotError("config_invalid", "core.config.invalid", { path: file, reason });
}

export function loadConfig(dir: string = configDir()): Config {
  const file = configFile(dir);
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return Config.parse({});
    throw invalid(file, (err as Error).message);
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw invalid(file, (err as Error).message);
  }
  const parsed = Config.safeParse(json);
  if (!parsed.success) throw invalid(file, parsed.error.message);
  return parsed.data;
}

export function saveConfig(config: Config, dir: string = configDir()): void {
  fs.mkdirSync(dir, { recursive: true });
  const file = configFile(dir);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

function assertKey(key: string): asserts key is keyof Config {
  if (!(key in Config.shape)) {
    throw new FlowPilotError("config_unknown_key", "core.config.unknownKey", { key });
  }
}

export function getConfigValue(key: string, dir?: string): Config[keyof Config] {
  assertKey(key);
  return loadConfig(dir)[key];
}

export function setConfigValue(key: string, rawValue: string, dir: string = configDir()): Config {
  assertKey(key);
  const current = loadConfig(dir);
  let value: string | number | boolean = rawValue;
  if (numericKeys.has(key) && rawValue.trim() !== "") value = Number(rawValue);
  else if (booleanKeys.has(key) && (rawValue === "true" || rawValue === "false")) {
    value = rawValue === "true";
  }
  const parsed = Config.safeParse({ ...current, [key]: value });
  if (!parsed.success) throw invalid(configFile(dir), `${key}: ${parsed.error.message}`);
  saveConfig(parsed.data, dir);
  return parsed.data;
}
