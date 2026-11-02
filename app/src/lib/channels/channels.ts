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
  updatedAt?: string;
};
export type PresetCard = { id: string; label: string; description: string; engine: string; templates: { id: string; label: string }[]; shotRules: Record<string, string>; recorded?: { slots: { id: string; label: string; hint?: string; optional?: boolean }[]; broll?: boolean; cutout?: boolean; zoom?: boolean } };
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
    { label: "Length", value: minutes(r.targetLengthMin) },
  ];
}

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

/** Can this channel make a video right now, or the sentence why not. */
export function blocker(r: Recipe, keys: Record<string, boolean>, aiProvider: string, mode: "idea" | "script"): { text: string; connections: boolean } | null {
  if (r.engine === "recorded") return null;
  if (mode === "idea" && !keys[aiProvider]) return { text: "An idea needs your AI key, to write the script. Add it first, or paste your own script.", connections: true };
  if (r.voice.provider === "elevenlabs" && !keys["elevenlabs"]) return { text: "This channel's voice needs your ElevenLabs key.", connections: true };
  if (r.avatar.on && !keys["heygen"]) return { text: "This channel's avatar needs your HeyGen key.", connections: true };
  return null;
}

export const queueOpen = (q: QueueItem[]) => q.filter((i) => i.script === "pending" || i.script === "approved").length;
