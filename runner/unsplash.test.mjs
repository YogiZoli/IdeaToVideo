// unsplash.test.mjs: Unsplash photos for the scenes (DECISIONS 117), with
// mock answers; one live search when UNSPLASH_ACCESS_KEY is set.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { search, cachedHit, shapeHit, trackDownload, download, isUnsplashImageUrl, isUnsplashApiUrl, withUtm, RATE_LIMIT_MESSAGE } from "./stock/unsplash.mjs";
import { addStock } from "./stock/index.mjs";
import { testServiceKey } from "./providers/keys.mjs";
import { loadLibrary } from "./footage/library.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "itv-unsplash-"));
const PHOTO = {
  id: "Ab12",
  width: 6000,
  height: 4000,
  alt_description: "a laptop on a wooden desk",
  urls: { raw: "https://images.unsplash.com/photo-1?ixid=x", small: "https://images.unsplash.com/photo-1?w=400", thumb: "https://images.unsplash.com/photo-1?w=200" },
  links: { html: "https://unsplash.com/photos/Ab12", download_location: "https://api.unsplash.com/photos/Ab12/download?ixid=x" },
  user: { name: "Ana Lee", links: { html: "https://unsplash.com/@analee" } },
};
const headers = (h = {}) => ({ get: (k) => h[k.toLowerCase()] ?? null });
const answer = (status, body, h) => ({ ok: status < 300, status, headers: headers(h), json: async () => body, text: async () => JSON.stringify(body) });

test("a photo: hotlinked preview, 1920 px file, credit links with utm, download tracking address", () => {
  const h = shapeHit(PHOTO);
  assert.equal(h.preview, "https://images.unsplash.com/photo-1?w=400");
  assert.equal(h.download, "https://images.unsplash.com/photo-1?ixid=x&w=1920&fm=jpg&q=85");
  assert.equal(h.author, "Ana Lee");
  assert.equal(h.authorUrl, "https://unsplash.com/@analee?utm_source=ideatovideo&utm_medium=referral");
  assert.equal(h.pageUrl, "https://unsplash.com/photos/Ab12?utm_source=ideatovideo&utm_medium=referral");
  assert.equal(h.downloadLocation, PHOTO.links.download_location);
  assert.equal(withUtm("https://unsplash.com/?a=1"), "https://unsplash.com/?a=1&utm_source=ideatovideo&utm_medium=referral");
  assert.equal(shapeHit({ id: "x", urls: {} }), null);
  assert.ok(isUnsplashImageUrl("https://images.unsplash.com/p"));
  assert.ok(!isUnsplashImageUrl("https://evil.com/images.unsplash.com/p"));
  assert.ok(isUnsplashApiUrl("https://api.unsplash.com/photos/x/download"));
  assert.ok(!isUnsplashApiUrl("https://images.unsplash.com/p"));
});

test("search: the Access Key in the header, landscape and safe, cached for an hour, photos only", async () => {
  const dir = tmp();
  const calls = [];
  const ok = async (url, init) => (calls.push({ url, init }), answer(200, { results: [PHOTO, { id: "bad" }] }));
  const r = await search({ apiKey: "ak-1", q: "  home   office ", cacheDir: dir, fetchImpl: ok, now: 1000 });
  assert.equal(r.hits.length, 1);
  assert.equal(calls[0].init.headers.Authorization, "Client-ID ak-1");
  assert.match(calls[0].url, /^https:\/\/api\.unsplash\.com\/search\/photos\?query=home\+office&per_page=18&orientation=landscape&content_filter=high$/);
  assert.ok(!calls[0].url.includes("ak-1"), "the key never in the address");
  await search({ apiKey: "ak-1", q: "home office", cacheDir: dir, fetchImpl: ok, now: 1000 + 59 * 60e3 });
  assert.equal(calls.length, 1, "no second call within the hour");
  await search({ apiKey: "ak-1", q: "home office", cacheDir: dir, fetchImpl: ok, now: 1000 + 61 * 60e3 });
  assert.equal(calls.length, 2);
  assert.equal(cachedHit(dir, "image", "home office", "Ab12").author, "Ana Lee");
  assert.throws(() => cachedHit(dir, "image", "home office", "zz"), /Search again/);
  await assert.rejects(search({ apiKey: "ak-1", q: "x", kind: "video", cacheDir: dir, fetchImpl: ok }), /photos only/);
  await assert.rejects(search({ apiKey: "", q: "y", cacheDir: dir, fetchImpl: ok }), /No Unsplash key/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("Demo mode limit and a wrong key get plain messages; the key never in a message", async () => {
  const limit = async () => answer(403, "Rate Limit Exceeded", { "x-ratelimit-remaining": "0" });
  await assert.rejects(search({ apiKey: "k", q: "a" , fetchImpl: limit }), (e) => e.message === RATE_LIMIT_MESSAGE && /50 searches an hour/.test(e.message));
  const too = async () => answer(429, {});
  await assert.rejects(search({ apiKey: "k", q: "b", fetchImpl: too }), /50 searches an hour/);
  const wrong = async () => answer(401, { errors: ["OAuth error: The access token is invalid"] }, { "x-ratelimit-remaining": "49" });
  await assert.rejects(search({ apiKey: "k", q: "c", fetchImpl: wrong }), /Access Key \(not the Secret key\)/);
  const down = async () => { throw new Error("connect failed, Client-ID secret-ak"); };
  await assert.rejects(search({ apiKey: "secret-ak", q: "d", fetchImpl: down }), (e) => !e.message.includes("secret-ak"));
  const keyLimit = async () => answer(403, {}, { "x-ratelimit-remaining": "0" });
  await assert.rejects(testServiceKey({ service: "unsplash", apiKey: "k", fetchImpl: keyLimit }), /hourly request limit/);
  const seen = [];
  const keyOk = async (url, init) => (seen.push({ url, init }), answer(200, []));
  assert.match((await testServiceKey({ service: "unsplash", apiKey: "ak 2", fetchImpl: keyOk })).message, /Unsplash key works/);
  assert.equal(seen[0].init.headers.Authorization, "Client-ID ak 2");
  assert.equal(seen[0].url, "https://api.unsplash.com/photos?per_page=1");
});

test("adding a photo: the download is registered first, then the file comes from images.unsplash.com", async () => {
  const hit = shapeHit(PHOTO);
  const order = [];
  const f = async (url, init) => (order.push([url, init?.headers?.Authorization ?? null]), { ok: true, status: 200, headers: headers(), arrayBuffer: async () => new ArrayBuffer(4) });
  assert.equal(await trackDownload({ apiKey: "ak", hit, fetchImpl: f }), true);
  assert.deepEqual(order[0], [PHOTO.links.download_location, "Client-ID ak"]);
  await assert.rejects(trackDownload({ apiKey: "ak", hit: { ...hit, downloadLocation: "https://evil.com/x" }, fetchImpl: f }), /Not an Unsplash address/);
  await assert.rejects(download({ hit: { ...hit, download: "https://evil.com/x.jpg" }, out: path.join(tmp(), "a.jpg"), fetchImpl: f }), /Not an Unsplash address/);

  // the whole add: tracking before the file; a failed tracking stops it
  const ident = tmp();
  const calls = [];
  const fail = async (url) => (calls.push(url), answer(403, {}, { "x-ratelimit-remaining": "0" }));
  await assert.rejects(addStock({ identityDir: ident, hit, service: "unsplash", apiKey: "ak", fetchImpl: fail }), /50 searches an hour/);
  assert.deepEqual(calls, [PHOTO.links.download_location], "no file fetched without the tracking call");
  assert.equal(loadLibrary(ident).clips.length, 0);
  await assert.rejects(addStock({ identityDir: ident, hit, service: "nope" }), /Unknown stock source/);
  fs.rmSync(ident, { recursive: true, force: true });
});

test("live: one Unsplash search with UNSPLASH_ACCESS_KEY", { skip: !process.env.UNSPLASH_ACCESS_KEY && "UNSPLASH_ACCESS_KEY not set" }, async () => {
  const r = await search({ apiKey: process.env.UNSPLASH_ACCESS_KEY, q: "home office" });
  assert.ok(r.hits.length > 0, "some photos");
  const h = r.hits[0];
  assert.ok(isUnsplashImageUrl(h.preview) && isUnsplashImageUrl(h.download));
  assert.ok(isUnsplashApiUrl(h.downloadLocation));
  assert.match(h.authorUrl, /utm_source=ideatovideo&utm_medium=referral$/);
});
