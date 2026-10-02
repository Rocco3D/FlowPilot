import type { Page } from "playwright-core";
import { FlowPilotError } from "../core/errors.js";
import { clickRobust } from "./overlays.js";
import { CREDITS_RE, RATIO_ICON, selectors } from "./selectors.js";

export interface TriggerSettings {
  mode: "video" | "image";
  model?: string;
  resolution?: string;
  durationSec?: number;
  ratio?: string;
  outputs?: number;
}

export interface MenuModel {
  name: string;
  audio: boolean;
}

const ICON_TO_RATIO = Object.fromEntries(Object.entries(RATIO_ICON).map(([r, i]) => [i, r]));

/** Parses the settings pill text, e.g. "Video · 720p · 8s crop_16_9 x1". */
export function parseSettingsTrigger(text: string): TriggerSettings {
  const clean = text.replace(/\s+/g, " ").trim();
  const icon = /crop_\w+/.exec(clean);
  const ratio = icon ? ICON_TO_RATIO[icon[0]] : undefined;
  const outputs = /\bx([1-4])\b/.exec(clean)?.[1];
  const resolution = /\b(\d{3,4}p)\b/.exec(clean)?.[1];
  const duration = /\b(\d+)s\b/.exec(clean)?.[1];
  const mode = /^video\b/i.test(clean) || resolution || duration ? "video" : "image";
  const settings: TriggerSettings = { mode };
  if (mode === "image") {
    const model = clean
      .slice(0, icon?.index ?? clean.length)
      .replace(/^[^\p{L}\p{N}]+/u, "")
      .trim();
    if (model) settings.model = model;
  }
  if (resolution) settings.resolution = resolution;
  if (duration) settings.durationSec = Number(duration);
  if (ratio) settings.ratio = ratio;
  if (outputs) settings.outputs = Number(outputs);
  return settings;
}

/** Credit cost from "Generating will use N credits". */
export function parseCredits(text: string): number | undefined {
  const match = CREDITS_RE.exec(text);
  return match ? Number(match[1]) : undefined;
}

/** Turns a menu item or dropdown text ("volume_up Veo 3.1 - Fast", "🍌 Nano Banana 2") into a model. */
export function parseModelItem(text: string): MenuModel {
  const audio = /\bvolume_up\b/.test(text);
  const name = text
    .replace(/\b(volume_up|arrow_drop_down)\b/g, "")
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/\s+/g, " ")
    .trim();
  return { name, audio };
}

const popoverOpen = (page: Page) =>
  selectors.outputChips
    .locate(page)
    .first()
    .isVisible()
    .catch(() => false);

/** Opens the settings popover; the first click often does not open it, so retry up to 3 times. */
export async function openSettings(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 3 && !(await popoverOpen(page)); attempt += 1) {
    await selectors.settingsTrigger
      .locate(page)
      .first()
      .click({ force: true })
      .catch(() => undefined);
    await page.waitForTimeout(700);
  }
  if (!(await popoverOpen(page))) {
    throw new FlowPilotError("settings_not_open", "flow.models.settingsNotOpen");
  }
}

export async function readSettingsTrigger(page: Page): Promise<TriggerSettings> {
  return parseSettingsTrigger(
    (await selectors.settingsTrigger.locate(page).first().textContent()) ?? "",
  );
}

/** Opens the model dropdown (the settings popover must be open). */
export async function openModelMenu(page: Page): Promise<void> {
  await clickRobust(selectors.modelDropdown.locate(page));
  await selectors.modelMenuItems
    .locate(page)
    .first()
    .waitFor({ state: "visible", timeout: 3000 })
    .catch(() => {
      throw new FlowPilotError("model_menu_not_open", "flow.models.menuNotOpen");
    });
}

/** Reads the items of the open model menu. */
export async function readModelMenu(page: Page): Promise<MenuModel[]> {
  const texts = await selectors.modelMenuItems.locate(page).allTextContents();
  return texts.map(parseModelItem).filter((m) => m.name);
}
