import { describe, expect, it } from "vitest";
import { JobRequest } from "../../src/core/schemas.js";

describe("JobRequest", () => {
  it("parses a valid request and defaults outputs to 1", () => {
    const parsed = JobRequest.parse({ type: "image", prompt: "a cat" });
    expect(parsed.outputs).toBe(1);
  });

  it("rejects outputs above 4", () => {
    const result = JobRequest.safeParse({ type: "image", prompt: "a cat", outputs: 5 });
    expect(result.success).toBe(false);
  });

  it("rejects an empty prompt", () => {
    expect(JobRequest.safeParse({ type: "video", prompt: "" }).success).toBe(false);
  });
});
