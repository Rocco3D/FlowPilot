import type { Page } from "playwright-core";
import { BrowserSession } from "../browser/session.js";
import { loadConfig } from "../core/config.js";
import { checkSpend, recordSpend } from "../core/credits.js";
import type {
  Job,
  JobResult,
  JobStatus,
  ModelInfo,
  SelftestReport,
  SessionStatus,
} from "../core/schemas.js";
import { t } from "../i18n/index.js";
import { downloadResult, writeSummary } from "./download.js";
import type { FlowDriver } from "./driver.js";
import { discoverModels } from "./models.js";
import { createProject, isSignedIn, listProjects, openHome, openProject } from "./navigation.js";
import { fillPrompt } from "./prompt.js";
import { assertFilesExist, attachReferences, planReferences } from "./references.js";
import { snapshotResults, waitForResults } from "./results.js";
import { runSelftest } from "./selftest.js";
import { applySettings } from "./settings-apply.js";
import { submitGeneration } from "./submit.js";

const MODEL_CACHE_MS = 60 * 60_000;

export class RealFlowDriver implements FlowDriver {
  private models: { at: number; list: ModelInfo[] } | undefined;

  constructor(private readonly session: BrowserSession = new BrowserSession()) {}

  async doctor(): Promise<SessionStatus> {
    const status = await this.session.status();
    if (!status.connected) return status;
    const page = await this.session.page();
    if (!page.url().includes("flow.google.com")) await openHome(page);
    const signedIn = await isSignedIn(page);
    return {
      ...status,
      signedIn,
      message: signedIn ? status.message : t("flow.driver.notSignedIn"),
    };
  }

  async selftest(): Promise<SelftestReport> {
    return runSelftest(await this.session.page());
  }

  async listModels(): Promise<ModelInfo[]> {
    if (this.models && Date.now() - this.models.at < MODEL_CACHE_MS) return this.models.list;
    const page = await this.session.page();
    await this.openProjectFor(page, undefined);
    const list = await discoverModels(page);
    this.models = { at: Date.now(), list };
    return list;
  }

  async run(
    job: Job,
    onProgress?: (status: JobStatus) => void,
  ): Promise<{ results: JobResult[]; credits: number }> {
    const request = job.request;
    const references = planReferences(request);
    assertFilesExist(references);
    const config = loadConfig();
    const page = await this.session.page();
    await this.openProjectFor(page, request.project);

    const { cost, model } = await applySettings(page, request);
    checkSpend(cost, {
      maxCreditsPerJob: request.maxCredits ?? config.maxCreditsPerJob,
      monthlyCreditLimit: config.monthlyCreditLimit,
      ...(request.confirm ? { confirm: true } : {}),
    });

    await attachReferences(page, references);
    await fillPrompt(page, request.prompt);
    const before = await snapshotResults(page, request.type);
    await submitGeneration(page);
    const items = await waitForResults(page, request.type, before, request.outputs);

    onProgress?.("downloading");
    const outDir = request.outDir ?? config.outputDir;
    const results: JobResult[] = [];
    for (const [i, item] of items.entries()) {
      const file = await downloadResult(page, item, {
        type: request.type,
        upscale: request.upscale,
        outDir,
        jobId: job.id,
        n: i + 1,
      });
      writeSummary(file.path, { jobId: job.id, request, model, cost, flowUrl: page.url() });
      results.push({
        path: file.path,
        type: request.type,
        ...(file.mediaId ? { mediaId: file.mediaId } : {}),
      });
    }
    recordSpend({ jobId: job.id, model, credits: cost, at: new Date().toISOString() });
    return { results, credits: cost };
  }

  async close(): Promise<void> {
    await this.session.close();
  }

  /** Opens the named project, else the most recent one, else a new one. */
  private async openProjectFor(page: Page, project: string | undefined): Promise<void> {
    if (project) {
      await openProject(page, project);
      return;
    }
    await openHome(page);
    const first = (await listProjects(page))[0];
    if (first) await openProject(page, first.id);
    else await createProject(page);
  }
}
