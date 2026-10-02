import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureToken, isAuthorized } from "../../src/server/auth.js";

let dir: string;

beforeEach(() => {
  dir = path.resolve(
    import.meta.dirname,
    "../../temp/tests",
    `auth-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("ensureToken", () => {
  it("creates a 64 hex char token and reuses it", () => {
    const token = ensureToken(dir);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(fs.readFileSync(path.join(dir, "token"), "utf8")).toBe(token);
    expect(ensureToken(dir)).toBe(token);
  });
});

describe("isAuthorized", () => {
  it("accepts only the exact bearer token", () => {
    expect(isAuthorized("Bearer abc", "abc")).toBe(true);
    expect(isAuthorized("Bearer abd", "abc")).toBe(false);
    expect(isAuthorized("Bearer abcd", "abc")).toBe(false);
    expect(isAuthorized("abc", "abc")).toBe(false);
    expect(isAuthorized(undefined, "abc")).toBe(false);
  });
});
