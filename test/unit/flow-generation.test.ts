import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  extensionFor,
  resultBaseName,
  tierPattern,
  writeSummary,
} from "../../src/flow/download.js";
import { splitPrompt } from "../../src/flow/prompt.js";
import { classifyChunks, classifyFailure, classifyResultSrc } from "../../src/flow/results.js";
import { diffSettings } from "../../src/flow/settings-apply.js";

describe("classifyResultSrc", () => {
  const thumb = "https://flow-content.google/image/0a1b2c3d-1111-2222-3333-444455556666?x=1";

  it("treats a thumbnail in a video tile as a video", () => {
    expect(classifyResultSrc(thumb, true)).toBe("video");
  });

  it("treats a Flow image outside a tile as an image", () => {
    expect(classifyResultSrc(thumb, false)).toBe("image");
  });

  it("accepts legacy redirect images but not their thumbnails", () => {
    const legacy = "https://labs.google/fx/api/trpc/media.getMediaUrlRedirect?name=abc-123";
    expect(classifyResultSrc(legacy, false)).toBe("image");
    expect(classifyResultSrc(`${legacy}&mediaUrlType=THUMBNAIL`, false)).toBeUndefined();
  });

  it("ignores unrelated images", () => {
    expect(classifyResultSrc("https://example.com/a.png", false)).toBeUndefined();
    expect(classifyResultSrc("https://example.com/a.png", true)).toBeUndefined();
  });
});

describe("classifyFailure", () => {
  it.each([
    ["We noticed unusual activity", "rate_limited"],
    ["You have run out of credits", "credits_exhausted"],
    ["This prompt violates our policy", "generation_blocked"],
    ["Sorry, I can't help with that", "generation_blocked"],
    ["Generation failed. Try again", "generation_failed"],
    ["Something went wrong", "generation_failed"],
  ])("%s -> %s", (text, code) => {
    expect(classifyFailure(text)?.code).toBe(code);
  });

  it("returns nothing for normal text", () => {
    expect(classifyFailure("Your project is ready")).toBeUndefined();
  });
});

describe("file naming", () => {
  it("names results <jobId>-<n>", () => {
    expect(resultBaseName("job1", 2)).toBe("job1-2");
  });

  it("picks the extension from the content type", () => {
    expect(extensionFor("image", "image/jpeg")).toBe(".jpg");
    expect(extensionFor("video", "video/mp4")).toBe(".mp4");
    expect(extensionFor("video", undefined)).toBe(".mp4");
    expect(extensionFor("image", undefined)).toBe(".png");
  });

  it("maps upscale to a tier pattern", () => {
    expect(tierPattern(undefined).test("720p Original size")).toBe(true);
    expect(tierPattern("1080p").test("1080p Upscaled")).toBe(true);
    expect(tierPattern("4k").test("4K Upscaled")).toBe(true);
  });

  it("writes the summary next to the result", () => {
    const dir = path.join(process.cwd(), "temp", "tests", `gen-${process.pid}-${Date.now()}`);
    fs.mkdirSync(dir, { recursive: true });
    writeSummary(path.join(dir, "job1-1.png"), {
      jobId: "job1",
      request: { type: "image", prompt: "p", outputs: 1 },
      model: "Nano Banana 2",
      cost: 0,
      flowUrl: "https://flow.google.com/project/x",
    });
    const json = JSON.parse(fs.readFileSync(path.join(dir, "job1-1.json"), "utf8")) as {
      jobId: string;
      downloadedAt: string;
    };
    expect(json.jobId).toBe("job1");
    expect(json.downloadedAt).toBeTruthy();
  });
});

describe("diffSettings", () => {
  const wanted = { mode: "image", model: "Nano Banana 2", ratio: "1:1", outputs: 1 } as const;

  it("is empty when everything matches", () => {
    expect(
      diffSettings(wanted, { mode: "image", model: "nano banana 2", ratio: "1:1", outputs: 1 }),
    ).toEqual([]);
  });

  it("reports each mismatch", () => {
    const diffs = diffSettings(wanted, { mode: "video", ratio: "16:9", outputs: 1, model: "X" });
    expect(diffs).toHaveLength(3);
  });

  it("checks resolution and duration only when requested", () => {
    const video = { mode: "video", outputs: 1, resolution: "720p", durationSec: 8 } as const;
    expect(diffSettings({ mode: "video", outputs: 1 }, video)).toEqual([]);
    expect(diffSettings({ ...video, durationSec: 4 }, video)).toHaveLength(1);
  });
});

describe("splitPrompt", () => {
  it("splits on LF and CRLF", () => {
    expect(splitPrompt("a\nb\r\nc")).toEqual(["a", "b", "c"]);
  });

  it("keeps a single line whole", () => {
    expect(splitPrompt("one line")).toEqual(["one line"]);
  });
});

describe("classifyChunks", () => {
  const chunk = (text: string, excluded = false, alert = false) => ({ text, excluded, alert });

  it("ignores prompt text that looks like a failure", () => {
    expect(classifyChunks([chunk("something went wrong", true), chunk("Ready")])).toBeUndefined();
  });

  it("detects a failure in normal text", () => {
    expect(classifyChunks([chunk("Something went wrong")])?.code).toBe("generation_failed");
  });

  it("prefers alert containers over other text", () => {
    const found = classifyChunks([chunk("Generation failed"), chunk("Rate limit", false, true)]);
    expect(found?.code).toBe("rate_limited");
  });
});
