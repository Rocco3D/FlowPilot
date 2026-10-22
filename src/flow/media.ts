import type { Page } from "playwright-core";
import { FlowPilotError } from "../core/errors.js";
import type { MediaInfo } from "../core/schemas.js";
import { leaveViewer } from "./download.js";
import { clickRobust } from "./overlays.js";
import { EDIT_PATH_RE, GRID_MEDIA_CSS, RAIL_THUMBNAIL_CSS, selectors } from "./selectors.js";

/**
 * Lists the media of the open project. The grid unmounts what scrolls out of view and gives no id for videos, so
 * the list walks the viewer's thumbnail rail instead, one thumbnail after the other: each opens its media, whose id is
 * in the address, and the viewer's controls tell a video ("Save frame") from an image (cropping).
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
  const seen = new Set<string>();
  for (;;) {
    // The viewer swaps its controls, and the rail its thumbnails, a moment after the address changes.
    await page.waitForTimeout(1500);
    // Without either control the media still counts: a missing "Save frame" means an image.
    await control.waitFor({ state: "visible", timeout: 10000 }).catch(() => undefined);
    const id = EDIT_PATH_RE.exec(page.url())?.[1];
    if (!id || seen.has(id)) break;
    seen.add(id);
    const current = await thumbs.evaluateAll((els) =>
      els.findIndex((el) => el.getAttribute("aria-current") === "true"),
    );
    media.push({
      id,
      type: (await video.isVisible()) ? "video" : "image",
      title: current >= 0 ? ((await thumbs.nth(current).getAttribute("aria-label")) ?? "") : "",
    });
    // The rail holds only the thumbnails around the current one: the next media is always the next thumbnail.
    if (current < 0 || current + 1 >= (await thumbs.count())) break;
    const before = page.url();
    await thumbs.nth(current + 1).click();
    await page.waitForURL((url) => url.href !== before, { timeout: 10000 });
  }
  return media;
}
