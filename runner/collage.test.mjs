// The Archive Collage preset (docs/BUILD_PLAN.md phase 6, DECISIONS 155): its contract, its own
// pack, its maps and places, the parallax, the rare alert, and a plan a dead AI still fills.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkPreset, listPresets, loadPreset, presetCard, presetLook, resolveTemplates, TEMPLATES_MAX, TEMPLATES_MIN } from "./presets/index.mjs";
import { registerPacks } from "./packs/index.mjs";
import { cleanParams, makeTemplateScenes, mendPart, placesIn, planMessages, ruleParams, ruleScene, spaceRare } from "./gates/scenes/templates.mjs";
import { PACES, PACK_COMPONENTS } from "./gates/scenes/roles.mjs";
import { elementsOf } from "./shots/index.mjs";
import { loadComponent, packScripts } from "./gates/build/assemble.mjs";
import { logAsset, readLedger, refusal } from "./assets/license.mjs";
import { blockHtml, BLOCKS } from "../scripts/make-collage-blocks.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "presets", "archive-collage");
const code = fs.readFileSync(path.join(dir, "pack", "shared", "collage.js"), "utf8");
const mapCode = fs.readFileSync(path.join(dir, "pack", "shared", "map-data.js"), "utf8");
const preset = loadPreset("archive-collage");
await registerPacks(null);
const templates = resolveTemplates(preset);
const byId = Object.fromEntries(templates.map((t) => [t.id, t]));
const s = (n, text, dur = 3) => ({ id: `S${n}`, text, dur, start: (n - 1) * dur, end: n * dur, words: text.split(" ").length });

// The drawing code's plain functions and the maps, without a page.
const page = {};
new Function("window", "document", `${mapCode}\n${code}`)(page, {});
const { cameraAt, layerAt, DEPTH, pop, project, viewForPlace, viewForRoute, findPlace, OBJECTS, KINDS } = page.ITVCollage;
const WORLD = page.ITV_WORLD;

test("the preset keeps the contract and is offered on the Script engine", () => {
  assert.deepEqual(checkPreset(preset), []);
  assert.ok(preset.templates.length >= TEMPLATES_MIN && preset.templates.length <= TEMPLATES_MAX);
  assert.equal(preset.engine, "script");
  assert.ok(listPresets().some((p) => p.id === "archive-collage"));
  assert.deepEqual(presetCard(preset).defaults, { broll: false });
  assert.equal(preset.tokens.from, undefined, "its own palette, not the channel's Brand");
  assert.ok(PACES[preset.shotRules.pacing]);
});

test("the plan's look: aged paper, one hot accent, one rare second one, only OFL fonts the app ships", () => {
  const fonts = JSON.parse(fs.readFileSync(path.join(here, "..", "library", "fonts.json"), "utf8"));
  assert.equal(fonts.license, "OFL-1.1");
  const families = Object.fromEntries(fonts.families.map((f) => [f.family, f]));
  for (const f of Object.values(preset.tokens.fonts)) {
    assert.ok(families[f], f);
    assert.ok(families[f].subsets["latin-ext"], `${f} has the Hungarian letters`);
  }
  assert.equal(preset.tokens.appearance, "light");
  const brand = { theme: { bg: "#000000" }, families: ["Inter"], light: false, motion: { camera: { move: "push" }, captions: { style: "plain" } } };
  const look = presetLook(preset, brand);
  assert.equal(look.theme.bg, preset.tokens.colors.background);
  assert.equal(look.motion.camera.move, "off", "the scene owns its camera");
  assert.deepEqual(look.motion.captions, { style: "plain" });
  // the second accent appears in one template only
  assert.equal(code.match(/var\(--accent\)/g).length, 2, "both on the date stamp");
});

test("every template is drawn by the preset's own pack, with no block missing", () => {
  assert.equal(templates.length, preset.templates.length);
  for (const t of templates) {
    assert.equal(t.draw.component, `archive-collage:${t.id}`);
    assert.ok(fs.existsSync(path.join(dir, "pack", "blocks", `${t.id}.html`)), t.id);
  }
});

test("the committed files are what make-collage-blocks writes", () => {
  for (const b of BLOCKS) assert.equal(fs.readFileSync(path.join(dir, "pack", "blocks", `${b.id}.html`), "utf8").replace(/\r\n/g, "\n"), blockHtml(b), b.id);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "pack", "pack.json"), "utf8"));
  assert.deepEqual(manifest.blocks.map((b) => b.id), BLOCKS.map((b) => b.id));
  assert.deepEqual(preset.templates.map((t) => t.id), BLOCKS.map((b) => b.id));
  assert.deepEqual(manifest.script, ["shared/map-data.js", "shared/collage.js"]);
});

test("each block loads and draws a kind the code knows; each object is one the code can draw", () => {
  for (const b of BLOCKS) {
    assert.ok(loadComponent(`archive-collage:${b.id}`).pack.builtin, "a preset's own pack");
    assert.ok(KINDS.includes(b.id), `${b.id} has no drawing code`);
  }
  assert.deepEqual(preset.objects.map((o) => o.id).sort(), [...OBJECTS].sort(), "the list and the drawings are the same things");
  assert.equal(preset.objects[0].id, "figure", "the neutral one comes first: a generic figure");
});

test("no brand name, no outside address, no image file, no weapon in what draws the pictures", () => {
  const text = `${code}\n${JSON.stringify({ ...preset, places: [] })}\n${BLOCKS.map(blockHtml).join("\n")}`;
  assert.doesNotMatch(text.replace(/naturalearthdata\.com|Natural Earth/g, ""), /\bvox\b|disney|pixar|netflix|heygen|youtube|nasa\b/i);
  assert.doesNotMatch(code, /https?:\/\//);
  assert.doesNotMatch(code, /\.png"|\.jpg"|new Image/);
  assert.doesNotMatch(OBJECTS.join(" "), /gun|rifle|bomb|sword|weapon/);
});

test("the maps are Natural Earth, logged in every video, never asking for a credit", () => {
  assert.equal(preset.assets.length, 1);
  const asset = preset.assets[0];
  assert.equal(refusal(asset), null);
  assert.equal(asset.source, "natural-earth");
  assert.equal(asset.license, "pd");
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "itv-collage-ledger-"));
  logAsset(d, asset);
  logAsset(d, asset);
  assert.equal(readLedger(d).assets.length, 1, "built twice, logged once");
  fs.rmSync(d, { recursive: true, force: true });
  assert.ok(fs.readFileSync(path.join(here, "..", "THIRD-PARTY-NOTICES.md"), "utf8").includes("Natural Earth"));
  assert.ok(mapCode.length < 400 * 1024, "small enough for every page");
});

test("every place a plan can name is on the maps, in a sensible spot", () => {
  assert.ok(preset.places.length > 300);
  const ids = new Set(preset.places.map((p) => p.id));
  assert.equal(ids.size, preset.places.length, "unique");
  for (const p of preset.places) assert.ok(findPlace(p.id), `${p.id} has no shape or point`);
  for (const c of WORLD.countries) {
    assert.ok(c.lon >= -180 && c.lon <= 180 && c.lat >= -90 && c.lat <= 90, c.id);
    assert.ok(c.rings.length >= 1);
  }
  const france = findPlace("france");
  assert.ok(france.box[0] > -10 && france.box[2] < 12, "France's view is France, not its overseas parts");
});

test("a place stays inside the frame, whichever is asked", () => {
  const inside = ([x, y]) => x > 30 && x < 1890 && y > 30 && y < 1050;
  for (const id of ["france", "united-states-of-america", "egypt", "hungary", "japan", "australia", "paris", "singapore"]) {
    const p = findPlace(id);
    assert.ok(inside(project(viewForPlace(p), p.lon, p.lat)), id);
  }
  for (const [a, b] of [["london", "mumbai"], ["paris", "new-york"], ["tokyo", "sydney"], ["cape-town", "oslo"], ["hungary", "egypt"]]) {
    const A = findPlace(a);
    const B = findPlace(b);
    const v = viewForRoute(A, B);
    assert.ok(inside(project(v, A.lon, A.lat)) && inside(project(v, B.lon, B.lat)), `${a} to ${b}`);
  }
});

test("a name is found with its capital, its endings, in order, and only whole", () => {
  const ids = (t) => placesIn(t, preset.places).map((x) => x.place.id);
  assert.deepEqual(ids("A ship sailed from London to Mumbai."), ["london", "mumbai"]);
  assert.deepEqual(ids("France's army crossed into Spain."), ["france", "spain"]);
  assert.deepEqual(ids("The United States bought it."), ["united-states-of-america"]);
  assert.deepEqual(ids("New York grew fast."), ["new-york"]);
  assert.deepEqual(ids("Párizsban és Magyarországon is."), ["paris", "hungary"]);
  assert.deepEqual(ids("Angliából indult."), ["united-kingdom"]);
  assert.deepEqual(ids("Reading a turkey recipe in china."), [], "no capital, no place");
  assert.deepEqual(ids("Malibu is not Mali's."), ["mali"], "a longer word is not the name inside it");
  assert.deepEqual(ids("Man is a curious animal."), [], "a word that is mostly not a place stays out of the rule");
});

test("the rules fill a template only when the sentence says that thing", () => {
  const year = ruleParams(byId.year, [s(1, "Work on the canal began in 1859 and took ten years.")]);
  assert.equal(year.value, 1859);
  assert.equal(ruleParams(byId.year, [s(1, "About 1859 ships passed through.")]), null, "a number is not a year");
  const route = ruleParams(byId.route, [s(1, "A ship sailed from London to Mumbai.")]);
  assert.deepEqual([route.fromPlace, route.toPlace, route.fromLabel, route.toLabel], ["london", "mumbai", "London", "Mumbai"]);
  assert.equal(ruleParams(byId.route, [s(1, "A ship left London at dawn.")]), null);
  assert.equal(ruleParams(byId.map, [s(1, "The story starts in Egypt.")]).place, "egypt");
  assert.equal(ruleParams(byId.map, [s(1, "The story starts here.")]), null);
  assert.ok(ruleParams(byId.alert, [s(1, "The crisis came in one night.")]));
  assert.equal(ruleParams(byId.alert, [s(1, "The ship came in one night.")]), null);
  assert.equal(ruleParams(byId.statement, [s(1, "Nothing here has a picture.")]).object, "figure", "the neutral cutout");
});

test("a sentence's own template comes before the rotation, the year before the number, two places before one", () => {
  const scene = (text) => ruleScene({ byId, sentences: [s(1, text)], previous: null, turn: 0, first: false, title: "" }).template;
  assert.equal(scene("Would anyone even notice?"), "question");
  assert.equal(scene("It began in 1859 with 200 men."), "year");
  assert.equal(scene("A ship sailed from London to Mumbai."), "route");
  assert.equal(scene("The story starts in Egypt."), "map");
  assert.equal(scene("About 40% of the distance is gone."), "percent");
  assert.equal(scene("That trip took 83 days."), "number");
  assert.ok(["statement", "highlight", "word"].includes(scene("The sky is dark.")));
});

test("the alert is not a rule's first choice, so one sentence never floods by itself", () => {
  assert.notEqual(ruleScene({ byId, sentences: [s(1, "The crisis came.")], previous: null, turn: 0, first: false, title: "" }).template, "alert");
});

const plain = (n, template = "statement", vars = { line1: "a b", line2: "c" }) => ({ from: `S${n}`, component: `archive-collage:${template}`, vars, template });

test("the alert stays rare: a rule gives one where the words say so, and at most one per 16 scenes", () => {
  const texts = Array.from({ length: 40 }, (_, i) => s(i + 1, i % 5 === 2 ? "The crisis hit the whole city." : "The sky is dark today."));
  const scenes = texts.map((x, i) => plain(i + 1, i % 2 ? "highlight" : "statement"));
  const out = spaceRare(scenes, { templates, sentences: texts });
  const at = out.flatMap((sc, i) => (sc.template === "alert" ? [i] : []));
  assert.ok(at.length >= 2, "it happens");
  for (let i = 1; i < at.length; i++) assert.ok(at[i] - at[i - 1] >= 16, `${at}`);
  for (const i of at) assert.ok(texts[i].text.includes("crisis"), "only where the words say so");
});

test("an AI that floods every scene is cut back to the same rule, and no scene is lost", () => {
  const texts = Array.from({ length: 20 }, (_, i) => s(i + 1, "The city slowly went dark again."));
  const scenes = texts.map((x, i) => (i % 2 ? plain(i + 1, "alert", { line: "a b c", object: "figure" }) : plain(i + 1)));
  const out = spaceRare(scenes, { templates, sentences: texts });
  assert.equal(out.length, scenes.length);
  assert.deepEqual(out.map((x) => x.from), scenes.map((x) => x.from));
  assert.ok(out.filter((x) => x.template === "alert").length <= 2);
  out.forEach((x, i) => assert.notEqual(x.component, out[i - 1]?.component, `scene ${i}`));
});

test("a place the maps do not have never reaches the build", () => {
  const span = [s(1, "A ship sailed to Atlantis and to Egypt.")];
  assert.equal(cleanParams(byId.map, { place: "Atlantis" }, span).place, "egypt", "the one the sentence says");
  assert.equal(cleanParams(byId.map, { place: "Atlantis" }, [s(1, "A ship sailed on.")]), null, "none: another template");
  assert.equal(cleanParams(byId.map, { place: "FRANCE" }, span).place, "france", "any way an AI writes it");
  assert.equal(cleanParams(byId.route, { fromPlace: "Paris", toPlace: "Rome" }, span).toPlace, "rome");
  const both = cleanParams(byId.route, {}, [s(1, "From Egypt to Spain.")]);
  assert.deepEqual([both.fromPlace, both.toPlace], ["egypt", "spain"]);
});

test("the prompt stays small: it never lists the places", () => {
  const text = planMessages({ templates, sentences: [s(1, "x")], pace: "balanced" }).map((m) => m.content).join("\n");
  assert.doesNotMatch(text, /Zimbabwe|Ouagadougou/);
  assert.match(text, /a country or big city the sentence names/);
  assert.ok(text.length < 7000, `${text.length} characters`);
});

test("layers at different depths really move differently, under one slow drift", () => {
  const order = [DEPTH.paper, DEPTH.back, DEPTH.map, DEPTH.cutout, DEPTH.words, DEPTH.front];
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  for (const seed of [1, 7, 12345, 99999]) {
    const a = cameraAt(seed, 0);
    const b = cameraAt(seed, 1);
    const travel = Math.hypot(b.x - a.x, b.y - a.y);
    assert.ok(travel > 15 && travel < 70, `slow: ${travel}`);
    const move = (depth) => Math.hypot(layerAt(b, depth).x - layerAt(a, depth).x, layerAt(b, depth).y - layerAt(a, depth).y);
    assert.ok(move(DEPTH.front) > move(DEPTH.cutout) * 1.5);
    assert.ok(move(DEPTH.cutout) > move(DEPTH.paper) * 3);
    // it never shows the paper's edge: 120 and 70 pixels of room
    assert.ok(Math.abs(layerAt(a, DEPTH.paper).x) < 100 && Math.abs(layerAt(b, DEPTH.paper).y) < 60);
  }
  assert.deepEqual(cameraAt(5, 0.3), cameraAt(5, 0.3), "the same frame on every seek");
});

test("a pop-up overshoots slightly, then settles", () => {
  let most = 0;
  for (let t = 0; t <= 0.5; t += 0.005) most = Math.max(most, pop(t, 0, 0.5));
  assert.ok(most > 1.03 && most < 1.2, `${most}`);
  assert.equal(pop(0, 0.1), 0);
  assert.equal(pop(1, 0, 0.5), 1);
});

test("the Shot map says the camera is the scene's own, and pins words, not a place's id", () => {
  assert.equal(PACK_COMPONENTS.get("archive-collage:map").camera, "One slow drift, layers in parallax");
  assert.deepEqual(elementsOf({ component: "archive-collage:route", vars: { fromPlace: "london", toPlace: "mumbai", fromLabel: "London", toLabel: "Mumbai", line: "All around" } }).map((e) => e.id), ["fromLabel", "toLabel", "line"]);
  assert.deepEqual(elementsOf({ component: "archive-collage:map", vars: { place: "egypt", label: "Egypt" } }).map((e) => e.id), ["label"]);
});

test("the worst answers of a small model still cover every sentence, in order", () => {
  const part = [s(1, "The story starts in Egypt."), s(2, "A ship sailed from London to Mumbai."), s(3, "Is anyone there?"), s(4, "It began in 1859 here."), s(5, "It cost 5 dollars.")];
  for (const answer of [null, {}, { scenes: "no" }, { scenes: [{ from: "S9", template: "map", params: {} }] }, { scenes: [{ from: "S1", to: "S5", template: "nope" }] }, { scenes: [{ from: "S1", template: "map", params: { place: "Narnia" } }] }]) {
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

test("the whole plan by rule passes every check, on the preset's own blocks", async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "itv-collage-plan-"));
  const sentences = [s(1, "How did one canal change world trade?"), s(2, "The story starts in Egypt, in the sand."), s(3, "Work on it began in 1859 and took years."), s(4, "A ship sailed from London to Mumbai."), s(5, "The new route cut about 40% of the distance."), s(6, "Merchants saw a shortcut, but shippers saw only ruin.")];
  fs.writeFileSync(path.join(d, "sentences.json"), JSON.stringify(sentences));
  fs.writeFileSync(path.join(d, "script.md"), "# T\n\n## OPEN\n\nx\n");
  await makeTemplateScenes({ llm: null, projectDir: d, preset, title: "How did one canal change world trade?" });
  const table = JSON.parse(fs.readFileSync(path.join(d, "scenes.json"), "utf8"));
  assert.equal(table.planner.preset, "archive-collage");
  assert.deepEqual(table.scenes.map((x) => x.template), ["title", "map", "year", "route", "percent", "versus"]);
  for (const sc of table.scenes) assert.ok(sc.component.startsWith("archive-collage:"));
  assert.equal(table.scenes[3].vars.toPlace, "mumbai");
  fs.rmSync(d, { recursive: true, force: true });
});

test("the build puts both files on the page, the maps first, and no three.js", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "itv-collage-page-"));
  assert.deepEqual(packScripts([loadComponent("archive-collage:word"), loadComponent("archive-collage:map")], out), ["archive-collage-map-data.js", "archive-collage-collage.js"]);
  assert.ok(fs.existsSync(path.join(out, "archive-collage-map-data.js")));
  fs.rmSync(out, { recursive: true, force: true });
});
