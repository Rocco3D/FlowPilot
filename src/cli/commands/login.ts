import type { Command } from "commander";
import { BrowserSession } from "../../browser/session.js";
import { t } from "../../i18n/index.js";
import { newClient, show, type Ctx, type JsonOpt } from "../context.js";
import { stopEverything } from "../service-control.js";

export function registerLogin(program: Command, ctx: Ctx): void {
  program
    .command("login")
    .description(t("cli.login.description"))
    .option("--profile <name>", t("cli.login.profileOption"))
    .option("--json", t("cli.jsonOption"))
    .action(async (opts: JsonOpt & { profile?: string }, cmd: Command) => {
      await stopEverything(newClient(cmd), ctx.stopDeps);
      const openLogin =
        ctx.openLogin ??
        ((profile?: string) => new BrowserSession({ profile, headed: true }).openLogin());
      const profileDir = await openLogin(opts.profile);
      show(opts, { profileDir }, () => t("cli.login.instructions", { dir: profileDir }));
    });
}
