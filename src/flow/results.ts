import type { Page } from "playwright-core";
import { FlowPilotError } from "../core/errors.js";
import type { JobType } from "../core/schemas.js";
import {
  BANNER_ALERT_CSS,
  BANNER_EXCLUDED_CSS,
  FAILURE_PATTERNS,
  FLOW_IMAGE_RE,
  LEGACY_MEDIA_RE,
  LEGACY_NAME_RE,
  MIN_RESULT_IMAGE_WIDTH,
  RESULT_IMAGE_HOST_RE,
} from "./selectors.js";

export interface ResultItem {
  src: string;
  id: string;
  /** Position among the page's flow-video-tile elements when detected (videos only). */
  tileIndex?: number;
  /** Flow's stable media id, when the result image carries it. */
  mediaId?: string;
}

/** What the page tells about one `img` element. */
export interface ImgInfo {
  src: string;
  /** Flow's stable media id, null when the element has no `data-media-id`. */
  mediaId: string | null;
  inVideoTile: boolean;
  inPromptBox: boolean;
  /** Class "thumbnail" or an alt text mentioning a thumbnail. */
  thumbnail: boolean;
  width: number;
  tileIndex: number;
}

export interface ResultsSnapshot {
  ids: Set<string>;
  failures: Set<string>;
}

const POLL_MS = 1500;
const DEFAULT_TIMEOUT_MS = { video: 30 * 60_000, image: 15 * 60_000 } as const;

/** Short stable hash (djb2) for srcs that carry no media id. */
function hashSrc(src: string): string {
  let h = 5381;
  for (let i = 0; i < src.length; i += 1) h = ((h << 5) + h + src.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

/**
 * Identity of one result, in order of trust: the stable `data-media-id` attribute, then the id in
 * `/image/<id>` or `?name=<id>`, then a stable hash of the src.
 */
export const resultId = (mediaId: string | null, src: string): string => {
  const attr = mediaId?.trim();
  return (
    (attr ? attr : undefined) ??
    FLOW_IMAGE_RE.exec(src)?.[1] ??
    LEGACY_NAME_RE.exec(src)?.[1] ??
    hashSrc(src)
  );
};

/**
 * Tells which kind of result an `img` is, by structure. A finished video is the thumbnail inside
 * a `flow-video-tile`; an image is a large http(s) image of a Flow host (or a legacy redirect URL
 * without a thumbnail marker) outside the prompt box and outside any tile.
 */
export function classifyResultImg(img: ImgInfo): JobType | undefined {
  const { src } = img;
  if (!/^https?:\/\//i.test(src) || img.inPromptBox) return undefined;
  if (img.inVideoTile) return img.thumbnail || FLOW_IMAGE_RE.test(src) ? "video" : undefined;
  if (img.width < MIN_RESULT_IMAGE_WIDTH) return undefined;
  if (RESULT_IMAGE_HOST_RE.test(src)) return "image";
  if (LEGACY_MEDIA_RE.test(src) && !/mediaUrlType=/.test(src)) return "image";
  return undefined;
}

/** Maps banner text to the first matching failure. */
export function classifyFailure(text: string): { code: string; key: string } | undefined {
  const hit = FAILURE_PATTERNS.find((p) => p.re.test(text));
  return hit && { code: hit.code, key: hit.key };
}

async function readResults(page: Page, type: JobType): Promise<ResultItem[]> {
  // The position on the page reads the grid in the order it is shown.
  const imgs = await page.evaluate((): (ImgInfo & { top: number; left: number })[] => {
    const tiles = [...document.querySelectorAll("flow-video-tile")];
    return [...document.querySelectorAll("img")].map((img) => {
      const tile = img.closest("flow-video-tile");
      const rect = img.getBoundingClientRect();
      return {
        src: img.src,
        mediaId: img.getAttribute("data-media-id"),
        inVideoTile: tile !== null,
        inPromptBox: img.closest("flow-prompt-box") !== null,
        thumbnail: img.classList.contains("thumbnail") || /thumbnail/i.test(img.alt),
        width: rect.width,
        tileIndex: tile ? tiles.indexOf(tile) : -1,
        top: rect.top,
        left: rect.left,
      };
    });
  });
  // Grid order, newest first: row by row, left to right.
  imgs.sort((a, b) => Math.round(a.top) - Math.round(b.top) || a.left - b.left);
  const seen = new Set<string>();
  const items: ResultItem[] = [];
  for (const img of imgs) {
    if (classifyResultImg(img) !== type) continue;
    const id = resultId(img.mediaId, img.src);
    if (!seen.has(id)) {
      seen.add(id);
      items.push({
        src: img.src,
        id,
        ...(img.tileIndex >= 0 ? { tileIndex: img.tileIndex } : {}),
        ...(img.mediaId ? { mediaId: img.mediaId } : {}),
      });
    }
  }
  return items;
}

export interface TextChunk {
  text: string;
  excluded: boolean;
  alert: boolean;
}

/** Classifies page text, ignoring excluded chunks and preferring alert containers. */
export function classifyChunks(chunks: TextChunk[]): { code: string; key: string } | undefined {
  const usable = chunks.filter((c) => !c.excluded);
  const alerts = usable.filter((c) => c.alert);
  return classifyFailure((alerts.length > 0 ? alerts : usable).map((c) => c.text).join("\n"));
}

const readFailure = async (page: Page) =>
  classifyChunks(
    await page.evaluate(
      ({ excludedCss, alertCss }) => {
        const chunks: TextChunk[] = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const text = node.textContent?.trim();
          const el = node.parentElement;
          if (!text || !el) continue;
          // A card holding a result image echoes the prompt as a caption.
          let card: Element | null = el;
          let hasResult = false;
          for (let i = 0; i < 3 && card && !hasResult; i += 1, card = card.parentElement) {
            hasResult =
              card.querySelector('img[src*="flow-content.google"], flow-video-tile') !== null;
          }
          chunks.push({
            text,
            excluded: hasResult || el.closest(excludedCss) !== null,
            alert: el.closest(alertCss) !== null,
          });
        }
        return chunks;
      },
      { excludedCss: BANNER_EXCLUDED_CSS, alertCss: BANNER_ALERT_CSS },
    ),
  );

/** Records what is on the page before submitting, so only new results and banners count. */
export async function snapshotResults(page: Page, type: JobType): Promise<ResultsSnapshot> {
  const failure = await readFailure(page);
  return {
    ids: new Set((await readResults(page, type)).map((r) => r.id)),
    failures: new Set(failure ? [failure.code] : []),
  };
}

/**
 * Polls until the first `count` results of the grid are all new; throws on a failure banner or timeout. Only the top of
 * the grid counts: Flow shows new results first, and in a large project it draws only part of the grid, so an older
 * result it draws after the snapshot is not new.
 */
export async function waitForResults(
  page: Page,
  type: JobType,
  before: ResultsSnapshot,
  count: number,
  timeoutMs: number = DEFAULT_TIMEOUT_MS[type],
): Promise<ResultItem[]> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const top = (await readResults(page, type)).slice(0, count);
    if (top.length === count && top.every((r) => !before.ids.has(r.id))) return top;
    const failure = await readFailure(page);
    if (failure && !before.failures.has(failure.code)) {
      throw new FlowPilotError(failure.code, failure.key);
    }
    await page.waitForTimeout(POLL_MS);
  }
  throw new FlowPilotError("generation_timeout", "flow.gen.timeout", {
    minutes: Math.round(timeoutMs / 60_000),
  });
}
