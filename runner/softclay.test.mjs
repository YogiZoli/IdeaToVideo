// The Soft Clay Chronicle preset (docs/BUILD_PLAN.md phase 8, DECISIONS 161): its contract, its own
// pack, the small date label the build gives it, and a plan that a dead AI still fills.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkPreset, listPresets, loadPreset, presetCard, presetLook, resolveTemplates, TEMPLATES_MAX, TEMPLATES_MIN } from "./presets/index.mjs";
import { builtinPacks, registerPacks } from "./packs/index.mjs";
import { makeTemplateScenes, mendPart, objectsIn, planMessages, ruleParams, ruleScene, templateList } from "./gates/scenes/templates.mjs";
import { carriedDates, whenIn } from "./gates/scenes/when.mjs";
import { PACES } from "./gates/scenes/roles.mjs";
import { elementsOf } from "./shots/index.mjs";
import { loadComponent, packScripts, THREE_FILE } from "./gates/build/assemble.mjs";
import { refusal } from "./assets/license.mjs";
import { blockHtml, BLOCKS } from "../scripts/make-clay-blocks.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "presets", "soft-clay");
const code = fs.readFileSync(path.join(dir, "pack", "shared", "clay.js"), "utf8");
const preset = loadPreset("soft-clay");
await registerPacks(null);
const templates = resolveTemplates(preset);
const byId = Object.fromEntries(templates.map((t) => [t.id, t]));
const s = (n, text, dur = 3) => ({ id: `S${n}`, text, dur, start: (n - 1) * dur, end: n * dur, words: text.split(" ").length });

test("the preset keeps the contract and is offered on the Script engine", () => {
  assert.deepEqual(checkPreset(preset), []);
  assert.ok(preset.templates.length >= TEMPLATES_MIN && preset.templates.length <= TEMPLATES_MAX);
  assert.equal(preset.engine, "script");
  assert.ok(listPresets().some((p) => p.id === "soft-clay"));
  assert.deepEqual(presetCard(preset).defaults, { broll: false, research: true, mood: "warm" });
  assert.equal(presetCard(preset).factChecked, undefined, "research is a default here, not a promise: the switch stays");
  assert.ok(PACES[preset.shotRules.pacing]);
});

test("the plan's look: warm and dark, its own palette, only OFL fonts the app ships", () => {
  const fonts = JSON.parse(fs.readFileSync(path.join(here, "..", "library", "fonts.json"), "utf8"));
  assert.equal(fonts.license, "OFL-1.1");
  const families = Object.fromEntries(fonts.families.map((f) => [f.family, f]));
  for (const f of Object.values(preset.tokens.fonts)) {
    assert.ok(families[f], f);
    assert.ok(families[f].subsets["latin-ext"], `${f} has the Hungarian letters`);
  }
  const [r, g, b] = preset.tokens.colors.background.match(/[0-9a-f]{2}/g).map((x) => parseInt(x, 16));
  assert.ok(r > g && g > b && r < 50, "dark, and warm");
  const look = presetLook(preset, { theme: { bg: "#ffffff" }, families: ["Inter"], light: true, motion: { camera: { move: "push" }, captions: { style: "plain" } } });
  assert.equal(look.theme.bg, preset.tokens.colors.background);
  assert.equal(look.light, false);
  assert.equal(look.motion.camera.move, "off", "the scene owns its camera");
  assert.deepEqual(look.motion.captions, { style: "plain" });
});

test("the committed files are what make-clay-blocks writes", () => {
  for (const b of BLOCKS) assert.equal(fs.readFileSync(path.join(dir, "pack", "blocks", `${b.id}.html`), "utf8").replace(/\r\n/g, "\n"), blockHtml(b), b.id);
  assert.deepEqual(preset.templates.map((t) => t.id), BLOCKS.map((b) => b.id));
  assert.ok(builtinPacks().find((p) => p.id === "soft-clay").dateLabel);
});

test("each block loads and draws a kind the code knows; each thing is one the code can draw", () => {
  assert.equal(templates.length, preset.templates.length);
  for (const b of BLOCKS) {
    assert.ok(loadComponent(`soft-clay:${b.id}`).pack.builtin);
    assert.ok(new RegExp(`\\b${b.id}: \\{`).test(code), `${b.id} has no drawing code`);
  }
  for (const o of preset.objects) assert.ok(new RegExp(`\\b${o.id}: function`).test(code), o.id);
  assert.ok(preset.objects.length >= 30);
  assert.equal(preset.objects[0].id, "scroll", "the neutral one comes first");
});

test("no brand name, no outside address, no image file, no weapon, no face in what draws the pictures", () => {
  const text = `${code}\n${JSON.stringify({ ...preset, places: [] })}\n${BLOCKS.map(blockHtml).join("\n")}`;
  assert.doesNotMatch(text, /\bvox\b|aardman|wallace|gromit|pixar|disney|netflix|heygen|youtube|nasa/i);
  assert.doesNotMatch(code, /https?:\/\/|\.(png|jpe?g|webp|glb|gltf)\b/);
  assert.doesNotMatch(code, /\b(eyes?|mouth|nose|smile)\b/i);
  assert.doesNotMatch(code, /\b(sword|gun|rifle|spear|cannon|blood)\b/i);
});

test("the plan's look is really there: warm lamp, clay, fingerprints, map table, glow, date label", () => {
  for (const word of ["SpotLight", "roughness: 0.84", "bumpMap", "fingerprints", "paper(v", "glowOn", "clay-date", "Fog"]) assert.ok(code.includes(word), word);
});

test("the drawing never asks for a moment that is not the frame's own", () => {
  assert.doesNotMatch(code, /Math\.random|Date\.now|performance\.now|requestAnimationFrame/);
});

test("the build puts three.js, the maps and both drawing files on the page, each once, the 3D code before the clay", () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "itv-clay-page-"));
  const engine = path.join(d, "engine");
  fs.mkdirSync(path.join(engine, "node_modules", "three", "build"), { recursive: true });
  fs.writeFileSync(path.join(engine, "node_modules", "three", "build", "three.cjs"), "'use strict';");
  const out = path.join(d, "out");
  fs.mkdirSync(out);
  assert.deepEqual(packScripts([loadComponent("soft-clay:word"), loadComponent("soft-clay:map")], out, { ITV_ENGINE_DIR: engine }), [THREE_FILE, "soft-clay-map-data.js", "soft-clay-world3d.js", "soft-clay-clay.js"]);
  fs.rmSync(d, { recursive: true, force: true });
});

test("the shared 3D code stays one file, and the 3D Explainer still has its own block", () => {
  assert.ok(!fs.existsSync(path.join(dir, "pack", "shared", "world3d.js")));
  const world = fs.readFileSync(path.join(here, "presets", "explainer-3d", "pack", "shared", "world3d.js"), "utf8");
  assert.match(world, /block: blockOf\(\{ kinds: KINDS, style: style, host: "\.x3d-root" \}\)/);
  assert.match(world, /kit: \{/);
});

test("the maps are the same bundled ones, logged in every video, never asking for a credit", () => {
  assert.equal(preset.places.length, loadPreset("archive-collage").places.length, "one list, not a copy");
  assert.equal(refusal(preset.assets[0]), null);
  assert.equal(preset.assets[0].source, "natural-earth");
  assert.ok(!fs.existsSync(path.join(dir, "pack", "shared", "map-data.js")));
});

// ---- the date label ------------------------------------------------------------------------

test("the date a sentence says, in both languages; a bare number or a time of day is not one", () => {
  assert.equal(whenIn("On March 14, 1760, he sailed.").text, "March 14 1760");
  assert.equal(whenIn("In 1492 they left.").text, "1492");
  assert.equal(whenIn("1848-ban kitört.").text, "1848");
  assert.equal(whenIn("1859 ships sailed."), null);
});

test("the label carries the last date said, starts empty, and never shows a time of day", () => {
  const sentences = [s(1, "A long time ago."), s(2, "In 1492 they left."), s(3, "The sea was calm."), s(4, "At 11:40 p.m. it rained."), s(5, "In 1500 they came home."), s(6, "Nothing more.")];
  const scenes = [{ from: "S1" }, { from: "S2" }, { from: "S3", to: "S4" }, { from: "S5" }, { from: "S6" }];
  assert.deepEqual(carriedDates(scenes, sentences), [null, "1492", "1492", "1500", "1500"]);
});

test("the label is not a template's parameter: the AI is never asked, the Shot map never pins it", () => {
  for (const t of preset.templates) assert.equal(t.params.date, undefined, t.id);
  assert.doesNotMatch(templateList(templates), /\bdate\b\??/);
  for (const b of BLOCKS) assert.ok(loadComponent(`soft-clay:${b.id}`).item.variables.some((v) => v.id === "date" && v.optional), b.id);
});

test("another preset's blocks say nothing about a date label", () => {
  assert.ok(!builtinPacks().find((p) => p.id === "night-case-file").dateLabel);
  assert.ok(!builtinPacks().find((p) => p.id === "explainer-3d").dateLabel);
});

// ---- the plan ------------------------------------------------------------------------------

test("the thing is the one the sentence names, in both languages", () => {
  assert.deepEqual(objectsIn("The ship carried a crown", preset.objects).map((o) => o.object.id), ["ship", "crown"]);
  assert.deepEqual(objectsIn("A király és a hajó", preset.objects).map((o) => o.object.id), ["king", "ship"]);
  assert.equal(ruleParams(byId.statement, [s(1, "This has no picture at all.")]).object, "scroll");
});

test("the rules fill a template only when the sentence says that thing", () => {
  const year = ruleParams(byId.year, [s(1, "In 1752 a clockmaker lived in a town.")]);
  assert.equal(year.value, 1752);
  assert.equal(year.object, "clock");
  assert.equal(ruleParams(byId.year, [s(1, "A clockmaker lived in a town.")]), null);

  const route = ruleParams(byId.route, [s(1, "The ship sailed from Lisbon to London.")]);
  assert.deepEqual([route.fromPlace, route.toPlace, route.object], ["lisbon", "london", "ship"]);
  assert.equal(ruleParams(byId.map, [s(1, "The town lay deep in Austria.")]).place, "austria");

  const board = ruleParams(byId.board, [s(1, "They carried a chest, a lantern, a book and a crown.")]);
  assert.deepEqual([board.object1, board.object2, board.object3, board.object4], ["chest", "lantern", "book", "crown"], "each item shows its own thing");

  assert.equal(ruleParams(byId.relic, [s(1, "The letter was found inside a clock.")]).object, "letter");
  assert.equal(ruleParams(byId.relic, [s(1, "Nothing was found there at all.")]), null, "no thing named, no relic");
  assert.equal(ruleParams(byId.relic, [s(1, "The letter was very long.")]), null);

  assert.ok(ruleParams(byId.talk, [s(1, 'The merchant said, "Keep this letter safe."')]));
  assert.equal(ruleParams(byId.talk, [s(1, "The merchant left at dawn.")]), null);
  assert.equal(ruleParams(byId.talk, [s(1, "Nobody in the town ever asked about it.")]), null, "only real speech");
});

test("a year is never read as a plain number, also when the year template just ran", () => {
  assert.equal(ruleParams(byId.number, [s(1, "In 1760 the town was quiet.")]), null);
  const next = ruleScene({ byId, sentences: [s(2, "In 1761 he came home to the town.")], previous: "soft-clay:year", turn: 0, first: false, title: "" });
  assert.notEqual(next.template, "number");
  assert.equal(ruleParams(byId.number, [s(1, "He kept 12 clocks in a workshop.")]).value, 12);
});

test("the prompt stays small enough for a small model and leaves the place list out", () => {
  const m = planMessages({ templates, sentences: [s(1, "The ship left.")], title: "T", language: "en", shotRules: preset.shotRules });
  const chars = m.map((x) => x.content).join("").length;
  assert.ok(chars < 6000, `${chars} characters`);
  assert.doesNotMatch(templateList(templates), /Abidjan/);
});

test("the script writer hears the preset's warm history, with dates and places said out loud", () => {
  assert.match(preset.scriptNote, /date/);
  assert.match(preset.scriptNote, /never describe a real person's looks/);
  assert.ok(preset.ideaNote);
});

test("the Shot map pins words, not the name of a thing or a place", () => {
  const row = { component: "soft-clay:route", vars: { fromPlace: "lisbon", toPlace: "london", fromLabel: "Lisbon", toLabel: "London", object: "ship" } };
  assert.deepEqual(elementsOf(row).map((e) => e.id), ["fromLabel", "toLabel"]);
});

test("the worst answers of a small model still cover every sentence, in order", () => {
  const part = [s(1, "In 1752 a clockmaker lived there."), s(2, "He kept 12 clocks."), s(3, "Is the letter still there?"), s(4, "The ship sailed from Lisbon to London."), s(5, "A crown was found.")];
  for (const answer of [null, {}, { scenes: "no" }, { scenes: [{ from: "S9", template: "year", params: {} }] }, { scenes: [{ from: "S1", to: "S5", template: "nope" }] }, { scenes: [{ from: "S1", template: "route", params: { fromPlace: "nowhere" } }, { from: "S2", template: "board", params: {} }] }]) {
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

test("the whole plan by rule passes every check, on the preset's own blocks", async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "itv-clay-plan-"));
  const sentences = [s(1, "Who wrote the lost letter?"), s(2, "In 1752 a clockmaker lived in a town."), s(3, "The town lay deep in Austria."), s(4, "The ship sailed from Lisbon to London."), s(5, "The letter was found inside a clock."), s(6, "Prices rose because the harvest failed.")];
  fs.writeFileSync(path.join(d, "sentences.json"), JSON.stringify(sentences));
  fs.writeFileSync(path.join(d, "script.md"), "# T\n\n## OPEN\n\nx\n");
  await makeTemplateScenes({ llm: null, projectDir: d, preset, title: "The lost letter" });
  const table = JSON.parse(fs.readFileSync(path.join(d, "scenes.json"), "utf8"));
  assert.equal(table.planner.preset, "soft-clay");
  assert.deepEqual(table.scenes.map((x) => x.template), ["title", "year", "map", "route", "relic", "cause"]);
  for (const sc of table.scenes) {
    assert.ok(sc.component.startsWith("soft-clay:"));
    assert.equal(sc.vars.date, undefined, "only the build adds the date");
  }
  fs.rmSync(d, { recursive: true, force: true });
});
