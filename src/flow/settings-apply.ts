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
  subModeChip,
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

/** Flow's "Agent" mode hides the classic settings popover; turn it off if it is on. */
export async function ensureClassicComposer(page: Page): Promise<void> {
  const toggle = selectors.agentToggle.locate(page).first();
  const pressed = () => toggle.getAttribute("aria-pressed", { timeout: 1000 }).catch(() => null);
  if ((await pressed()) !== "true") return;
  await clickRobust(toggle);
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if ((await pressed()) === "false") return;
    await page.waitForTimeout(200);
  }
  throw new FlowPilotError("agent_mode_on", "flow.gen.agentModeOn");
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

/** Error for a requested option that the current Flow UI does not offer. */
export function optionNotAvailable(field: string, wanted: string, offered: string[]) {
  return new FlowPilotError("option_not_available", "flow.gen.optionNotAvailable", {
    field,
    wanted,
    offered: offered.length > 0 ? offered.join(", ") : t("flow.gen.noneOffered"),
  });
}

const usable = async (target: Locator): Promise<boolean> =>
  (await target
    .first()
    .isVisible()
    .catch(() => false)) &&
  (await target
    .first()
    .isEnabled()
    .catch(() => false));

async function visibleTexts(chips: Locator): Promise<string[]> {
  const texts = await chips.filter({ visible: true }).allTextContents();
  return [...new Set(texts.map((s) => s.trim()))];
}

const isChecked = async (target: Locator) =>
  (await target.getAttribute("aria-checked").catch(() => null)) === "true" ||
  (await target.getAttribute("aria-pressed").catch(() => null)) === "true";

/**
 * Turns the video "Frames" input mode on or off. Flow shows either a Frames/Ingredients pair of
 * radios or a single Frames toggle (verified live); both are handled.
 */
async function setFramesMode(page: Page, on: boolean): Promise<void> {
  const frames = subModeChip(page, "frames").first();
  if (!(await usable(frames))) {
    if (on) throw optionNotAvailable("input mode", "frames", []);
    return;
  }
  if ((await isChecked(frames)) === on) return;
  const ingredients = subModeChip(page, "ingredients").first();
  await clickRobust(!on && (await usable(ingredients)) ? ingredients : frames);
  await page.waitForTimeout(400);
  if ((await isChecked(frames)) !== on) {
    throw optionNotAvailable("input mode", on ? "frames" : "ingredients", []);
  }
}

/** Clicks `target` if it is present and enabled; otherwise throws `option_not_available`. */
async function pick(
  page: Page,
  field: string,
  wanted: string,
  target: Locator,
  offered: Locator | (() => Promise<string[]>),
): Promise<void> {
  const fail = async () => {
    const list = await (typeof offered === "function" ? offered() : visibleTexts(offered)).catch(
      () => [],
    );
    await dismissOverlays(page).catch(() => undefined);
    return optionNotAvailable(field, wanted, list);
  };
  if (!(await usable(target))) throw await fail();
  try {
    await clickRobust(target);
  } catch {
    throw await fail();
  }
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
    throw optionNotAvailable(
      "model",
      wanted,
      items.map((m) => m.name),
    );
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
  await pick(
    page,
    "mode",
    request.type,
    modeButton(page, request.type),
    selectors.modeButtons.locate(page),
  );
  // Frames on/off changes which resolutions/durations Flow offers: set it first.
  if (request.type === "video")
    await setFramesMode(page, Boolean(request.startFrame || request.endFrame));
  if (request.model) await chooseModel(page, request.model);
  if (request.ratio) {
    const ratios = Object.keys(RATIO_ICON);
    const offered = async () => {
      const found: string[] = [];
      for (const r of ratios) if (await usable(ratioChip(page, r))) found.push(r);
      return found;
    };
    await pick(page, "ratio", request.ratio, ratioChip(page, request.ratio), offered);
  }
  if (request.resolution) {
    const all = resolutionChips(page);
    await pick(page, "resolution", request.resolution, exact(all, request.resolution), all);
  }
  if (request.duration) {
    const all = durationChips(page);
    const wanted = `${request.duration}s`;
    await pick(page, "duration", wanted, exact(all, wanted), all);
  }
  await pick(
    page,
    "outputs",
    `x${request.outputs}`,
    outputChip(page, request.outputs),
    selectors.outputChips.locate(page),
  );

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
