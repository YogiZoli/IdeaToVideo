import "./fixtures/test-catalog.mjs"; // the scene catalog fixture, before any scene module
// visual.test.mjs: the visual check after the build (DECISIONS 130).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { frameTimes, readVerdicts, nextCandidate, estimateVisual, judgeMessages } from "./gates/review/visual.mjs";

test("two frames per scene: past the middle and just before it ends (before the next one starts)", () => {
  const mounts = [{ start: 0, duration: 4 }, { start: 4, duration: 6 }, { start: 9, duration: 3 }];
  assert.deepEqual(frameTimes(mounts), [[2.2, 3.8], [6.75, 8.8], [10.65, 11.8]]);
});

test("the verdicts are read per scene; a missing one counts as passed, a failed one keeps its reason", () => {
  const batch = [{ n: 3 }, { n: 4 }, { n: 5 }];
  const v = readVerdicts('```json\n{"scenes": [{"scene": 3, "fits": false, "reads": true, "problem": "shows sample words"}, {"scene": 4, "fits": true, "reads": false}]}\n```', batch);
  assert.deepEqual(v, [
    { scene: 3, fits: false, reads: true, problem: "shows sample words" },
    { scene: 4, fits: true, reads: false, problem: "no reason given" },
    { scene: 5, fits: true, reads: true, problem: "" },
  ]);
  assert.throws(() => readVerdicts('{"nope": 1}', batch), /no scenes/);
});

test("a failed scene goes to its next candidate: never one tried, never a neighbour's, never one the catalog has off", () => {
  const table = { scenes: [{ component: "per-word-rise" }, { component: "count-up", candidates: ["count-up", "per-word-rise", "caption-highlight", "chart-story", "conic-progress-ring"] }, { component: "chart-story" }] };
  assert.equal(nextCandidate(table, 1, new Set(["count-up"])), "conic-progress-ring");
  assert.equal(nextCandidate(table, 1, new Set(["count-up", "conic-progress-ring"])), null);
});

test("the images go to the AI with the sentence and what the scene type is made to show", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "itv-vis-"));
  const f = path.join(dir, "a.jpg");
  fs.writeFileSync(f, Buffer.from([0xff, 0xd8, 0xff]));
  const [m] = judgeMessages([{ n: 2, text: 'Scene 2. The voice says: "Eight in ten".', frames: [f, f] }]);
  assert.equal(m.content.filter((p) => p.type === "image_url").length, 2);
  assert.match(m.content[0].text, /Be strict about fits/);
  assert.match(m.content[1].text, /Eight in ten/);
  assert.match(m.content[2].image_url.url, /^data:image\/jpeg;base64,/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("the price of the check is known before it runs; the comment-call scene is not checked", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "itv-vis-"));
  fs.writeFileSync(path.join(dir, "scenes.json"), JSON.stringify({ scenes: [{ component: "a" }, { component: "b" }, { component: "cta-close", call: { keyword: "LIST" } }] }));
  const e = estimateVisual({ projectDir: dir, llm: { provider: "gemini", model: "gemini-3.5-flash", effort: "low" } });
  assert.equal(e.scenes, 2);
  assert.ok(e.usd >= 0 && e.high >= e.usd);
  assert.equal(e.guess, true, "Gemini prices are not confirmed");
  fs.rmSync(dir, { recursive: true, force: true });
});
