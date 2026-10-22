import type { Page } from "playwright-core";
import { FlowPilotError } from "../core/errors.js";
import type { MediaInfo } from "../core/schemas.js";
import { leaveViewer } from "./download.js";
import { clickRobust } from "./overlays.js";
import { EDIT_PATH_RE, GRID_MEDIA_CSS, RAIL_THUMBNAIL_CSS, selectors } from "./selectors.js";

/**
 * Lists the media of the open project. The grid unmounts what scrolls out of view and gives no id for videos, so
 * the list walks the viewer's thumbnail rail instead: each thumbnail opens its media, whose id is in the address,
 * and the viewer's controls tell a video ("Save frame") from an image (cropping).
 */
export async function listMedia(page: Page): Promise<MediaInfo[]> {
  const first = page.locator(GRID_MEDIA_CSS).first();
  const any = await first.waitFor({ state: "visible", timeout: 20000 }).then(
    () => true,
    () => false,
  );
  if (!any) return [];
  await clickRobust(first);
  try {
    return await walkRail(page);
  } finally {
    await leaveViewer(page);
  }
}

async function walkRail(page: Page): Promise<MediaInfo[]> {
  await page.waitForURL(EDIT_PATH_RE, { timeout: 15000 }).catch(() => {
    throw new FlowPilotError("viewer_not_opened", "flow.download.viewerNotOpened");
  });
  const thumbs = page.locator(RAIL_THUMBNAIL_CSS);
  await thumbs.first().waitFor({ state: "visible", timeout: 15000 });
  const video = selectors.saveFrameButton.locate(page);
  const control = video.or(selectors.imageCropButton.locate(page)).first();
  const media: MediaInfo[] = [];
  const count = await thumbs.count();
  for (let i = 0; i < count; i += 1) {
    const thumb = thumbs.nth(i);
    if ((await thumb.getAttribute("aria-current")) !== "true") {
      const before = page.url();
      await thumb.click();
      await page.waitForURL((url) => url.href !== before, { timeout: 10000 });
    }
    // The viewer swaps its controls a moment after the address changes.
    await page.waitForTimeout(1500);
    await control.waitFor({ state: "visible", timeout: 10000 });
    const id = EDIT_PATH_RE.exec(page.url())?.[1];
    if (!id) continue;
    media.push({
      id,
      type: (await video.isVisible()) ? "video" : "image",
      title: (await thumb.getAttribute("aria-label")) ?? "",
    });
  }
  return media;
}
