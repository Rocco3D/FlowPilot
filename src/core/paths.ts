import os from "node:os";
import path from "node:path";

export interface PathOptions {
  platform?: NodeJS.Platform;
  env?: Record<string, string | undefined>;
  home?: string;
}

function resolve(opts: PathOptions) {
  const platform = opts.platform ?? process.platform;
  return {
    platform,
    env: opts.env ?? process.env,
    home: opts.home ?? os.homedir(),
    p: platform === "win32" ? path.win32 : path.posix,
  };
}

export function configDir(opts: PathOptions = {}): string {
  const { platform, env, home, p } = resolve(opts);
  if (platform === "win32") {
    return p.join(env.APPDATA ?? p.join(home, "AppData", "Roaming"), "FlowPilot");
  }
  if (platform === "darwin") return p.join(home, "Library", "Application Support", "FlowPilot");
  return p.join(env.XDG_CONFIG_HOME || p.join(home, ".config"), "flowpilot");
}

export function dataDir(opts: PathOptions = {}): string {
  const { platform, env, home, p } = resolve(opts);
  if (platform === "win32") {
    return p.join(env.LOCALAPPDATA ?? p.join(home, "AppData", "Local"), "FlowPilot");
  }
  if (platform === "darwin") return p.join(home, "Library", "Application Support", "FlowPilot");
  return p.join(env.XDG_DATA_HOME || p.join(home, ".local", "share"), "flowpilot");
}

export function defaultOutputDir(opts: PathOptions = {}): string {
  const { home, p } = resolve(opts);
  return p.join(home, "Documents", "FlowPilot");
}

export function profileDir(name = "default", opts: PathOptions = {}): string {
  return resolve(opts).p.join(dataDir(opts), "profiles", name);
}
