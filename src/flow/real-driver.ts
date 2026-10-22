import type { Page } from "playwright-core";
import { BrowserSession } from "../browser/session.js";
import { loadConfig } from "../core/config.js";
import { FlowPilotError } from "../core/errors.js";
import { checkSpend, jobLimit, recordSpend } from "../core/credits.js";
import { createLogger } from "../core/logger.js";
import type {
  FlowBalance,
  Job,
  JobResult,
  JobRequest,
  JobStatus,
  MediaDownloadRequest,
  MediaInfo,
  ModelInfo,
  SelftestReport,
  SessionStatus,
} from "../core/schemas.js";
import { t } from "../i18n/index.js";
import { readBalance } from "./balance.js";
import { clearComposer } from "./cleanup.js";
import { downloadMedia, downloadResult, writeSummary } from "./download.js";
import type { FlowDriver, FlowJobResult } from "./driver.js";
import { discoverModels } from "./models.js";
import { listMedia } from "./media.js";
import {
  type ProjectRef,
  createProject,
  isSignedIn,
  listProjects,
  openHome,
  openProject,
} from "./navigation.js";
import { fillPrompt } from "./prompt.js";
import { assertFilesExist, attachReferences, planReferences } from "./references.js";
import { type ResultItem, snapshotResults, waitForResults } from "./results.js";
import { PROJECT_PATH_RE } from "./selectors.js";
import { runSelftest } from "./selftest.js";
import {
  applySettings,
  ensureClassicComposer,
  pickReplacement,
  sameModel as sameModelName,
} from "./settings-apply.js";
import { submitGeneration } from "./submit.js";

const MODEL_CACHE_MS = 60 * 60_000;

export class RealFlowDriver implements FlowDriver {
  private models: { at: number; list: ModelInfo[] } | undefined;
  private lastBalance: FlowBalance | undefined;
  /** A job or the media list is using the page. */
  private running = false;
  private turn: Promise<unknown> = Promise.resolve();
  /** Sign-in state found by the last full doctor check. */
  private signedIn = false;

  constructor(
    private readonly session: BrowserSession = new BrowserSession({
      headed: loadConfig().showBrowser,
    }),
  ) {}

  /** Runs `fn` alone on the page: a job that arrives meanwhile waits for it, and the other way round. */
  private onPage<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.turn.then(fn);
    this.turn = result.catch(() => undefined);
    return result;
  }

  /** Runs a job, or the media list, on the page: it counts as running from the moment it is asked for. */
  private asJob<T>(fn: () => Promise<T>): Promise<T> {
    this.running = true;
    return this.onPage(fn).finally(() => {
      this.running = false;
    });
  }

  private busy(): FlowPilotError {
    return new FlowPilotError("job_running", "flow.driver.jobRunning");
  }

  async doctor(): Promise<SessionStatus> {
    // Decided on arrival: a job asked for after this waits for the full check.
    const duringJob = this.running;
    const check = async (): Promise<SessionStatus> => {
      // Open the session like jobs do (launch or attach), so the sign-in check is real.
      let page: Page;
      try {
        page = await this.session.page();
      } catch (error) {
        if (!(error instanceof FlowPilotError)) throw error;
        return { ...(await this.session.status()), signedIn: false, message: error.message };
      }
      if (duringJob) {
        // A job is using the page: read it where it is, and leave the models for when the job ends. A project page
        // opens only when signed in; between pages, the last full check says.
        const signedIn =
          PROJECT_PATH_RE.test(new URL(page.url()).pathname) ||
          (await isSignedIn(page)) ||
          this.signedIn;
        const status = await this.session.status();
        return {
          ...status,
          signedIn,
          message: signedIn
            ? `${status.message} ${t("flow.driver.modelsCheckedLater")}`
            : t("flow.driver.notSignedIn"),
        };
      }
      await openHome(page);
      this.signedIn = await isSignedIn(page);
      const status = await this.session.status();
      return {
        ...status,
        signedIn: this.signedIn,
        message: this.signedIn ? status.message : t("flow.driver.notSignedIn"),
        ...(await this.checkConfiguredModels()),
      };
    };
    return duringJob ? check() : this.onPage(check);
  }

  /**
   * Compares the configured default models with what Flow offers, so a model that Flow retired shows up in
   * `doctor` before a job fails on it. Purely a report: nothing here changes the configuration.
   */
  private async checkConfiguredModels(): Promise<Pick<SessionStatus, "configuredModels">> {
    const config = loadConfig();
    const wanted = [
      { key: "defaultVideoModel", kind: "video", name: config.defaultVideoModel },
      { key: "defaultImageModel", kind: "image", name: config.defaultImageModel },
    ].filter((w): w is { key: string; kind: string; name: string } => Boolean(w.name));
    if (wanted.length === 0) return {};
    try {
      // Each default is compared with the models of its own mode: the menu lists only the mode in effect.
      const models = await this.readModels();
      const mismatched = wanted.flatMap((w) => {
        const names = models.filter((m) => m.kind === w.kind).map((m) => m.name);
        if (names.length === 0 || names.some((n) => sameModelName(n, w.name))) return [];
        const suggestion = pickReplacement(w.name, names);
        return [
          {
            key: w.key,
            configured: w.name,
            available: names,
            ...(suggestion ? { suggestion } : {}),
          },
        ];
      });
      return mismatched.length > 0 ? { configuredModels: mismatched } : {};
    } catch {
      return {};
    }
  }

  async selftest(): Promise<SelftestReport> {
    if (this.running) throw this.busy();
    return this.onPage(async () => runSelftest(await this.session.page()));
  }

  /** The model list; while a job is using the page, the one already read, if any. */
  async listModels(): Promise<ModelInfo[]> {
    if (this.running) {
      if (this.models) return this.models.list;
      throw this.busy();
    }
    return this.onPage(() => this.readModels());
  }

  private async readModels(): Promise<ModelInfo[]> {
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
    return this.onPage(async () => {
      const page = await this.session.page();
      if (!/flow\.google\.com|labs\.google/.test(page.url())) await openHome(page);
      return this.remember(await readBalance(page));
    });
  }

  run(
    job: Job,
    onProgress?: (status: JobStatus) => void,
    onSpend?: (credits: number) => void,
  ): Promise<FlowJobResult> {
    return this.asJob(() => {
      const { request } = job;
      if (request.type === "download") return this.downloadMedia(request, onProgress);
      return this.runJob(job, request, onProgress, onSpend);
    });
  }

  private remember(credits: number): FlowBalance {
    this.lastBalance = { credits, readAt: new Date().toISOString() };
    return this.lastBalance;
  }

  listMedia(project?: string): Promise<{ project: ProjectRef; media: MediaInfo[] }> {
    return this.asJob(async () => {
      const page = await this.session.page();
      const opened = await this.openExistingProject(page, project);
      return { project: opened, media: await listMedia(page) };
    });
  }

  private async downloadMedia(
    request: MediaDownloadRequest,
    onProgress?: (status: JobStatus) => void,
  ): Promise<FlowJobResult> {
    const page = await this.session.page();
    const project = await this.openExistingProject(page, request.project);
    onProgress?.("downloading");
    const file = await downloadMedia(page, project, request.mediaId, {
      upscale: request.upscale,
      outDir: request.outDir ?? loadConfig().outputDir,
    });
    return { results: [{ ...file, mediaId: request.mediaId }], credits: 0 };
  }

  private async runJob(
    job: Job,
    request: JobRequest,
    onProgress?: (status: JobStatus) => void,
    onSpend?: (credits: number) => void,
  ): Promise<FlowJobResult> {
    const references = planReferences(request);
    assertFilesExist(references);
    const config = loadConfig();
    const page = await this.session.page();
    await this.openProjectFor(page, request.project);
    await ensureClassicComposer(page);
    await clearComposer(page);

    // Only the configured default may be swapped for its successor: a model asked for by name always fails.
    const { cost, model, modelReplaced } = await applySettings(page, request, {
      allowModelReplacement: request.modelFromConfig === true,
    });
    checkSpend(cost, {
      maxCreditsPerJob: jobLimit(config.maxCreditsPerJob, request.maxCredits),
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
    let items: ResultItem[] = [];
    try {
      items = await waitForResults(page, request.type, before, request.outputs);

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
      return {
        results,
        credits: cost,
        modelUsed: model,
        ...(modelReplaced ? { modelReplaced } : {}),
        ...(balance !== undefined ? { balance } : {}),
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      // The media Flow already made can be downloaded by id instead of generated again.
      const media = items.flatMap((item) => (item.mediaId ? [item.mediaId] : [])).join(", ");
      throw new FlowPilotError(
        error instanceof FlowPilotError ? error.code : "post_submit_failed",
        media ? "flow.gen.failedAfterSubmitMedia" : "flow.gen.failedAfterSubmit",
        { reason, url: projectUrl, media },
      );
    }
  }

  async close(options: { closeBrowser?: boolean } = {}): Promise<void> {
    if (options.closeBrowser) await this.session.closeBrowser();
    else await this.session.close();
  }

  /** Opens the named project, else the most recent one; never creates one. */
  private async openExistingProject(page: Page, project: string | undefined): Promise<ProjectRef> {
    if (project) return openProject(page, project);
    await openHome(page);
    const first = (await listProjects(page))[0];
    if (!first) {
      throw new FlowPilotError("project_not_found", "flow.nav.noProjects");
    }
    return openProject(page, first.id);
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
