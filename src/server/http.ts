import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { ZodError } from "zod";
import { t } from "../i18n/index.js";
import type { FlowDriver } from "../flow/driver.js";
import { loadConfig, setConfigValue } from "../core/config.js";
import { monthTotal } from "../core/credits.js";
import { FlowPilotError } from "../core/errors.js";
import type { Logger } from "../core/logger.js";
import type { JobStore } from "../core/jobs.js";
import type { JobQueue } from "../core/queue.js";
import { JobRequest, type UpdateInfo } from "../core/schemas.js";
import { isAuthorized } from "./auth.js";

export interface HttpDeps {
  driver: FlowDriver;
  queue: JobQueue;
  store: JobStore;
  token: string;
  configDir?: string;
  dataDir?: string;
  version: string;
  /** Looks for a newer FlowPilot version; doctor reports it. */
  checkUpdate?: (installed: string) => Promise<UpdateInfo | undefined>;
  logger: Logger;
  /** Called after `POST /shutdown` has been answered. */
  onShutdown: () => void;
  /** Called for every request except `GET /health`. */
  onActivity: () => void;
}

const MAX_BODY = 1024 * 1024;

const CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const notFound = () => new HttpError(404, "not_found", t("http.notFound"));
const badRequest = (message: string) => new HttpError(400, "bad_request", message);

function send(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJson(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, "bad_request", t("http.bodyTooLarge"));
    chunks.push(chunk as Buffer);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw badRequest(t("http.badJson"));
  }
}

const STATUS_BY_CODE: Record<string, number> = {
  not_found: 404,
  job_not_found: 404,
  job_not_cancellable: 409,
  bad_request: 400,
  unauthorized: 401,
};

function toHttpError(err: unknown, logger: Logger): HttpError {
  if (err instanceof HttpError) return err;
  if (err instanceof ZodError) return badRequest(err.message);
  if (err instanceof FlowPilotError) {
    const status = STATUS_BY_CODE[err.code] ?? (err.code.startsWith("config_") ? 400 : 500);
    return new HttpError(status, err.code, err.message);
  }
  logger.error("unexpected error in HTTP handler", {
    error: err instanceof Error ? (err.stack ?? err.message) : String(err),
  });
  return new HttpError(500, "internal", t("core.error.internal"));
}

export function createHttpServer(deps: HttpDeps): http.Server {
  const { driver, queue, store } = deps;

  const requireJob = (id: string) => {
    const job = store.get(id);
    if (!job) throw new FlowPilotError("job_not_found", "core.jobs.notFound", { id });
    return job;
  };

  async function sendFile(res: http.ServerResponse, id: string, index: string): Promise<void> {
    const result = /^\d+$/.test(index) ? requireJob(id).results[Number(index)] : undefined;
    if (!result) throw notFound();
    const type =
      CONTENT_TYPES[path.extname(result.path).toLowerCase()] ?? "application/octet-stream";
    let size: number;
    try {
      size = (await fs.promises.stat(result.path)).size;
    } catch {
      throw notFound();
    }
    res.writeHead(200, { "content-type": type, "content-length": size });
    fs.createReadStream(result.path)
      .on("error", () => res.destroy())
      .pipe(res);
  }

  async function route(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const method = req.method ?? "GET";
    const parts = new URL(req.url ?? "/", "http://localhost").pathname
      .split("/")
      .filter(Boolean)
      .map(decodeURIComponent);
    const [a, b, c, d] = parts;
    const is = (m: string, n: number, head: string) =>
      method === m && parts.length === n && a === head;

    if (is("GET", 1, "health")) return send(res, 200, { ok: true, version: deps.version });
    deps.onActivity();
    if (!isAuthorized(req.headers.authorization, deps.token)) {
      throw new HttpError(401, "unauthorized", t("http.unauthorized"));
    }

    if (is("POST", 1, "doctor")) {
      const [status, update] = await Promise.all([
        driver.doctor(),
        deps.checkUpdate?.(deps.version),
      ]);
      return send(res, 200, update ? { ...status, update } : status);
    }
    if (is("POST", 1, "selftest")) return send(res, 200, await driver.selftest());
    if (is("GET", 1, "models")) return send(res, 200, await driver.listModels());
    if (is("POST", 1, "jobs")) {
      const body = JobRequest.parse(await readJson(req));
      const outDir = body.outDir ?? loadConfig(deps.configDir).outputDir;
      return send(res, 201, queue.enqueue({ ...body, outDir }));
    }
    if (is("GET", 1, "jobs")) return send(res, 200, store.list());
    if (is("GET", 2, "jobs")) return send(res, 200, requireJob(b!));
    if (is("DELETE", 2, "jobs")) return send(res, 200, queue.cancel(b!));
    if (is("GET", 4, "jobs") && c === "files") return sendFile(res, b!, d!);
    if (is("GET", 1, "credits")) {
      const cfg = loadConfig(deps.configDir);
      const total = monthTotal(undefined, deps.dataDir);
      // Reading Flow's balance can fail (Chrome closed, signed out); the local figures still answer.
      const flowBalance = await driver.balance?.().catch(() => undefined);
      return send(res, 200, {
        monthTotal: total,
        maxCreditsPerJob: cfg.maxCreditsPerJob,
        monthlyCreditLimit: cfg.monthlyCreditLimit,
        remaining: cfg.monthlyCreditLimit - total,
        ...(flowBalance ? { flowBalance } : {}),
      });
    }
    if (is("GET", 1, "config")) return send(res, 200, loadConfig(deps.configDir));
    if (is("PUT", 2, "config")) {
      const body = (await readJson(req)) as { value?: unknown } | null;
      if (typeof body?.value !== "string") throw badRequest(t("http.valueRequired"));
      return send(res, 200, setConfigValue(b!, body.value, deps.configDir));
    }
    if (is("POST", 1, "shutdown")) {
      res.writeHead(200, { "content-type": "application/json", connection: "close" });
      res.end(JSON.stringify({ ok: true }), () => deps.onShutdown());
      return;
    }
    throw notFound();
  }

  return http.createServer((req, res) => {
    route(req, res).catch((err: unknown) => {
      const e = toHttpError(err, deps.logger);
      send(res, e.status, { error: { code: e.code, message: e.message } });
    });
  });
}
