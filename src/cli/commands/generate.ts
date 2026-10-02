import fs from "node:fs";
import path from "node:path";
import { Option, type Command } from "commander";
import { FlowPilotError } from "../../core/errors.js";
import type { Job, JobRequest, JobType } from "../../core/schemas.js";
import { t } from "../../i18n/index.js";
import { connect, show, type Ctx, type JsonOpt } from "../context.js";

interface GenerateOpts extends JsonOpt {
  prompt?: string;
  promptFile?: string;
  model?: string;
  ratio?: string;
  duration?: number;
  resolution?: string;
  outputs?: number;
  startFrame?: string;
  endFrame?: string;
  ingredient?: string[];
  character?: string[];
  project?: string;
  out?: string;
  upscale?: "1080p" | "4k";
  maxCredits?: number;
  wait: boolean;
}

const TERMINAL = new Set(["done", "failed", "cancelled", "interrupted"]);

function number(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n))
    throw new FlowPilotError("invalid_number", "cli.error.invalidNumber", { value });
  return n;
}

function absolute(p: string | undefined): string | undefined {
  return p === undefined ? undefined : path.resolve(p);
}

function readPrompt(opts: GenerateOpts): string {
  if ((opts.prompt === undefined) === (opts.promptFile === undefined)) {
    throw new FlowPilotError("invalid_prompt", "cli.generate.promptExactlyOne");
  }
  if (opts.promptFile === undefined) return opts.prompt as string;
  try {
    return fs.readFileSync(path.resolve(opts.promptFile), "utf8");
  } catch (err) {
    throw new FlowPilotError("prompt_file_unreadable", "cli.generate.promptFileUnreadable", {
      path: path.resolve(opts.promptFile),
      reason: (err as Error).message,
    });
  }
}

function buildRequest(type: JobType, opts: GenerateOpts): JobRequest {
  const video = type === "video";
  return {
    type,
    prompt: readPrompt(opts),
    model: opts.model,
    ratio: opts.ratio,
    duration: video ? opts.duration : undefined,
    resolution: video ? opts.resolution : undefined,
    outputs: opts.outputs ?? 1,
    startFrame: absolute(opts.startFrame),
    endFrame: video ? absolute(opts.endFrame) : undefined,
    ingredients: opts.ingredient?.map((p) => path.resolve(p)),
    characters: opts.character,
    project: opts.project,
    outDir: absolute(opts.out),
    upscale: opts.upscale,
    maxCredits: opts.maxCredits,
  };
}

async function waitForJob(
  client: Awaited<ReturnType<typeof connect>>,
  job: Job,
  opts: GenerateOpts,
  ctx: Ctx,
): Promise<Job> {
  let last = "";
  for (;;) {
    if (job.status !== last) {
      last = job.status;
      if (!opts.json) console.log(t("cli.generate.status", { status: job.status }));
    }
    if (TERMINAL.has(job.status)) return job;
    await new Promise((r) => setTimeout(r, ctx.pollMs));
    job = await client.getJob(job.id);
  }
}

function register(program: Command, type: JobType, ctx: Ctx): void {
  const video = type === "video";
  const cmd = program
    .command(type)
    .description(t(`cli.${type}.description`))
    .option("--prompt <text>", t("cli.generate.promptOption"))
    .option("--prompt-file <path>", t("cli.generate.promptFileOption"))
    .option("--model <name>", t("cli.generate.modelOption"))
    .option("--ratio <ratio>", t("cli.generate.ratioOption"));
  if (video) {
    cmd
      .option("--duration <seconds>", t("cli.generate.durationOption"), number)
      .option("--resolution <resolution>", t("cli.generate.resolutionOption"));
  }
  cmd
    .option("--outputs <n>", t("cli.generate.outputsOption"), number)
    .option("--start-frame <path>", t("cli.generate.startFrameOption"));
  if (video) cmd.option("--end-frame <path>", t("cli.generate.endFrameOption"));
  cmd
    .option("--ingredient <paths...>", t("cli.generate.ingredientOption"))
    .option("--character <names...>", t("cli.generate.characterOption"))
    .option("--project <name>", t("cli.generate.projectOption"))
    .option("--out <dir>", t("cli.generate.outOption"))
    .option("--upscale <resolution>", t("cli.generate.upscaleOption"))
    .option("--max-credits <n>", t("cli.generate.maxCreditsOption"), number)
    .addOption(new Option("--wait", t("cli.generate.waitOption")).default(true))
    .option("--no-wait", t("cli.generate.noWaitOption"))
    .option("--json", t("cli.jsonOption"))
    .action(async (opts: GenerateOpts, command: Command) => {
      const request = buildRequest(type, opts);
      const client = await connect(command);
      let job = await client.createJob(request);
      if (!opts.wait) {
        show(opts, job, () => t("cli.generate.queued", { id: job.id }));
        return;
      }
      job = await waitForJob(client, job, opts, ctx);
      if (job.status !== "done") {
        throw new FlowPilotError(job.error?.code ?? job.status, "cli.generate.failed", {
          id: job.id,
          message: job.error?.message ?? job.status,
        });
      }
      show(opts, job, () => job.results.map((r) => r.path).join("\n"));
    });
}

export function registerGenerate(program: Command, ctx: Ctx): void {
  register(program, "video", ctx);
  register(program, "image", ctx);
}
