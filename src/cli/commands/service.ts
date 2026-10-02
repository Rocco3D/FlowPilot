import type { Command } from "commander";
import { t } from "../../i18n/index.js";
import { connect, newClient, show, type JsonOpt } from "../context.js";
import { serviceStatus, stopService } from "../service-control.js";

export function registerService(program: Command): void {
  const service = program.command("service").description(t("cli.service.description"));

  service
    .command("start")
    .description(t("cli.service.startDescription"))
    .option("--json", t("cli.jsonOption"))
    .action(async (opts: JsonOpt, cmd: Command) => {
      await connect(cmd);
      const status = await serviceStatus(newClient(cmd));
      show(opts, status, () => t("cli.service.started", { port: status.port }));
    });

  service
    .command("stop")
    .description(t("cli.service.stopDescription"))
    .option("--json", t("cli.jsonOption"))
    .action(async (opts: JsonOpt, cmd: Command) => {
      const stopped = await stopService(newClient(cmd));
      show(opts, { stopped }, () => t(stopped ? "cli.service.stopped" : "cli.service.notRunning"));
    });

  service
    .command("status")
    .description(t("cli.service.statusDescription"))
    .option("--json", t("cli.jsonOption"))
    .action(async (opts: JsonOpt, cmd: Command) => {
      const s = await serviceStatus(newClient(cmd));
      show(opts, s, () =>
        s.running
          ? [
              t("cli.service.running", { port: s.port, version: s.version ?? "" }),
              s.pid !== undefined ? t("cli.service.pid", { value: s.pid }) : "",
              s.startedAt ? t("cli.service.startedAt", { value: s.startedAt }) : "",
            ]
              .filter(Boolean)
              .join("\n")
          : t("cli.service.notRunning"),
      );
    });
}
