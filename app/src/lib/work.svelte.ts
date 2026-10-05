// work.svelte.ts: what runs right now, for every view (Zoltan, 2026-10-05).
// A gate kept its "busy" flag to itself, so after leaving a ONE Video and
// coming back the same button worked again while its job still ran, and the
// progress bar was gone. Here the core's job list (jobs.rs) and the runner's
// progress events are kept once, for the whole app:
//   running(dir, commands)  is one of these commands running for this video?
//   track(dir, command)     the progress of that job, for the bar
// The bar's percent and time left are worked out here too (progressInfo.ts
// for the words), so a bar that appears later, on another tab or after the
// view was opened again, still shows the right numbers.

import { jobList, onJobsChanged, onProgress, type Job } from "./api";
import { phaseText, percentByTime } from "./progressInfo";

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

const norm = (p: string | null | undefined) => (p ? p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase() : "");
const keyOf = (project: string | null | undefined, command: string) => `${norm(project)}|${command}`;

export const work = $state<{ jobs: Job[]; tracks: Record<string, Track>; now: number }>({ jobs: [], tracks: {}, now: Date.now() });

const BUILD_FLOORS: Record<string, number> = { build: 0, lint: 5, check: 12, snapshots: 72, sheet: 95 };
const VOICE_TAIL: Record<string, number> = { joining: 92, mixing: 95, sentences: 99 };

function fresh(command: string, project: string | null): Track {
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

let started = false;
/** Starts listening, once (the first view that needs it calls it). */
export function startWork() {
  if (started) return;
  started = true;
  jobList().then((j) => syncJobs(j)).catch(() => {});
  onJobsChanged((j) => syncJobs(j)).catch(() => {});
  onProgress((p) => {
    const project = (p as { project?: string | null }).project ?? null;
    const k = keyOf(project, p.command);
    // read back through the state proxy, so the change is seen
    if (!work.tracks[k]) work.tracks[k] = fresh(p.command, project);
    apply(work.tracks[k], p.progress);
  }).catch(() => {});
  setInterval(() => (work.now = Date.now()), 500);
}

function syncJobs(jobs: Job[]) {
  work.jobs = jobs;
  const live = new Set(jobs.map((j) => keyOf(j.project, j.command)));
  for (const j of jobs) {
    const k = keyOf(j.project, j.command);
    if (!work.tracks[k]) work.tracks[k] = fresh(j.command, j.project);
  }
  for (const k of Object.keys(work.tracks)) if (!live.has(k)) delete work.tracks[k];
}

/** Is one of these commands running (or waiting its turn) for this video? */
export function running(project: string | null | undefined, commands: string[]): string | null {
  const p = norm(project);
  return work.jobs.find((j) => commands.includes(j.command) && (!project || norm(j.project) === p))?.command ?? null;
}

/** The progress of a command for a video; without a video, the newest one. */
export function track(project: string | null | undefined, command: string): Track | null {
  if (project) return work.tracks[keyOf(project, command)] ?? null;
  return Object.values(work.tracks).filter((t) => t.command === command).sort((a, b) => b.started - a.started)[0] ?? null;
}
