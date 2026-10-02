import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FlowPilotError } from "../../src/core/errors.js";
import { JobStore } from "../../src/core/jobs.js";

let dir: string;

beforeEach(() => {
  dir = path.resolve(
    import.meta.dirname,
    "../../temp/tests",
    `jobs-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  fs.mkdirSync(dir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("JobStore", () => {
  it("creates a queued job with defaults and persists it", () => {
    const store = new JobStore(path.join(dir, "lazy"));
    const job = store.create({ type: "image", prompt: "a cat", outputs: 1 });
    expect(job.status).toBe("queued");
    expect(job.results).toEqual([]);
    expect(job.request.outputs).toBe(1);
    expect(job.id).toMatch(/^\d{8}-\d{9}-[0-9a-f]{4}$/);
    expect(Number.isNaN(Date.parse(job.createdAt))).toBe(false);
    expect(fs.existsSync(path.join(dir, "lazy", `${job.id}.json`))).toBe(true);
    expect(store.get(job.id)).toEqual(job);
  });

  it("applies schema defaults and rejects invalid requests", () => {
    const store = new JobStore(dir);
    const job = store.create({ type: "video", prompt: "x" } as never);
    expect(job.request.outputs).toBe(1);
    expect(() => store.create({ type: "video", prompt: "" } as never)).toThrow();
  });

  it("returns undefined for an unknown id", () => {
    expect(new JobStore(dir).get("nope")).toBeUndefined();
  });

  it("lists newest first", () => {
    const store = new JobStore(dir);
    const ids = [1, 2, 3].map(
      (i) => store.create({ type: "image", prompt: `p${i}`, outputs: 1 }).id,
    );
    expect(store.list().map((j) => j.id)).toEqual(ids.reverse());
  });

  it("lists nothing when the folder does not exist", () => {
    expect(new JobStore(path.join(dir, "missing")).list()).toEqual([]);
  });

  it("updates and persists a job", () => {
    const store = new JobStore(dir);
    const job = store.create({ type: "image", prompt: "a", outputs: 1 });
    const updated = store.update(job.id, { status: "running", startedAt: "2026-01-01T00:00:00Z" });
    expect(updated.status).toBe("running");
    expect(updated.request).toEqual(job.request);
    expect(store.get(job.id)).toEqual(updated);
  });

  it("throws job_not_found when updating an unknown id", () => {
    const store = new JobStore(dir);
    expect(() => store.update("nope", { status: "done" })).toThrow(FlowPilotError);
    try {
      store.update("nope", { status: "done" });
    } catch (e) {
      expect((e as FlowPilotError).code).toBe("job_not_found");
    }
  });

  it("marks running and downloading jobs as interrupted", () => {
    const store = new JobStore(dir);
    const a = store.create({ type: "image", prompt: "a", outputs: 1 });
    const b = store.create({ type: "image", prompt: "b", outputs: 1 });
    const c = store.create({ type: "image", prompt: "c", outputs: 1 });
    store.update(a.id, { status: "running" });
    store.update(b.id, { status: "downloading" });
    expect(store.recoverInterrupted().sort()).toEqual([a.id, b.id].sort());
    expect(store.get(a.id)?.status).toBe("interrupted");
    expect(store.get(a.id)?.finishedAt).toBeDefined();
    expect(store.get(b.id)?.status).toBe("interrupted");
    expect(store.get(c.id)?.status).toBe("queued");
  });

  it("skips corrupt job files", () => {
    const store = new JobStore(dir);
    const job = store.create({ type: "image", prompt: "a", outputs: 1 });
    fs.writeFileSync(path.join(dir, "broken.json"), "{ not json");
    expect(store.list().map((j) => j.id)).toEqual([job.id]);
    expect(store.recoverInterrupted()).toEqual([]);
  });
});
