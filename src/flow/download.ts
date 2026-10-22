import fs from "node:fs";
import path from "node:path";
import type { Locator, Page } from "playwright-core";
import { FlowPilotError } from "../core/errors.js";
import type { JobRequest, JobType, Upscale } from "../core/schemas.js";
import { clickRobust, dismissOverlays } from "./overlays.js";
import type { ResultItem } from "./results.js";
import {
  EDIT_PATH_RE,
  GATED_TIER_RE,
  TIER_ITEM_RE,
  TIER_RE,
  VIDEO_EXT_RE,
  VIDEO_TIER_RE,
  mediaUrl,
  resultMedia,
  selectors,
  tileByResult,
  tileDownloadItem,
  tileMoreOptions,
  tierItem,
  videoTileAt,
} from "./selectors.js";

export interface DownloadedResult {
  path: string;
  mediaId?: string;
}

export const resultBaseName = (jobId: string, n: number) => `${jobId}-${n}`;

export const tierPattern = (upscale: Upscale | undefined): RegExp => TIER_RE[upscale ?? "1080p"];

/** Whether the direct fetch (original quality only) may be used when no menu path worked. */
export function assertFetchAllowed(upscale: Upscale | undefined, projectUrl: string): void {
  if (upscale === "original") return;
  throw new FlowPilotError("upscale_unavailable", "flow.download.upscaleUnavailable", {
    quality: upscale ?? "1080p",
    url: projectUrl,
  });
}

/** `<project>-media-<id>`, with the characters Windows does not allow in a file name turned into "-". */
export const mediaBaseName = (project: string, mediaId: string) =>
  `${project}-media-${mediaId}`.replace(/[\\/:*?"<>|]/g, "-");

/** A download counts only when the file is on disk and not empty. */
export function assertSaved(file: string): string {
  if ((fs.statSync(file, { throwIfNoEntry: false })?.size ?? 0) > 0) return file;
  throw new FlowPilotError("download_failed", "flow.download.fileMissing", { path: file });
}

export type TierChoice = { kind: "pick"; index: number } | { kind: "locked" } | { kind: "none" };

export interface TierItem {
  label: string;
  disabled: boolean;
}

/** Picks the menu item for the tier; items asking for a plan upgrade or disabled by Flow are never picked. */
export function chooseTier(items: TierItem[], tier: RegExp): TierChoice {
  const matching = items.flatMap((item, index) =>
    tier.test(item.label) ? [{ ...item, index }] : [],
  );
  const open = matching.find((m) => !m.disabled && !GATED_TIER_RE.test(m.label));
  if (open) return { kind: "pick", index: open.index };
  return matching.length > 0 ? { kind: "locked" } : { kind: "none" };
}

export function extensionFor(type: JobType, contentType: string | undefined): string {
  if (contentType?.includes("jpeg")) return ".jpg";
  if (contentType?.includes("png")) return ".png";
  if (contentType?.includes("webp")) return ".webp";
  if (contentType?.includes("mp4") || contentType?.includes("video")) return ".mp4";
  return type === "video" ? ".mp4" : ".png";
}

async function openViewer(page: Page, item: ResultItem): Promise<string> {
  await clickRobust(resultMedia(page, item));
  await page.waitForURL(EDIT_PATH_RE, { timeout: 15000 }).catch(() => {
    throw new FlowPilotError("viewer_not_opened", "flow.download.viewerNotOpened");
  });
  return EDIT_PATH_RE.exec(page.url())?.[1] ?? item.id;
}

/** Clicks the tier item of the open download menu and saves the file the browser downloads. */
async function saveTier(
  page: Page,
  tier: RegExp,
  basePath: string,
  type: JobType,
): Promise<string> {
  const items = tierItem(page, tier);
  await items.first().waitFor({ state: "visible", timeout: 5000 });
  const choice = chooseTier(
    await items.evaluateAll((els) =>
      els.map((el) => ({
        label: el.textContent ?? "",
        disabled: el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true",
      })),
    ),
    tier,
  );
  if (choice.kind === "locked") {
    throw new FlowPilotError("download_tier_locked", "flow.download.tierLocked");
  }
  if (choice.kind === "none") {
    throw new FlowPilotError("download_failed", "flow.download.noSource");
  }
  const target = items.nth(choice.index);
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 180000 }),
    // Flow ignores a mouse click on the upscaled items; the keyboard selects every item.
    target.focus().then(() => page.keyboard.press("Enter")),
  ]);
  const ext = path.extname(download.suggestedFilename()) || extensionFor(type, undefined);
  await download.saveAs(basePath + ext);
  return basePath + ext;
}

/** Viewer path: its "Download media" button, or "More options" > "Download media" (classic layout), then tier. */
async function downloadViaViewerMenu(
  page: Page,
  tier: RegExp,
  basePath: string,
  type: JobType,
): Promise<string> {
  const button = selectors.downloadMediaButton.locate(page).first();
  if (await button.isVisible().catch(() => false)) {
    await clickRobust(button);
  } else {
    await clickRobust(selectors.moreOptionsButton.locate(page));
    await clickRobust(selectors.downloadMediaItem.locate(page));
  }
  return saveTier(page, tier, basePath, type);
}

/** Primary path: the result tile's own "More options" > "Download" > tier. */
async function downloadViaTileMenu(
  page: Page,
  item: ResultItem,
  tier: RegExp,
  basePath: string,
  type: JobType,
): Promise<string> {
  const tile = await findTile(page, item);
  await tile.scrollIntoViewIfNeeded().catch(() => undefined);
  await tile.hover({ force: true });
  await page.waitForTimeout(1000);
  await tileMoreOptions(tile).click({ force: true, timeout: 4000 });
  const download = tileDownloadItem(page).first();
  await download.waitFor({ state: "visible", timeout: 5000 });
  // The tier submenu opens on hover.
  await download.hover({ force: true });
  await page.waitForTimeout(800);
  return saveTier(page, tier, basePath, type);
}

/** Leaves the viewer (back to the project grid) if it is open. */
export async function leaveViewer(page: Page): Promise<void> {
  await dismissOverlays(page);
  if (!EDIT_PATH_RE.test(page.url())) return;
  await clickRobust(selectors.backButton.locate(page)).catch(() => undefined);
  await page
    .waitForURL((url) => !EDIT_PATH_RE.test(url.pathname), { timeout: 10000 })
    .catch(() => undefined);
  await dismissOverlays(page);
}

/**
 * Finds the result tile by its stable media id, with the src as fallback; if Flow re-rendered it,
 * by the recorded tile position.
 */
async function findTile(page: Page, item: ResultItem): Promise<Locator> {
  let tile = tileByResult(page, item).first();
  if ((await tile.count()) === 0) {
    if (item.tileIndex === undefined) {
      throw new FlowPilotError("download_no_source", "flow.download.noSource");
    }
    tile = videoTileAt(page, item.tileIndex);
  }
  return tile;
}

/** Hovers the result's tile on the grid and returns the src of the video Flow mounts in it. */
async function videoSrcFromTile(page: Page, item: ResultItem): Promise<string> {
  await leaveViewer(page);
  const tile = await findTile(page, item).catch(() => undefined);
  if (!tile) return "";
  await tile.scrollIntoViewIfNeeded().catch(() => undefined);
  await tile.hover({ force: true }).catch(() => undefined);
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(500);
    const src = await tile
      .locator("video")
      .first()
      .evaluate((v) => (v as HTMLVideoElement).currentSrc || (v as HTMLVideoElement).src)
      .catch(() => "");
    if (src) return src;
  }
  return "";
}

async function downloadViaFetch(
  page: Page,
  item: ResultItem,
  type: JobType,
  basePath: string,
): Promise<string> {
  let src = item.src;
  if (type === "video") {
    src = await page.evaluate(() => {
      const v = document.querySelector<HTMLVideoElement>("video.main-video");
      return v ? v.currentSrc || v.src : "";
    });
    // New layout has no viewer video: hover the tile on the grid, which mounts a <video>.
    if (!src) src = await videoSrcFromTile(page, item);
  }
  if (!src) throw new FlowPilotError("download_no_source", "flow.download.noSource");
  const response = await page.context().request.get(src);
  if (!response.ok()) {
    throw new FlowPilotError("download_failed", "flow.download.fetchFailed", {
      status: response.status(),
    });
  }
  const file = basePath + extensionFor(type, response.headers()["content-type"]);
  fs.writeFileSync(file, await response.body());
  return file;
}

/** Downloads one result at the requested tier and leaves the viewer. */
export async function downloadResult(
  page: Page,
  item: ResultItem,
  options: {
    type: JobType;
    upscale: JobRequest["upscale"];
    outDir: string;
    jobId: string;
    n: number;
  },
): Promise<DownloadedResult> {
  fs.mkdirSync(options.outDir, { recursive: true });
  const basePath = path.join(options.outDir, resultBaseName(options.jobId, options.n));
  const projectUrl = page.url();
  const tier = tierPattern(options.upscale);
  let mediaId = item.id;
  try {
    await leaveViewer(page);
    // 1. Tile menu (new layout).
    try {
      const file = await downloadViaTileMenu(page, item, tier, basePath, options.type);
      return { path: assertSaved(file), mediaId };
    } catch (error) {
      if (error instanceof FlowPilotError && error.code === "download_tier_locked") throw error;
      await dismissOverlays(page);
    }
    // 2. Viewer "Download media" menu (classic layout).
    try {
      mediaId = await openViewer(page, item);
      const file = await downloadViaViewerMenu(page, tier, basePath, options.type);
      return { path: assertSaved(file), mediaId };
    } catch (error) {
      if (error instanceof FlowPilotError && error.code === "download_tier_locked") throw error;
      await dismissOverlays(page);
    }
    // 3. Direct fetch gives the original only: never a silent downgrade.
    assertFetchAllowed(options.upscale, projectUrl);
    const file = await downloadViaFetch(page, item, options.type, basePath);
    return { path: assertSaved(file), mediaId };
  } finally {
    await leaveViewer(page);
  }
}

/**
 * Downloads a media already in the project from Flow's viewer, opened straight from its address. A file the user
 * uploaded has no quality menu: Flow downloads it as it is, which is accepted unless a quality was asked for.
 */
export async function downloadMedia(
  page: Page,
  project: { id: string; name: string },
  mediaId: string,
  options: { upscale: Upscale | undefined; outDir: string },
): Promise<{ path: string; type: JobType }> {
  await page.goto(mediaUrl(project.id, mediaId), { waitUntil: "domcontentloaded" });
  try {
    return await saveMedia(page, project, mediaId, options);
  } finally {
    await leaveViewer(page);
  }
}

async function saveMedia(
  page: Page,
  project: { id: string; name: string },
  mediaId: string,
  options: { upscale: Upscale | undefined; outDir: string },
): Promise<{ path: string; type: JobType }> {
  const button = selectors.downloadMediaButton.locate(page).first();
  const shown = await button.waitFor({ state: "visible", timeout: 30000 }).then(
    () => true,
    () => false,
  );
  if (!shown) {
    throw new FlowPilotError("media_not_found", "flow.download.mediaNotFound", {
      id: mediaId,
      project: project.name,
    });
  }
  fs.mkdirSync(options.outDir, { recursive: true });
  const basePath = path.join(options.outDir, mediaBaseName(project.name, mediaId));
  const direct = page.waitForEvent("download", { timeout: 15000 });
  direct.catch(() => undefined);
  await clickRobust(button);
  const menu = await tierItem(page, TIER_ITEM_RE)
    .first()
    .waitFor({ state: "visible", timeout: 5000 })
    .then(
      () => true,
      () => false,
    );
  if (menu) {
    // A video's tiers are named by height (720p, 1080p), an image's by size (1K, 2K).
    const video = (await tierItem(page, VIDEO_TIER_RE).count()) > 0;
    const type: JobType = video ? "video" : "image";
    const file = await saveTier(page, tierPattern(options.upscale), basePath, type);
    return { path: assertSaved(file), type };
  }
  const download = await direct.catch(() => {
    throw new FlowPilotError("download_failed", "flow.download.noSource");
  });
  if (options.upscale !== undefined && options.upscale !== "original") {
    throw new FlowPilotError("upscale_unavailable", "flow.download.upscaleUnavailable", {
      quality: options.upscale,
      url: page.url(),
    });
  }
  const ext = path.extname(download.suggestedFilename()) || ".png";
  const file = basePath + ext;
  await download.saveAs(file);
  return { path: assertSaved(file), type: VIDEO_EXT_RE.test(ext) ? "video" : "image" };
}

/** Writes `<jobId>-<n>.json` next to the downloaded result. */
export function writeSummary(
  resultPath: string,
  summary: { jobId: string; request: JobRequest; model: string; cost: number; flowUrl: string },
): void {
  const base = path.join(
    path.dirname(resultPath),
    path.basename(resultPath, path.extname(resultPath)),
  );
  const body = { ...summary, downloadedAt: new Date().toISOString() };
  fs.writeFileSync(`${base}.json`, JSON.stringify(body, null, 2));
}
