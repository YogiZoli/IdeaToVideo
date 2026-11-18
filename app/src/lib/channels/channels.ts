// channels.ts: the channel screen's data (runner/channels, docs/BUILD_PLAN.md).
// Pure functions, no Tauri imports, so the Node tests load it.

export type Recipe = {
  schema?: string;
  engine: "script" | "recorded";
  preset: string;
  voice: { provider: "kokoro" | "elevenlabs" | "recording"; voice: string; name?: string };
  avatar: { on: boolean; lookId: string | null; name?: string; engine?: string; layout?: string };
  music: { on: boolean; source: "synth" | "own"; mood: string };
  broll?: { on: boolean };
  recorded?: { cutout: boolean; smoothCursor: boolean };
  targetLengthMin: number;
  // long form 16:9, or a Short 9:16 of 15 to 90 seconds (DECISIONS 188)
  format?: "long" | "short";
  shortSeconds?: number;
  updatedAt?: string;
  // what the start screen begins with, and the other direction's choices (phase 3)
  start?: { text: TextKind; research: boolean };
  directions?: {
    script?: { preset: string; voice: Recipe["voice"]; avatar: Recipe["avatar"]; targetLengthMin: number } | null;
    recorded?: { preset: string; recorded: { cutout: boolean; smoothCursor: boolean } } | null;
  };
};
export type TextKind = "notes" | "finished";
export type Direction = "script" | "recorded";

// The research brief (runner/research) and the Shot map (runner/shots).
export type BriefRow = { text: string; source: number | null };
export type ResearchBrief = {
  state: "pending" | "approved";
  grounded: boolean;
  queries?: string[];
  warnings?: string[];
  facts: BriefRow[];
  numbers: BriefRow[];
  dates: BriefRow[];
  missing: BriefRow[];
  claims: { claim: string; verdict: string; note: string; source: number | null }[];
  sources: { title: string; url: string }[];
};
export type Shot = {
  id: string;
  n: number;
  start: number;
  seconds: number;
  said: string;
  kind: "graphic" | "broll";
  block: string;
  override: boolean;
  call: boolean;
  camera: string;
  transition: string;
  hero: boolean;
  source: string | null;
  license: string | null;
  paid: { tier: string } | null;
  entrances: { text: string; word: string | null; at: number | null; how: string }[];
  flow: { on: boolean; prompt: string; seconds: number; clip: string | null; name: string | null; short: boolean } | null;
};
export type ShotMap = { shots: Shot[]; warning: string | null; summary: { shots: number; broll: number; hero: number; overrides: number; elements: number; onTheirWord: number; withBlock: number } | null };
export type PresetCard = { id: string; label: string; description: string; engine: string; templates: { id: string; label: string }[]; shotRules: Record<string, string>; recorded?: { slots: { id: string; label: string; hint?: string; optional?: boolean }[]; broll?: boolean; cutout?: boolean; zoom?: boolean }; defaults?: { broll?: boolean; research?: boolean; mood?: string }; factChecked?: boolean };
export type QueueItem = { dir: string; id: string; title: string; status: string; script: string; error: string | null; running: boolean; batch: string; position: number; of: number; angle?: string; research?: string | null };
export type FreeVoice = { id: string; name: string; gender: string | null };
export type ChannelState = {
  recipe: Recipe;
  saved: boolean;
  presets: PresetCard[];
  voiceKinds: Record<string, string>;
  musicSources: Record<string, string>;
  moods: string[];
  ownMusic: string[];
  musicDir: string | null;
  freeVoices: FreeVoice[];
  queue: QueueItem[];
  week: number;
};

const minutes = (n: number) => `${n} ${n === 1 ? "minute" : "minutes"}`;

/**
 * The recipe as one direction of this video sees it. The start screen's first
 * choice can differ from the recipe's own engine; nothing is saved by it. Null:
 * this channel has never had a voice for a script video.
 */
export function recipeSide(r: Recipe, direction: Direction): Recipe | null {
  if (r.engine === direction) return r;
  if (direction === "recorded") {
    const side = r.directions?.recorded;
    return { ...r, engine: "recorded", preset: side?.preset ?? "talking-head", recorded: side?.recorded ?? { cutout: false, smoothCursor: true }, voice: { provider: "recording", voice: "own" } };
  }
  const side = r.directions?.script;
  return side ? { ...r, engine: "script", ...side } : null;
}

/** The search words for a fact's picture: its first few real words, no numbers. Pure. */
const NOT_A_PICTURE = new Set("a an and are as at be been but by for from had has have he her his in into is it its of on or she that the their they this to was were which while who will with about after before most many more than then there these those over under between during".split(" "));
export function pictureWords(fact: string, max = 5): string {
  const words = String(fact ?? "").toLowerCase().replace(/[^\p{L}\s-]/gu, " ").split(/\s+/).filter((w) => w.length > 2 && !NOT_A_PICTURE.has(w));
  return words.slice(0, max).join(" ");
}

/** The locked recipe in the plain lines the start screen shows. */
export function recipeLines(r: Recipe, presets: PresetCard[], freeVoices: FreeVoice[] = []): { label: string; value: string }[] {
  const preset = presets.find((p) => p.id === r.preset)?.label ?? r.preset;
  const free = freeVoices.find((v) => v.id === r.voice.voice)?.name ?? r.voice.voice;
  if (r.engine === "recorded") {
    const card = presets.find((p) => p.id === r.preset);
    return [
      { label: "Engine", value: "Recorded" },
      { label: "Style", value: preset },
      { label: "Voice", value: "The recording's own" },
      { label: "Music", value: !r.music.on ? "Off" : r.music.source === "own" ? "My own files" : `Made by code, ${r.music.mood}` },
      ...(card?.recorded?.broll ? [{ label: "B-roll", value: r.broll?.on ? "On, free sources first" : "Off" }] : []),
      ...(card?.recorded?.cutout ? [{ label: "Person cut-out", value: r.recorded?.cutout ? "On" : "Off" }] : []),
      ...(card?.recorded?.zoom ? [{ label: "Smooth cursor", value: r.recorded?.smoothCursor === false ? "Off" : "On" }] : []),
    ];
  }
  return [
    { label: "Engine", value: "Script" },
    { label: "Style", value: preset },
    { label: "Voice", value: r.voice.provider === "kokoro" ? `${free}, free, on this computer` : `${r.voice.name ?? "My voice"}, ElevenLabs` },
    { label: "Avatar", value: r.avatar.on ? `On${r.avatar.name ? `, ${r.avatar.name}` : ""}` : "Off" },
    { label: "Music", value: !r.music.on ? "Off" : r.music.source === "own" ? "My own files" : `Made by code, ${r.music.mood}` },
    { label: "B-roll", value: r.broll?.on ? "On, free sources first" : "Off" },
    { label: "Length", value: r.format === "short" ? `Short 9:16, ${r.shortSeconds ?? 60} seconds` : minutes(r.targetLengthMin) },
  ];
}

/** The Short lengths a recipe or a video can take (runner/shorts/index.mjs SHORT_SECONDS). */
export const SHORT_SECONDS = [15, 30, 45, 60, 90];

/** What each line of the recipe decides, in a few plain words (Home, DECISIONS 175). */
export const RECIPE_HELP: Record<string, string> = {
  Style: "How the video looks",
  Voice: "Who reads the script",
  Avatar: "A person on screen, from HeyGen",
  Music: "What plays under the voice",
  "B-roll": "Extra clips between the scenes",
  Length: "How long a video should be",
};

/** What one video of this recipe costs: said before it starts, never hidden. */
export function costLine(r: Recipe, aiProvider: string): string {
  if (r.engine === "recorded") return `0 USD for the words, the cuts and the render, all on this computer.${aiProvider === "gemini" ? " Chapters and big words on Gemini's free tier." : " Chapters and big words use your AI key's credits, or a rule without a key."}`;
  const paid: string[] = [];
  if (r.voice.provider === "elevenlabs") paid.push("your ElevenLabs voice uses your ElevenLabs credits");
  if (r.avatar.on) paid.push("the avatar uses your HeyGen credits (the price is asked first)");
  if (aiProvider !== "gemini") paid.push("the script and the plan use your AI key's credits");
  const free = aiProvider === "gemini" ? "Script and scene plan on Gemini's free tier." : "";
  if (!paid.length) return `0 USD. ${free} Free voice, music by code, render on this computer.`.replace(/\s+/g, " ").trim();
  return `${free} Costs money here: ${paid.join("; ")}.`.replace(/\s+/g, " ").trim();
}

/**
 * What this video does without a key that is missing, or null. Nothing stops a video: a
 * missing key means the hand-written or the free way (docs/AUDIT_REPORT.md), said here first.
 */
export function blocker(r: Recipe, keys: Record<string, boolean>, aiProvider: string, mode: "idea" | "script" | "notes", research = false, factChecked = false): { text: string; connections: boolean } | null {
  if (r.engine === "recorded") return null;
  if (mode === "idea" && !keys[aiProvider]) return { text: "No AI key is set, so you write the script by hand on the next screen. Add a key to have it written for you.", connections: true };
  if (mode === "notes" && !keys[aiProvider]) return { text: "No AI key is set, so your notes become the draft as they are, for you to edit. Add a key to have them turned into a script.", connections: true };
  if (research && !keys[aiProvider]) return { text: factChecked ? "No AI key is set, so this style cannot fact-check this script, and the Publishing Card says it is unchecked." : "No AI key is set, so nothing is researched, and the Publishing Card says it is unchecked.", connections: true };
  if (r.voice.provider === "elevenlabs" && !keys["elevenlabs"]) return { text: "No ElevenLabs key, so the free voice reads an English video. Another language needs the key.", connections: true };
  if (r.avatar.on && !keys["heygen"]) return { text: "No HeyGen key, so this video is made without its avatar.", connections: true };
  return null;
}

export const queueOpen = (q: QueueItem[]) => q.filter((i) => i.script === "pending" || i.script === "approved").length;
