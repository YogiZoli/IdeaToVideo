// The channel screen's plain words (docs/BUILD_PLAN.md, phase 1), and the
// Advanced toggle: the wizards are hidden, never deleted.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { recipeLines, costLine, blocker, queueOpen } from "../../app/src/lib/channels/channels.ts";
import { MENUS, SETTINGS_PAGES, visibleMenus } from "../../app/src/lib/pages.ts";
import { TABS } from "../../app/src/lib/tabs.ts";
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

test("the queue counts the videos ready to make", () => {
  assert.equal(queueOpen([{ script: "pending" }, { script: "approved" }, { script: "failed" }, { script: "todo" }]), 2);
});

test("Advanced hides the wizards and deletes nothing", () => {
  assert.deepEqual(visibleMenus(false).map((m) => m.id), ["home", "videos", "identity", "settings"]);
  assert.deepEqual(visibleMenus(true), MENUS);
  for (const id of ["motion", "look", "scenes", "cta", "planner"]) assert.ok(SETTINGS_PAGES.some((p) => p.id === id && p.menu === "wizards"), id);
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
