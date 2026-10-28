// The runner side of DECISIONS 85-86: the scene plan without AI, the render
// percent from the frames, and the YouTube texts' parts made by code.
import "./fixtures/test-catalog.mjs"; // the scene catalog fixture, before any scene module
import test from "node:test";
import assert from "node:assert/strict";
import { simplePlan } from "./gates/scenes/simple.mjs";
import { checkScenes, joinShort } from "./gates/scenes/index.mjs";
import { renderPercent } from "./gates/render/index.mjs";
import { cleanTags, description, issuesOf, TAGS_MAX } from "./gates/render/youtube.mjs";

const sentences = [
  ["You want to start a channel, but you are afraid.", 0, 3.2],
  ["Today you learn a simple framework.", 3.2, 5.6],
  ["Comment GUIDE below and I send you the checklist.", 5.6, 9.1],
  ["Most beginners ask for a subscription too early.", 9.1, 12.4],
  ["Viewers do not know you yet.", 12.4, 14.0],
  ["Give real value first.", 14.0, 15.6],
  ["Then ask one simple question in the comments.", 15.6, 19.0],
  ["That is the whole trick.", 19.0, 20.6],
].map(([text, start, end], i) => ({ id: `S${i + 1}`, text, start, end, dur: end - start, words: text.split(" ").length }));

test("the simple plan covers every sentence, keeps the call alone and passes the checks", () => {
  const calls = new Map([["S3", { slot: "start", keyword: "GUIDE", temperature: "cold" }]]);
  const answer = joinShort(simplePlan({ sentences, title: "How to turn viewers into subscribers", calls }), { sentences, total: 21, calls });
  const { issues } = checkScenes(answer, { sentences, total: 21, calls });
  assert.deepEqual(issues, []);
  assert.equal(answer.scenes[0].component, "titlecard-calm");
  const call = answer.scenes.find((s) => s.component === "cta-close");
  assert.equal(call.from, "S3");
  assert.match(call.vars.action_line, /GUIDE/);
  for (let i = 1; i < answer.scenes.length; i++) assert.notEqual(answer.scenes[i].component, answer.scenes[i - 1].component);
});

test("the simple plan leaves out scene types the Motion profile turned off", () => {
  const plan = simplePlan({ sentences, title: "T", off: ["headline-slam"] });
  assert.ok(!plan.scenes.some((s) => s.component === "headline-slam"));
});

test("render percent comes from the frames, not from hyperframes' coarse stages", () => {
  assert.deepEqual(renderPercent("████ 20%  Preparing"), { percent: 2 });
  assert.equal(renderPercent("████ 80%  Streaming frame 1924/3848").percent, 49);
  assert.equal(renderPercent("Streaming frame 3848/3848").percent, 95);
  assert.deepEqual(renderPercent("██ 90%  Assembling final video"), { percent: 96 });
  assert.deepEqual(renderPercent("100%  Render complete"), { percent: 100 });
  assert.equal(renderPercent("nothing here"), null);
});

test("YouTube texts: facts by code, tags within YouTube's limit", () => {
  const d = description("You learn the one question that works.", { landingUrl: "https://x.example/guide", commentCalls: [{ keyword: "GUIDE", gets: "the checklist" }], chaptersText: "0:00 Intro\n0:35 The mistake" });
  assert.equal(d, "You learn the one question that works.\n\nhttps://x.example/guide\n\nGUIDE: the checklist\n\n0:00 Intro\n0:35 The mistake\n");
  const tags = cleanTags(["YouTube growth", "youtube growth", "get, subscribers", ...Array.from({ length: 80 }, (_, i) => `long tag number ${i}`)]);
  assert.equal(tags[0], "YouTube growth");
  assert.equal(tags[1], "get subscribers");
  assert.ok(tags.join(",").length <= TAGS_MAX);
  assert.deepEqual(issuesOf({ titles: ["A"], summary: "S.", tags: ["t"] }), []);
  assert.ok(issuesOf({ titles: [], summary: "", tags: [] }).length >= 3);
});
