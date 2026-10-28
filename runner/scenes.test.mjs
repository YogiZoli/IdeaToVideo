import "./fixtures/test-catalog.mjs"; // the scene catalog fixture, before any scene module
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COMPONENTS, ROLES, PACES } from "./gates/scenes/roles.mjs";
import { simplePlan } from "./gates/scenes/simple.mjs";
import { checkScenes, sentenceSections, makeScenes, refillScene, saveScenes, sceneRows, shortlistMessages, chooseMessages, chooseChunks, estimateScenes, buildData, isSoft } from "./gates/scenes/index.mjs";
import { catalogForPlanner as catalogEntries, plannableNames } from "./gates/scenes/catalog.mjs";
import { recordHistory, recentUses, maxUses } from "./gates/scenes/history.mjs";
import { usdText } from "./providers/prices.mjs";

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
    fs.writeFileSync(path.join(d, `${name}.html`), `<html data-composition-duration="3"><template><div id="root" data-duration="3"></div><script>root.dataset.duration</script></template></html>`);
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

test("roles.mjs names exactly the plannable components of the catalog, and the retired one", () => {
  assert.deepEqual(Object.keys(COMPONENTS).sort(), [...plannableNames(), "logo-brand-close"].sort());
  for (const c of Object.values(COMPONENTS)) assert.ok(ROLES[c.role], `role ${c.role} is described`);
  assert.ok(!COMPONENTS["browser-device-stage"], "needs a recording: not plannable");
  assert.ok(!COMPONENTS["caption-highlight"], "off: not plannable");
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
  assert.match(check([{ from: "S1", to: "S5", component: "headline-slam", vars: { text: "Without a framework, videos ramble" } }]), /too long for this component \(at most 3 words\)/);
  assert.match(check([{ from: "S1", to: "S2", component: "per-word-rise" }, { from: "S3", to: "S5", component: "per-word-rise" }]), /same component as the scene before/);
  assert.match(check([{ from: "S1", to: "S2", component: "per-word-rise" }, { from: "S4", to: "S5", component: "headline-slam" }]), /next sentence is S3/);
  assert.match(check([{ from: "S1", to: "S4", component: "per-word-rise" }, { from: "S5", component: "cta-close" }]), /over 7 s: split it/);
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

test("step one carries the whole catalog and the sentences as data", () => {
  const msgs = shortlistMessages(buildData({ sentences: SENTENCES, sections: ["OPEN"], language: "hu" }), catalogEntries());
  assert.match(msgs[0].content, /The picture shows what the voice says/);
  assert.match(msgs[0].content, /3 to 5 per scene/);
  assert.match(msgs[1].content, /"component": "count-up"/);
  assert.match(msgs[1].content, /"language": "hu"/);
  assert.doesNotMatch(msgs[1].content, /browser-device-stage/, "needs a recording: never offered");
  assert.doesNotMatch(msgs[1].content, /caption-highlight/, "off in the catalog: never offered");
});

test("step two carries the full code of the candidates and asks why", () => {
  const { env } = fixture();
  const scenes = [{ from: "S3", candidates: ["count-up", "chart-story", "conic-progress-ring"] }];
  const msgs = chooseMessages({ scenes, sentences: SENTENCES, codes: (n) => `<div data-composition-id="${n}">code of ${n}</div>`, data: buildData({ sentences: SENTENCES }), previous: "titlecard-lockup", limit: 2, env });
  assert.match(msgs[0].content, /one short line why it fits|why it fits/);
  for (const c of scenes[0].candidates) assert.match(msgs[1].content, new RegExp(`code of ${c}`));
  assert.match(msgs[1].content, /"previous": "titlecard-lockup"/);
  assert.match(msgs[1].content, /Eight in ten people skip the intro/);
});

test("the parts of step two stay within their code budget", () => {
  const scenes = Array.from({ length: 25 }, (_, i) => ({ from: `S${i + 1}`, candidates: [`a${i}`, `b${i}`, `c${i}`] }));
  const chunks = chooseChunks(scenes, () => 30000);
  assert.ok(chunks.every((c) => c.length <= 10));
  assert.ok(chunks.every((c) => c.flatMap((s) => s.candidates).length * 30000 <= 240000 + 90000));
  assert.equal(chunks.flat().length, 25);
});

const SHORTLIST = { scenes: [{ from: "S1", to: "S2", candidates: ["titlecard-lockup", "titlecard-calm", "per-word-rise"] }, { from: "S3", candidates: ["count-up", "chart-story", "conic-progress-ring"] }, { from: "S4", candidates: ["per-word-rise", "marker-highlight", "headline-slam"] }, { from: "S5", candidates: ["cta-close", "per-word-rise", "headline-slam"] }], gaps: [{ at: "S3", need: "a pie chart" }] };
const PICKS = { scenes: GOOD.scenes.map((s) => ({ ...s, why: `fits ${s.from}` })) };

test("make-scenes: step one, a repair, step two, then scenes.json with candidates and reasons", async () => {
  const { dir, proj, env } = fixture();
  const badShortlist = { scenes: [{ from: "S1", to: "S5", candidates: ["per-word-rise"] }] };
  const f = fakeFetch([answer(JSON.stringify(badShortlist)), answer("```json\n" + JSON.stringify(SHORTLIST) + "\n```"), answer(JSON.stringify(PICKS))]);
  const ident = path.join(dir, "ident");
  const r = await makeScenes({ llm: llm(f), projectDir: proj, env, language: "en", identityDir: ident, videoId: "v1" });
  assert.equal(f.calls.length, 3);
  assert.match(f.calls[1].messages.at(-1).content, /give 3 to 5 candidates/);
  assert.match(f.calls[2].messages[1].content, /CANDIDATES/);
  assert.deepEqual(r.gaps, [{ at: "S3", need: "a pie chart" }]);
  const saved = JSON.parse(fs.readFileSync(path.join(proj, "scenes.json"), "utf8"));
  assert.equal(saved.scenes.length, 4);
  assert.deepEqual(saved.scenes[0], { component: "titlecard-lockup", from: "S1", to: "S2", vars: { wordmark: "The new way" }, candidates: ["titlecard-lockup", "titlecard-calm", "per-word-rise"], why: "fits S1" });
  assert.equal(saved.planner.steps, 2);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(ident, "scene-history.json"), "utf8")).v1.components["count-up"], 1, "the channel's history knows this video");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("make-scenes fails after two repairs, and says what to do", async () => {
  const { dir, proj, env } = fixture();
  const f = fakeFetch([answer("not json at all")]);
  await assert.rejects(makeScenes({ llm: llm(f), projectDir: proj, env }), /did not pass the checks after 2 repairs.*Simple plan/);
  assert.equal(f.calls.length, 3);
  fs.rmSync(dir, { recursive: true, force: true });
});

// "No component twice in a row" is a hard rule since DECISIONS 130; a scene
// a little too long stays a matter of taste.
test("the same component twice in a row is repaired, never left as a warning", async () => {
  assert.equal(isSoft("scene 2: same component as the scene before (per-word-rise); pick another of its candidates"), false);
  assert.equal(isSoft("scene 3 (S4 to S9) lasts 14.2 s, over 12 s: split it"), true);
  const { dir, proj, env } = fixture();
  const twice = { scenes: [PICKS.scenes[0], PICKS.scenes[1], { ...PICKS.scenes[2] }, { from: "S5", component: "per-word-rise", vars: { text: "Start today" }, why: "x" }] };
  twice.scenes[2] = { from: "S4", component: "per-word-rise", vars: { text: "Short and clear" }, why: "x" };
  const f = fakeFetch([answer(JSON.stringify(SHORTLIST)), answer(JSON.stringify(twice)), answer(JSON.stringify(PICKS))]);
  const r = await makeScenes({ llm: llm(f), projectDir: proj, env, language: "en" });
  assert.equal(f.calls.length, 3, "one repair of step two");
  assert.match(f.calls[2].messages.at(-1).content, /same component as the scene before/);
  assert.equal(r.scenes, 4);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a channel's last videos rank a component lower: the catalog says how often they used it", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "itv-hist-"));
  recordHistory(dir, "old", [{ component: "count-up" }, { component: "count-up" }, { component: "per-word-rise" }], new Date("2026-10-01"));
  recordHistory(dir, "now", [{ component: "chart-story" }], new Date("2026-10-02"));
  assert.deepEqual(recentUses(dir, "now"), { "count-up": 2, "per-word-rise": 1 });
  const entries = catalogEntries({ uses: recentUses(dir, "now") });
  assert.equal(entries.find((e) => e.component === "count-up").usedRecently, 2);
  assert.equal(entries.find((e) => e.component === "chart-story").usedRecently, undefined);
  assert.equal(maxUses(10), 2);
  assert.equal(maxUses(60), 5);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("the price of planning is known before it runs", () => {
  const { dir, proj, env } = fixture();
  const e = estimateScenes({ projectDir: proj, llm: { provider: "claude", model: "claude-sonnet-5-5", effort: "low" }, env });
  assert.ok(e.usd > 0 && e.low < e.usd && e.high > e.usd, JSON.stringify(e));
  assert.equal(e.guess, false);
  assert.match(usdText(e), /^about \$/);
  assert.equal(estimateScenes({ projectDir: proj, llm: { provider: "deepseek", model: "x" }, env }).guess, true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("the table in plain words: the planner's reason, its other candidates first", async () => {
  const { dir, proj, env } = fixture();
  const table = { scenes: GOOD.scenes.map((s, i) => (i === 1 ? { ...s, candidates: ["count-up", "chart-story", "conic-progress-ring"], why: "the voice says eight in ten" } : s)) };
  fs.writeFileSync(path.join(proj, "scenes.json"), JSON.stringify(table));
  const { rows } = await sceneRows(proj, { env });
  assert.equal(rows[0].label, "Title card");
  assert.equal(rows[0].roleLabel, "Opening or chapter");
  assert.equal(rows[0].said, "Welcome to the new way. It has three parts.");
  assert.equal(rows[0].mainText, "The new way");
  assert.deepEqual(rows[0].alternatives, [{ component: "titlecard-calm", label: "Quiet chapter title" }]);
  assert.equal(rows[1].why, "the voice says eight in ten");
  assert.deepEqual(rows[1].alternatives.slice(0, 2), [{ component: "chart-story", label: "Chart", candidate: true }, { component: "conic-progress-ring", label: "Progress ring", candidate: true }]);
  assert.equal(rows[1].mainVar, null, "numbers are not edited as text");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("swap: the LLM reads that component's code and fills in only that scene", async () => {
  const { dir, proj, env } = fixture();
  fs.writeFileSync(path.join(proj, "scenes.json"), JSON.stringify(GOOD));
  const g = fakeFetch([answer(JSON.stringify({ scenes: [{ from: "S4", component: "kinetic-type-swap", vars: { options: "Short,Clear" }, why: "two words take turns" }] }))]);
  await refillScene({ llm: llm(g), projectDir: proj, index: 2, component: "kinetic-type-swap", env });
  assert.match(g.calls[0].messages[1].content, /### kinetic-type-swap/);
  const saved = JSON.parse(fs.readFileSync(path.join(proj, "scenes.json"), "utf8"));
  assert.deepEqual(saved.scenes[2], { component: "kinetic-type-swap", from: "S4", vars: { options: "Short,Clear" }, candidates: ["kinetic-type-swap"], why: "two words take turns" });
  await assert.rejects(refillScene({ llm: llm(g), projectDir: proj, index: 2, component: "count-up", env }), /same role/);
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

test("the pace is the Identity's choice: how long a joined scene may last, the planner's rule, the simple plan (2026-10-06)", () => {
  const { env } = fixture();
  const joined = { scenes: [{ from: "S1", to: "S2", component: "per-word-rise" }, { from: "S3", to: "S4", component: "headline-slam" }, { from: "S5", component: "per-word-rise" }] };
  const issues = (pace) => checkScenes(structuredClone(joined), { sentences: SENTENCES, total: TOTAL, env, pace }).issues.filter((i) => /split it/.test(i));
  assert.equal(issues("calm").length, 0, "calm: up to 10 s");
  assert.ok(issues("fast").length >= 1, "fast: over 5 s goes back");
  assert.match(issues(undefined).join(), /over 7 s/, "no choice: balanced");
  const sys = (pace) => shortlistMessages({}, [], { pace })[0].content;
  assert.match(sys("fast"), /every 2 to 4 seconds/);
  assert.match(sys(undefined), /every 3 to 5 seconds/);
  assert.doesNotMatch(sys("calm"), /\{\{PACE\}\}/);
  const count = (pace) => simplePlan({ sentences: SENTENCES, pace }).scenes.length;
  assert.ok(count("fast") >= count("balanced") && count("balanced") >= count("calm"), `${count("fast")} ${count("balanced")} ${count("calm")}`);
  assert.deepEqual(Object.keys(PACES), ["calm", "balanced", "fast"]);
});

