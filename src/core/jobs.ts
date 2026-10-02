import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { FlowPilotError } from "./errors.js";
import { dataDir } from "./paths.js";
import { Job, JobRequest } from "./schemas.js";

export class JobStore {
  private lastMs = 0;

  constructor(private readonly dir: string = path.join(dataDir(), "jobs")) {}

  create(request: JobRequest): Job {
    const parsed = JobRequest.parse(request);
    // Strictly increasing timestamps keep ids sorted by creation order.
    const ms = Math.max(Date.now(), this.lastMs + 1);
    this.lastMs = ms;
    const createdAt = new Date(ms).toISOString();
    const stamp = createdAt.replace(/[-:]/g, "").replace(".", "").replace("T", "-").slice(0, -1);
    const job: Job = {
      id: `${stamp}-${randomBytes(2).toString("hex")}`,
      request: parsed,
      status: "queued",
      createdAt,
      results: [],
    };
    this.save(job);
    return job;
  }

  get(id: string): Job | undefined {
    try {
      return Job.parse(JSON.parse(fs.readFileSync(this.file(id), "utf8")));
    } catch {
      return undefined;
    }
  }

  /** All jobs, newest first. Unreadable files are skipped. */
  list(): Job[] {
    let names: string[];
    try {
      names = fs.readdirSync(this.dir);
    } catch {
      return [];
    }
    return names
      .filter((n) => n.endsWith(".json"))
      .map((n) => this.get(n.slice(0, -".json".length)))
      .filter((j): j is Job => j !== undefined)
      .sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  }

  update(id: string, patch: Partial<Job>): Job {
    const current = this.get(id);
    if (!current) throw new FlowPilotError("job_not_found", "core.jobs.notFound", { id });
    const job = Job.parse({ ...current, ...patch, id });
    this.save(job);
    return job;
  }

  /** Marks jobs left running or downloading by a previous process as interrupted. */
  recoverInterrupted(): string[] {
    const ids: string[] = [];
    for (const job of this.list()) {
      if (job.status === "running" || job.status === "downloading") {
        this.update(job.id, { status: "interrupted", finishedAt: new Date().toISOString() });
        ids.push(job.id);
      }
    }
    return ids;
  }

  private file(id: string): string {
    return path.join(this.dir, `${id}.json`);
  }

  private save(job: Job): void {
    fs.mkdirSync(this.dir, { recursive: true });
    const target = this.file(job.id);
    const tmp = `${target}.${randomBytes(4).toString("hex")}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(job, null, 2));
    fs.renameSync(tmp, target);
  }
}
