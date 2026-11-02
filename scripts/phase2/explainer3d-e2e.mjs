#!/usr/bin/env node
// explainer3d-e2e.mjs: the 3D Explainer preset (docs/BUILD_PLAN.md phase 4) through the
// real runner commands, the real free voice, music made by code, the real engine and a
// real render. Two videos: one planned by rule with no AI, as a channel with a dead key
// would get it, and one that uses every template once, to look at. Nothing is paid.
//
// Usage: node scripts/phase2/explainer3d-e2e.mjs --work <dir> [--only every|rule]
// Exit code 0 only if every step passed. The stills and frames stay under <dir>.

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { values: args } = parseArgs({ options: { work: { type: "string" }, only: { type: "string" } } });
if (!args.work) {
  console.error("Usage: node scripts/phase2/explainer3d-e2e.mjs --work <dir> [--only every|rule]");
  process.exit(2);
}

const env = { ...process.env };
const exe = process.platform === "win32" ? ".exe" : "";
env.HYPERFRAMES_FFMPEG_PATH ??= path.join(ROOT, "app", "src-tauri", "ffmpeg", `ffmpeg${exe}`);
env.HYPERFRAMES_FFPROBE_PATH ??= path.join(ROOT, "app", "src-tauri", "ffmpeg", `ffprobe${exe}`);

const results = [];
function finish() {
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `\n3D explainer e2e: ${failed} step(s) failed` : `\n3D explainer e2e: all ${results.length} steps passed`);
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

const SCRIPT = `# What if the Moon were hollow?

What if the Moon were hollow? Most people have never asked. The answer starts with one number.

## Part 1

The Moon is 27% as wide as the Earth. The Earth is bigger than the Moon, and the Moon is bigger than any mountain. Look inside the Moon and you find a core, a mantle and a crust.

## Part 2

A hollow Moon would weigh almost nothing, but a solid Moon pulls on every ocean. Tides rise because the Moon pulls the water. Think of 4 steps. Measure the orbit. Weigh the planet. Compare the numbers. Check the rocks.

## Part 3

Four things give it away. Rocks, quakes, orbits and water all say the same. So is the Moon hollow? No. It is solid, and that is why the sea moves.`;

const work = path.resolve(args.work);
fs.rmSync(work, { recursive: true, force: true });
const identityDir = path.join(work, "identity");
const projectsDir = path.join(work, "videos");
fs.mkdirSync(identityDir, { recursive: true });
fs.mkdirSync(projectsDir, { recursive: true });

const state = step("the channel's start screen", "channel-state", { identityDir, projectsDir, identity: {} }, (d) => d.presets.map((p) => p.id).join(", "));
const card = state.presets.find((p) => p.id === "explainer-3d");
check("the preset is offered", !!card && card.templates.length >= 8 && card.templates.length <= 15, `${card?.templates.length} templates`);
const saved = step("the recipe is locked in", "recipe-save", { identityDir, language: "en", recipe: { ...state.recipe, preset: "explainer-3d", targetLengthMin: 1, avatar: { on: false }, broll: { on: false } } }, (d) => d.recipe.preset);
check("the recipe keeps the preset", saved.recipe.preset === "explainer-3d");
const sheet = step("the preset's style sheet", "preset-stylesheet", { identityDir, preset: "explainer-3d" }, (d) => path.basename(d.file));
check("the style sheet has the preset's own colors", sheet.tokens.colors.primary === "#f2542d" && fs.statSync(sheet.file).size > 5000);
fs.copyFileSync(sheet.file, path.join(work, "stylesheet.png"));

const video = step("a pasted script makes a video", "channel-video-new", { projectsDir, identityDir, identity: "test", language: "en", text: SCRIPT, textKind: "finished" }, (d) => d.id);
const projectDir = video.dir;
const read = () => JSON.parse(fs.readFileSync(path.join(projectDir, "project.json"), "utf8"));
check("the recipe is copied into the video", read().recipe?.preset === "explainer-3d");
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
  check(`${label}: three.js and the drawing code are on the page`, page.includes("three.global.js") && page.includes("explainer-3d-world3d.js"));
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
  check("the plan uses the preset's own templates", table.scenes.every((s) => s.component.startsWith("explainer-3d:") || !s.template), used.join(" "));
  for (const id of ["title", "scale", "cutaway", "versus", "cause", "question", "percent"]) check(`the rule found a place for ${id}`, used.includes(id));
  check("objects are the ones the sentences name", table.scenes.some((s) => Object.values(s.vars).includes("moon")) && table.scenes.some((s) => Object.values(s.vars).includes("planet")));
  const map = step("the Shot map", "shot-map-make", { projectDir, identityDir }, (d) => `${d.summary.shots} shots, ${d.summary.onTheirWord} of ${d.summary.elements} on their word`);
  check("the Shot map has no warning", !map.warning, map.warning ?? "");
  check("the Shot map says the camera is the scene's own", map.shots.every((s) => s.camera === "3D move, its own" || s.call), [...new Set(map.shots.map((s) => s.camera))].join(", "));
  const { render: r, out } = render("rule");
  console.log(`\n  by rule: ${path.join(out, "video.mp4")} (${r.seconds} s, render ${r.renderSeconds} s)`);
}

// ---- every template once, to look at --------------------------------------------------

if (args.only !== "rule") {
  const ROWS = [
    ["title", { headline: "Is the Moon hollow?", kicker: "One strange question", object: "moon" }],
    ["chapter", { headline: "Start with one number", object: "clock" }],
    ["percent", { value: 27 }],
    ["statement", { line1: "A hollow Moon", line2: "weighs nothing", object: "moon" }],
    ["scale", { small: "Moon", big: "Earth", smallObject: "moon", bigObject: "planet", ratio: "4 times wider" }],
    ["cutaway", { headline: "Inside the Moon", object: "moon", outer: "Crust", middle: "Mantle", inner: "Core" }],
    ["versus", { left: "A hollow Moon", right: "A solid Moon", leftObject: "cheese", rightObject: "moon" }],
    ["cause", { from: "Moon pulls", to: "Tides rise", fromObject: "moon", toObject: "drop" }],
    ["stairs", { step1: "Measure", step2: "Weigh", step3: "Compare", step4: "Check" }],
    ["number", { value: 4, after: "steps", object: "gear" }],
    ["shelf", { item1: "Rocks", item2: "Quakes", item3: "Orbits", item4: "Water", object1: "mountain", object2: "tower", object3: "rocket", object4: "drop" }],
    ["question", { question: "So is it hollow?", object: "moon" }],
    ["word", { word: "No", object: "moon" }],
    ["highlight", { line: "It is solid, and the sea moves", mark: "solid", object: "fish" }],
  ];
  check("the script has a sentence for every template", sentences.length >= ROWS.length, `${sentences.length} sentences, ${ROWS.length} templates`);
  const per = Math.floor(sentences.length / ROWS.length);
  const scenes = ROWS.map(([id, vars], i) => {
    const from = sentences[i * per].id;
    const to = i === ROWS.length - 1 ? sentences.at(-1).id : sentences[(i + 1) * per - 1].id;
    return { from, ...(to !== from ? { to } : {}), component: `explainer-3d:${id}`, vars, template: id };
  });
  const tableFile = path.join(projectDir, "scenes.json");
  const before = fs.existsSync(tableFile) ? JSON.parse(fs.readFileSync(tableFile, "utf8")) : {};
  fs.writeFileSync(tableFile, JSON.stringify({ ...before, scenes, footage: [] }, null, 2));
  const { render: r, out } = render("every");
  console.log(`\n  every template: ${path.join(out, "video.mp4")} (${r.seconds} s, render ${r.renderSeconds} s)`);
}
finish();
