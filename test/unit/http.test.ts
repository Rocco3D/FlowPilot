import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readServiceInfo, startService, type RunningService } from "../../src/core/service.js";
import type { Job, JobResult } from "../../src/core/schemas.js";
import { FakeDriver } from "../fakes/fake-driver.js";

/** Like the fake driver, but writes a real file for each result. */
class FileDriver extends FakeDriver {
  override run(job: Job): Promise<{ results: JobResult[]; credits: number }> {
    fs.mkdirSync(job.request.outDir!, { recursive: true });
    const file = path.join(job.request.outDir!, `${job.id}.png`);
    fs.writeFileSync(file, "png-bytes");
    return Promise.resolve({ results: [{ path: file, type: "image" }], credits: 0 });
  }
}

let dir: string;
let service: RunningService;
let token: string;
const imageJob = { type: "image", prompt: "a cat" };

beforeEach(async () => {
  dir = path.resolve(
    import.meta.dirname,
    "../../temp/tests",
    `http-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const configDir = path.join(dir, "config");
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(
    path.join(configDir, "config.json"),
    JSON.stringify({ outputDir: path.join(dir, "out") }),
  );
  service = await startService({
    driver: new FileDriver(),
    configDir,
    dataDir: path.join(dir, "data"),
    port: 0,
  });
  token = fs.readFileSync(path.join(configDir, "token"), "utf8");
});

afterEach(async () => {
  await service.stop();
  fs.rmSync(dir, { recursive: true, force: true });
});

function call(method: string, route: string, body?: unknown, auth: string | null = token) {
  return fetch(service.url + route, {
    method,
    headers: auth === null ? {} : { authorization: `Bearer ${auth}` },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function createDone(): Promise<Job> {
  const created = (await (await call("POST", "/jobs", imageJob)).json()) as Job;
  for (let i = 0; i < 100; i++) {
    const job = (await (await call("GET", `/jobs/${created.id}`)).json()) as Job;
    if (job.status === "done") return job;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("job did not finish");
}

describe("auth", () => {
  it("serves health without a token", async () => {
    const res = await call("GET", "/health", undefined, null);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(await res.json()).toMatchObject({ ok: true, version: expect.any(String) });
  });

  it("rejects a missing or wrong token", async () => {
    for (const auth of [null, "wrong"]) {
      const res = await call("GET", "/jobs", undefined, auth);
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ error: { code: "unauthorized" } });
    }
  });

  it("creates the token file with 64 hex chars", () => {
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("jobs", () => {
  it("creates a job, runs it and lists it", async () => {
    const res = await call("POST", "/jobs", imageJob);
    expect(res.status).toBe(201);
    const created = (await res.json()) as Job;
    expect(created.request.outputs).toBe(1);
    expect(created.request.outDir).toBe(path.join(dir, "out"));
    const done = await createDone();
    expect(done.results).toHaveLength(1);
    const list = (await (await call("GET", "/jobs")).json()) as Job[];
    expect(list.map((j) => j.id)).toContain(created.id);
    expect(list[0]!.id >= list[list.length - 1]!.id).toBe(true);
  });

  it("returns 409 when cancelling a finished job", async () => {
    const done = await createDone();
    const res = await call("DELETE", `/jobs/${done.id}`);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: "job_not_cancellable" } });
  });

  it("returns 400 on validation errors and bad JSON", async () => {
    for (const body of [{ type: "image" }, "{nope"]) {
      const res = await call("POST", "/jobs", body);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: { code: "bad_request" } });
    }
  });

  it("returns 413 for oversized bodies", async () => {
    const big = JSON.stringify({ ...imageJob, prompt: "x".repeat(2e6) });
    expect((await call("POST", "/jobs", big)).status).toBe(413);
  });

  it("returns 404 for unknown routes and jobs", async () => {
    const route = await call("GET", "/nope");
    expect(route.status).toBe(404);
    expect(await route.json()).toMatchObject({ error: { code: "not_found" } });
    const job = await call("GET", "/jobs/missing");
    expect(job.status).toBe(404);
    expect(await job.json()).toMatchObject({ error: { code: "job_not_found" } });
  });

  it("downloads a result file", async () => {
    const done = await createDone();
    const res = await call("GET", `/jobs/${done.id}/files/0`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(await res.text()).toBe("png-bytes");
    expect((await call("GET", `/jobs/${done.id}/files/5`)).status).toBe(404);
    fs.rmSync(done.results[0]!.path);
    expect((await call("GET", `/jobs/${done.id}/files/0`)).status).toBe(404);
  });
});

describe("driver routes", () => {
  it("answers doctor, selftest and models", async () => {
    expect(await (await call("POST", "/doctor")).json()).toMatchObject({ signedIn: true });
    expect(await (await call("POST", "/selftest")).json()).toMatchObject({ ok: true });
    expect(await (await call("GET", "/models")).json()).toHaveLength(2);
  });
});

describe("credits and config", () => {
  it("reports credits", async () => {
    expect(await (await call("GET", "/credits")).json()).toEqual({
      monthTotal: 0,
      maxCreditsPerJob: 20,
      monthlyCreditLimit: 1000,
      remaining: 1000,
    });
  });

  it("gets and updates config", async () => {
    const put = await call("PUT", "/config/maxCreditsPerJob", { value: "5" });
    expect(put.status).toBe(200);
    expect(await put.json()).toMatchObject({ maxCreditsPerJob: 5 });
    expect(await (await call("GET", "/config")).json()).toMatchObject({ maxCreditsPerJob: 5 });
    expect((await call("PUT", "/config/bogus", { value: "1" })).status).toBe(400);
    expect((await call("PUT", "/config/outputs", {})).status).toBe(400);
  });
});

describe("shutdown", () => {
  it("answers, then removes service.json", async () => {
    const dataDir = path.join(dir, "data");
    expect(readServiceInfo(dataDir)).toBeDefined();
    const res = await call("POST", "/shutdown");
    expect(await res.json()).toEqual({ ok: true });
    for (let i = 0; i < 100 && readServiceInfo(dataDir); i++) {
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(readServiceInfo(dataDir)).toBeUndefined();
  });
});
