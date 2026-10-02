import type { Command } from "commander";
import type { Job } from "../../core/schemas.js";
import { t } from "../../i18n/index.js";
import { connect, show, type JsonOpt } from "../context.js";

export function formatJob(job: Job): string {
  const lines = [
    t("cli.job.id", { value: job.id }),
    t("cli.job.type", { value: job.request.type }),
    t("cli.job.status", { value: job.status }),
    t("cli.job.created", { value: job.createdAt }),
  ];
  if (job.credits !== undefined) lines.push(t("cli.job.credits", { value: job.credits }));
  if (job.error)
    lines.push(t("cli.job.error", { code: job.error.code, message: job.error.message }));
  for (const r of job.results) lines.push(t("cli.job.file", { value: r.path }));
  return lines.join("\n");
}

export function registerJobs(program: Command): void {
  program
    .command("jobs")
    .description(t("cli.jobs.description"))
    .option("--json", t("cli.jsonOption"))
    .action(async (opts: JsonOpt, cmd: Command) => {
      const jobs = await (await connect(cmd)).listJobs();
      show(opts, jobs, () =>
        jobs.length
          ? jobs.map((j) => [j.id, j.request.type, j.status, j.createdAt].join("  ")).join("\n")
          : t("cli.jobs.empty"),
      );
    });

  program
    .command("job")
    .description(t("cli.job.description"))
    .argument("<id>", t("cli.job.idArgument"))
    .option("--json", t("cli.jsonOption"))
    .action(async (id: string, opts: JsonOpt, cmd: Command) => {
      const job = await (await connect(cmd)).getJob(id);
      show(opts, job, () => formatJob(job));
    });

  program
    .command("cancel")
    .description(t("cli.cancel.description"))
    .argument("<id>", t("cli.job.idArgument"))
    .option("--json", t("cli.jsonOption"))
    .action(async (id: string, opts: JsonOpt, cmd: Command) => {
      const job = await (await connect(cmd)).cancelJob(id);
      show(opts, job, () => t("cli.cancel.done", { id: job.id, status: job.status }));
    });
}
