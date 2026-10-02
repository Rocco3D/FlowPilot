import { describe, expect, it } from "vitest";
import { projectIdFromHref } from "../../src/flow/navigation.js";
import { CREDITS_RE, RATIO_ICON } from "../../src/flow/selectors.js";
import {
  parseCredits,
  parseModelItem,
  parseSettingsTrigger,
} from "../../src/flow/settings-read.js";

describe("parseSettingsTrigger", () => {
  it("reads a video trigger", () => {
    expect(parseSettingsTrigger("Video · 720p · 8s crop_16_9 x1")).toEqual({
      mode: "video",
      resolution: "720p",
      durationSec: 8,
      ratio: "16:9",
      outputs: 1,
    });
  });

  it("reads an image trigger with its model", () => {
    expect(parseSettingsTrigger("🍌 Nano Banana 2 crop_16_9 x2")).toEqual({
      mode: "image",
      model: "Nano Banana 2",
      ratio: "16:9",
      outputs: 2,
    });
  });

  it("reads a 9:16 video with four outputs", () => {
    expect(parseSettingsTrigger("Video · 360p · 4s crop_9_16 x4")).toEqual({
      mode: "video",
      resolution: "360p",
      durationSec: 4,
      ratio: "9:16",
      outputs: 4,
    });
  });
});

describe("parseCredits", () => {
  it("reads the credit count", () => {
    expect(parseCredits("Generating will use 20 credits")).toBe(20);
    expect(parseCredits("Generating will use 0 credits")).toBe(0);
    expect(parseCredits("use 1 credit")).toBe(1);
  });

  it("returns undefined when the line is missing", () => {
    expect(parseCredits("Nothing here")).toBeUndefined();
    expect(CREDITS_RE.test("")).toBe(false);
  });
});

describe("parseModelItem", () => {
  it("detects the audio icon", () => {
    expect(parseModelItem("volume_up Veo 3.1 - Fast")).toEqual({
      name: "Veo 3.1 - Fast",
      audio: true,
    });
  });

  it("strips icon text glued to the name", () => {
    expect(parseModelItem("volume_upVeo 3.1 - Lite")).toEqual({
      name: "Veo 3.1 - Lite",
      audio: true,
    });
    expect(parseModelItem("volume_offOmni 1.1 Flash")).toEqual({
      name: "Omni 1.1 Flash",
      audio: false,
    });
  });

  it("strips the emoji of image models", () => {
    expect(parseModelItem("🍌 Nano Banana 2 arrow_drop_down")).toEqual({
      name: "Nano Banana 2",
      audio: false,
    });
  });
});

describe("ratio icons", () => {
  it("maps every ratio to a distinct icon", () => {
    expect(RATIO_ICON["4:3"]).toBe("crop_landscape");
    expect(RATIO_ICON["3:4"]).toBe("crop_portrait");
    expect(new Set(Object.values(RATIO_ICON)).size).toBe(Object.keys(RATIO_ICON).length);
  });
});

describe("projectIdFromHref", () => {
  const base = "https://flow.google.com/?hl=en";
  const id = "0b6f2c1e-1111-4222-8333-444455556666";

  it("resolves root-relative hrefs", () => {
    expect(projectIdFromHref(`/project/${id}`, base)).toBe(id);
  });

  it("ignores the viewer suffix and unrelated links", () => {
    expect(projectIdFromHref(`/project/${id}/edit/abc`, base)).toBe(id);
    expect(projectIdFromHref("/about", base)).toBeUndefined();
  });
});
