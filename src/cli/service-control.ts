import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FlowPilotError } from "../core/errors.js";
import { dataDir } from "../core/paths.js";
import type { Client } from "./client.js";

const START_TIMEOUT_MS = 15_000;
const POLL_MS = 250;

export interface ServiceStatus {
  running: boolean;
  version?: string;
  pid?: number;
  port: number;
  startedAt?: string;
}

async function isUp(client: Client): Promise<boolean> {
  try {
    await client.health();
    return true;
  } catch {
    return false;
  }
}

export async function ensureServiceRunning(client: Client): Promise<void> {
  if (await isUp(client)) return;
  const logDir = path.join(dataDir(), "logs");
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, "service-stdout.log");
  const fd = fs.openSync(logFile, "a");
  const entry = fileURLToPath(new URL("../server/main.js", import.meta.url));
  const child = spawn(process.execPath, [entry], {
    detached: true,
    stdio: ["ignore", fd, fd],
    windowsHide: true,
  });
  child.on("error", () => undefined);
  child.unref();
  fs.closeSync(fd);
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await isUp(client)) return;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new FlowPilotError("service_start_failed", "cli.error.serviceStartFailed", {
    log: logFile,
  });
}

export async function stopService(client: Client): Promise<boolean> {
  if (!(await isUp(client))) return false;
  await client.shutdown();
  return true;
}

export async function serviceStatus(client: Client): Promise<ServiceStatus> {
  let version: string;
  try {
    version = (await client.health()).version;
  } catch {
    return { running: false, port: client.port };
  }
  let info: { pid?: number; startedAt?: string } = {};
  try {
    info = JSON.parse(fs.readFileSync(path.join(dataDir(), "service.json"), "utf8"));
  } catch {
    // service.json missing or unreadable: report health only
  }
  return { running: true, version, port: client.port, pid: info.pid, startedAt: info.startedAt };
}
