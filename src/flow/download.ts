import fs from "node:fs";
import path from "node:path";
import type { Page } from "playwright-core";
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
  tierItem,
} from "./selectors.js";

export interface DownloadedResult {
  path: string;
  mediaId?: string;
}

export const resultBaseName = (jobId: string, n: number) => `${jobId}-${n}`;

export const tierPattern = (upscale: JobRequest["upscale"]): RegExp =>
  TIER_RE[upscale ?? "original"];

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

async function downloadViaMenu(
  page: Page,
  tier: RegExp,
  basePath: string,
  type: JobType,
): Promise<string> {
  await clickRobust(selectors.moreOptionsButton.locate(page));
  await clickRobust(selectors.downloadMediaItem.locate(page));
  const item = tierItem(page, tier).first();
  await item.waitFor({ state: "visible", timeout: 5000 });
  if (GATED_TIER_RE.test((await item.textContent()) ?? "")) {
    throw new FlowPilotError("download_tier_locked", "flow.download.tierLocked");
  }
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 180000 }),
    clickRobust(item),
  ]);
  const ext = path.extname(download.suggestedFilename()) || extensionFor(type, undefined);
  await download.saveAs(basePath + ext);
  return basePath + ext;
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

/** Hovers the result's tile on the grid and returns the src of the video Flow mounts in it. */
async function videoSrcFromTile(page: Page, item: ResultItem): Promise<string> {
  await leaveViewer(page);
  const tiles = page.locator("flow-video-tile");
  // Match by thumbnail src; if Flow re-rendered it, fall back to the tile position at detection.
  let tile = tiles.filter({ has: page.locator(`img[src=${JSON.stringify(item.src)}]`) }).first();
  if ((await tile.count()) === 0 && item.tileIndex !== undefined) tile = tiles.nth(item.tileIndex);
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
  let mediaId = item.id;
  let opened = true;
  try {
    mediaId = await openViewer(page, item);
  } catch (error) {
    // A video can still be fetched from its grid tile when the viewer cannot be opened.
    if (options.type !== "video") throw error;
    opened = false;
  }
  try {
    let file: string;
    try {
      if (!opened) throw new FlowPilotError("viewer_not_opened", "flow.download.viewerNotOpened");
      file = await downloadViaMenu(page, tierPattern(options.upscale), basePath, options.type);
    } catch (error) {
      if (error instanceof FlowPilotError && error.code === "download_tier_locked") throw error;
      await dismissOverlays(page);
      file = await downloadViaFetch(page, item, options.type, basePath);
    }
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
