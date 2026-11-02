#!/usr/bin/env node
// channel-e2e.mjs: a channel video from a pasted script to a rendered MP4, with
// the real runner commands the app calls, the real free voice (Kokoro on this
// computer), music made by code, the preset's templates planned by rule (no
// key, no AI), the real engine and the real render. Nothing is paid and nothing
// leaves the computer but the voice model's first download.
//
// Usage: node scripts/phase2/channel-e2e.mjs --work <dir>
// Needs: the sidecars, the engine, the library and the render browser, like
// scripts/phase2/e2e.mjs. Exit code 0 only if every step passed.

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { values: args } = parseArgs({ options: { work: { type: "string" } } });
if (!args.work) {
  console.error("Usage: node scripts/phase2/channel-e2e.mjs --work <dir>");
  process.exit(2);
}

const env = { ...process.env };
const exe = process.platform === "win32" ? ".exe" : "";
env.HYPERFRAMES_FFMPEG_PATH ??= path.join(ROOT, "app", "src-tauri", "ffmpeg", `ffmpeg${exe}`);
env.HYPERFRAMES_FFPROBE_PATH ??= path.join(ROOT, "app", "src-tauri", "ffmpeg", `ffprobe${exe}`);

const results = [];
function finish() {
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `\nchannel e2e: ${failed} step(s) failed` : `\nchannel e2e: all ${results.length} steps passed`);
  process.exit(failed ? 1 : 0);
}
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`);
  if (!ok) finish();
}
function runner(command, request) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(ROOT, "runner", "main.mjs"), command], { input: JSON.stringify(request), encoding: "utf8", env, maxBuffer: 64 * 1024 * 1024 });
  const last = JSON.parse((r.stdout || "").trim().split("\n").at(-1) || "{}");
  return { ...last, stderr: r.stderr, seconds: Math.round((Date.now() - t0) / 100) / 10 };
}
function step(name, command, request, detail = (d) => "") {
  const r = runner(command, request);
  check(`${name} (${r.seconds} s)`, r.event === "result", r.event === "result" ? detail(r.data) : String(r.message ?? r.stderr).slice(0, 400));
  return r.data;
}

const SCRIPT = `# Why most channels lose people early

Most channels lose 40% of their viewers in the first 30 seconds. That is not a talent problem. It is a promise problem.

## Part 1

Do you tell people what they get? A clear promise keeps them watching. A vague promise sends them away.

## Part 2

Pick one viewer. Name one problem. Show one result. Then stop talking.`;

const work = path.resolve(args.work);
fs.rmSync(work, { recursive: true, force: true });
const identityDir = path.join(work, "identity");
const projectsDir = path.join(work, "videos");
fs.mkdirSync(identityDir, { recursive: true });
fs.mkdirSync(projectsDir, { recursive: true });

const state = step("the channel's start screen", "channel-state", { identityDir, projectsDir, identity: {} }, (d) => `${d.presets.length} preset, ${d.recipe.voice.provider} voice`);
check("the default recipe is free", state.recipe.voice.provider === "kokoro" && state.recipe.music.source === "synth" && state.recipe.preset === "motion-frames");
const saved = step("the recipe is locked in", "recipe-save", { identityDir, language: "en", recipe: { ...state.recipe, targetLengthMin: 1, avatar: { on: false } } }, (d) => d.recipe.preset);
check("the recipe keeps the avatar rule", saved.recipe.avatar.engine === "avatar_iii" && saved.recipe.avatar.layout === "overlay");
const sheet = step("the preset's style sheet", "preset-stylesheet", { identityDir, preset: "motion-frames" }, (d) => path.basename(d.file));
check("the style sheet is a picture", fs.statSync(sheet.file).size > 5000);

const video = step("a pasted script makes a video", "channel-video-new", { projectsDir, identityDir, identity: "test", language: "en", text: SCRIPT, mode: "script" }, (d) => d.id);
const projectDir = video.dir;
const read = () => JSON.parse(fs.readFileSync(path.join(projectDir, "project.json"), "utf8"));
check("the recipe is copied into the video", read().recipe?.preset === "motion-frames");
check("the pasted script is approved", read().gates.script.state === "approved");

step("the free voice model is on this computer", "voice-model-ensure", { voice: saved.recipe.voice.voice }, (d) => d.dir);
const voice = step("the free voice reads the script", "make-voice", { projectDir, identityDir, narrator: { provider: "kokoro", voice: saved.recipe.voice.voice }, music: null }, (d) => `${d.info.seconds} s, ${d.info.sentences} sentences`);
const words = JSON.parse(fs.readFileSync(path.join(projectDir, "words.json"), "utf8"));
check("every word of the script has its time", words.some((w) => w.text === "40%") && words.every((w, i) => w.end >= w.start && (!i || w.start >= words[i - 1].start)) && words.at(-1).end <= voice.info.seconds + 0.1);
const music = step("music made by code", "make-music", { projectDir, identityDir, music: { provider: "synth", mood: "calm" } }, (d) => `${d.info.finalLufs} LUFS`);
check("the mix is at YouTube's level", Math.abs(music.info.finalLufs + 14) < 1.5, `${music.info.finalLufs} LUFS`);
check("the music is a code-made file", fs.existsSync(path.join(projectDir, "audio", "music.wav")));
step("voice approved", "approve-gate", { projectDir, gate: "voice" });

const plan = step("the templates, planned by rule", "simple-template-scenes", { projectDir, identityDir }, (d) => `${d.parts} parts, ${d.byRule} by rule`);
check("the plan is by rule, without the AI", plan.byRule > 0);
const table = JSON.parse(fs.readFileSync(path.join(projectDir, "scenes.json"), "utf8"));
check("the plan has several scenes", table.scenes.length >= 3, table.scenes.map((s) => s.component).join(" "));
check("no component twice in a row", table.scenes.every((s, i) => !i || s.component !== table.scenes[i - 1].component));
step("scenes approved", "approve-gate", { projectDir, gate: "scenes" });
step("no avatar on this recipe", "skip-gate", { projectDir, gate: "avatar" });

const build = step("the existing preview step builds it", "build-video", { projectDir, identityDir }, (d) => `${d.scenes} scenes, ${d.seconds} s, ${d.stills?.length ?? 0} stills`);
check("the preview has stills", (build.stills?.length ?? 0) >= 1);
step("preview approved", "approve-gate", { projectDir, gate: "review" });
const render = step("the render", "render-video", { projectDir, identityDir, quality: "draft" }, (d) => path.basename(d.file));
check("the video is a real file", fs.statSync(render.file).size > 50000);
check("the Publishing Card is next to it", fs.existsSync(render.file.replace(/\.mp4$/, ".card.json")));
check("the queue stays empty without a batch", runner("queue-list", { projectsDir }).data.queue.length === 0);
console.log(`\n  video: ${render.file}`);
finish();
