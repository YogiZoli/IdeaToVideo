// work.svelte.ts: what runs right now, for every view (Zoltan, 2026-10-05).
// A gate kept its "busy" flag to itself, so after leaving a ONE Video and
// coming back the same button worked again while its job still ran, and the
// progress bar was gone. Here the core's job list (jobs.rs) and the runner's
// progress events are kept once, for the whole app:
//   running(dir, commands)  is one of these commands running for this video?
//   track(dir, command)     the progress of that job, for the bar
// The bar's percent and time left come from the kept events (progressInfo.ts
// apply and measure), so a bar that appears later, on another tab or after
// the view was opened again, still shows the right numbers.

import { jobList, onJobsChanged, onProgress, type Job } from "./api";
import { type Track, apply, measure, fresh } from "./progressInfo";
export { measure };
export type { Track };

const norm = (p: string | null | undefined) => (p ? p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase() : "");
const keyOf = (project: string | null | undefined, command: string) => `${norm(project)}|${command}`;

export const work = $state<{ jobs: Job[]; tracks: Record<string, Track>; now: number }>({ jobs: [], tracks: {}, now: Date.now() });

/** ONE Videos with Autopilot under way, and its current step in words, for
 * every view (ProjectView). A view opened again sees it and does not start
 * a second one. */
export const pilots = $state<Record<string, string>>({});

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

/** The job of a command for a video (for Stop); without a video, the newest one. */
export function jobOf(project: string | null | undefined, command: string): Job | null {
  const p = norm(project);
  const mine = work.jobs.filter((j) => j.command === command && (!project || norm(j.project) === p));
  return mine.sort((a, b) => b.id - a.id)[0] ?? null;
}

/** The progress of a command for a video; without a video, the newest one. */
export function track(project: string | null | undefined, command: string): Track | null {
  if (project) return work.tracks[keyOf(project, command)] ?? null;
  return Object.values(work.tracks).filter((t) => t.command === command).sort((a, b) => b.started - a.started)[0] ?? null;
}
