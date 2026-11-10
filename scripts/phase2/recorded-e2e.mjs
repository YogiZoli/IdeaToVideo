#!/usr/bin/env node
// recorded-e2e.mjs: a recording from file to finished MP4 with the real runner
// commands the app calls: real speech model, real cuts, real composition, real
// render. Nothing is paid; no AI answers the plan (the rule does).
//
// Without files it makes its own recording: the free voice reads a text with long
// pauses, a false start and an "um", over a test picture and a moving cursor.
//
// Usage: node scripts/phase2/recorded-e2e.mjs --work <dir> [--preset talking-head]
//          [--camera <file>] [--screen <file>] [--front <file>] [--combined <file>]
//          [--cutout] [--broll] [--language en] [--no-render]
// Exit code 0 only if every step passed.

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { values: args } = parseArgs({
  options: {
    work: { type: "string" },
    preset: { type: "string", default: "talking-head" },
    // RecCut (DECISIONS 184): what was recorded, and a marked bubble box "x,y,w,h"
    kind: { type: "string" },
    box: { type: "string" },
    camera: { type: "string" },
    screen: { type: "string" },
    front: { type: "string" },
    combined: { type: "string" },
    language: { type: "string", default: "en" },
    cutout: { type: "boolean", default: false },
    broll: { type: "boolean", default: false },
    "no-render": { type: "boolean", default: false },
    quality: { type: "string", default: "draft" },
  },
});
if (!args.work) {
  console.error("Usage: node scripts/phase2/recorded-e2e.mjs --work <dir> [--preset id] [--camera file] [--screen file] [--front file] [--combined file]");
  process.exit(2);
}

const env = { ...process.env };
const exe = process.platform === "win32" ? ".exe" : "";
env.HYPERFRAMES_FFMPEG_PATH ??= path.join(ROOT, "app", "src-tauri", "ffmpeg", `ffmpeg${exe}`);
env.HYPERFRAMES_FFPROBE_PATH ??= path.join(ROOT, "app", "src-tauri", "ffmpeg", `ffprobe${exe}`);
Object.assign(process.env, env);

const results = [];
function finish() {
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `\nrecorded e2e: ${failed} step(s) failed` : `\nrecorded e2e: all ${results.length} steps passed`);
  process.exit(failed ? 1 : 0);
}
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`);
  if (!ok) finish();
}
function runner(command, request) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(ROOT, "runner", "main.mjs"), command], { input: JSON.stringify(request), encoding: "utf8", env, maxBuffer: 256 * 1024 * 1024 });
  const last = JSON.parse((r.stdout || "").trim().split("\n").at(-1) || "{}");
  return { ...last, stderr: r.stderr || `exit ${r.status} signal ${r.signal} error ${r.error?.message ?? "none"}`, seconds: Math.round((Date.now() - t0) / 100) / 10 };
}
function step(name, command, request, detail = () => "") {
  const r = runner(command, request);
  check(`${name} (${r.seconds} s)`, r.event === "result", r.event === "result" ? detail(r.data) : String(r.message ?? r.stderr).slice(0, 600));
  return r.data;
}
const ffmpeg = (...a) => {
  const r = spawnSync(env.HYPERFRAMES_FFMPEG_PATH, ["-hide_banner", "-loglevel", "error", "-y", ...a], { encoding: "utf8" });
  if (r.status) throw new Error(r.stderr);
};
const lengthOf = (file) => Number(spawnSync(env.HYPERFRAMES_FFPROBE_PATH, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file], { encoding: "utf8" }).stdout.trim());

const work = path.resolve(args.work);
fs.rmSync(work, { recursive: true, force: true });
const identityDir = path.join(work, "identity");
const projectsDir = path.join(work, "videos");
const fixtures = path.join(work, "fixtures");
for (const d of [identityDir, projectsDir, fixtures]) fs.mkdirSync(d, { recursive: true });

// ---- the test recording ---------------------------------------------------------------
const TAKES = [
  "Most channels lose people in the first thirty seconds.",
  1.4,
  "The best way to start.",
  0.7,
  "The best way to start is with one clear promise.",
  0.2,
  "Pick one viewer and name one problem.",
  2.1,
  "Um,",
  0.25,
  "forty percent of viewers leave before the first minute is over.",
  0.2,
  "That is not a talent problem, it is a promise problem.",
  1.6,
  "Think about a rocket launch and the countdown before it.",
  0.3,
  "Everyone knows exactly what they are waiting for.",
  0.3,
  "Your opening can work the same way, here on this page.",
  1.2,
  "Click the first button and look at the numbers on the screen.",
  0.3,
  "A vague promise sends people away, a clear promise keeps them watching.",
  0.3,
  "Show the result first and then explain how you got there.",
  0.4,
  "Then stop talking and let the viewer decide what comes next.",
];

async function makeVoice() {
  const { speak, ensureModel, DEFAULT_VOICE, SAMPLE_RATE } = await import(pathToFileURL(path.join(ROOT, "runner", "providers", "tts", "kokoro.mjs")).href);
  await ensureModel({ voice: DEFAULT_VOICE });
  const list = [];
  let n = 0;
  for (const t of TAKES) {
    const f = path.join(fixtures, `p${String(++n).padStart(2, "0")}.wav`);
    if (typeof t === "number") ffmpeg("-f", "lavfi", "-i", `anullsrc=r=${SAMPLE_RATE}:cl=mono`, "-t", String(t), f);
    else fs.writeFileSync(f, (await speak({ voiceId: DEFAULT_VOICE, text: t })).audio);
    list.push(`file '${f.replace(/\\/g, "/")}'`);
  }
  const concat = path.join(fixtures, "list.txt");
  fs.writeFileSync(concat, list.join("\n") + "\n");
  const voice = path.join(fixtures, "voice.wav");
  ffmpeg("-f", "concat", "-safe", "0", "-i", concat, "-c:a", "pcm_s16le", "-ar", "48000", voice);
  return voice;
}

// A test picture with a camera's look: only the cuts and the sync are judged on it.
function makeCamera(voice, out) {
  ffmpeg("-f", "lavfi", "-i", `testsrc2=s=1280x720:r=30:d=${lengthOf(voice)}`, "-i", voice, "-shortest", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "24", "-c:a", "aac", out);
}

// A plain screen with a white arrow-like cursor that travels, stops, and a panel
// that opens where it stops: what a click looks like in the pixels.
function makeScreen(seconds, out) {
  // travels, stops 4 s and a panel opens next to it, travels on: again and again
  const stops = [[300, 200], [900, 440], [400, 560], [1300, 300], [700, 800], [1500, 700], [300, 500], [1100, 200], [600, 400], [1400, 850], [250, 700], [1000, 600]];
  const period = 6;
  const pos = (axis) => {
    let e = String(stops[stops.length - 1][axis]);
    for (let i = stops.length - 2; i >= 0; i--) {
      const t0 = i * period;
      const a0 = stops[i][axis];
      const a1 = stops[i + 1][axis];
      // 4 s at rest, 2 s on its way
      e = `if(lt(t,${t0 + period}),if(lt(t,${t0 + 4}),${a0},${a0}+(${a1 - a0})*(t-${t0 + 4})/2),${e})`;
    }
    return e;
  };
  const panels = stops.slice(0, -1).map(([x, y], i) => `drawbox=x=${x + 30}:y=${y + 30}:w=240:h=160:color=0x4466aa:t=fill:enable='between(t,${i * period + 1},${i * period + 3.9})'`).join(",");
  const graph = `[0:v]drawbox=x=0:y=0:w=1920:h=70:color=0x223344:t=fill,${panels}[bg];[1:v][2:v]overlay=2:2[arrow];[bg][arrow]overlay=x='${pos(0)}':y='${pos(1)}':eval=frame[out]`;
  ffmpeg("-f", "lavfi", "-i", `color=c=0xe8ecf2:s=1920x1080:r=30:d=${seconds}`, "-f", "lavfi", "-i", `color=c=black:s=20x28:r=30:d=${seconds}`, "-f", "lavfi", "-i", `color=c=white:s=16x24:r=30:d=${seconds}`, "-filter_complex", graph, "-map", "[out]", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18", out);
}

// ---- the run ----------------------------------------------------------------------------
const files = {};
for (const s of ["camera", "screen", "front", "combined"]) if (args[s]) files[s] = path.resolve(args[s]);
const preset = args.preset;
const ownRecording = !Object.keys(files).length;
if (ownRecording) {
  const voice = await makeVoice();
  check("the test recording is made", lengthOf(voice) > 30, `${lengthOf(voice).toFixed(1)} s`);
  if (preset !== "screen-recording") {
    files.camera = path.join(fixtures, "camera.mp4");
    makeCamera(voice, files.camera);
  }
  if (preset === "screen-recording" || preset === "screen-share") {
    files.screen = path.join(fixtures, "screen.mp4");
    const silent = path.join(fixtures, "screen-silent.mp4");
    makeScreen(lengthOf(voice), silent);
    ffmpeg("-i", silent, "-i", voice, "-shortest", "-c:v", "copy", "-c:a", "aac", files.screen);
  }
}

const state = step("the channel's start screen", "channel-state", { identityDir, projectsDir, identity: {} }, (d) => `${d.presets.filter((p) => p.engine === "recorded").length} recorded presets`);
check("the four recorded presets are offered", ["talking-head", "screen-recording", "screen-share", "profile-silhouette"].every((id) => state.presets.some((p) => p.id === id && p.engine === "recorded")));
const saved = step("the recipe is locked in", "recipe-save", { identityDir, language: args.language, recipe: { ...state.recipe, engine: "recorded", preset, music: { on: false, source: "synth", mood: "calm" }, broll: { on: args.broll }, recorded: { cutout: args.cutout, smoothCursor: true } } }, (d) => `${d.recipe.engine}, ${d.recipe.preset}`);
check("the recipe asks for no voice and no avatar", saved.recipe.avatar.on === false && saved.recipe.voice.provider === "recording");

const video = step("a recording makes a video", "recorded-video-new", { projectsDir, identityDir, identity: "test", language: args.language, files, ...(args.kind ? { kind: args.kind, mark: args.box ? { box: Object.fromEntries(args.box.split(",").map(Number).map((v, i) => ["xywh"[i], v])) } : null } : {}) }, (d) => d.id);
const projectDir = video.dir;
const read = () => JSON.parse(fs.readFileSync(path.join(projectDir, "project.json"), "utf8"));
const input = JSON.parse(fs.readFileSync(path.join(projectDir, "recorded", "input.json"), "utf8"));
check("the voice comes from the right file", !!input.voice, input.voice);

const cuts = step("the words, on this computer", "recorded-transcribe", { projectDir }, (d) => `${d.words} words, check ${JSON.stringify(d.check)}`);
check("the transcript fits the recording", cuts.check.ok === true, JSON.stringify(cuts.check));
console.log(`  cuts: ${cuts.before} s to ${cuts.after} s, ${JSON.stringify(cuts.counts)}`);
for (const m of cuts.marks) console.log(`    ${m.id} ${m.kind} ${m.start.toFixed(2)}-${m.end.toFixed(2)} ${m.text}`);
check("the cuts shorten it", cuts.after < cuts.before);
if (ownRecording) {
  check("the false start comes out, the last good take stays", cuts.marks.some((m) => m.kind === "take" && /best way to start[.,]?$/i.test(m.text)));
  check("the long pauses are gone", cuts.before - cuts.after > 4, `${(cuts.before - cuts.after).toFixed(1)} s out`);
}
const put = step("a cut can be put back", "recorded-cut-set", { projectDir, id: cuts.marks[0]?.id, on: false }, (d) => `${d.after} s`);
check("putting a cut back makes it longer", !cuts.marks.length || put.after >= cuts.after);
step("and taken out again", "recorded-cut-set", { projectDir, id: cuts.marks[0]?.id, on: true });
step("recording approved", "approve-gate", { projectDir, gate: "script" });

const applied = step("the cuts, applied", "recorded-apply-cuts", { projectDir }, (d) => `${d.kept} s in ${d.stretches} stretches`);
check("the words still fit, on the cut sound", applied.after.ok === true, JSON.stringify(applied.after));
const words = JSON.parse(fs.readFileSync(path.join(projectDir, "words.json"), "utf8"));
const sentences = JSON.parse(fs.readFileSync(path.join(projectDir, "sentences.json"), "utf8"));
check("every word has its time on the new clock", words.every((w, i) => w.end >= w.start && (!i || w.start >= words[i - 1].start - 0.01)) && words.at(-1).end <= applied.kept + 0.05);
for (const [role, p] of Object.entries(applied.pictures)) check(`the ${role} picture has the cut's exact length`, Math.abs(p.seconds - applied.kept) < 0.1, `${p.seconds} s of ${applied.kept} s`);
check("the mix is at YouTube's level", Math.abs(JSON.parse(fs.readFileSync(path.join(projectDir, "audio", "voice.json"), "utf8")).finalLufs + 14) < 1.5);
check("sound and picture have one length", Math.abs(lengthOf(path.join(projectDir, "audio", "vo_bgm.mp3")) - applied.kept) < 0.15);
step("cuts approved", "approve-gate", { projectDir, gate: "voice" });

const plan = step("the plan, by rule", "recorded-plan-rule", { projectDir }, (d) => `${d.chapters.length} chapters, ${d.bigWords.length} big words, ${d.layouts.length} layouts, ${d.beats.length} beats`);
if (applied.kept >= 30) check("at least 3 chapters, as YouTube wants", plan.chapters.length >= 3);
if (plan.bigWords.length) {
  const onWord = plan.bigWords.every((b) => words.some((w) => Math.abs(w.start - b.start) < 0.002));
  check("every big word enters on the exact word", onWord);
}
if (preset === "screen-share") {
  const gaps = plan.layouts.slice(1).map((l, i) => l.start - plan.layouts[i].start);
  check("layouts change about every 8 s, on a sentence", plan.layouts.length >= 2 && gaps.every((g) => g >= 3.5 && g < 16) && plan.layouts.slice(1).every((l) => sentences.some((s) => Math.abs(s.start - l.start) < 0.002)), gaps.map((g) => g.toFixed(1)).join(" "));
  check("no layout twice in a row", plan.layouts.every((l, i) => !i || l.mode !== plan.layouts[i - 1].mode));
}
if (preset === "profile-silhouette") check("the background changes at beats", plan.beats.length >= 2 && new Set(plan.beats.map((b) => b.color)).size >= 2);
step("plan approved", "approve-gate", { projectDir, gate: "scenes" });
step("no avatar", "skip-gate", { projectDir, gate: "avatar" });

const prepared = step("what the pictures need", "recorded-prepare", { projectDir }, (d) => (d.notes ?? []).join(" "));
void prepared;
const motionFile = path.join(projectDir, "recorded", "motion.json");
if (preset === "screen-recording") {
  const motion = JSON.parse(fs.readFileSync(motionFile, "utf8"));
  console.log(`  cursor: coverage ${motion.coverage}, sure ${motion.sureShare}, ${motion.clicks} clicks, ${motion.stops} stops, ${motion.zooms.length} zooms, painted ${motion.painted}`);
  if (ownRecording) {
    check("the cursor is followed", motion.usable === true);
    check("a zoom comes with the clicks", motion.zooms.length >= 1);
    check("the view never leaves the picture", motion.view.every(([x, y, s]) => s >= 1 && s <= 2 && x - 0.5 / s >= -0.001 && x + 0.5 / s <= 1.001 && y - 0.5 / s >= -0.001 && y + 0.5 / s <= 1.001));
  }
}
if (preset === "profile-silhouette") check("the silhouette is made", fs.statSync(path.join(projectDir, "recorded", "figure.webm")).size > 10000);

if (args.broll) {
  check("the B-roll switch is copied into the video", read().recipe?.broll?.on === true);
  step("B-roll: where it goes, by rule", "broll-auto-plan-rule", { projectDir, identityDir }, (d) => d.plan.items.map((i) => i.query).join("; "));
  // a stretch the search can find for certain, so this step does not hang on the rule's words
  const brollFile = path.join(projectDir, "broll", "broll.json");
  const brollPlan = JSON.parse(fs.readFileSync(brollFile, "utf8"));
  check("B-roll: the engine found a place under the words", brollPlan.items.length >= 1);
  brollPlan.items[0].query = "rocket launch";
  fs.writeFileSync(brollFile, JSON.stringify(brollPlan, null, 2));
  const free = step("B-roll: the free sources, live", "broll-auto-find", { projectDir, identityDir }, (d) => `${d.found} found, ${d.open} open`);
  step("B-roll: finish", "broll-auto-finish", { projectDir, identityDir }, (d) => d.plan.items.filter((i) => i.state === "done").map((i) => i.source).join(", "));
  if (free.found) check("B-roll: the clip is in the table", (JSON.parse(fs.readFileSync(path.join(projectDir, "scenes.json"), "utf8")).footage ?? []).length >= 1);
}

const build = step("the existing preview step builds it", "build-video", { projectDir, identityDir }, (d) => `${d.scenes} shots, ${d.seconds} s, ${d.stills?.length ?? 0} stills`);
check("the preview has stills", (build.stills?.length ?? 0) >= 1);
const html = fs.readFileSync(path.join(projectDir, "build", "index.html"), "utf8");
check("no sound but the voice in the composition", (html.match(/<audio/g) ?? []).length === 1 && !/whoosh|swoosh|sfx/i.test(html));
if (args.broll) check("B-roll: the clip is in the composition", /id="footage-1"/.test(html));
const thumb = step("the Thumbnail tab opens on it", "thumbnail-state", { projectDir, identityDir }, () => "");
void thumb;
step("preview approved", "approve-gate", { projectDir, gate: "review" });
if (!args["no-render"]) {
  const render = step("the render", "render-video", { projectDir, identityDir, quality: args.quality }, (d) => `${path.basename(d.file)}, ${d.seconds} s video in ${d.renderSeconds} s`);
  check("the video is a real file", fs.statSync(render.file).size > 50000);
  check("the render has the cut's length", Math.abs(render.seconds - applied.kept) < 0.25, `${render.seconds} s of ${applied.kept} s`);
  const card = JSON.parse(fs.readFileSync(render.file.replace(/\.mp4$/, ".card.json"), "utf8"));
  check("the Publishing Card's length is the real final length", Math.abs(card.video.seconds - render.seconds) < 0.01);
  check("its chapters start at 0:00 and stay inside the video", card.chapters[0]?.start === 0 && card.chapters.every((c) => c.start < render.seconds));
  check("its chapters are the plan's, at the plan's times", card.chapters.every((c) => plan.chapters.some((p) => p.title === c.title && Math.abs(p.start - c.start) < 0.01)), card.chaptersText.replace(/\n/g, " | "));
  check("captions are next to it, on the new clock", fs.statSync(render.file.replace(/\.mp4$/, ".srt")).size > 50);
  check("the state says done", read().render?.state === "done" && read().status === "Reviewed");
  console.log(`\n  video: ${render.file}`);
}
finish();
