import fs from "node:fs";
import path from "node:path";
import type { Locator, Page } from "playwright-core";
import { FlowPilotError } from "../core/errors.js";
import type { Logger } from "../core/logger.js";
import type { JobRequest } from "../core/schemas.js";
import { clickRobust, dismissOverlays } from "./overlays.js";
import {
  assetForFile,
  assetOption,
  frameSlot,
  framePanel,
  framePanelAsset,
  framePanelClose,
  framePanelConfirm,
  framePanelSearch,
  framePanelTab,
  framePanelUpload,
  selectors,
  subModeChip,
} from "./selectors.js";
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

export interface UploadOptions {
  acceptUploadRights: boolean;
  log?: Logger;
}

/** Answers the rights dialog Flow shows after an upload, if it appears. */
async function answerRights(page: Page, file: string, opts: UploadOptions): Promise<void> {
  const rights = selectors.rightsDialog.locate(page).first();
  const shown = await rights
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (!shown) return;
  if (!opts.acceptUploadRights) {
    await clickRobust(selectors.rightsCancel.locate(page)).catch(() => undefined);
    throw new FlowPilotError("upload_rights_not_accepted", "flow.refs.rightsNotAccepted", {
      path: file,
    });
  }
  await clickRobust(selectors.rightsAgree.locate(page));
  await rights.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => undefined);
  opts.log?.info(`accepted Flow upload rights dialog for ${file}`);
}

/**
 * Attaches a file through the open dialog: reuses the project asset with the same base name, else
 * uploads it. Flow may attach the upload and close the dialog by itself; otherwise the asset is
 * clicked. The dialog is closed at the end.
 */
async function uploadAndConfirm(
  page: Page,
  d: Locator,
  file: string,
  opts: UploadOptions,
): Promise<void> {
  const asset = assetForFile(page, path.parse(file).name).first();
  if (!(await asset.isVisible().catch(() => false))) {
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 15_000 }),
      clickRobust(selectors.mediaDialogUpload.locate(page)),
    ]);
    await chooser.setFiles(file);
    await answerRights(page, file, opts);
  }
  for (let i = 0; i < 60 && (await d.isVisible().catch(() => false)); i += 1) {
    if (await asset.isVisible().catch(() => false)) {
      await clickRobust(asset);
      break;
    }
    await page.waitForTimeout(500);
  }
  await d.waitFor({ state: "hidden", timeout: 8000 }).catch(async () => {
    await clickRobust(selectors.mediaDialogClose.locate(page)).catch(() => undefined);
    await d.waitFor({ state: "hidden", timeout: 5000 }).catch(() => undefined);
  });
}

async function chooseSubMode(page: Page, mode: "frames" | "ingredients"): Promise<void> {
  await openSettings(page);
  await clickRobust(subModeChip(page, mode));
  await page.waitForTimeout(400);
  await dismissOverlays(page);
}

/** Fills a frame slot; returns false when the slot is already filled (its label is gone). */
async function fillFrame(
  page: Page,
  slot: Slot,
  file: string,
  opts: UploadOptions,
): Promise<boolean> {
  const target = frameSlot(page, slot).first();
  if ((await target.count()) === 0) return false;
  await clickRobust(target);
  try {
    await pickFrame(page, file, opts);
    const filled = async () =>
      (await frameSlot(page, slot).count()) === 0 ||
      (await frameSlot(page, slot).locator("img").count()) > 0;
    for (let i = 0; i < 10 && !(await filled()); i += 1) await page.waitForTimeout(500);
    if (!(await filled())) {
      throw new FlowPilotError("references_not_attached", "flow.refs.frameNotFilled", { slot });
    }
  } catch (error) {
    await closeFramePanel(page);
    throw error;
  }
  return true;
}

async function closeFramePanel(page: Page): Promise<void> {
  const panel = framePanel(page);
  if (!(await panel.isVisible().catch(() => false))) return;
  await clickRobust(framePanelClose(page)).catch(() => undefined);
  await panel.waitFor({ state: "hidden", timeout: 5000 }).catch(() => undefined);
}

/** In the open frame picker: selects the asset named like the file (uploading if needed), confirms. */
async function pickFrame(page: Page, file: string, opts: UploadOptions): Promise<void> {
  const panel = framePanel(page);
  await panel.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {
    throw new FlowPilotError("references_not_attached", "flow.refs.framePanelNotOpen");
  });
  const base = path.parse(file).name;
  const asset = framePanelAsset(page, base).first();
  await framePanelSearch(page)
    .first()
    .fill(base)
    .catch(() => undefined);
  const existing = await asset
    .waitFor({ state: "visible", timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  if (!existing) {
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 15_000 }),
      clickRobust(framePanelUpload(page)),
    ]);
    await chooser.setFiles(file);
    await answerRights(page, file, opts);
    const tab = framePanelTab(page, "Uploads").first();
    let found = false;
    for (let i = 0; i < 60 && !found; i += 1) {
      found = await asset.isVisible().catch(() => false);
      if (!found) {
        if (i % 6 === 5 && (await tab.isVisible().catch(() => false))) {
          await clickRobust(tab).catch(() => undefined);
        }
        await page.waitForTimeout(500);
      }
    }
    if (!found) {
      throw new FlowPilotError("references_not_attached", "flow.refs.uploadFailed", {
        path: file,
      });
    }
  }
  await clickRobust(asset);
  await clickRobust(framePanelConfirm(page));
  await panel.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {
    throw new FlowPilotError("references_not_attached", "flow.refs.framePanelNotOpen");
  });
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

const countAttached = (page: Page) => selectors.attachedReferences.locate(page).count();

/**
 * Selects the video sub-mode, attaches every reference and checks that the prompt area shows them.
 * Does nothing when the plan is empty.
 */
export async function attachReferences(
  page: Page,
  plan: ReferencePlan,
  opts: UploadOptions,
): Promise<void> {
  if (!plan.subMode && expectedNewReferences(plan) === 0) return;
  if (plan.subMode) await chooseSubMode(page, plan.subMode);
  const before = await countAttached(page);
  const skipped: Slot[] = [];
  for (const { slot, file } of plan.frames) {
    if (!(await fillFrame(page, slot, file, opts))) skipped.push(slot);
  }
  for (const file of plan.ingredients) {
    await uploadAndConfirm(page, await openAddMediaDialog(page), file, opts);
  }
  for (const name of plan.characters) await addCharacter(page, name);

  const expected = expectedNewReferences(plan, skipped);
  let found = 0;
  for (let i = 0; i < 30 && found < expected; i += 1) {
    found = (await countAttached(page)) - before;
    if (found < expected) await page.waitForTimeout(500);
  }
  if (found < expected) {
    throw new FlowPilotError("references_not_attached", "flow.refs.notAttached", {
      expected,
      found,
    });
  }
}
