#!/usr/bin/env node
// shorts-e2e.mjs: a real 9:16 Short of every style preset, and one with Khmer captions (FIX_PLAN
// 2026-11-19, items 2 and 3, DECISIONS 188, 189). The same runner commands the app runs: the recipe
// locked as a Short, a pasted script, the free voice, the rule-made plan, the build, the render.
// Then ffprobe says 1080x1920, and one frame of each is kept next to the video for a look.
//
//   node scripts/phase2/shorts-e2e.mjs --work <dir> [--only stick-world,soft-clay]

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { values: args } = parseArgs({ options: { work: { type: "string" }, only: { type: "string" } } });
if (!args.work) {
  console.error("Usage: node scripts/phase2/shorts-e2e.mjs --work <dir> [--only <preset,preset>]");
  process.exit(2);
}
const env = { ...process.env };
const exe = process.platform === "win32" ? ".exe" : "";
const FFMPEG = path.join(ROOT, "app", "src-tauri", "ffmpeg", `ffmpeg${exe}`);
const FFPROBE = path.join(ROOT, "app", "src-tauri", "ffmpeg", `ffprobe${exe}`);
env.HYPERFRAMES_FFMPEG_PATH ??= FFMPEG;
env.HYPERFRAMES_FFPROBE_PATH ??= FFPROBE;

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`);
  return ok;
}
function runner(command, request) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(ROOT, "runner", "main.mjs"), command], { input: JSON.stringify(request), encoding: "utf8", env, maxBuffer: 64 * 1024 * 1024 });
  const last = JSON.parse((r.stdout || "").trim().split("\n").at(-1) || "{}");
  return { ...last, stderr: r.stderr, seconds: Math.round((Date.now() - t0) / 100) / 10 };
}
function step(name, command, request) {
  const r = runner(command, request);
  if (!check(`${name} (${r.seconds} s)`, r.event === "result", r.event === "result" ? "" : String(r.message ?? r.stderr).slice(0, 600))) throw new Error(`${name} failed`);
  return r.data;
}

const SCRIPT = `# Three habits for a calm morning

Most people start the day already tired. Here is a simple fix that takes five minutes.

## The habits

First, drink a glass of water before your phone. Then open the window and breathe slowly. Finally, write one goal for the day on paper.

## The point

Small steps beat big plans. Try it for 7 days and see.`;

// the same narration in Khmer, by hand, sentence by sentence (the captions of the Khmer test)
const KHMER = [
  "មនុស្សភាគច្រើនចាប់ផ្តើមថ្ងៃដោយហត់នឿយរួចទៅហើយ។",
  "នេះជាដំណោះស្រាយសាមញ្ញមួយដែលចំណាយពេលតែប្រាំនាទី។",
  "ទីមួយ ផឹកទឹកមួយកែវមុនពេលមើលទូរស័ព្ទ។",
  "បន្ទាប់មក បើកបង្អួច ហើយដកដង្ហើមយឺតៗ។",
  "ចុងក្រោយ សរសេរគោលដៅមួយសម្រាប់ថ្ងៃនេះលើក្រដាស។",
  "ជំហានតូចៗល្អជាងផែនការធំៗ។",
  "សាកល្បងវារយៈពេល 7 ថ្ងៃ ហើយមើល។",
];

const PRESETS = ["motion-frames", "explainer-3d", "stick-world", "archive-collage", "night-case-file", "soft-clay"];
const only = args.only ? args.only.split(",") : null;
const work = path.resolve(args.work);
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });

function probe(file) {
  const r = spawnSync(FFPROBE, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file], { encoding: "utf8" });
  return r.stdout.trim();
}
function frame(file, at, out) {
  spawnSync(FFMPEG, ["-y", "-v", "error", "-ss", String(at), "-i", file, "-frames:v", "1", out]);
  return fs.existsSync(out);
}

function oneShort(preset, { khmer = false } = {}) {
  const name = khmer ? `${preset}-khmer` : preset;
  console.log(`\n${name}`);
  const base = path.join(work, name);
  const identityDir = path.join(base, "identity");
  const projectsDir = path.join(base, "videos");
  fs.mkdirSync(identityDir, { recursive: true });
  fs.mkdirSync(projectsDir, { recursive: true });
  const state = step("start screen", "channel-state", { identityDir, projectsDir, identity: {} });
  const saved = step("recipe locked as a Short", "recipe-save", { identityDir, language: "en", recipe: { ...state.recipe, preset, format: "short", shortSeconds: 15, avatar: { on: false }, broll: { on: false }, music: { on: false, source: "synth", mood: "calm" } } });
  check("the recipe is a 15 second Short", saved.recipe.format === "short" && saved.recipe.shortSeconds === 15 && saved.recipe.targetLengthMin === 0.25);
  const video = step("a pasted script makes a video", "channel-video-new", { projectsDir, identityDir, identity: "test", language: "en", text: SCRIPT, textKind: "finished" });
  const projectDir = video.dir;
  const project = JSON.parse(fs.readFileSync(path.join(projectDir, "project.json"), "utf8"));
  check("the video is a Short", project.recipe.format === "short");
  if (khmer) {
    step("captions in Khmer", "languages-set", { projectDir, languages: { captions: "km" } });
    const st = step("the script's sentences", "languages-state", { projectDir });
    check("seven sentences to translate", st.units.length === KHMER.length, `${st.units.length}`);
    step("the Khmer translation, approved", "translation-save", { projectDir, lang: "km", texts: KHMER, approve: true });
  }
  step("the free voice model", "voice-model-ensure", { voice: saved.recipe.voice.voice });
  step("the free voice", "make-voice", { projectDir, identityDir, narrator: { provider: "kokoro", voice: saved.recipe.voice.voice }, music: null });
  step("voice approved", "approve-gate", { projectDir, gate: "voice" });
  step("the rule-made plan", "simple-template-scenes", { projectDir, identityDir });
  step("scenes approved", "approve-gate", { projectDir, gate: "scenes" });
  const gates = JSON.parse(fs.readFileSync(path.join(projectDir, "project.json"), "utf8")).gates;
  if (gates.avatar?.state !== "skipped") step("no avatar", "skip-gate", { projectDir, gate: "avatar" });
  const build = step("the build", "build-video", { projectDir, identityDir });
  const page = fs.readFileSync(path.join(projectDir, "build", "index.html"), "utf8");
  check("the page is 1080x1920", page.includes('data-width="1080" data-height="1920"'));
  check("vertical screens, one idea each", build.scenes >= 6, `${build.scenes} screens`);
  check("captions in the middle third", page.includes("vcaptions"));
  if (khmer) {
    const cap = fs.readFileSync(path.join(projectDir, "build", "compositions", "components", "vcaptions.html"), "utf8");
    check("the captions carry the Khmer words", cap.includes("ផឹកទឹក"));
    check("the Khmer font is in the build", fs.existsSync(path.join(projectDir, "build", "fonts", "noto-sans-khmer", "khmer-wght-normal.woff2")) && page.includes("Noto Sans Khmer"));
  }
  step("preview approved", "approve-gate", { projectDir, gate: "review" });
  const r = step("the render", "render-video", { projectDir, identityDir, quality: "draft" });
  const size = probe(r.file);
  check("the video is 1080x1920", size === "1080,1920", size);
  const out = path.join(work, `${name}.mp4`);
  fs.copyFileSync(r.file, out);
  for (const at of [1.5, 6, 11]) frame(out, at, path.join(work, `${name}-${at}s.png`));
}

const list = PRESETS.filter((p) => !only || only.includes(p));
for (const p of list) {
  try {
    oneShort(p);
  } catch (e) {
    console.log(`  ${e.message}`);
  }
}
if (!only || only.includes("khmer")) {
  try {
    oneShort("stick-world", { khmer: true });
  } catch (e) {
    console.log(`  ${e.message}`);
  }
}
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\nShorts e2e: ${failed} step(s) failed` : `\nShorts e2e: all ${results.length} steps passed. Videos and frames: ${work}`);
process.exit(failed ? 1 : 0);
