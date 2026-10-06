import type { Page } from "playwright-core";
import { BrowserSession } from "../browser/session.js";
import { loadConfig } from "../core/config.js";
import { FlowPilotError } from "../core/errors.js";
import { checkSpend, recordSpend } from "../core/credits.js";
import { createLogger } from "../core/logger.js";
import type {
  FlowBalance,
  Job,
  JobResult,
  JobStatus,
  ModelInfo,
  SelftestReport,
  SessionStatus,
} from "../core/schemas.js";
import { t } from "../i18n/index.js";
import { readBalance } from "./balance.js";
import { clearComposer } from "./cleanup.js";
import { downloadResult, writeSummary } from "./download.js";
import type { FlowDriver } from "./driver.js";
import { discoverModels } from "./models.js";
import { createProject, isSignedIn, listProjects, openHome, openProject } from "./navigation.js";
import { fillPrompt } from "./prompt.js";
import { assertFilesExist, attachReferences, planReferences } from "./references.js";
import { snapshotResults, waitForResults } from "./results.js";
import { runSelftest } from "./selftest.js";
import { applySettings, ensureClassicComposer } from "./settings-apply.js";
import { submitGeneration } from "./submit.js";

const MODEL_CACHE_MS = 60 * 60_000;

export class RealFlowDriver implements FlowDriver {
  private models: { at: number; list: ModelInfo[] } | undefined;
  private lastBalance: FlowBalance | undefined;
  private running = false;

  constructor(
    private readonly session: BrowserSession = new BrowserSession({
      headed: loadConfig().showBrowser,
    }),
  ) {}

  async doctor(): Promise<SessionStatus> {
    // Open the session like jobs do (launch or attach), so the sign-in check is real.
    let page: Page;
    try {
      page = await this.session.page();
    } catch (error) {
      if (!(error instanceof FlowPilotError)) throw error;
      return { ...(await this.session.status()), signedIn: false, message: error.message };
    }
    await openHome(page);
    const signedIn = await isSignedIn(page);
    const status = await this.session.status();
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

  async balance(): Promise<FlowBalance | undefined> {
    // Never touch the page while a job is using it.
    if (this.running) return this.lastBalance;
    const page = await this.session.page();
    if (!/flow\.google\.com|labs\.google/.test(page.url())) await openHome(page);
    return this.remember(await readBalance(page));
  }

  async run(
    job: Job,
    onProgress?: (status: JobStatus) => void,
    onSpend?: (credits: number) => void,
  ): Promise<{ results: JobResult[]; credits: number; balance?: number }> {
    this.running = true;
    try {
      return await this.runJob(job, onProgress, onSpend);
    } finally {
      this.running = false;
    }
  }

  private remember(credits: number): FlowBalance {
    this.lastBalance = { credits, readAt: new Date().toISOString() };
    return this.lastBalance;
  }

  private async runJob(
    job: Job,
    onProgress?: (status: JobStatus) => void,
    onSpend?: (credits: number) => void,
  ): Promise<{ results: JobResult[]; credits: number; balance?: number }> {
    const request = job.request;
    const references = planReferences(request);
    assertFilesExist(references);
    const config = loadConfig();
    const page = await this.session.page();
    await this.openProjectFor(page, request.project);
    await ensureClassicComposer(page);
    await clearComposer(page);

    const { cost, model } = await applySettings(page, request);
    checkSpend(cost, {
      maxCreditsPerJob: request.maxCredits ?? config.maxCreditsPerJob,
      monthlyCreditLimit: config.monthlyCreditLimit,
      ...(request.confirm ? { confirm: true } : {}),
    });

    await attachReferences(page, references, {
      acceptUploadRights: config.acceptUploadRights,
      log: createLogger({ level: config.logLevel }),
    });
    await fillPrompt(page, request.prompt);
    const before = await snapshotResults(page, request.type);
    await submitGeneration(page);
    recordSpend({ jobId: job.id, model, credits: cost, at: new Date().toISOString() });
    onSpend?.(cost);
    const projectUrl = page.url();
    try {
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
        writeSummary(file.path, { jobId: job.id, request, model, cost, flowUrl: projectUrl });
        results.push({
          path: file.path,
          type: request.type,
          ...(file.mediaId ? { mediaId: file.mediaId } : {}),
        });
      }
      // The balance is a bonus: a failed read never fails a finished job.
      const balance = await readBalance(page)
        .then((credits) => this.remember(credits).credits)
        .catch(() => undefined);
      return { results, credits: cost, ...(balance !== undefined ? { balance } : {}) };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new FlowPilotError(
        error instanceof FlowPilotError ? error.code : "post_submit_failed",
        "flow.gen.failedAfterSubmit",
        { reason, url: projectUrl },
      );
    }
  }

  async close(options: { closeBrowser?: boolean } = {}): Promise<void> {
    if (options.closeBrowser) await this.session.closeBrowser();
    else await this.session.close();
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
