import type { Page } from "playwright-core";
import type { SelftestReport } from "../core/schemas.js";
import { createProject, isSignedIn, listProjects, openHome, openProject } from "./navigation.js";
import { dismissOverlays } from "./overlays.js";
import { PROJECT_PAGE_SELECTORS, frameSlot, selectors, type SelectorDef } from "./selectors.js";
import { ensureClassicComposer } from "./settings-apply.js";
import { openModelMenu, openSettings, parseCredits, readModelMenu } from "./settings-read.js";

type Check = SelftestReport["checks"][number];

async function check(
  checks: Check[],
  name: string,
  fn: () => Promise<string | undefined>,
): Promise<boolean> {
  try {
    checks.push({ name, ok: true, detail: await fn() });
    return true;
  } catch (error) {
    checks.push({
      name,
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

const report = (checks: Check[]): SelftestReport => ({
  ok: checks.every((c) => c.ok),
  checks,
});

/** Verifies that the Flow UI still matches the selectors. Reads and opens menus only. */
export async function runSelftest(page: Page): Promise<SelftestReport> {
  const checks: Check[] = [];

  await openHome(page);
  const signedIn = await check(checks, "signed-in", async () => {
    if (!(await isSignedIn(page))) throw new Error("No New project button or prompt box visible");
    return undefined;
  });
  if (!signedIn) return report(checks);

  const opened = await check(checks, "project", async () => {
    const projects = await listProjects(page);
    const first = projects[0];
    if (!first) return `created project ${await createProject(page)}`;
    return `opened project ${await openProject(page, first.id)}`;
  });
  if (!opened) return report(checks);

  // The composer renders after the project page loads; checking too early gives false failures.
  await selectors.promptBox
    .locate(page)
    .first()
    .waitFor({ state: "visible", timeout: 15000 })
    .catch(() => undefined);

  await check(checks, "agent-mode-off", async () => {
    await ensureClassicComposer(page);
    return undefined;
  });

  const waitVisible = async (def: SelectorDef) => {
    try {
      await def.locate(page).first().waitFor({ state: "visible", timeout: 5000 });
    } catch {
      throw new Error(`Not found: ${def.describe}`);
    }
    return def.describe;
  };

  for (const key of PROJECT_PAGE_SELECTORS) {
    await check(checks, `selector:${key}`, () => waitVisible(selectors[key]));
  }

  // Frames mode shows the Start/End slots instead of the add-ingredients button.
  await check(checks, "references-entry", async () => {
    const ingredients = selectors.addIngredientsButton.locate(page).first();
    const start = frameSlot(page, "Start").first();
    try {
      await ingredients.or(start).first().waitFor({ state: "visible", timeout: 5000 });
    } catch {
      throw new Error(
        `Not found: ${selectors.addIngredientsButton.describe}, nor the "Start" frame slot`,
      );
    }
    return (await ingredients.isVisible()) ? "add-ingredients button" : "Start frame slot";
  });

  await check(checks, "settings-popover", async () => {
    await openSettings(page);
    const chips = await selectors.outputChips.locate(page).count();
    if (chips === 0) throw new Error(`Not found: ${selectors.outputChips.describe}`);
    const modes = await selectors.modeButtons.locate(page).count();
    if (modes === 0) throw new Error(`Not found: ${selectors.modeButtons.describe}`);
    return `${chips} output chips, ${modes} mode buttons`;
  });

  await check(checks, "credit-line", async () => {
    const text = await selectors.creditLine.locate(page).first().textContent({ timeout: 3000 });
    const credits = parseCredits(text ?? "");
    if (credits === undefined) throw new Error(`Unreadable credit line: ${text}`);
    return `${credits} credits`;
  });

  await check(checks, "model-menu", async () => {
    await openModelMenu(page);
    const models = await readModelMenu(page);
    if (models.length === 0) throw new Error(`Not found: ${selectors.modelMenuItems.describe}`);
    return models.map((m) => m.name).join(", ");
  });

  await dismissOverlays(page);
  await check(checks, "overlays-closed", async () => {
    if (await selectors.radixLayer.locate(page).first().isVisible()) {
      throw new Error("A Radix layer is still open after dismissOverlays");
    }
    return undefined;
  });

  return report(checks);
}
