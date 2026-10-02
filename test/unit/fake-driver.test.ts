import { describe, expect, it } from "vitest";
import { JobRequest, type Job } from "../../src/core/schemas.js";
import { FakeDriver } from "../fakes/fake-driver.js";

const job: Job = {
  id: "j1",
  request: JobRequest.parse({ type: "video", prompt: "a cat", outputs: 2 }),
  status: "queued",
  createdAt: new Date(0).toISOString(),
  results: [],
};

describe("FakeDriver", () => {
  it("returns results and credits", async () => {
    const out = await new FakeDriver().run(job);
    expect(out.results).toHaveLength(2);
    expect(out.credits).toBe(40);
  });

  it("throws in failure mode", async () => {
    await expect(new FakeDriver({ fail: true }).run(job)).rejects.toThrow();
  });
});
