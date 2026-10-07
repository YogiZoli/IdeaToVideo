// packaging.test.mjs: the packaging at gate 1 (DECISIONS 86, Zoltan
// 2026-10-07): made with the script, the chosen title is the script's title,
// the user's choice survives new ideas, the Video tab's texts are put
// together by code.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makePackaging, savePackaging, loadPackaging, youtubeTexts } from "./gates/render/youtube.mjs";

const answer = (n) => ({ titles: [`Idea ${n} one`, `Idea ${n} two`, `Idea ${n} three`], summary: `Summary ${n}.`, tags: [`tag ${n}`, "youtube growth", "Youtube Growth"] });
const llmWith = (n) => ({ provider: "gemini", apiKey: "stand-in", sleep: async () => {}, fetchImpl: async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ choices: [{ message: { content: JSON.stringify(answer(n)) } }] }) }) });

function project() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "itv-pack-"));
  fs.writeFileSync(path.join(dir, "script.md"), "# Working title\n\n## OPEN\n\nHello.\n\n## OWN\n\nBye.\n");
  fs.writeFileSync(path.join(dir, "script.json"), JSON.stringify({ title: "Working title" }));
  return dir;
}

test("packaging: made from the script, the first idea is the script's title until the user chooses", async () => {
  const dir = project();
  const p = await makePackaging({ llm: llmWith(1), projectDir: dir });
  assert.deepEqual(p.titles, ["Idea 1 one", "Idea 1 two", "Idea 1 three"]);
  assert.equal(p.title, "Idea 1 one");
  assert.deepEqual(p.tags, ["tag 1", "youtube growth"], "tags cleaned, no duplicates");
  assert.equal(p.chosen, false);
  assert.match(fs.readFileSync(path.join(dir, "script.md"), "utf8"), /^# Idea 1 one$/m);
  const again = await makePackaging({ llm: llmWith(2), projectDir: dir });
  assert.equal(again.title, "Idea 2 one", "not chosen yet: new ideas replace everything");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("packaging: the user's choice stays when the script is written again, and is the script's title", async () => {
  const dir = project();
  await makePackaging({ llm: llmWith(1), projectDir: dir });
  const saved = savePackaging(dir, { title: "My own title", summary: "My summary.", tags: ["a", "b, c"] });
  assert.equal(saved.chosen, true);
  assert.deepEqual(saved.tags, ["a", "b c"]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "script.json"), "utf8")).title, "My own title");
  assert.match(fs.readFileSync(path.join(dir, "script.md"), "utf8"), /^# My own title$/m);
  const after = await makePackaging({ llm: llmWith(2), projectDir: dir });
  assert.equal(after.title, "My own title");
  assert.equal(after.summary, "My summary.");
  assert.deepEqual(after.tags, ["a", "b c"]);
  assert.deepEqual(after.titles, ["My own title", "Idea 2 one", "Idea 2 two", "Idea 2 three"], "new ideas next to the choice");
  assert.throws(() => savePackaging(dir, { title: " ", summary: "x", tags: [] }), /title is empty/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("packaging: the Video tab's texts, the description by code from the publishing data", async () => {
  const dir = project();
  const video = path.join(dir, "out", "video-1.mp4");
  assert.equal(youtubeTexts(dir, video), null, "no packaging, no texts");
  await makePackaging({ llm: llmWith(1), projectDir: dir });
  fs.mkdirSync(path.dirname(video));
  fs.writeFileSync(video.replace(/\.mp4$/, ".card.json"), JSON.stringify({ landingUrl: "https://x.example/guide", commentCalls: [{ keyword: "GUIDE", gets: "a free guide" }], chaptersText: "0:00 Intro" }));
  const yt = youtubeTexts(dir, video);
  assert.equal(yt.title, loadPackaging(dir).title);
  assert.equal(yt.description, "Summary 1.\n\nhttps://x.example/guide\n\nGUIDE: a free guide\n\n0:00 Intro\n");
  fs.rmSync(dir, { recursive: true, force: true });
});
