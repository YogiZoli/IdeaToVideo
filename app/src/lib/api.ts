// api.ts: the only place the UI talks to the Rust core. Keys go in (set_key),
// only booleans come back (key_status). Every network call runs in the runner.
// Settings come in two levels, the App and the active Identity (docs/identity.md);
// `AppState.config` is the two merged, the shape every gate reads.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { effectiveConfig } from "./identity";
import { log } from "./logger";

// Every call into the core, timed, into the local log (logger.ts).
async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const t0 = performance.now();
  const what = cmd === "run_runner" ? { command: args?.command } : {};
  try {
    const r = await invoke<T>(cmd, args);
    log("call", { cmd, ...what, ms: Math.round(performance.now() - t0), ok: true });
    return r;
  } catch (e) {
    log("call", { cmd, ...what, ms: Math.round(performance.now() - t0), ok: false, error: errorText(e) }, "warn");
    throw e;
  }
}

export type Llm = { provider: string; model: string };

/** The effective settings: the active Identity over the App defaults. */
export type Config = {
  schema?: 1;
  /** The Identity's name (setup and Settings edit it here). */
  name?: string;
  onboarded?: boolean;
  ui?: { language: "en" };
  llm: { provider: string; model: string };
  brand?: { preset?: string; logo?: string | null; overrides?: Record<string, string> };
  channel: {
    audience?: string;
    brandVoice?: string;
    profile?: string;
    youtubeUrl?: string | null;
    landingUrl?: string | null;
    ctaText?: string | null;
    contentLanguage?: string;
  };
  narrator: { provider: "edge-tts" | "elevenlabs" | "gemini"; voice?: string | null };
  avatar?: { enabled: boolean; lookId?: string | null; style?: AvatarStyle; position?: AvatarPosition; size?: AvatarSize };
  research?: { vidiq: boolean };
  defaults?: { scriptTemplate?: "ownership"; autopilot?: boolean; targetLengthMin?: number };
};

/** config.json, schema 2: what is the same for every Identity. */
export type BackupSettings = { dir?: string | null; level?: 1 | 2 | 3 | 4; auto?: boolean };
export type LogStatus = { dir: string | null; files: number; bytes: number; session: string; errors: number; warnings: number };

export type AppConfig = {
  schema: 2;
  backup?: BackupSettings;
  onboarded?: boolean;
  ui?: { language: "en" };
  llm: Llm;
  projectsDir?: string | null;
  activeIdentity?: string | null;
  defaults?: { autopilot?: boolean };
};

/** identities/<id>/identity.json. `llm` null: the App's AI settings. */
export type Identity = {
  schema: 1;
  id: string;
  name: string;
  folder: string;
  createdAt?: string;
  llm?: Llm | null;
  brand?: Config["brand"];
  channel: Config["channel"];
  narrator: Config["narrator"];
  avatar?: Config["avatar"];
  research?: Config["research"];
  defaults?: { scriptTemplate?: "ownership"; targetLengthMin?: number };
};

/** A new Identity before the core gives it an id and a folder. */
export type NewIdentity = Omit<Identity, "schema" | "id" | "folder"> & { id?: undefined };

export type IdentityRef = { id: string; name: string; folder: string; youtubeUrl: string | null };
export type Edition = { product: string; tier: "Solo" | "Agency"; identityLimit: number | null; copyKeysDefault: boolean };
export type KeySource = { app: boolean; identity: boolean };
export type Job = { id: number; command: string; identity: string | null; identityName: string | null; project: string | null; state: "running" | "waiting" };

export type AvatarStyle = "cutout" | "circle" | "card" | "full";
export type AvatarPosition = "bottom-right" | "bottom-left" | "top-right" | "top-left";
export type AvatarSize = "small" | "medium" | "large";
export type AvatarLayout = { style: AvatarStyle; position: AvatarPosition; size: AvatarSize };

export type AppState = {
  app: AppConfig | null;
  identity: Identity | null;
  identities: IdentityRef[];
  edition: Edition;
  /** Effective settings (App + active Identity), null before setup. */
  config: Config | null;
  projectsRoot: string;
  /** The active Identity's ONE Videos folder. */
  projectsDir: string;
  defaultProjectsDir: string | null;
  /** Can a job of the active Identity use this key (its own or the App's). */
  keys: Record<string, boolean>;
  keySources: Record<string, KeySource>;
  version: string;
  /** A one-time sentence from the core (a folder that could not be moved...). */
  notice?: string | null;
  /** <backup folder>/IdeaToVideo_Backup, null when backups are off. */
  backupRoot: string | null;
  log: LogStatus;
};

type RawState = Omit<AppState, "config">;
const withConfig = (s: RawState): AppState => ({ ...s, config: s.app && s.identity ? effectiveConfig(s.app, s.identity) : null });

export type Gate = { state: string; mode?: string; at?: string; error?: string; reason?: string };
export type ProjectSummary = { id: string; title: string; status: string; dir: string; createdAt: string; gates: Record<string, Gate> };

export type KeyScope = "app" | "identity";

export const appState = () => call<RawState>("app_state").then(withConfig);
/** Saves the App settings and/or one Identity; an Identity without id is new. */
export const saveSettings = (config: AppConfig | null, identity: Identity | NewIdentity | null) =>
  call<RawState>("save_settings", { config, identity }).then(withConfig);
export const setActiveIdentity = (id: string) => call<RawState>("set_active_identity", { id }).then(withConfig);
export const duplicateIdentity = (id: string, name: string, copyKeys: boolean) =>
  call<RawState>("duplicate_identity", { id, name, copyKeys }).then(withConfig);
export const deleteIdentity = (id: string) => call<RawState>("delete_identity", { id }).then(withConfig);
export const exportIdentity = (id: string, path: string) => call<string>("export_identity", { id, path });
export const importIdentity = (path: string) => call<RawState>("import_identity", { path }).then(withConfig);
export const setKey = (name: string, value: string, scope: KeyScope = "app") => call<void>("set_key", { name, value, scope });
export const deleteKey = (name: string, scope: KeyScope = "app") => call<void>("delete_key", { name, scope });
export const keyStatus = () => call<{ keys: Record<string, boolean>; keySources: Record<string, KeySource> }>("key_status");
export const deleteAllKeys = () => call<void>("delete_all_keys");
/** forNew: the logo of an Identity that does not exist yet (setup, New Identity). */
export const importLogo = (path: string, forNew = false) => call<string>("import_logo", { path, forNew });
export const jobList = () => call<Job[]>("job_list");
export const backupSettingsNow = () => call<number>("backup_settings_now");
export const restoreSettings = (path: string) => call<RawState>("restore_settings", { path }).then(withConfig);
export const cloudFolders = () => call<{ label: string; path: string }[]>("cloud_folders");
export const logStatus = () => call<LogStatus>("log_status");
export const deleteLogs = () => call<LogStatus>("delete_logs");
export type BackupDone = { projectDir: string; ok: boolean; result?: { at: string; path: string; copied: number }; error?: string };
export function onBackupDone(fn: (b: BackupDone) => void): Promise<UnlistenFn> {
  return listen<BackupDone>("backup-done", (e) => fn(e.payload));
}
export function onJobsChanged(fn: (jobs: Job[]) => void): Promise<UnlistenFn> {
  return listen<Job[]>("jobs-changed", (e) => fn(e.payload));
}
export const importMusic = (projectDir: string, path: string) => call<string>("import_music", { projectDir, path });

export function runner<T = any>(command: string, request: Record<string, unknown> = {}) {
  return call<T>("run_runner", { command, request });
}

export type Progress = { command: string; progress: Record<string, unknown> };
export function onProgress(fn: (p: Progress) => void): Promise<UnlistenFn> {
  return listen<Progress>("runner-progress", (e) => fn(e.payload));
}

// Tauri rejects with the Rust Err string; anything else gets a readable form.
export function errorText(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return JSON.stringify(e);
}
