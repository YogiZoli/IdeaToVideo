// The channel screen's plain words (docs/BUILD_PLAN.md, phase 1), and the steps of a video.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { recipeLines, costLine, blocker, queueOpen, recipeSide, pictureWords } from "../../app/src/lib/channels/channels.ts";
import { TABS, videoTabs, tabStates, firstOpen, nextAfter, nextVideo } from "../../app/src/lib/tabs.ts";
import { phaseText } from "../../app/src/lib/progressInfo.ts";

const free = { engine: "script", preset: "motion-frames", voice: { provider: "kokoro", voice: "am_michael" }, avatar: { on: false, lookId: null }, music: { on: true, source: "synth", mood: "calm" }, targetLengthMin: 8 };
const presets = [{ id: "motion-frames", label: "Motion Frames" }];
const voices = [{ id: "am_michael", name: "Michael", gender: "male" }];

test("the recipe in seven plain lines", () => {
  const lines = recipeLines(free, presets, voices);
  assert.deepEqual(lines.map((l) => l.label), ["Engine", "Style", "Voice", "Avatar", "Music", "B-roll", "Length"]);
  assert.equal(lines[1].value, "Motion Frames");
  assert.match(lines[2].value, /Michael, free/);
  assert.equal(lines[3].value, "Off");
  assert.match(lines[4].value, /by code/);
  assert.equal(lines[5].value, "Off");
  assert.equal(recipeLines({ ...free, broll: { on: true } }, presets, voices)[5].value, "On, free sources first");
  assert.equal(lines[6].value, "8 minutes");
  assert.equal(recipeLines({ ...free, targetLengthMin: 1, music: { ...free.music, on: false } }, presets)[6].value, "1 minute");
});

test("the price is said before the video starts: 0 USD only when it is", () => {
  assert.match(costLine(free, "gemini"), /^0 USD/);
  assert.doesNotMatch(costLine({ ...free, voice: { provider: "elevenlabs", voice: "x" } }, "gemini"), /^0 USD/);
  assert.match(costLine({ ...free, avatar: { on: true, lookId: "x" } }, "gemini"), /HeyGen credits/);
  assert.match(costLine(free, "claude"), /AI key's credits/);
});

test("what stops a video is said, with where to fix it", () => {
  assert.equal(blocker(free, { gemini: true }, "gemini", "idea"), null);
  assert.match(blocker(free, {}, "gemini", "idea").text, /AI key/);
  // a pasted script needs no AI at all
  assert.equal(blocker(free, {}, "gemini", "script"), null);
  assert.match(blocker({ ...free, voice: { provider: "elevenlabs", voice: "x" } }, { gemini: true }, "gemini", "idea").text, /ElevenLabs/);
  assert.match(blocker({ ...free, avatar: { on: true, lookId: "x" } }, { gemini: true }, "gemini", "idea").text, /HeyGen/);
});

test("without an AI key notes and research say what happens instead, a finished script needs nothing", () => {
  assert.match(blocker(free, {}, "gemini", "notes").text, /your notes become the draft/);
  assert.match(blocker(free, {}, "gemini", "script", true).text, /nothing is researched/);
  assert.equal(blocker(free, { gemini: true }, "gemini", "notes", true), null);
});

test("one recipe, either direction", () => {
  const side = recipeSide({ ...free, directions: { recorded: { preset: "screen-share", recorded: { cutout: false, smoothCursor: true } } } }, "recorded");
  assert.deepEqual([side.engine, side.preset, side.voice.provider], ["recorded", "screen-share", "recording"]);
  const rec = { ...free, engine: "recorded", preset: "talking-head", voice: { provider: "recording", voice: "own" } };
  assert.equal(recipeSide(rec, "script"), null, "never had a voice");
  const back = recipeSide({ ...rec, directions: { script: { preset: "motion-frames", voice: free.voice, avatar: free.avatar, targetLengthMin: 5 } } }, "script");
  assert.deepEqual([back.engine, back.voice.provider, back.targetLengthMin], ["script", "kokoro", 5]);
});

test("every script video: Research first, the Shot map after the Scenes, no Thumbnail tab (DECISIONS 169)", () => {
  for (const list of [videoTabs(false), videoTabs(true)]) {
    assert.deepEqual(list.map((t) => t.label), ["Research", "Script", "Voice and music", "Scenes", "Shot map", "Avatar", "Preview", "Your video"]);
    assert.deepEqual(list.map((t) => t.n), [1, 2, 3, 4, 5, 6, 7, 8]);
  }
  const gates = { script: { state: "approved" }, voice: { state: "approved" }, scenes: { state: "todo" }, avatar: { state: "todo" }, review: { state: "todo" } };
  const list = videoTabs(true);
  assert.equal(firstOpen(gates, false, false, list, false), "research", "the brief waits for its click");
  assert.equal(firstOpen(gates, false, false, list, true), "scenes");
  assert.equal(tabStates(gates, false, false, list, true).research, "done");
  assert.equal(tabStates({ ...gates, scenes: { state: "approved" } }, false, false, list, true).shots, "done");
  assert.equal(nextAfter("scenes", false, list), "shots");
  assert.equal(nextAfter("shots", false, list), "preview");
  assert.equal(nextAfter("shots", true, list), "avatar");
});

test("research that is not asked for never blocks a video, and can still be done", () => {
  const none = { script: { state: "todo" }, voice: { state: "todo" }, scenes: { state: "todo" }, avatar: { state: "todo" }, review: { state: "todo" } };
  const list = videoTabs(false);
  assert.equal(firstOpen(none, false, false, list, false), "script");
  assert.equal(tabStates(none, false, false, list, false).research, "optional");
  assert.equal(tabStates(none, false, false, list, true).research, "done");
  assert.equal(TABS.find((t) => t.id === "research").optional, true, "by default it is optional: the Channels board goes by this");
});

test("a fact's picture is searched by its real words, without numbers", () => {
  assert.equal(pictureWords("In 1761 the old steam engines of Britain crossed the valley."), "old steam engines britain crossed");
  assert.equal(pictureWords(""), "");
});

test("today's video: a queued one first, then a playlist's, then the newest not finished", () => {
  const gates = { script: { state: "approved" }, voice: { state: "todo" } };
  const done = { dir: "d", title: "Done", render: { state: "done" }, gates, createdAt: "2026-11-04" };
  const old = { dir: "o", title: "Old", gates, createdAt: "2026-10-01" };
  const fresh = { dir: "f", title: "Fresh", gates, createdAt: "2026-11-01" };
  const lesson2 = { dir: "l2", title: "Lesson 2", gates, series: { playlistPosition: 2 }, createdAt: "2026-11-02" };
  const lesson1 = { dir: "l1", title: "Lesson 1", gates, series: { playlistPosition: 1 }, createdAt: "2026-11-01" };
  const queued = { dir: "q", title: "Queued", gates, queue: { position: 1 }, createdAt: "2026-09-01" };
  assert.equal(nextVideo([done], false), null);
  assert.equal(nextVideo([done, old, fresh], false).video.title, "Fresh");
  assert.equal(nextVideo([fresh, lesson2, lesson1], false).video.title, "Lesson 1");
  const r = nextVideo([fresh, lesson1, queued], false);
  assert.equal(r.video.title, "Queued");
  assert.equal(r.others, 2);
  assert.equal(r.step, "3. Voice and music");
});

test("the queue counts the videos ready to make", () => {
  assert.equal(queueOpen([{ script: "pending" }, { script: "approved" }, { script: "failed" }, { script: "todo" }]), 2);
});

test("the short first setup asks for the AI key and a name; the long one is still there", () => {
  // steps.ts talks to the core, so it is read as text here, like pages.test.mjs
  const src = fs.readFileSync(new URL("../../app/src/lib/steps.ts", import.meta.url), "utf8");
  assert.match(src, /QUICK_SETUP: StepId\[\] = \["ai", "name"\]/);
  const page = fs.readFileSync(new URL("../../app/src/routes/+page.svelte", import.meta.url), "utf8");
  assert.match(page, /only=\{longSetup \? undefined : QUICK_SETUP\}/);
});

test("the template plan shows on the Scenes tab and says what it does", () => {
  const scenes = TABS.find((t) => t.id === "scenes").commands;
  assert.ok(scenes.includes("make-template-scenes") && scenes.includes("simple-template-scenes"));
  assert.match(phaseText("make-template-scenes", "planning"), /templates/);
  assert.match(phaseText("make-voice", "model-download"), /free voice/);
  assert.match(phaseText("week-batch", "batch-script"), /week/);
});
