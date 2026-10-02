import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const WIN_LIST_COMMAND =
  'Get-CimInstance Win32_Process -Filter "Name=\'chrome.exe\'" | ForEach-Object { "$($_.ProcessId) $($_.CommandLine)" }';

/**
 * Parses "pid command line" lines and returns the root Chrome processes (no `--type=`)
 * whose `--user-data-dir` is exactly this profile.
 */
export function parseProcessList(stdout: string, profileDir: string, selfPid: number): number[] {
  const needle = `--user-data-dir=${profileDir}`;
  const pids: number[] = [];
  for (const raw of stdout.split("\n")) {
    const line = raw.trim();
    if (!(line.includes(`${needle} `) || line.includes(`${needle}"`) || line.endsWith(needle))) {
      continue;
    }
    if (line.includes("--type=")) continue;
    const pid = Number.parseInt(line, 10);
    if (!Number.isNaN(pid) && pid !== selfPid) pids.push(pid);
  }
  return pids;
}

export async function findChromeProcesses(
  profileDir: string,
  opts: { platform?: NodeJS.Platform } = {},
): Promise<number[]> {
  const platform = opts.platform ?? process.platform;
  try {
    const { stdout } =
      platform === "win32"
        ? await execFileAsync(
            "powershell.exe",
            ["-NoProfile", "-NonInteractive", "-Command", WIN_LIST_COMMAND],
            { maxBuffer: 16 * 1024 * 1024 },
          )
        : await execFileAsync("ps", ["-Ao", "pid=,command="], { maxBuffer: 16 * 1024 * 1024 });
    return parseProcessList(stdout, profileDir, process.pid);
  } catch {
    return [];
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Asks Chrome to quit so it flushes cookies to disk: `taskkill` without /F on Windows,
 * SIGTERM elsewhere. Force-kills after 8 s as a last resort.
 */
export async function closeChromeGracefully(pids: number[]): Promise<void> {
  for (const pid of pids) {
    try {
      if (process.platform === "win32") await execFileAsync("taskkill", ["/PID", String(pid)]);
      else process.kill(pid, "SIGTERM");
    } catch {
      // Already gone.
    }
  }
  for (const pid of pids) {
    const deadline = Date.now() + 8000;
    while (isAlive(pid) && Date.now() < deadline) await delay(150);
    if (isAlive(pid)) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // Already gone.
      }
    }
  }
}
