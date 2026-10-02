import fs from "node:fs";
import path from "node:path";
import type { Locator, Page } from "playwright-core";
import { FlowPilotError } from "../core/errors.js";
import type { JobRequest, JobType } from "../core/schemas.js";
import { clickRobust, dismissOverlays } from "./overlays.js";
import type { ResultItem } from "./results.js";
import {
  EDIT_PATH_RE,
  GATED_TIER_RE,
  TIER_RE,
  resultImage,
  selectors,
  tileBySrc,
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

export const tierPattern = (upscale: JobRequest["upscale"]): RegExp =>
  TIER_RE[upscale ?? "original"];

/** Whether the direct fetch (original quality only) may be used when no menu path worked. */
export function assertFetchAllowed(upscale: JobRequest["upscale"], projectUrl: string): void {
  if (upscale === undefined) return;
  throw new FlowPilotError("upscale_unavailable", "flow.download.upscaleUnavailable", {
    quality: upscale,
    url: projectUrl,
  });
}

export type TierChoice = { kind: "pick"; index: number } | { kind: "locked" } | { kind: "none" };

/** Picks the menu label for the tier; items asking for a plan upgrade are never picked. */
export function chooseTier(labels: string[], tier: RegExp): TierChoice {
  const matching = labels.flatMap((label, index) => (tier.test(label) ? [{ label, index }] : []));
  const open = matching.find((m) => !GATED_TIER_RE.test(m.label));
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
  await clickRobust(resultImage(page, item.src));
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
  const choice = chooseTier(await items.allTextContents(), tier);
  if (choice.kind === "locked") {
    throw new FlowPilotError("download_tier_locked", "flow.download.tierLocked");
  }
  if (choice.kind === "none") {
    throw new FlowPilotError("download_failed", "flow.download.noSource");
  }
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 180000 }),
    clickRobust(items.nth(choice.index)),
  ]);
  const ext = path.extname(download.suggestedFilename()) || extensionFor(type, undefined);
  await download.saveAs(basePath + ext);
  return basePath + ext;
}

/** Viewer path (classic layout): "More options" > "Download media" > tier. */
async function downloadViaViewerMenu(
  page: Page,
  tier: RegExp,
  basePath: string,
  type: JobType,
): Promise<string> {
  await clickRobust(selectors.moreOptionsButton.locate(page));
  await clickRobust(selectors.downloadMediaItem.locate(page));
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
  await clickRobust(tileMoreOptions(tile));
  const download = tileDownloadItem(page);
  await download.first().waitFor({ state: "visible", timeout: 5000 });
  // The tier submenu opens on hover.
  await download.first().hover();
  return saveTier(page, tier, basePath, type);
}

/** Leaves the viewer (back to the project grid) if it is open. */
async function leaveViewer(page: Page): Promise<void> {
  await dismissOverlays(page);
  if (!EDIT_PATH_RE.test(page.url())) return;
  await clickRobust(selectors.backButton.locate(page)).catch(() => undefined);
  await page
    .waitForURL((url) => !EDIT_PATH_RE.test(url.pathname), { timeout: 10000 })
    .catch(() => undefined);
  await dismissOverlays(page);
}

/** Finds the result tile by thumbnail src; if Flow re-rendered it, by the recorded tile position. */
async function findTile(page: Page, item: ResultItem): Promise<Locator> {
  let tile = tileBySrc(page, item.src).first();
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
      return { path: file, mediaId };
    } catch (error) {
      if (error instanceof FlowPilotError && error.code === "download_tier_locked") throw error;
      await dismissOverlays(page);
    }
    // 2. Viewer "Download media" menu (classic layout).
    try {
      mediaId = await openViewer(page, item);
      const file = await downloadViaViewerMenu(page, tier, basePath, options.type);
      return { path: file, mediaId };
    } catch (error) {
      if (error instanceof FlowPilotError && error.code === "download_tier_locked") throw error;
      await dismissOverlays(page);
    }
    // 3. Direct fetch gives the original only: never a silent downgrade.
    assertFetchAllowed(options.upscale, projectUrl);
    const file = await downloadViaFetch(page, item, options.type, basePath);
    return { path: file, mediaId };
  } finally {
    await leaveViewer(page);
  }
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
