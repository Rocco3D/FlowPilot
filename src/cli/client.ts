import fs from "node:fs";
import path from "node:path";
import { loadConfig, type Config } from "../core/config.js";
import { FlowPilotError } from "../core/errors.js";
import { configDir } from "../core/paths.js";
import type {
  FlowBalance,
  Job,
  JobRequest,
  ModelInfo,
  SelftestReport,
  SessionStatus,
} from "../core/schemas.js";

export interface Credits {
  monthTotal: number;
  maxCreditsPerJob: number;
  monthlyCreditLimit: number;
  remaining: number;
  /** Real Google Flow balance, when the service could read it. */
  flowBalance?: FlowBalance;
}

export function resolvePort(port?: number): number {
  return port ?? loadConfig().port;
}

function readToken(): string | undefined {
  try {
    return fs.readFileSync(path.join(configDir(), "token"), "utf8").trim() || undefined;
  } catch {
    return undefined;
  }
}

export class Client {
  constructor(readonly port: number) {}

  private async request(method: string, route: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = {};
    const token = readToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    let res: Response;
    try {
      res = await fetch(`http://127.0.0.1:${this.port}${route}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new FlowPilotError("service_unreachable", "cli.error.serviceUnreachable", {
        port: this.port,
      });
    }
    if (!res.ok) {
      const data = (await res.json().catch(() => undefined)) as
        { error?: { code?: string; message?: string } } | undefined;
      throw new FlowPilotError(data?.error?.code ?? "http_error", "cli.error.server", {
        message: data?.error?.message ?? `HTTP ${res.status}`,
      });
    }
    return res;
  }

  private async json<T>(method: string, route: string, body?: unknown): Promise<T> {
    return (await (await this.request(method, route, body)).json()) as T;
  }

  health = () => this.json<{ ok: boolean; version: string }>("GET", "/health");
  doctor = () => this.json<SessionStatus>("POST", "/doctor");
  selftest = () => this.json<SelftestReport>("POST", "/selftest");
  models = () => this.json<ModelInfo[]>("GET", "/models");
  createJob = (req: JobRequest) => this.json<Job>("POST", "/jobs", req);
  listJobs = () => this.json<Job[]>("GET", "/jobs");
  getJob = (id: string) => this.json<Job>("GET", `/jobs/${encodeURIComponent(id)}`);
  cancelJob = (id: string) => this.json<Job>("DELETE", `/jobs/${encodeURIComponent(id)}`);
  credits = () => this.json<Credits>("GET", "/credits");
  getConfig = () => this.json<Config>("GET", "/config");
  setConfig = (key: string, value: string) =>
    this.json<Config>("PUT", `/config/${encodeURIComponent(key)}`, { value });
  shutdown = () => this.json<{ ok: true }>("POST", "/shutdown");

  async jobFile(id: string, index: number): Promise<Buffer> {
    const res = await this.request("GET", `/jobs/${encodeURIComponent(id)}/files/${index}`);
    return Buffer.from(await res.arrayBuffer());
  }
}
