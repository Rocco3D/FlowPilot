import type { Page } from "playwright-core";
import { FlowPilotError } from "../core/errors.js";
import { clickRobust } from "./overlays.js";
import { HOME_URL, PROJECT_LINK_CSS, PROJECT_PATH_RE, selectors } from "./selectors.js";

export interface ProjectRef {
  id: string;
  name: string;
}

interface ProjectCard extends ProjectRef {
  href: string;
}

/** Extracts the project id from a (possibly root-relative) href, resolved against `base`. */
export function projectIdFromHref(href: string, base: string): string | undefined {
  try {
    return PROJECT_PATH_RE.exec(new URL(href, base).pathname)?.[1];
  } catch {
    return undefined;
  }
}

export async function openHome(page: Page): Promise<void> {
  await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });
  // Either the signed-in home, a project, or a sign-in wall; a timeout is not an error here.
  await selectors.newProjectButton
    .locate(page)
    .or(selectors.promptBox.locate(page))
    .or(selectors.signInButton.locate(page))
    .first()
    .waitFor({ state: "visible", timeout: 20000 })
    .catch(() => undefined);
}

/** Signed in when the home shows "New project" or a project shows the prompt box. */
export async function isSignedIn(page: Page): Promise<boolean> {
  if (/accounts\.google\.com/.test(page.url())) return false;
  for (const def of [selectors.newProjectButton, selectors.promptBox]) {
    if (
      await def
        .locate(page)
        .first()
        .isVisible()
        .catch(() => false)
    )
      return true;
  }
  return false;
}

async function readCards(page: Page): Promise<ProjectCard[]> {
  const links = selectors.projectLinks.locate(page);
  await links
    .first()
    .waitFor({ state: "visible", timeout: 15000 })
    .catch(() => undefined);
  await selectors.loadingIndicator
    .locate(page)
    .first()
    .waitFor({ state: "hidden", timeout: 5000 })
    .catch(() => undefined);
  const raw = await links.evaluateAll(
    (anchors, linkCss) =>
      anchors.map((a) => {
        // Climb to the largest ancestor that still holds only this card's link.
        let card: Element = a;
        while (card.parentElement && card.parentElement.querySelectorAll(linkCss).length === 1) {
          card = card.parentElement;
        }
        return {
          href: a.getAttribute("href") ?? "",
          name: (card.textContent ?? "").replace(/\s+/g, " ").trim(),
        };
      }),
    PROJECT_LINK_CSS,
  );
  const seen = new Set<string>();
  const cards: ProjectCard[] = [];
  for (const { href, name } of raw) {
    const id = projectIdFromHref(href, page.url());
    if (id && !seen.has(id)) {
      seen.add(id);
      cards.push({ id, name, href });
    }
  }
  return cards;
}

/** Lists the projects shown on the current page (call after `openHome`). */
export async function listProjects(page: Page): Promise<ProjectRef[]> {
  return (await readCards(page)).map(({ id, name }) => ({ id, name }));
}

async function waitForProject(page: Page): Promise<string> {
  await page.waitForURL(PROJECT_PATH_RE, { timeout: 20000 }).catch(() => undefined);
  await selectors.promptBox
    .locate(page)
    .first()
    .waitFor({ state: "visible", timeout: 20000 })
    .catch(() => undefined);
  const id = projectIdFromHref(page.url(), page.url());
  if (!id) throw new FlowPilotError("project_not_opened", "flow.nav.projectNotOpened");
  return id;
}

/** Opens a project by id or name (exact, case-insensitive, then substring); returns its id. */
export async function openProject(page: Page, nameOrId: string): Promise<string> {
  await openHome(page);
  const cards = await readCards(page);
  const wanted = nameOrId.trim().toLowerCase();
  const card =
    cards.find((c) => c.id === nameOrId.trim()) ??
    cards.find((c) => c.name.toLowerCase() === wanted) ??
    cards.find((c) => c.name.toLowerCase().includes(wanted));
  if (!card) {
    throw new FlowPilotError("project_not_found", "flow.nav.projectNotFound", {
      project: nameOrId,
    });
  }
  await page.goto(new URL(card.href, page.url()).toString(), { waitUntil: "domcontentloaded" });
  return waitForProject(page);
}

/** Creates a project from the home page and returns its id. */
export async function createProject(page: Page): Promise<string> {
  await clickRobust(selectors.newProjectButton.locate(page));
  return waitForProject(page);
}
