import "./fixtures/test-catalog.mjs"; // the scene catalog fixture, before any scene module
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SHADERS, MOODS, PLAIN, ALL_MOODS, moodPair, loadRegistry, planTransitions, templateLines, withoutOpacity, transitionBuild, CUT, FRAME, OUTRO } from "./motion/transitions.mjs";
import { backgroundPieces, backgroundFor, cameraLines, PIECE } from "./motion/stage.mjs";
import { normalizeProfile, profileFromMood, saveProfile, loadProfile, moodFromTokens, recommendMood, wizardOptions, WIZARD_ROLES } from "./motion/profile.mjs";
import { assemble, libraryDir, transparentGround } from "./gates/build/assemble.mjs";
import { countedErrors } from "./gates/build/index.mjs";
import { landedTimes } from "./gates/review/index.mjs";
import { libraryCatalog, checkScenes } from "./gates/scenes/index.mjs";
import { motionSampleScenes } from "./motion/preview.mjs";
import { cardForPreset } from "./brand/card.mjs";

const LIB = libraryDir();
const ENGINE = path.join(LIB, "..", "engine");
const registry = loadRegistry(LIB);
const times = (n, len = 4) => Array.from({ length: n }, (_, i) => ({ start: i * len, duration: len }));

test("the shader names are the bundled @hyperframes/shader-transitions' own", () => {
  const bundle = fs.readFileSync(path.join(ENGINE, "node_modules", "@hyperframes", "shader-transitions", "dist", "index.global.js"), "utf8");
  // minified: a key is quoted only when it has to be ("domain-warp" but glitch)
  for (const s of SHADERS) assert.match(bundle, new RegExp(`(?:"${s}"|[{,]${s}):\\{frag`), s);
  assert.equal((bundle.match(/["\w]:\{frag:/g) ?? []).length, SHADERS.length, "no shader left out");
});

test("every mood and its transitions come from HyperFrames' transition overview", () => {
  const md = fs.readFileSync(path.join(LIB, "motion", "overview.md"), "utf8").toLowerCase().replace(/-/g, " ");
  for (const [id, m] of Object.entries(MOODS)) {
    const row = md.split("\n").find((l) => l.startsWith(`| **${m.label.toLowerCase()}`));
    assert.ok(row, `${id}: a row in the Mood table`);
    for (const t of [...m.css, ...m.shaders]) assert.ok(row.includes(t.replace(/-/g, " ")), `${id}: ${t} is in its row`);
    for (const t of m.css) assert.ok(registry.transitions.some((r) => r.name === t), `${t} is in the registry`);
    for (const t of m.shaders) assert.ok(SHADERS.includes(t), `${t} is a shader`);
  }
  assert.deepEqual(Object.keys(PLAIN), ["simple", "none"]);
  assert.deepEqual(moodPair("premium"), { primary: "blur-crossfade", accent: "cross-warp-morph" });
  assert.deepEqual(moodPair("retro"), { primary: "light-leak", accent: null });
  assert.deepEqual(moodPair("none"), { primary: CUT, accent: null });
});

test("scene changes follow HyperFrames' narrative positions", () => {
  const t = { primary: "push-slide", accent: "whip-pan", energy: "medium", where: "every" };
  const plan = planTransitions(times(6), { transition: t, registry, sectionStarts: new Set([3]) });
  assert.deepEqual(plan.map((p) => p.type), ["whip-pan", "push-slide", "whip-pan", "push-slide", OUTRO.type], "opening and topic change get the accent, the outro a crossfade");
  assert.equal(plan[4].seconds, OUTRO.seconds);
  assert.equal(plan[1].seconds, 0.4);
  const sections = planTransitions(times(6), { transition: { ...t, where: "sections" }, registry, sectionStarts: new Set([3]) });
  assert.deepEqual(sections.map((p) => p.type), ["whip-pan", CUT, "whip-pan", CUT, "crossfade"]);
  const none = planTransitions(times(4), { transition: { primary: CUT, accent: null }, registry });
  assert.deepEqual(none.map((p) => p.type), [CUT, CUT, CUT]);
  // never more than a third of the incoming scene, never more than the registry's maximum
  const short = planTransitions([{ start: 0, duration: 4 }, { start: 4, duration: 0.9 }, { start: 4.9, duration: 4 }], { transition: { primary: "crossfade", energy: "calm" }, registry });
  assert.equal(short[0].seconds, 0.3);
});

test("a registry template is filled the way HyperFrames' injector fills it", () => {
  const rec = registry.transitions.find((r) => r.name === "push-slide");
  const lines = templateLines(rec, { from: "scene-1", to: "scene-2", at: 4, seconds: 0.5, direction: "LEFT" });
  assert.deepEqual(lines, [
    'tl.to("#scene-1", { x: -1920, duration: 0.5, ease: "power3.inOut" }, 4);',
    'tl.fromTo("#scene-2", { x: 1920, opacity: 1 }, { x: 0, opacity: 1, duration: 0.5, ease: "power3.inOut" }, 4);',
  ]);
  assert.match(templateLines(rec, { from: "a", to: "b", at: 1, seconds: 0.5, direction: "UP" })[0], /y: -1080/);
  assert.throws(() => templateLines(rec, { from: "a", to: "b", at: 1, seconds: 0.5, direction: "SIDEWAYS" }), /no direction/);
  assert.equal(withoutOpacity('tl.fromTo("#b", { opacity: 0 }, { opacity: 1, duration: 0.5, ease: "x" }, 4);'), 'tl.fromTo("#b", {}, { duration: 0.5, ease: "x" }, 4);');
  assert.equal(withoutOpacity('tl.to("#a", { filter: "blur(10px)", scale: 1.03, opacity: 0, duration: 0.6 }, 4);'), 'tl.to("#a", { filter: "blur(10px)", scale: 1.03, duration: 0.6 }, 4);');
});

test("CSS changes extend the outgoing scene; any shader hands every change to the shader package", () => {
  const ids = ["scene-1", "scene-2", "scene-3"];
  const css = transitionBuild(times(3), [{ type: "crossfade", seconds: 0.5 }, { type: CUT, seconds: 0 }], { ids, registry });
  assert.deepEqual(css.extend, [0.5, 0, 0]);
  assert.equal(css.shader, null);
  assert.equal(css.lines.length, 2);
  const mixed = transitionBuild(times(3), [{ type: "light-leak", seconds: 0.6, ease: "sine.inOut" }, { type: CUT, seconds: 0 }], { ids, registry, theme: { bg: "#fdfae7", brand: "#1e2bfa" } });
  assert.deepEqual(mixed.shader.scenes, ids);
  assert.deepEqual(mixed.shader.transitions, [{ time: 4, shader: "light-leak", duration: 0.6, ease: "sine.inOut" }, { time: 8, duration: Math.round(FRAME * 1000) / 1000, ease: undefined }]);
  assert.equal(mixed.shader.bgColor, "#fdfae7");
  assert.deepEqual(mixed.extend, [0.6, 0.033, 0], "a cut is a one-frame crossfade");
});

test("the background is laid in seamless pieces of 5-15 s, aurora only on a dark look", () => {
  for (const total of [3, 14, 16, 61, 600.4]) {
    const p = backgroundPieces(total);
    assert.ok(Math.abs(p.reduce((a, x) => a + x.duration, 0) - total) < 0.01, `${total}: covers the video`);
    if (total > PIECE.max) for (const x of p) assert.ok(x.duration >= PIECE.min && x.duration <= PIECE.max, `${total}: ${x.duration}`);
  }
  assert.equal(backgroundFor({ type: "aurora-drift" }, { light: true }).component, null);
  assert.match(backgroundFor({ type: "aurora-drift" }, { light: true }).note, /needs a dark look/);
  assert.equal(backgroundFor({ type: "aurora-drift" }, { light: false }).component, "aurora-drift");
  assert.equal(backgroundFor({ type: "grain-field" }, { light: true }).component, "grain-field");
});

test("the camera never stops: one continuous push over the whole scene, at least 4%, drifting the other way each scene (2026-10-06)", () => {
  const push = cameraLines("push", { id: "cam-1", start: 4, duration: 6 });
  assert.deepEqual(push, ['tl.fromTo("#cam-1", { scale: 1, x: 0 }, { scale: 1.05, x: 16, duration: 6, ease: "none" }, 4);']);
  assert.match(cameraLines("push", { id: "cam-2", start: 10, duration: 5, index: 1 })[0], /x: -16, duration: 5/);
  const a = cameraLines("jitter", { id: "cam-2", start: 0, duration: 6, index: 1 });
  assert.deepEqual(a, cameraLines("jitter", { id: "cam-2", start: 0, duration: 6, index: 1 }));
  assert.doesNotMatch(a.join(), /repeat|yoyo|random/);
  assert.match(a[0], /\{ x: 0, y: 0 \}\], duration: 6/, "it ends where it started");
  assert.deepEqual(cameraLines("off", { id: "c", start: 0, duration: 1 }), []);
});

test("a profile is checked: names, roles, style settings", () => {
  const p = normalizeProfile(profileFromMood("editorial"));
  assert.equal(p.transition.primary, "push-slide");
  assert.equal(p.camera.move, "push", "the camera starts on: a still frame reads as a slide (2026-10-06)");
  assert.throws(() => normalizeProfile({ ...p, transition: { ...p.transition, primary: "spin-o-rama" } }), /Unknown transition: spin-o-rama/);
  assert.throws(() => normalizeProfile({ ...p, scenes: { off: ["titlecard-lockup", "titlecard-calm"], style: {} } }), /Keep at least one scene for "Opening or chapter"/);
  assert.throws(() => normalizeProfile({ ...p, scenes: { off: ["cta-close"], style: {} } }), /CTA wizard/);
  assert.throws(() => normalizeProfile({ ...p, scenes: { off: [], style: { "marker-highlight": { draw_at: 2 } } } }), /draw_at is not a style setting/);
  assert.throws(() => normalizeProfile({ ...p, scenes: { off: [], style: { "marker-highlight": { style: "sparkles" } } } }), /must be one of/);
  assert.throws(() => normalizeProfile({ ...p, background: { type: "lava-lamp" } }), /not valid/);
  const ok = normalizeProfile({ ...p, scenes: { off: ["headline-slam"], style: { "marker-highlight": { style: "underline" } } } });
  assert.deepEqual(ok.scenes, { off: ["headline-slam"], style: { "marker-highlight": { style: "underline" } } });
});

test("the profile lives in the Identity folder; none means none", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "itv-motion-"));
  assert.equal(loadProfile(dir), null);
  const saved = saveProfile(dir, profileFromMood("warm"), { now: new Date("2026-10-04T10:00:00Z") });
  assert.equal(saved.updatedAt, "2026-10-04T10:00:00.000Z");
  assert.deepEqual(loadProfile(dir), saved);
  assert.ok(fs.existsSync(path.join(dir, "motion.json")));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("the Brand's open-design style recommends a mood only where its motion tokens differ", () => {
  assert.equal(moodFromTokens(":root { --motion-base: 200ms; --ease-standard: cubic-bezier(0.2, 0, 0, 1); }"), null);
  assert.equal(moodFromTokens(":root { --motion-base: 0ms; }").mood, "none");
  assert.equal(moodFromTokens(":root { --motion-base: 200ms; --ease-standard: steps(2, end); }").mood, "retro");
  assert.equal(moodFromTokens(":root { --ease-standard: cubic-bezier(0.34, 1.56, 0.64, 1); }").mood, "playful");
  assert.deepEqual(moodFromTokens(":root { --motion-base: 320ms; }"), { mood: "premium", energy: "calm", reason: "Your brand style moves slowly." });
  assert.equal(recommendMood(cardForPreset("blue-professional")).mood, "premium");
  assert.equal(recommendMood({ source: { kind: "preset", preset: "od-duolingo" } }).mood, "playful");
});

test("the wizard offers no closing scenes and no exit or accent settings", () => {
  const o = wizardOptions();
  assert.equal(o.moods.length, Object.keys(ALL_MOODS).length);
  assert.deepEqual(o.scenes.map((r) => r.role), WIZARD_ROLES);
  assert.ok(!WIZARD_ROLES.includes("closing"));
  for (const r of o.scenes) for (const c of r.components) for (const v of c.style) assert.ok(!["exit", "accent"].includes(v.id), `${c.name}.${v.id}`);
  assert.ok(o.scenes.find((r) => r.role === "emphasis").components.find((c) => c.name === "marker-highlight").style.some((v) => v.id === "style"), "the marker's look is offered");
});

test("turned-off scene types never reach the AI and are refused in its answer", () => {
  assert.ok(!libraryCatalog({ off: ["headline-slam"] }).some((c) => c.name === "headline-slam"));
  const sentences = [{ id: "S1", start: 0, end: 3, dur: 3, text: "One." }];
  const r = checkScenes({ scenes: [{ component: "headline-slam", from: "S1", vars: { text: "Go" } }] }, { sentences, total: 3, off: ["headline-slam"] });
  assert.match(r.issues.join(), /turned off/);
});

test("the check ignores overlapping text only inside a scene change", () => {
  const report = {
    layout: { findings: [
      { severity: "error", code: "content_overlap", firstSeen: 4.1, lastSeen: 4.6, time: 4.1 },
      { severity: "error", code: "content_overlap", firstSeen: 9, lastSeen: 9, time: 9 },
      { severity: "error", code: "overflow", firstSeen: 4.2, lastSeen: 4.2, time: 4.2 },
    ] },
    contrast: { findings: [{ severity: "error", code: "contrast", time: 4.2 }] },
    lint: { findings: [{ severity: "warning", code: "x" }] },
  };
  const errors = countedErrors(report, [{ at: 4, seconds: 0.65 }]);
  assert.deepEqual(errors.map((e) => `${e.section}:${e.code}@${e.time}`), ["layout:content_overlap@9", "layout:overflow@4.2", "contrast:contrast@4.2"]);
  assert.equal(countedErrors(report, []).length, 4);
});

test("a scene that holds under the next one is photographed before the next one starts", () => {
  assert.deepEqual(landedTimes([{ start: 0, duration: 4.6 }, { start: 4, duration: 4 }]), [3.8, 7.8]);
});

// ---- the build -------------------------------------------------------------------

function project(scenes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "itv-motion-build-"));
  fs.mkdirSync(path.join(dir, "audio"));
  fs.writeFileSync(path.join(dir, "audio", "vo_bgm.mp3"), "mp3");
  const sentences = scenes.map((_, i) => ({ id: `S${i + 1}`, start: i * 4, end: i * 4 + 3.8, text: "x" }));
  fs.writeFileSync(path.join(dir, "sentences.json"), JSON.stringify(sentences));
  fs.writeFileSync(path.join(dir, "scenes.json"), JSON.stringify({ scenes }));
  return dir;
}
const SAMPLE = [
  { from: "S1", component: "titlecard-calm", vars: { headline: "One" } },
  { from: "S2", component: "per-word-rise", vars: { text: "Two words" } },
  { from: "S3", component: "marker-highlight", vars: { text: "Three is marked", emphasis_word: "marked" } },
];

test("with a profile: overlapping scenes on two tracks, recipes on the main timeline, the windows written down", async () => {
  const dir = project(SAMPLE);
  const motion = normalizeProfile({ ...profileFromMood("simple"), camera: { move: "push" }, background: { type: "grain-field", vars: {} }, scenes: { off: [], style: { "marker-highlight": { style: "circle" } } } });
  const r = await assemble(dir, { total: 12, motion, sectionStarts: new Set() });
  const html = fs.readFileSync(path.join(r.out, "index.html"), "utf8");
  assert.deepEqual(r.transitions.map((t) => t.type), ["crossfade", "crossfade"]);
  assert.match(html, /id="scene-1" class="clip"[^>]*data-start="0" data-duration="4.65" data-track-index="1"/);
  assert.match(html, /id="scene-2" class="clip"[^>]*data-start="4" data-duration="4.8" data-track-index="4"/);
  assert.match(html, /<div id="cam-1" class="itv-cam"/);
  assert.match(html, /tl.fromTo\("#scene-2", \{ opacity: 0 \}/);
  assert.match(html, /id="background-1" class="clip" data-composition-id="grain-field"[^>]*data-duration="12" data-track-index="0"/);
  assert.doesNotMatch(html, /main-bg" class="clip"/);
  assert.match(html, /"style":"circle"/, "the profile's style wins");
  assert.equal(fs.readFileSync(path.join(r.out, "compositions", "components", "scene-2-per-word-rise.html"), "utf8").includes("<style data-itv-ground>.pwr-clip { background: transparent !important; }</style>"), true, "the scene's ground lets the background through");
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(r.out, "transitions.json"), "utf8")), [{ at: 4, seconds: 0.65, type: "crossfade" }, { at: 8, seconds: 0.8, type: "crossfade" }]);
  assert.ok(!fs.existsSync(path.join(r.out, "hyper-shader.global.js")));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("with a shader: the package is copied in and owns every change", async () => {
  const dir = project(SAMPLE);
  const r = await assemble(dir, { total: 12, motion: normalizeProfile(profileFromMood("retro")), sectionStarts: new Set() });
  const html = fs.readFileSync(path.join(r.out, "index.html"), "utf8");
  assert.ok(fs.existsSync(path.join(r.out, "hyper-shader.global.js")));
  assert.match(html, /<script src="hyper-shader.global.js"><\/script>/);
  assert.match(html, /class="clip scene"/);
  assert.match(html, /HyperShader.init\(Object.assign\(\{"bgColor":"#[0-9a-f]{6}"[^)]*"scenes":\["scene-1","scene-2","scene-3"\]/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("every scene component's own ground is found, and only its background changes", () => {
  const scenes = fs.readdirSync(path.join(LIB, "components")).filter((n) => !["aurora-drift", "grain-field"].includes(n));
  for (const n of scenes) {
    const html = fs.readFileSync(path.join(LIB, "components", n, `${n}.html`), "utf8");
    const r = transparentGround(html);
    const paints = /(#root|-clip)\s*\{[^{}]*background\s*:[^;]*var\(--bg/.test(html);
    assert.equal(r.grounds.length > 0, paints, n);
    assert.equal(r.html.length - html.length, r.grounds.length ? r.html.indexOf("</style>", r.html.indexOf("data-itv-ground")) + 8 - r.html.indexOf("<style data-itv-ground>") : 0, `${n}: nothing else changes`);
  }
});

test("without a profile the build has none of it", async () => {
  const dir = project(SAMPLE);
  const r = await assemble(dir, { total: 12, motion: null });
  const html = fs.readFileSync(path.join(r.out, "index.html"), "utf8");
  assert.doesNotMatch(html, /var tl =|itv-cam|HyperShader|data-track-index="4"/);
  assert.match(html, /<div id="main-bg" class="clip"/);
  assert.ok(!fs.existsSync(path.join(r.out, "transitions.json")));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("the Motion preview's sample has a marked word and six scenes", () => {
  const s = motionSampleScenes(cardForPreset("blue-professional"), "hu");
  assert.deepEqual(s.map((x) => x.from), ["S1", "S2", "S3", "S4", "S5", "S6"]);
  assert.equal(s[3].component, "marker-highlight");
  assert.ok(s[3].vars.text.split(" ").includes(s[3].vars.emphasis_word));
});
