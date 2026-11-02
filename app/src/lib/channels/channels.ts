// channels.ts: the channel screen's data (runner/channels, docs/BUILD_PLAN.md).
// Pure functions, no Tauri imports, so the Node tests load it.

export type Recipe = {
  schema?: string;
  engine: "script" | "recorded";
  preset: string;
  voice: { provider: "kokoro" | "elevenlabs"; voice: string; name?: string };
  avatar: { on: boolean; lookId: string | null; name?: string; engine?: string; layout?: string };
  music: { on: boolean; source: "synth" | "own"; mood: string };
  targetLengthMin: number;
  updatedAt?: string;
};
export type PresetCard = { id: string; label: string; description: string; engine: string; templates: { id: string; label: string }[]; shotRules: Record<string, string> };
export type QueueItem = { dir: string; id: string; title: string; status: string; script: string; error: string | null; running: boolean; batch: string; position: number; of: number; angle?: string };
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

/** The locked recipe in the plain lines the start screen shows. */
export function recipeLines(r: Recipe, presets: PresetCard[], freeVoices: FreeVoice[] = []): { label: string; value: string }[] {
  const preset = presets.find((p) => p.id === r.preset)?.label ?? r.preset;
  const free = freeVoices.find((v) => v.id === r.voice.voice)?.name ?? r.voice.voice;
  return [
    { label: "Engine", value: r.engine === "recorded" ? "Recorded" : "Script" },
    { label: "Style", value: preset },
    { label: "Voice", value: r.voice.provider === "kokoro" ? `${free}, free, on this computer` : `${r.voice.name ?? "My voice"}, ElevenLabs` },
    { label: "Avatar", value: r.avatar.on ? `On${r.avatar.name ? `, ${r.avatar.name}` : ""}` : "Off" },
    { label: "Music", value: !r.music.on ? "Off" : r.music.source === "own" ? "My own files" : `Made by code, ${r.music.mood}` },
    { label: "Length", value: minutes(r.targetLengthMin) },
  ];
}

/** What one video of this recipe costs: said before it starts, never hidden. */
export function costLine(r: Recipe, aiProvider: string): string {
  const paid: string[] = [];
  if (r.voice.provider === "elevenlabs") paid.push("your ElevenLabs voice uses your ElevenLabs credits");
  if (r.avatar.on) paid.push("the avatar uses your HeyGen credits (the price is asked first)");
  if (aiProvider !== "gemini") paid.push("the script and the plan use your AI key's credits");
  const free = aiProvider === "gemini" ? "Script and scene plan on Gemini's free tier." : "";
  if (!paid.length) return `0 USD. ${free} Free voice, music by code, render on this computer.`.replace(/\s+/g, " ").trim();
  return `${free} Costs money here: ${paid.join("; ")}.`.replace(/\s+/g, " ").trim();
}

/** Can this channel make a video right now, or the sentence why not. */
export function blocker(r: Recipe, keys: Record<string, boolean>, aiProvider: string, mode: "idea" | "script"): { text: string; connections: boolean } | null {
  if (mode === "idea" && !keys[aiProvider]) return { text: "An idea needs your AI key, to write the script. Add it first, or paste your own script.", connections: true };
  if (r.voice.provider === "elevenlabs" && !keys["elevenlabs"]) return { text: "This channel's voice needs your ElevenLabs key.", connections: true };
  if (r.avatar.on && !keys["heygen"]) return { text: "This channel's avatar needs your HeyGen key.", connections: true };
  return null;
}

export const queueOpen = (q: QueueItem[]) => q.filter((i) => i.script === "pending" || i.script === "approved").length;
