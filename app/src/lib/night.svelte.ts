// night.svelte.ts: the Night shift's run (DECISIONS 182). One video at a time, all the way to the
// finished MP4, while the app stays open. Its own ElevenLabs voice may cost credits, Zoltan approved
// that. HeyGen and paid clips never run: an avatar waits for a yes in the morning, B-roll is free only.
// Nothing is published or sent. The shift is a file, so after a restart it goes on from the last
// finished step. It lives here, not in a page, so it keeps going whatever is on screen, and keeps the
// Identity it started with: a job's key follows the video's folder (lib.rs), not the screen.
import type { AppState, Config } from "./api";
import { runner, errorText, jobList, stopJob } from "./api";
import { log } from "./logger";
import { notifyDone } from "./notify";
import { pilots } from "./work.svelte";
import { runRecipeVideo, stoppedByUser, type RunCtx, type RunData } from "./videoRun";
import { counts, morningLine, newShift, nextItem, WAITS, type NightItem, type NightShift } from "./night";

export const night = $state<{ shift: NightShift | null; running: boolean; step: string; stopping: boolean }>({ shift: null, running: false, step: "", stopping: false });

type Base = { projectsDir: string; config: Config | null; keys: Record<string, boolean> };
const baseOf = (app: AppState): Base => ({ projectsDir: app.projectsDir, config: $state.snapshot(app.config) as Config | null, keys: { ...app.keys } });

const save = (b: Base) => runner("night-save", { projectsDir: b.projectsDir, shift: $state.snapshot(night.shift) });

/** One video: its steps, then the finished video. Returns what the morning list says. */
async function makeOne(item: NightItem, b: Base): Promise<Partial<NightItem>> {
  const dir = item.dir;
  const setStep = (label: string) => {
    night.step = label;
    pilots[dir] = label;
  };
  setStep("Starting");
  await runner("night-prepare", { projectDir: dir });
  let data: (RunData & { project: RunData["project"] & { render?: { state: string } | null } }) | null = null;
  const load = async () => {
    data = await runner("load-project", { projectDir: dir });
  };
  await load();
  const ctx: RunCtx = {
    dir,
    config: b.config,
    keys: b.keys,
    look: b.config?.brand?.preset ?? "blue-professional",
    data: () => data,
    load,
    show: () => {},
    step: setStep,
    offline: () => {},
    approveAvatar: async () => "wait",
  };
  // recordings never run at night (DECISIONS 184): nightCandidates leaves them out
  if (data!.project.recipe?.engine === "recorded") throw new Error("A recording is edited in ITV Editor, not at night.");
  const end = await runRecipeVideo(ctx);
  if (end === "brief" || end === "offline" || end === "avatar") return { status: "waiting", ...WAITS[end] };
  await load();
  if (data!.project.render?.state === "done" && end === "video") return { status: "ready", page: "video" };
  if (end === "preview") {
    await runner("approve-gate", { projectDir: dir, gate: "review" });
    await runner("project-note", { projectDir: dir, kind: "night", text: "The night shift approved this preview, so that the video could render. Nobody has looked at it yet. Nothing was published." }).catch(() => {});
  }
  setStep("Rendering the video");
  await runner("render-video", { projectDir: dir, quality: "standard" });
  return { status: "ready", page: "video" };
}

async function run(b: Base) {
  if (night.running || !night.shift) return;
  night.running = true;
  night.stopping = false;
  try {
    for (let item = nextItem(night.shift); item && !night.stopping; item = nextItem(night.shift)) {
      item.status = "running";
      await save(b);
      log("night_video", { title: item.title });
      try {
        Object.assign(item, await makeOne(item, b));
      } catch (e) {
        if (stoppedByUser(e) || night.stopping) {
          item.status = "queued";
          night.stopping = true;
        } else {
          // one video that fails never stops the others
          item.status = "failed";
          item.reason = errorText(e);
          log("night_video_failed", { title: item.title, error: item.reason }, "warn");
        }
        await runner("autopilot-mark", { projectDir: item.dir, on: false }).catch(() => {});
      } finally {
        delete pilots[item.dir];
      }
      await save(b).catch(() => {});
    }
    night.shift.state = night.stopping ? "stopped" : "done";
    night.shift.finishedAt = new Date().toISOString();
    await save(b).catch(() => {});
    log("night_finished", { ...counts(night.shift), state: night.shift.state });
    if (!night.stopping) notifyDone("The night shift is done", morningLine(night.shift));
  } finally {
    night.running = false;
    night.stopping = false;
    night.step = "";
  }
}

export function startNight(app: AppState, videos: { dir: string; title: string }[]) {
  if (night.running || !videos.length) return;
  night.shift = newShift(videos);
  return run(baseOf(app));
}

/** What the shift's file says, when the app starts or the Identity changes. A shift cut off goes on. */
export async function loadNight(app: AppState, resume = false) {
  if (night.running) return;
  try {
    const { shift } = await runner<{ shift: NightShift | null }>("night-load", { projectsDir: app.projectsDir });
    night.shift = shift;
    if (resume && shift?.state === "running") {
      log("night_resumed", counts(shift));
      await run(baseOf(app));
    }
  } catch (e) {
    log("night_load_failed", { error: errorText(e) }, "warn");
  }
}

/** Stop now: the step at work ends, what it finished stays, the video stays in line. */
export async function stopNight() {
  night.stopping = true;
  try {
    const { dir } = { dir: night.shift?.items.find((i) => i.status === "running")?.dir };
    for (const j of await jobList()) if (j.project === dir && j.state === "running") await stopJob(j.id);
  } catch (e) {
    log("night_stop_failed", { error: errorText(e) }, "warn");
  }
}

export async function clearNight(app: AppState) {
  if (night.running) return;
  await runner("night-clear", { projectsDir: app.projectsDir });
  night.shift = null;
}

/** A stopped shift's videos that are left. */
export function goOnNight(app: AppState) {
  if (night.running || !night.shift) return;
  night.shift.state = "running";
  night.shift.finishedAt = null;
  return run(baseOf(app));
}
