import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Client, resolvePort } from "../cli/client.js";
import { ensureServiceRunning } from "../cli/service-control.js";
import { FlowPilotError } from "../core/errors.js";
import { JobRequest, type Job } from "../core/schemas.js";

const { version } = createRequire(import.meta.url)("../../package.json") as { version: string };

const POLL_MS = 3000;
const MAX_WAIT_MS = 30 * 60 * 1000;
const TERMINAL = new Set(["done", "failed", "cancelled", "interrupted"]);

const COSTS =
  "Jobs run one at a time on the user's Google Flow account. Videos spend the user's Google Flow credits " +
  "(Veo 3.1 Lite 10, Fast 20, Quality 100, Omni 1.1 Flash 4-15 depending on resolution and duration). " +
  "Images with Nano Banana models cost 0 credits on the owner's plan.";
const CONFIRM =
  "Always confirm with the user before generating a video, because it spends credits.";
const WAIT =
  "wait (default true) polls until the job finishes (up to 30 minutes) and returns the result file paths; " +
  "with wait=false only the job id is returned.";

const common = JobRequest.omit({ type: true, maxCredits: true }).shape;
const generateShape = { ...common, wait: z.boolean().default(true) };

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

const ok = (value: unknown): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
});

const fail = (code: string, message: string): ToolResult => ({
  content: [{ type: "text", text: `${code}: ${message}` }],
  isError: true,
});

export function createMcpServer(client: Client, pollMs = POLL_MS): McpServer {
  const server = new McpServer({ name: "flowpilot", version });
  let ready: Promise<void> | undefined;

  const tool = <S extends z.ZodRawShape>(
    name: string,
    description: string,
    shape: S,
    fn: (args: z.infer<z.ZodObject<S>>) => Promise<unknown>,
  ): void => {
    server.registerTool(name, { description, inputSchema: shape }, (async (
      args: z.infer<z.ZodObject<S>>,
    ) => {
      try {
        ready ??= ensureServiceRunning(client);
        await ready.catch((err: unknown) => {
          ready = undefined;
          throw err;
        });
        return ok(await fn(args));
      } catch (err) {
        if (err instanceof FlowPilotError) return fail(err.code, err.message);
        return fail("internal_error", err instanceof Error ? err.message : String(err));
      }
    }) as never);
  };

  const finish = async (job: Job, wait: boolean): Promise<unknown> => {
    if (!wait) return { id: job.id, status: job.status };
    const deadline = Date.now() + MAX_WAIT_MS;
    while (!TERMINAL.has(job.status)) {
      if (Date.now() > deadline) {
        throw new FlowPilotError("wait_timeout", "cli.error.server", {
          message: `Job ${job.id} is still ${job.status} after 30 minutes. Use get_job to check it later.`,
        });
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
  tool(
    "list_models",
    `List the available models with ratios, durations and credit costs. ${COSTS}`,
    {},
    () => client.models(),
  );
  tool(
    "get_credits",
    "Show the Google Flow credits spent this month, the remaining credits and the configured limits.",
    {},
    () => client.credits(),
  );
  tool("selftest", "Run the FlowPilot service self-test.", {}, () => client.selftest());
  tool("doctor", "Check that Chrome is running and signed in to Google Flow.", {}, () =>
    client.doctor(),
  );

  return server;
}

/** Serves MCP over stdio. stdout is reserved for the protocol. */
export async function startMcpServer(port?: number): Promise<void> {
  const server = createMcpServer(new Client(resolvePort(port)));
  await server.connect(new StdioServerTransport());
}
