#!/usr/bin/env node
// motion-measure.mjs: the Motion wizard's measurements (docs/wizards/motion.md 8).
// One fixed sample video (the Brand preview's scenes and a marker-highlight,
// 4 s each, a script with two sections), built with each Motion variant in a
// light and a dark look: assemble, lint + check, and, unless --no-render, a
// render (its time against the plain cut) and stills in the middle of every
// scene change, tiled into one sheet per variant.
//
// Usage: node scripts/phase2/motion-measure.mjs --work <dir> [--only a,b] [--no-render] [--look light|dark]
// Needs the built engine, library and ffmpeg (scripts/fetch-*.mjs) and the
// render browser.

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assemble } from "../../runner/gates/build/assemble.mjs";
import { lintAndCheck } from "../../runner/gates/build/index.mjs";
import { renderVideo } from "../../runner/gates/render/index.mjs";
import { resolveBrowser, ffmpegPaths } from "../../runner/tools.mjs";
import { profileFromMood } from "../../runner/motion/profile.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { values: args } = parseArgs({
  options: {
    work: { type: "string" },
    only: { type: "string" },
    look: { type: "string" },
    "no-render": { type: "boolean", default: false },
  },
});
if (!args.work) {
  console.error("Usage: node scripts/phase2/motion-measure.mjs --work <dir> [--only a,b] [--no-render] [--look light|dark]");
  process.exit(2);
}
const env = { ...process.env };
const ff = path.join(ROOT, "app", "src-tauri", "ffmpeg");
const exe = process.platform === "win32" ? ".exe" : "";
env.HYPERFRAMES_FFMPEG_PATH ??= path.join(ff, `ffmpeg${exe}`);
env.HYPERFRAMES_FFPROBE_PATH ??= path.join(ff, `ffprobe${exe}`);

const SECONDS = 4;
const SCENES = [
  { from: "S1", component: "titlecard-lockup", vars: { wordmark: "IDEA TO VIDEO", label: "YOUR VIDEOS, YOUR LOOK", kicker: "PREVIEW" } },
  { from: "S2", component: "per-word-rise", vars: { text: "Clear ideas win attention" } },
  { from: "S3", component: "count-up", vars: { end: 42, suffix: "%" } },
  { from: "S4", component: "marker-highlight", vars: { text: "Clarity beats cleverness", emphasis_word: "Clarity" } },
  { from: "S5", component: "grid-card-assemble", vars: { items: "Write,Record,Publish" } },
  { from: "S6", component: "logo-brand-close", vars: { wordmark: "Idea to Video", tagline: "Thanks for watching" } },
];
const SECTION_STARTS = new Set([3]); // scene 4 opens the second section
const TOTAL = SCENES.length * SECONDS;

const css = (primary, extra = {}) => ({ ...profileFromMood("simple"), transition: { mood: "simple", primary, accent: null, energy: "calm", where: "every", ...extra } });
const VARIANTS = {
  cut: null,
  crossfade: css("crossfade"),
  "blur-crossfade": css("blur-crossfade"),
  "push-slide": css("push-slide", { energy: "medium" }),
  "zoom-through": css("zoom-through", { energy: "high" }),
  squeeze: css("squeeze", { energy: "medium" }),
  "shader-light-leak": profileFromMood("retro"),
  "mood-premium": profileFromMood("premium"),
  "mood-editorial": profileFromMood("editorial"),
  "bg-grain-field": { ...profileFromMood("none"), background: { type: "grain-field", vars: {} } },
  "bg-aurora": { ...profileFromMood("none"), background: { type: "aurora-drift", vars: {} } },
  "camera-push": { ...profileFromMood("none"), camera: { move: "push" } },
  "camera-jitter": { ...profileFromMood("none"), camera: { move: "jitter" } },
  "all-together": { ...profileFromMood("premium"), background: { type: "grain-field", vars: {} }, camera: { move: "push" } },
};
const LOOKS = { light: "blue-professional", dark: "dark" };

function ffmpeg(argv) {
  const r = spawnSync(ffmpegPaths(env)?.ffmpeg ?? env.HYPERFRAMES_FFMPEG_PATH, ["-hide_banner", "-loglevel", "error", "-y", ...argv], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr || `ffmpeg exited ${r.status}`);
}

const timed = async (fn) => {
  const t0 = Date.now();
  try {
    return { ok: true, value: await fn(), s: (Date.now() - t0) / 1000 };
  } catch (e) {
    return { ok: false, error: e.message.slice(0, 300), s: (Date.now() - t0) / 1000 };
  }
};

if (!resolveBrowser(env)) {
  console.error("No render browser. Run the app's Download now first.");
  process.exit(1);
}
const work = path.resolve(args.work);
const names = args.only ? args.only.split(",") : Object.keys(VARIANTS);
const results = [];
for (const lookName of args.look ? [args.look] : Object.keys(LOOKS)) {
  for (const name of names) {
    const dir = path.join(work, `${lookName}-${name}`);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(path.join(dir, "audio"), { recursive: true });
    ffmpeg(["-f", "lavfi", "-i", `anullsrc=r=48000:cl=stereo`, "-t", String(TOTAL), "-b:a", "64k", path.join(dir, "audio", "vo_bgm.mp3")]);
    const sentences = SCENES.map((_, i) => ({ id: `S${i + 1}`, start: i * SECONDS, end: (i + 1) * SECONDS - 0.2, dur: SECONDS - 0.2, words: 3, text: "Sample." }));
    fs.writeFileSync(path.join(dir, "sentences.json"), JSON.stringify(sentences, null, 2));
    fs.writeFileSync(path.join(dir, "scenes.json"), JSON.stringify({ scenes: SCENES }, null, 2));
    const row = { look: lookName, variant: name };
    const built = await timed(() => assemble(dir, { env, total: TOTAL, title: name, look: LOOKS[lookName], motion: VARIANTS[name], sectionStarts: SECTION_STARTS }));
    row.assemble = built.ok ? "ok" : built.error;
    if (built.ok) {
      row.transitions = built.value.transitions.map((t) => t.type).join(" ");
      row.notes = built.value.notes.join(" ");
      const lc = await timed(() => lintAndCheck(dir, { env }));
      row.lintCheck = lc.ok ? "ok" : lc.error;
      if (!args["no-render"]) {
        const r = await timed(() => renderVideo(dir, { env }));
        if (r.ok) {
          row.renderSeconds = r.value.renderSeconds;
          // a still in the middle of every scene change, and one mid-scene
          const at = SCENES.slice(1).map((_, k) => (k + 1) * SECONDS + 0.2);
          const stills = path.join(dir, "stills");
          fs.mkdirSync(stills, { recursive: true });
          at.forEach((t, k) => ffmpeg(["-ss", String(t), "-i", r.value.file, "-frames:v", "1", "-vf", "scale=480:-1", path.join(stills, `t${k + 1}.png`)]));
          ffmpeg(["-i", path.join(stills, "t%d.png"), "-vf", `tile=${at.length}x1`, "-frames:v", "1", path.join(work, `sheet-${lookName}-${name}.png`)]);
          row.video = r.value.file;
        } else row.render = r.error;
      }
    }
    console.log(JSON.stringify(row));
    results.push(row);
  }
}
fs.writeFileSync(path.join(work, "results.json"), JSON.stringify(results, null, 2));
