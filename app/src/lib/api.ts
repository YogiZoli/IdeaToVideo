// api.ts: the only place the UI talks to the Rust core. Keys go in (set_key),
// only booleans come back (key_status). Every network call runs in the runner.
// Settings come in two levels, the App and the active Identity (docs/identity.md);
// `AppState.config` is the two merged, the shape every gate reads.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { effectiveConfig } from "./identity";
import { log } from "./logger";
import { plainMessage } from "./errors";
import type { Series } from "./course/course";

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

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
/** One model with its effort (null: the provider's own default, or none). */
export type StepLlm = { provider: string; model: string; effort?: Effort | null; waitSeconds?: number };
/** The steps that can have their own model (llm.ts, DECISIONS 89). */
export type LlmStep = "script" | "scenes" | "texts";
export type Llm = StepLlm & { perStep?: boolean; steps?: Partial<Record<LlmStep, StepLlm>>; waitSeconds?: number };

/** The effective settings: the active Identity over the App defaults. */
export type Config = {
  schema?: 1;
  /** The Identity's name (setup and Settings edit it here). */
  name?: string;
  onboarded?: boolean;
  ui?: { language: "en"; advanced?: boolean };
  llm: Llm;
  brand?: { preset?: string; logo?: string | null; overrides?: Record<string, string> };
  channel: {
    audience?: string;
    brandVoice?: string;
    profile?: string;
    youtubeUrl?: string | null;
    landingUrl?: string | null;
    ctaText?: string | null;
    contentLanguage?: string;
    /** The natural-voice pass after the script (DECISIONS 88), off by default. */
    humanize?: "off" | "light" | "strong";
  };
  narrator: { provider: "edge-tts" | "elevenlabs" | "gemini" | "kokoro" | "googlecloud" | "azure"; voice?: string | null };
  avatar?: { enabled: boolean; lookId?: string | null; engine?: "avatar_iii" | "avatar_iv" | "avatar_v"; style?: AvatarStyle; position?: AvatarPosition; size?: AvatarSize };
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
  ui?: { language: "en"; advanced?: boolean };
  llm: Llm;
  projectsDir?: string | null;
  activeIdentity?: string | null;
  defaults?: { autopilot?: boolean };
  /** Send to Publishing (DECISIONS 115); the token is in the keychain. */
  publishing?: { url?: string | null };
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

export type AvatarStyle = "cutout" | "circle" | "card" | "full" | "overlay";
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
export type ProjectSummary = { id: string; title: string; status: string; dir: string; createdAt: string; gates: Record<string, Gate>; render?: { state?: string } | null; recipe?: { engine?: string } | null; series?: Series | null; queue?: { batch: string; position: number; of: number } | null };

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
export const importLogo = (path: string, forNew = false, variant: "light" | "dark" = "light") => call<string>("import_logo", { path, forNew, variant });
/** A profile photo for the Thumbnail step into the active Identity (DECISIONS 131). */
export const importPhoto = (path: string) => call<string>("import_photo", { path });
export const removePhoto = (name: string) => call<void>("remove_photo", { name });
export const jobList = () => call<Job[]>("job_list");
/** Stop: a waiting job leaves the queue, a running one ends with all it started. */
export const stopJob = (id: number) => call<void>("stop_job", { id });
/** Settings, General: one zip with the logs and every ONE Video's state, no keys. */
export const exportDiagnostics = (path: string) => call<string>("export_diagnostics", { path });
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

// ---- Brand Identity Card and dictionary (docs/wizards/brand.md) ----------------------

export type CardColors = { background: string; text: string; muted: string; surface: string; border: string; primary: string; secondary: string; tertiary: string };
export type CardFont = { family: string; weight?: number; source?: "bundled" };
export type BrandCard = {
  schema: "brand-identity-card/1";
  name?: string;
  updatedAt?: string;
  source?: { kind: "preset" | "logo" | "scratch" | "import"; preset?: string };
  appearance?: "light" | "dark";
  colors: CardColors;
  fonts: { display: CardFont; body: CardFont; mono?: CardFont };
  shape: { corners: "none" | "small" | "medium" | "large"; radiusPx?: number; cards: "flat" | "border" | "shadow" };
  logo?: { light?: string | null; dark?: string | null };
  nameplate?: { name?: string; title?: string; url?: string };
};
export type ContrastRow = { id: string; label: string; fg: keyof CardColors; bg: keyof CardColors; min: number; ratio: number; ok: boolean; fix: string | null };
export type ShippedFont = { id: string; family: string; category: string; files: { file: string; weight: string; unicodeRange: string }[] };
export type GalleryLook = { id: string; label: string; group: string; card: BrandCard };
export type BrandState = { card: BrandCard; own: boolean; presets: GalleryLook[]; styleNote: string; fonts: ShippedFont[]; contrast: ContrastRow[]; fontsDir: string; brandDir: string | null };
export const HYPERFRAMES_GROUP = "HyperFrames presets";
export const exportBrand = (path: string) => call<string>("export_brand", { path });
export const importFootage = (path: string) => call<string>("import_footage", { path });
export const importSegment = (path: string) => call<string>("import_segment", { path });
export const openPublishingLink = (url: string) => call<void>("open_publishing_link", { url });
export const openSourceLink = (projectDir: string, url: string) => call<void>("open_source_link", { projectDir, url });
export const exportCard = (file: string, path: string) => call<string>("export_card", { file, path });
/** A rendered video (and its .srt) out of the project; never overwrites. */
export const exportVideo = (file: string, path: string) => call<string>("export_video", { file, path });
export const importBrand = (path: string) => call<BrandCard>("import_brand", { path });
export const readTokensFile = (path: string) => call<string>("read_tokens_file", { path });
export type Still = { scene: number; at: number; file: string };

export type Dictionary = {
  schema: "dictionary/1";
  preferred: { term: string; note?: string }[];
  banned: { term: string; instead?: string }[];
  distinct: { a: string; b: string; note?: string }[];
  positions: { against: string; kind?: "phenomenon" | "type" | "person"; stance?: string }[];
};
// The Identity's Motion profile (runner/motion/profile.mjs, docs/wizards/motion.md 4).
export type MotionProfile = {
  schema: "motion-profile/1";
  updatedAt?: string;
  transition: { mood: string; primary: string; accent: string | null; energy: "calm" | "medium" | "high"; where: "every" | "sections"; direction?: "LEFT" | "RIGHT" | "UP" | "DOWN" };
  background: { type: "plain" | "grain-field" | "aurora-drift"; vars: Record<string, string | number | boolean> };
  camera: { move: "off" | "jitter" | "push" };
  /** How often the picture changes (runner/gates/scenes/roles.mjs PACES). */
  pace?: "calm" | "balanced" | "fast";
  /** Burned-in captions (runner/captions/): a caption-* style or "off". */
  captions?: { style: string };
  /** The spoken word highlighted in a scene's own text (runner/gates/build/spoken.mjs). */
  spokenWord?: "highlight" | "off";
  scenes: { off: string[]; style: Record<string, Record<string, string | number | boolean>> };
};
export type MotionTransition = { name: string; kind: "cut" | "css" | "shader"; label: string };
export type MotionStyleVar = { id: string; type: string; label: string; description?: string; default: unknown; options?: { value: string; label: string }[] };
export type MotionOptions = {
  moods: { id: string; label: string; hint: string; energy: string; primary: string; accent: string | null; transitions: MotionTransition[] }[];
  energies: { id: string; label: string; seconds: number }[];
  transitions: MotionTransition[];
  backgrounds: { id: string; label: string; darkOnly: boolean; cost: string | null }[];
  shaderCost: string;
  cameras: { id: string; label: string }[];
  paces?: { id: string; label: string; picture: string }[];
  captions?: { id: string; label: string; hint: string; calm: boolean; image: string | null }[];
  scenes: { role: string; label: string; hint: string; components: { name: string; label: string; description: string; style: MotionStyleVar[] }[] }[];
};
/** The Identity's Scenes profile (runner/scenes-profile.mjs, DECISIONS 110). */
export type SceneKind = "text" | "icon" | "image" | "video";
export type ScenesProfile = { schema: "scenes-profile/1"; preset: string; mix: Record<SceneKind, number>; off: string[]; icons: { families: string[] }; pictures: { sources: string[]; unsplashOk?: boolean }; updatedAt?: string };
export type ScenesState = {
  profile: ScenesProfile;
  saved: boolean;
  options: {
    presets: { id: string; label: string; hint: string; mix: Record<SceneKind, number> }[];
    kinds: { id: SceneKind; label: string }[];
    roles: { role: string; label: string; hint: string; components: { name: string; label: string; description?: string }[] }[];
    icons: { id: string; label: string; license: string; count: number; sample: string[][] }[];
    sources: { id: string; label: string; hint: string; kinds: SceneKind[]; later: boolean }[];
    footage: number;
    pace: string;
  };
};
export type MotionState = { profile: MotionProfile | null; recommended: { mood: string; energy?: string; reason: string | null }; start: MotionProfile; light: boolean; options: MotionOptions };
export type MotionPreview = { file: string; seconds: number; renderSeconds: number; notes: string[]; transitions: string[] };

// The comment calls (runner/cta, docs/wizards/cta.md).
export type CtaSlot = "start" | "middle" | "end";
export type CtaKeyword = { keyword: string; temperature: "cold" | "warm" | "hot"; gets: string };
export type CtaTemperature = { label: string; meaning: string; dot: string; surface: string; text: string };
export type CtaMode = "narrator" | "segment" | "auto" | "heygen" | "upload" | "previous" | "heygen-new";
export type CtaProfile = {
  schema?: string;
  updatedAt?: string;
  slots: Record<CtaSlot, string | null>;
  modes?: Record<CtaSlot, CtaMode>;
  offers: Record<string, string>;
  endScreen?: 0 | 5 | 10 | 15 | 20;
};
export type CtaSegment = { id: string; keyword: string; name: string; file: string; seconds: number; source: "upload" | "heygen" | "heygen-import"; heygenId?: string; text?: string | null; createdAt: string; lastUsedAt: string | null };
export type CtaState = {
  profile: CtaProfile | null;
  start: CtaProfile;
  options: { keywords: CtaKeyword[]; temperatures: Record<string, CtaTemperature>; slots: Record<CtaSlot, { label: string; hint: string }>; placesForCount: Record<string, CtaSlot[]> };
  look: { bg: string; fg: string; font: string; buttons: Record<string, string> };
  last: CtaProfile | null;
  segments: CtaSegment[];
};

// The Identity's own footage (runner/footage/library.mjs).
export type FootageClip = { id: string; file: string; name: string; description: string; seconds: number; shots: number[]; stills: string[]; source: string; used: { project: string; start: number; end: number }[]; createdAt: string; generated?: GeneratedInfo };
/** A clip AI made (runner/broll, AI B-roll). */
export type GeneratedInfo = { generator: string; label: string; quality: string; aspect: string; prompt: string; seconds: number; usd: number; videoId: string; project: string; test?: boolean; at: string };

// AI B-roll (runner/broll, docs/ai-broll.md).
export type BrollQuality = "480p" | "768p" | "1080p";
export type PaidSettings = { on: boolean; model: string; quality: string; maxPerVideoUsd: number; maxPerMonthUsd: number };
export type BrollSettings = { schema?: string; enabled: boolean; generator: string; quality: BrollQuality; capUsd: number; paid: PaidSettings };
export type PaidChoice = { model: string; label: string; limits: { perVideo: { min: number; max: number; default: number }; perMonth: { min: number; max: number; default: number } }; qualities: { id: string; clipUsd: number; seconds: number }[] };
// The B-roll engine (runner/broll/engine.mjs, docs/BUILD_PLAN.md phase 1b).
export type BrollEngineItem = { id: string; scene: number; said: string; seconds: number; query: string; hero: boolean; prompt: string; use: boolean; state: "planned" | "done" | "none" | "failed" | "ordered"; source: string | null; clip?: string | null; usd?: number; license?: string | null; sourceUrl?: string | null; author?: string | null; checked?: boolean; paidWanted?: boolean; overBudget?: boolean; paidTier?: "image" | "video"; aiTier?: "image" | "video" };
export type BrollReviewState = {
  plan: { auto: true; finished?: boolean; stale: boolean; items: BrollEngineItem[] } | null;
  clips: Record<string, FootageClip | null>;
  footageDir: string | null;
  paid: PaidSettings & { label: string; imageLabel: string; imageUsd: number; clipUsd: number; clips: number; totalUsd: number; spentVideoUsd: number; spentMonthUsd: number; leftVideoUsd: number; leftMonthUsd: number; over: boolean };
};
export type BrollChoices = { generators: { id: string; label: string; test: boolean; usdPerSecond: Record<string, number> }[]; qualities: { id: BrollQuality; label: string; note: string }[] };
export type BrollItem = { id: string; scene: number; from: string; to: string; said: string; start: number; seconds: number; order: number; prompt: string; library: string | null; use: boolean; state: "planned" | "ordered" | "done" | "failed"; attempt: number; clip?: string | null; file?: string; usd?: number; error?: string | null };
export type BrollPlan = { schema: string; auto?: boolean; aspect: string; spentUsd: number; items: BrollItem[]; at: string; stale: boolean };
export type BrollEstimate = { generator?: string; generatorLabel?: string; test?: boolean; quality?: string; items: number; pending?: number; fromLibrary: number; seconds: number; usd: number; capUsd: number; spentUsd: number; leftUsd: number; overCap: boolean };
export type BrollState = BrollChoices & { settings: BrollSettings; plan: BrollPlan | null; estimate: BrollEstimate; clips: Record<string, FootageClip | null>; footageDir: string | null; note?: string | null };
export type FootageState = { mode: "scene" | "background"; clips: FootageClip[]; dir: string; modes: Record<string, string>; maxSeconds: number };

export type DictFinding = { kind: "banned" | "spelling"; term: string; found: string; instead?: string; where: string };

export function runner<T = any>(command: string, request: Record<string, unknown> = {}) {
  return call<T>("run_runner", { command, request });
}

export type Progress = { command: string; progress: Record<string, unknown> };
export function onProgress(fn: (p: Progress) => void): Promise<UnlistenFn> {
  return listen<Progress>("runner-progress", (e) => fn(e.payload));
}

// Tauri rejects with the Rust Err string; anything else gets a readable form.
export function errorText(e: unknown): string {
  if (typeof e === "string") return plainMessage(e);
  if (e instanceof Error) return plainMessage(e.message);
  log("ui_error", { thrown: JSON.stringify(e) }, "error");
  return plainMessage("");
}
