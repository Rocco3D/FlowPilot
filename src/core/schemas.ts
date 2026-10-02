import { z } from "zod";

export const JobType = z.enum(["video", "image"]);
export type JobType = z.infer<typeof JobType>;

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
  outDir: z.string().optional(),
  upscale: z.enum(["1080p", "4k"]).optional(),
  maxCredits: z.number().int().min(0).optional(),
  /** Overrides the credit limits for this job. */
  confirm: z.boolean().optional(),
});
export type JobRequest = z.infer<typeof JobRequest>;

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
});
export type JobError = z.infer<typeof JobError>;

export const Job = z.object({
  id: z.string(),
  request: JobRequest,
  status: JobStatus,
  createdAt: z.string(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  credits: z.number().int().optional(),
  results: z.array(JobResult),
  error: JobError.optional(),
});
export type Job = z.infer<typeof Job>;

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

export const SessionStatus = z.object({
  chromeRunning: z.boolean(),
  connected: z.boolean(),
  signedIn: z.boolean(),
  profileDir: z.string().optional(),
  message: z.string(),
});
export type SessionStatus = z.infer<typeof SessionStatus>;

export const SelftestReport = z.object({
  ok: z.boolean(),
  checks: z.array(z.object({ name: z.string(), ok: z.boolean(), detail: z.string().optional() })),
});
export type SelftestReport = z.infer<typeof SelftestReport>;
