// progressInfo.ts: what the progress bar tells the user besides the percent
// (Zoltan, 2026-10-01): what is happening right now, in words; what this step
// uses up (AI tokens, credits) and what it does not; and what the user may do
// meanwhile. Pure functions, no Tauri imports, so the Node tests load it.

/** Plain-words phase for a runner progress step. Unknown steps: null. */
export function phaseText(command: string, step: string | undefined): string | null {
  const s = step ?? "";
  const table: Record<string, string> = {
    writing: "The AI is writing the script",
    humanizing: "Making it sound like a person talking",
    planning: "The AI is reading the scene catalog",
    choosing: "The AI is reading the code of the best scene types",
    visual: "The AI is looking at the scenes",
    "visual-swap": "Swapping a scene for a better fit",
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
    browser: "Downloading the render browser",
    heygen: "HeyGen is making the avatar clips",
    slept: "The computer was asleep",
    upload: "Sending the narration to HeyGen",
    previews: "Loading avatar pictures",
    backup: "Copying files into the backup folder",
    retry: "The AI service did not answer, trying again",
    fallback: "The AI model is busy, switching to the other model",
    "model-download": command.startsWith("recorded") ? "Downloading a model, once" : "Downloading the free voice, once",
    "line-up": "Lining up the files by their sound",
    transcribe: "Listening: the words of the recording, on this computer",
    "recorded-cut": "Cutting the picture",
    "recorded-sound": "Cutting the sound",
    "recorded-plan": "The AI is naming the chapters and picking the big words",
    "recorded-cursor": "Following the cursor",
    "recorded-paint": "Painting out the original cursor",
    "recorded-matte": "Finding the person in every frame",
    "recorded-figure": "Making the silhouette",
    "recorded-cutout": "Cutting out the person for the big words",
    ideas: "The AI is planning the week",
    "batch-script": "The AI is writing the week's scripts",
    "broll-order": "Ordering the B-roll clips from HeyGen",
    "broll-clip": "HeyGen is making the B-roll clips",
  };
  if (command === "make-template-scenes" && s === "planning") return "The AI is filling the scene templates";
  if (command === "simple-template-scenes" && s === "planning") return "Planning the scenes by rule, no AI";
  if (command === "broll-plan" && s === "planning") return "The AI is choosing where B-roll clips go";
  if (command === "broll-make" && s === "broll-clip") return "Making the B-roll clips";
  if (table[s]) return table[s];
  if (command === "render-video") return "Recording the video frame by frame";
  return null;
}

/** What this step costs, said plainly, including what it does NOT use. */
export function costText(command: string, provider?: string): string {
  const local = "Runs on this computer only. No AI tokens and no credits from any service.";
  switch (command) {
    case "write-script":
      return "Uses AI tokens from your AI key (a few cents at most). No other credits.";
    case "make-scenes":
    case "refill-scene":
    case "visual-check":
      return "Uses AI tokens from your AI key (you saw the price first). No other credits.";
    case "make-voice":
      return provider === "elevenlabs"
        ? "Uses ElevenLabs characters from your plan. No AI tokens for the script."
        : "Uses your Gemini key for the voice (free tier or a few cents). No other credits.";
    case "make-music":
      return "Uses ElevenLabs credits for the music. No AI tokens.";
    case "make-avatar":
      return "Uses HeyGen credits (you approved the estimate). No AI tokens.";
    case "broll-plan":
      return "Uses AI tokens from your AI key (a few cents at most). No HeyGen credits yet.";
    case "broll-make":
      return "Uses HeyGen credits (you approved the estimate). Clips from your library and test clips are free. No AI tokens.";
    case "planner-research":
      return "Uses vidIQ credits from your plan (you saw the count first). No AI tokens.";
    case "planner-plan":
    case "planner-outline":
      return "Uses AI tokens from your AI key (a few cents at most). No vidIQ credits.";
    case "avatar-looks":
      return "Free: only reads your HeyGen avatar list. No credits.";
    default:
      return local; // set-music, build-video, render-video, check-video
  }
}

/** Where a step does its work: on this computer, with a service over a live
 * connection, or at a service that keeps working without the app. */
export function workPlace(command: string): "local" | "online" | "service" {
  if (command === "make-avatar" || command === "segment-make" || command === "broll-make") return "service";
  if (["broll-plan", "write-script", "make-scenes", "refill-scene", "visual-check", "make-voice", "make-music", "suggest-channel", "packaging-make", "footage-describe", "segment-voice", "keyword-ideas", "avatar-looks", "planner-research", "planner-plan", "planner-outline"].includes(command)) return "online";
  return "local";
}

/** What the user may do meanwhile, and whether the lid may close (Zoltan,
 * 2026-10-06: always say if one has to wait and if the computer may sleep). */
export function adviceText(command: string): string {
  // the window may close: the app keeps working in the tray (DECISIONS 87)
  const window = "You can close this window: the app keeps working in the corner of the taskbar.";
  switch (workPlace(command)) {
    case "service":
      return `${window} You may close the lid: HeyGen makes the clips on its own computers. When you open yours again, the app picks them up; if the step stopped meanwhile, press the button again and nothing is ordered twice.`;
    case "online":
      return `${window} Keep the computer awake and the lid open until this is done: the app is talking to the service, and a sleeping computer drops the connection. If that happens, press the button again${command === "make-voice" ? "; the parts already read are kept" : ""}.`;
    default:
      return `${window} Keep the computer awake and the lid open until this is done: the work runs on this computer and stops while it sleeps. The app keeps the computer from falling asleep by itself, but closing the lid still puts it to sleep.`;
  }
}

/** The check-in (runner.rs, every 15 s): is the step working, waiting for
 * a service, or does it seem stuck. Only the state, in words (Zoltan,
 * 2026-10-06: the status is enough, not what it uses). */
export type PulseState = "working" | "waiting" | "stuck";
const PULSE_WORDS: Record<PulseState, string> = { working: "working", waiting: "waiting for the service", stuck: "seems stuck" };

/** "Checked 8 s ago: working", or "" before the first check-in. */
export function pulseText(t: Track, now: number): string {
  if (!t.pulse || t.waiting) return "";
  return `Checked ${span((now - t.pulse.at) / 1000)} ago: ${PULSE_WORDS[t.pulse.state]}`;
}

/** The lines under a bar when something is not plain: the computer slept,
 * a step is quiet for a while, or it seems stuck. Nothing is ever stopped
 * by the app; the user decides. Empty when all is normal. */
export function lifeText(t: Track, now: number): string[] {
  const out: string[] = [];
  if (t.slept > 0) out.push(`The computer slept for ${span(t.slept)} during this step, so the step paused; the clock counts that time too.`);
  if (t.waiting) return out;
  const quiet = (now - t.lastEvent) / 1000;
  const state = t.pulse?.state;
  if (state === "stuck") out.push(`This step seems stuck: nothing has moved for ${quiet >= 600 ? span(quiet) : "10 min"}, no work and no news. You can wait, it goes on as long as it runs, or press Stop.`);
  else if (quiet > 60 && state === "working") out.push(`No new step for ${span(quiet)}, but it is busy working on it.`);
  else if (quiet > 60 && state === "waiting") out.push(`Waiting for the service: no answer for ${span(quiet)} yet. The app is still connected and checks every 15 s.`);
  return out;
}

/** Percent from time alone. Past the estimate it keeps creeping toward 99
 * instead of freezing at 95, so the bar never looks dead. */
export function percentByTime(elapsed: number, expect: number | null): number {
  if (!expect) return 0;
  const r = elapsed / expect;
  if (r <= 1) return 95 * r;
  return 95 + 4 * (1 - Math.exp(-(r - 1)));
}

/** "12 min 34 s", "45 s" */
export function span(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return s >= 60 ? `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ""}` : `${s} s`;
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
  /** when the last real event came (not a heartbeat) */
  lastEvent: number;
  /** when the runner last said it is alive (runner/main.mjs heartbeat) */
  alive: number | null;
  /** seconds the computer slept during the step */
  slept: number;
  /** the last check-in of the core (runner.rs) */
  pulse: { state: PulseState; at: number } | null;
};

const BUILD_FLOORS: Record<string, number> = { build: 0, lint: 5, check: 12, snapshots: 72, sheet: 95 };
const VOICE_TAIL: Record<string, number> = { joining: 92, mixing: 95, sentences: 99 };

export function fresh(command: string, project: string | null): Track {
  return { command, project, started: Date.now(), expect: null, base: null, real: null, realFrom: null, floor: 0, phase: null, waiting: null, last: {}, lastEvent: Date.now(), alive: null, slept: 0, pulse: null };
}

function setReal(t: Track, value: number) {
  if (t.realFrom === null && value > 0) t.realFrom = { at: Date.now(), value };
  t.real = value;
}

/** One runner progress event into its track. Exported for the tests. */
export function apply(t: Track, s: Record<string, unknown>) {
  const command = t.command;
  if (s.step === "alive") {
    t.alive = Date.now();
    return;
  }
  if (s.step === "pulse" && (s.state === "working" || s.state === "waiting" || s.state === "stuck")) {
    t.pulse = { state: s.state, at: Date.now() };
    return;
  }
  // the core's log marks for a stuck step and a moving one: not news
  if (s.step === "stalled" || s.step === "moving") return;
  t.lastEvent = Date.now();
  t.alive = Date.now();
  if (s.step === "slept" && typeof s.seconds === "number") {
    t.slept += s.seconds;
    return;
  }
  t.last = s;
  if (s.step === "waiting" && typeof s.message === "string") {
    t.waiting = s.message;
    return;
  }
  if (t.waiting) {
    t.waiting = null;
    t.started = Date.now();
  }
  // a busy service says itself how long it waits ("Gemini is busy (HTTP
  // 503). Trying again in 20 s, round 1 of 4.")
  const said = s.step === "retry" && typeof s.message === "string" ? s.message : phaseText(command, typeof s.step === "string" ? s.step : undefined);
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
    if (s.step === "retry") t.expect = (t.expect ?? t.base) + (typeof s.waitSeconds === "number" ? s.waitSeconds + 5 : 8);
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

