import { t } from "../i18n/index.js";

export class FlowPilotError extends Error {
  constructor(
    readonly code: string,
    readonly i18nKey: string,
    readonly params?: Record<string, string | number>,
  ) {
    super(t(i18nKey, params));
    this.name = "FlowPilotError";
  }
}
