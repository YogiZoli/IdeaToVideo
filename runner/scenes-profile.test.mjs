// scenes-profile.test.mjs: the Scenes wizard's profile (DECISIONS 110).
import "./fixtures/test-catalog.mjs"; // the scene catalog fixture, before any scene module
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { normalizeScenes, defaultScenes, loadScenes, saveScenes, mixRule, MIX_PRESETS } from "./scenes-profile.mjs";
import { shortlistMessages as buildMessages } from "./gates/scenes/index.mjs";

test("the mix adds up to 100, a preset is named only when it matches", () => {
  const p = normalizeScenes({ ...defaultScenes(), mix: { text: 2, icon: 1, image: 1, video: 0 } });
  assert.equal(Object.values(p.mix).reduce((a, b) => a + b, 0), 100);
  assert.deepEqual(p.mix, { text: 50, icon: 25, image: 25, video: 0 });
  assert.equal(p.preset, "custom");
  assert.equal(normalizeScenes({ ...defaultScenes(), preset: "visual", mix: MIX_PRESETS.visual.mix }).preset, "visual");
  assert.throws(() => normalizeScenes({ ...defaultScenes(), mix: { text: 0, icon: 0, image: 0, video: 0 } }), /at least one kind/);
});

test("each kind of the built-in library keeps a scene type; unknown names and later sources go", () => {
  assert.throws(() => normalizeScenes({ ...defaultScenes(), off: ["titlecard-lockup", "titlecard-calm"] }), /Keep at least one scene type for "Opening or chapter"/);
  const p = normalizeScenes({ ...defaultScenes(), off: ["no-such", "cta-close", "per-word-rise"], pictures: { sources: ["pixabay", "ai-image", "nope"] }, icons: { families: ["tabler", "x"] } });
  assert.deepEqual(p.off, ["per-word-rise"], "closing scenes belong to the CTA wizard");
  assert.deepEqual(p.pictures.sources, ["pixabay"]);
  assert.deepEqual(p.icons.families, ["tabler"]);
  assert.throws(() => normalizeScenes({ ...defaultScenes(), icons: { families: [] } }), /at least one icon set/);
});

test("no profile yet: the default, keeping what an old Motion profile turned off; saved, it is read back", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "itv-scenes-"));
  const first = loadScenes(dir, { motionOff: ["headline-slam"] });
  assert.equal(first.saved, false);
  assert.deepEqual(first.profile.off, ["headline-slam"]);
  saveScenes(dir, { ...first.profile, mix: MIX_PRESETS.drawn.mix, preset: "drawn" });
  const again = loadScenes(dir);
  assert.equal(again.saved, true);
  assert.equal(again.profile.preset, "drawn");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("the planner gets the mix, a kind without a source folded into the others", () => {
  const rule = mixRule({ text: 40, icon: 30, image: 20, video: 10 }, { pictures: false, video: false });
  assert.match(rule, /about 45% words on screen/);
  assert.match(rule, /about 55% icons and drawings/);
  assert.doesNotMatch(rule, /pictures|video clips/);
  assert.match(mixRule({ text: 40, icon: 30, image: 20, video: 10 }, { pictures: true, video: true }), /about 20% pictures, about 10% video clips/);
  const sys = buildMessages({}, [], { mix: rule })[0].content;
  assert.match(sys, /Mix the scenes: about 45% words/);
  assert.doesNotMatch(buildMessages({}, [])[0].content, /\{\{MIX\}\}/, "no profile: the balanced mix");
});
