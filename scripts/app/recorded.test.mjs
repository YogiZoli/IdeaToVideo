// The Recorded engine's screens in plain words: the tabs of a recording, the
// recipe lines, the sentences about cuts (docs/BUILD_PLAN.md phase 2).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { RECORDED_TABS, TABS, firstOpen, nextAfter, tabStates } from "../../app/src/lib/tabs.ts";
import { blocker, costLine, recipeLines } from "../../app/src/lib/channels/channels.ts";
import { checkLine, cutLine, filesMissing, stepText } from "../../app/src/lib/channels/recorded.ts";
import { phaseText } from "../../app/src/lib/progressInfo.ts";

const gates = (over = {}) => ({ script: { state: "todo" }, voice: { state: "todo" }, scenes: { state: "todo" }, avatar: { state: "todo" }, review: { state: "todo" }, ...over });

test("a recording has three tabs, and no script, voice or avatar step", () => {
  assert.deepEqual(RECORDED_TABS.map((t) => t.label), ["Recording", "Preview", "Your video"]);
  assert.deepEqual(RECORDED_TABS.map((t) => t.n), [1, 2, 3]);
  assert.equal(TABS.length, 8, "a script video has eight");
});

test("the Recording tab is done when the plan is approved; then the Preview is the step", () => {
  assert.equal(firstOpen(gates(), false, true, RECORDED_TABS), "recording");
  const planned = gates({ script: { state: "approved" }, voice: { state: "approved" }, scenes: { state: "approved" } });
  assert.equal(firstOpen(planned, false, true, RECORDED_TABS), "preview");
  const st = tabStates(planned, false, true, RECORDED_TABS);
  assert.equal(st.recording, "done");
  assert.equal(st.preview, "now");
  assert.equal(st.video, "next");
  assert.equal(nextAfter("recording", true, RECORDED_TABS), "preview");
  assert.equal(firstOpen({ ...planned, review: { state: "approved" } }, true, true, RECORDED_TABS), "video");
});

test("the commands of a recording show their percent on its tab", () => {
  const cmds = RECORDED_TABS[0].commands;
  for (const c of ["recorded-transcribe", "recorded-apply-cuts", "recorded-plan", "recorded-plan-rule", "recorded-prepare"]) assert.ok(cmds.includes(c), c);
});

const recipe = { engine: "recorded", preset: "talking-head", voice: { provider: "recording", voice: "own" }, avatar: { on: false, lookId: null }, music: { on: false, source: "synth", mood: "calm" }, broll: { on: true }, recorded: { cutout: true, smoothCursor: true }, targetLengthMin: 8 };
const presets = [{ id: "talking-head", label: "Talking Head", recorded: { slots: [], broll: true, cutout: true } }, { id: "screen-recording", label: "Screen Recording", recorded: { slots: [], zoom: true } }];

test("the recipe of a recording says what it has, nothing about a voice to choose", () => {
  const lines = recipeLines(recipe, presets);
  assert.deepEqual(lines.map((l) => l.label), ["Engine", "Style", "Voice", "Music", "B-roll", "Person cut-out"]);
  assert.equal(lines[0].value, "Recorded");
  assert.equal(lines[5].value, "On");
  const screen = recipeLines({ ...recipe, preset: "screen-recording" }, presets);
  assert.deepEqual(screen.map((l) => l.label), ["Engine", "Style", "Voice", "Music", "Smooth cursor"]);
});

test("a recording needs no key, and says it costs nothing", () => {
  assert.equal(blocker(recipe, {}, "gemini", "idea"), null);
  assert.match(costLine(recipe, "gemini"), /^0 USD/);
  assert.match(costLine(recipe, "claude"), /a rule without a key/);
});

test("the start screen knows which files are missing", () => {
  assert.match(filesMissing("talking-head", {}), /camera file/);
  assert.equal(filesMissing("talking-head", { combined: "x" }), null);
  assert.match(filesMissing("screen-share", { screen: "x" }), /camera file and a screen file/);
  assert.equal(filesMissing("screen-recording", { screen: "x" }), null);
  assert.equal(filesMissing("profile-silhouette", { camera: "x" }), null);
});

test("cuts and the check in one sentence each", () => {
  const cuts = { before: 754, after: 612, removed: 142, counts: { take: 3, filler: 1, sound: 0 }, check: {}, careful: false, marks: [], keepPauses: false, words: 100 };
  assert.equal(cutLine(cuts), "12 min 34 s down to 10 min 12 s: 3 repeated takes, 1 filler word, and the long pauses.");
  const ok = { ok: true, words: 100, wordsOnSpeech: 0.99, speechWithWords: 0.94, drift: 0.04, past: 0, seconds: 10 };
  assert.match(checkLine(ok, null), /^Checked against the recording: 99% of the 100 words/);
  assert.match(checkLine(ok, ok), /Checked again on the cut sound: 99%/);
  assert.match(checkLine({ ...ok, ok: false }, null), /do not fit the sound well/);
});

test("every long step says what it is doing", () => {
  assert.equal(stepText({ step: "transcribe", percent: 40 }), "Listening: the words of the recording, on this computer: 40%");
  assert.equal(stepText({ step: "recorded-cutout", n: 2, of: 5 }), "Cutting out the person for the big words: 2 of 5");
  assert.equal(stepText({ step: "nothing" }), null);
  for (const s of ["line-up", "transcribe", "recorded-cut", "recorded-sound", "recorded-cursor", "recorded-paint", "recorded-matte", "recorded-figure", "recorded-cutout"]) assert.ok(phaseText("recorded-transcribe", s), s);
  assert.match(phaseText("recorded-transcribe", "model-download"), /a model/);
  assert.match(phaseText("make-voice", "model-download"), /free voice/);
});

test("the core knows every command the screens call", () => {
  const rust = fs.readFileSync(new URL("../../app/src-tauri/src/runner.rs", import.meta.url), "utf8");
  for (const c of ["recorded-video-new", "recorded-state", "recorded-transcribe", "recorded-cut-set", "recorded-apply-cuts", "recorded-plan", "recorded-plan-rule", "recorded-plan-save", "recorded-prepare"]) assert.ok(rust.includes(`("${c}",`), c);
  assert.match(rust, /\("recorded-plan", Some\(&\["llm", "provider"\]\)\)/);
  assert.match(rust, /\("recorded-plan-rule", None\)/);
});
