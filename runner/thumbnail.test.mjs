// thumbnail.test.mjs: the Thumbnail step (DECISIONS 131) without a service
// or the engine: the words rule, the ideas, the Gemini picture call against a
// stand-in, the price, the photos, and the thumbnail block of the Video
// Publishing Card. The live compose (engine snapshot) runs in the e2e.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { wordsIssue, cleanWords, countWords, testIdeas, issuesOf, writeIdeas, MAX_WORDS } from "./thumbnail/ideas.mjs";
import { requestBody, imageOf, makePicture } from "./thumbnail/gemini-image.mjs";
import { picturePrompt, estimate, photosOf, loadState, pick, stateView } from "./thumbnail/index.mjs";
import { thumbnailBlock } from "./thumbnail/card.mjs";
import { wordColors, thumbnailHtml } from "./thumbnail/compose.mjs";
import { modelOf, MODELS, DEFAULT_MODEL } from "./thumbnail/models.mjs";
import { cardForPreset, contrast } from "./brand/card.mjs";
import { validate, loadSchema } from "./schema/validate.mjs";
import { sendCard } from "./publishing.mjs";
import { createProject } from "./project.mjs";

const tmp = (n) => fs.mkdtempSync(path.join(os.tmpdir(), `itv-thumb-${n}-`));
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array(60).fill(7), 0xff, 0xd9]);

function project({ chosen = false } = {}) {
  const { dir } = createProject({ projectsDir: tmp("p"), title: "How to stop wasting time" });
  fs.mkdirSync(path.join(dir, "out"));
  fs.mkdirSync(path.join(dir, "thumbnail"));
  fs.writeFileSync(path.join(dir, "out", "video-1.mp4"), "mp4");
  fs.writeFileSync(path.join(dir, "out", "video-1.card.json"), JSON.stringify(card()));
  fs.writeFileSync(path.join(dir, "thumbnail", "v2.jpg"), jpeg);
  const variants = [{ slot: 2, words: "Stop wasting time", accent: 1, picture: "a clock", pictureFile: "thumbnail/v2-picture.jpg", file: "thumbnail/v2.jpg", withFace: true }];
  fs.writeFileSync(path.join(dir, "thumbnail", "thumbnail.json"), JSON.stringify({ schema: "thumbnail/1", withFace: true, model: DEFAULT_MODEL, variants, chosen: chosen ? { slot: 2, words: "Stop wasting time", withFace: true, width: 1280, height: 720 } : null, spentUsd: 0.1, history: [] }));
  if (chosen) fs.writeFileSync(path.join(dir, "thumbnail", "chosen.jpg"), jpeg);
  return dir;
}
const card = (over = {}) => ({
  schema: "video-publishing-card/1",
  cardId: "0b5c3c1e-6f4e-4f7a-9d3a-2c1b0a9e8f7d",
  videoId: null,
  createdAt: "2026-10-29T12:00:00Z",
  video: { file: "video-1.mp4", seconds: 12, language: "en", title: "T" },
  chapters: [],
  captions: { file: "video-1.srt", language: "en" },
  script: [],
  sentences: [],
  commentCalls: [],
  ...over,
});

test("words: at most 4 and 28 characters, cleaned to one line without quotes", () => {
  assert.equal(MAX_WORDS, 4);
  assert.equal(cleanWords(' "Stop\n wasting"  time '), "Stop wasting time");
  assert.equal(countWords("Stop wasting your time"), 4);
  assert.equal(wordsIssue("Stop wasting your time"), null);
  assert.match(wordsIssue("Stop wasting all your time"), /more than 4 words/);
  assert.match(wordsIssue("Supercalifragilistic expialidocious"), /longer than 28/);
  assert.match(wordsIssue("  "), /empty/);
});

test("ideas: the checks name a long text and an empty picture; the free test ideas fit the rule", () => {
  const bad = issuesOf({ ideas: [{ words: "one two three four five", picture: "x" }, { words: "ok", picture: "" }, { words: "fine", picture: "y" }] }, 3);
  assert.equal(bad.length, 2);
  assert.match(bad[0], /idea 1/);
  assert.match(bad[1], /idea 2: the picture/);
  assert.deepEqual(issuesOf({ ideas: [] }, 3), ['give exactly 3 ideas in "ideas"']);
  const t = testIdeas({ title: "How to stop wasting time every single day", count: 3 });
  assert.equal(t.length, 3);
  for (const x of t) assert.equal(wordsIssue(x.words), null);
});

test("ideas: one Gemini text call; a wrong answer is repaired once", async () => {
  const answers = [
    { ideas: [{ words: "one two three four five", accent: 0, picture: "p" }, { words: "B", accent: 0, picture: "p" }, { words: "C", accent: 0, picture: "p" }] },
    { ideas: [{ words: "Time is gone", accent: 9, picture: "an empty clock" }, { words: "B", accent: 0, picture: "p" }, { words: "C", accent: 0, picture: "p" }] },
  ];
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, body: JSON.parse(init.body) });
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ choices: [{ message: { content: JSON.stringify(answers[seen.length - 1]) } }] }) };
  };
  const ideas = await writeIdeas({ apiKey: "k", fetchImpl, title: "T", hook: "H", audience: "A", count: 3 });
  assert.equal(seen.length, 2);
  assert.match(seen[0].url, /generativelanguage/);
  assert.equal(ideas[0].words, "Time is gone");
  assert.equal(ideas[0].accent, 2, "an accent outside the words goes to the last word");
});

test("picture call: the Interactions body with the photos, the image found in both answer forms", async () => {
  const b = requestBody({ model: "gemini-nano-banana-2.1", prompt: "P", refs: [{ mime: "image/png", data: "QUJD" }] });
  assert.deepEqual(b.response_format, { type: "image", mime_type: "image/jpeg", aspect_ratio: "16:9", image_size: "1K" });
  assert.deepEqual(b.input[1], { type: "image", mime_type: "image/png", data: "QUJD" });
  assert.equal(imageOf({ output_image: { data: "AA" } }), "AA");
  assert.equal(imageOf({ steps: [{ type: "model_output", content: [{ type: "text", text: "x" }, { type: "image", data: "BB" }] }] }), "BB");
  assert.equal(imageOf({ steps: [] }), null);

  const ok = async (url, init) => {
    assert.equal(init.headers["x-goog-api-key"], "k");
    return { ok: true, status: 200, json: async () => ({ output_image: { data: jpeg.toString("base64") } }) };
  };
  assert.deepEqual(await makePicture({ apiKey: "k", fetchImpl: ok, model: "m", prompt: "P" }), jpeg);
  const refused = async () => ({ ok: true, status: 200, json: async () => ({ steps: [] }) });
  await assert.rejects(makePicture({ apiKey: "k", fetchImpl: refused, model: "m", prompt: "P" }), /made no picture/);
  const noKey = async () => ({ ok: false, status: 403, text: async () => JSON.stringify({ error: { message: "billing" } }) });
  await assert.rejects(makePicture({ apiKey: "secret", fetchImpl: noKey, model: "m", prompt: "P" }), /billing turned on/);
  await assert.rejects(makePicture({ apiKey: "", fetchImpl: ok, model: "m", prompt: "P" }), /No Gemini API key/);
});

test("picture prompt: no text in the picture, the left side kept calm, the face only when on", () => {
  const colors = cardForPreset().colors;
  const off = picturePrompt({ idea: { picture: "an empty clock" }, colors, withFace: false });
  assert.match(off, /no text, letters/i);
  assert.match(off, /left 45%/);
  assert.match(off, /an empty clock/);
  assert.doesNotMatch(off, /reference photo/);
  const on = picturePrompt({ idea: { picture: "x" }, colors, withFace: true, photoCount: 2 });
  assert.match(on, /2 reference photos/);
  assert.match(on, /Do not change the face/);
});

test("price: free in test mode; 3 pictures with Nano Banana 2.1 cost about 10 cents, photos and Pro cost more", () => {
  const dir = project();
  const ident = tmp("i");
  assert.equal(estimate({ projectDir: dir, identityDir: ident, model: "test" }).usd, 0);
  const plain = estimate({ projectDir: dir, identityDir: ident, model: DEFAULT_MODEL });
  assert.ok(plain.usd >= 0.1 && plain.usd <= 0.12, String(plain.usd));
  assert.match(plain.text, /^about \$0\.1/);
  fs.mkdirSync(path.join(ident, "photos"));
  for (const n of [1, 2, 3]) fs.writeFileSync(path.join(ident, "photos", `face-${n}.jpg`), jpeg);
  assert.ok(estimate({ projectDir: dir, identityDir: ident, withFace: true }).usd >= plain.usd);
  assert.ok(estimate({ projectDir: dir, identityDir: ident, model: "gemini-3-pro-image" }).usd >= 0.4);
  assert.equal(estimate({ projectDir: dir, identityDir: ident, slots: [2] }).images, 1);
  assert.throws(() => modelOf("nope"), /Unknown picture model/);
  assert.equal(MODELS[DEFAULT_MODEL].usdPerImage, 0.0336);
});

test("photos: only face pictures of the Identity, at most 3", () => {
  const ident = tmp("ph");
  assert.deepEqual(photosOf(ident), []);
  fs.mkdirSync(path.join(ident, "photos"));
  for (const f of ["face-1.jpg", "face-2.PNG", "face-3.webp", "face-4.jpg", "notes.txt"]) fs.writeFileSync(path.join(ident, "photos", f), "x");
  const p = photosOf(ident);
  assert.equal(p.length, 3);
  assert.deepEqual(p.map((x) => x.mime), ["image/jpeg", "image/png", "image/webp"]);
});

test("compose: the words read on the panel (7:1, the accent 4.5:1) in every preset; one word per line", () => {
  for (const preset of [undefined, "warm-editorial", "neon-noir"]) {
    let c;
    try {
      c = cardForPreset(preset);
    } catch {
      continue;
    }
    const w = wordColors(c);
    assert.ok(contrast(w.text, w.panel) >= 7, `${preset} text`);
    assert.ok(contrast(w.accent, w.panel) >= 4.5, `${preset} accent`);
  }
  const html = thumbnailHtml({ words: "Stop <wasting> time", accent: 1, colors: wordColors(cardForPreset()), family: "Inter" });
  assert.equal((html.match(/<span class="w/g) ?? []).length, 3);
  assert.match(html, /<span class="w a">&lt;wasting&gt;<\/span>/);
  assert.match(html, /data-composition-id="main"/);
});

test("card: no thumbnail block until one is picked; then a valid block with the picture inside", () => {
  const none = project();
  assert.equal(thumbnailBlock(none, path.join(none, "out", "video-1.mp4")), null);

  const dir = project({ chosen: true });
  const b = thumbnailBlock(dir, path.join(dir, "out", "video-1.mp4"));
  assert.equal(b.file, "video-1.thumbnail.jpg");
  assert.equal(b.mime, "image/jpeg");
  assert.equal(b.bytes, jpeg.length);
  assert.equal(b.sha256, crypto.createHash("sha256").update(jpeg).digest("hex"));
  assert.equal(Buffer.from(b.data, "base64").length, jpeg.length);
  assert.equal(b.withFace, true);
  assert.ok(fs.existsSync(path.join(dir, "out", "video-1.thumbnail.jpg")), "a copy next to the video, for people");
  const schema = loadSchema("video-publishing-card");
  assert.deepEqual(validate(card({ thumbnail: b }), schema), []);
  assert.deepEqual(validate(card(), schema), [], "a card without the block is valid exactly as before");
  assert.ok(validate(card({ thumbnail: { ...b, sha256: "x" } }), schema).length > 0);
  assert.ok(validate(card({ thumbnail: { ...b, width: 320 } }), schema).length > 0);
});

test("pick: the variant becomes chosen.jpg and lands in the latest card, same cardId", () => {
  const dir = project();
  const r = pick({ projectDir: dir, identityDir: tmp("i"), slot: 2 });
  assert.equal(r.chosen.slot, 2);
  assert.ok(fs.existsSync(path.join(dir, "thumbnail", "chosen.jpg")));
  const c = JSON.parse(fs.readFileSync(path.join(dir, "out", "video-1.card.json"), "utf8"));
  assert.equal(c.cardId, card().cardId);
  assert.equal(c.thumbnail.words, "Stop wasting time");
  assert.throws(() => pick({ projectDir: dir, identityDir: tmp("i"), slot: 3 }), /does not exist/);
  assert.match(fs.readFileSync(path.join(dir, "log.txt"), "utf8"), /variant 2 chosen/);
  assert.equal(loadState(tmp("empty")).variants.length, 0);
  assert.equal(stateView({ projectDir: dir, identityDir: tmp("i") }).hasVideo, true);
});

test("send: a card over 2 MB is not sent and says why", async () => {
  const f = path.join(tmp("big"), "video-1.card.json");
  fs.writeFileSync(f, JSON.stringify(card({ thumbnail: { data: "A".repeat(2.2 * 1024 * 1024) } })));
  const r = await sendCard({ url: "https://example.com", token: "t", cardFile: f, fetchImpl: async () => assert.fail("must not send") });
  assert.equal(r.ok, false);
  assert.match(r.message, /more than the publishing app takes/);
});
