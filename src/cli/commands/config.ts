import type { Command } from "commander";
import { FlowPilotError } from "../../core/errors.js";
import { t } from "../../i18n/index.js";
import { connect, show, type JsonOpt } from "../context.js";

function format(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function registerConfig(program: Command): void {
  const config = program.command("config").description(t("cli.config.description"));

  config
    .command("get")
    .description(t("cli.config.getDescription"))
    .argument("[key]", t("cli.config.keyArgument"))
    .option("--json", t("cli.jsonOption"))
    .action(async (key: string | undefined, opts: JsonOpt, cmd: Command) => {
      const all = (await (await connect(cmd)).getConfig()) as Record<string, unknown>;
      if (key === undefined) {
        show(opts, all, () =>
          Object.entries(all)
            .map(([k, v]) => `${k}=${format(v)}`)
            .join("\n"),
        );
        return;
      }
      if (!(key in all))
        throw new FlowPilotError("config_unknown_key", "core.config.unknownKey", { key });
      show(opts, all[key], () => format(all[key]));
    });

  config
    .command("set")
    .description(t("cli.config.setDescription"))
    .argument("<key>", t("cli.config.keyArgument"))
    .argument("<value>", t("cli.config.valueArgument"))
    .option("--json", t("cli.jsonOption"))
    .action(async (key: string, value: string, opts: JsonOpt, cmd: Command) => {
      const updated = (await (await connect(cmd)).setConfig(key, value)) as Record<string, unknown>;
      show(opts, updated, () => `${key}=${format(updated[key])}`);
    });
}
