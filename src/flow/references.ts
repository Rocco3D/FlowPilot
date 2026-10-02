import fs from "node:fs";
import type { Locator, Page } from "playwright-core";
import { FlowPilotError } from "../core/errors.js";
import type { JobRequest } from "../core/schemas.js";
import { clickRobust, dismissOverlays } from "./overlays.js";
import { assetOption, frameSlot, selectors, subModeChip } from "./selectors.js";
import { openSettings } from "./settings-read.js";

type Slot = "Start" | "End";
type RefInput = Pick<JobRequest, "type" | "startFrame" | "endFrame" | "ingredients" | "characters">;

export interface ReferencePlan {
  /** Video sub-mode to select in the settings; undefined without references and for images. */
  subMode?: "frames" | "ingredients";
  frames: { slot: Slot; file: string }[];
  /** Files uploaded through the ingredients button. */
  ingredients: string[];
  characters: string[];
}

const invalid = (key: string) => new FlowPilotError("invalid_input", key);

/** Decides which sub-mode, slots and uploads a request needs. Throws on invalid combinations. */
export function planReferences(request: RefInput): ReferencePlan {
  const frames: ReferencePlan["frames"] = [];
  if (request.startFrame) frames.push({ slot: "Start", file: request.startFrame });
  if (request.endFrame) frames.push({ slot: "End", file: request.endFrame });
  const ingredients = request.ingredients ?? [];
  const characters = request.characters ?? [];
  if (frames.length > 0 && request.type !== "video") throw invalid("flow.refs.framesVideoOnly");
  if (frames.length > 0 && (ingredients.length > 0 || characters.length > 0)) {
    throw invalid("flow.refs.framesExclusive");
  }
  const subMode =
    request.type !== "video"
      ? undefined
      : frames.length > 0
        ? "frames"
        : ingredients.length + characters.length > 0
          ? "ingredients"
          : undefined;
  return { ...(subMode ? { subMode } : {}), frames, ingredients, characters };
}

/** Number of new references the prompt area must show, given which frame slots were skipped. */
export function expectedNewReferences(plan: ReferencePlan, filledSlots: Slot[] = []): number {
  return (
    plan.frames.filter((f) => !filledSlots.includes(f.slot)).length +
    plan.ingredients.length +
    plan.characters.length
  );
}

/** Throws `input_file_not_found` for the first missing file. Run before touching Flow. */
export function assertFilesExist(
  plan: ReferencePlan,
  exists: (file: string) => boolean = fs.existsSync,
): void {
  for (const file of [...plan.frames.map((f) => f.file), ...plan.ingredients]) {
    if (!exists(file)) {
      throw new FlowPilotError("input_file_not_found", "flow.refs.fileNotFound", { path: file });
    }
  }
}

async function waitDialog(page: Page): Promise<Locator> {
  const d = selectors.mediaDialog.locate(page).first();
  await d.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {
    throw new FlowPilotError("references_not_attached", "flow.refs.dialogNotOpen");
  });
  await selectors.mediaDialogLoading
    .locate(page)
    .first()
    .waitFor({ state: "hidden", timeout: 15_000 })
    .catch(() => undefined);
  return d;
}

/** Opens the add assets dialog with the ingredients button. Leaves it open. */
export async function openAddMediaDialog(page: Page): Promise<Locator> {
  await clickRobust(selectors.addIngredientsButton.locate(page));
  return waitDialog(page);
}

/** Clicks the confirm button only if the dialog has one, then closes the dialog if still open. */
async function finishDialog(page: Page, d: Locator): Promise<void> {
  const confirm = selectors.mediaDialogConfirm.locate(page).first();
  if (await confirm.isVisible().catch(() => false)) await clickRobust(confirm);
  await d.waitFor({ state: "hidden", timeout: 3000 }).catch(async () => {
    await clickRobust(selectors.mediaDialogClose.locate(page)).catch(() => undefined);
    await d.waitFor({ state: "hidden", timeout: 5000 });
  });
}

/** Uploads a file in the open dialog; Flow selects or attaches it by itself. */
async function uploadAndConfirm(page: Page, d: Locator, file: string): Promise<void> {
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser", { timeout: 15_000 }),
    clickRobust(selectors.mediaDialogUpload.locate(page)),
  ]);
  await chooser.setFiles(file);
  await Promise.race([
    selectors.mediaDialogSelected
      .locate(page)
      .first()
      .waitFor({ state: "visible", timeout: 30_000 }),
    d.waitFor({ state: "hidden", timeout: 30_000 }),
  ]).catch(() => undefined);
  await finishDialog(page, d).catch(async () => {
    await dismissOverlays(page);
    throw new FlowPilotError("references_not_attached", "flow.refs.uploadFailed", { path: file });
  });
}

async function chooseSubMode(page: Page, mode: "frames" | "ingredients"): Promise<void> {
  await openSettings(page);
  await clickRobust(subModeChip(page, mode));
  await page.waitForTimeout(400);
  await dismissOverlays(page);
}

/** Fills a frame slot; returns false when the slot is already filled (its label is gone). */
async function fillFrame(page: Page, slot: Slot, file: string): Promise<boolean> {
  const target = frameSlot(page, slot).first();
  if ((await target.count()) === 0) return false;
  await clickRobust(target);
  await uploadAndConfirm(page, await waitDialog(page), file);
  return true;
}

/** Picks a saved character: category filter, search by name, click the matching asset. */
async function addCharacter(page: Page, name: string): Promise<void> {
  const d = await openAddMediaDialog(page);
  await clickRobust(selectors.mediaDialogCategory.locate(page)).catch(() => undefined);
  const category = selectors.mediaDialogCategoryOptions
    .locate(page)
    .filter({ hasText: /character/i });
  if (
    await category
      .first()
      .isVisible({ timeout: 2000 })
      .catch(() => false)
  ) {
    await clickRobust(category);
    await page.waitForTimeout(500);
  }
  await selectors.mediaDialogSearch
    .locate(page)
    .first()
    .fill(name)
    .catch(() => undefined);
  const tile = assetOption(page, name).first();
  try {
    await tile.waitFor({ state: "visible", timeout: 8000 });
  } catch {
    await clickRobust(selectors.mediaDialogClose.locate(page)).catch(() => undefined);
    await dismissOverlays(page);
    throw new FlowPilotError("character_not_found", "flow.refs.characterNotFound", { name });
  }
  await clickRobust(tile);
  await finishDialog(page, d);
}

/** Counts thumbnails in the prompt area: images, or elements with a background image. */
const countThumbnails = (page: Page) =>
  selectors.promptArea.locate(page).evaluate((el) => {
    const bg = [...el.querySelectorAll("*")].filter(
      (e) => getComputedStyle(e).backgroundImage !== "none",
    );
    return el.querySelectorAll("img").length + bg.length;
  });

const countAttached = (page: Page) => selectors.attachedReferences.locate(page).count();

/**
 * Selects the video sub-mode, attaches every reference and checks that the prompt area shows them.
 * Does nothing when the plan is empty.
 */
export async function attachReferences(page: Page, plan: ReferencePlan): Promise<void> {
  if (!plan.subMode && expectedNewReferences(plan) === 0) return;
  if (plan.subMode) await chooseSubMode(page, plan.subMode);
  const before = await countAttached(page);
  const thumbsBefore = await countThumbnails(page).catch(() => 0);
  const skipped: Slot[] = [];
  for (const { slot, file } of plan.frames) {
    if (!(await fillFrame(page, slot, file))) skipped.push(slot);
  }
  for (const file of plan.ingredients) {
    await uploadAndConfirm(page, await openAddMediaDialog(page), file);
  }
  for (const name of plan.characters) await addCharacter(page, name);

  const expected = expectedNewReferences(plan, skipped);
  await page.waitForTimeout(1000);
  const after = await countAttached(page);
  const found = after - before;
  // Fallback when the image selector sees nothing at all: any new thumbnail counts.
  const thumbsFound =
    before === 0 && after === 0 ? (await countThumbnails(page).catch(() => 0)) - thumbsBefore : 0;
  if (found < expected && thumbsFound < expected) {
    throw new FlowPilotError("references_not_attached", "flow.refs.notAttached", {
      expected,
      found,
    });
  }
}
