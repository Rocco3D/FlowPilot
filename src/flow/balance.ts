import type { Page } from "playwright-core";
import { FlowPilotError } from "../core/errors.js";
import { clickRobust } from "./overlays.js";
import { BALANCE_RE, selectors } from "./selectors.js";

/** Credits from "640 Google Flow credits"; thousands separators are allowed. */
export function parseBalance(text: string): number | undefined {
  const digits = BALANCE_RE.exec(text)?.[1];
  return digits ? Number(digits.replace(/[.,]/g, "")) : undefined;
}

/** Opens Flow's account panel, reads the credit balance and closes the panel. */
export async function readBalance(page: Page): Promise<number> {
  const account = selectors.accountButton.locate(page);
  // Right after Chrome starts, the page header is not rendered yet.
  await account.first().waitFor({ state: "visible", timeout: 20000 });
  await clickRobust(account);
  try {
    const text = await selectors.creditsDisplay
      .locate(page)
      .first()
      .textContent({ timeout: 5000 })
      .catch(() => null);
    const credits = parseBalance(text ?? "");
    if (credits === undefined) {
      throw new FlowPilotError("balance_unreadable", "flow.balance.unreadable");
    }
    return credits;
  } finally {
    await clickRobust(selectors.accountPanelClose.locate(page)).catch(() => undefined);
  }
}
