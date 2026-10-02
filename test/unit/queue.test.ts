import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FlowPilotError } from "../../src/core/errors.js";
import { JobStore } from "../../src/core/jobs.js";
import { JobQueue } from "../../src/core/queue.js";
import type { Job, JobRequest } from "../../src/core/schemas.js";
import type { FlowDriver } from "../../src/flow/driver.js";
import { FakeDriver } from "../fakes/fake-driver.js";
import { setLocale } from "../../src/i18n/index.js";

let dir: string;
const req: JobRequest = { type: "image", prompt: "a cat", outputs: 1 };

beforeEach(() => {
  setLocale("en");
  dir = path.resolve(
    import.meta.dirname,
    "../../temp/tests",
    `queue-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  fs.mkdirSync(dir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Wraps a driver, recording how many runs overlap and in which order they start. */
function tracking(inner: FlowDriver) {
  const state = { current: 0, max: 0, order: [] as string[] };
  const driver = Object.create(inner) as FlowDriver;
  driver.run = async (job, onProgress) => {
    state.current++;
    state.max = Math.max(state.max, state.current);
    state.order.push(job.id);
    try {
      return await inner.run(job, onProgress);
    } finally {
      state.current--;
    }
  };
  return { driver, state };
}

describe("JobQueue", () => {
  it("runs jobs strictly one at a time, in creation order", async () => {
    const { driver, state } = tracking(new FakeDriver({ delayMs: 10 }));
    const queue = new JobQueue(driver, new JobStore(dir));
    const jobs = [1, 2, 3, 4].map(() => queue.enqueue(req));
    await Promise.all(jobs.map((j) => queue.waitFor(j.id)));
    expect(state.max).toBe(1);
    expect(state.order).toEqual(jobs.map((j) => j.id));
  });

  it("stores results, credits and timestamps on success", async () => {
    const queue = new JobQueue(new FakeDriver(), new JobStore(dir));
    const job = queue.enqueue({ type: "video", prompt: "x", outputs: 2 });
    const done = await queue.waitFor(job.id);
    expect(done.status).toBe("done");
    expect(done.results).toHaveLength(2);
    expect(done.credits).toBe(40);
    expect(done.startedAt).toBeDefined();
    expect(done.finishedAt).toBeDefined();
    expect(new JobStore(dir).get(job.id)).toEqual(done);
  });

  it("marks a failed job and continues with the next one", async () => {
    const ok = new FakeDriver();
    const failing = new FakeDriver({ fail: true });
    let n = 0;
    const driver: FlowDriver = Object.create(ok) as FlowDriver;
    driver.run = (job, p) => (n++ === 0 ? failing.run(job, p) : ok.run(job, p));
    const queue = new JobQueue(driver, new JobStore(dir));
    const a = queue.enqueue(req);
    const b = queue.enqueue(req);
    const failed = await queue.waitFor(a.id);
    expect(failed.status).toBe("failed");
    expect(failed.error?.code).toBe("fake_failure");
    expect(failed.error?.message).toBe("Internal error");
    expect((await queue.waitFor(b.id)).status).toBe("done");
  });

  it("reports unknown errors as internal", async () => {
    const driver: FlowDriver = Object.create(new FakeDriver()) as FlowDriver;
    driver.run = () => Promise.reject(new Error("boom"));
    const queue = new JobQueue(driver, new JobStore(dir));
    const job = await queue.waitFor(queue.enqueue(req).id);
    expect(job.error?.code).toBe("internal");
  });

  it("logs unknown errors and keeps the first line as detail", async () => {
    const driver: FlowDriver = Object.create(new FakeDriver()) as FlowDriver;
    driver.run = () => Promise.reject(new Error(`${"x".repeat(400)}\nsecond line`));
    const error = vi.fn();
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error };
    const queue = new JobQueue(driver, new JobStore(dir), logger);
    const job = await queue.waitFor(queue.enqueue(req).id);
    expect(job.error).toMatchObject({ code: "internal", message: "Internal error" });
    expect(job.error?.detail).toBe("x".repeat(300));
    expect(error).toHaveBeenCalledWith(
      "job failed",
      expect.objectContaining({ id: job.id, error: expect.stringContaining("second line") }),
    );
  });

  it("cancels a queued job but not a running one", async () => {
    const queue = new JobQueue(new FakeDriver({ delayMs: 30 }), new JobStore(dir));
    const first = queue.enqueue(req);
    const second = queue.enqueue(req);
    await new Promise((r) => setTimeout(r, 10));
    expect(() => queue.cancel(first.id)).toThrow(FlowPilotError);
    expect(queue.cancel(second.id).status).toBe("cancelled");
    expect((await queue.waitFor(second.id)).status).toBe("cancelled");
    expect((await queue.waitFor(first.id)).status).toBe("done");
    try {
      queue.cancel(first.id);
    } catch (e) {
      expect((e as FlowPilotError).code).toBe("job_not_cancellable");
    }
  });

  it("throws job_not_found for unknown ids", async () => {
    const queue = new JobQueue(new FakeDriver(), new JobStore(dir));
    expect(() => queue.cancel("nope")).toThrow(FlowPilotError);
    await expect(queue.waitFor("nope")).rejects.toBeInstanceOf(FlowPilotError);
  });

  it("waitFor resolves immediately for a terminal job", async () => {
    const queue = new JobQueue(new FakeDriver(), new JobStore(dir));
    const job = queue.enqueue(req);
    await queue.waitFor(job.id);
    expect((await queue.waitFor(job.id)).status).toBe("done");
  });

  it("emits a job event for every status change", async () => {
    const queue = new JobQueue(new FakeDriver(), new JobStore(dir));
    const statuses: string[] = [];
    queue.on("job", (j: Job) => statuses.push(j.status));
    await queue.waitFor(queue.enqueue(req).id);
    expect(statuses).toEqual(["queued", "running", "running", "downloading", "done"]);
  });

  it("after a restart resumes queued jobs and marks running ones interrupted", async () => {
    const store = new JobStore(dir);
    const running = store.create(req);
    const queued = store.create(req);
    store.update(running.id, { status: "running" });
    const queue = new JobQueue(new FakeDriver(), new JobStore(dir));
    expect(store.get(running.id)?.status).toBe("interrupted");
    expect((await queue.waitFor(queued.id)).status).toBe("done");
    expect(store.get(running.id)?.status).toBe("interrupted");
  });

  it("stop waits for the current job and leaves the rest queued", async () => {
    const queue = new JobQueue(new FakeDriver({ delayMs: 30 }), new JobStore(dir));
    const first = queue.enqueue(req);
    const second = queue.enqueue(req);
    await new Promise((r) => setTimeout(r, 10));
    await queue.stop();
    const store = new JobStore(dir);
    expect(store.get(first.id)?.status).toBe("done");
    expect(store.get(second.id)?.status).toBe("queued");
  });
});
