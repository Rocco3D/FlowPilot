import fs from "node:fs";
import type { Locator, Page } from "playwright-core";
import { FlowPilotError } from "../core/errors.js";
import type { JobRequest } from "../core/schemas.js";
import { clickRobust, dismissOverlays } from "./overlays.js";
import { characterTile, frameSlot, selectors, subModeChip } from "./selectors.js";
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
  return d;
}

/** Opens the add media dialog with the ingredients button. Leaves it open. */
export async function openAddMediaDialog(page: Page): Promise<Locator> {
  await clickRobust(selectors.addIngredientsButton.locate(page));
  return waitDialog(page);
}

/** Adds the selected tile to the prompt and waits for the dialog to close. */
async function confirm(page: Page, d: Locator): Promise<void> {
  await clickRobust(selectors.mediaDialogConfirm.locate(page));
  await d.waitFor({ state: "hidden", timeout: 10_000 });
}

/** Uploads a file in the open dialog; the upload is auto-selected, then confirmed. */
async function uploadAndConfirm(page: Page, d: Locator, file: string): Promise<void> {
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser", { timeout: 15_000 }),
    clickRobust(selectors.mediaDialogUpload.locate(page)),
  ]);
  await chooser.setFiles(file);
  await selectors.mediaDialogSelected
    .locate(page)
    .first()
    .waitFor({ state: "visible", timeout: 30_000 })
    .catch(async () => {
      await selectors.mediaDialogTiles.locate(page).first().click();
    });
  await confirm(page, d).catch(async () => {
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

async function addCharacter(page: Page, name: string): Promise<void> {
  const d = await openAddMediaDialog(page);
  await clickRobust(selectors.mediaDialogCharactersTab.locate(page)).catch(() => undefined);
  const tile = characterTile(page, name).first();
  try {
    await tile.waitFor({ state: "visible", timeout: 8000 });
  } catch {
    await page.keyboard.press("Escape").catch(() => undefined);
    await dismissOverlays(page);
    throw new FlowPilotError("character_not_found", "flow.refs.characterNotFound", { name });
  }
  await clickRobust(tile);
  await confirm(page, d);
}

const countAttached = (page: Page) => selectors.attachedReferences.locate(page).count();

/**
 * Selects the video sub-mode, attaches every reference and checks that the prompt area shows them.
 * Does nothing when the plan is empty.
 */
export async function attachReferences(page: Page, plan: ReferencePlan): Promise<void> {
  if (!plan.subMode && expectedNewReferences(plan) === 0) return;
  if (plan.subMode) await chooseSubMode(page, plan.subMode);
  const before = await countAttached(page);
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
  const found = (await countAttached(page)) - before;
  if (found < expected) {
    throw new FlowPilotError("references_not_attached", "flow.refs.notAttached", {
      expected,
      found,
    });
  }
}
