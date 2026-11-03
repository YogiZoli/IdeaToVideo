// The Stick World preset (docs/BUILD_PLAN.md phase 5, DECISIONS 152): its contract, its own
// pack, its blink and its planted feet, and a plan that a dead AI still fills with the right things.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkPreset, listPresets, loadPreset, presetCard, presetLook, resolveTemplates, TEMPLATES_MAX, TEMPLATES_MIN } from "./presets/index.mjs";
import { loadPackBlock, registerPacks } from "./packs/index.mjs";
import { cleanParams, makeTemplateScenes, mendPart, ruleParams, ruleScene } from "./gates/scenes/templates.mjs";
import { componentMeta, PACES, PACK_COMPONENTS } from "./gates/scenes/roles.mjs";
import { elementsOf } from "./shots/index.mjs";
import { loadComponent, packScripts } from "./gates/build/assemble.mjs";
import { blockHtml, BLOCKS } from "../scripts/make-stick-blocks.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "presets", "stick-world");
const code = fs.readFileSync(path.join(dir, "pack", "shared", "stick.js"), "utf8");
const preset = loadPreset("stick-world");
await registerPacks(null);
const templates = resolveTemplates(preset);
const byId = Object.fromEntries(templates.map((t) => [t.id, t]));
const s = (n, text, dur = 3) => ({ id: `S${n}`, text, dur, start: (n - 1) * dur, end: n * dur, words: text.split(" ").length });

// The drawing code's plain functions, without a page.
const page = {};
new Function("window", "document", code)(page, {});
const { gait, route, blinks, eyesAt, OBJECTS, KINDS } = page.ITVStick;

test("the preset keeps the contract and is offered on the Script engine", () => {
  assert.deepEqual(checkPreset(preset), []);
  assert.ok(preset.templates.length >= TEMPLATES_MIN && preset.templates.length <= TEMPLATES_MAX);
  assert.equal(preset.engine, "script");
  assert.ok(listPresets().some((p) => p.id === "stick-world"));
  assert.deepEqual(presetCard(preset).defaults, { broll: false });
  assert.equal(preset.tokens.from, undefined, "its own palette, not the channel's Brand");
  assert.ok(PACES[preset.shotRules.pacing]);
});

test("the plan's look: a light plain background, one accent, and only OFL fonts the app ships", () => {
  const fonts = JSON.parse(fs.readFileSync(path.join(here, "..", "library", "fonts.json"), "utf8"));
  assert.equal(fonts.license, "OFL-1.1");
  const names = fonts.families.map((f) => f.family);
  for (const f of Object.values(preset.tokens.fonts)) assert.ok(names.includes(f), f);
  assert.equal(preset.tokens.appearance, "light");
  assert.equal(preset.tokens.texture, "none");
  const brand = { theme: { bg: "#000000" }, families: ["Inter"], light: false, motion: { camera: { move: "push" }, captions: { style: "plain" } } };
  const look = presetLook(preset, brand);
  assert.equal(look.theme.bg, preset.tokens.colors.background);
  assert.equal(look.motion.camera.move, "off", "no 2D camera around a nearly still scene");
  assert.deepEqual(look.motion.captions, { style: "plain" });
});

test("every template is drawn by the preset's own pack, with no block missing", () => {
  assert.equal(templates.length, preset.templates.length);
  for (const t of templates) {
    assert.equal(t.draw.component, `stick-world:${t.id}`);
    assert.ok(fs.existsSync(path.join(dir, "pack", "blocks", `${t.id}.html`)), t.id);
  }
});

test("the committed files are what make-stick-blocks writes", () => {
  for (const b of BLOCKS) assert.equal(fs.readFileSync(path.join(dir, "pack", "blocks", `${b.id}.html`), "utf8").replace(/\r\n/g, "\n"), blockHtml(b), b.id);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "pack", "pack.json"), "utf8"));
  assert.deepEqual(manifest.blocks.map((b) => b.id), BLOCKS.map((b) => b.id));
  assert.deepEqual(preset.templates.map((t) => t.id), BLOCKS.map((b) => b.id));
});

test("each block loads and draws a kind the code knows; each object is one the code can draw", () => {
  for (const b of BLOCKS) {
    const c = loadComponent(`stick-world:${b.id}`);
    assert.ok(c.pack.builtin, "a preset's own pack");
    assert.ok(KINDS.includes(b.id), `${b.id} has no drawing code`);
  }
  for (const o of preset.objects) assert.ok(OBJECTS.includes(o.id), o.id);
  assert.ok(preset.objects.length >= 20);
  assert.equal(preset.objects[0].id, "none", "the neutral one comes first: the figure alone");
});

test("no brand name, no outside address, no image file in what draws the pictures", () => {
  const text = `${code}\n${JSON.stringify(preset)}\n${BLOCKS.map(blockHtml).join("\n")}`;
  assert.doesNotMatch(text, /\bvox\b|xkcd|munroe|disney|pixar|netflix|heygen|youtube|nasa/i);
  assert.doesNotMatch(code, /https?:\/\//);
  assert.doesNotMatch(code, /\.png|\.jpg|drawImage/);
});

test("the Shot map says the camera is the scene's own, and pins text, not an object's name", () => {
  assert.equal(PACK_COMPONENTS.get("stick-world:walk").camera, "Nearly still");
  assert.equal(PACK_COMPONENTS.get("explainer-3d:word").camera, "3D move, its own");
  assert.ok(componentMeta("stick-world:walk").presetOnly);
  assert.deepEqual(elementsOf({ component: "stick-world:versus", vars: { left: "You", right: "Them", leftObject: "car", rightObject: "boat" } }).map((e) => e.id), ["left", "right"]);
});

test("a blink comes every 3.5 to 4 seconds, for every figure, and it really shuts the eyes", () => {
  for (const seed of [1, 2, 3, 40]) {
    const times = blinks(seed, 480);
    assert.ok(times[0] < 4, "the first one comes soon");
    assert.ok(times.at(-1) >= 480, "an 8 minute video");
    for (let i = 1; i < times.length; i++) {
      const gap = times[i] - times[i - 1];
      assert.ok(gap >= 3.5 && gap <= 4, `${gap} s`);
    }
    assert.equal(eyesAt(seed, times[2] - 0.05), 1, "open just before");
    assert.ok(eyesAt(seed, times[2] + 0.08) < 0.05, "shut in the middle");
    assert.equal(eyesAt(seed, times[2] + 0.3), 1, "open again");
  }
  assert.notDeepEqual(blinks(1, 10).slice(0, 3), blinks(2, 10).slice(0, 3), "people do not blink together");
});

test("a blink is the same whatever order the frames are asked in", () => {
  const forward = [];
  for (let t = 0; t < 20; t += 0.5) forward.push(eyesAt(7, t));
  const page2 = {};
  new Function("window", "document", code)(page2, {});
  const backward = [];
  for (let t = 19.5; t >= 0; t -= 0.5) backward.unshift(page2.ITVStick.eyesAt(7, t));
  assert.deepEqual(backward, forward);
});

test("feet stay planted: a foot on the floor never slides, and one is always down", () => {
  const S = 64;
  const steps = 14;
  let last = gait(0, S);
  for (let d = 0.25; d <= S * steps; d += 0.25) {
    const now = gait(d, S);
    assert.ok(now.some((f) => f.lift === 0), `both feet in the air at ${d}`);
    now.forEach((f, i) => {
      if (f.lift === 0 && last[i].lift === 0) assert.ok(Math.abs(f.x - last[i].x) < 1e-6, `foot ${i} slid at ${d}`);
    });
    last = now;
  }
});

test("a foot lands only forward, and a walk ends with the feet under the hips", () => {
  const S = 64;
  let last = gait(0, S);
  for (let d = 1; d <= S * 8; d += 1) {
    const now = gait(d, S);
    now.forEach((f, i) => assert.ok(f.x >= last[i].x - 1e-6));
    last = now;
  }
  for (const n of [2, 3, 8, 13]) {
    const xs = gait(n * S, S).map((f) => f.x - n * S).sort((a, b) => a - b);
    assert.ok(Math.abs(xs[0] + S / 2) < 1e-6 && Math.abs(xs[1] - S / 2) < 1e-6, `after ${n} steps: ${xs}`);
  }
});

test("a leg always reaches: the feet stay inside what the leg can do", () => {
  const S = 64;
  for (let d = 0; d <= S * 8; d += 1) {
    for (const f of gait(d, S)) assert.ok(Math.hypot(f.x - d, 184 - f.lift * 22) <= 200, `${f.x - d} at ${d}`);
  }
});

test("a walk fits its shot: whole steps, never a sprint, however short", () => {
  for (const D of [1.5, 2, 3, 5, 9]) {
    const r = route(D, 980, 64);
    assert.ok(Number.isInteger(r.n) && r.n >= 2);
    assert.equal(r.dist, r.n * 64);
    if (r.n > 2) assert.ok(r.n / D <= 3, `${r.n} steps in ${D} s`);
  }
});

test("the rules fill a template only when the sentence says that thing", () => {
  const walk = ruleParams(byId.walk, [s(1, "You walk to the door.")]);
  assert.equal(walk.object, "door");
  assert.equal(ruleParams(byId.walk, [s(1, "The door is closed.")]), null);
  const talk = ruleParams(byId.talk, [s(1, 'She says "you are late" and leaves.')]);
  assert.equal(talk.said, "you are late");
  assert.equal(ruleParams(byId.talk, [s(1, "Nobody is here at all.")]), null);
  assert.equal(ruleParams(byId.thought, [s(1, "You imagine a house on the Moon.")]).object, "house");
  assert.equal(ruleParams(byId.thought, [s(1, "A house stands on the Moon.")]), null);
  assert.equal(ruleParams(byId.statement, [s(1, "Nothing here has a picture.")]).object, "none", "the figure alone");
});

test("a sentence's own template comes before the rotation", () => {
  const scene = (text) => ruleScene({ byId, sentences: [s(1, text)], previous: null, turn: 0, first: false, title: "" });
  assert.equal(scene("Would you even notice?").template, "question");
  assert.equal(scene("You imagine a house.").template, "thought");
  assert.equal(scene("You walk to the car.").template, "walk");
  assert.equal(scene("You walk to the car, but it is gone.").template, "versus", "the sentence's shape says more than its verb");
  assert.equal(scene("About 27% of you is gone.").template, "percent");
  assert.equal(scene("You have 7 dogs.").template, "number");
  assert.ok(["statement", "highlight", "word"].includes(scene("The sky is dark.").template));
});

test("the first scene shows the whole question, up to its own limit", () => {
  const first = ruleScene({ byId, sentences: [s(1, "What if you woke up on the Moon?")], previous: null, turn: 0, first: true, title: "What if you woke up on the Moon?" });
  assert.equal(first.vars.headline, "What if you woke up on the Moon?");
  assert.equal(first.vars.object, "moon");
  const long = ruleScene({ byId, sentences: [s(1, "What if.")], previous: null, turn: 0, first: true, title: "What if you woke up one day on the Moon?" });
  assert.equal(long.vars.headline, "What if you woke up one day", "it never stops on a word that needs the next");
});

test("an object the preset cannot draw never reaches the build", () => {
  const span = [s(1, "You see a car.")];
  assert.equal(cleanParams(byId.walk, { line: "You see a car", object: "dragon" }, span).object, undefined, "an optional one stays out");
  assert.equal(cleanParams(byId.walk, { line: "You see a car", object: "CAR" }, span).object, "car");
  assert.equal(loadPackBlock("stick-world:walk").pack.id, "stick-world");
});

test("the worst answers of a small model still cover every sentence, in order", () => {
  const part = [s(1, "You wake up."), s(2, "You walk to the door."), s(3, "Is anyone there?"), s(4, "You imagine a car."), s(5, "It costs 5 dollars.")];
  for (const answer of [null, {}, { scenes: "no" }, { scenes: [{ from: "S9", template: "walk", params: {} }] }, { scenes: [{ from: "S1", to: "S5", template: "nope" }] }]) {
    const r = mendPart({ answer, part, templates, pace: preset.shotRules.pacing });
    const ids = r.scenes.flatMap((x) => {
      const from = Number(x.from.slice(1));
      const to = Number((x.to ?? x.from).slice(1));
      return Array.from({ length: to - from + 1 }, (_, i) => from + i);
    });
    assert.deepEqual(ids, [1, 2, 3, 4, 5], JSON.stringify(answer));
    r.scenes.forEach((x, i) => assert.notEqual(x.component, r.scenes[i - 1]?.component));
  }
});

test("the whole plan by rule passes every check, one shot per sentence, on the preset's own blocks", async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "itv-stick-plan-"));
  const sentences = [s(1, "What if you woke up on the Moon?"), s(2, "You walk to the door."), s(3, "You imagine a car."), s(4, "About 27% of you is gone."), s(5, "You run, but the door stays shut."), s(6, "You cry because the night is cold.")];
  fs.writeFileSync(path.join(d, "sentences.json"), JSON.stringify(sentences));
  fs.writeFileSync(path.join(d, "script.md"), "# T\n\n## OPEN\n\nx\n");
  await makeTemplateScenes({ llm: null, projectDir: d, preset, title: "What if you woke up on the Moon?" });
  const table = JSON.parse(fs.readFileSync(path.join(d, "scenes.json"), "utf8"));
  assert.equal(table.planner.preset, "stick-world");
  assert.equal(table.scenes.length, sentences.length);
  assert.equal(table.scenes[0].template, "title");
  for (const sc of table.scenes) assert.ok(sc.component.startsWith("stick-world:"));
  fs.rmSync(d, { recursive: true, force: true });
});

test("the build puts its drawing code on the page, and no three.js for this preset", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "itv-stick-page-"));
  assert.deepEqual(packScripts([loadComponent("stick-world:word"), loadComponent("stick-world:walk")], out), ["stick-world-stick.js"]);
  fs.rmSync(out, { recursive: true, force: true });
});
