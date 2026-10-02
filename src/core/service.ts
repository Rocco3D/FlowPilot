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
import { JobQueue } from "./queue.js";

export interface ServiceOptions {
  driver: FlowDriver;
  configDir?: string;
  dataDir?: string;
  port?: number;
}

export interface RunningService {
  port: number;
  url: string;
  stop(): Promise<void>;
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
  const queue = new JobQueue(driver, store);
  const logger = createLogger({ dir: path.join(dataDir, "logs"), level: config.logLevel });

  let stopping: Promise<void> | undefined;
  const stop = (): Promise<void> => {
    stopping ??= (async () => {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
      await queue.stop();
      await driver.close();
      fs.rmSync(infoFile(dataDir), { force: true });
      logger.info("service stopped");
    })();
    return stopping;
  };

  const server: Server = createHttpServer({
    driver,
    queue,
    store,
    token,
    configDir,
    dataDir,
    version,
    onShutdown: () => void stop(),
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
  return { port, url: `http://127.0.0.1:${port}`, stop };
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
