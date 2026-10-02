import type { Page } from "playwright-core";
import { FlowPilotError } from "../core/errors.js";
import { clickRobust } from "./overlays.js";
import { selectors } from "./selectors.js";

const MAX_REFERENCES = 10;

/** Removes every reference left attached by a previous job; fails if some cannot be removed. */
export async function removeAttachedReferences(page: Page): Promise<void> {
  const chips = selectors.ingredientChips.locate(page);
  for (let i = 0; i < MAX_REFERENCES; i += 1) {
    const count = await chips.count();
    if (count === 0) return;
    await clickRobust(chips);
    await chips
      .nth(count - 1)
      .waitFor({ state: "detached", timeout: 3000 })
      .catch(() => undefined);
  }
  if ((await chips.count()) > 0) {
    throw new FlowPilotError("references_not_cleared", "flow.gen.referencesNotCleared");
  }
}

/** Clears a prompt left by a previous job, when the "Clear prompt" button is present. */
export async function clearPrompt(page: Page): Promise<void> {
  const button = selectors.clearPromptButton.locate(page).first();
  if (await button.isVisible().catch(() => false)) await clickRobust(button);
}

/** Resets the composer to empty before a job. */
export async function clearComposer(page: Page): Promise<void> {
  await removeAttachedReferences(page);
  await clearPrompt(page);
}
