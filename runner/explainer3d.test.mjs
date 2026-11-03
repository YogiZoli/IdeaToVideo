// The 3D Explainer preset (docs/BUILD_PLAN.md phase 4, DECISIONS 148): its contract, its
// own pack, its look, and a plan that a dead AI still fills with the right things.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkPreset, listPresets, loadPreset, presetCard, presetLook, resolveTemplates, TEMPLATES_MAX, TEMPLATES_MIN } from "./presets/index.mjs";
import { builtinPacks, listPacks, loadPackBlock, registerPacks } from "./packs/index.mjs";
import { cleanParams, makeTemplateScenes, mendPart, objectsIn, planMessages, ruleParams, ruleScene, templateList } from "./gates/scenes/templates.mjs";
import { componentMeta, PACK_COMPONENTS } from "./gates/scenes/roles.mjs";
import { libraryCatalog } from "./gates/scenes/index.mjs";
import { elementsOf } from "./shots/index.mjs";
import { loadComponent, packScripts, THREE_FILE } from "./gates/build/assemble.mjs";
import { buildData, buildMessages } from "./gates/script/index.mjs";
import { blockHtml, BLOCKS } from "../scripts/make-3d-blocks.mjs";
import { THREE_KEEP, trimThree } from "../scripts/fetch-engine.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "presets", "explainer-3d");
const world = fs.readFileSync(path.join(dir, "pack", "shared", "world3d.js"), "utf8");
const preset = loadPreset("explainer-3d");
await registerPacks(null);
const templates = resolveTemplates(preset);
const byId = Object.fromEntries(templates.map((t) => [t.id, t]));
const s = (n, text, dur = 3) => ({ id: `S${n}`, text, dur, start: (n - 1) * dur, end: n * dur, words: text.split(" ").length });

test("the preset keeps the contract and is offered on the Script engine", () => {
  assert.deepEqual(checkPreset(preset), []);
  assert.ok(preset.templates.length >= TEMPLATES_MIN && preset.templates.length <= TEMPLATES_MAX);
  assert.equal(preset.engine, "script");
  assert.ok(listPresets().some((p) => p.id === "explainer-3d"));
  assert.deepEqual(presetCard(preset).defaults, { broll: false });
  assert.equal(preset.tokens.from, undefined, "its own palette, not the channel's Brand");
});

test("every template is drawn by the preset's own pack, with no block missing", () => {
  assert.equal(templates.length, preset.templates.length);
  for (const t of templates) {
    assert.equal(t.draw.component, `explainer-3d:${t.id}`);
    assert.ok(fs.existsSync(path.join(dir, "pack", "blocks", `${t.id}.html`)), t.id);
  }
});

test("the committed files are what make-3d-blocks writes", () => {
  // whatever line endings this checkout has
  for (const b of BLOCKS) assert.equal(fs.readFileSync(path.join(dir, "pack", "blocks", `${b.id}.html`), "utf8").replace(/\r\n/g, "\n"), blockHtml(b), b.id);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "pack", "pack.json"), "utf8"));
  assert.deepEqual(manifest.blocks.map((b) => b.id), BLOCKS.map((b) => b.id));
  assert.deepEqual(preset.templates.map((t) => t.id), BLOCKS.map((b) => b.id));
});

test("each block loads, has its own composition, and draws a kind the code knows", () => {
  const seen = new Set();
  for (const b of BLOCKS) {
    const c = loadComponent(`explainer-3d:${b.id}`);
    assert.ok(c.pack.builtin, "a preset's own pack");
    assert.ok(!seen.has(c.pack.compositionId));
    seen.add(c.pack.compositionId);
    assert.match(c.html, /data-scene-dur="5"/);
    assert.ok(new RegExp(`\\b${b.id}: \\{`).test(world), `${b.id} has no drawing code`);
  }
});

test("every object the AI may name is one the code can draw", () => {
  for (const o of preset.objects) assert.ok(new RegExp(`\\b${o.id}: function`).test(world), o.id);
  assert.ok(preset.objects.length >= 20);
  assert.equal(preset.objects[0].id, "orb", "the neutral one comes first");
});

test("the fonts are ones the app ships, under the OFL", () => {
  const fonts = JSON.parse(fs.readFileSync(path.join(here, "..", "library", "fonts.json"), "utf8"));
  assert.equal(fonts.license, "OFL-1.1");
  const names = fonts.families.map((f) => f.family);
  for (const f of Object.values(preset.tokens.fonts)) assert.ok(names.includes(f), f);
});

test("no brand name, no real person, no outside address in what draws the pictures", () => {
  const text = `${world}\n${JSON.stringify(preset)}\n${BLOCKS.map(blockHtml).join("\n")}`;
  assert.doesNotMatch(text, /\bvox\b|kurzgesagt|disney|pixar|netflix|heygen|youtube|nasa/i);
  assert.doesNotMatch(world, /https?:\/\/(?!www\.w3\.org\/2000\/svg)/);
  // a face would be a reason to look twice: the only figure has none
  assert.match(world, /person: function/);
  assert.doesNotMatch(world, /\beyes?\b|\bmouth\b|\bnose\b/i);
});

test("a preset's pack is never offered to another channel's plan", async () => {
  assert.ok(PACK_COMPONENTS.has("explainer-3d:statement"));
  assert.ok(componentMeta("explainer-3d:statement").presetOnly);
  const names = libraryCatalog({ off: [] }).map((c) => c.name);
  assert.ok(!names.some((n) => n.startsWith("explainer-3d:")));
  const id = fs.mkdtempSync(path.join(os.tmpdir(), "itv-3d-"));
  assert.deepEqual(listPacks(id), [], "it is not one of the channel's imported packs");
  assert.ok(builtinPacks().some((p) => p.id === "explainer-3d"));
  assert.equal(loadPackBlock("explainer-3d:word", id).pack.id, "explainer-3d");
  fs.rmSync(id, { recursive: true, force: true });
});

test("the look: its own palette and no 2D camera; Motion Frames stays the channel's", () => {
  const brand = { theme: { bg: "#000000" }, families: ["Inter"], light: false, motion: { camera: { move: "push" }, captions: { style: "plain" }, spokenWord: "off" }, footage: { dir: "x" }, scenes: { off: [] } };
  const look = presetLook(preset, brand);
  assert.equal(look.theme.bg, preset.tokens.colors.background);
  assert.ok(look.families.includes("Outfit") && look.families.includes("DM Sans"));
  assert.equal(look.light, true);
  assert.equal(look.motion.camera.move, "off");
  assert.equal(look.motion.transition.primary, "cut");
  assert.deepEqual(look.motion.captions, { style: "plain" }, "the channel's captions stay");
  assert.equal(look.motion.spokenWord, "off");
  assert.equal(look.footage.dir, "x");
  assert.equal(presetLook(loadPreset("motion-frames"), brand), brand);
  assert.equal(presetLook(loadPreset("talking-head"), brand), brand);
});

test("the prompt stays small enough for a small model and names the objects once", () => {
  const m = planMessages({ templates, sentences: [s(1, "The Moon is small.")], title: "T", language: "en", shotRules: preset.shotRules });
  const chars = m.map((x) => x.content).join("").length;
  assert.ok(chars < 5000, `${chars} characters`);
  const list = templateList(templates);
  assert.match(list, /OBJECTS/);
  assert.match(list, /statement: .*object \(one of OBJECTS\)/);
  assert.equal(list.match(/\bcheese\b/g).length, 1);
});

test("the object is the thing the sentence names", () => {
  assert.deepEqual(objectsIn("The Moon and the Earth", preset.objects).map((o) => o.object.id), ["moon", "planet"]);
  assert.deepEqual(objectsIn("Two rockets and a whale", preset.objects).map((o) => o.object.id), ["rocket", "fish"]);
  assert.deepEqual(objectsIn("A föld és a rakéta", preset.objects).map((o) => o.object.id), ["planet", "rocket"]);
  assert.deepEqual(objectsIn("You think I can hold this", preset.objects), [], "words that mean something else stay out");
  assert.equal(ruleParams(byId.statement, [s(1, "A hollow Moon would weigh nothing.")]).object, "moon");
  assert.equal(ruleParams(byId.statement, [s(1, "This has no picture at all.")]).object, "orb");
});

test("an object the preset cannot draw never reaches the build", () => {
  const span = [s(1, "The Moon is hollow.")];
  assert.equal(cleanParams(byId.word, { word: "Hollow", object: "dragon" }, span).object, "moon");
  assert.equal(cleanParams(byId.word, { word: "Hollow", object: "ROCKET" }, span).object, "rocket");
  assert.equal(cleanParams(byId.question, { question: "Why?", object: "dragon" }, span).object, undefined, "an optional one stays out");
});

test("the rules fill a template only when the sentence says that thing", () => {
  const scale = ruleParams(byId.scale, [s(1, "The Earth is 4 times bigger than the Moon.")]);
  assert.deepEqual(scale, { small: "Moon", big: "Earth", smallObject: "moon", bigObject: "planet", ratio: "4 times" });
  assert.equal(ruleParams(byId.scale, [s(1, "The Earth is round.")]), null);
  assert.equal(ruleParams(byId.scale, [s(1, "The Earth is bigger than you think, right.")]), null, "it needs two things to compare");

  assert.equal(ruleParams(byId.cutaway, [s(1, "Look inside the Moon today.")]).object, "moon");
  assert.equal(ruleParams(byId.cutaway, [s(1, "Look inside the Moon and find a core.")]).headline, "Look inside the Moon", "it never stops on a word that needs the next");
  assert.equal(ruleParams(byId.cutaway, [s(1, "Look at the Moon today.")]), null);

  const versus = ruleParams(byId.versus, [s(1, "A hollow Moon floats, but a solid Moon pulls oceans.")]);
  assert.equal(versus.left, "A hollow Moon floats");
  assert.equal(versus.right, "a solid Moon pulls");
  assert.equal(versus.rightObject, "moon");
  assert.equal(ruleParams(byId.versus, [s(1, "Nothing to weigh here at all.")]), null);

  const cause = ruleParams(byId.cause, [s(1, "Tides rise because the Moon pulls.")]);
  assert.equal(cause.from, "the Moon pulls", "the cause comes first on screen");
  assert.equal(cause.to, "Tides rise");
  assert.equal(cause.fromObject, "moon");
  assert.equal(ruleParams(byId.cause, [s(1, "Rain leads to floods in cities.")]), null, "one word is not a thing to show");
  const far = ruleParams(byId.versus, [s(1, "A hollow Moon would weigh almost nothing, but a solid one pulls the ocean.")]);
  assert.equal(far.left, "would weigh almost nothing");
  assert.equal(far.leftObject, "moon", "the thing its side names, even outside the words shown");
  assert.equal(far.rightObject, "drop");
  const sea = ruleParams(byId.cause, [s(1, "Tides rise because the Moon pulls the water.")]);
  assert.deepEqual([sea.fromObject, sea.toObject], ["moon", "drop"], "what the other part of the sentence names");
});

test("a line stays inside one sentence, also for a shot cut across two", () => {
  const p = ruleParams(byId.statement, [{ id: "S1", text: "It starts with one number. The Moon is small." }]);
  assert.ok(!`${p.line1} ${p.line2}`.includes("Moon"), `${p.line1} / ${p.line2}`);
});

test("a sentence's own template comes before the rotation", () => {
  const scene = (text) => ruleScene({ byId, sentences: [s(1, text)], previous: null, turn: 0, first: false, title: "" });
  assert.equal(scene("Is the Moon hollow at all?").template, "question");
  assert.equal(scene("Look inside the Moon today.").template, "cutaway");
  assert.equal(scene("The Earth is bigger than the Moon.").template, "scale");
  assert.equal(scene("About 27% of it is gone.").template, "percent");
  assert.ok(["statement", "highlight", "word"].includes(scene("The Moon is a dry place.").template));
});

test("the first scene names the video and shows what it is about", () => {
  const first = ruleScene({ byId, sentences: [s(1, "What if the Moon were hollow?")], previous: null, turn: 0, first: true, title: "Is the Moon hollow?" });
  assert.equal(first.template, "title");
  assert.equal(first.vars.headline, "Is the Moon hollow?");
  assert.equal(first.vars.object, "moon");
});

test("the worst answers of a small model still cover every sentence, in order", () => {
  const part = [s(1, "The Moon is small."), s(2, "It is 27% as wide as the Earth."), s(3, "Is it hollow?"), s(4, "Look inside it now."), s(5, "A rocket can tell us.")];
  for (const answer of [null, {}, { scenes: "no" }, { scenes: [{ from: "S9", template: "scale", params: {} }] }, { scenes: [{ from: "S1", to: "S5", template: "nope" }] }, { scenes: [{ from: "S1", template: "scale", params: { small: "a" } }, { from: "S2", template: "shelf", params: {} }] }]) {
    const r = mendPart({ answer, part, templates, pace: "balanced" });
    const ids = r.scenes.flatMap((x) => {
      const from = Number(x.from.slice(1));
      const to = Number((x.to ?? x.from).slice(1));
      return Array.from({ length: to - from + 1 }, (_, i) => from + i);
    });
    assert.deepEqual(ids, [1, 2, 3, 4, 5], JSON.stringify(answer));
    r.scenes.forEach((x, i) => assert.notEqual(x.component, r.scenes[i - 1]?.component));
  }
});

test("a good answer goes through as it came, objects included", () => {
  const part = [s(1, "The Earth is 4 times wider than the Moon.")];
  const r = mendPart({ answer: { scenes: [{ from: "S1", template: "scale", params: { small: "Moon", big: "Earth", smallObject: "moon", bigObject: "planet", ratio: "4 times" } }] }, part, templates, pace: "balanced" });
  assert.equal(r.mended, 0);
  assert.deepEqual(r.scenes[0].vars, { small: "Moon", big: "Earth", smallObject: "moon", bigObject: "planet", ratio: "4 times" });
});

test("the whole plan by rule passes every check, on the preset's own blocks", async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "itv-3d-plan-"));
  const sentences = [s(1, "What if the Moon were hollow?"), s(2, "The Earth is bigger than the Moon."), s(3, "Look inside the Moon now."), s(4, "It holds 27% of nothing."), s(5, "A hollow Moon floats, but a solid Moon pulls."), s(6, "Tides rise because the Moon pulls.")];
  fs.writeFileSync(path.join(d, "sentences.json"), JSON.stringify(sentences));
  fs.writeFileSync(path.join(d, "script.md"), "# T\n\n## OPEN\n\nx\n");
  await makeTemplateScenes({ llm: null, projectDir: d, preset, title: "Is the Moon hollow?" });
  const table = JSON.parse(fs.readFileSync(path.join(d, "scenes.json"), "utf8"));
  assert.equal(table.planner.preset, "explainer-3d");
  assert.deepEqual(table.scenes.map((x) => x.template), ["title", "scale", "cutaway", "percent", "versus", "cause"]);
  for (const sc of table.scenes) assert.ok(sc.component.startsWith("explainer-3d:"));
  fs.rmSync(d, { recursive: true, force: true });
});

test("the Shot map pins text, not the name of an object", () => {
  const row = { component: "explainer-3d:scale", vars: { small: "Moon", big: "Earth", smallObject: "moon", bigObject: "planet" } };
  assert.deepEqual(elementsOf(row).map((e) => e.id), ["small", "big"]);
  const shelf = { component: "explainer-3d:shelf", vars: { item1: "Rocks", object1: "mountain" } };
  assert.deepEqual(elementsOf(shelf).map((e) => e.id), ["item1"]);
});

test("the build puts three.js and the drawing code on the page, from the pinned engine", () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "itv-3d-page-"));
  const engine = path.join(d, "engine");
  fs.mkdirSync(path.join(engine, "node_modules", "three", "build"), { recursive: true });
  fs.writeFileSync(path.join(engine, "node_modules", "three", "build", "three.cjs"), "'use strict'; exports.Scene = function () {};");
  const out = path.join(d, "out");
  fs.mkdirSync(out);
  const names = packScripts([loadComponent("explainer-3d:word"), loadComponent("explainer-3d:title"), loadComponent("count-up")], out, { ITV_ENGINE_DIR: engine });
  assert.deepEqual(names, [THREE_FILE, "explainer-3d-world3d.js"]);
  const page = {};
  new Function(`${fs.readFileSync(path.join(out, THREE_FILE), "utf8")}\nthis.THREE = THREE;`).call(page);
  assert.equal(typeof page.THREE.Scene, "function", "a plain page gets the global");
  assert.deepEqual(packScripts([loadComponent("count-up")], out, { ITV_ENGINE_DIR: engine }), [], "nothing for a video without it");
  fs.rmSync(d, { recursive: true, force: true });
});

test("three.js is pinned, MIT, and only the file a build reads ships", () => {
  const lock = JSON.parse(fs.readFileSync(path.join(here, "..", "engine", "package-lock.json"), "utf8"));
  const three = lock.packages["node_modules/three"];
  assert.equal(three.license, "MIT");
  assert.equal(JSON.parse(fs.readFileSync(path.join(here, "..", "engine", "package.json"), "utf8")).dependencies.three, three.version);
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "itv-3d-trim-"));
  for (const f of [...THREE_KEEP, "examples/jsm/a.js", "src/b.js", "build/three.module.js"]) {
    fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true });
    fs.writeFileSync(path.join(d, f), "x");
  }
  trimThree(d);
  assert.deepEqual(fs.readdirSync(d).sort(), ["LICENSE", "build", "package.json"]);
  assert.deepEqual(fs.readdirSync(path.join(d, "build")), ["three.cjs"]);
  fs.rmSync(d, { recursive: true, force: true });
});

test("the script hears the preset's one strange question, and it adds no fact", () => {
  const data = buildData({ topic: "The Moon", language: "en", targetLengthMin: 1, styleNote: preset.scriptNote });
  assert.match(data.styleNote, /one strange/);
  assert.equal(buildData({ topic: "The Moon", language: "en", targetLengthMin: 1 }).styleNote, undefined);
  assert.match(buildMessages(data)[0].content, /It never adds a fact/);
  assert.ok(preset.ideaNote);
});
