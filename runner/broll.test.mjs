// broll.test.mjs: AI B-roll (docs/ai-broll.md, DECISIONS 94, 95, 98). The
// settings, the prices, the HeyGen Video 1 order with a stand-in service,
// the AI's plan and its checks, the limit, the orders picked up after a
// failure (never paid twice), the library, the scene table, the publishing
// flag. No real HeyGen call: every service here is a fake.

import "./fixtures/test-catalog.mjs"; // the scene catalog fixture, before any scene module
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadSettings, saveSettings, normalizeSettings, capOf } from "./broll/settings.mjs";
import { orderSeconds, usdFor, aspectOf, generatorOf } from "./generate/index.mjs";
import { orderBody, order, fetchClip } from "./generate/heygen-video.mjs";
import { planBroll, planIssues, eligibleScenes, maxClips, estimateBroll, makeBroll, loadPlan, attach, removeItem, againItem, updateItem, usesGenerated, libraryForPlanner } from "./broll/index.mjs";
import { sceneRows } from "./gates/scenes/index.mjs";
import { loadLibrary, catalogForPlanner } from "./footage/library.mjs";
import { buildCard } from "./gates/render/publish.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const ffdir = path.join(here, "..", "app", "src-tauri", "ffmpeg");
const exe = process.platform === "win32" ? ".exe" : "";
const env = { ...process.env, HYPERFRAMES_FFMPEG_PATH: path.join(ffdir, "ffmpeg" + exe), HYPERFRAMES_FFPROBE_PATH: path.join(ffdir, "ffprobe" + exe) };
const haveFf = fs.existsSync(env.HYPERFRAMES_FFMPEG_PATH);
const KEY = "hg-test-0123456789abcdef";

// Twelve sentences of 4 s; seven scenes; the last one is the call to action.
const SENTENCES = Array.from({ length: 12 }, (_, i) => ({ id: `S${i + 1}`, text: `Sentence ${i + 1} about a busy coffee shop at dawn.`, start: i * 4, end: i * 4 + 3.7 }));
const SCENES = [
  { component: "titlecard-lockup", from: "S1", vars: { wordmark: "Coffee" } },
  { component: "per-word-rise", from: "S2", to: "S3", vars: { text: "Busy shop" } },
  { component: "count-up", from: "S4", vars: { end: 3 } },
  { component: "headline-slam", from: "S5", to: "S6", vars: { text: "Dawn rush" } },
  { component: "grid-card-assemble", from: "S7", to: "S8", vars: { items: "One,Two,Three" } },
  { component: "per-word-rise", from: "S9", to: "S10", vars: { text: "Quiet again" } },
  { component: "cta-close", from: "S11", to: "S12", vars: { action_line: "Comment GUIDE" } },
];
const PROMPT = "A barista pours steaming milk into a cup in a warm, sunlit coffee shop at dawn, seen from the side, hands only. Slow push in, shallow depth of field, soft golden light with deep blue accents on the cups. Photographic, natural, calm.";

function project({ voice = "VOICE" } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "itv-broll-"));
  const proj = path.join(dir, "2026-10-06_coffee");
  const identity = path.join(dir, "identity");
  fs.mkdirSync(path.join(proj, "audio"), { recursive: true });
  fs.mkdirSync(identity, { recursive: true });
  fs.writeFileSync(path.join(proj, "sentences.json"), JSON.stringify(SENTENCES));
  fs.writeFileSync(path.join(proj, "scenes.json"), JSON.stringify({ scenes: SCENES }));
  fs.writeFileSync(path.join(proj, "audio", "vo.mp3"), voice);
  fs.writeFileSync(path.join(proj, "project.json"), JSON.stringify({ schema: 1, id: "2026-10-06_coffee", status: "Scened", language: "en", gates: {} }));
  return { dir, proj, identity };
}

const llmAnswer = (content) => ({ choices: [{ message: { content } }] });
function fakeLlm(answers) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push(JSON.parse(init.body));
    const r = answers[Math.min(calls.length - 1, answers.length - 1)];
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => llmAnswer(r), text: async () => "" };
  };
  impl.calls = calls;
  return impl;
}
const llm = (f) => ({ provider: "gemini", apiKey: "gm-test", fetchImpl: f, sleep: async () => {} });
const GOOD = { clips: [{ scene: 2, from: "S2", to: "S3", prompt: PROMPT }, { scene: 5, from: "S7", to: "S8", prompt: PROMPT.replace("barista", "baker") }] };

test("settings: off by default, the limit on its slider, unknown values back to the default", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "itv-brs-"));
  assert.deepEqual(loadSettings(dir), { schema: "itv-broll-settings/1", enabled: false, generator: "heygen-video-1", quality: "768p", capUsd: 1 });
  assert.equal(capOf(0.3), 1);
  assert.equal(capOf(12), 10);
  assert.equal(capOf(2.26), 2.5);
  assert.equal(normalizeSettings({ generator: "veo", quality: "4k" }).generator, "heygen-video-1");
  assert.equal(normalizeSettings({ quality: "4k" }).quality, "768p");
  saveSettings(dir, { enabled: true, quality: "1080p", capUsd: 3.5, generator: "test" });
  assert.deepEqual(loadSettings(dir), { schema: "itv-broll-settings/1", enabled: true, generator: "test", quality: "1080p", capUsd: 3.5 });
  fs.rmSync(dir, { recursive: true, force: true });
});

test("prices: whole seconds, at least 5 s, 1080p is three times 768p", () => {
  assert.equal(orderSeconds(3.2), 5);
  assert.equal(orderSeconds(7.3), 8);
  assert.equal(orderSeconds(7.02), 7);
  assert.equal(orderSeconds(30), 15);
  assert.equal(usdFor(10, { quality: "480p" }), 0.2);
  assert.equal(usdFor(10, { quality: "768p" }), 0.3);
  assert.equal(usdFor(10, { quality: "1080p" }), 0.9);
  assert.equal(usdFor(10, { generator: "test", quality: "1080p" }), 0);
  assert.equal(aspectOf({}), "16:9");
  assert.equal(aspectOf({ width: 1080, height: 1920 }), "9:16");
  assert.equal(generatorOf("heygen-video-1").key, "heygen");
  assert.throws(() => generatorOf("veo"), /Unknown clip generator/);
});

test("HeyGen Video 1: the order as the docs say, 1080p as 2k, the same order twice is one order", async () => {
  assert.deepEqual(orderBody({ prompt: " A cup. ", seconds: 7, quality: "768p", aspect: "16:9" }), { model: "heygen-video-1", mode: "text_to_video", prompt: "A cup.", duration: 7, resolution: "768p", aspect_ratio: "16:9" });
  assert.equal(orderBody({ prompt: "x", seconds: 5, quality: "1080p" }).resolution, "2k");
  assert.equal(orderBody({ prompt: "x", seconds: 5, quality: "480p" }).resolution, "480p");
  assert.equal(orderBody({ prompt: "x", seconds: 3, quality: "768p" }).duration, 5);
  assert.throws(() => orderBody({ prompt: "x", seconds: 5, quality: "1080p", aspect: "4:3" }), /only for 16:9 and 9:16/);
  assert.throws(() => orderBody({ prompt: "  ", seconds: 5 }), /no picture description/);
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith("/v3/models/videos")) return { ok: true, status: 202, text: async () => JSON.stringify({ data: { video_id: "vid1", status: "pending" } }) };
    if (url.includes("/v3/models/videos/vid1")) return { ok: true, status: 200, text: async () => JSON.stringify({ data: { video_id: "vid1", status: "completed", video_url: "https://resource2.heygen.ai/videos/vid1.mp4", duration: 5 } }) };
    if (url.includes("resource2.heygen.ai")) return { ok: true, status: 200, arrayBuffer: async () => Buffer.from("MP4") };
    throw new Error(`unexpected ${url}`);
  };
  assert.equal(await order({ apiKey: KEY, prompt: "A cup.", seconds: 5, quality: "768p", aspect: "16:9", key: "k1", fetchImpl: f }), "vid1");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers["Idempotency-Key"], "k1");
  assert.equal(calls[0].init.headers["x-api-key"], KEY);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "itv-hgv-"));
  const r = await fetchClip({ apiKey: KEY, id: "vid1", out: path.join(dir, "c.mp4"), fetchImpl: f, sleep: async () => {} });
  assert.equal(fs.readFileSync(r.file, "utf8"), "MP4");
  assert.ok(calls.some((c) => c.url.endsWith("/v3/models/videos/vid1")), "polls the video model's own endpoint");
  // HeyGen's refusal for an account without API credit, in plain words, no key
  const broke = async () => ({ ok: false, status: 402, text: async () => JSON.stringify({ error: { code: "insufficient_credit", message: `Insufficient credits ${KEY}` } }) });
  await assert.rejects(order({ apiKey: KEY, prompt: "A cup.", seconds: 5, fetchImpl: broke }), (e) => /balance is too low/.test(e.message) && !e.message.includes(KEY));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("where clips may go: not the first, the last, a comment call or own footage; at most every third scene", async () => {
  const { proj, dir } = project();
  const { rows } = await sceneRows(proj);
  assert.deepEqual(eligibleScenes(rows).map((r) => r.index), [1, 2, 3, 4, 5]);
  assert.equal(maxClips(rows.length), 2);
  const withFootage = rows.map((r) => (r.index === 3 ? { ...r, footage: "own1" } : r));
  assert.deepEqual(eligibleScenes(withFootage).map((r) => r.index), [1, 2, 4, 5], "a scene with own footage keeps it");
  assert.deepEqual(eligibleScenes(withFootage, { brollClips: new Set(["own1"]) }).map((r) => r.index), [1, 2, 3, 4, 5], "a B-roll clip of this plan may be planned again");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("the plan's checks name every problem", async () => {
  const { proj, dir } = project();
  const { rows } = await sceneRows(proj);
  const ctx = { rows, eligible: eligibleScenes(rows), sentences: SENTENCES, max: 2, library: [{ id: "lib1", about: "a cup", seconds: 5 }] };
  const issues = (clips) => planIssues({ clips }, ctx).join(" | ");
  assert.equal(issues(GOOD.clips), "");
  assert.match(issues([{ scene: 1, from: "S1", prompt: PROMPT }]), /scene 1 is not in DATA scenes/);
  assert.match(issues([{ scene: 7, from: "S11", prompt: PROMPT }]), /scene 7 is not in DATA scenes/);
  assert.match(issues([{ scene: 2, from: "S2", to: "S5", prompt: PROMPT }]), /sentence ids of scene 2/);
  assert.match(issues([{ scene: 2, from: "S2", prompt: PROMPT }, { scene: 3, from: "S4", prompt: PROMPT }]), /next to a scene with a clip/);
  assert.match(issues([{ scene: 2, from: "S2", prompt: PROMPT }, { scene: 4, from: "S5", prompt: PROMPT }, { scene: 6, from: "S9", prompt: PROMPT }]), /at most 2 clips/);
  assert.match(issues([{ scene: 2, from: "S2", prompt: "a cup" }]), /30 to 120 words/);
  assert.match(issues([{ scene: 2, from: "S2", library: "nope" }]), /unknown library clip nope/);
  assert.equal(issues([{ scene: 2, from: "S2", library: "lib1" }]), "", "a library clip needs no prompt");
  assert.match(planIssues({ nope: 1 }, ctx).join(), /answer with/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("plan: the AI's answer, repaired once, becomes broll.json; the brand and the library go in as data", async () => {
  const { proj, identity, dir } = project();
  const settings = saveSettings(identity, { enabled: true });
  const bad = { clips: [{ scene: 1, from: "S1", prompt: PROMPT }] };
  const f = fakeLlm([JSON.stringify(bad), JSON.stringify(GOOD)]);
  const { plan } = await planBroll({ llm: llm(f), projectDir: proj, settings, identity: { card: { appearance: "dark", colors: { background: "#101820", primary: "#ff6a3d" } }, mood: "premium" }, library: { clips: [{ id: "g1", source: "generated", description: "A cup of coffee on a table.", seconds: 5, generated: { aspect: "16:9" } }, { id: "t1", source: "generated", description: "test", seconds: 5, generated: { test: true } }] } });
  assert.equal(f.calls.length, 2, "one repair call");
  const data = f.calls[0].messages[1].content;
  assert.match(data, /"primary": "#ff6a3d"/);
  assert.match(data, /"mood": "premium"/);
  assert.match(data, /"id": "g1"/);
  assert.doesNotMatch(data, /"id": "t1"/, "a test clip is not offered for a real clip");
  assert.match(f.calls[0].messages[0].content, /No real, recognizable person/);
  assert.match(f.calls[1].messages.at(-1).content, /scene 1 is not in DATA scenes/);
  assert.deepEqual(plan.items.map((i) => [i.id, i.from, i.to, i.order, i.state, i.use]), [["b1", "S2", "S3", 8, "planned", true], ["b2", "S7", "S8", 8, "planned", true]]);
  assert.equal(plan.items[0].seconds, 8, "S2 to the start of S4 (the next sentence comes before 0.6 s after the last word)");
  assert.equal(plan.aspect, "16:9");
  assert.equal(plan.stale, false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("estimate and the limit: the app never orders above it by itself", async () => {
  const { proj, identity, dir } = project();
  const settings = saveSettings(identity, { enabled: true, quality: "768p", capUsd: 1 });
  await planBroll({ llm: llm(fakeLlm([JSON.stringify(GOOD)])), projectDir: proj, settings, library: null });
  const e = estimateBroll({ projectDir: proj, settings });
  assert.deepEqual([e.items, e.seconds, e.usd, e.capUsd, e.leftUsd, e.overCap], [2, 16, 0.48, 1, 1, false]);
  const sharp = saveSettings(identity, { enabled: true, quality: "1080p", capUsd: 1 });
  const s = estimateBroll({ projectDir: proj, settings: sharp });
  assert.deepEqual([s.usd, s.overCap], [1.44, true]);
  let posted = 0;
  const f = async () => {
    posted++;
    throw new Error("must not be called");
  };
  await assert.rejects(makeBroll({ projectDir: proj, identityDir: identity, apiKey: KEY, settings: sharp, fetchImpl: f, env }), (err) => err.code === "OVER_CAP" && /about 1.44 USD.*limit is 1.00 USD/.test(err.message));
  assert.equal(posted, 0, "nothing ordered");
  assert.deepEqual(estimateBroll({ projectDir: proj, settings: sharp, ids: ["b1"] }).usd, 0.72, "one clip only");
  fs.rmSync(dir, { recursive: true, force: true });
});

// A real little MP4 for the fake HeyGen to hand out.
function sampleMp4(file) {
  const r = spawnSync(env.HYPERFRAMES_FFMPEG_PATH, ["-y", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=24:duration=5", "-c:v", "libx264", "-pix_fmt", "yuv420p", file]);
  assert.equal(r.status, 0, String(r.stderr));
  return fs.readFileSync(file);
}

function fakeHeygen(mp4, { failVideo = null, brokenPoll = false } = {}) {
  const posts = [];
  let n = 0;
  const impl = async (url, init = {}) => {
    if (url.endsWith("/v3/models/videos") && init.method === "POST") {
      posts.push({ key: init.headers["Idempotency-Key"], body: JSON.parse(init.body) });
      return { ok: true, status: 202, text: async () => JSON.stringify({ data: { video_id: `vid${++n}`, status: "pending" } }) };
    }
    const m = /\/v3\/models\/videos\/(vid\d+)$/.exec(url);
    if (m) {
      if (brokenPoll) return { ok: false, status: 401, text: async () => "{}" };
      if (m[1] === failVideo) return { ok: true, status: 200, text: async () => JSON.stringify({ data: { status: "failed", failure_message: "content policy" } }) };
      return { ok: true, status: 200, text: async () => JSON.stringify({ data: { status: "completed", video_url: `https://resource2.heygen.ai/${m[1]}.mp4` } }) };
    }
    if (url.includes("resource2.heygen.ai")) return { ok: true, status: 200, arrayBuffer: async () => mp4 };
    throw new Error(`unexpected ${url}`);
  };
  impl.posts = posts;
  return impl;
}

test("make: orders, downloads into the video and the library, lays the clips under their sentences", { skip: !haveFf && "bundled ffmpeg not fetched" }, async () => {
  const { proj, identity, dir } = project();
  const mp4 = sampleMp4(path.join(dir, "sample.mp4"));
  const settings = saveSettings(identity, { enabled: true });
  await planBroll({ llm: llm(fakeLlm([JSON.stringify(GOOD)])), projectDir: proj, settings, library: null });
  // the user's own footage over S8 gives way to the B-roll clip there
  const t = JSON.parse(fs.readFileSync(path.join(proj, "scenes.json"), "utf8"));
  fs.writeFileSync(path.join(proj, "scenes.json"), JSON.stringify({ ...t, footage: [{ from: "S8", clip: "own1" }, { from: "S10", clip: "own2" }] }));
  const hg = fakeHeygen(mp4);
  const r = await makeBroll({ projectDir: proj, identityDir: identity, apiKey: KEY, settings, fetchImpl: hg, sleep: async () => {}, env });
  assert.equal(r.made, 2);
  assert.deepEqual(hg.posts.map((p) => [p.body.duration, p.body.resolution, p.body.aspect_ratio]), [[8, "768p", "16:9"], [8, "768p", "16:9"]]);
  assert.ok(hg.posts.every((p) => /^[0-9a-f]{40}$/.test(p.key)), "every order has an idempotency key");
  const plan = loadPlan(proj);
  assert.deepEqual(plan.items.map((i) => i.state), ["done", "done"]);
  assert.equal(plan.spentUsd, 0.48);
  assert.ok(fs.existsSync(path.join(proj, plan.items[0].file)), "the ONE Video keeps its own copy");
  const lib = loadLibrary(identity);
  assert.equal(lib.clips.length, 2);
  assert.deepEqual(lib.clips.map((c) => [c.source, c.generated.generator, c.generated.quality, c.generated.usd]), [["generated", "heygen-video-1", "768p", 0.24], ["generated", "heygen-video-1", "768p", 0.24]]);
  assert.equal(lib.clips[0].generated.prompt, PROMPT);
  const table = JSON.parse(fs.readFileSync(path.join(proj, "scenes.json"), "utf8"));
  assert.deepEqual(table.footage, [{ from: "S2", to: "S3", clip: plan.items[0].clip }, { from: "S7", to: "S8", clip: plan.items[1].clip }, { from: "S10", clip: "own2" }]);
  assert.equal(fs.existsSync(path.join(proj, "broll", "pending.json")), false, "nothing left pending");
  assert.match(fs.readFileSync(path.join(proj, "log.txt"), "utf8"), /broll: 2 made, 0 from the library, 0 failed, 2 in the scene table, spent about 0.48 USD/);
  assert.equal(usesGenerated(proj, identity), true);
  assert.equal(buildCard(proj, path.join(proj, "out", "video-1.mp4"), { total: 48, syntheticMedia: usesGenerated(proj, identity) }).syntheticMedia, true);

  // Remove: out of the table, still in the library. Make again: a new order.
  removeItem(proj, "b1");
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(proj, "scenes.json"), "utf8")).footage.map((f) => f.from), ["S7", "S10"]);
  assert.equal(loadLibrary(identity).clips.length, 2);
  updateItem(proj, "b1", { use: true });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(proj, "scenes.json"), "utf8")).footage.map((f) => f.from), ["S2", "S7", "S10"]);
  againItem(proj, "b1", { prompt: PROMPT.replace("dawn", "dusk") });
  assert.equal(estimateBroll({ projectDir: proj, settings }).usd, 0.24);
  await makeBroll({ projectDir: proj, identityDir: identity, apiKey: KEY, settings, fetchImpl: hg, sleep: async () => {}, env });
  assert.equal(hg.posts.length, 3);
  assert.match(hg.posts[2].body.prompt, /dusk/);
  assert.notEqual(hg.posts[2].key, hg.posts[0].key, "a new attempt is a new order");
  assert.equal(loadPlan(proj).spentUsd, 0.72);
  assert.equal(loadLibrary(identity).clips.length, 3, "the old clip stays in the library");

  // A new scene plan (no footage): the paid clips go back under their sentences.
  fs.writeFileSync(path.join(proj, "scenes.json"), JSON.stringify({ scenes: SCENES }));
  assert.equal(attach(proj), 2);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(proj, "scenes.json"), "utf8")).footage.map((f) => f.from), ["S2", "S7"]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("never paid twice: a run cut off while HeyGen works picks its orders up; a failed clip is ordered again", { skip: !haveFf && "bundled ffmpeg not fetched" }, async () => {
  const { proj, identity, dir } = project();
  const mp4 = sampleMp4(path.join(dir, "sample.mp4"));
  const settings = saveSettings(identity, { enabled: true, quality: "480p" });
  await planBroll({ llm: llm(fakeLlm([JSON.stringify(GOOD)])), projectDir: proj, settings, library: null });
  const cut = fakeHeygen(mp4, { brokenPoll: true });
  await assert.rejects(makeBroll({ projectDir: proj, identityDir: identity, apiKey: KEY, settings, fetchImpl: cut, sleep: async () => {}, env }), /rejected the API key/);
  assert.equal(cut.posts.length, 2);
  assert.equal(Object.keys(JSON.parse(fs.readFileSync(path.join(proj, "broll", "pending.json"), "utf8"))).length, 2);
  assert.equal(loadPlan(proj).spentUsd, 0.32, "both orders counted once");
  const e = estimateBroll({ projectDir: proj, settings });
  assert.deepEqual([e.items, e.pending, e.usd], [2, 2, 0], "placed orders cost nothing more");
  // the next run: no new order; vid2 failed at HeyGen
  const next = fakeHeygen(mp4, { failVideo: "vid2" });
  const r = await makeBroll({ projectDir: proj, identityDir: identity, apiKey: KEY, settings, fetchImpl: next, sleep: async () => {}, env });
  assert.equal(next.posts.length, 0, "picked up, not ordered again");
  assert.equal(r.made, 1);
  assert.match(r.failed[0].error, /could not make the B-roll clip: content policy/);
  assert.deepEqual(loadPlan(proj).items.map((i) => i.state), ["done", "failed"]);
  // the failed one is ordered again on the next run
  const third = fakeHeygen(mp4);
  await makeBroll({ projectDir: proj, identityDir: identity, apiKey: KEY, settings, fetchImpl: third, sleep: async () => {}, env });
  assert.equal(third.posts.length, 1);
  assert.equal(third.posts[0].key, cut.posts[1].key, "the same order: HeyGen's idempotency key matches");
  assert.deepEqual(loadPlan(proj).items.map((i) => i.state), ["done", "done"]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("planned again while HeyGen worked: the paid orders land in the library, never lost", { skip: !haveFf && "bundled ffmpeg not fetched" }, async () => {
  const { proj, identity, dir } = project();
  const mp4 = sampleMp4(path.join(dir, "sample.mp4"));
  const settings = saveSettings(identity, { enabled: true });
  await planBroll({ llm: llm(fakeLlm([JSON.stringify(GOOD)])), projectDir: proj, settings, library: null });
  const cut = fakeHeygen(mp4, { brokenPoll: true });
  await assert.rejects(makeBroll({ projectDir: proj, identityDir: identity, apiKey: KEY, settings, fetchImpl: cut, sleep: async () => {}, env }), /rejected the API key/);
  // a new plan, other words: the two orders placed are not wanted by any row
  const other = { clips: [{ scene: 3, from: "S4", prompt: PROMPT.replace("barista", "florist") }] };
  await planBroll({ llm: llm(fakeLlm([JSON.stringify(other)])), projectDir: proj, settings, library: loadLibrary(identity) });
  assert.equal(loadPlan(proj).spentUsd, 0.48, "the money spent stays counted for this video");
  const next = fakeHeygen(mp4);
  const r = await makeBroll({ projectDir: proj, identityDir: identity, apiKey: KEY, settings, fetchImpl: next, sleep: async () => {}, env });
  assert.equal(r.kept, 2, "both earlier orders downloaded into the library");
  assert.equal(next.posts.length, 1, "only the new clip is ordered");
  assert.equal(loadLibrary(identity).clips.length, 3);
  assert.equal(fs.existsSync(path.join(proj, "broll", "pending.json")), false);
  // a new voice with an order still out: the order is kept, then the plan asks to be made again
  const third = fakeHeygen(mp4, { brokenPoll: true });
  againItem(proj, "b1");
  await assert.rejects(makeBroll({ projectDir: proj, identityDir: identity, apiKey: KEY, settings, fetchImpl: third, sleep: async () => {}, env }), /rejected the API key/);
  fs.writeFileSync(path.join(proj, "audio", "vo.mp3"), "A NEW VOICE");
  await assert.rejects(makeBroll({ projectDir: proj, identityDir: identity, apiKey: KEY, settings, fetchImpl: fakeHeygen(mp4), sleep: async () => {}, env }), /earlier voice\. Plan it again\. 1 clip ordered before is in your library now/);
  assert.equal(loadLibrary(identity).clips.length, 4);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("the test generator: free placeholder clips, marked as tests, never planned into a video by itself", { skip: !haveFf && "bundled ffmpeg not fetched" }, async () => {
  const { proj, identity, dir } = project();
  const settings = saveSettings(identity, { enabled: true, generator: "test", quality: "480p" });
  await planBroll({ llm: llm(fakeLlm([JSON.stringify(GOOD)])), projectDir: proj, settings, library: null });
  const e = estimateBroll({ projectDir: proj, settings });
  assert.deepEqual([e.usd, e.test, e.overCap], [0, true, false]);
  const r = await makeBroll({ projectDir: proj, identityDir: identity, apiKey: "", settings, env });
  assert.equal(r.made, 2);
  const lib = loadLibrary(identity);
  assert.ok(lib.clips.every((c) => c.generated.test === true && c.name.startsWith("Test clip")));
  assert.ok(Math.abs(lib.clips[0].seconds - 8) < 0.2, "the ordered length");
  assert.deepEqual(catalogForPlanner(lib), [], "the scene planner never sees a test clip");
  assert.equal(libraryForPlanner(lib, { test: true }).length, 2, "the B-roll planner may reuse them in test mode");
  assert.equal(libraryForPlanner(lib).length, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a new voice makes the plan stale: nothing is made for the old sentences", async () => {
  const { proj, identity, dir } = project();
  const settings = saveSettings(identity, { enabled: true, generator: "test" });
  await planBroll({ llm: llm(fakeLlm([JSON.stringify(GOOD)])), projectDir: proj, settings, library: null });
  fs.writeFileSync(path.join(proj, "audio", "vo.mp3"), "A LONGER NEW VOICE");
  assert.equal(loadPlan(proj).stale, true);
  await assert.rejects(makeBroll({ projectDir: proj, identityDir: identity, apiKey: "", settings, env }), /earlier voice/);
  assert.equal(attach(proj), 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a key is needed for HeyGen, not for the test clips", async () => {
  const { proj, identity, dir } = project();
  const settings = saveSettings(identity, { enabled: true });
  await planBroll({ llm: llm(fakeLlm([JSON.stringify(GOOD)])), projectDir: proj, settings, library: null });
  await assert.rejects(makeBroll({ projectDir: proj, identityDir: identity, apiKey: "", settings, env }), /No HeyGen API key/);
  fs.rmSync(dir, { recursive: true, force: true });
});
