import { describe, expect, it } from "vitest";
import { pickReplacement } from "../../src/flow/settings-apply.js";

const IMAGE_MODELS = ["Nano Banana", "Nano Banana 2.1", "Nano Banana Pro", "Imagen"];
const VIDEO_MODELS = ["Veo", "Veo 3.1", "Veo 3.1 Fast"];

describe("pickReplacement", () => {
  it("takes the next version of the same family", () => {
    expect(pickReplacement("Nano Banana 2", IMAGE_MODELS)).toBe("Nano Banana 2.1");
    expect(pickReplacement("Veo 3", VIDEO_MODELS)).toBe("Veo 3.1");
  });

  it("matches the name case-insensitively and ignores spacing", () => {
    expect(pickReplacement("  veo 3 ", VIDEO_MODELS)).toBe("Veo 3.1");
  });

  it("picks the smallest version above the wanted one", () => {
    const offered = ["Nano Banana 2.1", "Nano Banana 2.3", "Nano Banana 3"];
    expect(pickReplacement("Nano Banana 2", offered)).toBe("Nano Banana 2.1");
    expect(pickReplacement("Nano Banana 2.2", offered)).toBe("Nano Banana 2.3");
  });

  it("refuses a different family, even with a higher version", () => {
    expect(pickReplacement("Nano Banana 2", ["Imagen 3", "Imagen 4"])).toBeUndefined();
    expect(pickReplacement("Nano Banana 2", ["Nano Banana", "Nano Banana Pro"])).toBeUndefined();
  });

  it("refuses an older or equal version", () => {
    expect(pickReplacement("Nano Banana 2.1", IMAGE_MODELS)).toBeUndefined();
    expect(pickReplacement("Veo 3.1 Fast", VIDEO_MODELS)).toBeUndefined();
  });

  it("refuses a name without a version, since there is nothing to step up from", () => {
    expect(pickReplacement("Nano Banana", IMAGE_MODELS)).toBeUndefined();
    expect(pickReplacement("Imagen", IMAGE_MODELS)).toBeUndefined();
  });

  it("finds nothing when nothing is offered", () => {
    expect(pickReplacement("Nano Banana 2", [])).toBeUndefined();
  });
});
