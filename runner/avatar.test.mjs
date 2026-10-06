import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as heygen from "./providers/avatar/heygen.mjs";
import { avatarClips, currentAvatar, removeAvatar } from "./gates/avatar/index.mjs";

const KEY = "hg-test-0123456789abcdef";
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body), arrayBuffer: async () => Buffer.from("MP4DATA") });

function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? "GET", headers: init.headers, body: init.body });
    for (const [match, reply] of routes) if (url.includes(match)) return typeof reply === "function" ? reply(calls) : reply;
    throw new Error(`unexpected ${url}`);
  };
  impl.calls = calls;
  return impl;
}

test("avatars: the user's own characters with their looks, the reason when not ready, then stock", async () => {
  const f = fakeFetch([
    ["/v3/avatars?ownership=private", json(200, { data: [{ id: "g1", name: "Zoltan", status: "completed" }, { id: "g2", name: "New twin", status: "pending_consent" }], has_more: false })],
    ["group_id=g1", (calls) => (calls.filter((c) => c.url.includes("group_id=g1")).length === 1 ? json(200, { data: [{ id: "look1", name: "Office", avatar_type: "digital_twin" }], has_more: true, next_token: "p2" }) : json(200, { data: [{ id: "look2", name: "Studio", status: "completed" }, { id: "look3", name: "Busy", status: "processing" }], has_more: false }))],
    ["ownership=public", json(200, { data: [{ id: "pub1", name: "Monica", avatar_type: "studio_avatar" }] })],
  ]);
  const r = await heygen.listAvatars({ apiKey: KEY, fetchImpl: f });
  assert.deepEqual(r.own.map((g) => [g.name, g.looks.map((l) => l.id), g.note]), [["Zoltan", ["look1", "look2"], null], ["New twin", [], "waiting for your consent at HeyGen"]]);
  assert.deepEqual(r.stock.map((l) => l.id), ["pub1"]);
  assert.ok(f.calls.some((c) => c.url.includes("token=p2")), "all pages of looks");
  assert.equal(f.calls[0].headers["x-api-key"], KEY);
});

test("balance: wallet in USD, subscription in credits", async () => {
  const w = fakeFetch([["/v3/users/me", json(200, { data: { billing_type: "wallet", wallet: { currency: "usd", remaining_balance: 4.88 } } })]]);
  assert.deepEqual(await heygen.balance({ apiKey: KEY, fetchImpl: w }), { kind: "wallet", remaining: 4.88, currency: "usd" });
  const s = fakeFetch([["/v3/users/me", json(200, { data: { billing_type: "subscription", subscription: { plan: "creator", credits: { premium_credits: { remaining: 120 } } } } })]]);
  assert.equal((await heygen.balance({ apiKey: KEY, fetchImpl: s })).remaining, 120);
});

test("errors are plain words, and the key never shows", async () => {
  const f = fakeFetch([["/v3/videos", json(402, { error: { code: "insufficient_credit", message: `no money for ${KEY}` } })]]);
  await assert.rejects(heygen.createVideo({ apiKey: KEY, avatarId: "a", audioAssetId: "b", background: "#fff", title: "t", fetchImpl: f }), (e) => /balance is too low/.test(e.message) && !e.message.includes(KEY));
  assert.match(heygen.friendly(401, ""), /rejected the API key/);
  assert.match(heygen.friendly(429, JSON.stringify({ error: { code: "quota_exceeded", message: "phone verification needed" } })), /phone verification needed \(quota_exceeded\)/);
});

test("the video request per style: full on the theme color, cut-out as WebM, never stretched", async () => {
  const f = fakeFetch([["/v3/videos", json(200, { data: { video_id: "v1", status: "waiting" } })]]);
  await heygen.createVideo({ apiKey: KEY, avatarId: "look1", audioAssetId: "ast1", background: "#fdfae7", title: "t", full: true, fetchImpl: f });
  await heygen.createVideo({ apiKey: KEY, avatarId: "look1", audioAssetId: "ast1", background: "#fdfae7", title: "t", format: "webm", fetchImpl: f });
  await heygen.createVideo({ apiKey: KEY, avatarId: "look1", audioAssetId: "ast1", background: "#fdfae7", title: "t", fetchImpl: f });
  const [full, cutout, card] = f.calls.map((c) => JSON.parse(c.body));
  assert.deepEqual(full, { type: "avatar", avatar_id: "look1", audio_asset_id: "ast1", resolution: "1080p", title: "t", background: { type: "color", value: "#fdfae7" }, aspect_ratio: "16:9", fit: "cover" });
  assert.deepEqual(cutout, { type: "avatar", avatar_id: "look1", audio_asset_id: "ast1", resolution: "1080p", title: "t", output_format: "webm", aspect_ratio: "auto" });
  assert.equal(cutout.background, undefined, "WebM refuses a background");
  assert.deepEqual(card, { type: "avatar", avatar_id: "look1", audio_asset_id: "ast1", resolution: "1080p", title: "t", aspect_ratio: "auto" });
  assert.equal(heygen.noMatting(new Error("This video avatar does not support webm output. The avatar must be trained with matting enabled.")), true);
});

test("placement: boxes from the frame height, in the chosen corner, never stretched", async () => {
  const { avatarStyle } = await import("./gates/build/assemble.mjs");
  assert.match(avatarStyle({ style: "full" }), /width:100%;height:100%;object-fit:cover/);
  const cut = avatarStyle({ style: "cutout", position: "bottom-right", size: "medium" }, 1920, 1080);
  assert.match(cut, /bottom:0px;right:58px;width:454px;height:605px;object-fit:cover/);
  assert.match(avatarStyle({ style: "circle", position: "top-left", size: "small" }, 1920, 1080), /top:43px;left:58px;width:259px;height:259px;.*border-radius:50%/);
  assert.match(avatarStyle({ style: "card", position: "bottom-left", size: "large" }, 1920, 1080), /bottom:43px;left:58px;width:484px;height:605px;.*border-radius:24px/);
});

test("wait: polls until completed, then downloads; a failure says why", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "itv-hg-"));
  let n = 0;
  const f = fakeFetch([
    ["/v3/videos/v1", () => json(200, { data: ++n < 3 ? { status: "processing" } : { status: "completed", video_url: "https://files.heygen.ai/v1.mp4", duration: 4.1 } })],
    ["files.heygen.ai/v1.mp4", json(200, {})],
  ]);
  const statuses = [];
  const r = await heygen.waitAndDownload({ apiKey: KEY, id: "v1", out: path.join(dir, "open.mp4"), fetchImpl: f, sleep: async () => {}, onStatus: (s) => statuses.push(s) });
  assert.deepEqual(statuses, ["processing", "processing", "completed"]);
  assert.equal(fs.readFileSync(r.file, "utf8"), "MP4DATA");
  const bad = fakeFetch([["/v3/videos/v2", json(200, { data: { status: "failed", failure_message: "avatar not ready" } })]]);
  await assert.rejects(heygen.waitAndDownload({ apiKey: KEY, id: "v2", out: path.join(dir, "x.mp4"), fetchImpl: bad, sleep: async () => {} }), /avatar not ready/);
  // 2026-10-06: a dropped connection while HeyGen works (a laptop waking up)
  // only means "ask again", it never gives up a clip already paid for
  let m = 0;
  const flaky = fakeFetch([
    ["/v3/videos/v3", () => (++m <= 2 ? Promise.reject(new Error("fetch failed")) : m === 3 ? json(503, {}) : json(200, { data: { status: "completed", video_url: "https://files.heygen.ai/v1.mp4" } }))],
    ["files.heygen.ai/v1.mp4", json(200, {})],
  ]);
  const seen = [];
  const r3 = await heygen.waitAndDownload({ apiKey: KEY, id: "v3", out: path.join(dir, "close.mp4"), fetchImpl: flaky, sleep: async () => {}, onStatus: (s) => seen.push(s) });
  assert.deepEqual(seen, ["waiting", "reconnecting", "reconnecting", "completed"]);
  assert.equal(fs.readFileSync(r3.file, "utf8"), "MP4DATA");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("previews only from HeyGen's own hosts", () => {
  assert.equal(heygen.isHeygenUrl("https://files.heygen.ai/look/a.jpg"), true);
  assert.equal(heygen.isHeygenUrl("https://resource2.heygen.com/x.mp4"), true);
  assert.equal(heygen.isHeygenUrl("https://evil.example.com/heygen.ai.jpg"), false);
  assert.equal(heygen.isHeygenUrl("http://files.heygen.ai/a.jpg"), false);
});

test("layout: a new place or size for the clips already made; a cut-out only from transparent clips", async () => {
  const { setLayout, normalizeLayout, DEFAULT_LAYOUT } = await import("./gates/avatar/index.mjs");
  assert.deepEqual(normalizeLayout({ style: "nope", size: "large" }), { ...DEFAULT_LAYOUT, size: "large" });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "itv-lay-"));
  fs.mkdirSync(path.join(dir, "avatar"));
  fs.writeFileSync(path.join(dir, "avatar", "avatar.json"), JSON.stringify({ format: "mp4", layout: { style: "card" }, segments: [] }));
  assert.equal(setLayout(dir, { style: "circle", position: "top-left", size: "small" }).layout.position, "top-left");
  assert.throws(() => setLayout(dir, { style: "cutout" }), /transparent background/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("clips made for an earlier voice are refused, not silently misplaced", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "itv-av-"));
  fs.mkdirSync(path.join(dir, "audio"));
  fs.writeFileSync(path.join(dir, "audio", "vo.mp3"), "voice one");
  assert.deepEqual(avatarClips(dir), []);
  fs.mkdirSync(path.join(dir, "avatar"));
  fs.writeFileSync(path.join(dir, "avatar", "open.mp4"), "clip");
  fs.writeFileSync(path.join(dir, "avatar", "avatar.json"), JSON.stringify({ lookId: "x", voBytes: 9, segments: [{ name: "open", start: 0, duration: 3, file: "avatar/open.mp4" }] }));
  assert.equal(avatarClips(dir).length, 1);
  assert.equal(avatarClips(dir)[0].layout.style, "full", "clips made before layouts existed stay full screen");
  fs.writeFileSync(path.join(dir, "audio", "vo.mp3"), "a longer voice two");
  assert.throws(() => avatarClips(dir), /earlier voice/);
  removeAvatar(dir);
  assert.equal(currentAvatar(dir), null);
  fs.rmSync(dir, { recursive: true, force: true });
});
