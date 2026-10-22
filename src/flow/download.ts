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
  tierItem,
  videoTileAt,
} from "./selectors.js";

export interface DownloadedResult {
  path: string;
  mediaId?: string;
}

export const resultBaseName = (jobId: string, n: number) => `${jobId}-${n}`;

/**
 * The tiers to try, best first. Left out, the best the user's plan offers: 4K, then the 1080p/2K upscale, else the
 * original. A quality asked for is the only one tried.
 */
export const tierPatterns = (upscale: Upscale | undefined): RegExp[] =>
  upscale ? [TIER_RE[upscale]] : [TIER_RE["4k"], TIER_RE["1080p"], TIER_RE.original];

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

/**
 * Picks the menu item of the first tier the user can download; items asking for a plan upgrade or disabled by Flow
 * are never picked.
 */
export function chooseTier(items: TierItem[], tiers: RegExp[]): TierChoice {
  for (const tier of tiers) {
    const index = items.findIndex(
      (item) => tier.test(item.label) && !item.disabled && !GATED_TIER_RE.test(item.label),
    );
    if (index >= 0) return { kind: "pick", index };
  }
  const offered = items.some((item) => tiers.some((tier) => tier.test(item.label)));
  return offered ? { kind: "locked" } : { kind: "none" };
}

export function extensionFor(type: JobType, contentType: string | undefined): string {
  if (contentType?.includes("jpeg")) return ".jpg";
  if (contentType?.includes("png")) return ".png";
  if (contentType?.includes("webp")) return ".webp";
  if (contentType?.includes("mp4") || contentType?.includes("video")) return ".mp4";
  return type === "video" ? ".mp4" : ".png";
}

async function openViewer(page: Page, item: ResultItem): Promise<string> {
  // A video's thumbnail address changes after a while; its tile, found by position too, does not.
  const media = resultMedia(page, item);
  const target = (await media.count()) > 0 ? media : (await findTile(page, item)).locator("img");
  await clickRobust(target.first());
  await page.waitForURL(EDIT_PATH_RE, { timeout: 15000 }).catch(() => {
    throw new FlowPilotError("viewer_not_opened", "flow.download.viewerNotOpened");
  });
  return EDIT_PATH_RE.exec(page.url())?.[1] ?? item.id;
}

/** Selects the best tier item of the open download menu and saves the file the browser downloads. */
async function saveTier(
  page: Page,
  upscale: Upscale | undefined,
  basePath: string,
  type: JobType,
): Promise<string> {
  const items = tierItem(page, TIER_ITEM_RE);
  await items.first().waitFor({ state: "visible", timeout: 5000 });
  const choice = chooseTier(
    await items.evaluateAll((els) =>
      els.map((el) => ({
        label: el.textContent ?? "",
        disabled: el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true",
      })),
    ),
    tierPatterns(upscale),
  );
  if (choice.kind === "locked") {
    throw new FlowPilotError("download_tier_locked", "flow.download.tierLocked");
  }
  if (choice.kind === "none" && upscale !== undefined) {
    throw new FlowPilotError("upscale_unavailable", "flow.download.upscaleUnavailable", {
      quality: upscale,
      url: page.url(),
    });
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
  const matches = tileByResult(page, item);
  // A video matches its flow-video-tile and the container around it; its buttons are reached only from the tile.
  const video = matches.and(page.locator("flow-video-tile"));
  let tile = (await video.count()) > 0 ? video.first() : matches.first();
  if ((await tile.count()) === 0) {
    if (item.tileIndex === undefined) {
      throw new FlowPilotError("download_no_source", "flow.download.noSource");
    }
    tile = videoTileAt(page, item.tileIndex);
  }
  return tile;
}

/** Downloads one result from Flow's viewer at the requested tier and leaves the viewer. */
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
  try {
    await leaveViewer(page);
    // Clicked on the grid: opened from its address right after the generation, Flow keeps "Download media" disabled.
    const mediaId = await openViewer(page, item);
    if (!(await viewerShown(page))) {
      throw new FlowPilotError("viewer_not_opened", "flow.download.viewerNotOpened");
    }
    const file = await saveFromViewer(page, basePath, options.upscale);
    return { path: file.path, mediaId };
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
    if (!(await viewerShown(page))) {
      throw new FlowPilotError("media_not_found", "flow.download.mediaNotFound", {
        id: mediaId,
        project: project.name,
      });
    }
    fs.mkdirSync(options.outDir, { recursive: true });
    const basePath = path.join(options.outDir, mediaBaseName(project.name, mediaId));
    return await saveFromViewer(page, basePath, options.upscale);
  } finally {
    await leaveViewer(page);
  }
}

/** Whether the viewer shows its "Download media" button. */
const viewerShown = (page: Page) =>
  selectors.downloadMediaButton
    .locate(page)
    .first()
    .waitFor({ state: "visible", timeout: 30000 })
    .then(
      () => true,
      () => false,
    );

/** Saves the media open in the viewer from its "Download media" button, at the best tier allowed. */
async function saveFromViewer(
  page: Page,
  basePath: string,
  upscale: Upscale | undefined,
): Promise<{ path: string; type: JobType }> {
  const direct = page.waitForEvent("download", { timeout: 15000 });
  direct.catch(() => undefined);
  await clickRobust(selectors.downloadMediaButton.locate(page).first());
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
    const file = await saveTier(page, upscale, basePath, type);
    return { path: assertSaved(file), type };
  }
  const download = await direct.catch(() => {
    throw new FlowPilotError("download_failed", "flow.download.noSource");
  });
  if (upscale !== undefined && upscale !== "original") {
    throw new FlowPilotError("upscale_unavailable", "flow.download.upscaleUnavailable", {
      quality: upscale,
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
