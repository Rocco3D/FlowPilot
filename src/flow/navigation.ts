import type { Page } from "playwright-core";
import { FlowPilotError } from "../core/errors.js";
import { clickRobust } from "./overlays.js";
import { pickProject } from "../core/projects.js";
import {
  HOME_URL,
  PROJECT_LINK_CSS,
  PROJECT_PATH_RE,
  projectDeleteButton,
  projectDeleteConfirm,
  selectors,
} from "./selectors.js";

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
  const failed = selectors.projectsError.locate(page);
  // Flow sometimes fails to load the grid, for example right after a deletion: an empty grid then means nothing.
  for (let attempt = 0; ; attempt += 1) {
    await links
      .first()
      .or(failed.first())
      .waitFor({ state: "visible", timeout: 15000 })
      .catch(() => undefined);
    if (
      !(await failed
        .first()
        .isVisible()
        .catch(() => false))
    )
      break;
    if (attempt === 2)
      throw new FlowPilotError("projects_unavailable", "flow.nav.projectsUnavailable");
    await openHome(page);
  }
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
        // The name is the card's first line: the edit and delete icons follow it with their own text.
        const name = (card as HTMLElement).innerText
          .split("\n")
          .map((line) => line.trim())
          .find(Boolean);
        return { href: a.getAttribute("href") ?? "", name: name ?? "" };
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

/**
 * Deletes the project `ref` names (its id or exact name) from the home, confirming Flow's dialog, and checks that its
 * card left the page.
 */
export async function deleteProject(page: Page, ref: string): Promise<ProjectRef> {
  // The CLI has just listed the projects: a home already open is not loaded again.
  if (
    new URL(page.url()).pathname !== "/" ||
    !/flow\.google\.com$/.test(new URL(page.url()).hostname)
  ) {
    await openHome(page);
  }
  const target = pickProject(await listProjects(page), ref);
  await clickRobust(projectDeleteButton(page, target.id));
  await clickRobust(projectDeleteConfirm(page));
  // Flow drops the card from the open home; reloading it right away makes Flow fail to load the grid.
  const gone = await page
    .locator(`a[href*="/project/${target.id}"]`)
    .first()
    .waitFor({ state: "hidden", timeout: 15000 })
    .then(
      () => true,
      () => false,
    );
  if (!gone) {
    throw new FlowPilotError("project_not_deleted", "flow.nav.projectNotDeleted", {
      name: target.name,
    });
  }
  return target;
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

/** Opens a project by id or name (exact, case-insensitive, then substring); returns its id and name. */
export async function openProject(page: Page, nameOrId: string): Promise<ProjectRef> {
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
  return { id: await waitForProject(page), name: card.name };
}

/** Creates a project from the home page and returns its id; with `name`, renames it from Flow's default. */
export async function createProject(page: Page, name?: string): Promise<string> {
  await clickRobust(selectors.newProjectButton.locate(page));
  const id = await waitForProject(page);
  if (name !== undefined) {
    const title = selectors.projectTitle.locate(page).first();
    await title.fill(name);
    await title.press("Enter");
    // Flow puts the saved name in the tab title.
    const saved = await page
      .waitForFunction((wanted) => document.title.endsWith(` - ${wanted}`), name, {
        timeout: 10000,
      })
      .then(
        () => true,
        () => false,
      );
    if (!saved)
      throw new FlowPilotError("project_not_renamed", "flow.nav.projectNotRenamed", { name });
  }
  return id;
}
