import type { Locator, Page } from "playwright-core";
import { selectors } from "./selectors.js";

/**
 * Real (trusted) click. When the normal click times out (minimized window throttles
 * Playwright's actionability wait) it falls back to a forced click.
 */
export async function clickRobust(target: Locator): Promise<void> {
  await target
    .first()
    .click({ timeout: 4000 })
    .catch(() => target.first().click({ force: true, timeout: 2000 }));
}

/** Closes Radix layers with Escape and Angular CDK overlays by clicking their backdrop. */
export async function dismissOverlays(page: Page): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    if (
      !(await selectors.radixLayer
        .locate(page)
        .first()
        .isVisible()
        .catch(() => false))
    )
      break;
    await page.keyboard.press("Escape").catch(() => undefined);
    await page.waitForTimeout(250);
  }
  for (let i = 0; i < 3; i += 1) {
    const backdrop = selectors.cdkBackdrop.locate(page).last();
    if (!(await backdrop.isVisible().catch(() => false))) return;
    await backdrop.click({ force: true, position: { x: 1, y: 1 } }).catch(() => undefined);
    await page.waitForTimeout(300);
  }
}
