import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  assertSaved,
  chooseTier,
  extensionFor,
  mediaBaseName,
  resultBaseName,
  tierPatterns,
  writeSummary,
} from "../../src/flow/download.js";
import { splitPrompt } from "../../src/flow/prompt.js";
import {
  classifyChunks,
  classifyFailure,
  classifyResultImg,
  resultId,
} from "../../src/flow/results.js";
import { diffSettings, optionNotAvailable } from "../../src/flow/settings-apply.js";
import { setLocale } from "../../src/i18n/index.js";

describe("classifyResultImg", () => {
  const thumb = "https://flow-content.google/image/0a1b2c3d-1111-2222-3333-444455556666?x=1";
  const asb = "https://flow.google.com/asb/ANqvAbC123";
  const img = (src: string, over: Partial<Parameters<typeof classifyResultImg>[0]> = {}) => ({
    src,
    mediaId: null,
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

describe("resultId", () => {
  const signed =
    "https://flow-content.google/image/37811907-d238-4928-9824-b1eed5de5a62?Expires=1792114851&KeyName=media&Signature=4WUvEuAi";
  const asb = "https://flow.google.com/asb/ANqvLObVq_m7_NDhAbDwsGcmraBSIidkRh=s1600-rw";
  const mediaId = "37811907-d238-4928-9824-b1eed5de5a62";

  it("prefers the media id attribute over the src", () => {
    expect(resultId("stable-id", signed)).toBe("stable-id");
    expect(resultId("stable-id", asb)).toBe("stable-id");
  });

  it("gives the same id to the same result served from a different url", () => {
    expect(resultId(mediaId, signed)).toBe(resultId(mediaId, asb));
    expect(resultId(mediaId, asb)).toBe(mediaId);
  });

  it("falls back to the id in the url when the attribute is missing", () => {
    const legacy = "https://labs.google/fx/api/trpc/media.getMediaUrlRedirect?name=abc-123";
    expect(resultId(null, signed)).toBe(mediaId);
    expect(resultId(null, legacy)).toBe("abc-123");
  });

  it("ignores a blank attribute", () => {
    expect(resultId("", signed)).toBe(mediaId);
    expect(resultId("   ", asb)).toBe(resultId(null, asb));
  });

  it("falls back to a stable hash only as a last resort", () => {
    expect(resultId(null, asb)).toBe(resultId(null, asb));
    expect(resultId(null, asb)).not.toBe(resultId(null, `${asb}4`));
  });

  it("keeps two different results with the same src apart", () => {
    expect(resultId("a", asb)).not.toBe(resultId("b", asb));
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

  it("tries only the quality asked for, else 4K, then the upscale, then the original", () => {
    const tried = (upscale: Parameters<typeof tierPatterns>[0], label: string) =>
      tierPatterns(upscale).map((re) => re.test(label));
    expect(tried("original", "720p Original size")).toEqual([true]);
    expect(tried("4k", "4K Upscaled")).toEqual([true]);
    expect(tried(undefined, "4K Upscaled")).toEqual([true, false, false]);
    expect(tried(undefined, "1080p Upscaled")).toEqual([false, true, false]);
    expect(tried(undefined, "2K Upscaled")).toEqual([false, true, false]);
    expect(tried(undefined, "1K Original size")).toEqual([false, false, true]);
  });

  it("chooses the tier item and rejects gated or disabled ones", () => {
    const items = ["270p Animated GIF", "720p Original size", "1080p Upscaled", "4K Upscaled"].map(
      (label) => ({ label, disabled: false }),
    );
    const open = (label: string) => [{ label, disabled: false }];
    expect(chooseTier(items, tierPatterns("original"))).toEqual({ kind: "pick", index: 1 });
    expect(chooseTier(items, tierPatterns(undefined))).toEqual({ kind: "pick", index: 3 });
    expect(chooseTier(items, tierPatterns("4k"))).toEqual({ kind: "pick", index: 3 });
    expect(chooseTier(open("4K Upgrade"), tierPatterns("4k"))).toEqual({ kind: "locked" });
    expect(chooseTier([{ label: "4K Upscaled", disabled: true }], tierPatterns("4k"))).toEqual({
      kind: "locked",
    });
    expect(chooseTier(open("720p Original size"), tierPatterns("4k"))).toEqual({ kind: "none" });
  });

  it("downloads the best the user's plan offers when no quality is asked for", () => {
    const menu = (upscale: Partial<{ label: string; disabled: boolean }> | undefined) => [
      { label: "1K Original size", disabled: false },
      ...(upscale ? [{ label: "2K Upscaled", disabled: false, ...upscale }] : []),
      { label: "4K Upscaled", disabled: true },
    ];
    // 4K when the plan offers it.
    const with4k = menu({}).map((item) => ({ ...item, disabled: false }));
    expect(chooseTier(with4k, tierPatterns(undefined))).toEqual({ kind: "pick", index: 2 });
    // The upscale when 4K is disabled.
    expect(chooseTier(menu({}), tierPatterns(undefined))).toEqual({ kind: "pick", index: 1 });
    // The original when the upscale is disabled, asks for an upgrade, or is not there at all.
    expect(chooseTier(menu({ disabled: true }), tierPatterns(undefined))).toEqual({
      kind: "pick",
      index: 0,
    });
    expect(chooseTier(menu({ label: "2K Upgrade" }), tierPatterns(undefined))).toEqual({
      kind: "pick",
      index: 0,
    });
    expect(chooseTier(menu(undefined), tierPatterns(undefined))).toEqual({
      kind: "pick",
      index: 0,
    });
    // A quality asked for that the plan does not offer is refused, never replaced.
    expect(chooseTier(menu({ disabled: true }), tierPatterns("1080p"))).toEqual({ kind: "locked" });
  });

  it("names a downloaded media after its project and id, without characters Windows refuses", () => {
    expect(mediaBaseName("ott 20 - 22:04", "ab5e")).toBe("ott 20 - 22-04-media-ab5e");
    expect(mediaBaseName('a\\b/c*d?e"f<g>h|i', "x")).toBe("a-b-c-d-e-f-g-h-i-media-x");
  });

  it("accepts a downloaded file only when it is on disk and not empty", () => {
    const dir = path.join(process.cwd(), "temp", "tests", `saved-${process.pid}-${Date.now()}`);
    fs.mkdirSync(dir, { recursive: true });
    const full = path.join(dir, "full.png");
    const empty = path.join(dir, "empty.png");
    fs.writeFileSync(full, "x");
    fs.writeFileSync(empty, "");
    expect(assertSaved(full)).toBe(full);
    for (const file of [empty, path.join(dir, "missing.png")]) {
      expect(() => assertSaved(file)).toThrowError(
        expect.objectContaining({ code: "download_failed" }),
      );
    }
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
