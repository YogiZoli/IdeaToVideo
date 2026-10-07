// publishing.test.mjs: "Send to Publishing" (DECISIONS 115) against the
// local mock of the contract: new and updated cards, the token, a refused
// card, a server problem, no answer, and the address rules.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sendCard, checkUrl, sameOrigin } from "./publishing.mjs";
import { startMock } from "../scripts/publishing-mock.mjs";

const card = (over = {}) => ({
  schema: "video-publishing-card/1",
  cardId: "0b5c3c1e-6f4e-4f7a-9d3a-2c1b0a9e8f7d",
  videoId: null,
  createdAt: "2026-10-07T12:00:00Z",
  video: { file: "video-1.mp4", seconds: 12, language: "en", title: "T" },
  chapters: [],
  captions: { file: "video-1.srt", language: "en" },
  script: [],
  sentences: [],
  commentCalls: [],
  packaging: { titles: ["T"], title: "T", summary: "S.", tags: ["t"] },
  ...over,
});
function cardFile(c = card()) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "itv-pub-")), "video-1.card.json");
  fs.writeFileSync(f, JSON.stringify(c));
  return f;
}

test("send: a new card is 201, the same cardId again is 200 and updates it, the link is shown", async () => {
  const m = await startMock({ token: "tok" });
  try {
    const f = cardFile();
    const a = await sendCard({ url: m.url, token: "tok", cardFile: f });
    assert.equal(a.ok, true);
    assert.equal(a.status, 201);
    assert.equal(a.updated, false);
    assert.equal(a.cardId, card().cardId);
    assert.equal(a.url, `${m.url}/cards/${card().cardId}`);
    fs.writeFileSync(f, JSON.stringify(card({ packaging: { titles: ["New"], title: "New", summary: "S.", tags: [] } })));
    const b = await sendCard({ url: `${m.url}/`, token: "tok", cardFile: f });
    assert.equal(b.status, 200);
    assert.equal(b.updated, true);
    assert.equal(m.cards.size, 1);
    assert.equal(m.cards.get(card().cardId).packaging.title, "New");
  } finally {
    await m.close();
  }
});

test("send: 4xx says the server's sentence, no retry; 5xx and no answer can be tried again", async () => {
  const m = await startMock({ token: "tok", fail: [503] });
  try {
    const f = cardFile();
    const down = await sendCard({ url: m.url, token: "tok", cardFile: f });
    assert.deepEqual([down.ok, down.retry, down.status], [false, true, 503]);
    assert.match(down.message, /had a problem \(503\)\. Try again/);
    const wrong = await sendCard({ url: m.url, token: "nope", cardFile: f });
    assert.deepEqual([wrong.ok, wrong.retry, wrong.status, wrong.message], [false, false, 401, "The token is not valid."]);
    const bad = await sendCard({ url: m.url, token: "tok", cardFile: cardFile(card({ cardId: "x" })) });
    assert.equal(bad.status, 400);
    assert.match(bad.message, /The card is not valid/);
  } finally {
    await m.close();
  }
  const gone = await sendCard({ url: m.url, token: "tok", cardFile: cardFile() });
  assert.deepEqual([gone.ok, gone.retry], [false, true]);
  assert.match(gone.message, /could not be reached/);
  const slow = await sendCard({ url: "https://x.example", token: "tok", cardFile: cardFile(), timeoutMs: 20, fetchImpl: (u, o) => new Promise((_, rej) => o.signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })))) });
  assert.match(slow.message, /did not answer in 30 seconds/);
});

test("the address: https, plain http only on this computer; no token, no card, a foreign link", async () => {
  assert.equal(checkUrl("https://pub.example/app/"), "https://pub.example/app");
  assert.equal(checkUrl("http://localhost:8787"), "http://localhost:8787");
  assert.equal(checkUrl("http://127.0.0.1:9"), "http://127.0.0.1:9");
  assert.throws(() => checkUrl("http://pub.example"), /must start with https/);
  assert.throws(() => checkUrl("ftp://pub.example"), /must start with https/);
  assert.throws(() => checkUrl("https://u:p@pub.example"), /user name or password/);
  assert.throws(() => checkUrl("https://pub.example/?x=1"), /\? or #/);
  assert.throws(() => checkUrl(""), /Set the Publishing address/);
  assert.match((await sendCard({ url: "https://pub.example", token: "", cardFile: cardFile() })).message, /token/);
  assert.match((await sendCard({ url: "https://pub.example", token: "t", cardFile: "x.json" })).message, /no publishing card/);
  assert.equal(sameOrigin("https://evil.example/x", "https://pub.example"), null);
  assert.equal(sameOrigin("javascript:alert(1)", "https://pub.example"), null);
  assert.equal(sameOrigin("https://pub.example/cards/1", "https://pub.example/app"), "https://pub.example/cards/1");
});
