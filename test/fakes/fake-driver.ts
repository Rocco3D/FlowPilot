import { FlowPilotError } from "../../src/core/errors.js";
import type {
  Job,
  JobResult,
  JobStatus,
  MediaInfo,
  ModelInfo,
  ProjectInfo,
  SelftestReport,
  SessionStatus,
} from "../../src/core/schemas.js";
import type { FlowDriver } from "../../src/flow/driver.js";

export interface FakeDriverOptions {
  /** Milliseconds `run` waits before finishing. */
  delayMs?: number;
  /** When true, `run` throws. */
  fail?: boolean;
}

const MODELS: ModelInfo[] = [
  {
    name: "fake-video",
    kind: "video",
    ratios: ["16:9", "9:16"],
    resolutions: ["720p"],
    durations: [8],
    credits: { "720p-8s": 20 },
    audio: true,
  },
  {
    name: "fake-image",
    kind: "image",
    ratios: ["1:1", "16:9"],
    durations: [],
    credits: 0,
    audio: false,
  },
];

export class FakeDriver implements FlowDriver {
  constructor(private readonly options: FakeDriverOptions = {}) {}

  doctor(): Promise<SessionStatus> {
    return Promise.resolve({
      chromeRunning: true,
      connected: true,
      signedIn: true,
      message: "fake",
    });
  }

  selftest(): Promise<SelftestReport> {
    return Promise.resolve({ ok: true, checks: [{ name: "fake", ok: true }] });
  }

  listModels(): Promise<ModelInfo[]> {
    return Promise.resolve(MODELS);
  }

  listProjects(): Promise<ProjectInfo[]> {
    return Promise.resolve([{ id: "fake-project", name: "Fake project" }]);
  }

  deleteProject(ref: string): Promise<ProjectInfo> {
    return Promise.resolve({ id: "fake-project", name: ref });
  }

  listMedia(
    project?: string,
  ): Promise<{ project: { id: string; name: string }; media: MediaInfo[] }> {
    return Promise.resolve({
      project: { id: "fake-project", name: project ?? "Fake project" },
      media: [{ id: "fake-media-1", type: "image", title: "A fake cat" }],
    });
  }

  async run(
    job: Job,
    onProgress?: (status: JobStatus) => void,
  ): Promise<{ results: JobResult[]; credits: number }> {
    onProgress?.("running");
    if (this.options.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, this.options.delayMs));
    }
    if (this.options.fail) throw new FlowPilotError("fake_failure", "core.error.internal");
    onProgress?.("downloading");
    const { request } = job;
    if (request.type === "download") {
      const path = `${request.outDir ?? "fake-out"}/fake-media-${request.mediaId}.png`;
      return { results: [{ path, type: "image", mediaId: request.mediaId }], credits: 0 };
    }
    const { type, outputs } = request;
    const ext = type === "video" ? "mp4" : "png";
    const results = Array.from({ length: outputs }, (_, i) => ({
      path: `${request.outDir ?? "fake-out"}/${job.id}-${i + 1}.${ext}`,
      type,
      mediaId: `${job.id}-media-${i + 1}`,
    }));
    return { results, credits: type === "video" ? 20 * outputs : 0 };
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}
