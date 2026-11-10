// RecCut's face bubble (recorded/bubble.mjs, DECISIONS 184): the box lift and pin,
// the avatar bubble's paid gate and its fallback, and an old recording opening as before.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KINDS, DEFAULT_BOX, cleanBox, bubbleFor, kindProblem, migrateInput, zoomAllowed, liftBox, avatarCost, bubbleMount, makeAvatarBubble, importBubbleClip, setBubbleBox, exportVoice, INPUT_SCHEMA } from "./recorded/bubble.mjs";
import { fitBox, recordedHtml } from "./recorded/compose.mjs";
import { recordedState, loadInput } from "./recorded/index.mjs";
import { createProject, loadProject } from "./project.mjs";
import { loadPreset } from "./presets/index.mjs";
import { readLedger } from "./assets/license.mjs";

const tmp = (n) => fs.mkdtempSync(path.join(os.tmpdir(), `itv-bubble-${n}-`));

/** A recorded project on disk with a given input.json, the cuts done. */
function project(input, { kept = 12 } = {}) {
  const root = tmp("p");
  const { dir } = createProject({ projectsDir: root, title: "Rec", recipe: { engine: "recorded", preset: input.preset } });
  fs.mkdirSync(path.join(dir, "recorded"), { recursive: true });
  fs.mkdirSync(path.join(dir, "audio"), { recursive: true });
  fs.writeFileSync(path.join(dir, "recorded", "input.json"), JSON.stringify(input));
  fs.writeFileSync(path.join(dir, "recorded", "pictures.json"), JSON.stringify({ kept, pictures: {} }));
  fs.writeFileSync(path.join(dir, "audio", "vo.mp3"), "voice");
  return dir;
}

test("What did you record: six kinds in Zoltan's order, each with its files", () => {
  assert.deepEqual(KINDS.map((k) => k.label), ["Screen only", "Screen with my face in a bubble", "Talking head", "Screen and camera, switching", "Profile silhouette", "Screen with an AI avatar bubble"]);
  assert.equal(kindProblem("screen", {}), "Choose the screen file.");
  assert.equal(kindProblem("screen-bubble", { screen: "a" }), null);
  assert.match(kindProblem("screen-share", { screen: "a" }), /camera/);
  assert.equal(kindProblem("screen-avatar", { screen: "a" }), null);
});

test("the bubble a new video starts with", () => {
  assert.deepEqual(bubbleFor("screen-bubble", { screen: "s", camera: "c" }), { mode: "camera" });
  assert.deepEqual(bubbleFor("screen-bubble", { screen: "s" }, { box: DEFAULT_BOX }), { mode: "box", box: DEFAULT_BOX });
  assert.deepEqual(bubbleFor("screen-bubble", { screen: "s" }, { skip: true }), { mode: "box", box: null, skipped: true });
  assert.deepEqual(bubbleFor("screen-avatar", { screen: "s" }), { mode: "avatar", source: "heygen", state: "todo" });
  assert.equal(bubbleFor("screen", { screen: "s" }), null);
  // a dragged box is kept inside the frame; a click is not a box
  assert.deepEqual(cleanBox({ x: 0.9, y: 0.9, w: 0.3, h: 0.3 }), { x: 0.9, y: 0.9, w: 0.1, h: 0.1 });
  assert.deepEqual(cleanBox({ x: 0.5, y: 0.5, w: -0.2, h: -0.2 }), { x: 0.3, y: 0.3, w: 0.2, h: 0.2 });
  assert.equal(cleanBox({ x: 0.5, y: 0.5, w: 0.01, h: 0.2 }), null);
});

test("the lifted bubble sits on the same pixels of the fitted screen, at the same place", () => {
  const fit = fitBox(2560, 1440);
  const box = { x: 0.02, y: 0.62, w: 0.18, h: 0.32 };
  const l = liftBox(box, fit);
  assert.equal(l.left, Math.round((fit.x + 0.02 * fit.w) * 100) / 100);
  assert.equal(l.top, Math.round((fit.y + 0.62 * fit.h) * 100) / 100);
  assert.equal(l.width, Math.round(0.18 * fit.w * 100) / 100);
  // the clip leaves exactly the box: the inset from each side adds up to the frame
  const [t, r, b, lft] = l.clip.match(/inset\(([\d.]+)px ([\d.]+)px ([\d.]+)px ([\d.]+)px/).slice(1).map(Number);
  assert.ok(Math.abs(lft + l.width + r - fit.w) < 0.05);
  assert.ok(Math.abs(t + l.height + b - fit.h) < 0.05);
});

test("the composition pins the lifted bubble outside the zoom, and hides the zoomed copy", () => {
  const preset = loadPreset("screen-recording");
  const plan = { chapters: [], bigWords: [], layouts: [], beats: [] };
  const motion = { view: [[0.5, 0.5, 1], [0.5, 0.5, 2]], cursor: null, painted: false, fps: 10, size: { width: 1920, height: 1080 } };
  const html = recordedHtml({ plan, preset, total: 10, pictures: { screen: "pictures/screen.mp4", lift: { file: "pictures/screen-original.mp4", box: DEFAULT_BOX } }, motion });
  assert.match(html, /id="bubblelift" src="pictures\/screen-original.mp4"/);
  assert.match(html, /id="bubblelift"[^>]*clip-path:inset\(/);
  assert.match(html, /id="bubblepatch"/);
  // the zoom moves the screen and the patch, never the lifted bubble
  assert.match(html, /patchEl\.style\.transform/);
  assert.doesNotMatch(html, /bubblelift[^\n]*\.style\.transform/);
  assert.doesNotMatch(html.split("<script>")[1] ?? "", /bubblelift/);
});

test("a combined file with no marked bubble does not zoom, and says why", () => {
  assert.equal(zoomAllowed({ bubble: { mode: "box", box: null, skipped: true } }), false);
  assert.equal(zoomAllowed({ bubble: { mode: "box", box: DEFAULT_BOX } }), true);
  assert.equal(zoomAllowed({ bubble: null }), true);
  const dir = project({ schema: INPUT_SCHEMA, preset: "screen-recording", kind: "screen-bubble", bubble: { mode: "box", box: null, skipped: true }, files: { screen: "s.mp4" } });
  assert.throws(() => setBubbleBox({ projectDir: dir, box: { x: 0, y: 0, w: 0.01, h: 0.01 } }), /too small/);
  setBubbleBox({ projectDir: dir, box: DEFAULT_BOX });
  assert.deepEqual(loadInput(dir).bubble, { mode: "box", box: DEFAULT_BOX });
  assert.deepEqual(bubbleMount(loadInput(dir)), { kind: "lift", box: DEFAULT_BOX });
});

test("the avatar bubble: nothing is spent without approval", async () => {
  const dir = project({ schema: INPUT_SCHEMA, preset: "screen-recording", kind: "screen-avatar", bubble: { mode: "avatar", source: "heygen", state: "todo" }, files: { screen: "s.mp4" } });
  let calls = 0;
  const api = { uploadAudio: async () => { calls++; return "a"; }, createVideo: async () => { calls++; return "v"; }, waitAndDownload: async ({ out }) => { calls++; fs.writeFileSync(out, "clip"); } };
  await assert.rejects(makeAvatarBubble({ projectDir: dir, apiKey: "k", lookId: "l", api }), /only made after you approve/);
  await assert.rejects(makeAvatarBubble({ projectDir: dir, apiKey: "k", lookId: "l", approved: "yes", api }), /approve/);
  assert.equal(calls, 0);
  assert.equal(avatarCost(12).engine, "avatar_iii");
  assert.equal(avatarCost(12).usd, avatarCost(12).high);
  assert.ok(avatarCost(60).usd > 0);
});

test("the avatar bubble, approved: avatar_iii only, logged with its cost", async () => {
  const dir = project({ schema: INPUT_SCHEMA, preset: "screen-recording", kind: "screen-avatar", bubble: { mode: "avatar", source: "heygen", state: "todo" }, files: { screen: "s.mp4" } });
  const seen = {};
  const api = { uploadAudio: async () => "a", createVideo: async (o) => { Object.assign(seen, o); return "v"; }, waitAndDownload: async ({ out }) => fs.writeFileSync(out, "clip") };
  const r = await makeAvatarBubble({ projectDir: dir, apiKey: "k", lookId: "look", approved: true, api });
  assert.equal(r.made, true);
  assert.equal(seen.engine, "avatar_iii");
  assert.equal(seen.format, "webm");
  assert.ok(fs.existsSync(path.join(dir, "recorded", "bubble.webm")));
  assert.ok(!fs.existsSync(path.join(dir, "recorded", "bubble.webm.part")));
  const rec = readLedger(dir).assets.find((a) => a.file === "recorded/bubble.webm");
  assert.equal(rec.source, "heygen");
  assert.equal(rec.costUsd, avatarCost(12).usd);
  assert.deepEqual(bubbleMount(loadInput(dir)), { kind: "clip", file: "recorded/bubble.webm" });
});

test("the avatar bubble fails: Screen only, with a note, and the paid call is not repeated", async () => {
  const dir = project({ schema: INPUT_SCHEMA, preset: "screen-recording", kind: "screen-avatar", bubble: { mode: "avatar", source: "heygen", state: "todo" }, files: { screen: "s.mp4" } });
  let posts = 0;
  const api = { uploadAudio: async () => "a", createVideo: async () => { posts++; throw new Error("HeyGen said no credits"); }, waitAndDownload: async () => {} };
  const r = await makeAvatarBubble({ projectDir: dir, apiKey: "k", lookId: "look", approved: true, api });
  assert.equal(r.made, false);
  assert.equal(posts, 1);
  assert.equal(loadInput(dir).bubble.state, "failed");
  assert.equal(bubbleMount(loadInput(dir)), null, "no bubble: Screen only");
  assert.match(loadProject(dir).notes.find((n) => n.kind === "bubble").text, /Screen only/);
  // no key: the same fallback, no call at all
  const r2 = await makeAvatarBubble({ projectDir: dir, apiKey: "", lookId: "look", approved: true, api });
  assert.equal(r2.made, false);
  assert.equal(posts, 1);
});

test("the second way in: the cut voice out, an outside clip in, logged as own generation", async () => {
  const dir = project({ schema: INPUT_SCHEMA, preset: "screen-recording", kind: "screen-avatar", bubble: { mode: "avatar", source: "heygen", state: "todo" }, files: { screen: "s.mp4" } });
  const out = path.join(tmp("v"), "voice.mp3");
  exportVoice({ projectDir: dir, out });
  assert.equal(fs.readFileSync(out, "utf8"), "voice");
  const clip = path.join(tmp("c"), "lipsync.mp4");
  fs.writeFileSync(clip, "clip");
  await importBubbleClip({ projectDir: dir, file: clip, source: "outside", tool: "Some tool", probe: async () => ({ seconds: 20 }) });
  const rec = readLedger(dir).assets.find((a) => a.file === "recorded/bubble.mp4");
  assert.equal(rec.licenseName, "Own generation, outside tool");
  assert.equal(rec.model, "Some tool");
  assert.ok(fs.existsSync(clip), "the user's file is copied, never moved");
  assert.match(loadProject(dir).notes.find((n) => n.kind === "bubble").text, /drift/, "20 s against 12 s: said");
});

test("an old recording (recorded-input/1) opens in the Editor as it was", () => {
  const old = { schema: "recorded-input/1", preset: "screen-recording", files: { screen: "s.mp4", camera: "c.mp4" }, probes: {}, voice: "camera", offsets: {}, notes: ["lined up"] };
  const dir = project(old);
  const before = fs.readFileSync(path.join(dir, "recorded", "input.json"), "utf8");
  const input = loadInput(dir);
  assert.equal(input.schema, INPUT_SCHEMA);
  assert.equal(input.migratedFrom, "recorded-input/1");
  assert.equal(input.kind, "screen-bubble");
  assert.deepEqual(input.bubble, { mode: "camera" });
  assert.deepEqual(input.files, old.files);
  assert.deepEqual(input.notes, old.notes);
  assert.equal(zoomAllowed(input), true, "an old screen video zooms as before");
  assert.equal(bubbleMount(input), null, "its bubble is the camera, drawn as before");
  const st = recordedState(dir);
  assert.equal(st.preset, "screen-recording");
  assert.equal(st.input.kind, "screen-bubble");
  assert.equal(fs.readFileSync(path.join(dir, "recorded", "input.json"), "utf8"), before, "the old file is not rewritten by reading it");
  for (const [preset, kind] of [["talking-head", "talking-head"], ["screen-share", "screen-share"], ["profile-silhouette", "profile-silhouette"]]) assert.equal(migrateInput({ preset, files: {} }).kind, kind);
  assert.equal(migrateInput({ preset: "screen-recording", files: { screen: "s" } }).kind, "screen");
});
