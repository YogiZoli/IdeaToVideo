// The B-roll engine (docs/BUILD_PLAN.md phase 1b): sources in their order, the
// license ledger, the prompt rule, and above all that no money moves without the
// channel's switch, the user's yes and room inside both limits.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fitScore, rankHits, accepted, timePoints, ruleClips, autoIssues, addSpend, spentThisMonth, monthOf, budgetOf, finishFind, setPaidWanted, approvePaid, paidBlock, clipUsd, planAuto, findPixabay } from "./broll/engine.mjs";
import { normalizePaid, loadSettings, saveSettings, normalizeSettings } from "./broll/settings.mjs";
import { promptRefusal, orderBody, resultUrl, balance, fetchClip, order, MODEL } from "./generate/kie.mjs";
import { GENERATORS, choices, usdFor, orderSeconds } from "./generate/index.mjs";
import { prelingerLicense, prelingerFile, prelingerHit, nasaFile, commonsVideoHits, searchPrelinger, searchVideos } from "./assets/video-sources.mjs";
import { nasaHit, nasaImageHits } from "./assets/sources.mjs";
import { refusal, clipAsset, logTableFootage, readLedger, logAsset, LICENSES } from "./assets/license.mjs";
import { parallaxHtml, moveFor, clipSeconds, MOVES, MOVE_IDS } from "./broll/parallax.mjs";
import { toTensorData, toGray, DEPTH_MODEL, DEPTH_WIDTH, DEPTH_HEIGHT } from "./broll/depth.mjs";
import { loadPlan, savePlan } from "./broll/index.mjs";
import { testServiceKey } from "./providers/keys.mjs";
import { ffmpegRun } from "./audio.mjs";
import { usesGenerated } from "./broll/index.mjs";
import { fileURLToPath } from "node:url";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "itv-broll-engine-"));
const NOW = new Date("2026-11-15T12:00:00Z");
const paidOn = (over = {}) => normalizeSettings({ paid: { on: true, maxPerVideoUsd: 1, maxPerMonthUsd: 5, ...over } });
const GOOD = "A slow push in over a quiet harbour at dawn, small fishing boats rocking on calm water, soft orange light on the waves, gulls far away, one continuous shot, photographic and natural.";

// A video with a voice, a plan and an Identity, all on disk.
function project(items, { spentUsd = 0 } = {}) {
  const root = tmp();
  const projectDir = path.join(root, "video");
  const identityDir = path.join(root, "identity");
  fs.mkdirSync(path.join(projectDir, "audio"), { recursive: true });
  fs.mkdirSync(identityDir, { recursive: true });
  fs.writeFileSync(path.join(projectDir, "audio", "vo.mp3"), "voice");
  fs.writeFileSync(path.join(projectDir, "scenes.json"), JSON.stringify({ scenes: [] }));
  savePlan(projectDir, { schema: "itv-broll/1", auto: true, voBytes: 5, aspect: "16:9", spentUsd, items, at: "x" });
  return { root, projectDir, identityDir };
}
const row = (id, over = {}) => ({ id, scene: 1, from: "S1", to: "S1", said: "Boats in a harbour.", start: 0, seconds: 4, order: 4, query: "harbour boats", hero: true, prompt: GOOD, library: null, use: true, state: "none", attempt: 0, source: null, ...over });

test("the depth model is the Apache licensed Small size, pinned", () => {
  assert.equal(DEPTH_MODEL.license, "Apache-2.0");
  assert.match(DEPTH_MODEL.url, /depth-anything-v2-small\/resolve\/[0-9a-f]{40}\//);
  assert.match(DEPTH_MODEL.sha256, /^[0-9a-f]{64}$/);
  assert.equal(DEPTH_WIDTH % 14, 0);
  assert.equal(DEPTH_HEIGHT % 14, 0);
});

test("depth: the model's input and its output as gray", () => {
  const t = toTensorData(Uint8Array.from([255, 0, 0, 0, 255, 0]), 2, 1);
  assert.equal(t.length, 6);
  assert.ok(Math.abs(t[0] - (1 - 0.485) / 0.229) < 1e-5);
  assert.ok(Math.abs(t[2] - (0 - 0.456) / 0.224) < 1e-5);
  const gray = toGray(Float32Array.from({ length: 200 }, (_, i) => i));
  assert.equal(gray[100] > 100 && gray[100] < 155, true);
  assert.equal(gray.at(-1), 255);
  assert.equal(gray[0], 0);
});

test("parallax: three moves, 4 to 6 seconds, seeked by the engine's timeline", () => {
  assert.deepEqual(MOVE_IDS, ["push-in", "drift", "orbit"]);
  assert.equal(moveFor(0), "push-in");
  assert.equal(moveFor(4), "drift");
  assert.deepEqual([clipSeconds(2), clipSeconds(4.5), clipSeconds(9)], [4, 5, 6]);
  const html = parallaxHtml({ seconds: 5, move: "orbit" });
  assert.match(html, /data-duration="5"/);
  assert.match(html, /window\.__timelines\["main"\] = tl/);
  assert.match(html, /paused: true/);
  assert.ok(html.includes(JSON.stringify(MOVES.orbit)));
  assert.doesNotMatch(html, /Date\.now|Math\.random|requestAnimationFrame/, "a frame depends only on the timeline");
  assert.throws(() => parallaxHtml({ seconds: 5, move: "spin" }), /Unknown camera move/);
});

test("a prompt never names a person, brand, logo, character or artist", () => {
  assert.equal(promptRefusal(GOOD), null);
  assert.equal(promptRefusal(`${GOOD} No text, no logos.`), null);
  for (const bad of ["A man who looks like Elon Musk walks along a pier at sunset.", "a red can of coca-cola on a table", "Mickey Mouse waves.", "a slow pan in the style of van gogh", "A close shot of a shop with the Nike sign", "the company logo spins slowly", "Painting by Greg Rutkowski", "a shot of a harbour with John Smith on a boat"]) {
    assert.ok(promptRefusal(bad), bad);
  }
  assert.ok(promptRefusal("  "));
  assert.throws(() => orderBody({ prompt: "Batman on a roof" }), /names "Batman"/);
});

test("Kie AI: what is ordered", () => {
  assert.deepEqual(orderBody({ prompt: GOOD, seconds: 5, quality: "720p", aspect: "16:9" }), { model: MODEL.text, input: { prompt: GOOD, resolution: "720p", duration: "5", camera_fixed: false, enable_safety_checker: true, aspect_ratio: "16:9" } });
  const i = orderBody({ prompt: GOOD, imageUrl: "https://t/a.jpg" });
  assert.equal(i.model, MODEL.image);
  assert.equal(i.input.image_url, "https://t/a.jpg");
  assert.equal(i.input.aspect_ratio, undefined);
  assert.throws(() => orderBody({ prompt: GOOD, quality: "4k" }), /Unknown quality/);
});

test("Kie AI: a price per clip, rounded up, and only the engine may order it", () => {
  assert.deepEqual([usdFor(5, { generator: "kie-seedance-v1-lite", quality: "480p" }), usdFor(5, { generator: "kie-seedance-v1-lite", quality: "720p" }), usdFor(5, { generator: "kie-seedance-v1-lite", quality: "1080p" })], [0.05, 0.12, 0.25]);
  assert.equal(orderSeconds(3, "kie-seedance-v1-lite"), 5);
  assert.equal(usdFor(8, { generator: "heygen-video-1", quality: "768p" }), 0.24);
  assert.ok(!choices().generators.some((g) => g.id === "kie-seedance-v1-lite"), "not on the Scenes tab's panel");
  assert.equal(normalizeSettings({ generator: "kie-seedance-v1-lite" }).generator, "heygen-video-1");
  assert.ok(GENERATORS["kie-seedance-v1-lite"].engineOnly);
});

const json = (body, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(body), json: async () => body, headers: { get: () => null } });

test("Kie AI: HTTP 200 can still be a failure; a key never reaches a message", async () => {
  const key = "secret-key-123";
  await assert.rejects(order({ apiKey: key, prompt: GOOD, fetchImpl: async () => json({ code: 402, msg: "insufficient" }) }), /too few credits/);
  await assert.rejects(order({ apiKey: key, prompt: GOOD, fetchImpl: async () => json({ code: 401, msg: "bad" }) }), /rejected the API key/);
  await assert.rejects(order({ apiKey: key, prompt: GOOD, fetchImpl: async () => json({ code: 429, msg: "slow" }) }), (e) => e.transient === true);
  await assert.rejects(order({ apiKey: key, prompt: GOOD, fetchImpl: async () => { throw new Error(`boom ${key}`); } }), (e) => !e.message.includes(key));
  assert.equal(await order({ apiKey: key, prompt: GOOD, fetchImpl: async (url, o) => { assert.equal(o.headers.authorization, `Bearer ${key}`); assert.ok(!String(url).includes(key)); return json({ code: 200, data: { taskId: "t1" } }); } }), "t1");
  assert.deepEqual(await balance({ apiKey: key, fetchImpl: async () => json({ code: 200, data: 200 }) }), { credits: 200, usd: 1 });
  const ok = await testServiceKey({ service: "kie", apiKey: key, fetchImpl: async () => json({ code: 200, data: 200 }) });
  assert.match(ok.message, /key works: 200 credits, about 1\.00 USD/);
});

test("Kie AI: waits, downloads, and a failed clip is said to be not charged", async () => {
  const dir = tmp();
  assert.equal(resultUrl({ resultJson: JSON.stringify({ resultUrls: ["https://c/a.mp4"] }) }), "https://c/a.mp4");
  assert.equal(resultUrl({ resultJson: "nope" }), null);
  const answers = [{ state: "waiting" }, { state: "generating" }, { state: "success", resultJson: JSON.stringify({ resultUrls: ["https://c/a.mp4"] }) }];
  const fetchImpl = async (url) => (String(url).includes("recordInfo") ? json({ code: 200, data: answers.shift() }) : { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode("video").buffer });
  const seen = [];
  await fetchClip({ apiKey: "k", id: "t", out: path.join(dir, "a.mp4"), fetchImpl, sleep: async () => {}, onStatus: (s) => seen.push(s) });
  assert.deepEqual(seen, ["waiting", "generating", "success"]);
  assert.equal(fs.readFileSync(path.join(dir, "a.mp4"), "utf8"), "video");
  await assert.rejects(fetchClip({ apiKey: "k", id: "t", out: path.join(dir, "b.mp4"), fetchImpl: async () => json({ code: 200, data: { state: "fail", failMsg: "no" } }), sleep: async () => {} }), /could not make the B-roll clip.*not charged/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("the ledger: Pixabay is a free license, AI carries model and prompt, stock stays out", () => {
  assert.match(LICENSES.pixabay, /not CC0/);
  const px = { source: "pixabay", license: "pixabay", sourceUrl: "https://pixabay.com/videos/x-1/", author: "a", date: "2026-11-02", title: "harbour" };
  assert.equal(refusal(px), null);
  assert.ok(refusal({ ...px, license: "cc0" }), "Pixabay cannot say CC0");
  assert.ok(refusal({ ...px, sourceUrl: "https://evil.example/x" }));
  const ai = { source: "kie", license: "kie-terms", author: "AI: x", date: "2026-11-02", model: "m", prompt: "p" };
  assert.equal(refusal(ai), null);
  assert.match(refusal({ ...ai, prompt: "" }), /prompt/);
  assert.match(refusal({ ...ai, model: "" }), /model/);
  assert.equal(refusal({ source: "prelinger", license: "pd", sourceUrl: "https://archive.org/details/x", author: "a", date: "d", title: "Boats" }), null);
  assert.ok(refusal({ source: "prelinger", license: "by", sourceUrl: "https://archive.org/details/x", author: "a", date: "d" }));
  assert.ok(refusal({ source: "nasa", license: "us-federal", sourceUrl: "https://nasa.gov.evil.example/x", author: "a", date: "d" }));

  const dir = tmp();
  const table = { footage: [{ clip: "p" }, { clip: "k" }, { clip: "h" }] };
  const clips = [
    { id: "p", file: "p.mp4", name: "Video: boats", credit: { source: "Pixabay", license: "Pixabay Content License", licenseUrl: "https://pixabay.com/l", author: "ana", pageUrl: "https://pixabay.com/videos/b-9/", at: "2026-11-02T10:00:00Z" } },
    { id: "k", file: "k.mp4", name: "AI clip", generated: { generator: "kie-seedance-v1-lite", label: "Seedance", model: "bytedance/seedance-v1-lite", prompt: GOOD, usd: 0.12, at: "2026-11-02T10:00:00Z" } },
    { id: "h", file: "h.mp4", name: "Film", credit: { source: "Prelinger Archives", sourceId: "prelinger", licenseKey: "pd", pageUrl: "https://archive.org/details/x", author: "a", date: "2026-11-02", derived: null } },
    { id: "t", file: "t.mp4", name: "Test", generated: { generator: "test", test: true } },
  ];
  assert.equal(clipAsset(clips[3]), null);
  assert.equal(logTableFootage({ projectDir: dir, table, clips }).length, 3);
  const assets = readLedger(dir).assets;
  assert.match(assets.find((a) => a.source === "pixabay").licenseName, /free license, not CC0/i);
  const k = assets.find((a) => a.source === "kie");
  assert.deepEqual([k.model, k.prompt, k.costUsd, k.date], ["bytedance/seedance-v1-lite", GOOD, 0.12, "2026-11-02"]);
  // two pieces of one film are two records; a clip taken out leaves the ledger
  logAsset(dir, { file: "h2.mp4", source: "prelinger", license: "pd", sourceUrl: "https://archive.org/details/x", author: "a", date: "d", title: "Film" });
  assert.equal(readLedger(dir).assets.length, 4);
  logTableFootage({ projectDir: dir, table: { footage: [{ clip: "p" }] }, clips });
  assert.deepEqual(readLedger(dir).assets.map((a) => a.file), ["p.mp4"]);
  assert.throws(() => logTableFootage({ projectDir: dir, table: { footage: [{ clip: "u" }] }, clips: [{ id: "u", file: "u.mp4", name: "Other", credit: { source: "Unsplash", author: "x" } }] }), /cannot be in this channel's video/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("Prelinger: an item must say public domain itself", () => {
  assert.equal(prelingerLicense("http://creativecommons.org/publicdomain/mark/1.0/"), "pd");
  assert.equal(prelingerLicense("http://creativecommons.org/licenses/publicdomain/"), "pd");
  assert.equal(prelingerLicense("https://creativecommons.org/publicdomain/zero/1.0/"), "cc0");
  assert.equal(prelingerLicense("https://creativecommons.org/licenses/by/4.0/"), "");
  assert.equal(prelingerLicense(undefined), "");
  assert.equal(prelingerFile([{ name: "a.mp4", height: "2160" }, { name: "b.mp4", height: "480" }, { name: "c.mp4", height: "720" }, { name: "d.ogv", height: "720" }]).name, "c.mp4");
  const meta = { files: [{ name: "a b.mp4", height: "480", length: "600", width: "640" }, { name: "__ia_thumb.jpg" }] };
  const hit = prelingerHit({ identifier: "x", title: "Harbor", licenseurl: "http://creativecommons.org/publicdomain/mark/1.0/" }, meta);
  assert.equal(hit.videoUrl, "https://archive.org/download/x/a%20b.mp4");
  assert.equal(hit.seconds, 600);
  assert.equal(refusal(hit), null);
});

test("Prelinger search: the license is read from each item, unlicensed ones cost no request", async () => {
  const asked = [];
  const fetchImpl = async (url) => {
    asked.push(String(url));
    if (String(url).includes("advancedsearch")) return json({ response: { docs: [{ identifier: "good", title: "Harbor boats", licenseurl: "http://creativecommons.org/publicdomain/mark/1.0/" }, { identifier: "none", title: "No license" }, { identifier: "by", title: "CC BY", licenseurl: "https://creativecommons.org/licenses/by/4.0/" }, { identifier: "man", title: "Portrait of a man", licenseurl: "http://creativecommons.org/publicdomain/mark/1.0/" }] } });
    return json({ files: [{ name: "f.mp4", height: "480" }] });
  };
  const hits = await searchPrelinger({ q: "harbor boats", fetchImpl });
  assert.deepEqual(hits.map((h) => h.id), ["good"]);
  assert.ok(!asked.some((u) => u.includes("metadata/none") || u.includes("metadata/by")));
});

test("NASA: a sized MP4, never the master; a credit to someone else stays out", () => {
  assert.equal(nasaFile(["http://x/a~orig.mp4", "http://x/a~large.mp4", "http://x/a~small.mp4", "http://x/a.srt"]), "https://x/a~large.mp4");
  assert.equal(nasaFile(["https://x/a~orig.mp4"]), null);
  const item = (d) => ({ href: "https://x/c.json", data: [{ nasa_id: "1", title: "Launch", ...d }], links: [{ href: "https://x/1~large.jpg", width: 1920 }] });
  assert.equal(nasaHit(item({ description: "Image courtesy of Someone Inc." }), "video"), null);
  assert.equal(nasaHit(item({ photographer: "© A. Person" }), "video"), null);
  assert.equal(nasaHit(item({ secondary_creator: "Rocket Lab" }), "video"), null, "a launch company's own film on NASA's site");
  assert.equal(nasaHit(item({ description: "A launch. Credit: Some Company" }), "video"), null);
  assert.ok(nasaHit(item({ secondary_creator: "NASA/JPL-Caltech/Cornell" }), "video"));
  assert.ok(nasaHit(item({ description: "A launch. Credit: NASA" }), "video"));
  assert.equal(nasaHit(item({}), "video").license, "us-federal");
  assert.equal(nasaImageHits({ collection: { items: [item({})] } })[0].imageUrl, "https://x/1~large.jpg");
});

test("Wikimedia Commons video: PD and CC0 only", () => {
  const page = (id, license) => ({ pageid: id, title: `File:Boats ${id}.webm`, imageinfo: [{ url: `https://u/${id}.webm`, descriptionurl: `https://commons.wikimedia.org/wiki/${id}`, extmetadata: { License: { value: license }, LicenseShortName: { value: license }, Artist: { value: "A" } } }] });
  assert.deepEqual(commonsVideoHits({ query: { pages: { 1: page(1, "cc0"), 2: page(2, "cc-by-sa-4.0"), 3: page(3, "pd") } } }).map((h) => h.id), ["1", "3"]);
});

test("one source down does not hide the others", async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes("archive.org")) throw new Error("down");
    if (String(url).includes("nasa")) return json({ collection: { items: [] } }, 500);
    return json({ query: { pages: { 1: { pageid: 1, title: "File:Boats.webm", imageinfo: [{ url: "https://u/1.webm", descriptionurl: "https://commons.wikimedia.org/wiki/1", extmetadata: { License: { value: "cc0" }, Artist: { value: "A" } } }] } } } });
  };
  const r = await searchVideos({ q: "boats", fetchImpl });
  assert.deepEqual(r.hits.map((h) => h.source), ["wikimedia"]);
  assert.deepEqual(r.failed.map((f) => f.source), ["prelinger", "nasa"]);
});

test("the order of the sources, and what fits", () => {
  const h = (source, title, tags = []) => ({ source, title, tags });
  assert.equal(fitScore(h("x", "Steam locomotives at work"), "steam locomotive"), 1);
  assert.equal(fitScore(h("x", "A train", ["steam"]), "steam locomotive"), 0.5);
  assert.equal(fitScore(h("x", "Cats"), "steam locomotive"), 0);
  const ranked = rankHits([h("wikimedia", "Steam train"), h("nasa", "Steam plume"), h("prelinger", "Steam power"), h("nasa", "Steam man at work"), h("prelinger", "Cats")], "steam");
  assert.deepEqual(ranked.map((x) => x.source), ["prelinger", "nasa", "wikimedia"], "a person's word and a miss drop out");
  // with eyes: what the AI saw; without: only every word, and never an old film
  assert.equal(accepted({ fits: true, person: false }, h("prelinger", "x"), "steam"), true);
  assert.equal(accepted({ fits: true, person: true }, h("nasa", "steam"), "steam"), false);
  assert.equal(accepted({ fits: false, person: false }, h("nasa", "steam"), "steam"), false);
  assert.equal(accepted(null, h("nasa", "steam plume"), "steam plume"), true);
  assert.equal(accepted(null, h("nasa", "steam"), "steam plume"), false);
  assert.equal(accepted(null, h("prelinger", "steam plume"), "steam plume"), false);
  assert.deepEqual(timePoints(null, 5), [0]);
  assert.deepEqual(timePoints(6, 5), [0]);
  assert.deepEqual(timePoints(600, 5), [300, 150, 450]);
});

test("the plan: a dead AI still gives a plan, by rule", async () => {
  const sentences = [{ id: "S1", start: 0, end: 3, text: "The title." }, { id: "S2", start: 3, end: 7, text: "Steam locomotives crossed wide mountain valleys." }, { id: "S3", start: 7, end: 9, text: "It was 1920." }, { id: "S4", start: 9, end: 25, text: "Far too long a sentence about ships and harbours and cranes and more." }];
  const eligible = [{ index: 1, from: "S2", to: "S3" }, { index: 2, from: "S4", to: "S4" }];
  assert.deepEqual(ruleClips(sentences, eligible, 2), [{ scene: 2, from: "S2", to: "S2", query: "steam locomotives crossed", hero: false, prompt: "" }]);
  const opts = { rows: [{}], eligible, sentences, max: 2, maxHero: 1 };
  assert.deepEqual(autoIssues({ clips: [{ scene: 2, from: "S2", query: "steam train", hero: false, prompt: "" }] }, opts), []);
  assert.ok(autoIssues({ clips: [{ scene: 2, from: "S2", query: "steam train", hero: true, prompt: "A man who looks like Elon Musk rides a steam locomotive through wide mountain valleys in soft light, one slow continuous shot from far away, natural colours, calm." }] }, opts).some((i) => /names/.test(i)));
  assert.ok(autoIssues({ clips: [{ scene: 2, from: "S2", query: "", hero: false }] }, opts).some((i) => /query is empty/.test(i)));
  assert.ok(autoIssues({ clips: [{ scene: 3, from: "S4", query: "ships", hero: false }] }, opts).some((i) => /must be 2 to 6 s/.test(i)), "a stretch longer than a clip");
});

test("settings: off by default, kept when the Footage page saves, limits hold", () => {
  const dir = tmp();
  assert.deepEqual(normalizePaid(), { on: false, model: "kie-seedance-v1-lite", quality: "720p", maxPerVideoUsd: 1, maxPerMonthUsd: 5 });
  assert.equal(loadSettings(dir).paid.on, false);
  saveSettings(dir, { paid: { on: true, maxPerVideoUsd: 2.5, maxPerMonthUsd: 20, quality: "480p" } });
  saveSettings(dir, { enabled: true, generator: "test", quality: "480p", capUsd: 2 });
  const s = loadSettings(dir);
  assert.deepEqual([s.enabled, s.paid.on, s.paid.maxPerVideoUsd, s.paid.maxPerMonthUsd, s.paid.quality], [true, true, 2.5, 20, "480p"]);
  assert.equal(normalizePaid({ maxPerVideoUsd: -3 }).maxPerVideoUsd, 0);
  assert.equal(normalizePaid({ quality: "4k" }).quality, "720p");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("the month: per channel, per calendar month, a refund comes back", () => {
  const dir = tmp();
  assert.equal(monthOf(NOW), "2026-11");
  addSpend(dir, 0.12, { itemId: "b1" }, NOW);
  addSpend(dir, 0.12, { itemId: "b2" }, NOW);
  assert.equal(spentThisMonth(dir, NOW), 0.24);
  addSpend(dir, -0.12, { itemId: "b2" }, NOW);
  assert.equal(spentThisMonth(dir, NOW), 0.12);
  assert.equal(spentThisMonth(dir, new Date("2026-12-01T00:00:00Z")), 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("nothing is put forward with the switch off, and a free clip always wins", () => {
  const { root, projectDir, identityDir } = project([row("b1"), row("b2", { state: "done", source: "pixabay", clip: "c" }), row("b3", { hero: false, prompt: "" })]);
  let r = finishFind({ projectDir, identityDir, settings: normalizeSettings({}), now: NOW });
  assert.ok(r.plan.items.every((i) => !i.paidWanted));
  r = finishFind({ projectDir, identityDir, settings: paidOn(), now: NOW });
  assert.deepEqual(r.plan.items.map((i) => [i.id, !!i.paidWanted]), [["b1", true], ["b2", false], ["b3", false]], "only the hero nothing free fits");
  fs.rmSync(root, { recursive: true, force: true });
});

test("the limits decide how many are put forward", () => {
  const { root, projectDir, identityDir } = project(["b1", "b2", "b3"].map((id) => row(id)));
  let plan = finishFind({ projectDir, identityDir, settings: paidOn({ maxPerVideoUsd: 0.25 }), now: NOW }).plan;
  assert.deepEqual(plan.items.map((i) => !!i.paidWanted), [true, true, false]);
  assert.equal(plan.items[2].overBudget, true);
  addSpend(identityDir, 4.9, {}, NOW);
  plan = finishFind({ projectDir, identityDir, settings: paidOn(), now: NOW }).plan;
  assert.equal(plan.items.filter((i) => i.paidWanted).length, 0, "month: 0.10 USD left, a clip is 0.12");
  fs.rmSync(root, { recursive: true, force: true });
});

test("a paid clip needs a prompt, a stretch it can cover, and clean words", () => {
  assert.equal(paidBlock(row("a")), null);
  assert.match(paidBlock(row("a", { prompt: "" })), /no picture description/);
  assert.match(paidBlock(row("a", { seconds: 5.5 })), /5 seconds/);
  assert.match(paidBlock(row("a", { prompt: "Batman on a roof" })), /names/);
  const { root, projectDir } = project([row("b1", { prompt: "" })]);
  assert.throws(() => setPaidWanted({ projectDir, id: "b1", on: true }), /no picture description/);
  fs.rmSync(root, { recursive: true, force: true });
});

// Every refusal below must leave the service untouched.
const noCall = async () => {
  throw new Error("a request went out");
};

test("no yes, no money: every way to refuse happens before any request", async () => {
  const { root, projectDir, identityDir } = project([row("b1", { paidWanted: true })]);
  const settings = paidOn();
  const base = { projectDir, identityDir, apiKey: "k", fetchImpl: noCall, now: NOW, sleep: async () => {} };
  await assert.rejects(approvePaid({ ...base, settings: normalizeSettings({}), quotedUsd: 0.12 }), /off for this channel.*Nothing was spent/);
  await assert.rejects(approvePaid({ ...base, settings, quotedUsd: 0.05 }), /price changed to 0\.12.*Nothing was spent/);
  await assert.rejects(approvePaid({ ...base, settings, quotedUsd: undefined }), /price changed/);
  await assert.rejects(approvePaid({ ...base, settings: paidOn({ maxPerVideoUsd: 0.1 }), quotedUsd: 0.12 }), /Nothing was spent/);
  addSpend(identityDir, 4.95, {}, NOW);
  await assert.rejects(approvePaid({ ...base, settings, quotedUsd: 0.12 }), /this month 0\.05 USD.*Nothing was spent/);
  assert.equal(spentThisMonth(identityDir, NOW), 4.95);
  assert.equal(loadPlan(projectDir).spentUsd, 0);
  assert.equal(loadPlan(projectDir).items[0].state, "none");
  fs.rmSync(root, { recursive: true, force: true });
});

test("a prompt changed to a name stops at the door", async () => {
  const { root, projectDir, identityDir } = project([row("b1", { paidWanted: true, prompt: "Batman on a roof in the rain, one slow shot." })]);
  await assert.rejects(approvePaid({ projectDir, identityDir, apiKey: "k", settings: paidOn(), quotedUsd: 0.12, fetchImpl: noCall, now: NOW }), /names "Batman".*Nothing was spent/);
  fs.rmSync(root, { recursive: true, force: true });
});

test("budget: what the Preview tab shows", () => {
  const { root, projectDir, identityDir } = project([row("b1", { paidWanted: true }), row("b2", { paidWanted: true }), row("b3")], { spentUsd: 0.12 });
  addSpend(identityDir, 1, {}, NOW);
  const b = budgetOf({ plan: loadPlan(projectDir), settings: paidOn(), identityDir, now: NOW });
  assert.deepEqual([b.clipUsd, b.clips, b.totalUsd, b.spentVideoUsd, b.spentMonthUsd, b.leftVideoUsd, b.leftMonthUsd, b.over], [0.12, 2, 0.24, 0.12, 1, 0.88, 4, false]);
  assert.equal(clipUsd(paidOn({ quality: "1080p" })), 0.25);
  fs.rmSync(root, { recursive: true, force: true });
});

test("Pixabay: video first, a person's word stays out, logged as free license", async () => {
  const dir = tmp();
  const { root, projectDir, identityDir } = project([row("b1", { state: "planned", hero: false, prompt: "", query: "harbour boats" })]);
  const videos = [
    { id: 1, pageURL: "https://pixabay.com/videos/m-1/", tags: "harbour, boats, man", user: "a", duration: 12, videos: { medium: { url: "https://cdn.pixabay.com/1.mp4", width: 1920, height: 1080 } } },
    { id: 2, pageURL: "https://pixabay.com/videos/h-2/", tags: "harbour, boats", user: "bo", duration: 12, videos: { medium: { url: "https://cdn.pixabay.com/2.mp4", width: 1920, height: 1080 } } },
  ];
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(String(url));
    if (String(url).includes("/api/videos/")) return json({ hits: videos });
    return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(4) };
  };
  // the file is not a real video here: addClip refuses it, the search itself is what is checked
  await assert.rejects(findPixabay({ projectDir, identityDir, apiKey: "k", fetchImpl, env: { ...process.env, ITV_DATA_DIR: dir, HYPERFRAMES_FFMPEG_PATH: "x", HYPERFRAMES_FFPROBE_PATH: "x" } }), /ffmpeg|video|read/i);
  assert.ok(urls.some((u) => u.includes("cdn.pixabay.com/2.mp4")));
  assert.ok(!urls.some((u) => u.includes("cdn.pixabay.com/1.mp4")));
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(dir, { recursive: true, force: true });
});

test("no Pexels anywhere in the code", () => {
  const roots = ["runner", path.join("app", "src"), path.join("app", "src-tauri", "src")];
  const here = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
  const self = path.basename(new URL(import.meta.url).pathname);
  const word = ["pex", "els"].join("");
  for (const root of roots) {
    for (const f of fs.readdirSync(path.join(here, root), { recursive: true })) {
      const file = String(f);
      if (file.includes("node_modules") || path.basename(file) === self || !/\.(mjs|ts|svelte|rs|md)$/.test(file)) continue;
      assert.ok(!fs.readFileSync(path.join(here, root, file), "utf8").toLowerCase().includes(word), file);
    }
  }
});

// ---- the whole yes, against a stand-in for Kie AI ---------------------------------------

const here = path.dirname(fileURLToPath(import.meta.url));
const ffdir = path.join(here, "..", "app", "src-tauri", "ffmpeg");
const exe = process.platform === "win32" ? ".exe" : "";
const ffEnv = { ...process.env, HYPERFRAMES_FFMPEG_PATH: path.join(ffdir, `ffmpeg${exe}`), HYPERFRAMES_FFPROBE_PATH: path.join(ffdir, `ffprobe${exe}`) };
const haveFf = fs.existsSync(ffEnv.HYPERFRAMES_FFMPEG_PATH);

const SENTENCES = Array.from({ length: 12 }, (_, i) => ({ id: `S${i + 1}`, text: `Sentence ${i + 1} about boats in a quiet harbour at dawn.`, start: i * 4, end: i * 4 + 3.7 }));
const SCENES = [
  { component: "titlecard-lockup", from: "S1", vars: { wordmark: "Boats" } },
  { component: "per-word-rise", from: "S2", to: "S3", vars: { text: "Busy" } },
  { component: "count-up", from: "S4", vars: { end: 3 } },
  { component: "headline-slam", from: "S5", to: "S6", vars: { text: "Dawn" } },
  { component: "grid-card-assemble", from: "S7", to: "S8", vars: { items: "One,Two,Three" } },
  { component: "per-word-rise", from: "S9", to: "S10", vars: { text: "Quiet" } },
  { component: "cta-close", from: "S11", to: "S12", vars: { action_line: "Comment GUIDE" } },
];
function realProject() {
  const root = tmp();
  const projectDir = path.join(root, "2026-11-02_boats");
  const identityDir = path.join(root, "identity");
  fs.mkdirSync(path.join(projectDir, "audio"), { recursive: true });
  fs.mkdirSync(identityDir, { recursive: true });
  fs.writeFileSync(path.join(projectDir, "sentences.json"), JSON.stringify(SENTENCES));
  fs.writeFileSync(path.join(projectDir, "scenes.json"), JSON.stringify({ scenes: SCENES }));
  fs.writeFileSync(path.join(projectDir, "audio", "vo.mp3"), "VOICE");
  fs.writeFileSync(path.join(projectDir, "project.json"), JSON.stringify({ schema: 1, id: "2026-11-02_boats", status: "Scened", language: "en", gates: {} }));
  return { root, projectDir, identityDir };
}
async function realClip(file, seconds = 5) {
  await ffmpegRun(["-f", "lavfi", "-i", `testsrc2=size=320x180:rate=24:duration=${seconds}`, "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", file], ffEnv);
  return fs.readFileSync(file);
}
// Counts every order. Each answer for a task comes from `states`.
function fakeKie(bytes, states = () => "success") {
  const orders = [];
  const impl = async (url, init) => {
    const u = String(url);
    if (u.endsWith("/jobs/createTask")) {
      orders.push(JSON.parse(init.body));
      return json({ code: 200, data: { taskId: `t${orders.length}` } });
    }
    if (u.includes("recordInfo")) {
      const id = new URL(u).searchParams.get("taskId");
      const state = states(id);
      return json({ code: 200, data: state === "success" ? { state, resultJson: JSON.stringify({ resultUrls: [`https://cdn.example/${id}.mp4`] }) } : { state, failMsg: "the model refused" } });
    }
    return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  };
  impl.orders = orders;
  return impl;
}
const heroRow = (id, from, over = {}) => row(id, { from, to: from, scene: Number(from.slice(1)) > 6 ? 4 : 1, seconds: 3.7, start: 0, paidWanted: true, ...over });

test("the yes: ordered once, in the table, on the month, in the ledger", { skip: !haveFf }, async () => {
  const { root, projectDir, identityDir } = realProject();
  savePlan(projectDir, { schema: "itv-broll/1", auto: true, voBytes: 5, aspect: "16:9", spentUsd: 0, items: [heroRow("b1", "S2")], at: "x" });
  const bytes = await realClip(path.join(root, "src.mp4"));
  const kie = fakeKie(bytes);
  const settings = paidOn();
  const r = await approvePaid({ projectDir, identityDir, apiKey: "k", settings, quotedUsd: 0.12, fetchImpl: kie, sleep: async () => {}, env: ffEnv, now: NOW });
  assert.equal(r.made, 1);
  assert.equal(kie.orders.length, 1);
  assert.equal(kie.orders[0].model, MODEL.text);
  assert.equal(kie.orders[0].input.prompt, GOOD);
  assert.equal(kie.orders[0].input.resolution, "720p");
  const item = r.plan.items[0];
  assert.deepEqual([item.state, item.source, item.paidWanted, item.usd], ["done", "ai", false, 0.12]);
  assert.equal(r.plan.spentUsd, 0.12);
  assert.equal(spentThisMonth(identityDir, NOW), 0.12);
  assert.equal(JSON.parse(fs.readFileSync(path.join(projectDir, "scenes.json"), "utf8")).footage[0].clip, item.clip);
  const asset = readLedger(projectDir).assets[0];
  assert.deepEqual([asset.source, asset.model, asset.prompt, asset.costUsd], ["kie", "bytedance/seedance-v1-lite", GOOD, 0.12]);
  assert.equal(usesGenerated(projectDir, identityDir), true, "YouTube's synthetic content question");
  // a second yes finds nothing to pay for
  await assert.rejects(approvePaid({ projectDir, identityDir, apiKey: "k", settings, quotedUsd: 0, fetchImpl: kie, env: ffEnv, now: NOW }), /No paid clip is waiting/);
  assert.equal(kie.orders.length, 1);
  fs.rmSync(root, { recursive: true, force: true });
});

test("a clip Kie AI cannot make is not charged, and the free clip stays", { skip: !haveFf }, async () => {
  const { root, projectDir, identityDir } = realProject();
  const free = { clip: "free1", source: "archive", state: "done", license: "Public Domain", sourceUrl: "https://archive.org/details/x", author: "a" };
  savePlan(projectDir, { schema: "itv-broll/1", auto: true, voBytes: 5, aspect: "16:9", spentUsd: 0, items: [heroRow("b1", "S2", free)], at: "x" });
  const bytes = await realClip(path.join(root, "src.mp4"));
  const kie = fakeKie(bytes, () => "fail");
  const r = await approvePaid({ projectDir, identityDir, apiKey: "k", settings: paidOn(), quotedUsd: 0.12, fetchImpl: kie, sleep: async () => {}, env: ffEnv, now: NOW }).catch((e) => ({ error: e.message, plan: loadPlan(projectDir) }));
  assert.equal(kie.orders.length, 1);
  assert.equal(spentThisMonth(identityDir, NOW), 0, "the month gets it back");
  const plan = loadPlan(projectDir);
  assert.equal(plan.spentUsd, 0, "the video gets it back");
  assert.deepEqual([plan.items[0].state, plan.items[0].source, plan.items[0].clip], ["done", "archive", "free1"]);
  assert.ok(r.error || r.failed.length === 1);
  fs.rmSync(root, { recursive: true, force: true });
});

test("the AI's plan: checked, with search words and hero rows; a bad answer falls back to the rule", async () => {
  const { root, projectDir } = realProject();
  const answer = { clips: [{ scene: 2, from: "S2", to: "S2", query: "harbour boats", hero: true, prompt: GOOD }, { scene: 4, from: "S5", to: "S5", query: "dawn water", hero: false, prompt: "" }] };
  const llm = { provider: "gemini", apiKey: "k", model: "m", fetchImpl: async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ choices: [{ message: { content: JSON.stringify(answer) } }], candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] }), text: async () => "" }) };
  let { plan } = await planAuto({ llm, projectDir });
  assert.equal(plan.auto, true);
  assert.equal(plan.plannedBy, "gemini");
  assert.deepEqual(plan.items.map((i) => [i.query, i.hero, i.order]), [["harbour boats", true, 4], ["dawn water", false, 4]]);
  assert.equal(plan.items[1].prompt, "");
  const bad = { ...llm, fetchImpl: async () => ({ ok: false, status: 400, headers: { get: () => null }, json: async () => ({}), text: async () => "refused" }) };
  ({ plan } = await planAuto({ llm: bad, projectDir }));
  assert.equal(plan.plannedBy, "rule");
  assert.ok(plan.items.every((i) => !i.hero && !i.prompt));
  fs.rmSync(root, { recursive: true, force: true });
});

test("the plan command needs nothing but the table: no AI, no key", async () => {
  await assert.rejects(planAuto({ projectDir: tmp() }), /no sentence table/);
});
