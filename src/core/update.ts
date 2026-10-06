import { t } from "../i18n/index.js";
import type { UpdateInfo } from "./schemas.js";

/** The version on `main` is the latest one: every update raises it by 0.0.1. */
const LATEST_URL = "https://raw.githubusercontent.com/Rocco3D/FlowPilot/main/package.json";
const TIMEOUT_MS = 3000;

/** True when version `a` (x.y.z) is newer than `b`. */
export function isNewer(a: string, b: string): boolean {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

/** Compares `installed` with the version on GitHub; undefined when up to date or unreachable. */
export async function checkForUpdate(installed: string): Promise<UpdateInfo | undefined> {
  try {
    const res = await fetch(LATEST_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return undefined;
    const { version } = (await res.json()) as { version?: unknown };
    if (typeof version !== "string" || !isNewer(version, installed)) return undefined;
    return {
      installed,
      latest: version,
      message: t("core.update.available", { installed, latest: version }),
    };
  } catch {
    return undefined;
  }
}
