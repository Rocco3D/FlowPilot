#!/usr/bin/env node
import { createRequire } from "node:module";
import { Command } from "commander";
import { t } from "../i18n/index.js";

const { version } = createRequire(import.meta.url)("../../package.json") as { version: string };

const program = new Command()
  .name("flowpilot")
  .description(t("cli.description"))
  .version(version, "-V, --version", t("cli.versionOption"))
  .helpOption("-h, --help", t("cli.helpOption"));

program.parse();
