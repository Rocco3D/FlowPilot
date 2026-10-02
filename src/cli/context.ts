import type { Command } from "commander";
import { Client, resolvePort } from "./client.js";
import { ensureServiceRunning, type StopDeps } from "./service-control.js";

export interface Ctx {
  /** Delay between job status polls, in milliseconds. */
  pollMs: number;
  /** Opens the plain Chrome sign-in window and returns the profile directory (injectable for tests). */
  openLogin?: (profile?: string) => Promise<string>;
  /** Process killer and browser closer used by `stop` (injectable for tests). */
  stopDeps?: StopDeps;
}

export interface JsonOpt {
  json?: boolean;
}

export function newClient(cmd: Command): Client {
  return new Client(resolvePort(cmd.optsWithGlobals<{ port?: number }>().port));
}

export async function connect(cmd: Command): Promise<Client> {
  const client = newClient(cmd);
  await ensureServiceRunning(client);
  return client;
}

/** Prints the raw value with --json, otherwise the human-readable text. */
export function show(opts: JsonOpt, value: unknown, text: () => string): void {
  console.log(opts.json ? JSON.stringify(value, null, 2) : text());
}
