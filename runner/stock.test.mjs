// stock.test.mjs: Pixabay photos and videos for the scenes (DECISIONS 111).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { search, cachedHit, shapeHit, isPixabayUrl, cachePreview } from "./stock/pixabay.mjs";
import { photoClip, addStock, suggestQueries } from "./stock/index.mjs";
import { loadLibrary } from "./footage/library.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const ff = path.join(here, "..", "app", "src-tauri", "ffmpeg", `ffmpeg${process.platform === "win32" ? ".exe" : ""}`);
const env = { ...process.env, HYPERFRAMES_FFMPEG_PATH: ff, HYPERFRAMES_FFPROBE_PATH: ff.replace(/ffmpeg(\.exe)?$/, (m, e) => `ffprobe${e ?? ""}`) };
const haveFf = fs.existsSync(ff);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "itv-stock-"));

const IMAGE = { id: 7, pageURL: "https://pixabay.com/photos/desk-7/", tags: "desk, laptop, coffee", user: "ana", imageWidth: 4000, imageHeight: 2600, webformatURL: "https://pixabay.com/get/p.jpg", largeImageURL: "https://pixabay.com/get/l.jpg" };
const VIDEO = { id: 9, pageURL: "https://pixabay.com/videos/city-9/", tags: "city, night", user: "bo", duration: 12, videos: { large: { url: "https://cdn.pixabay.com/l.mp4", width: 3840, height: 2160 }, medium: { url: "https://cdn.pixabay.com/m.mp4", width: 1920, height: 1080, thumbnail: "https://cdn.pixabay.com/m.jpg" }, tiny: { url: "https://cdn.pixabay.com/t.mp4", width: 640, height: 360, thumbnail: "https://cdn.pixabay.com/t.jpg" } } };

test("hits: the 1280 photo, the 1920 video and never 4K, only Pixabay's own hosts", () => {
  assert.equal(shapeHit("image", IMAGE).download, "https://pixabay.com/get/l.jpg");
  const v = shapeHit("video", VIDEO);
  assert.deepEqual([v.download, v.width, v.seconds, v.preview], ["https://cdn.pixabay.com/m.mp4", 1920, 12, "https://cdn.pixabay.com/t.jpg"]);
  assert.ok(isPixabayUrl("https://cdn.pixabay.com/x.mp4"));
  assert.ok(!isPixabayUrl("https://evil.com/pixabay.com/x.jpg"));
});

test("search: safe, landscape, cached for a day; the key never in a message; a hit is taken back only from the cache", async () => {
  const dir = tmp();
  const calls = [];
  const ok = async (url) => (calls.push(url), { ok: true, status: 200, json: async () => ({ hits: [IMAGE] }) });
  const r = await search({ apiKey: "k-123", q: "home office", kind: "image", cacheDir: dir, fetchImpl: ok, now: 1000 });
  assert.equal(r.hits.length, 1);
  assert.match(calls[0], /safesearch=true/);
  assert.match(calls[0], /orientation=horizontal/);
  const again = await search({ apiKey: "k-123", q: "Home  Office", kind: "image", cacheDir: dir, fetchImpl: ok, now: 1000 + 3600e3 });
  assert.equal(again.cached, true);
  assert.equal(calls.length, 1, "no second call within a day");
  await search({ apiKey: "k-123", q: "home office", kind: "image", cacheDir: dir, fetchImpl: ok, now: 1000 + 25 * 3600e3 });
  assert.equal(calls.length, 2, "asked again after a day");
  assert.equal(cachedHit(dir, "image", "home office", "7").download, "https://pixabay.com/get/l.jpg");
  assert.throws(() => cachedHit(dir, "image", "home office", "999"), /Search again/);
  const down = async () => { throw new Error("connect failed https://pixabay.com/api/?key=k-123"); };
  await assert.rejects(search({ apiKey: "k-123", q: "x", cacheDir: dir, fetchImpl: down }), (e) => !e.message.includes("k-123"));
  const bad = async () => ({ ok: false, status: 400, json: async () => ({}) });
  await assert.rejects(search({ apiKey: "k", q: "y", cacheDir: dir, fetchImpl: bad }), /did not accept the key/);
  await assert.rejects(cachePreview({ url: "https://evil.com/a.jpg", dir }), /Not a Pixabay address/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("search words from the script: the title, the section headings, the words it repeats", () => {
  const q = suggestQueries({ title: "How to plan your week", markdown: "## OPEN\nPlan the week.\n## 1. Morning routine\nA calm morning. Coffee and calendar. Calendar again, calendar.\n## OWN\nDone." });
  assert.equal(q[0], "plan week");
  assert.ok(q.includes("morning routine"));
  assert.ok(q.includes("calendar"));
});

test("a photo becomes a 6 s 1920x1080 clip that pushes in, and goes into the footage library with its licence", { skip: !haveFf && "bundled ffmpeg not fetched" }, async () => {
  const dir = tmp();
  const img = path.join(dir, "in.jpg");
  const r = spawnSync(ff, ["-y", "-v", "error", "-f", "lavfi", "-i", "testsrc=size=1280x853:rate=1", "-frames:v", "1", img]);
  assert.equal(r.status, 0, String(r.stderr));
  const ident = path.join(dir, "ident");
  fs.mkdirSync(ident);
  const fetchImpl = async () => ({ ok: true, status: 200, arrayBuffer: async () => fs.readFileSync(img) });
  const hit = shapeHit("image", IMAGE);
  const { clip } = await addStock({ identityDir: ident, hit, query: "home office", fetchImpl, env });
  assert.equal(clip.source, "pixabay");
  assert.equal(clip.credit.license, "Pixabay Content License");
  assert.ok(Math.abs(clip.seconds - 6) < 0.2, `6 s, got ${clip.seconds}`);
  assert.match(clip.description, /Stock photo of desk, laptop, coffee/);
  const second = await addStock({ identityDir: ident, hit, fetchImpl, env });
  assert.equal(second.again, true, "the same item is not downloaded twice");
  assert.equal(loadLibrary(ident).clips.length, 1);
  const probe = spawnSync(env.HYPERFRAMES_FFPROBE_PATH, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", path.join(ident, "footage", clip.file)], { encoding: "utf8" });
  assert.equal(probe.stdout.trim(), "1920,1080");
  fs.rmSync(dir, { recursive: true, force: true });
});
