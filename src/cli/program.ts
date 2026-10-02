import { createRequire } from "node:module";
import { Command, CommanderError } from "commander";
import { FlowPilotError } from "../core/errors.js";
import { t } from "../i18n/index.js";
import { registerConfig } from "./commands/config.js";
import { registerGenerate } from "./commands/generate.js";
import { registerInfo } from "./commands/info.js";
import { registerJobs } from "./commands/jobs.js";
import { registerLogin } from "./commands/login.js";
import { registerService } from "./commands/service.js";
import { startMcpServer } from "../server/mcp.js";
import type { Ctx } from "./context.js";

const { version } = createRequire(import.meta.url)("../../package.json") as { version: string };

export function buildProgram(ctx: Ctx = { pollMs: 2000 }): Command {
  const program = new Command()
    .name("flowpilot")
    .description(t("cli.description"))
    .version(version, "-V, --version", t("cli.versionOption"))
    .helpOption("-h, --help", t("cli.helpOption"))
    .option("--port <port>", t("cli.portOption"), Number)
    .exitOverride();
  registerInfo(program);
  registerGenerate(program, ctx);
  registerJobs(program);
  registerConfig(program);
  registerService(program);
  registerLogin(program, ctx);
  program
    .command("mcp")
    .description(t("cli.mcp.description"))
    .action(async (_opts: unknown, cmd: Command) => {
      await startMcpServer(cmd.optsWithGlobals<{ port?: number }>().port);
    });
  return program;
}

/** Runs the CLI and returns the process exit code. */
export async function run(argv: string[], ctx?: Ctx): Promise<number> {
  try {
    await buildProgram(ctx).parseAsync(argv, { from: "user" });
    return 0;
  } catch (err) {
    if (err instanceof CommanderError) return err.exitCode;
    const error =
      err instanceof FlowPilotError
        ? { code: err.code, message: err.message }
        : { code: "internal_error", message: err instanceof Error ? err.message : String(err) };
    console.error(argv.includes("--json") ? JSON.stringify({ error }) : error.message);
    return 1;
  }
}
