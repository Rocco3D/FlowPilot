import type { Page } from "playwright-core";
import { FlowPilotError } from "../core/errors.js";
import { clickRobust } from "./overlays.js";
import { selectors } from "./selectors.js";

/** Splits a prompt into lines; a newline must never submit the prompt. */
export function splitPrompt(text: string): string[] {
  return text.split(/\r?\n/);
}

/** Replaces the prompt box content with `text`, using Shift+Enter between lines. */
export async function fillPrompt(page: Page, text: string): Promise<void> {
  const box = selectors.promptBox.locate(page);
  await clickRobust(box);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  for (const [i, line] of splitPrompt(text).entries()) {
    if (i > 0) await page.keyboard.press("Shift+Enter");
    if (line) await page.keyboard.insertText(line);
  }
  if (!((await box.first().textContent()) ?? "").trim()) {
    throw new FlowPilotError("prompt_not_set", "flow.gen.promptNotSet");
  }
}
