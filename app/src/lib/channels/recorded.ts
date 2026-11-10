// recorded.ts: what the screens say about a recording (runner/recorded). Pure
// functions, no Tauri imports, so the Node tests load them.

export type Check = { ok: boolean; words: number; wordsOnSpeech: number; speechWithWords: number; drift: number; past: number; seconds: number };
export type Mark = { id: string; kind: string; start: number; end: number; text: string; on: boolean };
export type Cuts = { before: number; after: number; removed: number; counts: Record<string, number>; check: Check; careful: boolean; marks: Mark[]; keepPauses: boolean; words: number };
export type Plan = {
  title: string;
  total: number;
  plannedBy?: string;
  chapters: { start: number; sentence: string; title: string }[];
  bigWords: { id: string; text: string; start: number; end: number; behind: boolean }[];
  layouts: { start: number; mode: string }[];
  beats: { start: number; color: string }[];
};
export type RecordedState = {
  input: { files: Record<string, string>; voice: string; notes?: string[]; kind?: string | null; bubble?: { mode: "camera" | "box" | "avatar"; box?: { x: number; y: number; w: number; h: number } | null; skipped?: boolean; source?: string; state?: string } | null } | null;
  preset?: string;
  cuts: Cuts | null;
  plan: Plan | null;
  after: Check | null;
  kept: number | null;
  motion: { usable: boolean; clicks: number; zooms: unknown[]; painted: boolean } | null;
};
export type Slot = { id: string; label: string; hint?: string; optional?: boolean };

const minutes = (s: number) => {
  const t = Math.round(s);
  return t < 60 ? `${t} s` : `${Math.floor(t / 60)} min ${String(t % 60).padStart(2, "0")} s`;
};

/** One line about the cuts. */
export function cutLine(c: Cuts): string {
  const parts = [`${minutes(c.before)} down to ${minutes(c.after)}`];
  const say = (n: number | undefined, one: string, many: string) => (n ? `${n} ${n === 1 ? one : many}` : null);
  const what = [say(c.counts.take, "repeated take", "repeated takes"), say(c.counts.filler, "filler word", "filler words"), say(c.counts.sound, "sound with no word", "sounds with no word")].filter(Boolean);
  if (what.length) parts.push(what.join(", "));
  return `${parts.join(": ")}, and the long pauses.`;
}

/** One line about how the words fit the recording, before and after the cuts. */
export function checkLine(c: Check, after: Check | null): string {
  const before = `${Math.round(c.wordsOnSpeech * 100)}% of the ${c.words} words sit on speech, ${Math.round(c.speechWithWords * 100)}% of the speech has a word, word starts within ${c.drift.toFixed(2)} s of the sound.`;
  if (!c.ok) return `The words do not fit the sound well: ${before}`;
  if (!after) return `Checked against the recording: ${before}`;
  return `Checked against the recording: ${before} Checked again on the cut sound: ${Math.round(after.wordsOnSpeech * 100)}% on speech, within ${after.drift.toFixed(2)} s.`;
}

const STEPS: Record<string, string> = {
  "line-up": "Lining up the files by their sound",
  transcribe: "Listening: the words of the recording, on this computer",
  "model-download": "Downloading a model, once",
  "recorded-cut": "Cutting the picture",
  "recorded-sound": "Cutting the sound",
  mixing: "Bringing the sound to YouTube's level",
  "recorded-plan": "The AI is naming the chapters and picking the big words",
  "recorded-cursor": "Following the cursor",
  "recorded-paint": "Painting out the original cursor",
  "recorded-matte": "Finding the person in every frame",
  "recorded-figure": "Making the silhouette",
  "recorded-cutout": "Cutting out the person for the big words",
};

/** The step in words, with its percent. Unknown steps: null. */
export function stepText(p: { step?: string; percent?: number; n?: number; of?: number }): string | null {
  const t = STEPS[p.step ?? ""];
  if (!t) return null;
  if (p.percent !== undefined) return `${t}: ${p.percent}%`;
  return p.n && p.of ? `${t}: ${p.n} of ${p.of}` : t;
}

/** Which files are still missing, as a sentence, or null. Same rule as runner/recorded. */
export function filesMissing(preset: string, files: Record<string, string>): string | null {
  const has = (s: string) => !!files[s];
  switch (preset) {
    case "talking-head":
      return has("camera") || has("combined") ? null : "Choose the camera file.";
    case "screen-recording":
      return has("screen") || has("combined") ? null : "Choose the screen file, or one combined file.";
    case "screen-share":
      return has("camera") && has("screen") ? null : "Screen Share needs a camera file and a screen file.";
    case "profile-silhouette":
      return has("camera") ? null : "Choose the side-angle take.";
    default:
      return "Choose a preset in the recipe.";
  }
}
