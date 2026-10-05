// progressInfo.ts: what the progress bar tells the user besides the percent
// (Zoltan, 2026-10-01): what is happening right now, in words; what this step
// uses up (AI tokens, credits) and what it does not; and what the user may do
// meanwhile. Pure functions, no Tauri imports, so the Node tests load it.

/** Plain-words phase for a runner progress step. Unknown steps: null. */
export function phaseText(command: string, step: string | undefined): string | null {
  const s = step ?? "";
  const table: Record<string, string> = {
    writing: "The AI is writing the script",
    planning: "The AI is planning the scenes",
    repairing: "Fixing what the AI returned",
    voice: "Reading the script aloud",
    joining: "Joining the voice parts",
    mixing: "Mixing voice and music",
    sentences: "Timing every sentence",
    music: "ElevenLabs is composing the music",
    build: "Putting the scenes together",
    lint: "Checking the video for errors",
    check: "Checking the video for errors",
    snapshots: "Taking a still of every scene",
    sheet: "Making the overview sheet",
    render: "Recording the video frame by frame",
    browser: "Getting the video engine's browser",
    heygen: "HeyGen is making the avatar clips",
    upload: "Sending the narration to HeyGen",
    previews: "Loading avatar pictures",
    backup: "Copying files into the backup folder",
    retry: "The AI service did not answer, trying again",
    fallback: "The AI model is busy, switching to the other model",
  };
  if (table[s]) return table[s];
  if (command === "render-video") return "Recording the video frame by frame";
  return null;
}

/** What this step costs, said plainly, including what it does NOT use. */
export function costText(command: string, provider?: string): string {
  const local = "Runs on this computer only. No AI tokens and no credits from any service.";
  switch (command) {
    case "write-script":
    case "make-scenes":
    case "refill-scene":
      return "Uses AI tokens from your AI key (a few cents at most). No other credits.";
    case "make-voice":
      return provider === "elevenlabs"
        ? "Uses ElevenLabs characters from your plan. No AI tokens for the script."
        : "Uses your Gemini key for the voice (free tier or a few cents). No other credits.";
    case "make-music":
      return "Uses ElevenLabs credits for the music. No AI tokens.";
    case "make-avatar":
      return "Uses HeyGen credits (you approved the estimate). No AI tokens.";
    case "avatar-looks":
      return "Free: only reads your HeyGen avatar list. No credits.";
    default:
      return local; // set-music, build-video, render-video, check-video
  }
}

/** What the user may do meanwhile. */
export function adviceText(command: string): string {
  const where = command === "make-avatar" || command === "make-music" ? "The service works on it, and the app waits for the result and saves it" : "The app does this work on your computer";
  return `Keep the app open and do not put the computer to sleep or close the lid. ${where}, so the step stops if the computer sleeps. The app keeps the computer awake by itself while it works. You can use other programs meanwhile.`;
}

/** Percent from time alone. Past the estimate it keeps creeping toward 99
 * instead of freezing at 95, so the bar never looks dead. */
export function percentByTime(elapsed: number, expect: number | null): number {
  if (!expect) return 0;
  const r = elapsed / expect;
  if (r <= 1) return 95 * r;
  return 95 + 4 * (1 - Math.exp(-(r - 1)));
}

/** "1:05" style clock. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ---- the numbers of a bar (DECISIONS 85) ------------------------------
// One runner progress event at a time into a Track, and the percent, time
// left and "late" at a given moment. work.svelte.ts keeps the tracks for the
// whole app, so a bar that appears later still shows the right numbers.

export type Track = {
  command: string;
  project: string | null;
  started: number;
  /** seconds the runner expects, grown by retries and repairs */
  expect: number | null;
  /** the first estimate, before retries and repairs */
  base: number | null;
  /** measured percent (render frames, voice parts, avatar pictures) */
  real: number | null;
  /** when `real` first moved, and from where: the rate for the time left */
  realFrom: { at: number; value: number } | null;
  floor: number;
  phase: string | null;
  waiting: string | null;
  last: Record<string, unknown>;
};

const BUILD_FLOORS: Record<string, number> = { build: 0, lint: 5, check: 12, snapshots: 72, sheet: 95 };
const VOICE_TAIL: Record<string, number> = { joining: 92, mixing: 95, sentences: 99 };

export function fresh(command: string, project: string | null): Track {
  return { command, project, started: Date.now(), expect: null, base: null, real: null, realFrom: null, floor: 0, phase: null, waiting: null, last: {} };
}

function setReal(t: Track, value: number) {
  if (t.realFrom === null && value > 0) t.realFrom = { at: Date.now(), value };
  t.real = value;
}

/** One runner progress event into its track. Exported for the tests. */
export function apply(t: Track, s: Record<string, unknown>) {
  const command = t.command;
  t.last = s;
  if (s.step === "waiting" && typeof s.message === "string") {
    t.waiting = s.message;
    return;
  }
  if (t.waiting) {
    t.waiting = null;
    t.started = Date.now();
  }
  const said = phaseText(command, typeof s.step === "string" ? s.step : undefined);
  if (said) t.phase = said;
  if (s.step === "estimate" && typeof s.expectSeconds === "number") {
    t.expect = s.expectSeconds;
    t.base = s.expectSeconds;
    t.started = Date.now();
    t.real = null;
    t.realFrom = null;
    t.floor = 0;
    return;
  }
  // An AI call that has to be repaired or tried again takes longer: the
  // estimate grows with it, instead of the bar sitting at 99% (measured
  // 2026-10-05: a script with four repairs took 131 s against 60).
  if (t.base) {
    if (s.step === "repairing" || s.step === "fallback") t.expect = (t.expect ?? t.base) + t.base * 0.8;
    if (s.step === "retry") t.expect = (t.expect ?? t.base) + 8;
  }
  if (command === "render-video" && typeof s.percent === "number") setReal(t, s.percent);
  if (command === "make-voice") {
    if (s.step === "voice" && typeof s.block === "number" && typeof s.of === "number") {
      const inBlock = typeof s.sentence === "number" && typeof s.sentences === "number" ? s.sentence / s.sentences : 0;
      setReal(t, Math.round(((s.block - 1 + inBlock) / s.of) * 90));
    } else if (typeof s.step === "string" && s.step in VOICE_TAIL) setReal(t, VOICE_TAIL[s.step]);
  }
  if (command === "build-video" && typeof s.step === "string" && s.step in BUILD_FLOORS) t.floor = BUILD_FLOORS[s.step];
  if (command === "avatar-looks" && s.step === "previews" && typeof s.done === "number" && typeof s.of === "number") {
    t.expect = t.expect ?? 1;
    setReal(t, s.of ? Math.round((s.done / s.of) * 100) : 100);
  }
}

/** Percent, seconds left (null: unknown) and late, at `now`. */
export function measure(t: Track, now: number) {
  const elapsed = (now - t.started) / 1000;
  const byTime = percentByTime(elapsed, t.expect);
  const percent = Math.round(Math.min(99, t.real ?? Math.max(t.floor, byTime)));
  let left: number | null = t.expect ? Math.max(0, t.expect - elapsed) : null;
  // a measured rate, once there is enough of it: from where `real` started
  // moving, so a quick setup stage does not promise "finishing now"
  if (t.real !== null && t.realFrom && t.real - t.realFrom.value >= 3) {
    const rate = (t.real - t.realFrom.value) / ((now - t.realFrom.at) / 1000);
    if (rate > 0) left = (100 - t.real) / rate;
  }
  const late = t.expect !== null && t.real === null && elapsed > t.expect * 1.4;
  return { percent, left, late, elapsed };
}

