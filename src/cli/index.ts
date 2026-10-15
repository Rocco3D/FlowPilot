#!/usr/bin/env node
import { loadConfig } from "../core/config.js";
import { setLocale } from "../i18n/index.js";
import { run } from "./program.js";

try {
  setLocale(loadConfig().locale);
} catch {
  // A broken configuration is reported by the command that needs it; the language stays automatic.
}
process.exitCode = await run(process.argv.slice(2));
