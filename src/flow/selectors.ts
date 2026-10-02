import type { Locator, Page } from "playwright-core";

/** The only place with Flow selectors and UI text patterns. */
export interface SelectorDef {
  /** Short developer description, used in self-test reports. */
  describe: string;
  locate(page: Page): Locator;
}

export const HOME_URL = "https://flow.google.com/?hl=en";

/** Ratio label -> Material icon name shown in the ratio buttons. */
export const RATIO_ICON: Record<string, string> = {
  "16:9": "crop_16_9",
  "9:16": "crop_9_16",
  "4:3": "crop_landscape",
  "1:1": "crop_square",
  "3:4": "crop_portrait",
};

export const CREDITS_RE = /use\s+(\d+)\s+credits?/i;
export const PROJECT_LINK_CSS = 'a[href*="/project/"]';
export const PROJECT_PATH_RE = /\/project\/([0-9a-f-]+)/i;
export const OUTPUT_CHIP_RE = /^x[1-4]$/;
export const RESOLUTION_CHIP_RE = /^\d{3,4}p$/;
export const DURATION_CHIP_RE = /^\d+s$/;
export const FLOW_IMAGE_RE = /flow-content\.google\/image\/([0-9a-f-]+)/i;
/** Media hosts of result images; video thumbnails are recognised by structure, not by host. */
export const RESULT_IMAGE_HOST_RE = /^https?:\/\/(flow-content\.google|flow\.google\.com)\//i;
/** Result images are large; avatars and icons are smaller than this (rendered width, px). */
export const MIN_RESULT_IMAGE_WIDTH = 120;
export const LEGACY_MEDIA_RE = /media\.getMediaUrlRedirect/;
export const LEGACY_NAME_RE = /[?&]name=([0-9a-f-]+)/i;
export const EDIT_PATH_RE = /\/edit\/([0-9a-f-]+)/i;
export const GATED_TIER_RE = /upgrade/i;

/** Failure banner text -> error code and i18n key, checked in order. */
export const FAILURE_PATTERNS: { code: string; key: string; re: RegExp }[] = [
  { code: "rate_limited", key: "flow.gen.rateLimited", re: /unusual activity|rate limit/i },
  {
    code: "credits_exhausted",
    key: "flow.gen.creditsExhausted",
    re: /run out of credits|insufficient credits/i,
  },
  {
    code: "generation_blocked",
    key: "flow.gen.blocked",
    re: /violates|content policy|can.?t help with/i,
  },
  {
    code: "generation_failed",
    key: "flow.gen.failed",
    re: /generation failed|couldn.?t generate|something went wrong/i,
  },
];

/** Page text that is user content or UI chrome, never a failure banner. */
export const BANNER_EXCLUDED_CSS =
  '[contenteditable], flow-video-tile, figure, figcaption, [data-radix-popper-content-wrapper], [role="menu"]';
/** Containers that carry failure messages when present. */
export const BANNER_ALERT_CSS =
  '[role="alert"], [role="status"], [aria-live]:not([aria-live="off"]), [class*="snackbar" i], [class*="toast" i]';

/** Download tier patterns: default original, then 1080p/2K and 4K upscales. */
export const TIER_RE = { original: /original/i, "1080p": /2K|1080p/i, "4k": /4K/i } as const;

export const SETTINGS_TRIGGER_LABEL = "Settings trigger";

const dialogOf = (page: Page) => page.getByRole("dialog", { name: /add assets/i });

const chip = (page: Page, text: RegExp) =>
  page.locator("button, [role=radio]").filter({ hasText: text });

export const selectors = {
  newProjectButton: {
    describe: 'Home button "New project"',
    locate: (page) => page.getByRole("button", { name: /new project/i }),
  },
  signInButton: {
    describe: 'Google "Sign in" button or link',
    locate: (page) =>
      page
        .getByRole("button", { name: /^sign in$/i })
        .or(page.getByRole("link", { name: /^sign in$/i })),
  },
  projectLinks: {
    describe: "Project cards on the home (links to /project/<id>)",
    locate: (page) => page.locator(PROJECT_LINK_CSS),
  },
  promptBox: {
    describe: "Prompt box (ProseMirror contenteditable)",
    locate: (page) =>
      page.locator(
        'div.ProseMirror[contenteditable="true"], [role="textbox"][contenteditable="true"]',
      ),
  },
  submitButton: {
    describe: 'Submit button named "Start generation"',
    locate: (page) => page.getByRole("button", { name: "Start generation", exact: true }),
  },
  backButton: {
    describe: 'Viewer "Back button"',
    locate: (page) => page.getByRole("button", { name: /back button/i }),
  },
  agentToggle: {
    describe: 'Composer button named exactly "Agent" (aria-pressed true when agent mode is on)',
    locate: (page) =>
      page.locator("flow-prompt-box").getByRole("button", { name: "Agent", exact: true }),
  },
  loadingIndicator: {
    describe: "Any progressbar (page or card loading)",
    locate: (page) => page.getByRole("progressbar"),
  },
  settingsTrigger: {
    describe: 'Settings pill with aria-label "Settings trigger"',
    locate: (page) => page.locator(`button[aria-label="${SETTINGS_TRIGGER_LABEL}"]`),
  },
  outputChips: {
    describe: "Output count radios x1..x4 in the settings popover",
    locate: (page) => page.locator("button[role=radio]").filter({ hasText: OUTPUT_CHIP_RE }),
  },
  modeButtons: {
    describe: "Image / Video mode buttons in the settings popover",
    locate: (page) => chip(page, /(Image|Video)$/),
  },
  creditLine: {
    describe: 'Line "Generating will use N credits"',
    locate: (page) => page.getByText(CREDITS_RE),
  },
  modelDropdown: {
    describe: "Model dropdown button (arrow_drop_down), not the settings trigger",
    locate: (page) =>
      page
        .locator(`button:not([aria-label="${SETTINGS_TRIGGER_LABEL}"])`)
        .filter({ hasText: /arrow_drop_down/ }),
  },
  modelMenuItems: {
    describe: "Items of the open model menu",
    locate: (page) => page.locator("[role=menuitem]"),
  },
  radixLayer: {
    describe: "Open Radix popper or menu layer",
    locate: (page) =>
      page.locator(
        "[data-radix-popper-content-wrapper]:visible, [data-radix-menu-content][data-state=open]:visible",
      ),
  },
  moreOptionsButton: {
    describe: 'Viewer button "More options"',
    locate: (page) => page.getByRole("button", { name: "More options", exact: true }),
  },
  downloadMediaItem: {
    describe: 'Menu item "Download media"',
    locate: (page) => page.locator("[role=menuitem]").filter({ hasText: /download media/i }),
  },
  addIngredientsButton: {
    describe: 'Prompt area button with aria-label "Add ingredients to the prompt box"',
    locate: (page) => page.locator('button[aria-label="Add ingredients to the prompt box"]'),
  },
  ingredientChips: {
    describe: 'Attached reference buttons named "...ingredient" inside flow-prompt-box',
    locate: (page) => page.locator("flow-prompt-box").getByRole("button", { name: /ingredient$/i }),
  },
  clearPromptButton: {
    describe: 'Prompt area button named "Clear prompt"',
    locate: (page) =>
      page.locator("flow-prompt-box").getByRole("button", { name: "Clear prompt", exact: true }),
  },
  mediaDialog: {
    describe: 'Dialog "Add assets to the project" (accessible name matches /add assets/i)',
    locate: (page) => dialogOf(page),
  },
  mediaDialogLoading: {
    describe: 'Progressbar "Loading�" inside the add assets dialog',
    locate: (page) => dialogOf(page).getByRole("progressbar"),
  },
  mediaDialogClose: {
    describe: 'Add assets dialog button "Close"',
    locate: (page) => dialogOf(page).getByRole("button", { name: "Close", exact: true }),
  },
  mediaDialogUpload: {
    describe: 'Add assets dialog button "Upload media"',
    locate: (page) => dialogOf(page).getByRole("button", { name: /upload media/i }),
  },
  mediaDialogSelected: {
    describe: "Selected tile in the add assets dialog (role option, aria-selected true)",
    locate: (page) => dialogOf(page).locator('[role=option][aria-selected="true"]'),
  },
  mediaDialogTiles: {
    describe: 'Assets of the dialog listbox "Asset list" (role option, name "<title> Image")',
    locate: (page) => dialogOf(page).getByRole("option"),
  },
  mediaDialogConfirm: {
    describe: 'Optional confirm button "Add to Prompt" (absent in the live UI)',
    locate: (page) =>
      dialogOf(page)
        .locator("button")
        .filter({ hasText: /add to (prompt|scene|project)/i }),
  },
  mediaDialogCategory: {
    describe: 'Dialog dropdown button "Filter by category" (text "All")',
    locate: (page) => dialogOf(page).getByRole("button", { name: /filter by category/i }),
  },
  mediaDialogCategoryOptions: {
    describe: "Options of the open category dropdown (menu items or options)",
    locate: (page) => page.locator("[role=menuitem], [role=menuitemradio], [role=option]"),
  },
  mediaDialogSearch: {
    describe: 'Add assets dialog textbox "Search assets"',
    locate: (page) => dialogOf(page).getByRole("textbox", { name: /search assets/i }),
  },
  rightsDialog: {
    describe: 'Dialog "Rights to use this image" shown after an upload',
    locate: (page) => page.getByRole("dialog", { name: /rights to use/i }),
  },
  rightsAgree: {
    describe: 'Rights dialog button "I agree"',
    locate: (page) =>
      page
        .getByRole("dialog", { name: /rights to use/i })
        .getByRole("button", { name: /i agree/i }),
  },
  rightsCancel: {
    describe: 'Rights dialog button "Cancel"',
    locate: (page) =>
      page.getByRole("dialog", { name: /rights to use/i }).getByRole("button", { name: /cancel/i }),
  },
  attachedReferences: {
    describe: "Flow images attached as references in the custom element flow-prompt-box",
    locate: (page) => page.locator('flow-prompt-box img[src*="flow-content.google/image/"]'),
  },
  cdkBackdrop: {
    describe: "Showing Angular CDK overlay backdrop",
    locate: (page) => page.locator(".cdk-overlay-backdrop-showing"),
  },
} satisfies Record<string, SelectorDef>;

/** Selectors that must exist on an open project page (popover closed). */
export const PROJECT_PAGE_SELECTORS = ["promptBox", "submitButton", "settingsTrigger"] as const;

export const modeButton = (page: Page, mode: "video" | "image") =>
  chip(page, mode === "video" ? /Video$/ : /Image$/);
export const ratioChip = (page: Page, ratio: string) =>
  chip(page, new RegExp(`^${RATIO_ICON[ratio]}`));
export const resolutionChips = (page: Page) => chip(page, RESOLUTION_CHIP_RE);
export const durationChips = (page: Page) => chip(page, DURATION_CHIP_RE);
export const outputChip = (page: Page, n: number) => chip(page, new RegExp(`^x${n}$`));

/**
 * Tile menu item "Download" (icon text + label), not "Download media" nor the hidden global
 * "Download project" item.
 */
export const DOWNLOAD_ITEM_RE = /^\s*(download\s*)?download\s*$/i;

const CONTAINER_XPATH =
  "xpath=ancestor-or-self::*[self::flow-grid-tile-container or self::flow-tile-container][1]";
/** Video tile with this thumbnail src, else the image tile's container (resolved by src). */
export const tileBySrc = (page: Page, src: string) =>
  page
    .locator("flow-video-tile")
    .filter({ has: resultImage(page, src) })
    .or(resultImage(page, src).locator(CONTAINER_XPATH));
/** Tile at the recorded position among the page's video tiles. */
export const videoTileAt = (page: Page, index: number) =>
  page.locator("flow-video-tile").nth(index);
/**
 * The tile's own "More options" button (icon text more_vert), scoped inside the tile's container
 * and never the global app menu. It is not accessible until hovered, so it is found by icon text.
 */
export const tileMoreOptions = (tile: Locator) =>
  // The button lives in the outer grid container, not in the inner flow-tile-container.
  tile
    .locator("xpath=ancestor-or-self::flow-grid-tile-container[1]")
    .or(tile.locator(CONTAINER_XPATH))
    .first()
    .locator("button")
    .filter({ hasText: /more_vert/ })
    .first();
// Only visible items: Flow keeps hidden menu instances in the DOM.
export const tileDownloadItem = (page: Page) =>
  page.locator("[role=menuitem]:visible").filter({ hasText: DOWNLOAD_ITEM_RE });

export const tierItem = (page: Page, tier: RegExp) =>
  page.locator("[role=menuitem]:visible").filter({ hasText: tier });
export const resultImage = (page: Page, src: string) =>
  page.locator(`img[src=${JSON.stringify(src)}]`);

/** Video sub-mode chips in the settings popover. */
export const subModeChip = (page: Page, mode: "frames" | "ingredients") =>
  chip(page, mode === "frames" ? /Frames$/ : /Ingredients$/);
/** Frame slot button of the prompt area; a filled slot no longer has the plain "Start"/"End" name. */
export const frameSlot = (page: Page, slot: "Start" | "End") =>
  page.locator("flow-prompt-box").getByRole("button", { name: slot, exact: true });
const panelOf = (page: Page) => page.locator("div.add-menu-popover-container");
/** Frame picker panel opened by a frame slot ("Select a frame image"). */
export const framePanel = (page: Page) => panelOf(page).first();
export const framePanelSearch = (page: Page) =>
  panelOf(page).getByRole("textbox", { name: /search assets/i });
export const framePanelTab = (page: Page, name: "Images" | "Uploads") =>
  panelOf(page).locator('mat-list-item[role="tab"]').filter({ hasText: name });
export const framePanelUpload = (page: Page) =>
  panelOf(page).getByRole("button", { name: /upload media/i });
export const framePanelConfirm = (page: Page) =>
  panelOf(page).getByRole("button", { name: /add to prompt/i });
export const framePanelClose = (page: Page) =>
  panelOf(page).getByRole("button", { name: "Close", exact: true });
/** Asset option of the frame picker whose name starts with an uploaded file's base name. */
export const framePanelAsset = (page: Page, basename: string) =>
  panelOf(page).getByRole("option", {
    name: new RegExp(`^${basename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
  });
/** Asset option in the add assets dialog whose name starts with the exact title. */
export const assetOption = (page: Page, name: string) =>
  dialogOf(page).getByRole("option").filter({ hasText: name });
/** Asset option of the add assets dialog whose name starts with an uploaded file's base name. */
export const assetForFile = (page: Page, basename: string) =>
  dialogOf(page).getByRole("option", {
    name: new RegExp(`^${basename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
  });
