// videoRun.ts: one video's way from where it stands up to its Preview, with the same commands as
// the tabs (docs/BUILD_PLAN.md, phases 1 to 3). Out of ProjectView since DECISIONS 182, so the Night
// shift runs the very same steps with no window of the video open. What is made is never made again,
// so a run cut off goes on from where it stopped. Nothing is ever published here.
import { runner, errorText, type Config } from "./api";
import { errorCode } from "./errors";
import { llmFor, aiWithKey } from "./llm";
import { log } from "./logger";
import { findBroll } from "./brollRun";
import type { Recipe } from "./channels/channels";
import type { Series } from "./course/course";
import type { TabId } from "./tabs";

export type RunData = {
  project: { title: string; recipe?: Recipe | null; start?: { research: boolean } | null; series?: Series | null; gates: Record<string, { state: string; mode?: string | null }> };
  brief: { targetLengthMin?: number } | null;
  scriptMarkdown: string | null;
  researchState?: string | null;
};

/** Where the run stopped: at the Preview, past it, at the brief, at a script to write, at the avatar's price. */
export type RunEnd = "preview" | "video" | "brief" | "offline" | "avatar";

export type RunCtx = {
  dir: string;
  config: Config | null;
  keys: Record<string, boolean>;
  look: string;
  data: () => RunData | null;
  load: () => Promise<void>;
  show: (tab: TabId, why: string) => void;
  step: (label: string) => void;
  /** No AI wrote the script: why, so the Script tab can say so. */
  offline: (text: string) => void;
  /** The avatar costs money: go on, stop the run, or leave it for later ("wait", the Night shift). */
  approveAvatar: (price: string) => Promise<boolean | "wait">;
};

export const stoppedByUser = (e: unknown) => errorCode(errorText(e)) === "ITV-STOPPED" || /you stopped it/.test(errorText(e));
const usableAi = (c: RunCtx, step: "script" | "scenes" | "texts") => aiWithKey(llmFor(c.config, step), c.keys);
const noteOn = (c: RunCtx, kind: string, text: string) => runner("project-note", { projectDir: c.dir, kind, text }).catch(() => {});

/** The script, or the hand-written way when no AI can write it. True: go on. */
export async function scriptOrOffline(c: RunCtx, input: Record<string, unknown>): Promise<boolean> {
  const ai = usableAi(c, "script");
  let failure = ai ? "" : "No AI key is set.";
  if (ai) {
    c.step("Writing the script");
    c.show("script", "recipe");
    try {
      await runner("write-script", { projectDir: c.dir, llm: ai, input, channel: c.config!.channel });
    } catch (e) {
      if (stoppedByUser(e)) throw e;
      failure = errorText(e);
    }
  }
  if (failure) {
    await runner("script-offline", { projectDir: c.dir, reason: failure });
    await c.load();
    c.show("script", "offline");
    c.offline(`${failure} Write or paste your script on this tab, save it, then press Make the video. Everything after the script runs on this computer.`);
    await runner("autopilot-mark", { projectDir: c.dir, on: false });
    return false;
  }
  await c.load();
  return true;
}

/** The recipe's music. Own files missing or a bad file: no music, and the Preview says so. */
export async function addMusic(c: RunCtx, recipe: Recipe) {
  await runner("make-music", { projectDir: c.dir, music: { provider: recipe.music.source, mood: recipe.music.mood } }).catch(async (e) => {
    if (stoppedByUser(e)) throw e;
    await noteOn(c, "music", `This video has no music: ${errorText(e)}`);
  });
}

async function broll(c: RunCtx) {
  // the video goes on without it: a source that is down is only fewer clips. Free only, nothing is ordered
  await findBroll(c.dir, usableAi(c, "scenes") ?? llmFor(c.config, "scenes"), c.keys, c.step).catch(async (e) => {
    if (stoppedByUser(e)) throw e;
    log("broll_engine_failed", { error: errorText(e) }, "warn");
    await noteOn(c, "broll", `The B-roll search stopped, so this video has less B-roll: ${errorText(e)} You can start it again on the Preview tab.`);
  });
}

/** A channel video: the locked recipe, step by step, up to the Preview, which waits for the user. */
export async function runRecipeVideo(c: RunCtx): Promise<RunEnd> {
  const data = () => c.data()!;
  const recipe = data().project.recipe!;
  const gates = () => data().project.gates;
  const approved = (g: string) => gates()[g]?.state === "approved";
  const made = (g: string) => gates()[g]?.state === "pending";
  const approveGate = async (gate: string) => {
    if (!approved(gate)) await runner("approve-gate", { projectDir: c.dir, gate });
    await c.load();
  };
  await runner("autopilot-mark", { projectDir: c.dir, on: true });
  // Research comes first, and the run waits for the brief: one click goes on
  if (data().project.start?.research && data().researchState !== "approved") {
    if (!data().researchState) {
      c.step("Researching");
      c.show("research", "recipe");
      const ai = usableAi(c, "script");
      if (ai) await runner("research-make", { projectDir: c.dir, llm: ai, channel: c.config!.channel });
      else await runner("research-offline", { projectDir: c.dir });
      await c.load();
    }
    c.show("research", "recipe");
    await runner("autopilot-mark", { projectDir: c.dir, on: false });
    return "brief";
  }
  if (!approved("script")) {
    // a lesson of a playlist has its own length, the recipe's is for the rest
    const length = data().project.series ? (data().brief?.targetLengthMin ?? recipe.targetLengthMin) : recipe.targetLengthMin;
    if (!data().scriptMarkdown && !(await scriptOrOffline(c, { topic: data().project.title, targetLengthMin: length }))) return "offline";
    await approveGate("script");
  }
  // a pasted script: its title ideas and summary, for the Publishing Card
  const textAi = usableAi(c, "texts");
  if (textAi && gates().script?.mode === "custom") {
    const has = await runner<{ packaging: unknown }>("packaging-state", { projectDir: c.dir });
    if (!has.packaging) {
      c.step("Writing the title and the summary");
      await runner("packaging-make", { projectDir: c.dir, llm: textAi }).catch((e) => log("packaging_failed", { error: errorText(e) }, "warn"));
    }
  }
  if (!approved("voice") && made("voice")) await approveGate("voice");
  if (!approved("voice")) {
    c.step(recipe.voice.provider === "kokoro" ? "The free voice is reading the script" : "Reading the script aloud");
    c.show("voice", "recipe");
    await runner("make-voice", { projectDir: c.dir, narrator: { provider: recipe.voice.provider, voice: recipe.voice.voice }, music: null });
    if (recipe.music.on) {
      c.step("Adding the music");
      await addMusic(c, recipe);
    }
    await approveGate("voice");
  }
  if (!approved("scenes")) {
    if (!made("scenes")) {
      c.step("Filling the scene templates");
      c.show("scenes", "recipe");
      const ai = usableAi(c, "scenes");
      if (ai) await runner("make-template-scenes", { projectDir: c.dir, llm: ai, look: c.look });
      else await runner("simple-template-scenes", { projectDir: c.dir, look: c.look });
    }
    // after the voice: every shot starts on its word (runner/shots)
    c.step("Making the scene timing");
    c.show("shots", "recipe");
    await runner("shot-map-make", { projectDir: c.dir, look: c.look });
    await approveGate("scenes");
  }
  const avatar = gates().avatar?.state;
  if (avatar !== "approved" && avatar !== "skipped") {
    // no key or a service that fails: the video goes on without the avatar, and says so
    const noAvatar = async (why: string) => {
      await noteOn(c, "avatar", `This video has no avatar: ${why}`);
      await runner("skip-gate", { projectDir: c.dir, gate: "avatar" });
      await c.load();
    };
    if (recipe.avatar.on && !c.keys["heygen"]) await noAvatar("no HeyGen key is set.");
    else if (recipe.avatar.on && recipe.avatar.lookId) {
      try {
        if (avatar !== "pending") {
          c.step("Asking about the avatar");
          c.show("avatar", "recipe");
          const plan = await runner<{ estimate?: { low: number; high: number } }>("avatar-plan", { projectDir: c.dir, service: "heygen", engine: "avatar_iii" });
          const price = plan.estimate ? `about $${plan.estimate.low.toFixed(2)} to $${plan.estimate.high.toFixed(2)}` : "some";
          const answer = await c.approveAvatar(price);
          if (answer === "wait") {
            await runner("autopilot-mark", { projectDir: c.dir, on: false });
            return "avatar";
          }
          if (!answer) throw new Error("you stopped it before the avatar; nothing was spent on it. Press Make the video to go on");
          c.step("HeyGen is making the avatar");
          await runner("make-avatar", { projectDir: c.dir, service: "heygen", lookId: recipe.avatar.lookId, lookName: recipe.avatar.name ?? null, which: ["open", "close"], look: c.look, layout: { style: "overlay", position: "bottom-right", size: "medium" }, engine: "avatar_iii", lookEngines: [] });
          await c.load();
        }
        await approveGate("avatar");
      } catch (e) {
        if (stoppedByUser(e)) throw e;
        await noAvatar(errorText(e));
      }
    } else {
      await runner("skip-gate", { projectDir: c.dir, gate: "avatar" });
      await c.load();
    }
  }
  if (!approved("review") && !made("review")) {
    if (recipe.broll?.on) {
      c.show("scenes", "recipe");
      await broll(c);
    }
    c.step("Building the preview");
    c.show("preview", "recipe");
    await runner("build-video", { projectDir: c.dir, look: c.look });
    await c.load();
  }
  await runner("autopilot-mark", { projectDir: c.dir, on: false });
  const end = approved("review") ? "video" : "preview";
  c.show(end, "recipe");
  return end;
}

/** A Recorded video (runner/recorded): words, cuts, plan and pictures, up to the Preview. */
export async function runRecordedVideo(c: RunCtx): Promise<RunEnd> {
  const recipe = c.data()!.project.recipe!;
  const gates = () => c.data()!.project.gates;
  const approved = (g: string) => gates()[g]?.state === "approved";
  const made = (g: string) => gates()[g]?.state === "pending";
  const approveGate = async (gate: string) => {
    if (!approved(gate)) await runner("approve-gate", { projectDir: c.dir, gate });
    await c.load();
  };
  await runner("autopilot-mark", { projectDir: c.dir, on: true });
  c.show("recording", "recorded");
  if (!approved("script")) {
    if (!made("script")) {
      c.step("Listening to the recording");
      await runner("recorded-transcribe", { projectDir: c.dir });
      await c.load();
    }
    await approveGate("script");
  }
  if (!approved("voice")) {
    if (!made("voice")) {
      c.step("Cutting the recording");
      await runner("recorded-apply-cuts", { projectDir: c.dir });
      if (recipe.music.on) {
        c.step("Adding the music");
        await addMusic(c, recipe);
      }
      await c.load();
    }
    await approveGate("voice");
  }
  if (!approved("scenes")) {
    if (!made("scenes")) {
      c.step("Planning what is on screen");
      const ai = usableAi(c, "scenes");
      if (ai) await runner("recorded-plan", { projectDir: c.dir, llm: ai }).catch(async (e) => {
        if (stoppedByUser(e)) throw e;
        await noteOn(c, "plan", `The chapters and big words were made by rule, without the AI: ${errorText(e)}`);
        await runner("recorded-plan-rule", { projectDir: c.dir });
      });
      else await runner("recorded-plan-rule", { projectDir: c.dir });
      await c.load();
    }
    // what the pictures need: the cursor, the person. Slow, so it runs once per plan
    c.step("Preparing the pictures");
    await runner("recorded-prepare", { projectDir: c.dir });
    await approveGate("scenes");
  }
  const textAi = usableAi(c, "texts");
  if (textAi) {
    const has = await runner<{ packaging: unknown }>("packaging-state", { projectDir: c.dir });
    if (!has.packaging) {
      c.step("Writing the title and the summary");
      await runner("packaging-make", { projectDir: c.dir, llm: textAi }).catch((e) => log("packaging_failed", { error: errorText(e) }, "warn"));
    }
  }
  const avatar = gates().avatar?.state;
  if (avatar !== "approved" && avatar !== "skipped") {
    await runner("skip-gate", { projectDir: c.dir, gate: "avatar" });
    await c.load();
  }
  if (!approved("review") && !made("review")) {
    if (recipe.broll?.on) await broll(c);
    c.step("Building the preview");
    c.show("preview", "recorded");
    await runner("build-video", { projectDir: c.dir, look: c.look });
    await c.load();
  }
  await runner("autopilot-mark", { projectDir: c.dir, on: false });
  const end = approved("review") ? "video" : "preview";
  c.show(end, "recorded");
  return end;
}
