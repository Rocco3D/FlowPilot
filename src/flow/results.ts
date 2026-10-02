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
} from "./selectors.js";

export interface ResultItem {
  src: string;
  id: string;
}

export interface ResultsSnapshot {
  ids: Set<string>;
  failures: Set<string>;
}

const POLL_MS = 1500;
const DEFAULT_TIMEOUT_MS = { video: 30 * 60_000, image: 15 * 60_000 } as const;

const idFromSrc = (src: string) =>
  FLOW_IMAGE_RE.exec(src)?.[1] ?? LEGACY_NAME_RE.exec(src)?.[1] ?? src;

/**
 * Tells which kind of result an `img` src is. A finished video is the thumbnail inside a
 * `flow-video-tile`; an image is a Flow image outside any tile (legacy redirect URLs
 * without a thumbnail marker also count).
 */
export function classifyResultSrc(src: string, inVideoTile: boolean): JobType | undefined {
  if (inVideoTile) return FLOW_IMAGE_RE.test(src) ? "video" : undefined;
  if (FLOW_IMAGE_RE.test(src)) return "image";
  if (LEGACY_MEDIA_RE.test(src) && !/mediaUrlType=/.test(src)) return "image";
  return undefined;
}

/** Maps banner text to the first matching failure. */
export function classifyFailure(text: string): { code: string; key: string } | undefined {
  const hit = FAILURE_PATTERNS.find((p) => p.re.test(text));
  return hit && { code: hit.code, key: hit.key };
}

async function readResults(page: Page, type: JobType): Promise<ResultItem[]> {
  const imgs = await page.evaluate(() =>
    [...document.querySelectorAll("img")].map((img) => ({
      src: img.src,
      inTile: img.closest("flow-video-tile") !== null,
    })),
  );
  const seen = new Set<string>();
  const items: ResultItem[] = [];
  for (const { src, inTile } of imgs) {
    if (classifyResultSrc(src, inTile) !== type) continue;
    const id = idFromSrc(src);
    if (!seen.has(id)) {
      seen.add(id);
      items.push({ src, id });
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
            hasResult = card.querySelector('img[src*="flow-content.google"]') !== null;
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

/** Polls until `count` new results appear; throws on a failure banner or timeout. */
export async function waitForResults(
  page: Page,
  type: JobType,
  before: ResultsSnapshot,
  count: number,
  timeoutMs: number = DEFAULT_TIMEOUT_MS[type],
): Promise<ResultItem[]> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const fresh = (await readResults(page, type)).filter((r) => !before.ids.has(r.id));
    if (fresh.length >= count) return fresh.slice(0, count);
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
