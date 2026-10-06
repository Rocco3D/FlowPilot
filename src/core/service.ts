import fs from "node:fs";
import path from "node:path";
import type { Server } from "node:http";
import type { FlowDriver } from "../flow/driver.js";
import { createHttpServer } from "../server/http.js";
import { ensureToken } from "../server/auth.js";
import { loadConfig } from "./config.js";
import { JobStore } from "./jobs.js";
import { createLogger } from "./logger.js";
import { dataDir as defaultDataDir } from "./paths.js";
import { JobQueue, TERMINAL } from "./queue.js";
import type { UpdateInfo } from "./schemas.js";

const SHUTDOWN_TIMEOUT_MS = 10_000;

export interface ServiceOptions {
  driver: FlowDriver;
  configDir?: string;
  dataDir?: string;
  port?: number;
  /** Called once the service has stopped after a shutdown request, signal or idle timeout. */
  onExit?: () => void;
  /** Overrides `idleMinutes` (in milliseconds); for tests. */
  idleMs?: number;
  /** Looks for a newer FlowPilot version; doctor reports it. */
  checkUpdate?: (installed: string) => Promise<UpdateInfo | undefined>;
}

export interface RunningService {
  port: number;
  url: string;
  stop(): Promise<void>;
  /** Stops everything, then calls `onExit`; calls it anyway after 10 s. */
  shutdown(): void;
}

export interface ServiceInfo {
  pid: number;
  port: number;
  startedAt: string;
}

const infoFile = (dir: string) => path.join(dir, "service.json");

const { version } = JSON.parse(
  fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as { version: string };

export async function startService(options: ServiceOptions): Promise<RunningService> {
  const { driver, configDir } = options;
  const dataDir = options.dataDir ?? defaultDataDir();
  const config = loadConfig(configDir);
  const token = ensureToken(configDir);
  const store = new JobStore(path.join(dataDir, "jobs"));
  const logger = createLogger({ dir: path.join(dataDir, "logs"), level: config.logLevel });
  const queue = new JobQueue(driver, store, logger);

  let stopping: Promise<void> | undefined;
  let idleTimer: NodeJS.Timeout | undefined;
  const stop = (): Promise<void> => {
    stopping ??= (async () => {
      clearTimeout(idleTimer);
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
      await queue.stop();
      await driver.close({ closeBrowser: true });
      fs.rmSync(infoFile(dataDir), { force: true });
      logger.info("service stopped");
    })();
    return stopping;
  };

  let shuttingDown = false;
  const shutdown = (): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    const exit = () => options.onExit?.();
    const force = setTimeout(exit, SHUTDOWN_TIMEOUT_MS);
    void stop()
      .catch(() => undefined)
      .then(() => {
        clearTimeout(force);
        exit();
      });
  };

  const idleMs = options.idleMs ?? config.idleMinutes * 60_000;
  const touch = (): void => {
    if (idleMs <= 0 || stopping) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (store.list().some((j) => !TERMINAL.includes(j.status))) return touch();
      logger.info("idle shutdown");
      shutdown();
    }, idleMs);
    idleTimer.unref();
  };
  queue.on("job", touch);

  const server: Server = createHttpServer({
    driver,
    queue,
    store,
    token,
    configDir,
    dataDir,
    version,
    ...(options.checkUpdate ? { checkUpdate: options.checkUpdate } : {}),
    logger,
    onShutdown: shutdown,
    onActivity: touch,
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? config.port, "127.0.0.1", resolve);
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const info: ServiceInfo = { pid: process.pid, port, startedAt: new Date().toISOString() };
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(infoFile(dataDir), JSON.stringify(info));
  logger.info("service started", { port });
  touch();
  return { port, url: `http://127.0.0.1:${port}`, stop, shutdown };
}

export function readServiceInfo(dataDir: string = defaultDataDir()): ServiceInfo | undefined {
  try {
    return JSON.parse(fs.readFileSync(infoFile(dataDir), "utf8")) as ServiceInfo;
  } catch {
    return undefined;
  }
}

export function isServiceAlive(info: ServiceInfo): boolean {
  try {
    process.kill(info.pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}
