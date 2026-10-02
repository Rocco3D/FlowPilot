import en from "./en/index.js";

type Catalog = Record<string, Record<string, string>>;

// To add a language: create src/i18n/<code>/index.ts and register it here.
const catalogs: Record<string, Catalog> = { en };

const FALLBACK = "en";
let override: string | undefined;

function normalize(value: string | undefined): string | undefined {
  const lang = value?.toLowerCase().split(/[-_.]/)[0];
  return lang && lang in catalogs ? lang : undefined;
}

/** Forces a locale; pass undefined to go back to automatic resolution. */
export function setLocale(locale: string | undefined): void {
  override = locale;
}

export function getLocale(): string {
  return (
    normalize(override) ??
    normalize(process.env.FLOWPILOT_LANG) ??
    normalize(Intl.DateTimeFormat().resolvedOptions().locale) ??
    FALLBACK
  );
}

/** Translates `area.name`, replacing `{name}` placeholders from params. */
export function t(key: string, params?: Record<string, string | number>): string {
  const dot = key.indexOf(".");
  const area = key.slice(0, dot);
  const name = key.slice(dot + 1);
  const text = catalogs[getLocale()]?.[area]?.[name] ?? catalogs[FALLBACK]?.[area]?.[name] ?? key;
  return text.replace(/\{(\w+)\}/g, (match, p: string) =>
    params && p in params ? String(params[p]) : match,
  );
}
