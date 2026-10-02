import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  assertFetchAllowed,
  chooseTier,
  extensionFor,
  resultBaseName,
  tierPattern,
  writeSummary,
} from "../../src/flow/download.js";
import { splitPrompt } from "../../src/flow/prompt.js";
import {
  classifyChunks,
  classifyFailure,
  classifyResultImg,
  idFromSrc,
} from "../../src/flow/results.js";
import { diffSettings, optionNotAvailable } from "../../src/flow/settings-apply.js";
import { setLocale } from "../../src/i18n/index.js";

describe("classifyResultImg", () => {
  const thumb = "https://flow-content.google/image/0a1b2c3d-1111-2222-3333-444455556666?x=1";
  const asb = "https://flow.google.com/asb/ANqvAbC123";
  const img = (src: string, over: Partial<Parameters<typeof classifyResultImg>[0]> = {}) => ({
    src,
    inVideoTile: false,
    inPromptBox: false,
    thumbnail: false,
    width: 300,
    tileIndex: -1,
    ...over,
  });

  it("treats a thumbnail in a video tile as a video, whatever its host", () => {
    expect(classifyResultImg(img(thumb, { inVideoTile: true }))).toBe("video");
    expect(classifyResultImg(img(asb, { inVideoTile: true, thumbnail: true }))).toBe("video");
    expect(classifyResultImg(img(asb, { inVideoTile: true }))).toBeUndefined();
  });

  it("treats a large Flow image outside a tile as an image (both URL styles)", () => {
    expect(classifyResultImg(img(thumb))).toBe("image");
    expect(classifyResultImg(img(asb))).toBe("image");
  });

  it("ignores small images and images in the prompt box", () => {
    expect(classifyResultImg(img(asb, { width: 40 }))).toBeUndefined();
    expect(classifyResultImg(img(thumb, { inPromptBox: true }))).toBeUndefined();
  });

  it("accepts legacy redirect images but not their thumbnails", () => {
    const legacy = "https://labs.google/fx/api/trpc/media.getMediaUrlRedirect?name=abc-123";
    expect(classifyResultImg(img(legacy))).toBe("image");
    expect(classifyResultImg(img(`${legacy}&mediaUrlType=THUMBNAIL`))).toBeUndefined();
  });

  it("ignores unrelated hosts", () => {
    expect(classifyResultImg(img("https://example.com/a.png"))).toBeUndefined();
  });
});

describe("idFromSrc", () => {
  it("uses the media id when the URL has one", () => {
    expect(idFromSrc("https://flow-content.google/image/0a1b-22?x=1")).toBe("0a1b-22");
  });

  it("falls back to a stable hash", () => {
    const src = "https://flow.google.com/asb/ANqvAbC123";
    expect(idFromSrc(src)).toBe(idFromSrc(src));
    expect(idFromSrc(src)).not.toBe(idFromSrc(`${src}4`));
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

  it("chooses the tier item and rejects gated ones", () => {
    const labels = ["270p Animated GIF", "720p Original size", "1080p Upscaled", "4K Upscaled"];
    expect(chooseTier(labels, tierPattern(undefined))).toEqual({ kind: "pick", index: 1 });
    expect(chooseTier(labels, tierPattern("1080p"))).toEqual({ kind: "pick", index: 2 });
    expect(chooseTier(labels, tierPattern("4k"))).toEqual({ kind: "pick", index: 3 });
    expect(chooseTier(["2K Upscaled"], tierPattern("1080p"))).toEqual({ kind: "pick", index: 0 });
    expect(chooseTier(["4K Upgrade"], tierPattern("4k"))).toEqual({ kind: "locked" });
    expect(chooseTier(["720p Original size"], tierPattern("4k"))).toEqual({ kind: "none" });
  });

  it("allows the direct fetch only for the original quality", () => {
    expect(() => assertFetchAllowed(undefined, "https://flow/p")).not.toThrow();
    expect(() => assertFetchAllowed("1080p", "https://flow/p")).toThrowError(
      expect.objectContaining({ code: "upscale_unavailable" }),
    );
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

describe("optionNotAvailable", () => {
  beforeEach(() => setLocale("en"));

  it("lists the requested and the offered values", () => {
    const err = optionNotAvailable("resolution", "360p", ["720p", "1080p"]);
    expect(err.code).toBe("option_not_available");
    expect(err.message).toContain("resolution 360p");
    expect(err.message).toContain("720p, 1080p");
  });

  it("says so when nothing is offered", () => {
    expect(optionNotAvailable("resolution", "360p", []).message).toContain("Available: none");
  });
});
