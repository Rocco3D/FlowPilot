import type { Command } from "commander";
import { FlowPilotError } from "../../core/errors.js";
import type { SelftestReport } from "../../core/schemas.js";
import { getLocale, t } from "../../i18n/index.js";
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
          ...(s.update ? [s.update.message] : []),
        ].join("\n"),
      );
    });

  program
    .command("selftest")
    .description(t("cli.selftest.description"))
    .option("--json", t("cli.jsonOption"))
    .action(async (opts: JsonOpt, cmd: Command) => {
      const r = await (await connect(cmd)).selftest();
      show(opts, r, () => formatSelftest(r));
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
          ...(c.flowBalance
            ? [
                t("cli.credits.flowBalance", {
                  value: c.flowBalance.credits,
                  time: new Date(c.flowBalance.readAt).toLocaleTimeString(getLocale(), {
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                }),
              ]
            : []),
        ].join("\n"),
      );
    });
}

/** Check lines plus the all-ok line; the failure line comes from the thrown error, once. */
export function formatSelftest(r: SelftestReport): string {
  const lines = r.checks.map(
    (c) =>
      `${t(c.ok ? "cli.selftest.pass" : "cli.selftest.fail")} ${c.name}${c.detail ? ` - ${c.detail}` : ""}`,
  );
  if (r.ok) lines.push(t("cli.selftest.allOk"));
  return lines.join("\n");
}

function yesNo(value: boolean): string {
  return t(value ? "cli.yes" : "cli.no");
}
