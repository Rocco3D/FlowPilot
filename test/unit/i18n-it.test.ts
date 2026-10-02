import { afterEach, describe, expect, it } from "vitest";
import { getLocale, setLocale, t } from "../../src/i18n/index.js";
import enCatalog from "../../src/i18n/en/index.js";
import itCatalog from "../../src/i18n/it/index.js";

afterEach(() => {
  setLocale(undefined);
  delete process.env.FLOWPILOT_LANG;
});

function extractPlaceholders(text: string): Set<string> {
  const matches = text.match(/\{(\w+)\}/g) || [];
  return new Set(matches.map((m) => m.slice(1, -1)));
}

describe("i18n Italian", () => {
  describe("keys matching", () => {
    it("has all English keys in Italian", () => {
      for (const [area, keys] of Object.entries(enCatalog)) {
        expect(itCatalog).toHaveProperty(area);
        const itArea = itCatalog[area as keyof typeof itCatalog];
        for (const key of Object.keys(keys)) {
          expect(itArea).toHaveProperty(key);
        }
      }
    });

    it("has no extra keys in Italian", () => {
      for (const [area, keys] of Object.entries(itCatalog)) {
        expect(enCatalog).toHaveProperty(area);
        const enArea = enCatalog[area as keyof typeof enCatalog];
        for (const key of Object.keys(keys)) {
          expect(enArea).toHaveProperty(key);
        }
      }
    });
  });

  describe("placeholders matching", () => {
    it("cli area has matching placeholders", () => {
      const enArea = enCatalog.cli;
      const itArea = itCatalog.cli;
      for (const [key, enText] of Object.entries(enArea)) {
        const itText = itArea[key as keyof typeof itArea];
        const enPlaceholders = extractPlaceholders(enText);
        const itPlaceholders = extractPlaceholders(itText);
        expect(itPlaceholders).toEqual(enPlaceholders);
      }
    });

    it("core area has matching placeholders", () => {
      const enArea = enCatalog.core;
      const itArea = itCatalog.core;
      for (const [key, enText] of Object.entries(enArea)) {
        const itText = itArea[key as keyof typeof itArea];
        const enPlaceholders = extractPlaceholders(enText);
        const itPlaceholders = extractPlaceholders(itText);
        expect(itPlaceholders).toEqual(enPlaceholders);
      }
    });

    it("flow area has matching placeholders", () => {
      const enArea = enCatalog.flow;
      const itArea = itCatalog.flow;
      for (const [key, enText] of Object.entries(enArea)) {
        const itText = itArea[key as keyof typeof itArea];
        const enPlaceholders = extractPlaceholders(enText);
        const itPlaceholders = extractPlaceholders(itText);
        expect(itPlaceholders).toEqual(enPlaceholders);
      }
    });

    it("server area has matching placeholders", () => {
      const enArea = enCatalog.server;
      const itArea = itCatalog.server;
      for (const [key, enText] of Object.entries(enArea)) {
        const itText = itArea[key as keyof typeof itArea];
        const enPlaceholders = extractPlaceholders(enText);
        const itPlaceholders = extractPlaceholders(itText);
        expect(itPlaceholders).toEqual(enPlaceholders);
      }
    });
  });

  describe("language resolution", () => {
    it("returns Italian text when FLOWPILOT_LANG is set to it", () => {
      process.env.FLOWPILOT_LANG = "it";
      expect(getLocale()).toBe("it");
      expect(t("cli.description")).toBe("Guida Google Flow attraverso il tuo Chrome già collegato");
    });

    it("returns Italian text when FLOWPILOT_LANG is set to it-IT", () => {
      process.env.FLOWPILOT_LANG = "it-IT";
      expect(getLocale()).toBe("it");
    });

    it("returns Italian text with setLocale", () => {
      setLocale("it");
      expect(getLocale()).toBe("it");
      expect(t("server.http.unauthorized")).toBe("Token API mancante o non valido");
    });
  });
});
