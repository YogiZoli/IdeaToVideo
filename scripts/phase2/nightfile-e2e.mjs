#!/usr/bin/env node
// nightfile-e2e.mjs: the Night Case File preset (docs/BUILD_PLAN.md phase 7) through the real runner
// commands, the real free voice, music made by code, the real engine and a real render. Two
// videos: one planned by rule with no AI, as a channel with a dead key would get it, and one that
// uses every template once, to look at. Nothing is paid. The fact-check is a stand-in brief: this
// script has no AI key, and the story in it is invented on purpose.
//
// Usage: node scripts/phase2/nightfile-e2e.mjs --work <dir> [--only every|rule]
// Exit code 0 only if every step passed. The stills and frames stay under <dir>.

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { values: args } = parseArgs({ options: { work: { type: "string" }, only: { type: "string" } } });
if (!args.work) {
  console.error("Usage: node scripts/phase2/nightfile-e2e.mjs --work <dir> [--only every|rule]");
  process.exit(2);
}

const env = { ...process.env };
const exe = process.platform === "win32" ? ".exe" : "";
env.HYPERFRAMES_FFMPEG_PATH ??= path.join(ROOT, "app", "src-tauri", "ffmpeg", `ffmpeg${exe}`);
env.HYPERFRAMES_FFPROBE_PATH ??= path.join(ROOT, "app", "src-tauri", "ffmpeg", `ffprobe${exe}`);

const results = [];
function finish() {
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `\nNight Case File e2e: ${failed} step(s) failed` : `\nNight Case File e2e: all ${results.length} steps passed`);
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

const SCRIPT = `# What happened at the harbor office

What happened at the harbor office on the night the lights went out? The story starts in Portugal, on a quiet stretch of coast.

## Part 1

On March 14, 1985, in Lisbon, the night clerk locked the front door. At 11:40 p.m. a neighbor saw one lamp still burning upstairs. Inside the office nothing looked out of place. Then a car drove slowly along the harbor road and stopped. A man walked to the side door and went in.

## Part 2

Suddenly every window in the building lit up, and the street went dark again. Nobody on the harbor road came out to look. By morning the clerk was dead and the safe stood open. Police found a receipt, a key and a torn note. A fingerprint was found on the edge of the desk. The note led them from Lisbon to Madrid within two days. Exactly 40 people were questioned in the first week. Nobody had seen the man leave.

## Part 3

Was the killer someone the clerk already knew? The case file stayed open for 22 years.`;

const work = path.resolve(args.work);
fs.rmSync(work, { recursive: true, force: true });
const identityDir = path.join(work, "identity");
const projectsDir = path.join(work, "videos");
fs.mkdirSync(identityDir, { recursive: true });
fs.mkdirSync(projectsDir, { recursive: true });

const state = step("the channel's start screen", "channel-state", { identityDir, projectsDir, identity: {} }, (d) => d.presets.map((p) => p.id).join(", "));
const card = state.presets.find((p) => p.id === "night-case-file");
check("the preset is offered", !!card && card.templates.length >= 8 && card.templates.length <= 15, `${card?.templates.length} templates`);
check("it says its scripts are fact-checked, and what suits it", card.factChecked === true && card.defaults.research === true && card.defaults.mood === "dark" && card.defaults.broll === false);
check("the long lists stay out of the card", card.places === undefined && card.never === undefined && !JSON.stringify(card).includes("Zimbabwe"));
const saved = step("the recipe is locked in", "recipe-save", { identityDir, language: "en", recipe: { ...state.recipe, preset: "night-case-file", targetLengthMin: 1, avatar: { on: false }, broll: { on: false }, music: { on: true, source: "synth", mood: "dark" } } }, (d) => d.recipe.preset);
check("the recipe keeps the preset", saved.recipe.preset === "night-case-file");
const sheet = step("the preset's style sheet", "preset-stylesheet", { identityDir, preset: "night-case-file" }, (d) => path.basename(d.file));
check("the style sheet has the preset's own colors", sheet.tokens.colors.primary === "#ffb02e" && fs.statSync(sheet.file).size > 5000);
fs.copyFileSync(sheet.file, path.join(work, "stylesheet.png"));

const video = step("a pasted script makes a video, with research off asked", "channel-video-new", { projectsDir, identityDir, identity: "test", language: "en", text: SCRIPT, textKind: "finished", research: false }, (d) => d.id);
const projectDir = video.dir;
const read = () => JSON.parse(fs.readFileSync(path.join(projectDir, "project.json"), "utf8"));
check("the recipe is copied into the video", read().recipe?.preset === "night-case-file");
check("research is on all the same: this style's scripts are fact-checked", read().start?.research === true);
const local = runner("week-batch-local", { projectsDir, identityDir, identity: "test", pasted: SCRIPT, textKind: "finished", language: "en" });
check("a week batch with no AI says it needs the key, and makes nothing", local.event !== "result" && /fact-checks every script/.test(String(local.message ?? local.stderr)), String(local.message ?? "").slice(0, 120));
step("the free voice model is on this computer", "voice-model-ensure", { voice: saved.recipe.voice.voice }, (d) => d.dir);
const voice = step("the free voice reads the script", "make-voice", { projectDir, identityDir, narrator: { provider: "kokoro", voice: saved.recipe.voice.voice }, music: null }, (d) => `${d.info.seconds} s, ${d.info.sentences} sentences`);
check("the voice has a length", voice.info.seconds > 20);
step("music made by code, the dark mood", "make-music", { projectDir, identityDir, music: { provider: "synth", mood: "dark" } }, (d) => `${d.info.finalLufs} LUFS`);
step("voice approved", "approve-gate", { projectDir, gate: "voice" });
const sentences = JSON.parse(fs.readFileSync(path.join(projectDir, "sentences.json"), "utf8"));
const never = JSON.parse(fs.readFileSync(path.join(ROOT, "runner", "presets", "night-case-file", "preset.json"), "utf8")).never;
const onScreen = (sc) => Object.entries(sc.vars ?? {}).filter(([k]) => !/object|place$/i.test(k)).map(([, v]) => String(v)).join(" ");
const hasNever = (t) => t.toLowerCase().split(/[^\p{L}]+/u).some((w) => never.words.includes(w) || never.stems.some((x) => w.startsWith(x)));

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
  check(`${label}: the drawing code and the maps are on the page, three.js is not`, !page.includes("three.global.js") && page.includes("night-case-file-nightfile.js") && page.includes("night-case-file-map-data.js"));
  check(`${label}: no web font, no outside address`, !/https?:\/\/(?!www\.w3\.org)/.test(page));
  check(`${label}: each flash has its sound on the page, and nothing else has one`, (page.match(/id="sound-/g) ?? []).length === JSON.parse(fs.readFileSync(path.join(projectDir, "scenes.json"), "utf8")).scenes.filter((x) => x.template === "flash").length);
  const ledger = JSON.parse(fs.readFileSync(path.join(projectDir, "assets_license.json"), "utf8"));
  check(`${label}: the maps are in the video's license log`, ledger.assets.some((a) => a.source === "natural-earth" && a.license === "pd"));
  step(`${label}: preview approved`, "approve-gate", { projectDir, gate: "review" });
  const r = step(`${label}: the render`, "render-video", { projectDir, identityDir, quality: "draft" }, (d) => `${path.basename(d.file)}, ${d.renderSeconds ?? "?"} s`);
  check(`${label}: the video is a real file`, fs.statSync(r.file).size > 50000);
  fs.copyFileSync(r.file, path.join(out, "video.mp4"));
  const card = JSON.parse(fs.readFileSync(r.file.replace(/\.mp4$/, ".card.json"), "utf8"));
  return { build, render: r, out, card };
};

// ---- by rule, with no AI --------------------------------------------------------------

if (args.only !== "every") {
  const plan = step("the templates, planned by rule", "simple-template-scenes", { projectDir, identityDir }, (d) => `${d.parts} parts, ${d.byRule} by rule`);
  check("the plan is by rule, without the AI", plan.byRule > 0);
  const table = JSON.parse(fs.readFileSync(path.join(projectDir, "scenes.json"), "utf8"));
  const used = [...new Set(table.scenes.map((s) => s.template))];
  check("about one shot per sentence", table.scenes.length >= sentences.length * 0.7, `${table.scenes.length} shots, ${sentences.length} sentences`);
  check("the plan uses the preset's own templates", table.scenes.every((s) => s.component.startsWith("night-case-file:") || !s.template), used.join(" "));
  for (const id of ["title", "stamp", "route", "map", "board", "evidence", "flash", "question", "number", "street", "room"]) check(`the rule found a place for ${id}`, used.includes(id));
  check("no forbidden word in anything on screen, though the voice says one", table.scenes.every((s) => !hasNever(onScreen(s))) && /dead|killer/.test(sentences.map((s) => s.text).join(" ")));
  check("the sentence that says a death gets a flash", table.scenes.some((s) => s.template === "flash" && sentences.find((x) => x.id === s.from)?.text.includes("dead")));
  check("the stamp says the date, the place and something more", table.scenes.some((s) => s.vars.when === "March 14 1985" && s.vars.where === "Lisbon" && s.vars.line));
  check("the route joins the places the sentence names", table.scenes.some((s) => s.vars.fromPlace === "lisbon" && s.vars.toPlace === "madrid"));
  check("the board has the sentence's own three things", table.scenes.some((s) => s.template === "board" && s.vars.item1 === "receipt" && s.vars.item3 === "torn note"));
  const map = step("the Shot map", "shot-map-make", { projectDir, identityDir }, (d) => `${d.summary.shots} shots, ${d.summary.onTheirWord} of ${d.summary.elements} on their word`);
  check("the Shot map has no warning", !map.warning, map.warning ?? "");
  check("the Shot map says the camera is the scene's own", map.shots.every((s) => s.camera === "One slow push, layers in parallax" || s.call), [...new Set(map.shots.map((s) => s.camera))].join(", "));
  const afterMap = JSON.parse(fs.readFileSync(path.join(projectDir, "scenes.json"), "utf8"));
  check("the Shot map's own cuts put nothing forbidden on screen either", afterMap.scenes.every((s) => !hasNever(onScreen(s))));
  const { render: r, out, card: unchecked } = render("rule");
  check("with no brief the card says it was not checked", unchecked.researchSources?.unchecked === true && unchecked.researchSources.sources.length === 0);
  console.log(`\n  by rule: ${path.join(out, "video.mp4")} (${r.seconds} s, render ${r.renderSeconds} s)`);
}

// ---- every template once, to look at --------------------------------------------------

if (args.only !== "rule") {
  const ROWS = [
    ["title", { headline: "What happened at the harbor office", kicker: "A true story" }],
    ["map", { place: "portugal", label: "Portugal", line: "A quiet stretch of coast" }],
    ["stamp", { when: "March 14 1985", where: "Lisbon", line: "The night clerk locked the door", object: "key" }],
    ["room", { object: "lamp", line: "One lamp still burning upstairs" }],
    ["street", { object: "car", line: "A car on the harbor road" }],
    ["flash", { object: "window", line: "Every window lit up" }],
    ["board", { item1: "A receipt", item2: "A key", item3: "A torn note", item4: "One neighbor" }],
    ["evidence", { object: "fingerprint", line: "On the edge of the desk" }],
    ["route", { fromPlace: "lisbon", toPlace: "madrid", fromLabel: "Lisbon", toLabel: "Madrid", line: "Within two days" }],
    ["number", { value: 40, after: "people", object: "notebook" }],
    ["statement", { line1: "Nobody had seen", line2: "the man leave", object: "door" }],
    ["highlight", { line: "The case file stayed open", mark: "open", object: "folder" }],
    ["chapter", { headline: "Twenty-two years", object: "clock" }],
    ["word", { word: "Unsolved", object: "photo" }],
    ["question", { question: "Did the clerk know him?" }],
  ];
  check("the script has a sentence for every template", sentences.length >= ROWS.length, `${sentences.length} sentences, ${ROWS.length} templates`);
  const per = Math.floor(sentences.length / ROWS.length);
  const scenes = ROWS.map(([id, vars], i) => {
    const from = sentences[i * per].id;
    const to = i === ROWS.length - 1 ? sentences.at(-1).id : sentences[(i + 1) * per - 1].id;
    return { from, ...(to !== from ? { to } : {}), component: `night-case-file:${id}`, vars, template: id };
  });
  const tableFile = path.join(projectDir, "scenes.json");
  const before = fs.existsSync(tableFile) ? JSON.parse(fs.readFileSync(tableFile, "utf8")) : {};
  fs.writeFileSync(tableFile, JSON.stringify({ ...before, scenes, footage: [] }, null, 2));
  // a brief as the Research tab leaves it: the card carries its sources, for checking only
  fs.writeFileSync(path.join(projectDir, "research.json"), JSON.stringify({ state: "approved", grounded: true, sources: [{ title: "A source", url: "https://example.org/page" }], claims: [{ claim: "The door was locked", verdict: "unclear", note: "One report only" }] }));
  const { render: r, out, card: checked } = render("every");
  check("the card has the sources and the flagged claim, for checking", checked.researchSources?.sources?.[0]?.url === "https://example.org/page" && checked.researchSources.flags?.[0]?.verdict === "unclear" && checked.researchSources.unchecked === undefined);
  // the flash's sound is really in the rendered video: the low band against the same second of the mix
  const flashAt = Number(/id="sound-1"[^>]*data-start="([\d.]+)"/.exec(fs.readFileSync(path.join(projectDir, "build", "index.html"), "utf8"))[1]);
  const low = (file) => Number(/mean_volume: (-?[\d.]+) dB/.exec(spawnSync(env.HYPERFRAMES_FFMPEG_PATH, ["-hide_banner", "-ss", String(flashAt), "-t", "1", "-i", file, "-af", "lowpass=f=110,volumedetect", "-f", "null", "-"], { encoding: "utf8" }).stderr)[1]);
  const [mixed, rendered] = [low(path.join(projectDir, "audio", "vo_bgm.mp3")), low(r.file)];
  check("the sound is heard on the flash, in the real video", rendered > mixed + 2, `${mixed} dB without, ${rendered} dB with`);
  check("the sources are not in the description",!JSON.stringify(checked.packaging ?? {}).includes("example.org"));
  console.log(`\n  every template: ${path.join(out, "video.mp4")} (${r.seconds} s, render ${r.renderSeconds} s)`);
}

finish();
