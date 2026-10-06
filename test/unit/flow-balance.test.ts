import { describe, expect, it } from "vitest";
import { parseBalance } from "../../src/flow/balance.js";

describe("parseBalance", () => {
  it("reads the account panel line", () => {
    expect(parseBalance("movie_filter_auto640 Google Flow credits")).toBe(640);
  });

  it("reads balances with a thousands separator", () => {
    expect(parseBalance("12,500 Google Flow credits")).toBe(12500);
  });

  it("returns undefined when the line has no balance", () => {
    expect(parseBalance("Upgrade")).toBeUndefined();
  });
});
