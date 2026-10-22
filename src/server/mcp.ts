import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Client, resolvePort } from "../cli/client.js";
import { ensureServiceRunning } from "../cli/service-control.js";
import { FlowPilotError } from "../core/errors.js";
import { JobRequest, Upscale, type Job } from "../core/schemas.js";

const { version } = createRequire(import.meta.url)("../../package.json") as { version: string };

const POLL_MS = 3000;
/**
 * Clients give up on a tool call well before a long generation ends, and the job keeps running in the service, so
 * holding the call risks the assistant reading a timeout as a failure and paying for the same work twice. A call that
 * reaches this limit answers `still_running` instead of an error, and the assistant asks again.
 */
const MAX_WAIT_MS = 45_000;
const TERMINAL = new Set(["done", "failed", "cancelled", "interrupted"]);

const COSTS =
  "Jobs run one at a time on the user's Google Flow account. Videos spend the user's Google Flow credits " +
  "(Veo 3.1 Lite 10, Fast 20, Quality 100, Omni 1.1 Flash 4-15 depending on resolution and duration). " +
  "Images with Nano Banana models cost 0 credits on the owner's plan.";
const CONFIRM =
  "Always confirm with the user before generating a video, because it spends credits.";
const WAIT =
  `wait (default true) polls until the job finishes, for at most ${MAX_WAIT_MS / 1000} seconds, and returns the ` +
  "result file paths; if the job is still running it returns { still_running: true, id, status } with no error, " +
  "because the job is still going: call get_job in a minute, or pass wait=false to only get the job id back.";

// `confirm` is left out for the same reason the credit limits are not in WRITABLE_KEYS: exceeding a limit needs the
// user, and a tool argument is something the assistant sets on its own.
const common = JobRequest.omit({
  type: true,
  maxCredits: true,
  confirm: true,
  modelFromConfig: true,
}).shape;
// `outputs` loses the schema default on purpose: the SDK fills defaults in before we see the arguments, and a filled
// in 1 would hide the configured `outputs` from the service.
const generateShape = {
  ...common,
  outputs: z.number().int().min(1).max(4).optional(),
  wait: z.boolean().default(true),
};

/**
 * The only settings an assistant may write. The credit limits are deliberately absent: `set_config` is a tool call an
 * assistant makes on its own, and a tool that can raise `maxCreditsPerJob` or `monthlyCreditLimit` is a way to spend
 * without asking. `port` and the API token are not there either.
 */
const WRITABLE_KEYS = ["defaultVideoModel", "defaultImageModel", "outputs", "locale"] as const;

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

const ok = (value: unknown): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
});

const fail = (code: string, message: string): ToolResult => ({
  content: [{ type: "text", text: `${code}: ${message}` }],
  isError: true,
});

export function createMcpServer(
  client: Client,
  pollMs = POLL_MS,
  maxWaitMs = MAX_WAIT_MS,
): McpServer {
  const server = new McpServer({ name: "flowpilot", version });
  let ready: Promise<void> | undefined;

  const ensureRunning = async (): Promise<void> => {
    ready ??= ensureServiceRunning(client);
    await ready.catch((err: unknown) => {
      ready = undefined;
      throw err;
    });
  };

  const handle = async (fn: () => Promise<unknown>): Promise<ToolResult> => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await ensureRunning();
        return ok(await fn());
      } catch (err) {
        // The service can stop on its own, with an idle shutdown or `flowpilot service stop`. The memoised start
        // is then stale, so drop it and try once: the next ensureRunning re-checks health and starts the service
        // again.
        if (attempt === 0 && err instanceof FlowPilotError && err.code === "service_unreachable") {
          ready = undefined;
          continue;
        }
        if (err instanceof FlowPilotError) return fail(err.code, err.message);
        return fail("internal_error", err instanceof Error ? err.message : String(err));
      }
    }
  };

  const tool = <S extends z.ZodRawShape>(
    name: string,
    description: string,
    shape: S,
    fn: (args: z.infer<z.ZodObject<S>>) => Promise<unknown>,
  ): void => {
    server.registerTool(name, { description, inputSchema: shape }, ((
      args: z.infer<z.ZodObject<S>>,
    ) => handle(() => fn(args))) as never);
  };

  /**
   * A tool without parameters. The protocol lets a client omit `arguments`, which an object schema rejects, so the
   * schema is made optional: the published schema stays an empty object and both `{}` and a missing `arguments`
   * are accepted. Wrapping the tools that have parameters would strip `properties` from what clients see.
   */
  const toolNoArgs = (name: string, description: string, fn: () => Promise<unknown>): void => {
    server.registerTool(name, { description, inputSchema: z.object({}).optional() }, (() =>
      handle(fn)) as never);
  };

  const finish = async (job: Job, wait: boolean): Promise<unknown> => {
    if (!wait) return { id: job.id, status: job.status };
    const deadline = Date.now() + maxWaitMs;
    while (!TERMINAL.has(job.status)) {
      if (Date.now() > deadline) {
        // Nothing failed: the job is still running in the service and will finish on its own. Saying so, instead of
        // reporting a timeout, keeps the assistant from paying for the same generation twice.
        return {
          still_running: true,
          id: job.id,
          status: job.status,
          hint: `Job ${job.id} is still ${job.status} and keeps running in FlowPilot. Call get_job with id "${job.id}" in about a minute to read the result file paths. Do not generate it again: the job is not lost, and generating it again would spend the credits a second time.`,
        };
      }
      await new Promise((r) => setTimeout(r, pollMs));
      job = await client.getJob(job.id);
    }
    if (job.status === "failed" && job.error) {
      throw new FlowPilotError(job.error.code, "cli.error.server", { message: job.error.message });
    }
    return job;
  };

  tool(
    "generate_video",
    `Generate a video with Google Flow. ${COSTS} ${CONFIRM} ${WAIT}`,
    generateShape,
    async ({ wait, ...req }) =>
      finish(await client.createJob(JobRequest.parse({ ...req, type: "video" })), wait),
  );

  tool(
    "generate_image",
    `Generate an image with Google Flow. ${COSTS} ${WAIT}`,
    generateShape,
    async ({ wait, ...req }) =>
      finish(await client.createJob(JobRequest.parse({ ...req, type: "image" })), wait),
  );

  tool(
    "list_media",
    "List the images and videos already in a Google Flow project, with id, type and title. `project` is a project " +
      "name or id; left out, the most recent project. It spends no credits. When a job is running, the list waits " +
      "for it to finish and `queued` is true.",
    { project: z.string().optional() },
    ({ project }) => client.listMedia(project),
  );

  tool(
    "download_media",
    "Download an image or video already in a Google Flow project, by its id from list_media or from the error of a " +
      "failed job. It generates nothing and spends no credits: use it instead of generating the same media again. " +
      '`upscale` is "original", "1080p" (2K for images) or "4k"; left out, the best the plan of the user offers: ' +
      "4K, else the 1080p/2K upscale, else the original. The file is saved " +
      `as <project>-media-<id>. ${WAIT}`,
    {
      mediaId: z.string(),
      project: z.string().optional(),
      outDir: z.string().optional(),
      upscale: Upscale.optional(),
      wait: z.boolean().default(true),
    },
    async ({ wait, ...req }) => finish(await client.downloadMedia(req), wait),
  );

  const idShape = { id: z.string() };
  tool("get_job", "Get the status and results of a FlowPilot job by id.", idShape, ({ id }) =>
    client.getJob(id),
  );
  tool(
    "list_jobs",
    "List the most recent FlowPilot jobs.",
    { limit: z.number().int().positive().default(20) },
    async ({ limit }) => (await client.listJobs()).slice(0, limit),
  );
  tool(
    "cancel_job",
    "Cancel a queued FlowPilot job by id. Running jobs cannot be cancelled.",
    idShape,
    ({ id }) => client.cancelJob(id),
  );
  toolNoArgs(
    "list_models",
    `List the available models with ratios, durations and credit costs. ${COSTS}`,
    () => client.models(),
  );
  toolNoArgs(
    "get_credits",
    "Show the Google Flow credits spent this month through FlowPilot, the remaining credits and the " +
      "configured limits. `flowBalance.credits` is the real balance of the Google Flow account, read from Flow.",
    () => client.credits(),
  );
  toolNoArgs("selftest", "Run the FlowPilot service self-test.", () => client.selftest());
  toolNoArgs(
    "doctor",
    "Check that Chrome is running and signed in to Google Flow. When a newer FlowPilot version " +
      "exists, the result has an `update` field: tell the user its message.",
    () => client.doctor(),
  );
  toolNoArgs(
    "get_config",
    "Show the FlowPilot configuration: default models, outputs per job, credit limits, language and where " +
      "results are saved. A default model or a language that is not set is null.",
    async () => {
      const config = await client.getConfig();
      // A setting that is not set disappears from the JSON, and "not set" is something an assistant has to be
      // able to see: it is what makes a job use the model already selected in Flow.
      return {
        ...config,
        defaultVideoModel: config.defaultVideoModel ?? null,
        defaultImageModel: config.defaultImageModel ?? null,
        locale: config.locale ?? null,
      };
    },
  );
  tool(
    "set_config",
    `Change one FlowPilot setting. Only ${WRITABLE_KEYS.join(", ")} can be changed: the credit limits are not ` +
      "writable from a tool call, because spending more needs the user, not the assistant. The default models and " +
      "outputs take effect on the next job; locale takes effect the next time the service starts.",
    { key: z.enum(WRITABLE_KEYS), value: z.string() },
    async ({ key, value }) => {
      const updated = await client.setConfig(key, value);
      return { [key]: updated[key] };
    },
  );

  return server;
}

/** Serves MCP over stdio. stdout is reserved for the protocol. */
export async function startMcpServer(port?: number): Promise<void> {
  const server = createMcpServer(new Client(resolvePort(port)));
  await server.connect(new StdioServerTransport());
}
