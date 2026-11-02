// The research brief (docs/BUILD_PLAN.md phase 3), against a stand-in AI.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeBrief, groundedSources, cleanBrief, approveBrief, saveBrief, briefForScript, briefForCard } from "./research/index.mjs";

const llm = { provider: "gemini", apiKey: "test-key-123456", model: "m", patient: false, noFallback: true };
const ANSWER = { facts: [{ text: "Steam engines burn coal." }], numbers: [{ text: "A boiler runs at 200 psi." }], dates: [], claims: [{ claim: "Trains are new.", verdict: "wrong", note: "They are old." }], missing: [] };
const reply = (body) => ({ ok: true, status: 200, json: async () => body, headers: { get: () => null } });

function gemini({ chunks = [{ web: { uri: "https://a.example/1", title: "A" } }, { web: { uri: "https://b.example/2", title: "B" } }, { web: { uri: "https://c.example/3", title: "C" } }], seen = [] } = {}) {
  return async (url, opts) => {
    if (opts.method === "HEAD") return { status: 200, headers: { get: () => null } };
    seen.push({ url, opts });
    return reply({ candidates: [{ content: { parts: [{ text: JSON.stringify(ANSWER) }] }, groundingMetadata: { groundingChunks: chunks, groundingSupports: [{ segment: { text: "Steam engines burn coal." }, groundingChunkIndices: [1] }], webSearchQueries: ["steam engines"] } }] });
  };
}

test("Gemini searches: the key goes in a header, sources are what the search used", async () => {
  const seen = [];
  const b = await makeBrief({ llm, topic: "Steam", fetchImpl: gemini({ seen }) });
  assert.match(seen[0].url, /:generateContent$/);
  assert.ok(!seen[0].url.includes(llm.apiKey));
  assert.deepEqual(JSON.parse(seen[0].opts.body).tools, [{ google_search: {} }]);
  assert.equal(b.grounded, true);
  assert.equal(b.state, "pending");
  assert.equal(b.sources.length, 3);
  assert.equal(b.sources[b.facts[0].source - 1].url, "https://b.example/2", "the fact points at its own source");
  assert.deepEqual(b.warnings, []);
});

test("an answer that did not search says so", async () => {
  const b = await makeBrief({ llm, topic: "Steam", fetchImpl: gemini({ chunks: [] }) });
  assert.equal(b.grounded, false);
  assert.match(b.warnings.join(" "), /memory/);
});

test("an AI that cannot search: a source stays only if its address answers", async () => {
  const fetchImpl = async (url, opts) => {
    if (opts.method === "HEAD") return { status: url.includes("good") ? 200 : 404, headers: { get: () => null } };
    return reply({ choices: [{ message: { content: JSON.stringify({ ...ANSWER, sources: [{ title: "G", url: "https://good.example" }, { title: "B", url: "https://bad.example" }] }) } }] });
  };
  const b = await makeBrief({ llm: { provider: "deepseek", apiKey: "test-key-123456", model: "m" }, topic: "Steam", fetchImpl });
  assert.deepEqual(b.sources.map((s) => s.url), ["https://good.example"]);
  assert.equal(b.grounded, false);
});

test("no usable answer stops with a sentence", async () => {
  const fetchImpl = async () => reply({ candidates: [{ content: { parts: [{ text: "sorry" }] } }] });
  await assert.rejects(makeBrief({ llm, topic: "Steam", fetchImpl }), /no usable research brief/);
});

test("sources: at most 8, no doubles, cited first", () => {
  const chunks = Array.from({ length: 10 }, (_, i) => ({ uri: `https://x.example/${i}`, title: `T${i}` }));
  const { sources } = groundedSources([...chunks, chunks[9]], [{ segment: { text: "x" }, groundingChunkIndices: [9] }]);
  assert.equal(sources.length, 8);
  assert.equal(sources[0].url, "https://x.example/9");
  assert.equal(new Set(sources.map((s) => s.url)).size, 8);
});

test("a strange verdict is unclear, doubles go", () => {
  const b = cleanBrief({ facts: ["A.", { text: "a" }], claims: [{ claim: "C", verdict: "maybe" }] });
  assert.equal(b.facts.length, 1);
  assert.equal(b.claims[0].verdict, "unclear");
});

test("the script gets only an approved brief; the card gets sources and flags", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "itv-research-"));
  const brief = { ...cleanBrief(ANSWER), state: "pending", grounded: true, sources: [{ title: "A", url: "https://a.example" }] };
  saveBrief(dir, brief);
  assert.equal(briefForScript(brief), null);
  const ok = approveBrief(dir);
  assert.deepEqual(briefForScript(ok).corrections, [{ claim: "Trains are new.", note: "They are old." }]);
  assert.equal(briefForCard(ok).flags[0].verdict, "wrong");
  fs.rmSync(dir, { recursive: true, force: true });
});
