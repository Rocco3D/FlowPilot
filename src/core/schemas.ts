import { z } from "zod";

export const JobType = z.enum(["video", "image"]);
export type JobType = z.infer<typeof JobType>;

/** Download quality; left out, the best the user's plan offers. */
export const Upscale = z.enum(["original", "1080p", "4k"]);
export type Upscale = z.infer<typeof Upscale>;

export const JobRequest = z.object({
  type: JobType,
  prompt: z.string().min(1),
  model: z.string().optional(),
  ratio: z.string().optional(),
  duration: z.number().int().positive().optional(),
  resolution: z.string().optional(),
  outputs: z.number().int().min(1).max(4).default(1),
  startFrame: z.string().optional(),
  endFrame: z.string().optional(),
  ingredients: z.array(z.string()).optional(),
  characters: z.array(z.string()).optional(),
  project: z.string().optional(),
  /** Runs the job in a new project: `true` keeps the name Flow gives it, a string names it. Not with `project`. */
  newProject: z.union([z.literal(true), z.string().min(1)]).optional(),
  outDir: z.string().optional(),
  upscale: Upscale.optional(),
  maxCredits: z.number().int().min(0).optional(),
  /** Overrides the credit limits for this job. */
  confirm: z.boolean().optional(),
  /**
   * Set by the service, never by the client: true when `model` came from the configured default, the only case in
   * which a model Flow retired may be replaced by its successor.
   */
  modelFromConfig: z.boolean().optional(),
});
export type JobRequest = z.infer<typeof JobRequest>;
/** What a client may send: whatever it leaves out is filled in by the service from the configuration. */
export type JobRequestInput = z.input<typeof JobRequest>;

/** Downloads a media already in a Flow project, by its id: it generates nothing and spends no credits. */
export const MediaDownloadRequest = z.object({
  type: z.literal("download"),
  mediaId: z.string().min(1),
  project: z.string().optional(),
  outDir: z.string().optional(),
  upscale: Upscale.optional(),
});
export type MediaDownloadRequest = z.infer<typeof MediaDownloadRequest>;

/** What the queue runs: a generation or the download of a media already in Flow. */
export const QueueRequest = z.union([JobRequest, MediaDownloadRequest]);
export type QueueRequest = z.infer<typeof QueueRequest>;

export const JobStatus = z.enum([
  "queued",
  "running",
  "downloading",
  "done",
  "failed",
  "cancelled",
  "interrupted",
]);
export type JobStatus = z.infer<typeof JobStatus>;

export const JobResult = z.object({
  path: z.string(),
  type: JobType,
  mediaId: z.string().optional(),
});
export type JobResult = z.infer<typeof JobResult>;

export const JobError = z.object({
  code: z.string(),
  message: z.string(),
  /** First line of the original error when the failure was unexpected. */
  detail: z.string().optional(),
});
export type JobError = z.infer<typeof JobError>;

export const Job = z.object({
  id: z.string(),
  request: QueueRequest,
  status: JobStatus,
  createdAt: z.string(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  credits: z.number().int().optional(),
  /** Google Flow credits left on the account after the job, read from Flow. */
  balance: z.number().int().optional(),
  results: z.array(JobResult),
  /** The model the job really used. It differs from `request.model` when a retired configured model was replaced. */
  modelUsed: z.string().optional(),
  /** Something the user should know about how this job ran, in words. */
  note: z.string().optional(),
  error: JobError.optional(),
});
export type Job = z.infer<typeof Job>;

export const ProjectInfo = z.object({ id: z.string(), name: z.string() });
export type ProjectInfo = z.infer<typeof ProjectInfo>;

export const MediaInfo = z.object({
  id: z.string(),
  type: JobType,
  title: z.string(),
});
export type MediaInfo = z.infer<typeof MediaInfo>;

export const MediaList = z.object({
  project: z.object({ id: z.string(), name: z.string() }),
  /** True when the list had to wait for a running job to finish. */
  queued: z.boolean(),
  media: z.array(MediaInfo),
});
export type MediaList = z.infer<typeof MediaList>;

/** Google Flow credits left on the account, as shown in Flow's account panel. */
export const FlowBalance = z.object({
  credits: z.number().int(),
  readAt: z.string(),
});
export type FlowBalance = z.infer<typeof FlowBalance>;

export const ModelInfo = z.object({
  name: z.string(),
  kind: JobType,
  ratios: z.array(z.string()),
  resolutions: z.array(z.string()).optional(),
  durations: z.array(z.number().int()),
  /** A flat cost, or a cost per option keyed like "720p-8s". */
  credits: z.union([z.number(), z.record(z.string(), z.number())]),
  audio: z.boolean(),
});
export type ModelInfo = z.infer<typeof ModelInfo>;

export const UpdateInfo = z.object({
  installed: z.string(),
  latest: z.string(),
  message: z.string(),
});
export type UpdateInfo = z.infer<typeof UpdateInfo>;

export const SessionStatus = z.object({
  chromeRunning: z.boolean(),
  connected: z.boolean(),
  signedIn: z.boolean(),
  profileDir: z.string().optional(),
  message: z.string(),
  /** Present only when a newer FlowPilot version is on GitHub. */
  update: UpdateInfo.optional(),
  /** Configured default models, with what Flow offers instead. Present only when something does not match. */
  configuredModels: z
    .array(
      z.object({
        key: z.string(),
        configured: z.string(),
        available: z.array(z.string()),
        suggestion: z.string().optional(),
      }),
    )
    .optional(),
});
export type SessionStatus = z.infer<typeof SessionStatus>;

export const SelftestReport = z.object({
  ok: z.boolean(),
  checks: z.array(z.object({ name: z.string(), ok: z.boolean(), detail: z.string().optional() })),
});
export type SelftestReport = z.infer<typeof SelftestReport>;
