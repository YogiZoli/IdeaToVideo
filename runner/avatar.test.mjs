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

test("looks: the user's own first, completed only, then public; key in the header", async () => {
  const f = fakeFetch([
    ["ownership=private", json(200, { data: [{ id: "mine1", name: "Me", avatar_type: "digital_twin", status: "completed", preview_image_url: "https://files.heygen.ai/a.jpg" }, { id: "mine2", name: "Training", status: "processing" }], has_more: false })],
    ["ownership=public", json(200, { data: [{ id: "pub1", name: "Monica", avatar_type: "studio_avatar" }] })],
  ]);
  const looks = await heygen.listLooks({ apiKey: KEY, fetchImpl: f });
  assert.deepEqual(looks.map((l) => [l.id, l.mine]), [["mine1", true], ["pub1", false]]);
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

test("the video request: our own audio, the theme's color, 16:9 1080p", async () => {
  const f = fakeFetch([["/v3/videos", json(200, { data: { video_id: "v1", status: "waiting" } })]]);
  assert.equal(await heygen.createVideo({ apiKey: KEY, avatarId: "look1", audioAssetId: "ast1", background: "#fdfae7", title: "t", fetchImpl: f }), "v1");
  const body = JSON.parse(f.calls[0].body);
  assert.deepEqual(body, { type: "avatar", avatar_id: "look1", audio_asset_id: "ast1", background: { type: "color", value: "#fdfae7" }, aspect_ratio: "16:9", resolution: "1080p", fit: "cover", title: "t" });
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
  fs.rmSync(dir, { recursive: true, force: true });
});

test("previews only from HeyGen's own hosts", () => {
  assert.equal(heygen.isHeygenUrl("https://files.heygen.ai/look/a.jpg"), true);
  assert.equal(heygen.isHeygenUrl("https://resource2.heygen.com/x.mp4"), true);
  assert.equal(heygen.isHeygenUrl("https://evil.example.com/heygen.ai.jpg"), false);
  assert.equal(heygen.isHeygenUrl("http://files.heygen.ai/a.jpg"), false);
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
  fs.writeFileSync(path.join(dir, "audio", "vo.mp3"), "a longer voice two");
  assert.throws(() => avatarClips(dir), /earlier voice/);
  removeAvatar(dir);
  assert.equal(currentAvatar(dir), null);
  fs.rmSync(dir, { recursive: true, force: true });
});
