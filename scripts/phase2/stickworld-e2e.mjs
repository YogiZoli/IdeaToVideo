#!/usr/bin/env node
// stickworld-e2e.mjs: the Stick World preset (docs/BUILD_PLAN.md phase 5) through the real
// runner commands, the real free voice, music made by code, the real engine and a real
// render. Two videos: one planned by rule with no AI, as a channel with a dead key would get
// it, and one that uses every template once, to look at. Nothing is paid.
//
// Usage: node scripts/phase2/stickworld-e2e.mjs --work <dir> [--only every|rule]
// Exit code 0 only if every step passed. The stills and frames stay under <dir>.

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { values: args } = parseArgs({ options: { work: { type: "string" }, only: { type: "string" } } });
if (!args.work) {
  console.error("Usage: node scripts/phase2/stickworld-e2e.mjs --work <dir> [--only every|rule]");
  process.exit(2);
}

const env = { ...process.env };
const exe = process.platform === "win32" ? ".exe" : "";
env.HYPERFRAMES_FFMPEG_PATH ??= path.join(ROOT, "app", "src-tauri", "ffmpeg", `ffmpeg${exe}`);
env.HYPERFRAMES_FFPROBE_PATH ??= path.join(ROOT, "app", "src-tauri", "ffmpeg", `ffprobe${exe}`);

const results = [];
function finish() {
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `\nStick World e2e: ${failed} step(s) failed` : `\nStick World e2e: all ${results.length} steps passed`);
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
function step(name, command, request, detail = () => "") {
  const r = runner(command, request);
  check(`${name} (${r.seconds} s)`, r.event === "result", r.event === "result" ? detail(r.data) : String(r.message ?? r.stderr).slice(0, 600));
  return r.data;
}

const SCRIPT = `# What if you woke up on the Moon?

What if you woke up one morning on the Moon? You open your eyes and everything is grey. Would you even notice the difference at first?

## Part 1

You imagine a warm house and your own soft bed. Your friend on the radio says "stay very calm" to you. You walk slowly over to the door of the base. Behind it the whole room is simply gone. You have 3 bottles of water left to drink. Only 27% of your air is left in the tank.

## Part 2

You look for help, but the ground stays empty and grey. You feel very light because the Moon pulls much less. Here are the 4 steps that can get you out. First you find the rocket behind the hill. Then you open the hatch with both hands. Then you press the big button on the wall. And then the long road home begins for you.

## Part 3

Night falls here and it lasts for 14 days. The cold is the real problem you have to beat. So you leave today and you do not look back. Three days later you make it home in one piece. And your dog is sitting at the door waiting for you.`;

const work = path.resolve(args.work);
fs.rmSync(work, { recursive: true, force: true });
const identityDir = path.join(work, "identity");
const projectsDir = path.join(work, "videos");
fs.mkdirSync(identityDir, { recursive: true });
fs.mkdirSync(projectsDir, { recursive: true });

const state = step("the channel's start screen", "channel-state", { identityDir, projectsDir, identity: {} }, (d) => d.presets.map((p) => p.id).join(", "));
const card = state.presets.find((p) => p.id === "stick-world");
check("the preset is offered", !!card && card.templates.length >= 8 && card.templates.length <= 15, `${card?.templates.length} templates`);
const saved = step("the recipe is locked in", "recipe-save", { identityDir, language: "en", recipe: { ...state.recipe, preset: "stick-world", targetLengthMin: 1, avatar: { on: false }, broll: { on: false } } }, (d) => d.recipe.preset);
check("the recipe keeps the preset", saved.recipe.preset === "stick-world");
const sheet = step("the preset's style sheet", "preset-stylesheet", { identityDir, preset: "stick-world" }, (d) => path.basename(d.file));
check("the style sheet has the preset's own colors", sheet.tokens.colors.primary === "#e0332e" && fs.statSync(sheet.file).size > 5000);
fs.copyFileSync(sheet.file, path.join(work, "stylesheet.png"));

const video = step("a pasted script makes a video", "channel-video-new", { projectsDir, identityDir, identity: "test", language: "en", text: SCRIPT, textKind: "finished" }, (d) => d.id);
const projectDir = video.dir;
const read = () => JSON.parse(fs.readFileSync(path.join(projectDir, "project.json"), "utf8"));
check("the recipe is copied into the video", read().recipe?.preset === "stick-world");
step("the free voice model is on this computer", "voice-model-ensure", { voice: saved.recipe.voice.voice }, (d) => d.dir);
const voice = step("the free voice reads the script", "make-voice", { projectDir, identityDir, narrator: { provider: "kokoro", voice: saved.recipe.voice.voice }, music: null }, (d) => `${d.info.seconds} s, ${d.info.sentences} sentences`);
step("music made by code", "make-music", { projectDir, identityDir, music: { provider: "synth", mood: "calm" } }, (d) => `${d.info.finalLufs} LUFS`);
step("voice approved", "approve-gate", { projectDir, gate: "voice" });
const sentences = JSON.parse(fs.readFileSync(path.join(projectDir, "sentences.json"), "utf8"));

const render = (label) => {
  step("scenes approved", "approve-gate", { projectDir, gate: "scenes" });
  const gates = read().gates;
  if (gates.avatar?.state !== "skipped") step("no avatar on this recipe", "skip-gate", { projectDir, gate: "avatar" });
  const build = step(`${label}: the preview step builds it`, "build-video", { projectDir, identityDir }, (d) => `${d.scenes} scenes, ${d.seconds} s, ${d.stills?.length ?? 0} stills`);
  const out = path.join(work, label);
  fs.mkdirSync(out, { recursive: true });
  for (const s of build.stills ?? []) {
    const file = typeof s === "string" ? s : s.file ?? s.path;
    if (file && fs.existsSync(path.join(projectDir, file))) fs.copyFileSync(path.join(projectDir, file), path.join(out, path.basename(file)));
    else if (file && fs.existsSync(file)) fs.copyFileSync(file, path.join(out, path.basename(file)));
  }
  const page = fs.readFileSync(path.join(projectDir, "build", "index.html"), "utf8");
  check(`${label}: the drawing code is on the page, three.js is not`, !page.includes("three.global.js") && page.includes("stick-world-stick.js"));
  check(`${label}: no web font, no outside address`, !/https?:\/\/(?!www\.w3\.org)/.test(page));
  step(`${label}: preview approved`, "approve-gate", { projectDir, gate: "review" });
  const r = step(`${label}: the render`, "render-video", { projectDir, identityDir, quality: "draft" }, (d) => `${path.basename(d.file)}, ${d.renderSeconds ?? "?"} s`);
  check(`${label}: the video is a real file`, fs.statSync(r.file).size > 50000);
  fs.copyFileSync(r.file, path.join(out, "video.mp4"));
  return { build, render: r, out };
};

// ---- by rule, with no AI --------------------------------------------------------------

if (args.only !== "every") {
  const plan = step("the templates, planned by rule", "simple-template-scenes", { projectDir, identityDir }, (d) => `${d.parts} parts, ${d.byRule} by rule`);
  check("the plan is by rule, without the AI", plan.byRule > 0);
  const table = JSON.parse(fs.readFileSync(path.join(projectDir, "scenes.json"), "utf8"));
  const used = [...new Set(table.scenes.map((s) => s.template))];
  check("one short sentence per shot", table.scenes.length >= sentences.length * 0.8, `${table.scenes.length} shots, ${sentences.length} sentences`);
  check("the plan uses the preset's own templates", table.scenes.every((s) => s.component.startsWith("stick-world:") || !s.template), used.join(" "));
  for (const id of ["title", "thought", "talk", "walk", "versus", "cause", "question", "percent", "number"]) check(`the rule found a place for ${id}`, used.includes(id));
  check("objects are the ones the sentences name", table.scenes.some((s) => Object.values(s.vars).includes("door")) && table.scenes.some((s) => Object.values(s.vars).includes("house")));
  const map = step("the Shot map", "shot-map-make", { projectDir, identityDir }, (d) => `${d.summary.shots} shots, ${d.summary.onTheirWord} of ${d.summary.elements} on their word`);
  check("the Shot map has no warning", !map.warning, map.warning ?? "");
  check("the Shot map says the camera is the scene's own", map.shots.every((s) => s.camera === "Nearly still" || s.call), [...new Set(map.shots.map((s) => s.camera))].join(", "));
  const { render: r, out } = render("rule");
  console.log(`\n  by rule: ${path.join(out, "video.mp4")} (${r.seconds} s, render ${r.renderSeconds} s)`);
}

// ---- every template once, to look at --------------------------------------------------

if (args.only !== "rule") {
  const ROWS = [
    ["title", { headline: "What if you woke up on the Moon?", kicker: "One short story", object: "moon" }],
    ["chapter", { headline: "Day one", object: "door" }],
    ["statement", { line1: "You open your eyes", line2: "Nothing is here", object: "none" }],
    ["thought", { line: "You imagine a warm house", object: "house" }],
    ["talk", { said: "Stay very calm", object: "none" }],
    ["walk", { line: "You walk to the door", object: "door" }],
    ["number", { value: 3, after: "bottles" }],
    ["percent", { value: 27 }],
    ["versus", { left: "You run", right: "They wait", leftObject: "rocket", rightObject: "none" }],
    ["cause", { from: "Moon pulls less", to: "You feel light", fromObject: "moon", toObject: "none" }],
    ["path", { step1: "Find the rocket", step2: "Open the hatch", step3: "Press the button", step4: "Go home" }],
    ["question", { question: "Would you even notice?", object: "clock" }],
    ["word", { word: "Home", object: "house" }],
    ["highlight", { line: "Your dog is waiting for you", mark: "waiting", object: "dog" }],
  ];
  check("the script has a sentence for every template", sentences.length >= ROWS.length, `${sentences.length} sentences, ${ROWS.length} templates`);
  const per = Math.floor(sentences.length / ROWS.length);
  const scenes = ROWS.map(([id, vars], i) => {
    const from = sentences[i * per].id;
    const to = i === ROWS.length - 1 ? sentences.at(-1).id : sentences[(i + 1) * per - 1].id;
    return { from, ...(to !== from ? { to } : {}), component: `stick-world:${id}`, vars, template: id };
  });
  const tableFile = path.join(projectDir, "scenes.json");
  const before = fs.existsSync(tableFile) ? JSON.parse(fs.readFileSync(tableFile, "utf8")) : {};
  fs.writeFileSync(tableFile, JSON.stringify({ ...before, scenes, footage: [] }, null, 2));
  const { render: r, out } = render("every");
  console.log(`\n  every template: ${path.join(out, "video.mp4")} (${r.seconds} s, render ${r.renderSeconds} s)`);
}
finish();
