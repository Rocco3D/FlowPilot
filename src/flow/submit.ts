import type { Page } from "playwright-core";
import { FlowPilotError } from "../core/errors.js";
import { clickRobust } from "./overlays.js";
import { selectors } from "./selectors.js";

const READY_TIMEOUT_MS = 15000;

/** Clicks "Start generation" once it is enabled. */
export async function submitGeneration(page: Page): Promise<void> {
  const button = selectors.submitButton.locate(page);
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (
    !(await button
      .first()
      .isEnabled()
      .catch(() => false))
  ) {
    if (Date.now() > deadline) {
      throw new FlowPilotError("submit_not_ready", "flow.gen.submitNotReady");
    }
    await page.waitForTimeout(500);
  }
  await clickRobust(button);
}
