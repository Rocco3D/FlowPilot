import type { Command } from "commander";
import { FlowPilotError } from "../../core/errors.js";
import { t } from "../../i18n/index.js";
import { connect, show, type JsonOpt } from "../context.js";

export function registerInfo(program: Command): void {
  program
    .command("doctor")
    .description(t("cli.doctor.description"))
    .option("--json", t("cli.jsonOption"))
    .action(async (opts: JsonOpt, cmd: Command) => {
      const s = await (await connect(cmd)).doctor();
      show(opts, s, () =>
        [
          s.message,
          t("cli.doctor.chrome", { value: yesNo(s.chromeRunning) }),
          t("cli.doctor.connected", { value: yesNo(s.connected) }),
          t("cli.doctor.signedIn", { value: yesNo(s.signedIn) }),
        ].join("\n"),
      );
    });

  program
    .command("selftest")
    .description(t("cli.selftest.description"))
    .option("--json", t("cli.jsonOption"))
    .action(async (opts: JsonOpt, cmd: Command) => {
      const r = await (await connect(cmd)).selftest();
      show(opts, r, () =>
        [
          ...r.checks.map(
            (c) =>
              `${t(c.ok ? "cli.selftest.pass" : "cli.selftest.fail")} ${c.name}${c.detail ? ` - ${c.detail}` : ""}`,
          ),
          t(r.ok ? "cli.selftest.allOk" : "cli.selftest.someFailed"),
        ].join("\n"),
      );
      if (!r.ok) throw new FlowPilotError("selftest_failed", "cli.selftest.someFailed");
    });

  program
    .command("models")
    .description(t("cli.models.description"))
    .option("--json", t("cli.jsonOption"))
    .action(async (opts: JsonOpt, cmd: Command) => {
      const models = await (await connect(cmd)).models();
      show(opts, models, () =>
        models
          .map((m) =>
            [
              m.name,
              m.kind,
              t("cli.models.ratios", { value: m.ratios.join(",") }),
              m.durations.length ? t("cli.models.durations", { value: m.durations.join(",") }) : "",
            ]
              .filter(Boolean)
              .join("  "),
          )
          .join("\n"),
      );
    });

  program
    .command("credits")
    .description(t("cli.credits.description"))
    .option("--json", t("cli.jsonOption"))
    .action(async (opts: JsonOpt, cmd: Command) => {
      const c = await (await connect(cmd)).credits();
      show(opts, c, () =>
        [
          t("cli.credits.month", { value: c.monthTotal }),
          t("cli.credits.remaining", { value: c.remaining }),
          t("cli.credits.perJob", { value: c.maxCreditsPerJob }),
          t("cli.credits.monthly", { value: c.monthlyCreditLimit }),
        ].join("\n"),
      );
    });
}

function yesNo(value: boolean): string {
  return t(value ? "cli.yes" : "cli.no");
}
