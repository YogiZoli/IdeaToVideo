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

Think of a rocket launch. A rocket launch shows the whole promise at once. Pick one viewer. Name one problem. Show one result. Then stop talking.`;

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

const video = step("a pasted script makes a video", "channel-video-new", { projectsDir, identityDir, identity: "test", language: "en", text: SCRIPT, textKind: "finished" }, (d) => d.id);
const projectDir = video.dir;
const read = () => JSON.parse(fs.readFileSync(path.join(projectDir, "project.json"), "utf8"));
check("the recipe is copied into the video", read().recipe?.preset === "motion-frames");
check("the pasted script is approved", read().gates.script.state === "approved");
check("it says what it started from", read().start?.kind === "finished" && read().start?.research === false);

// The other starts of the start screen: no AI is called to make them.
const fromTopic = step("a topic alone makes a video", "channel-video-new", { projectsDir, identityDir, identity: "test", language: "en", topic: "Why trains are late", research: true }, (d) => d.id);
check("the topic waits for research and its script", JSON.parse(fs.readFileSync(path.join(fromTopic.dir, "project.json"), "utf8")).start.research === true);
const fromNotes = step("notes make a video", "channel-video-new", { projectsDir, identityDir, identity: "test", language: "en", text: "I think trains are late because nobody owns the timetable.", textKind: "notes" }, (d) => d.id);
check("the notes are kept with the video", fs.readFileSync(path.join(fromNotes.dir, "notes.txt"), "utf8").includes("nobody owns"));
const take = path.join(work, "take.mp4");
spawnSync(env.HYPERFRAMES_FFMPEG_PATH, ["-y", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=25:duration=3", "-f", "lavfi", "-i", "sine=frequency=220:duration=3", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", take], { env });
const fromRecording = step("the other direction, from this script channel", "recorded-video-new", { projectsDir, identityDir, identity: "test", language: "en", files: { camera: take }, title: "x" }, (d) => d.id);
check("a recording takes the recorded recipe", JSON.parse(fs.readFileSync(path.join(fromRecording.dir, "project.json"), "utf8")).recipe.engine === "recorded");
for (const d of [fromTopic.dir, fromNotes.dir, fromRecording.dir]) fs.rmSync(d, { recursive: true, force: true });

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
const map = step("the Shot map", "shot-map-make", { projectDir, identityDir }, (d) => `${d.summary.shots} shots, ${d.summary.onTheirWord} of ${d.summary.elements} on their word`);
check("the Shot map has no warning", !map.warning, map.warning ?? "");
const shotTable = JSON.parse(fs.readFileSync(path.join(projectDir, "scenes.json"), "utf8"));
const wordStarts = new Set(words.map((w) => w.start));
check("every shot that moved starts on an exact word", shotTable.scenes.filter((s) => Number.isFinite(s.at)).every((s) => wordStarts.has(s.at)), shotTable.scenes.filter((s) => s.at).map((s) => `${s.component}@${s.at}`).join(" "));
const movedAt = shotTable.scenes.find((s) => Number.isFinite(s.at))?.at;
const percent = map.shots.find((s) => s.start === movedAt);
const entered = percent?.entrances[0];
check("a moved shot's main text enters on the word that says it", !!percent && entered?.at === percent.start && wordStarts.has(entered.at), `"${entered?.text}" on "${entered?.word}" at ${entered?.at}`);
check("no component twice in a row after the shot map", shotTable.scenes.every((s, i) => !i || s.component !== shotTable.scenes[i - 1].component));
const shotAgain = step("the Shot map again changes nothing", "shot-map-make", { projectDir, identityDir });
check("the same shots", shotAgain.shots.length === map.shots.length && shotAgain.shots.every((s, i) => s.start === map.shots[i].start));
step("scenes approved", "approve-gate", { projectDir, gate: "scenes" });
step("no avatar on this recipe", "skip-gate", { projectDir, gate: "avatar" });

// The B-roll engine with no AI and no key: words only, free sources only.
check("the B-roll switch is copied into the video", read().recipe?.broll?.on === true);
const brollPlan = step("B-roll: where it goes, by rule", "broll-auto-plan-rule", { projectDir, identityDir }, (d) => d.plan.items.map((i) => i.query).join("; "));
check("B-roll: the channel's paid clips are off by default", brollPlan.paid.on === false && brollPlan.paid.clips === 0);
// a stretch the search can find for certain, so this step does not hang on the rule's words
const broll = JSON.parse(fs.readFileSync(path.join(projectDir, "broll", "broll.json"), "utf8"));
if (broll.items[0]) broll.items[0].query = "rocket launch";
fs.writeFileSync(path.join(projectDir, "broll", "broll.json"), JSON.stringify(broll, null, 2));
const free = step("B-roll: the free sources, live", "broll-auto-find", { projectDir, identityDir }, (d) => `${d.found} found, ${d.open} open`);
const finished = step("B-roll: finish", "broll-auto-finish", { projectDir, identityDir }, (d) => `${d.plan.items.filter((i) => i.state === "done").map((i) => i.source).join(", ")}`);
check("B-roll: nothing was spent and nothing waits for a yes", finished.paid.totalUsd === 0 && finished.paid.spentVideoUsd === 0 && !finished.plan.items.some((i) => i.paidWanted));
if (free.found) {
  const ledger = JSON.parse(fs.readFileSync(path.join(projectDir, "assets_license.json"), "utf8"));
  check("B-roll: every clip is in assets_license.json", ledger.assets.length === free.found && ledger.assets.every((a) => a.source && a.sourceUrl && a.license && a.author && a.date && a.costUsd === 0), ledger.assets.map((a) => `${a.source}: ${a.licenseName}`).join("; "));
  check("B-roll: the clip is in the scene table", (JSON.parse(fs.readFileSync(path.join(projectDir, "scenes.json"), "utf8")).footage ?? []).length === free.found);
}
step("scenes approved again", "approve-gate", { projectDir, gate: "scenes" });

const build = step("the existing preview step builds it", "build-video", { projectDir, identityDir }, (d) => `${d.scenes} scenes, ${d.seconds} s, ${d.stills?.length ?? 0} stills`);
check("the preview has stills", (build.stills?.length ?? 0) >= 1);
const page = fs.readFileSync(path.join(projectDir, "build", "index.html"), "utf8");
check("the build mounts the shot on its word", page.includes(`data-start="${percent.start}"`), String(percent.start));
check("the map is kept with the video", JSON.parse(fs.readFileSync(path.join(projectDir, "shots.json"), "utf8")).shots.length === map.shots.length);
// a brief as the Research tab leaves it: the card carries its sources
fs.writeFileSync(path.join(projectDir, "research.json"), JSON.stringify({ state: "approved", grounded: true, sources: [{ title: "A source", url: "https://example.org/page" }], claims: [] }));
step("preview approved", "approve-gate", { projectDir, gate: "review" });
const render = step("the render", "render-video", { projectDir, identityDir, quality: "draft" }, (d) => path.basename(d.file));
check("the video is a real file", fs.statSync(render.file).size > 50000);
check("the Publishing Card is next to it", fs.existsSync(render.file.replace(/\.mp4$/, ".card.json")));
const card = JSON.parse(fs.readFileSync(render.file.replace(/\.mp4$/, ".card.json"), "utf8"));
check("the card has the sources, for checking", card.researchSources?.sources?.[0]?.url === "https://example.org/page");
check("the sources are not in the description", !JSON.stringify(card.packaging ?? {}).includes("example.org"));
check("the queue stays empty without a batch", runner("queue-list", { projectsDir }).data.queue.length === 0);
console.log(`\n  video: ${render.file}`);
finish();
