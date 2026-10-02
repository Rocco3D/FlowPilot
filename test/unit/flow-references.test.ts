import { beforeAll, describe, expect, it } from "vitest";
import { setLocale } from "../../src/i18n/index.js";
import {
  assertFilesExist,
  expectedNewReferences,
  planReferences,
} from "../../src/flow/references.js";

const video = { type: "video" as const };

beforeAll(() => setLocale("en"));

describe("planReferences", () => {
  it("is empty without references", () => {
    expect(planReferences(video)).toEqual({ frames: [], ingredients: [], characters: [] });
  });

  it("uses Frames mode for start and end frames, start first", () => {
    const plan = planReferences({ ...video, endFrame: "e.png", startFrame: "s.png" });
    expect(plan.frames).toEqual([
      { slot: "Start", file: "s.png" },
      { slot: "End", file: "e.png" },
    ]);
  });

  it("keeps ingredients and characters", () => {
    const plan = planReferences({ type: "image", ingredients: ["a.png"], characters: ["Mia"] });
    expect(plan.ingredients).toEqual(["a.png"]);
    expect(plan.characters).toEqual(["Mia"]);
  });

  it("rejects frames for images", () => {
    expect(() => planReferences({ type: "image", startFrame: "s.png" })).toThrow(/only available/);
  });

  it("rejects frames mixed with ingredients or characters", () => {
    expect(() => planReferences({ ...video, startFrame: "s.png", ingredients: ["a"] })).toThrow(
      /cannot be combined/,
    );
    expect(() => planReferences({ ...video, endFrame: "e.png", characters: ["Mia"] })).toThrow(
      /cannot be combined/,
    );
  });
});

describe("expectedNewReferences", () => {
  it("counts every upload and character, minus skipped slots", () => {
    const frames = planReferences({ ...video, startFrame: "s.png", endFrame: "e.png" });
    expect(expectedNewReferences(frames)).toBe(2);
    expect(expectedNewReferences(frames, ["Start"])).toBe(1);
    const mixed = planReferences({ type: "image", ingredients: ["a", "b"], characters: ["Mia"] });
    expect(expectedNewReferences(mixed)).toBe(3);
  });
});

describe("assertFilesExist", () => {
  it("reports the first missing path with its code", () => {
    const plan = planReferences({ ...video, startFrame: "ok.png", endFrame: "missing.png" });
    try {
      assertFilesExist(plan, (f) => f === "ok.png");
      expect.unreachable();
    } catch (error) {
      expect((error as { code: string }).code).toBe("input_file_not_found");
      expect((error as Error).message).toContain("missing.png");
    }
  });

  it("accepts existing files", () => {
    const plan = planReferences({ ...video, startFrame: "a" });
    expect(() => assertFilesExist(plan, () => true)).not.toThrow();
  });
});
