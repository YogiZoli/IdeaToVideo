// api.ts: the only place the UI talks to the Rust core. Keys go in (set_key),
// only booleans come back (key_status). Every network call runs in the runner.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type Config = {
  schema: 1;
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
  projectsDir?: string | null;
};

export type AvatarStyle = "cutout" | "circle" | "card" | "full";
export type AvatarPosition = "bottom-right" | "bottom-left" | "top-right" | "top-left";
export type AvatarSize = "small" | "medium" | "large";
export type AvatarLayout = { style: AvatarStyle; position: AvatarPosition; size: AvatarSize };

export type AppState = {
  config: Config | null;
  projectsDir: string;
  defaultProjectsDir: string | null;
  keys: Record<string, boolean>;
  version: string;
};

export type Gate = { state: string; mode?: string; at?: string; error?: string; reason?: string };
export type ProjectSummary = { id: string; title: string; status: string; dir: string; createdAt: string; gates: Record<string, Gate> };

export const appState = () => invoke<AppState>("app_state");
export const saveConfig = (config: Config) => invoke<AppState>("save_config", { config });
export const setKey = (name: string, value: string) => invoke<void>("set_key", { name, value });
export const deleteKey = (name: string) => invoke<void>("delete_key", { name });
export const keyStatus = () => invoke<Record<string, boolean>>("key_status");
export const deleteAllKeys = () => invoke<void>("delete_all_keys");
export const importLogo = (path: string) => invoke<string>("import_logo", { path });
export const importMusic = (projectDir: string, path: string) => invoke<string>("import_music", { projectDir, path });

export function runner<T = any>(command: string, request: Record<string, unknown> = {}) {
  return invoke<T>("run_runner", { command, request });
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
