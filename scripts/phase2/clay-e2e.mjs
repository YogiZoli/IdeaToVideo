#!/usr/bin/env node
// clay-e2e.mjs: the Soft Clay Chronicle preset (docs/BUILD_PLAN.md phase 8) through the real runner
// commands, the real free voice, music made by code, the real engine and a real render. Two videos:
// one planned by rule with no AI, as a channel with a dead key would get it, and one that uses every
// template once, to look at. Nothing is paid.
//
// Usage: node scripts/phase2/clay-e2e.mjs --work <dir> [--only every|rule]
// Exit code 0 only if every step passed. The stills and frames stay under <dir>.

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { values: args } = parseArgs({ options: { work: { type: "string" }, only: { type: "string" } } });
if (!args.work) {
  console.error("Usage: node scripts/phase2/clay-e2e.mjs --work <dir> [--only every|rule]");
  process.exit(2);
}

const env = { ...process.env };
const exe = process.platform === "win32" ? ".exe" : "";
env.HYPERFRAMES_FFMPEG_PATH ??= path.join(ROOT, "app", "src-tauri", "ffmpeg", `ffmpeg${exe}`);
env.HYPERFRAMES_FFPROBE_PATH ??= path.join(ROOT, "app", "src-tauri", "ffmpeg", `ffprobe${exe}`);

const results = [];
function finish() {
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `\nSoft clay e2e: ${failed} step(s) failed` : `\nSoft clay e2e: all ${results.length} steps passed`);
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

// An invented story, as a test.
const SCRIPT = `# The clockmaker's lost letter

Who wrote the letter that sat in a clock for two hundred years? Most people in the town never asked about it, and the seasons simply went by.

## Part 1

In 1752 a clockmaker lived and worked quietly by the river. His small town lay deep in the mountains of Austria. He kept 12 clocks on the walls of a narrow workshop. On March 14, 1760, he sailed from Lisbon to London. The ship carried a chest, a lantern, a book and a crown.

## Part 2

The merchant said, "Keep this letter safe." In 1761 the clockmaker came home to Austria. The letter was found inside a clock, and it was kept in the castle. Prices rose across the whole region because the harvest failed that year. A poor farmer sold his cart at the market, but a rich king built a bridge.

## Part 3

Is the letter still there today? Nobody can say for certain. The town still tells the story every winter. Old people say the clock stopped on that day. It was the smallest thing in the whole story.`;

const work = path.resolve(args.work);
fs.rmSync(work, { recursive: true, force: true });
const identityDir = path.join(work, "identity");
const projectsDir = path.join(work, "videos");
fs.mkdirSync(identityDir, { recursive: true });
fs.mkdirSync(projectsDir, { recursive: true });

const state = step("the channel's start screen", "channel-state", { identityDir, projectsDir, identity: {} }, (d) => d.presets.map((p) => p.id).join(", "));
const card = state.presets.find((p) => p.id === "soft-clay");
check("the preset is offered", !!card && card.templates.length >= 8 && card.templates.length <= 15, `${card?.templates.length} templates`);
check("its defaults: research on, warm music, no B-roll", card.defaults.research === true && card.defaults.mood === "warm" && card.defaults.broll === false);
const saved = step("the recipe is locked in", "recipe-save", { identityDir, language: "en", recipe: { ...state.recipe, preset: "soft-clay", targetLengthMin: 1, avatar: { on: false }, broll: { on: false }, music: { on: true, source: "synth", mood: "warm" } } }, (d) => d.recipe.preset);
check("the recipe keeps the preset", saved.recipe.preset === "soft-clay");
const sheet = step("the preset's style sheet", "preset-stylesheet", { identityDir, preset: "soft-clay" }, (d) => path.basename(d.file));
check("the style sheet has the preset's own colors", sheet.tokens.colors.primary === "#e07a4a" && fs.statSync(sheet.file).size > 5000);
fs.copyFileSync(sheet.file, path.join(work, "stylesheet.png"));

const video = step("a pasted script makes a video", "channel-video-new", { projectsDir, identityDir, identity: "test", language: "en", text: SCRIPT, textKind: "finished" }, (d) => d.id);
const projectDir = video.dir;
const read = () => JSON.parse(fs.readFileSync(path.join(projectDir, "project.json"), "utf8"));
check("the recipe is copied into the video", read().recipe?.preset === "soft-clay");
step("the free voice model is on this computer", "voice-model-ensure", { voice: saved.recipe.voice.voice }, (d) => d.dir);
step("the free voice reads the script", "make-voice", { projectDir, identityDir, narrator: { provider: "kokoro", voice: saved.recipe.voice.voice }, music: null }, (d) => `${d.info.seconds} s, ${d.info.sentences} sentences`);
step("music made by code", "make-music", { projectDir, identityDir, music: { provider: "synth", mood: "warm" } }, (d) => `${d.info.finalLufs} LUFS`);
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
  check(`${label}: three.js, the shared 3D code, the maps and the clay are on the page`, page.includes("three.global.js") && page.includes("soft-clay-world3d.js") && page.includes("soft-clay-map-data.js") && page.includes("soft-clay-clay.js"));
  check(`${label}: no web font, no outside address`, !/https?:\/\/(?!www\.w3\.org)/.test(page));
  check(`${label}: the date label is on the page once the voice has said a date`, /&quot;date&quot;|"date"/.test(page));
  step(`${label}: preview approved`, "approve-gate", { projectDir, gate: "review" });
  const r = step(`${label}: the render`, "render-video", { projectDir, identityDir, quality: "draft" }, (d) => `${path.basename(d.file)}, ${d.renderSeconds ?? "?"} s`);
  check(`${label}: the video is a real file`, fs.statSync(r.file).size > 50000);
  fs.copyFileSync(r.file, path.join(out, "video.mp4"));
  const ledger = JSON.parse(fs.readFileSync(path.join(projectDir, "assets_license.json"), "utf8"));
  check(`${label}: the maps are in the video's license log`, ledger.assets.some((a) => a.source === "natural-earth" && a.license === "pd"));
  return { build, render: r, out };
};

// ---- by rule, with no AI --------------------------------------------------------------

if (args.only !== "every") {
  const plan = step("the templates, planned by rule", "simple-template-scenes", { projectDir, identityDir }, (d) => `${d.parts} parts, ${d.byRule} by rule`);
  check("the plan is by rule, without the AI", plan.byRule > 0);
  const table = JSON.parse(fs.readFileSync(path.join(projectDir, "scenes.json"), "utf8"));
  const used = [...new Set(table.scenes.map((s) => s.template))];
  check("the plan uses the preset's own templates", table.scenes.every((s) => s.component.startsWith("soft-clay:") || !s.template), used.join(" "));
  for (const id of ["title", "year", "route", "map", "talk", "relic", "cause", "versus", "board", "question", "number"]) check(`the rule found a place for ${id}`, used.includes(id));
  check("the plan's table has no date: only the build adds it", table.scenes.every((s) => !("date" in (s.vars ?? {}))));
  const map = step("the Shot map", "shot-map-make", { projectDir, identityDir }, (d) => `${d.summary.shots} shots, ${d.summary.onTheirWord} of ${d.summary.elements} on their word`);
  check("the Shot map has no warning", !map.warning, map.warning ?? "");
  check("the Shot map says the camera is the scene's own", map.shots.every((s) => s.camera === "One slow 3D move, its own" || s.call), [...new Set(map.shots.map((s) => s.camera))].join(", "));
  const { render: r, out } = render("rule");
  console.log(`\n  by rule: ${path.join(out, "video.mp4")} (${r.seconds} s, render ${r.renderSeconds} s)`);
}

// ---- every template once, to look at --------------------------------------------------

if (args.only !== "rule") {
  const ROWS = [
    ["title", { headline: "The clockmaker's lost letter", kicker: "An invented test story", object: "letter" }],
    ["year", { value: 1752, line: "A clockmaker in a small town", object: "clock" }],
    ["map", { place: "austria", label: "Austria", line: "A small town in the Alps" }],
    ["number", { value: 12, after: "clocks", object: "clock" }],
    ["route", { fromPlace: "lisbon", toPlace: "london", fromLabel: "Lisbon", toLabel: "London", object: "ship" }],
    ["board", { item1: "A chest", item2: "A lantern", item3: "A book", item4: "A crown", object1: "chest", object2: "lantern", object3: "book", object4: "crown" }],
    ["talk", { said: "Keep this letter safe", object: "letter" }],
    ["chapter", { headline: "He came home", object: "house" }],
    ["relic", { object: "letter", line: "Found inside a clock" }],
    ["cause", { from: "The harvest failed", to: "Prices rose", fromObject: "wheat", toObject: "coin" }],
    ["versus", { left: "A poor farmer", right: "A rich king", leftObject: "farmer", rightObject: "king" }],
    ["question", { question: "Is the letter still there?", object: "castle" }],
    ["statement", { line1: "Nobody can say", line2: "for certain", object: "scholar" }],
    ["highlight", { line: "The smallest thing in the story", mark: "smallest", object: "quill" }],
    ["word", { word: "Remembered", object: "scroll" }],
  ];
  check("the script has a sentence for every template", sentences.length >= ROWS.length, `${sentences.length} sentences, ${ROWS.length} templates`);
  const per = Math.floor(sentences.length / ROWS.length);
  const scenes = ROWS.map(([id, vars], i) => {
    const from = sentences[i * per].id;
    const to = i === ROWS.length - 1 ? sentences.at(-1).id : sentences[(i + 1) * per - 1].id;
    return { from, ...(to !== from ? { to } : {}), component: `soft-clay:${id}`, vars, template: id };
  });
  const tableFile = path.join(projectDir, "scenes.json");
  const before = fs.existsSync(tableFile) ? JSON.parse(fs.readFileSync(tableFile, "utf8")) : {};
  fs.writeFileSync(tableFile, JSON.stringify({ ...before, scenes, footage: [] }, null, 2));
  const { render: r, out } = render("every");
  console.log(`\n  every template: ${path.join(out, "video.mp4")} (${r.seconds} s, render ${r.renderSeconds} s)`);
}
finish();
