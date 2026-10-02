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
export const SETTINGS_TRIGGER_LABEL = "Settings trigger";

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
