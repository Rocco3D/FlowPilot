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

async function downloadViaFetch(
  page: Page,
  item: ResultItem,
  type: JobType,
  basePath: string,
): Promise<string> {
  const src =
    type === "video"
      ? await page.evaluate(() => {
          const v = document.querySelector<HTMLVideoElement>("video.main-video");
          return v ? v.currentSrc || v.src : "";
        })
      : item.src;
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
  const mediaId = await openViewer(page, item);
  try {
    let file: string;
    try {
      file = await downloadViaMenu(page, tierPattern(options.upscale), basePath, options.type);
    } catch (error) {
      if (error instanceof FlowPilotError && error.code === "download_tier_locked") throw error;
      await dismissOverlays(page);
      file = await downloadViaFetch(page, item, options.type, basePath);
    }
    return { path: file, mediaId };
  } finally {
    await dismissOverlays(page);
    await clickRobust(selectors.backButton.locate(page)).catch(() => undefined);
    await page
      .waitForURL((url) => !EDIT_PATH_RE.test(url.pathname), { timeout: 10000 })
      .catch(() => undefined);
    await dismissOverlays(page);
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
