import type { Locator, Page } from "playwright-core";
import type { JobType, ModelInfo } from "../core/schemas.js";
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
import { ensureClassicComposer } from "./settings-apply.js";
import {
  openModelMenu,
  openSettings,
  parseCredits,
  parseModelItem,
  readModelMenu,
  readSettingsTrigger,
  type TriggerSettings,
} from "./settings-read.js";

const MODES: JobType[] = ["video", "image"];

async function chipTexts(chips: Locator): Promise<string[]> {
  const texts = await chips.filter({ visible: true }).allTextContents();
  return [...new Set(texts.map((s) => s.trim()))];
}

async function pickChip(page: Page, chips: Locator, text: string): Promise<void> {
  await clickRobust(chips.filter({ hasText: new RegExp(`^${text}$`) }));
  await page.waitForTimeout(300);
}

async function readCredits(page: Page): Promise<number | undefined> {
  const text = await selectors.creditLine.locate(page).first().textContent({ timeout: 3000 });
  return parseCredits(text ?? "");
}

async function setMode(page: Page, mode: JobType): Promise<void> {
  await openSettings(page);
  await clickRobust(modeButton(page, mode));
  await page.waitForTimeout(400);
}

async function selectModel(page: Page, index: number): Promise<void> {
  await openSettings(page);
  await openModelMenu(page);
  await clickRobust(selectors.modelMenuItems.locate(page).nth(index));
  await page.waitForTimeout(500);
  await openSettings(page);
}

async function readMenu(page: Page) {
  await openSettings(page);
  await openModelMenu(page);
  const items = await readModelMenu(page);
  await dismissOverlays(page);
  return items;
}

async function ratiosAvailable(page: Page): Promise<string[]> {
  const found: string[] = [];
  for (const ratio of Object.keys(RATIO_ICON)) {
    const chip = ratioChip(page, ratio).first();
    if (
      (await chip.isVisible().catch(() => false)) &&
      (await chip.isEnabled().catch(() => false))
    ) {
      found.push(ratio);
    }
  }
  return found;
}

async function readModel(
  page: Page,
  kind: JobType,
  item: { name: string; audio: boolean },
): Promise<ModelInfo> {
  // Costs scale with the output count, so read them per single output.
  await pickChip(page, outputChip(page, 1), "x1");
  const trigger = await readSettingsTrigger(page);
  const ratios = await ratiosAvailable(page);
  const chipRes = await chipTexts(resolutionChips(page));
  const chipDur = (await chipTexts(durationChips(page))).map((s) => Number.parseInt(s, 10));
  let credits: ModelInfo["credits"] = (await readCredits(page)) ?? 0;
  if (chipRes.length + chipDur.length > 0) {
    // One cost per resolution x duration combination, keyed like "720p-8s".
    const costs: Record<string, number> = {};
    for (const res of chipRes.length ? chipRes : [undefined]) {
      if (res) await pickChip(page, resolutionChips(page), res);
      for (const dur of chipDur.length ? chipDur : [undefined]) {
        if (dur) await pickChip(page, durationChips(page), `${dur}s`);
        const cost = await readCredits(page);
        const key = [res, dur ? `${dur}s` : undefined].filter(Boolean).join("-");
        if (cost !== undefined) costs[key] = cost;
      }
    }
    credits = costs;
  }
  const resolutions = chipRes.length ? chipRes : trigger.resolution ? [trigger.resolution] : [];
  const durations = chipDur.length ? chipDur : trigger.durationSec ? [trigger.durationSec] : [];
  return {
    name: item.name,
    kind,
    ratios,
    ...(resolutions.length ? { resolutions } : {}),
    durations: kind === "video" ? durations : [],
    credits,
    audio: item.audio,
  };
}

async function restore(page: Page, original: TriggerSettings, modelName: string): Promise<void> {
  await setMode(page, original.mode);
  const items = await readMenu(page);
  const index = items.findIndex((m) => m.name === modelName);
  if (index >= 0) await selectModel(page, index);
  const exact = (chips: Locator, text: string) =>
    chips.filter({ hasText: new RegExp(`^${text}$`) });
  const targets: (Locator | undefined)[] = [
    original.ratio ? ratioChip(page, original.ratio) : undefined,
    original.resolution ? exact(resolutionChips(page), original.resolution) : undefined,
    original.durationSec ? exact(durationChips(page), `${original.durationSec}s`) : undefined,
    original.outputs ? outputChip(page, original.outputs) : undefined,
  ];
  for (const target of targets) {
    if (
      target &&
      (await target
        .first()
        .isVisible()
        .catch(() => false))
    ) {
      await clickRobust(target);
    }
  }
  await dismissOverlays(page);
}

/** Reads every model of Video and Image mode in the open project. Never submits. */
export async function discoverModels(page: Page): Promise<ModelInfo[]> {
  await ensureClassicComposer(page);
  await openSettings(page);
  const original = await readSettingsTrigger(page);
  const dropdown = await selectors.modelDropdown.locate(page).first().textContent();
  const originalModel = parseModelItem(dropdown ?? "").name;
  const models: ModelInfo[] = [];
  try {
    for (const kind of MODES) {
      await setMode(page, kind);
      const items = await readMenu(page);
      for (const [index, item] of items.entries()) {
        await selectModel(page, index);
        models.push(await readModel(page, kind, item));
      }
    }
  } finally {
    await restore(page, original, originalModel).catch(() => dismissOverlays(page));
  }
  return models;
}
