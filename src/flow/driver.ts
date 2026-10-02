import type {
  Job,
  JobResult,
  JobStatus,
  ModelInfo,
  SelftestReport,
  SessionStatus,
} from "../core/schemas.js";

/** Everything the rest of the app needs from the Google Flow automation. */
export interface FlowDriver {
  /** Reports whether Chrome is running, reachable and signed in to Flow. */
  doctor(): Promise<SessionStatus>;
  /** Checks that the Flow UI still matches what the driver expects. */
  selftest(): Promise<SelftestReport>;
  /** Lists the models available to the signed-in account. */
  listModels(): Promise<ModelInfo[]>;
  /** Runs one job to completion and returns the downloaded files and credits spent. */
  run(
    job: Job,
    onProgress?: (status: JobStatus) => void,
    /** Called right after the generation is submitted, with the credits actually spent. */
    onSpend?: (credits: number) => void,
  ): Promise<{ results: JobResult[]; credits: number }>;
  /** Releases the browser connection; with `closeBrowser` also quits the automation Chrome. */
  close(options?: { closeBrowser?: boolean }): Promise<void>;
}
