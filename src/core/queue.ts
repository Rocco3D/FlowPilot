import { EventEmitter } from "node:events";
import { t } from "../i18n/index.js";
import type { FlowDriver } from "../flow/driver.js";
import { FlowPilotError } from "./errors.js";
import type { JobStore } from "./jobs.js";
import type { Job, JobRequest, JobStatus } from "./schemas.js";

export const TERMINAL: JobStatus[] = ["done", "failed", "cancelled", "interrupted"];

export class JobQueue extends EventEmitter {
  private processing: Promise<void> | undefined;
  private stopped = false;

  constructor(
    private readonly driver: FlowDriver,
    private readonly store: JobStore,
  ) {
    super();
    store.recoverInterrupted();
    this.schedule();
  }

  enqueue(request: JobRequest): Job {
    const job = this.store.create(request);
    this.emit("job", job);
    this.schedule();
    return job;
  }

  cancel(id: string): Job {
    const job = this.store.get(id);
    if (!job) throw new FlowPilotError("job_not_found", "core.jobs.notFound", { id });
    if (job.status !== "queued") {
      throw new FlowPilotError("job_not_cancellable", "core.queue.notCancellable", {
        id,
        status: job.status,
      });
    }
    return this.change(id, { status: "cancelled", finishedAt: new Date().toISOString() });
  }

  waitFor(id: string): Promise<Job> {
    const current = this.store.get(id);
    if (!current) {
      return Promise.reject(new FlowPilotError("job_not_found", "core.jobs.notFound", { id }));
    }
    if (TERMINAL.includes(current.status)) return Promise.resolve(current);
    return new Promise((resolve) => {
      const listener = (job: Job) => {
        if (job.id === id && TERMINAL.includes(job.status)) {
          this.off("job", listener);
          resolve(job);
        }
      };
      this.on("job", listener);
    });
  }

  /** Stops taking new jobs; resolves once the current one has finished. */
  async stop(): Promise<void> {
    this.stopped = true;
    await this.processing;
  }

  private change(id: string, patch: Partial<Job>): Job {
    const job = this.store.update(id, patch);
    this.emit("job", job);
    return job;
  }

  private schedule(): void {
    if (this.processing || this.stopped) return;
    this.processing = new Promise<void>((resolve) => setImmediate(resolve))
      .then(() => this.loop())
      .finally(() => {
        this.processing = undefined;
      });
  }

  private async loop(): Promise<void> {
    while (!this.stopped) {
      const next = this.store
        .list()
        .reverse()
        .find((j) => j.status === "queued");
      if (!next) return;
      await this.runJob(next);
    }
  }

  private async runJob(queued: Job): Promise<void> {
    const job = this.change(queued.id, {
      status: "running",
      startedAt: new Date().toISOString(),
    });
    try {
      const { results, credits } = await this.driver.run(job, (status) => {
        this.change(job.id, { status });
      });
      this.change(job.id, {
        status: "done",
        results,
        credits,
        finishedAt: new Date().toISOString(),
      });
    } catch (err) {
      const error =
        err instanceof FlowPilotError
          ? { code: err.code, message: err.message }
          : { code: "internal", message: t("core.error.internal") };
      this.change(job.id, { status: "failed", error, finishedAt: new Date().toISOString() });
    }
  }
}
