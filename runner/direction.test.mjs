// Direction, Research input and Shot map (docs/BUILD_PLAN.md phase 3).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { normalizeRecipe, recipeFor, defaultRecipe, cleanStart } from "./channels/recipe.mjs";
import { newScriptVideo, notesOf, splitPasted } from "./channels/start.mjs";
import { runWeekBatch } from "./channels/batch.mjs";
import { buildData, buildMessages, notesIssues, lengthIssues } from "./gates/script/index.mjs";
import { loadProject } from "./project.mjs";
import { sceneTimes, footagePlan } from "./gates/build/assemble.mjs";
import { checkScenes, clean } from "./gates/scenes/index.mjs";
import { wordFor, elementsOf, cutPlace, shotRows, flowPrompt, makeShotMap, shotMapView, setFlow, addFlowClip } from "./shots/index.mjs";
import { loadPreset, resolveTemplates } from "./presets/index.mjs";
import { ruleHeroes, rulePrompt, finishFind, budgetOf, approvePaid, paidBlock, setPaidWanted } from "./broll/engine.mjs";
import { loadPlan, savePlan, usesGenerated } from "./broll/index.mjs";
import { normalizeSettings } from "./broll/settings.mjs";
import { imageBody } from "./generate/kie-image.mjs";
import { usdFor, orderSeconds, IMAGE_GENERATOR } from "./generate/index.mjs";
import { buildCard, checkCard } from "./gates/render/publish.mjs";
import { description } from "./gates/render/youtube.mjs";
import { saveBrief } from "./research/index.mjs";
import { readLedger, refusal } from "./assets/license.mjs";
import { ffmpegRun } from "./audio.mjs";
import { spawnSync } from "node:child_process";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "itv-direction-"));
const script = { engine: "script", preset: "motion-frames", voice: { provider: "elevenlabs", voice: "clone", name: "My clone" }, avatar: { on: false, lookId: null }, music: { on: true, source: "synth", mood: "calm" }, broll: { on: true }, targetLengthMin: 6 };

// The real commands through the runner's own front door: what unit tests of the parts miss.
function command(name, request, env = {}) {
  const r = spawnSync(process.execPath, [path.resolve("runner/main.mjs"), name], { input: JSON.stringify(request), encoding: "utf8", env: { ...process.env, STUDIO_API_KEY: "", ...env } });
  return JSON.parse(r.stdout.trim().split("\n").at(-1));
}

test("the commands answer: a new video of each kind, its brief, and a batch of finished scripts", () => {
  const root = tmp();
  const identityDir = path.join(root, "identity");
  const projectsDir = path.join(root, "videos");
  fs.mkdirSync(identityDir);
  fs.mkdirSync(projectsDir);
  const base = { identityDir, projectsDir, identity: "test", language: "en" };
  assert.equal(command("recipe-save", { identityDir, language: "en", recipe: { ...script, voice: { provider: "kokoro", voice: "am_michael" }, start: { text: "finished", research: true } } }).event, "result");
  const state = command("channel-state", { identityDir, projectsDir, identity: {} }).data;
  assert.deepEqual(state.recipe.start, { text: "finished", research: true });
  assert.equal(state.recipe.directions.recorded.preset, "talking-head");

  const topic = command("channel-video-new", { ...base, topic: "Why trains are late", research: true }).data;
  const load = (dir) => command("load-project", { projectDir: dir }).data;
  assert.equal(load(topic.dir).researchState, null);
  // no key: a sentence, not a crash on the way there
  assert.match(command("research-make", { projectDir: topic.dir, llm: { provider: "gemini", model: "m" }, channel: {} }).message, /API key/);
  assert.equal(command("research-state", { projectDir: topic.dir }).data.brief, null);
  saveBrief(topic.dir, { state: "pending", grounded: true, facts: [{ text: "A fact.", source: 1 }], numbers: [], dates: [], missing: [], claims: [], sources: [{ title: "A", url: "https://a.example" }] });
  const edited = command("research-save", { projectDir: topic.dir, brief: { facts: [{ text: "My own fact.", source: null }], sources: [] } }).data.brief;
  assert.deepEqual([edited.facts[0].text, edited.sources.length, edited.state], ["My own fact.", 0, "pending"]);
  assert.equal(command("research-approve", { projectDir: topic.dir }).data.brief.state, "approved");
  assert.equal(load(topic.dir).researchState, "approved");

  assert.deepEqual(command("shot-map-state", { projectDir: topic.dir }).data.shots, []);
  const r = command("week-batch-local", { ...base, pasted: "# One\n\nFirst script.\n---\n# Two\n\nSecond script.", textKind: "finished", research: false }).data;
  assert.deepEqual([r.written, r.failed], [2, 0]);
  assert.equal(load(r.videos[0].dir).project.gates.script.state, "approved");
  const queue = command("queue-list", { projectsDir }).data.queue;
  assert.equal(queue.length, 2);
  assert.equal(queue[0].research, null);
  assert.match(command("channel-video-new", base).message, /topic or idea/);
  fs.rmSync(root, { recursive: true, force: true });
});

// ---- recipe -------------------------------------------------------------------------

test("a recipe locked before this phase starts on notes, research off, and keeps what it had", () => {
  assert.deepEqual(cleanStart(undefined), { text: "notes", research: false });
  assert.deepEqual(defaultRecipe({}).start, { text: "notes", research: false });
  const r = normalizeRecipe({ ...script, start: { text: "finished", research: true } });
  assert.deepEqual(r.start, { text: "finished", research: true });
  assert.equal(r.voice.voice, "clone");
});

test("either direction works from one recipe, and its choices come back", () => {
  const locked = normalizeRecipe(script);
  const rec = recipeFor(locked, "recorded");
  assert.equal(rec.engine, "recorded");
  assert.equal(rec.preset, "talking-head");
  assert.equal(rec.voice.provider, "recording");
  assert.equal(rec.music.on, true, "the channel's music stays");
  const back = recipeFor(rec, "script");
  assert.equal(back.engine, "script");
  assert.equal(back.voice.voice, "clone", "the script side was kept");
  assert.equal(back.targetLengthMin, 6);
  assert.equal(recipeFor(rec, "recorded").preset, "talking-head");
});

test("a recording channel with no voice yet says what to do", () => {
  const rec = normalizeRecipe({ engine: "recorded", preset: "screen-share", music: { on: false } });
  assert.throws(() => recipeFor(rec, "script"), /no voice for a script video/);
  assert.equal(recipeFor(rec, "recorded").preset, "screen-share");
  assert.throws(() => recipeFor(rec, "other"), /Choose Script to video/);
});

// ---- the three starts ------------------------------------------------------------------

test("empty text is a topic; marked text is notes or a finished script", () => {
  const projectsDir = tmp();
  const base = { projectsDir, identity: "c", recipe: normalizeRecipe(script) };
  assert.throws(() => newScriptVideo(base), /topic or idea/);
  const topic = newScriptVideo({ ...base, topic: "Why trains are late", research: true });
  assert.deepEqual(topic.project.start, { kind: "topic", research: true, topic: "Why trains are late" });
  assert.equal(topic.project.gates.script.state, "todo");
  const notes = newScriptVideo({ ...base, text: "I think the trains are late because nobody owns the timetable. Second thought." });
  assert.equal(notes.project.start.kind, "notes");
  assert.match(notesOf(notes.dir), /nobody owns/);
  assert.equal(loadProject(notes.dir).gates.script.state, "todo");
  const done = newScriptVideo({ ...base, text: "# My title\n\nThe finished words.", textKind: "finished" });
  assert.equal(loadProject(done.dir).gates.script.state, "approved");
  assert.equal(loadProject(done.dir).title, "My title");
  assert.equal(notesOf(done.dir), null);
  fs.rmSync(projectsDir, { recursive: true, force: true });
});

test("notes: their own words, no length to reach, and no number they did not say", () => {
  const data = buildData({ topic: "Trains", notes: "We lost 12 trains in 2024.", channel: {}, language: "en", targetLengthMin: 8 });
  const [system] = buildMessages(data);
  assert.match(system.content, /way of speaking/);
  assert.match(system.content, /The notes set the length/);
  assert.doesNotMatch(system.content, /spoken words in total/);
  const say = (narration) => ({ open: { problem: "x", promise: "y" }, sections: [{ name: "a", narration }], own: { recap: "z" } });
  assert.deepEqual(notesIssues(say("We lost 12 trains in 2024."), data), []);
  assert.match(notesIssues(say("We lost 40 trains."), data)[0], /40 is not in the notes/);
  assert.deepEqual(lengthIssues(say("short"), data), []);
  // research is the one place a new number may come from
  const both = buildData({ topic: "Trains", notes: "We lost trains.", research: { facts: ["In 2024 there were 40 cancelled trains."] }, channel: {}, language: "en" });
  assert.deepEqual(notesIssues(say("We lost 40 trains."), both), []);
});

test("without notes the script keeps its length rule", () => {
  const data = buildData({ topic: "Trains", channel: {}, language: "en", targetLengthMin: 8 });
  assert.match(buildMessages(data)[0].content, /spoken words in total/);
  assert.equal(notesIssues({ sections: [] }, data).length, 0);
});

test("week batch: 7 pasted notes give 7 videos without the AI's ideas", async () => {
  assert.deepEqual(splitPasted("one\n---\ntwo\n\n-----\nthree"), ["one", "two", "three"]);
  assert.throws(() => splitPasted(Array(8).fill("x").join("\n---\n")), /at most 7/);
  const made = [];
  const r = await runWeekBatch({ llm: null, given: ["a", "b", "c", "d", "e", "f", "g"].map((title) => ({ title, text: title })), create: ({ title, queue }) => ({ dir: title, id: title, queue }), write: async ({ dir }) => made.push(dir) });
  assert.equal(r.written, 7);
  assert.equal(made.length, 7);
});

// ---- the shots -------------------------------------------------------------------------

const say = (text, start, step = 0.45) => text.split(" ").map((w, i) => ({ text: w, start: Math.round((start + i * step) * 1000) / 1000, end: Math.round((start + i * step + step - 0.05) * 1000) / 1000 }));
const sentence = (id, text, start, step = 0.45) => {
  const words = say(text, start, step);
  return { id, text, start, end: words.at(-1).end, words };
};

test("the word of a text: its first real word, numbers by their digits", () => {
  const w = say("Most people lose 40 percent of their savings", 10);
  assert.equal(wordFor("40", w).text, "40");
  assert.equal(wordFor("savings every year", w).text, "savings");
  assert.equal(wordFor("a savings", w).text, "savings", "a short word is passed over");
  assert.equal(wordFor("mountains", w), null);
});

test("a place to cut has time on both sides and a pause or a comma", () => {
  const said = [...say("the first long part goes here,", 0), ...say("then the second long part goes", 3.2)];
  const place = cutPlace(said, { start: 0, end: 6, sentences: [] });
  assert.equal(place.text, "then");
  assert.equal(cutPlace(said, { start: 0, end: 6, after: 5, sentences: [] }), null);
});

test("a scene can start on a word; a table that goes backwards is refused", () => {
  const sentences = [{ id: "S1", start: 0, end: 4 }, { id: "S2", start: 4, end: 9 }];
  const t = sceneTimes([{ from: "S1" }, { from: "S2", at: 6.2 }], sentences, 10);
  assert.deepEqual(t, [{ start: 0, duration: 6.2 }, { start: 6.2, duration: 3.8 }]);
  const split = sceneTimes([{ from: "S1" }, { from: "S2" }, { from: "S2", at: 7 }], sentences, 10);
  assert.deepEqual(split.map((x) => x.start), [0, 4, 7]);
  assert.throws(() => sceneTimes([{ from: "S1" }, { from: "S2", at: 3 }, { from: "S2", at: 2 }], sentences, 10), /before the scene/);
  assert.throws(() => sceneTimes([{ from: "S1" }, { from: "S1" }, { from: "S2" }], sentences, 10), /next sentence/);
  assert.deepEqual(clean({ component: "x", from: "S2", at: 7, cut: true, camera: "off", template: "word", override: true }), { component: "x", from: "S2", vars: {}, at: 7, cut: true, camera: "off", template: "word", override: true });
});

test("a clip for one shot starts and ends on its own words", () => {
  const sentences = [{ id: "S1", start: 0, end: 4 }, { id: "S2", start: 4, end: 9 }];
  const lib = { dir: "d", clips: [{ id: "c", file: "c.mp4", seconds: 20, source: "flow" }] };
  const [f] = footagePlan({ footage: [{ from: "S2", clip: "c", at: 6, until: 8.5 }] }, sentences, lib, "p");
  assert.deepEqual([f.start, f.end], [6, 8.5]);
});

const preset = loadPreset("motion-frames");
const templates = resolveTemplates(preset, { off: [] });
const threeSentences = () => {
  const s1 = sentence("S1", "Trains used to run on time because one person owned the timetable.", 0);
  const s2 = sentence("S2", "Then costs went up and most lines lost 40 percent of their staff.", s1.end + 0.2);
  const s3 = sentence("S3", "Nobody could say who was in charge of the morning.", s2.end + 0.2);
  return [s1, s2, s3];
};
const ctx = (sentences) => ({ sentences: sentences.map(({ words, ...s }) => s), words: sentences.flatMap((s) => s.words), total: sentences.at(-1).end + 0.5, templates, pace: "balanced", title: "Trains" });

test("a row starts on the word of its main text; the shot before it holds until then", () => {
  const ss = threeSentences();
  const c = ctx(ss);
  const rows = [
    { from: "S1", component: "titlecard-calm", vars: { headline: "Trains on time" }, template: "title" },
    { from: "S2", component: "count-up", vars: { end: 40, suffix: "%" }, template: "number" },
    { from: "S3", component: "per-word-rise", vars: { text: "Nobody in charge" }, template: "statement" },
  ];
  const out = shotRows(rows, c);
  const forty = c.words.find((w) => w.text === "40");
  const row = out.find((r) => r.component === "count-up");
  assert.equal(row.at, forty.start, "the number enters on the word 40");
  assert.equal(row.cut, true, "inside a sentence: a plain cut");
  assert.deepEqual(checkScenes({ scenes: out }, { sentences: c.sentences, total: c.total, pace: "balanced" }).issues.filter((i) => !/over \d+ s/.test(i)), []);
  // running it again changes nothing
  assert.deepEqual(shotRows(out, c), out);
  const filler = out.find((r) => r.from === "S2" && r.component !== "count-up");
  assert.ok(filler?.template, "the words before it get a shot of their own, by rule");
  sceneTimes(out, c.sentences, c.total).forEach((t) => assert.ok(t.duration >= 2 && t.duration <= 7.5, `shot of ${t.duration} s`));
});

test("a chosen block stays that block: only its start can move", () => {
  const ss = threeSentences();
  const c = ctx(ss);
  const rows = [
    { from: "S1", to: "S2", component: "per-word-rise", vars: { text: "Trains on time" } },
    { from: "S3", component: "count-up", vars: { end: 1 }, override: true },
  ];
  const out = shotRows(rows, c);
  assert.equal(out.filter((r) => r.component === "per-word-rise").length, 1, "never cut up");
  assert.ok(out.every((r) => !r.template));
});

test("a long template row is cut at a pause, the new shot filled from its own words", () => {
  const s1 = sentence("S1", "Trains used to run on time because one person owned the timetable,", 0, 0.5);
  const s2 = sentence("S2", "and every morning that person walked the whole line before the first train left the depot.", s1.end + 0.1, 0.5);
  const c = ctx([s1, s2]);
  const rows = [{ from: "S1", component: "titlecard-calm", vars: { headline: "Trains" }, template: "title" }, { from: "S2", component: "per-word-rise", vars: { text: "and every morning" }, template: "statement" }];
  const out = shotRows(rows, c);
  assert.ok(out.length > rows.length, "a shot over the longest length is cut");
  const times = sceneTimes(out, c.sentences, c.total);
  times.forEach((t) => assert.ok(t.duration >= 2, `at least 2 s, got ${t.duration}`));
  out.forEach((r, i) => assert.notEqual(r.component, out[i + 1]?.component));
  const added = out.filter((r) => !rows.some((x) => x.component === r.component && x.from === r.from));
  assert.ok(added.every((r) => r.template), "a new shot is a template filled by rule");
});

test("a shot too short for a camera move stands still; a comment call is never touched", () => {
  const s1 = sentence("S1", "Trains used to run on time because one person owned it.", 0);
  const s2 = sentence("S2", "Comment GUIDE below for more.", s1.end + 0.1);
  const c = { ...ctx([s1, s2]), calls: new Map([["S2", { keyword: "GUIDE" }]]) };
  const out = shotRows([{ from: "S1", component: "per-word-rise", vars: { text: "Trains on time" }, template: "statement" }, { from: "S2", component: "cta-close", vars: { action_line: "Comment GUIDE", button_label: "GUIDE" } }], c);
  assert.equal(out[1].at, undefined);
  assert.equal(out[1].camera, "off");
});

test("what is on screen: text and numbers, not icon names", () => {
  const els = elementsOf({ component: "count-up", vars: { end: 40, suffix: "%" } });
  assert.deepEqual(els.map((e) => e.text), ["40"]);
  assert.ok(!elementsOf({ component: "marker-highlight", vars: { text: "One long line", emphasis_word: "long" } }).some((e) => e.id === "emphasis_word"));
});

function shotProject() {
  const root = tmp();
  const projectDir = path.join(root, "2026-11-02_trains");
  const identityDir = path.join(root, "identity");
  fs.mkdirSync(path.join(projectDir, "audio"), { recursive: true });
  fs.mkdirSync(identityDir, { recursive: true });
  const ss = threeSentences();
  const c = ctx(ss);
  fs.writeFileSync(path.join(projectDir, "sentences.json"), JSON.stringify(c.sentences));
  fs.writeFileSync(path.join(projectDir, "words.json"), JSON.stringify(c.words));
  fs.writeFileSync(path.join(projectDir, "audio", "vo.mp3"), "VOICE");
  fs.writeFileSync(path.join(projectDir, "scenes.json"), JSON.stringify({ scenes: [
    { from: "S1", component: "titlecard-calm", vars: { headline: "Trains on time" }, template: "title" },
    { from: "S2", component: "count-up", vars: { end: 40, suffix: "%" }, template: "number" },
    { from: "S3", component: "per-word-rise", vars: { text: "Nobody in charge" }, template: "statement" },
  ] }));
  fs.writeFileSync(path.join(projectDir, "project.json"), JSON.stringify({ schema: 1, id: "2026-11-02_trains", status: "Scened", language: "en", gates: {} }));
  return { root, projectDir, identityDir, c };
}
const ffEnv = { ...process.env, HYPERFRAMES_FFMPEG_PATH: path.resolve("app/src-tauri/ffmpeg/ffmpeg.exe"), HYPERFRAMES_FFPROBE_PATH: path.resolve("app/src-tauri/ffmpeg/ffprobe.exe") };
const haveFf = fs.existsSync(ffEnv.HYPERFRAMES_FFMPEG_PATH);

test("the map says for each shot what it shows, how long, camera, change and word", async () => {
  const { root, projectDir, c } = shotProject();
  const view = await makeShotMap({ projectDir, preset, env: ffEnv });
  assert.equal(view.warning, null);
  assert.equal(view.summary.shots, 4);
  const num = view.shots.find((s) => s.block !== undefined && s.entrances[0]?.text === "40");
  assert.equal(num.kind, "graphic");
  assert.equal(num.start, c.words.find((w) => w.text === "40").start);
  assert.deepEqual(num.entrances[0], { text: "40", word: "40", at: num.start, how: "shot" });
  assert.equal(num.transition, "Cut, inside a sentence");
  assert.equal(num.override, false);
  assert.ok(fs.existsSync(path.join(projectDir, "shots.json")));
  fs.rmSync(root, { recursive: true, force: true });
});

test("a video with no word times keeps its sentences and says so", async () => {
  const { root, projectDir } = shotProject();
  fs.rmSync(path.join(projectDir, "words.json"));
  const view = await makeShotMap({ projectDir, preset, env: ffEnv });
  assert.match(view.warning, /no word times/);
  assert.equal(view.summary.shots, 3);
  assert.equal(view.shots[1].start, JSON.parse(fs.readFileSync(path.join(projectDir, "sentences.json"), "utf8"))[1].start);
  fs.rmSync(root, { recursive: true, force: true });
});

// ---- hero moments and the picture tier -----------------------------------------------------

const paidOn = (o = {}) => normalizeSettings({ paid: { on: true, ...o } });
const NOW = new Date("2026-11-15T10:00:00Z");
const GOOD = "Old steam trains cross a wide mountain valley at first light, one slow continuous shot from far away, natural colours, no text, no logos.";
const heroItem = (id, over = {}) => ({ id, scene: 1, from: "S1", to: "S1", said: "Trains.", start: 0, seconds: 4, order: 4, query: "steam trains", hero: true, prompt: GOOD, library: null, use: true, state: "none", attempt: 0, source: null, ...over });
function paidProject(items) {
  const { root, projectDir, identityDir } = shotProject();
  savePlan(projectDir, { schema: "itv-broll/1", auto: true, voBytes: 5, aspect: "16:9", spentUsd: 0, items, at: "x" });
  return { root, projectDir, identityDir };
}

test("hero moments need nobody: the clips that name the most, with a clean prompt", () => {
  const clips = [{ scene: 2, query: "train", hero: false, prompt: "" }, { scene: 4, query: "steam trains valley", hero: false, prompt: "" }];
  const out = ruleHeroes(clips, 1);
  assert.deepEqual(out.map((c) => c.hero), [false, true]);
  assert.equal(paidBlock({ prompt: out[1].prompt, seconds: 4 }, "image"), null);
  const marked = [{ query: "x", hero: true, prompt: GOOD }, { query: "y z", hero: false }];
  assert.deepEqual(ruleHeroes(marked, 1), marked, "the AI's own choice stands");
  assert.match(rulePrompt("Steam Trains"), /steam trains/);
});

test("the picture tier: the cheapest paid step, a price per picture", () => {
  assert.equal(usdFor(orderSeconds(5, IMAGE_GENERATOR), { generator: IMAGE_GENERATOR }), 0.01, "0.004 USD, shown rounded up");
  assert.deepEqual(imageBody({ prompt: GOOD, aspect: "16:9" }).input.aspect_ratio, "16:9");
  assert.equal(imageBody({ prompt: GOOD }).model, "z-image");
  assert.throws(() => imageBody({ prompt: "Batman on a roof" }), /names/);
  assert.equal(paidBlock({ prompt: GOOD, seconds: 5.5 }, "image"), null, "a picture can move for up to 6 s");
  assert.match(paidBlock({ prompt: GOOD, seconds: 5.5 }, "video"), /5 seconds/);
});

test("a hero nothing free fits is put forward as a picture first; video is a tick away", () => {
  const { root, projectDir, identityDir } = paidProject([heroItem("b1")]);
  const settings = paidOn();
  const plan = finishFind({ projectDir, identityDir, settings, now: NOW }).plan;
  assert.deepEqual([plan.items[0].paidWanted, plan.items[0].paidTier], [true, "image"]);
  assert.equal(budgetOf({ plan, settings, identityDir, now: NOW }).totalUsd, 0.01);
  const video = setPaidWanted({ projectDir, id: "b1", on: true, tier: "video" });
  assert.equal(budgetOf({ plan: video, settings, identityDir, now: NOW }).totalUsd, 0.12);
  fs.rmSync(root, { recursive: true, force: true });
});

const json = (o) => ({ ok: true, status: 200, text: async () => JSON.stringify(o), json: async () => o });
function fakeKie(states = () => "success") {
  const orders = [];
  const impl = async (url, init) => {
    const u = String(url);
    if (u.endsWith("/jobs/createTask")) {
      orders.push(JSON.parse(init.body));
      return json({ code: 200, data: { taskId: `t${orders.length}` } });
    }
    if (u.includes("recordInfo")) {
      const id = new URL(u).searchParams.get("taskId");
      const state = states(id);
      return json({ code: 200, data: state === "success" ? { state, resultJson: JSON.stringify({ resultUrls: [`https://cdn.example/${id}.png`] }) } : { state, failMsg: "refused" } });
    }
    return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
  };
  impl.orders = orders;
  return impl;
}
const makeClip = async ({ out, seconds }) => {
  await ffmpegRun(["-f", "lavfi", "-i", `testsrc2=size=320x180:rate=24:duration=${seconds}`, "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", out], ffEnv);
  return { file: out };
};

test("the yes on a picture: ordered once, moved here, in the ledger with model and prompt", { skip: !haveFf }, async () => {
  const { root, projectDir, identityDir } = paidProject([heroItem("b1", { paidWanted: true, paidTier: "image" })]);
  const kie = fakeKie();
  const r = await approvePaid({ projectDir, identityDir, apiKey: "k", settings: paidOn(), quotedUsd: 0.01, fetchImpl: kie, sleep: async () => {}, parallax: makeClip, env: ffEnv, now: NOW });
  assert.equal(r.made, 1);
  assert.equal(kie.orders.length, 1);
  assert.equal(kie.orders[0].model, "z-image");
  const item = r.plan.items[0];
  assert.deepEqual([item.state, item.source, item.aiTier, item.usd], ["done", "ai", "image", 0.01]);
  const asset = readLedger(projectDir).assets[0];
  assert.deepEqual([asset.source, asset.model, asset.prompt], ["kie", "z-image", GOOD]);
  assert.match(asset.derived, /2\.5D/);
  fs.rmSync(root, { recursive: true, force: true });
});

test("a picture Kie AI cannot make costs nothing and puts the video forward, for a new yes", { skip: !haveFf }, async () => {
  const { root, projectDir, identityDir } = paidProject([heroItem("b1", { paidWanted: true, paidTier: "image" })]);
  const kie = fakeKie(() => "fail");
  await approvePaid({ projectDir, identityDir, apiKey: "k", settings: paidOn(), quotedUsd: 0.01, fetchImpl: kie, sleep: async () => {}, parallax: makeClip, env: ffEnv, now: NOW }).catch(() => {});
  assert.equal(kie.orders.length, 1, "no video was ordered without a yes");
  const plan = loadPlan(projectDir);
  assert.equal(plan.spentUsd, 0);
  assert.deepEqual([plan.items[0].state, plan.items[0].paidTier, plan.items[0].paidWanted], ["none", "video", true]);
  fs.rmSync(root, { recursive: true, force: true });
});

// ---- Google Flow -----------------------------------------------------------------------------

test("a Flow prompt: plain words, the exact length, never a name", () => {
  const p = flowPrompt({ said: "Steam trains crossed the valley", seconds: 4.2 });
  assert.match(p, /steam trains crossed valley/);
  assert.match(p, /5 seconds\.$/);
});

test("the Flow slot is off by default, writes its prompt, takes the mp4, logs it as own generation", { skip: !haveFf }, async () => {
  const { root, projectDir, identityDir } = shotProject();
  const view = await makeShotMap({ projectDir, preset, env: ffEnv });
  const id = view.shots[0].id;
  assert.equal(view.shots[0].flow, null);
  const file = path.join(root, "my clip.mp4");
  await makeClip({ out: file, seconds: 6 });
  await assert.rejects(addFlowClip({ projectDir, identityDir, id, file, env: ffEnv }), /Switch the Google Flow slot on/);
  const on = await setFlow({ projectDir, id, on: true, env: ffEnv });
  assert.match(on.shots[0].flow.prompt, /16:9/);
  assert.equal(on.shots[0].flow.seconds, view.shots[0].seconds);
  await assert.rejects(setFlow({ projectDir, id, prompt: "Batman on a roof", env: ffEnv }), /names/);
  const done = await addFlowClip({ projectDir, identityDir, id, file, env: ffEnv, now: NOW });
  assert.equal(done.shots[0].kind, "broll");
  assert.equal(done.shots[0].source, "Google Flow (Veo), own generation");
  const asset = readLedger(projectDir).assets[0];
  assert.deepEqual([asset.source, asset.licenseName, asset.model], ["flow", "Google Flow (Veo), own generation", "Veo (Google Flow)"]);
  assert.equal(refusal(asset), null);
  assert.equal(usesGenerated(projectDir, identityDir), true, "YouTube's synthetic content question");
  const table = JSON.parse(fs.readFileSync(path.join(projectDir, "scenes.json"), "utf8"));
  assert.equal(table.footage[0].at, done.shots[0].start);
  // off takes it out again
  const off = await setFlow({ projectDir, identityDir, id, on: false, env: ffEnv });
  assert.equal(off.shots[0].kind, "graphic");
  assert.equal(readLedger(projectDir).assets.length, 0);
  fs.rmSync(root, { recursive: true, force: true });
});

// ---- the Publishing Card ---------------------------------------------------------------------

test("sources go into the card for checking, and never into the description", () => {
  const { root, projectDir } = shotProject();
  fs.mkdirSync(path.join(projectDir, "out"));
  const video = path.join(projectDir, "out", "video-1.mp4");
  assert.equal(buildCard(projectDir, video, { total: 10 }).researchSources, undefined);
  saveBrief(projectDir, { state: "approved", grounded: true, sources: [{ title: "A", url: "https://a.example/page" }], claims: [{ claim: "Trains are new.", verdict: "wrong", note: "Old." }, { claim: "Trains run.", verdict: "right", note: "" }] });
  const card = checkCard(buildCard(projectDir, video, { total: 10 }));
  assert.deepEqual(card.researchSources.sources, [{ title: "A", url: "https://a.example/page" }]);
  assert.deepEqual(card.researchSources.flags.map((f) => f.verdict), ["wrong"]);
  assert.doesNotMatch(description("A summary.", card), /a\.example/);
  fs.rmSync(root, { recursive: true, force: true });
});

test("shotMapView with no table is empty, not an error", async () => {
  const dir = tmp();
  assert.deepEqual((await shotMapView({ projectDir: dir })).shots, []);
  fs.rmSync(dir, { recursive: true, force: true });
});
