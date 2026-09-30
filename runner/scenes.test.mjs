import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COMPONENTS, ROLES } from "./gates/scenes/roles.mjs";
import { checkScenes, sentenceSections, makeScenes, refillScene, saveScenes, sceneRows, buildMessages, buildData, libraryCatalog } from "./gates/scenes/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const KEY = "sk-test-0123456789abcdefghij";

// A library with every component of roles.mjs and one shared variable set, so
// the tests run before scripts/fetch-library.mjs (as in CI).
const VARS = [
  ...["text", "wordmark", "headline", "kicker", "label", "items", "nodes", "caption", "action_line", "button_label", "keyword", "note", "prefix", "options", "suffix", "hub_label", "tagline", "url", "data", "labels", "unit", "cues"].map((id) => ({ id, type: "string", default: "" })),
  { id: "end", type: "number", default: 100 },
  { id: "progress", type: "number", default: 100, min: 0, max: 100 },
  { id: "shadow", type: "boolean", default: true },
  { id: "accent", type: "enum", default: "green", options: [{ value: "green" }, { value: "blue" }, { value: "violet" }] },
  { id: "exit", type: "enum", default: "none", options: [{ value: "none" }, { value: "fade" }] },
];

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "itv-scenes-"));
  for (const name of Object.keys(COMPONENTS)) {
    const d = path.join(dir, "library", "components", name);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, "registry-item.json"), JSON.stringify({ name, description: `${name} does its thing`, variables: VARS, files: [{ path: `${name}.html`, target: `compositions/components/${name}.html` }] }));
    fs.writeFileSync(path.join(d, `${name}.html`), `<html data-composition-duration="3"><template><div id="root" data-duration="3"></div></template></html>`);
  }
  const proj = path.join(dir, "project");
  fs.mkdirSync(proj);
  fs.writeFileSync(path.join(proj, "sentences.json"), JSON.stringify(SENTENCES));
  fs.writeFileSync(path.join(proj, "script.md"), "# Title\n\n## OPEN\n\nWelcome to the new way. It has three parts.\n\n## 1. Numbers\n\nEight in ten people skip the intro. Keep it short and clear.\n\n## OWN\n\nStart your first video today.\n");
  return { dir, proj, env: { ITV_LIBRARY_DIR: path.join(dir, "library") } };
}

const SENTENCES = [
  { id: "S1", start: 0.2, end: 2.6, dur: 2.4, words: 5, text: "Welcome to the new way." },
  { id: "S2", start: 3.0, end: 5.2, dur: 2.2, words: 5, text: "It has three parts." },
  { id: "S3", start: 6.4, end: 9.6, dur: 3.2, words: 7, text: "Eight in ten people skip the intro." },
  { id: "S4", start: 10.0, end: 12.4, dur: 2.4, words: 6, text: "Keep it short and clear." },
  { id: "S5", start: 13.6, end: 16.0, dur: 2.4, words: 5, text: "Start your first video today." },
];
const TOTAL = 16.6;

const GOOD = {
  scenes: [
    { from: "S1", to: "S2", component: "titlecard-lockup", vars: { wordmark: "The new way" } },
    { from: "S3", component: "count-up", vars: { end: 8, suffix: " in 10" } },
    { from: "S4", component: "per-word-rise", vars: { text: "Short and clear" } },
    { from: "S5", component: "cta-close", vars: { action_line: "Start your first video" } },
  ],
  gaps: [],
};

const answer = (content) => ({ status: 200, json: { choices: [{ message: { content } }] } });
function fakeFetch(responses) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push(JSON.parse(init.body));
    const r = responses[Math.min(calls.length - 1, responses.length - 1)];
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => r.json, text: async () => "" };
  };
  impl.calls = calls;
  return impl;
}
const llm = (f) => ({ provider: "gemini", apiKey: KEY, fetchImpl: f, sleep: async () => {} });

test("roles.mjs names exactly the components of the library", () => {
  const list = JSON.parse(fs.readFileSync(path.join(here, "..", "library", "components.json"), "utf8")).components;
  assert.deepEqual(Object.keys(COMPONENTS).sort(), [...list].sort());
  for (const c of Object.values(COMPONENTS)) assert.ok(ROLES[c.role], `role ${c.role} is described`);
});

test("a good table passes", () => {
  const { env } = fixture();
  const r = checkScenes(GOOD, { sentences: SENTENCES, total: TOTAL, env });
  assert.deepEqual(r.issues, []);
  assert.deepEqual(r.times.map((t) => t.start), [0, 6.4, 10, 13.6]);
});

test("the checks name every problem the repair call has to fix", () => {
  const { env } = fixture();
  const check = (scenes) => checkScenes({ scenes }, { sentences: SENTENCES, total: TOTAL, env }).issues.join(" | ");
  assert.match(check([{ from: "S1", to: "S5", component: "no-such" }]), /unknown component no-such/);
  assert.match(check([{ from: "S1", to: "S5", component: "per-word-rise", vars: { text: "one two three four five six seven" } }]), /too long \(at most 6 words\)/);
  assert.match(check([{ from: "S1", to: "S5", component: "grid-card-assemble", vars: { items: "One,Two words here now,Three" } }]), /"Two words here now" is too long \(at most 3 words\)/);
  assert.match(check([{ from: "S1", to: "S5", component: "per-word-rise", vars: { exit: "fade" } }]), /do not set exit/);
  assert.match(check([{ from: "S1", to: "S2", component: "per-word-rise" }, { from: "S3", to: "S5", component: "per-word-rise" }]), /same component as the scene before/);
  assert.match(check([{ from: "S1", to: "S2", component: "per-word-rise" }, { from: "S4", to: "S5", component: "headline-slam" }]), /next sentence is S3/);
  assert.match(check([{ from: "S1", to: "S4", component: "per-word-rise" }, { from: "S5", component: "cta-close" }]), /over 12 s: split it/);
  const short = [{ ...SENTENCES[0] }, { ...SENTENCES[1], start: 5.0, end: 6.0 }, ...SENTENCES.slice(2)];
  const r = checkScenes({ scenes: [{ from: "S1", component: "per-word-rise" }, { from: "S2", component: "headline-slam" }, { from: "S3", to: "S5", component: "cta-close" }] }, { sentences: short, total: TOTAL, env });
  assert.match(r.issues.join(" "), /scene 2 \(S2\) lasts 1.4 s, under 2 s/);
});

test("a number the narration does not say is a warning, not a failure", () => {
  const { env } = fixture();
  const scenes = GOOD.scenes.map((s) => (s.component === "count-up" ? { ...s, vars: { end: 80, suffix: "%" } } : s));
  const r = checkScenes({ scenes }, { sentences: SENTENCES.map((s) => (s.id === "S3" ? { ...s, text: "Most people skip the intro." } : s)), total: TOTAL, env });
  assert.deepEqual(r.issues, []);
  assert.match(r.warnings.join(" "), /Scene 2: 80 is not in the narration/);
});

test("sentences know their script section", () => {
  assert.deepEqual(sentenceSections("## OPEN\n\nWelcome to the new way. It has three parts.\n\n## 1. Numbers\n\nEight in ten people skip the intro. Keep it short and clear.\n\n## OWN\n\nStart your first video today.\n", SENTENCES), ["OPEN", "OPEN", "1. Numbers", "1. Numbers", "OWN"]);
});

test("the prompt carries the library and the sentences as data", () => {
  const { env } = fixture();
  const msgs = buildMessages(buildData({ sentences: SENTENCES, sections: ["OPEN"], language: "hu" }), libraryCatalog({ env }));
  assert.match(msgs[0].content, /The picture shows what the voice says/);
  assert.match(msgs[1].content, /"component": "count-up"/);
  assert.match(msgs[1].content, /"language": "hu"/);
  assert.doesNotMatch(msgs[1].content, /"id": "exit"/, "exit is never offered");
});

test("make-scenes: one repair call, then scenes.json", async () => {
  const { dir, proj, env } = fixture();
  const bad = { scenes: [{ from: "S1", to: "S5", component: "per-word-rise", vars: { text: "one two three four five six seven" } }] };
  const f = fakeFetch([answer(JSON.stringify(bad)), answer("```json\n" + JSON.stringify({ ...GOOD, gaps: [{ at: "S3", need: "a pie chart" }] }) + "\n```")]);
  const r = await makeScenes({ llm: llm(f), projectDir: proj, env, language: "en" });
  assert.equal(f.calls.length, 2);
  assert.match(f.calls[1].messages.at(-1).content, /too long/);
  assert.deepEqual(r.gaps, [{ at: "S3", need: "a pie chart" }]);
  const saved = JSON.parse(fs.readFileSync(path.join(proj, "scenes.json"), "utf8"));
  assert.equal(saved.scenes.length, 4);
  assert.deepEqual(saved.scenes[0], { component: "titlecard-lockup", from: "S1", to: "S2", vars: { wordmark: "The new way" } });
  fs.rmSync(dir, { recursive: true, force: true });
});

test("make-scenes fails after one repair", async () => {
  const { dir, proj, env } = fixture();
  const f = fakeFetch([answer("not json at all")]);
  await assert.rejects(makeScenes({ llm: llm(f), projectDir: proj, env }), /did not pass the checks after one repair/);
  assert.equal(f.calls.length, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("the table in plain words, with swap choices of the same role", async () => {
  const { dir, proj, env } = fixture();
  fs.writeFileSync(path.join(proj, "scenes.json"), JSON.stringify(GOOD));
  const { rows } = await sceneRows(proj, { env });
  assert.equal(rows[0].label, "Title card");
  assert.equal(rows[0].roleLabel, "Opening or chapter");
  assert.equal(rows[0].said, "Welcome to the new way. It has three parts.");
  assert.equal(rows[0].mainText, "The new way");
  assert.deepEqual(rows[0].alternatives, [{ component: "titlecard-calm", label: "Quiet chapter title" }]);
  assert.equal(rows[1].mainVar, null, "numbers are not edited as text");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("swap: the LLM fills in only that scene, same role only", async () => {
  const { dir, proj, env } = fixture();
  fs.writeFileSync(path.join(proj, "scenes.json"), JSON.stringify(GOOD));
  const f = fakeFetch([answer(JSON.stringify({ scenes: [{ from: "S4", component: "headline-slam", vars: { text: "Short and clear" } }] }))]);
  await refillScene({ llm: llm(f), projectDir: proj, index: 2, component: "headline-slam", env });
  assert.match(f.calls[0].messages[1].content, /ONE scene of a longer video/);
  const saved = JSON.parse(fs.readFileSync(path.join(proj, "scenes.json"), "utf8"));
  assert.deepEqual(saved.scenes[2], { component: "headline-slam", from: "S4", vars: { text: "Short and clear" } });
  await assert.rejects(refillScene({ llm: llm(f), projectDir: proj, index: 2, component: "count-up", env }), /same role/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("save-scenes (Custom) checks like the AI's table", async () => {
  const { dir, proj, env } = fixture();
  fs.writeFileSync(path.join(proj, "scenes.json"), JSON.stringify(GOOD));
  const edited = GOOD.scenes.map((s, i) => (i === 2 ? { ...s, vars: { text: "Keep it short" } } : s));
  await saveScenes({ projectDir: proj, scenes: edited, env });
  assert.equal(JSON.parse(fs.readFileSync(path.join(proj, "scenes.json"), "utf8")).scenes[2].vars.text, "Keep it short");
  await assert.rejects(saveScenes({ projectDir: proj, scenes: edited.slice(1), env }), /problems/);
  fs.rmSync(dir, { recursive: true, force: true });
});
