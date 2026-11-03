// The Night Case File preset (docs/BUILD_PLAN.md phase 7, DECISIONS 158): its contract, its own pack,
// words that never reach the screen, the light flash and its sound, the fact-check it promises.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkPreset, listPresets, loadPreset, presetCard, presetLook, resolveTemplates, TEMPLATES_MAX, TEMPLATES_MIN } from "./presets/index.mjs";
import { registerPacks } from "./packs/index.mjs";
import { cleanParams, makeTemplateScenes, mendPart, neverIn, planMessages, ruleParams, ruleScene, whenIn } from "./gates/scenes/templates.mjs";
import { PACES, PACK_COMPONENTS } from "./gates/scenes/roles.mjs";
import { elementsOf } from "./shots/index.mjs";
import { indexHtml, loadComponent, packScripts, soundPlan } from "./gates/build/assemble.mjs";
import { HIT_SECONDS, synthHit } from "./providers/music/synth.mjs";
import { refusal } from "./assets/license.mjs";
import { buildCard } from "./gates/render/publish.mjs";
import { createProject } from "./project.mjs";
import { blockHtml, BLOCKS } from "../scripts/make-night-blocks.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "presets", "night-case-file");
const code = fs.readFileSync(path.join(dir, "pack", "shared", "nightfile.js"), "utf8");
const mapCode = fs.readFileSync(path.join(here, "presets", "archive-collage", "pack", "shared", "map-data.js"), "utf8");
const preset = loadPreset("night-case-file");
await registerPacks(null);
const templates = resolveTemplates(preset);
const byId = Object.fromEntries(templates.map((t) => [t.id, t]));
const s = (n, text, dur = 3) => ({ id: `S${n}`, text, dur, start: (n - 1) * dur, end: n * dur, words: text.split(" ").length });

// The drawing code's plain functions and the maps, without a page.
const page = {};
new Function("window", "document", `${mapCode}\n${code}`)(page, {});
const { OBJECTS, KINDS, FLASH_AT, FLASH_GAPS, SKY_LIFT, flashAt, gait, cameraAt, layerAt, DEPTH, project, viewForPlace, viewForRoute, findPlace } = page.ITVNight;

test("the preset keeps the contract and is offered on the Script engine", () => {
  assert.deepEqual(checkPreset(preset), []);
  assert.ok(preset.templates.length >= TEMPLATES_MIN && preset.templates.length <= TEMPLATES_MAX);
  assert.equal(preset.engine, "script");
  assert.ok(listPresets().some((p) => p.id === "night-case-file"));
  assert.deepEqual(presetCard(preset).defaults, { broll: false, research: true, mood: "dark" });
  assert.equal(presetCard(preset).factChecked, true);
  assert.equal(presetCard(preset).never, undefined, "the list stays out of the card");
  assert.equal(presetCard(preset).places, undefined);
  assert.ok(PACES[preset.shotRules.pacing]);
  assert.equal(presetCard(loadPreset("archive-collage")).factChecked, undefined, "only this one promises it");
});

test("the plan's look: dark blue-black, one accent, only OFL fonts the app ships", () => {
  const fonts = JSON.parse(fs.readFileSync(path.join(here, "..", "library", "fonts.json"), "utf8"));
  assert.equal(fonts.license, "OFL-1.1");
  const families = Object.fromEntries(fonts.families.map((f) => [f.family, f]));
  for (const f of Object.values(preset.tokens.fonts)) {
    assert.ok(families[f], f);
    assert.ok(families[f].subsets["latin-ext"], `${f} has the Hungarian letters`);
  }
  assert.equal(preset.tokens.appearance, "dark");
  const [r, g, b] = preset.tokens.colors.background.match(/[0-9a-f]{2}/g).map((x) => parseInt(x, 16));
  assert.ok(b > g && g > r && b < 40, "dark, and blue before black");
  const look = presetLook(preset, { theme: { bg: "#ffffff" }, families: ["Inter"], light: true, motion: { camera: { move: "push" }, captions: { style: "plain" } } });
  assert.equal(look.theme.bg, preset.tokens.colors.background);
  assert.equal(look.light, false, "captions know it is dark");
  assert.equal(look.motion.camera.move, "off", "the scene owns its camera");
  assert.deepEqual(look.motion.captions, { style: "plain" });
});

test("every template is drawn by the preset's own pack, with no block missing", () => {
  assert.equal(templates.length, preset.templates.length);
  for (const t of templates) {
    assert.equal(t.draw.component, `night-case-file:${t.id}`);
    assert.ok(fs.existsSync(path.join(dir, "pack", "blocks", `${t.id}.html`)), t.id);
  }
});

test("the committed files are what make-night-blocks writes", () => {
  for (const b of BLOCKS) assert.equal(fs.readFileSync(path.join(dir, "pack", "blocks", `${b.id}.html`), "utf8").replace(/\r\n/g, "\n"), blockHtml(b), b.id);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "pack", "pack.json"), "utf8"));
  assert.deepEqual(manifest.blocks.map((b) => b.id), BLOCKS.map((b) => b.id));
  assert.deepEqual(preset.templates.map((t) => t.id), BLOCKS.map((b) => b.id));
});

test("each block loads and draws a kind the code knows; each object is one the code can draw", () => {
  for (const b of BLOCKS) {
    assert.ok(loadComponent(`night-case-file:${b.id}`).pack.builtin, "a preset's own pack");
    assert.ok(KINDS.includes(b.id), `${b.id} has no drawing code`);
  }
  assert.deepEqual(preset.objects.map((o) => o.id).sort(), [...OBJECTS].sort(), "the list and the drawings are the same things");
  assert.equal(preset.objects[0].id, "folder", "the neutral one comes first: a case folder");
});

test("no brand name, no outside address, no image file, no weapon, no face in what draws the pictures", () => {
  const text = `${code}\n${JSON.stringify({ ...preset, places: [], never: {} })}\n${BLOCKS.map(blockHtml).join("\n")}`;
  assert.doesNotMatch(text.replace(/naturalearthdata\.com|Natural Earth/g, ""), /\bvox\b|disney|pixar|netflix|heygen|youtube|nasa\b/i);
  assert.doesNotMatch(code, /https?:\/\//);
  assert.doesNotMatch(code, /\.png"|\.jpg"|new Image/);
  for (const id of OBJECTS) assert.doesNotMatch(id, /gun|rifle|pistol|knife|blade|bomb|sword|weapon|blood/);
  // nothing the drawing code offers is named after one either, and its figure draws no eyes
  assert.doesNotMatch(code.replace(/\/\/.*$/gm, ""), /\b(gun|rifle|pistol|knife|bomb|sword|blood|corpse|eye|eyes|mouth)\b/i);
});

test("the words the plan forbids are found whole, in both languages, and only those", () => {
  const n = preset.never;
  for (const t of ["He drew a gun.", "A Knife lay there.", "Blood on the floor.", "They killed him.", "Fegyvert rántott.", "A gyilkosság után.", "Véres volt."]) assert.ok(neverIn(t, n), t);
  for (const t of ["The begun work went on.", "The skill of the clerk.", "He bought a ticket.", "Késő este volt.", "A vérszegény fiú."]) assert.ok(!neverIn(t, n), t);
  assert.equal(neverIn("A gun", undefined), false, "a preset with no list keeps every word");
});

test("a sentence about violence gets a flash and no word of it on screen", () => {
  const scene = (text, previous = null) => ruleScene({ byId, sentences: [s(1, text)], previous, turn: 0, first: false, title: "" });
  for (const text of ["He pulled out a gun and fired twice.", "The killer was never found.", "She was stabbed in the hallway."]) {
    const r = scene(text);
    assert.equal(r.template, "flash", text);
    assert.equal(r.vars.line, undefined, "a line naming it stays out");
  }
  const sudden = scene("Suddenly every light in the street went out.");
  assert.equal(sudden.template, "flash");
  assert.ok(sudden.vars.line, "a sudden thing with clean words keeps them");
});

test("two violent sentences in a row: never two flashes, and still no word of it on screen", () => {
  const r = ruleScene({ byId, sentences: [s(1, "The murder weapon was a knife.")], previous: "night-case-file:flash", turn: 0, first: false, title: "" });
  assert.notEqual(r.component, "night-case-file:flash");
  assert.equal(r.template, "room", "the template that needs no words");
  assert.ok(!neverIn(JSON.stringify(Object.values(r.vars)), preset.never));
});

test("a title or an AI's words that name it never reach the screen", () => {
  const first = ruleScene({ byId, sentences: [s(1, "It began with one quiet evening.")], previous: null, turn: 0, first: true, title: "The gun in the lake" });
  assert.equal(first.template, "title");
  assert.ok(!neverIn(first.vars.headline, preset.never));
  assert.equal(cleanParams(byId.statement, { line1: "He drew a gun", line2: "and ran" }, [s(1, "He drew a gun and ran.")]), null, "required: another template");
  const flash = cleanParams(byId.flash, { line: "The gun went off", object: "folder" }, [s(1, "The gun went off.")]);
  assert.equal(flash.line, undefined, "optional: left out");
  const part = [s(1, "He drew a gun and ran.")];
  const out = mendPart({ answer: { scenes: [{ from: "S1", template: "statement", params: { line1: "He drew a gun", line2: "and ran" } }] }, part, templates, pace: preset.shotRules.pacing });
  assert.equal(out.scenes[0].template, "flash");
  // what a scene shows is the words of its vars: no object list holds a weapon either
  assert.equal(cleanParams(byId.evidence, { object: "knife" }, [s(1, "A note lay on the desk.")]).object, "letter");
});

test("a stamp says what the sentence says: a date, a time, a year, and a place when named", () => {
  assert.equal(whenIn("On March 14, 1985, in Paris.").text, "March 14 1985");
  assert.equal(whenIn("It was 3 June 1990 then.").text, "3 June 1990");
  assert.equal(whenIn("At 11:40 p.m. a car stopped.").text, "11:40 PM");
  assert.equal(whenIn("In 1985 the shop closed.").text, "1985");
  assert.equal(whenIn("1985. március 14-én történt.").text, "1985. március 14");
  assert.equal(whenIn("About 1985 ships passed."), null, "a number is not a year");
  const a = ruleParams(byId.stamp, [s(1, "On March 14, 1985, in Paris, the shop closed early.")]);
  assert.deepEqual([a.when, a.where, a.line], ["March 14 1985", "Paris", "the shop closed early"], "the line adds to the stamp");
  const b = ruleParams(byId.stamp, [s(1, "At 11:40 p.m. the neighbor heard a noise.")]);
  assert.deepEqual([b.when, b.line], ["11:40 PM", "the neighbor heard a noise"]);
  assert.equal(ruleParams(byId.stamp, [s(1, "The shop closed early.")]), null);
  assert.equal(cleanParams(byId.stamp, { when: "March 9 1999" }, [s(1, "It was March 14, 1985.")]), null, "a date the voice does not say");
  assert.equal(cleanParams(byId.stamp, { when: "March 14" }, [s(1, "It was March 14, 1985.")]).when, "March 14");
});

test("the rules fill a template only when the sentence says that thing", () => {
  const scene = (text) => ruleScene({ byId, sentences: [s(1, text)], previous: null, turn: 0, first: false, title: "" });
  const list = scene("Police found a receipt, a key and a torn note.");
  assert.equal(list.template, "board");
  assert.deepEqual([list.vars.item1, list.vars.item2, list.vars.item3], ["receipt", "key", "torn note"]);
  const thing = scene("A fingerprint was found on the glass.");
  assert.deepEqual([thing.template, thing.vars.object], ["evidence", "fingerprint"]);
  assert.equal(scene("She drove from London to Paris.").template, "route");
  assert.equal(scene("The trail ends in Egypt.").template, "map");
  assert.equal(scene("She walked home along the dark road.").template, "street");
  assert.equal(scene("Inside the office nothing had moved.").template, "room");
  assert.equal(scene("Why did nobody call?").template, "question");
  assert.equal(scene("It cost 40 dollars.").template, "number");
  assert.equal(ruleParams(byId.number, [s(1, "At 11:40 p.m. a car stopped.")]), null, "a time is not a number that matters");
  assert.equal(ruleParams(byId.number, [s(1, "On March 14 the shop closed.")]), null, "a date neither");
  assert.equal(ruleParams(byId.number, [s(1, "At 11:40 p.m. 40 people came.")]).value, 40, "what else it says still counts");
  assert.ok(["statement", "highlight", "word"].includes(scene("Nothing here is special at all.").template));
  assert.equal(ruleParams(byId.statement, [s(1, "Nothing here is special at all.")]).object, "folder", "the neutral thing");
});

test("a flash is safe to look at and lands with its sound", () => {
  const block = BLOCKS.find((b) => b.id === "flash");
  assert.equal(block.sound.at, FLASH_AT, "the sound on the light");
  assert.ok(FLASH_AT + FLASH_GAPS.at(-1) < 2, "inside the shortest shot");
  // at most three flashes in any one second
  for (let from = 0; from < 3; from += 0.05) assert.ok(FLASH_GAPS.map((g) => FLASH_AT + g).filter((x) => x >= from && x < from + 1).length <= 3);
  assert.ok(SKY_LIFT <= 0.15, "the whole frame stays dark");
  assert.equal(flashAt(0), 0, "dark before it");
  assert.ok(flashAt(FLASH_AT) > 0.9);
  assert.ok(flashAt(FLASH_AT + FLASH_GAPS.at(-1) + 1) < 0.01, "and dark again");
  assert.deepEqual(flashAt(0.7), flashAt(0.7), "the same on every seek");
});

test("the sound is made by code: the same bytes every time, short, ending in silence", () => {
  const a = synthHit();
  assert.deepEqual(a, synthHit());
  assert.equal(a.toString("ascii", 0, 4), "RIFF");
  assert.equal((a.length - 44) / 4, Math.round(HIT_SECONDS * 44100));
  let peak = 0;
  for (let i = 44; i < a.length; i += 2) peak = Math.max(peak, Math.abs(a.readInt16LE(i)));
  assert.ok(peak > 3000, `${peak}`);
  assert.ok(Math.abs(a.readInt16LE(a.length - 2)) < 50, "no click at the end");
});

test("the build plays the sound on the flash's own second, and only there", () => {
  const scenes = [{ component: "night-case-file:title" }, { component: "night-case-file:flash" }, { component: "night-case-file:word" }];
  const comps = new Map(scenes.map((x) => [x.component, loadComponent(x.component)]));
  const plan = soundPlan(scenes, comps, [{ start: 0, duration: 3 }, { start: 3, duration: 3 }, { start: 6, duration: 3 }]);
  assert.deepEqual(plan, [{ kind: "hit", file: "sounds/hit.wav", start: 3 + FLASH_AT, seconds: HIT_SECONDS }]);
  const html = indexHtml({ width: 1920, height: 1080, total: 9, theme: {}, look: { theme: {} }, mounts: [], sounds: plan });
  assert.match(html, /<audio id="sound-1" src="sounds\/hit\.wav" data-start="3\.5"/);
  assert.equal(soundPlan([{ component: "archive-collage:word" }], new Map([["archive-collage:word", loadComponent("archive-collage:word")]]), [{ start: 0, duration: 3 }]).length, 0, "no other preset gets a sound");
  assert.doesNotMatch(indexHtml({ width: 1920, height: 1080, total: 9, theme: {}, look: { theme: {} }, mounts: [] }), /sound-1/);
});

test("feet stay planted while a foot stands, and the two feet take turns", () => {
  let last = null;
  let still = 0;
  for (let dist = 0; dist < 900; dist += 3) {
    const feet = gait(dist, 60);
    assert.ok(feet.some((f) => f.lift === 0), `one foot is always down at ${dist}`);
    if (last) {
      feet.forEach((f, i) => {
        if (f.lift === 0 && last[i].lift === 0) {
          assert.equal(f.x, last[i].x, "a foot on the ground does not slide");
          still++;
        }
      });
    }
    last = feet;
  }
  assert.ok(still > 200);
  assert.deepEqual(gait(333, 60), gait(333, 60), "from the distance alone");
});

test("the far layers really move less, under one slow move", () => {
  for (const seed of [1, 7, 12345, 99999]) {
    const a = cameraAt(seed, 0);
    const b = cameraAt(seed, 1);
    const travel = Math.hypot(b.x - a.x, b.y - a.y);
    assert.ok(travel > 10 && travel < 50, `slow: ${travel}`);
    const move = (depth) => Math.hypot(layerAt(b, depth).x - layerAt(a, depth).x, layerAt(b, depth).y - layerAt(a, depth).y);
    assert.ok(move(DEPTH.figure) > move(DEPTH.far) * 2);
  }
});

test("the maps are the same bundled ones, logged in every video, never asking for a credit", () => {
  assert.equal(preset.places.length, loadPreset("archive-collage").places.length, "one list, not a copy");
  assert.equal(refusal(preset.assets[0]), null);
  assert.equal(preset.assets[0].source, "natural-earth");
  assert.ok(!fs.existsSync(path.join(dir, "pack", "shared", "map-data.js")), "no second copy of the maps");
  const inside = ([x, y]) => x > 30 && x < 1890 && y > 30 && y < 1050;
  const france = findPlace("france");
  assert.ok(inside(project(viewForPlace(france), france.lon, france.lat)));
  const [a, b] = [findPlace("london"), findPlace("mumbai")];
  const v = viewForRoute(a, b);
  assert.ok(inside(project(v, a.lon, a.lat)) && inside(project(v, b.lon, b.lat)));
});

test("the build puts the maps first, then the drawing code, and no three.js", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "itv-night-page-"));
  assert.deepEqual(packScripts([loadComponent("night-case-file:word"), loadComponent("night-case-file:map")], out), ["night-case-file-map-data.js", "night-case-file-nightfile.js"]);
  assert.ok(fs.statSync(path.join(out, "night-case-file-map-data.js")).size > 100000);
  fs.rmSync(out, { recursive: true, force: true });
});

test("the prompt stays small, and tells the AI what never to name", () => {
  const text = planMessages({ templates, sentences: [s(1, "x")], pace: "balanced" }).map((m) => m.content).join("\n");
  assert.doesNotMatch(text, /Zimbabwe|Ouagadougou/);
  assert.doesNotMatch(text, /gyilkos|strangle/, "the long list of words stays out");
  assert.match(text, /Never name a weapon or an injury/);
  assert.ok(text.length < 7000, `${text.length} characters`);
});

test("the script writer is told the rules of the preset", () => {
  assert.match(preset.scriptNote, /Never describe a weapon, blood/);
  assert.match(preset.scriptNote, /facts the research supports/);
  assert.match(preset.scriptNote, /date and the place/);
  assert.match(preset.shotRules.characters, /Never a weapon, blood or violence/);
});

test("the Shot map says the camera is the scene's own, and pins words, not a place's id or a thing", () => {
  assert.equal(PACK_COMPONENTS.get("night-case-file:map").camera, "One slow push, layers in parallax");
  assert.deepEqual(elementsOf({ component: "night-case-file:stamp", vars: { when: "March 14", where: "Paris", line: "The shop closed", object: "folder" } }).map((e) => e.id), ["when", "where", "line"]);
  assert.deepEqual(elementsOf({ component: "night-case-file:flash", vars: { object: "folder" } }), []);
});

test("the worst answers of a small model still cover every sentence, in order", () => {
  const part = [s(1, "The story starts in Egypt."), s(2, "He drew a gun."), s(3, "Is anyone there?"), s(4, "On March 14, 1985, it ended."), s(5, "The knife was gone.")];
  for (const answer of [null, {}, { scenes: "no" }, { scenes: [{ from: "S9", template: "map", params: {} }] }, { scenes: [{ from: "S1", to: "S5", template: "nope" }] }, { scenes: [{ from: "S1", to: "S5", template: "flash", params: { line: "a gun" } }] }]) {
    const r = mendPart({ answer, part, templates, pace: preset.shotRules.pacing });
    const ids = r.scenes.flatMap((x) => {
      const from = Number(x.from.slice(1));
      const to = Number((x.to ?? x.from).slice(1));
      return Array.from({ length: to - from + 1 }, (_, i) => from + i);
    });
    assert.deepEqual(ids, [1, 2, 3, 4, 5], JSON.stringify(answer));
    r.scenes.forEach((x, i) => {
      assert.notEqual(x.component, r.scenes[i - 1]?.component);
      assert.ok(!neverIn(Object.values(x.vars).join(" "), preset.never), JSON.stringify(x.vars));
    });
  }
});

test("the whole plan by rule passes every check, on the preset's own blocks, with nothing forbidden on screen", async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "itv-night-plan-"));
  const sentences = [s(1, "What happened in the house on the hill?"), s(2, "On March 14, 1985, in Paris, a shop closed early."), s(3, "She drove from Paris to Berlin that same night."), s(4, "He drew a gun in the doorway."), s(5, "Police found a receipt, a key and a torn note."), s(6, "A fingerprint was found on the glass.")];
  fs.writeFileSync(path.join(d, "sentences.json"), JSON.stringify(sentences));
  fs.writeFileSync(path.join(d, "script.md"), "# T\n\n## OPEN\n\nx\n");
  await makeTemplateScenes({ llm: null, projectDir: d, preset, title: "What happened in the house on the hill?" });
  const table = JSON.parse(fs.readFileSync(path.join(d, "scenes.json"), "utf8"));
  assert.equal(table.planner.preset, "night-case-file");
  assert.deepEqual(table.scenes.map((x) => x.template), ["title", "stamp", "route", "flash", "board", "evidence"]);
  for (const sc of table.scenes) {
    assert.ok(sc.component.startsWith("night-case-file:"));
    assert.ok(!neverIn(Object.values(sc.vars).join(" "), preset.never));
  }
  fs.rmSync(d, { recursive: true, force: true });
});

test("the card says when a fact-checked style has nothing to show, and shows the sources when it has", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "itv-night-card-"));
  const make = (preset) => createProject({ projectsDir: root, title: `T ${preset}`, language: "en", identity: "t", recipe: { preset } }).dir;
  const d = make("night-case-file");
  assert.deepEqual(buildCard(d, path.join(d, "v.mp4"), {}).researchSources, { grounded: false, sources: [], flags: [], unchecked: true });
  fs.writeFileSync(path.join(d, "research.json"), JSON.stringify({ state: "approved", grounded: true, sources: [{ title: "A source", url: "https://example.org/page" }], claims: [] }));
  const card = buildCard(d, path.join(d, "v.mp4"), {});
  assert.equal(card.researchSources.sources[0].url, "https://example.org/page");
  assert.equal(card.researchSources.unchecked, undefined);
  const other = make("archive-collage");
  assert.equal(buildCard(other, path.join(other, "v.mp4"), {}).researchSources, undefined, "another style promises nothing");
  fs.rmSync(root, { recursive: true, force: true });
});
