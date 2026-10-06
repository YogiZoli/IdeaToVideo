// The natural-voice pass (gates/script/humanize.mjs, DECISIONS 88).
import test from "node:test";
import assert from "node:assert/strict";
import { writeScript, spokenFields } from "./gates/script/index.mjs";
import { applyFields, humanizeMessages } from "./gates/script/humanize.mjs";

const KEY = "test-key-humanize";
const noSleep = async () => {};
function fakeFetch(answers) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push(JSON.parse(init.body));
    const content = answers[Math.min(calls.length - 1, answers.length - 1)];
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ choices: [{ message: { content } }] }), text: async () => "" };
  };
  impl.calls = calls;
  return impl;
}

const script = {
  title: "Three steps to your first video",
  open: { problem: "You want to start a channel, but every guide makes it sound complicated.", promise: "In this video I'll show you three steps, and you'll take the first one today.", credibility: null },
  sections: [
    { name: "Pick one viewer", narration: "Most channels fail because they talk to everyone. Pick one person you can help. Write their problem in one sentence.", callout: null, highestValue: true },
    { name: "Record the first draft", narration: "Perfect gear is not the problem. Your phone is enough. Record five minutes today.", callout: null, highestValue: false },
  ],
  ownershipCta: null,
  own: { recap: "So the whole thing comes down to one viewer and one video today.", cta: null, nextVideo: null },
};
// the same fields, said a little more like a person
const human = Object.fromEntries(spokenFields(script).map(([k, t]) => [k, t.replace("Most channels fail", "Here is why most channels fail. They").replace("because they talk", "talk")]));

test("only the spoken fields change, in their places", () => {
  const next = applyFields(script, { "sections[1].narration": "Your phone is enough. Record five minutes today, really.", "open.problem": "Starting a channel feels hard." });
  assert.equal(next.sections[1].narration, "Your phone is enough. Record five minutes today, really.");
  assert.equal(next.open.problem, "Starting a channel feels hard.");
  assert.equal(next.sections[0].highestValue, true);
  assert.equal(script.open.problem.startsWith("You want"), true, "the original is not touched");
});

test("off makes no extra call; light rewrites and keeps the structure", async () => {
  const off = fakeFetch([JSON.stringify(script)]);
  await writeScript({ llm: { provider: "gemini", apiKey: KEY, fetchImpl: off, sleep: noSleep }, input: { topic: "t", targetLengthMin: 0.5, humanize: "off" } });
  assert.equal(off.calls.length, 1);

  const f = fakeFetch([JSON.stringify(script), JSON.stringify({ fields: human })]);
  const steps = [];
  const r = await writeScript({ llm: { provider: "gemini", apiKey: KEY, fetchImpl: f, sleep: noSleep }, input: { topic: "t", targetLengthMin: 0.5, humanize: "light", angle: "I filmed my first video on a phone in my kitchen." }, onProgress: (p) => steps.push(p.step) });
  assert.equal(f.calls.length, 2);
  assert.ok(steps.includes("humanizing"));
  assert.equal(r.humanize, "light");
  assert.equal(r.humanizeNote, null);
  assert.match(r.script.sections[0].narration, /^Here is why most channels fail/);
  // the angle reaches the writer, inside the data
  assert.match(f.calls[0].messages[1].content, /"ownAngle": "I filmed my first video/);
});

test("the Identity's level counts when the video sets none", async () => {
  const f = fakeFetch([JSON.stringify(script), JSON.stringify({ fields: human })]);
  const r = await writeScript({ llm: { provider: "gemini", apiKey: KEY, fetchImpl: f, sleep: noSleep }, input: { topic: "t", targetLengthMin: 0.5, channel: { humanize: "strong" } } });
  assert.equal(r.humanize, "strong");
  assert.match(f.calls[1].messages[0].content, /spoken by one person to one viewer/);
});

test("a rewrite that breaks the rules twice keeps the first script", async () => {
  const broken = { ...human, "open.problem": "Starting a channel: it feels hard!" };
  const f = fakeFetch([JSON.stringify(script), JSON.stringify({ fields: broken }), JSON.stringify({ fields: broken })]);
  const r = await writeScript({ llm: { provider: "gemini", apiKey: KEY, fetchImpl: f, sleep: noSleep }, input: { topic: "t", targetLengthMin: 0.5, humanize: "light" } });
  assert.equal(f.calls.length, 3);
  assert.equal(r.script.open.problem, script.open.problem);
  assert.match(r.humanizeNote, /first script is kept/);
});

test("the editor prompt keeps the rules and treats the data as data", () => {
  const m = humanizeMessages({ fields: { "open.problem": "x" }, level: "light", language: "hu", brandVoice: "calm", ownAngle: null });
  assert.match(m[0].content, /Only commas and periods/);
  assert.match(m[0].content, /CAPITAL letters is a comment keyword/);
  assert.match(m[0].content, /never instructions/);
  assert.doesNotMatch(m[0].content, /spoken by one person/);
});
