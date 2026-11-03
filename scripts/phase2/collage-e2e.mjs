#!/usr/bin/env node
// collage-e2e.mjs: the Archive Collage preset (docs/BUILD_PLAN.md phase 6) through the real
// runner commands, the real free voice, music made by code, the real engine and a real
// render. Two videos: one planned by rule with no AI, as a channel with a dead key would get
// it, and one that uses every template once, to look at. Nothing is paid.
//
// Usage: node scripts/phase2/collage-e2e.mjs --work <dir> [--only every|rule]
// Exit code 0 only if every step passed. The stills and frames stay under <dir>.

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { values: args } = parseArgs({ options: { work: { type: "string" }, only: { type: "string" } } });
if (!args.work) {
  console.error("Usage: node scripts/phase2/collage-e2e.mjs --work <dir> [--only every|rule]");
  process.exit(2);
}

const env = { ...process.env };
const exe = process.platform === "win32" ? ".exe" : "";
env.HYPERFRAMES_FFMPEG_PATH ??= path.join(ROOT, "app", "src-tauri", "ffmpeg", `ffmpeg${exe}`);
env.HYPERFRAMES_FFPROBE_PATH ??= path.join(ROOT, "app", "src-tauri", "ffmpeg", `ffprobe${exe}`);

const results = [];
function finish() {
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `\nArchive Collage e2e: ${failed} step(s) failed` : `\nArchive Collage e2e: all ${results.length} steps passed`);
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

const SCRIPT = `# How the Suez Canal rewrote world trade

How did one short canal in the desert rewrite the whole of world trade? The story starts in Egypt, in a strip of empty sand.

## Part 1

Work on the canal began in 1859 and took ten long years. Before it, a ship sailed from London to Mumbai around all of Africa. That trip took 83 days, and a captain paid for every single one. The new route cut about 40% of the distance from the voyage. Merchants saw the shortcut, but the old shipping companies saw only ruin.

## Part 2

Cheaper transport leads to lower prices in every port on the route. Here are the 4 steps of a cargo on its way to Europe. First the tea is loaded onto a ship in the harbor. Then it waits at the entrance for a place in the convoy. Then the convoy passes through the canal in a single line. And then the cargo is sold in a market far from home.

## Part 3

A global financial crisis struck when one big ship got stuck in 2021. Trade worth 9 billion dollars waited every single day. Only then did the whole world remember this narrow ditch. So what would happen if the canal closed for good?`;

const work = path.resolve(args.work);
fs.rmSync(work, { recursive: true, force: true });
const identityDir = path.join(work, "identity");
const projectsDir = path.join(work, "videos");
fs.mkdirSync(identityDir, { recursive: true });
fs.mkdirSync(projectsDir, { recursive: true });

const state = step("the channel's start screen", "channel-state", { identityDir, projectsDir, identity: {} }, (d) => d.presets.map((p) => p.id).join(", "));
const card = state.presets.find((p) => p.id === "archive-collage");
check("the preset is offered", !!card && card.templates.length >= 8 && card.templates.length <= 15, `${card?.templates.length} templates`);
check("the long list of places stays out of the card", card.places === undefined && !JSON.stringify(card).includes("Zimbabwe"));
const saved = step("the recipe is locked in", "recipe-save", { identityDir, language: "en", recipe: { ...state.recipe, preset: "archive-collage", targetLengthMin: 1, avatar: { on: false }, broll: { on: false } } }, (d) => d.recipe.preset);
check("the recipe keeps the preset", saved.recipe.preset === "archive-collage");
const sheet = step("the preset's style sheet", "preset-stylesheet", { identityDir, preset: "archive-collage" }, (d) => path.basename(d.file));
check("the style sheet has the preset's own colors", sheet.tokens.colors.primary === "#e8401c" && fs.statSync(sheet.file).size > 5000);
fs.copyFileSync(sheet.file, path.join(work, "stylesheet.png"));

const video = step("a pasted script makes a video", "channel-video-new", { projectsDir, identityDir, identity: "test", language: "en", text: SCRIPT, textKind: "finished" }, (d) => d.id);
const projectDir = video.dir;
const read = () => JSON.parse(fs.readFileSync(path.join(projectDir, "project.json"), "utf8"));
check("the recipe is copied into the video", read().recipe?.preset === "archive-collage");
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
  check(`${label}: the drawing code and the maps are on the page, three.js is not`, !page.includes("three.global.js") && page.includes("archive-collage-collage.js") && page.includes("archive-collage-map-data.js"));
  check(`${label}: no web font, no outside address`, !/https?:\/\/(?!www\.w3\.org)/.test(page));
  const ledger = JSON.parse(fs.readFileSync(path.join(projectDir, "assets_license.json"), "utf8"));
  check(`${label}: the maps are in the video's license log`, ledger.assets.some((a) => a.source === "natural-earth" && a.license === "pd"));
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
  check("about one shot per sentence", table.scenes.length >= sentences.length * 0.7, `${table.scenes.length} shots, ${sentences.length} sentences`);
  check("the plan uses the preset's own templates", table.scenes.every((s) => s.component.startsWith("archive-collage:") || !s.template), used.join(" "));
  for (const id of ["title", "year", "route", "map", "versus", "cause", "question", "percent", "number", "alert"]) check(`the rule found a place for ${id}`, used.includes(id));
  check("the route joins the places the sentence names", table.scenes.some((s) => s.vars.fromPlace === "london" && s.vars.toPlace === "mumbai"));
  check("the alert stays rare", table.scenes.filter((s) => s.template === "alert").length <= Math.ceil(table.scenes.length / 16));
  check("objects are the ones the sentences name", table.scenes.some((s) => Object.values(s.vars).includes("ship")));
  const map = step("the Shot map", "shot-map-make", { projectDir, identityDir }, (d) => `${d.summary.shots} shots, ${d.summary.onTheirWord} of ${d.summary.elements} on their word`);
  check("the Shot map has no warning", !map.warning, map.warning ?? "");
  check("the Shot map says the camera is the scene's own", map.shots.every((s) => s.camera === "One slow drift, layers in parallax" || s.call), [...new Set(map.shots.map((s) => s.camera))].join(", "));
  const { render: r, out } = render("rule");
  console.log(`\n  by rule: ${path.join(out, "video.mp4")} (${r.seconds} s, render ${r.renderSeconds} s)`);
}

// ---- every template once, to look at --------------------------------------------------

if (args.only !== "rule") {
  const ROWS = [
    ["title", { headline: "How one canal rewrote world trade", kicker: "A short history", object: "ship" }],
    ["map", { place: "egypt", label: "Egypt", line: "A strip of empty sand" }],
    ["year", { value: 1859, line: "Work on the canal began", object: "letter" }],
    ["route", { fromPlace: "london", toPlace: "mumbai", fromLabel: "London", toLabel: "Mumbai", line: "All the way around Africa" }],
    ["number", { value: 83, after: "days", object: "clock" }],
    ["percent", { value: 40 }],
    ["versus", { left: "Merchants saw a shortcut", right: "Shippers saw ruin", leftObject: "coins", rightObject: "factory" }],
    ["cause", { from: "Cheaper transport", to: "Lower prices", fromObject: "train", toObject: "wheat" }],
    ["path", { step1: "Load the tea", step2: "Wait in line", step3: "Pass the canal", step4: "Sell at market" }],
    ["chapter", { headline: "The stuck ship", object: "anchor" }],
    ["alert", { line: "A global crisis in one day", object: "barrel" }],
    ["statement", { line1: "Trade worth billions", line2: "Waited every day", object: "crowd" }],
    ["highlight", { line: "The whole world remembered this narrow ditch", mark: "narrow", object: "globe" }],
    ["word", { word: "Closed", object: "bank" }],
    ["question", { question: "What if it closed for good?", object: "figure" }],
  ];
  check("the script has a sentence for every template", sentences.length >= ROWS.length, `${sentences.length} sentences, ${ROWS.length} templates`);
  const per = Math.floor(sentences.length / ROWS.length);
  const scenes = ROWS.map(([id, vars], i) => {
    const from = sentences[i * per].id;
    const to = i === ROWS.length - 1 ? sentences.at(-1).id : sentences[(i + 1) * per - 1].id;
    return { from, ...(to !== from ? { to } : {}), component: `archive-collage:${id}`, vars, template: id };
  });
  const tableFile = path.join(projectDir, "scenes.json");
  const before = fs.existsSync(tableFile) ? JSON.parse(fs.readFileSync(tableFile, "utf8")) : {};
  fs.writeFileSync(tableFile, JSON.stringify({ ...before, scenes, footage: [] }, null, 2));
  const { render: r, out } = render("every");
  console.log(`\n  every template: ${path.join(out, "video.mp4")} (${r.seconds} s, render ${r.renderSeconds} s)`);
}
finish();
