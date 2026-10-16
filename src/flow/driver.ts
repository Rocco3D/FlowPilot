import type {
  FlowBalance,
  Job,
  JobResult,
  JobStatus,
  ModelInfo,
  SelftestReport,
  SessionStatus,
} from "../core/schemas.js";

/** What one job run produced, including what the user should know about it. */
export interface FlowJobResult {
  results: JobResult[];
  credits: number;
  balance?: number;
  /** Set when a configured default model Flow no longer offers was swapped for its successor. */
  modelReplaced?: { from: string; to: string };
}

/** Everything the rest of the app needs from the Google Flow automation. */
export interface FlowDriver {
  /** Reports whether Chrome is running, reachable and signed in to Flow. */
  doctor(): Promise<SessionStatus>;
  /** Checks that the Flow UI still matches what the driver expects. */
  selftest(): Promise<SelftestReport>;
  /** Lists the models available to the signed-in account. */
  listModels(): Promise<ModelInfo[]>;
  /**
   * Runs one job to completion and returns the downloaded files, the credits spent and, when
   * Flow shows it, the account balance left afterwards.
   */
  run(
    job: Job,
    onProgress?: (status: JobStatus) => void,
    /** Called right after the generation is submitted, with the credits actually spent. */
    onSpend?: (credits: number) => void,
  ): Promise<FlowJobResult>;
  /** Google Flow credits left on the account; while a job runs, the last value read. */
  balance?(): Promise<FlowBalance | undefined>;
  /** Releases the browser connection; with `closeBrowser` also quits the automation Chrome. */
  close(options?: { closeBrowser?: boolean }): Promise<void>;
}
