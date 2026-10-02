import type { Locator, Page } from "playwright-core";
import { FlowPilotError } from "../core/errors.js";
import type { JobRequest } from "../core/schemas.js";
import { t } from "../i18n/index.js";
import { clickRobust, dismissOverlays } from "./overlays.js";
import {
  RATIO_ICON,
  durationChips,
  modeButton,
  outputChip,
  ratioChip,
  resolutionChips,
  selectors,
} from "./selectors.js";
import {
  openModelMenu,
  openSettings,
  parseCredits,
  parseModelItem,
  readModelMenu,
  readSettingsTrigger,
  type TriggerSettings,
} from "./settings-read.js";

export interface WantedSettings {
  mode: "video" | "image";
  model?: string;
  ratio?: string;
  outputs: number;
  resolution?: string;
  durationSec?: number;
}

const sameModel = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Lists the requested settings that the page does not show; empty when all match. */
export function diffSettings(wanted: WantedSettings, actual: TriggerSettings): string[] {
  const rows: [string, string | number | undefined, string | number | undefined][] = [
    ["mode", wanted.mode, actual.mode],
    ["ratio", wanted.ratio, actual.ratio],
    ["outputs", wanted.outputs, actual.outputs],
    ["resolution", wanted.resolution, actual.resolution],
    ["duration", wanted.durationSec, actual.durationSec],
  ];
  const diffs = rows
    .filter(([, want, got]) => want !== undefined && want !== got)
    .map(([field, want, got]) => ({ field, wanted: want ?? "", actual: got ?? "none" }));
  if (wanted.model && !(actual.model && sameModel(wanted.model, actual.model))) {
    diffs.push({ field: "model", wanted: wanted.model, actual: actual.model ?? "none" });
  }
  return diffs.map((d) => t("flow.gen.settingsMismatch", d));
}

const notApplied = (details: string) =>
  new FlowPilotError("settings_not_applied", "flow.gen.settingsNotApplied", { details });

const exact = (chips: Locator, text: string) => chips.filter({ hasText: new RegExp(`^${text}$`) });

async function click(page: Page, target: Locator): Promise<void> {
  await clickRobust(target);
  await page.waitForTimeout(400);
}

async function readModelName(page: Page): Promise<string> {
  return parseModelItem((await selectors.modelDropdown.locate(page).first().textContent()) ?? "")
    .name;
}

async function chooseModel(page: Page, wanted: string): Promise<void> {
  if (sameModel(await readModelName(page), wanted)) return;
  await openModelMenu(page);
  const items = await readModelMenu(page);
  const index = items.findIndex((m) => sameModel(m.name, wanted));
  if (index < 0) {
    await dismissOverlays(page);
    return; // The verification step reports the mismatch.
  }
  await clickRobust(selectors.modelMenuItems.locate(page).nth(index));
  await page.waitForTimeout(500);
  await openSettings(page);
}

/**
 * Applies the request to the settings popover and verifies it. Throws `settings_not_applied`
 * on any mismatch. Returns the credit cost shown by Flow and the selected model.
 */
export async function applySettings(
  page: Page,
  request: JobRequest,
): Promise<{ cost: number; model: string }> {
  if (request.ratio && !(request.ratio in RATIO_ICON)) {
    throw notApplied(
      t("flow.gen.settingsMismatch", {
        field: "ratio",
        wanted: request.ratio,
        actual: Object.keys(RATIO_ICON).join(", "),
      }),
    );
  }
  await openSettings(page);
  await click(page, modeButton(page, request.type));
  if (request.model) await chooseModel(page, request.model);
  if (request.ratio) await click(page, ratioChip(page, request.ratio));
  if (request.resolution) await click(page, exact(resolutionChips(page), request.resolution));
  if (request.duration) await click(page, exact(durationChips(page), `${request.duration}s`));
  await click(page, outputChip(page, request.outputs));

  await openSettings(page);
  const trigger = await readSettingsTrigger(page);
  const model = await readModelName(page);
  const diffs = diffSettings(
    {
      mode: request.type,
      ...(request.model ? { model: request.model } : {}),
      ...(request.ratio ? { ratio: request.ratio } : {}),
      outputs: request.outputs,
      ...(request.resolution ? { resolution: request.resolution } : {}),
      ...(request.duration ? { durationSec: request.duration } : {}),
    },
    { ...trigger, model },
  );
  if (diffs.length > 0) {
    await dismissOverlays(page);
    throw notApplied(diffs.join("; "));
  }

  const text = await selectors.creditLine
    .locate(page)
    .first()
    .textContent({ timeout: 3000 })
    .catch(() => null);
  const cost = parseCredits(text ?? "");
  await dismissOverlays(page);
  // Images may show no cost line; videos must, so a missing one is never read as free.
  if (cost === undefined && request.type === "video") {
    throw new FlowPilotError("credits_unreadable", "flow.gen.creditsUnreadable");
  }
  return { cost: cost ?? 0, model };
}
