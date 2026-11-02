// The preset engine (docs/BUILD_PLAN.md, phase 1): a preset's contract, and a
// scene plan that survives a small model's worst answers.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkPreset, listPresets, loadPreset, resolveTemplates, TEMPLATES_MIN, TEMPLATES_MAX, DEFAULT_PRESET } from "./presets/index.mjs";
import { mendPart, partsOf, planMessages, templateList, toScene, cleanParams, numberIn, ruleParams, makeTemplateScenes } from "./gates/scenes/templates.mjs";
import { PACK_COMPONENTS, paceOf } from "./gates/scenes/roles.mjs";
import { stylesheetHtml, tokensFor } from "./presets/stylesheet.mjs";

const preset = loadPreset(DEFAULT_PRESET);
const templates = resolveTemplates(preset);
const s = (n, text, dur = 3) => ({ id: `S${n}`, text, dur, start: (n - 1) * dur, end: n * dur, words: text.split(" ").length });
const part = [s(1, "Most channels lose people early."), s(2, "They lose 40% in the first seconds."), s(3, "That is a promise problem."), s(4, "Do you say what they get?"), s(5, "A clear promise keeps them watching.")];

test("the default preset keeps the contract, and is the first one", () => {
  assert.deepEqual(checkPreset(preset), []);
  assert.equal(listPresets()[0].id, DEFAULT_PRESET);
  assert.ok(preset.templates.length >= TEMPLATES_MIN && preset.templates.length <= TEMPLATES_MAX);
  for (const r of ["pacing", "cutFrequency", "camera", "characters", "sound"]) assert.ok(preset.shotRules[r], r);
});

test("a preset that breaks the contract is named, not used", () => {
  assert.ok(checkPreset({ ...preset, templates: preset.templates.slice(0, 3) }).some((i) => i.includes("templates")));
  assert.ok(checkPreset({ ...preset, shotRules: { ...preset.shotRules, sound: "" } }).some((i) => i.includes("sound")));
  assert.ok(checkPreset({ ...preset, shotRules: { ...preset.shotRules, pacing: "wild" } }).some((i) => i.includes("pacing")));
  const bad = structuredClone(preset);
  bad.templates[0].use[0].vars.line1 = "$nothing";
  assert.ok(checkPreset(bad).some((i) => i.includes("unknown parameter nothing")));
  assert.throws(() => loadPreset("no-such"), /no style preset/);
});

test("no preset, template or label carries a brand or channel name", () => {
  const text = JSON.stringify(listPresets().map((p) => ({ label: p.label, description: p.description, templates: p.templates.map((t) => [t.id, t.label, t.when]), rules: p.shotRules })));
  assert.doesNotMatch(text, /hyperframes|heygen|youtube|vox|disney|pixar|netflix|kurzgesagt/i);
});

test("every template can be drawn without any pack, by what the app ships", () => {
  PACK_COMPONENTS.clear();
  assert.equal(resolveTemplates(preset).length, preset.templates.length);
});

test("the channel's own block wins over the bundled component, when all its text is filled", () => {
  PACK_COMPONENTS.clear();
  PACK_COMPONENTS.set("zg-archetypes:statement", { role: "statement", variables: [{ id: "kick", type: "string", optional: true }, { id: "line1", type: "string" }, { id: "line2", type: "string" }] });
  assert.equal(resolveTemplates(preset).find((t) => t.id === "statement").draw.component, "zg-archetypes:statement");
  // a text the template does not fill would show the block's sample: not used
  PACK_COMPONENTS.set("zg-archetypes:statement", { role: "statement", variables: [{ id: "line1", type: "string" }, { id: "extra", type: "string" }] });
  assert.equal(resolveTemplates(preset).find((t) => t.id === "statement").draw.component, "per-word-rise");
  PACK_COMPONENTS.clear();
});

test("the prompt stays small enough for a small model", () => {
  const m = planMessages({ templates, sentences: part, title: "T", language: "en", shotRules: preset.shotRules });
  const chars = m.map((x) => x.content).join("").length;
  assert.ok(chars < 5000, `${chars} characters`);
  assert.match(templateList(templates), /statement: .*line1 \(max 5 words\)/);
});

test("a good answer goes through as it came", () => {
  const answer = {
    scenes: [
      { from: "S1", template: "title", params: { headline: "Why channels lose people" } },
      { from: "S2", template: "percent", params: { value: 40 } },
      { from: "S3", to: "S3", template: "statement", params: { line1: "That is a", line2: "promise problem" } },
      { from: "S4", template: "question", params: { question: "Do you say what?" } },
      { from: "S5", template: "highlight", params: { line: "A clear promise keeps them", mark: "promise" } },
    ],
  };
  const r = mendPart({ answer, part, templates, pace: "balanced" });
  assert.equal(r.mended, 0);
  assert.deepEqual(r.scenes.map((x) => x.template), ["title", "percent", "statement", "question", "highlight"]);
});

test("the worst answers of a small model still cover every sentence, in order", () => {
  const bad = [
    null,
    {},
    { scenes: "no" },
    { scenes: [] },
    { scenes: [{ from: "S9", template: "statement", params: {} }] },
    { scenes: [{ from: "S1", to: "S5", template: "nonsense", params: {} }] },
    { scenes: [{ from: "S3", template: "statement", params: { line1: "x" } }, { from: "S1", template: "word", params: { word: "y" } }] },
    { scenes: [{ from: "S1", template: "statement", params: { line1: "a", line2: "b" } }, { from: "S2", template: "statement", params: { line1: "c", line2: "d" } }] },
  ];
  for (const answer of bad) {
    const r = mendPart({ answer, part, templates, pace: "balanced" });
    const ids = r.scenes.flatMap((x) => {
      const from = Number(x.from.slice(1));
      const to = Number((x.to ?? x.from).slice(1));
      return Array.from({ length: to - from + 1 }, (_, i) => from + i);
    });
    assert.deepEqual(ids, [1, 2, 3, 4, 5], JSON.stringify(answer));
    r.scenes.forEach((x, i) => assert.notEqual(x.component, r.scenes[i - 1]?.component, JSON.stringify(answer)));
  }
});

test("a scene too long for the pace is cut back, the rest goes on", () => {
  const long = [s(1, "One long sentence here now.", 5), s(2, "Another long sentence here now.", 5), s(3, "And a third one to end.", 5)];
  const r = mendPart({ answer: { scenes: [{ from: "S1", to: "S3", template: "statement", params: { line1: "One long", line2: "sentence" } }] }, part: long, templates, pace: "balanced" });
  const { joined } = paceOf("balanced");
  assert.ok(5 + 5 > joined);
  assert.equal(r.scenes[0].to, undefined);
  assert.equal(r.scenes.at(-1).to ?? r.scenes.at(-1).from, "S3");
});

test("a number the voice does not say never reaches the screen", () => {
  const number = templates.find((t) => t.id === "number");
  assert.equal(cleanParams(number, { value: 99 }, [s(1, "They lose 40% in the first seconds.")]), null);
  assert.deepEqual(cleanParams(number, { value: 40 }, [s(1, "They lose 40% in the first seconds.")]), { value: 40 });
  const r = mendPart({ answer: { scenes: [{ from: "S1", to: "S5", template: "number", params: { value: 99 } }] }, part, templates, pace: "balanced" });
  assert.doesNotMatch(JSON.stringify(r.scenes), /99/);
});

test("the rules read numbers and sentences", () => {
  assert.deepEqual(numberIn("They made $5 million"), { value: 5, before: "$", after: "" });
  assert.deepEqual(numberIn("40 percent of them"), { value: 40, before: "", after: "%" });
  assert.equal(numberIn("no digits"), null);
  const statement = templates.find((t) => t.id === "statement");
  const p = ruleParams(statement, [s(1, "A vague promise sends them away."), s(2, "Pick one viewer.")]);
  assert.ok(!`${p.line1} ${p.line2}`.includes("Pick"), "a line stays inside its own sentence");
});

test("each variable gets the type it declares, and a list stays whole", () => {
  const dial = { params: { value: { type: "number" } }, id: "x", draw: { component: "c", vars: { progress: "$value", label: "$value" }, types: { progress: "number", label: "string" } } };
  assert.deepEqual(toScene(dial, { value: 72 }, { from: "S1", to: "S1" }).vars, { progress: 72, label: "72" });
  const list = { params: {}, id: "y", draw: { component: "c", vars: { items: "$a,$b", opt: "$c" }, types: {} } };
  assert.deepEqual(toScene(list, { a: "One", b: "Two" }, { from: "S1", to: "S2" }).vars, { items: "One,Two" });
});

test("a comment call keeps its own part; a long script is cut for the model", () => {
  const many = Array.from({ length: 60 }, (_, i) => s(i + 1, `Sentence ${i + 1}.`));
  assert.equal(partsOf(many).length, 3);
  const parts = partsOf(many.slice(0, 5), new Map([["S3", { keyword: "GUIDE" }]]));
  assert.deepEqual(parts.map((p) => p.map((x) => x.id)), [["S1", "S2"], ["S3"], ["S4", "S5"]]);
});

test("the whole plan: a dead AI still gives a table that passes every check", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "itv-preset-"));
  fs.writeFileSync(path.join(dir, "sentences.json"), JSON.stringify(part));
  fs.writeFileSync(path.join(dir, "script.md"), "# T\n\n## OPEN\n\nx\n");
  const said = [];
  const r = await makeTemplateScenes({ llm: null, projectDir: dir, preset, title: "Why channels lose people", onProgress: (p) => said.push(p.step) });
  const table = JSON.parse(fs.readFileSync(path.join(dir, "scenes.json"), "utf8"));
  assert.ok(table.scenes.length >= 2);
  assert.equal(table.planner.preset, DEFAULT_PRESET);
  assert.equal(r.byRule, table.planner.byRule);
  assert.ok(said.includes("planning"));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("the style sheet shows the tokens, and a brand preset takes the channel's", () => {
  const tokens = tokensFor(preset, null);
  const html = stylesheetHtml({ preset, tokens });
  assert.match(html, new RegExp(tokens.colors.primary));
  assert.match(html, /data-composition-id="main"/);
  for (const t of preset.templates) assert.ok(html.includes(t.label), t.label);
  assert.ok(html.includes("gsap.min.js"));
});
