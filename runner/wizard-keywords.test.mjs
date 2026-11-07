// The wizard's deep keyword research and vidIQ's Markdown answer (DECISIONS 183).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readToolResult, markdownTables, cellValue, countryCode, keywordIdeas, deepResearch, plannedCalls, rankKeywords, rankValue } from "./providers/research/vidiq.mjs";
import { research } from "./planner/index.mjs";
import { cardMarkdown, keywordRows, channelKeywords, CHANNEL_KEYWORDS_MAX, QUESTIONS, aboutText } from "./channelwizard/kit.mjs";
import { wizardSave, wizardKit } from "./channelwizard/index.mjs";
import { parseTrafficCard, loadCard } from "./planner/traffic-card.mjs";
import { seedsFrom } from "./planner/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const MD = fs.readFileSync(path.join(here, "fixtures", "vidiq-research.md"), "utf8");
const textResult = (text) => ({ content: [{ type: "text", text }] });

// A stand-in for mcp.vidiq.com: answers keyword research in Markdown (as vidIQ does since 2026-11).
function fakeVidiq({ credits = [500, 455], json = false } = {}) {
  let balance = 0;
  const research = [];
  const fetchImpl = async (_url, init) => {
    const m = JSON.parse(init.body);
    const reply = (result) => new Response(JSON.stringify({ jsonrpc: "2.0", id: m.id, result }), { status: 200, headers: { "mcp-session-id": "s1" } });
    if (m.method === "initialize") return reply({});
    if (!m.id) return new Response("", { status: 202 });
    if (m.params.name === "vidiq_balance") return reply({ structuredContent: { totalCredits: credits[Math.min(balance++, credits.length - 1)] } });
    const a = m.params.arguments;
    research.push(a);
    if (a.keyword === "broken") return reply({ isError: true, content: [{ type: "text", text: "no data" }] });
    const k = a.keyword ?? a.niche;
    const name = { research: "relatedKeywords", matching_terms: "keywords", questions: "questions", rising: "keywords" }[a.mode];
    if (json) return reply(textResult(`Keyword data (JSON):\n${JSON.stringify({ seedKeyword: { keyword: k, estimatedMonthlySearch: 1000, competition: 40, overall: 60 }, relatedKeywords: [] })}`));
    const head = "| keyword | volume | competition | overall | estimatedMonthlySearch | searchDemandGrowthPct | topMarkets (top 3) |\n|---|---|---|---|---|---|---|";
    const seed = a.mode === "research" ? `### seedKeyword (1)\n${head}\n| ${k} | 60 | 40 | 60 | 1000 | null | US 30% |\n\n` : "";
    return reply(textResult(`## Keyword research — mode: ${a.mode}\n\n${seed}### ${name} (2)\n${head}\n| ${k} ${a.mode} one | 50 | 20 | 70 | 400 | +12% | none |\n| shared keyword | 10 | 90 | 10 | <750 | null | none |\n\nNote: Null or missing values are unknown, not 0.`));
  };
  return { fetchImpl, research };
}

test("vidIQ's Markdown answer is read: seed, related, numbers, '<750' and null", () => {
  const d = readToolResult(textResult(MD));
  assert.equal(d.seedKeyword.keyword, "gohighlevel tutorial");
  assert.equal(d.seedKeyword.estimatedMonthlySearch, 129361);
  assert.equal(d.seedKeyword.searchDemandGrowthPct, 98.7);
  assert.equal(d.seedKeyword.topMarkets, "US 37%, BD 12%, AU 7%");
  assert.equal(d.relatedKeywords.length, 2);
  assert.equal(d.relatedKeywords[0].searchDemandGrowthPct, null, "null stays unknown, never 0");
  assert.deepEqual(d.relatedKeywords[1].estimatedMonthlySearch, { value: 750, below: true });
  assert.deepEqual([cellValue("none"), cellValue(""), cellValue("1,200"), cellValue("-3.5%")], [null, null, 1200, -3.5]);
  assert.deepEqual(markdownTables("no tables here"), {});
});

test("the old JSON answer and structured content are still read", () => {
  const data = { seedKeyword: { keyword: "x", estimatedMonthlySearch: 5 }, relatedKeywords: [] };
  assert.deepEqual(readToolResult(textResult(`Keyword data (JSON):\n${JSON.stringify(data)}`)), data);
  assert.deepEqual(readToolResult({ structuredContent: data }), data);
});

test("keyword ideas work again on the Markdown answer, with a 2 letter country", async () => {
  const v = fakeVidiq();
  const r = await keywordIdeas({ apiKey: "k", keyword: "gohighlevel tutorial", country: "United States", fetchImpl: v.fetchImpl });
  assert.equal(r.keywords[0].keyword, "gohighlevel tutorial");
  assert.equal(r.keywords[0].monthlySearches, 1000);
  assert.equal(v.research[0].country, "US");
  assert.deepEqual([countryCode("hu"), countryCode("Hungary"), countryCode("Atlantis"), countryCode("")], ["HU", "HU", null, null]);
});

test("the Playlist Planner's research reads the Markdown answer too", async () => {
  const v = fakeVidiq();
  const r = await research({ apiKey: "k", seeds: ["sourdough"], country: "Germany", fetchImpl: v.fetchImpl });
  assert.ok(r.keywords.some((k) => k.keyword === "sourdough" && k.volume === 1000));
  assert.equal(r.keywords.find((k) => k.keyword === "shared keyword").volume, 750);
  assert.equal(v.research[0].country, "DE");
});

test("deep research: one vidIQ call per typed line, then matching terms and questions, rising if asked", async () => {
  const searches = ["a one", "b two", "c three", "d four", "e five", "A ONE", "broken"];
  const v = fakeVidiq();
  const r = await deepResearch({ apiKey: "k", searches, topic: "main topic", country: "United Kingdom", fetchImpl: v.fetchImpl });
  const per = v.research.filter((a) => a.mode === "research").map((a) => a.keyword);
  assert.deepEqual(per, ["a one", "b two", "c three", "d four", "e five", "broken"], "every line once, more than 3");
  assert.ok(v.research.every((a) => a.mode !== "research" || a.includeRelated === true));
  assert.deepEqual(v.research.filter((a) => a.mode !== "research").map((a) => [a.mode, a.keyword]), [["matching_terms", "main topic"], ["questions", "main topic"]]);
  assert.ok(v.research.every((a) => a.country === "GB"));
  assert.equal(r.calls, 8);
  assert.equal(r.creditsUsed, 45);
  assert.equal(r.failed.length, 1);
  const names = r.keywords.map((k) => k.keyword.toLowerCase());
  assert.equal(new Set(names).size, names.length, "each keyword once");
  assert.equal(r.keywords.find((k) => k.keyword === "shared keyword").monthlyBelow, true);
  const withRising = fakeVidiq();
  await deepResearch({ apiKey: "k", searches: ["x"], topic: "t", rising: true, fetchImpl: withRising.fetchImpl });
  assert.deepEqual(withRising.research.at(-1), { mode: "rising", niche: "t", limit: 50 }, "rising has no country, vidIQ does not filter it");
  assert.equal(plannedCalls({ searches: Array.from({ length: 30 }, (_, i) => `s${i}`) }).filter((c) => c.args.mode === "research").length, 20, "the cap is 20");
});

test("the ranking: high searches and low competition first, unknown last", () => {
  const list = [
    { keyword: "unknown", monthlySearches: null, competition: 10 },
    { keyword: "big but hard", monthlySearches: 10000, competition: 95 },
    { keyword: "mid and easy", monthlySearches: 4000, competition: 10 },
    { keyword: "small", monthlySearches: 500, competition: 0 },
    { keyword: "tie low comp", monthlySearches: 1000, competition: 50 },
    { keyword: "tie b", monthlySearches: 2000, competition: 75 },
  ];
  assert.deepEqual(rankKeywords(list).map((k) => k.keyword), ["mid and easy", "small", "tie low comp", "tie b", "big but hard", "unknown"], "a tie of 500 goes by lower competition");
  assert.equal(rankValue(list[2]), 3600);
  assert.equal(rankValue(list[0]), null);
});

test("more than 3 typed searches are kept end to end: draft, card, Planner seeds", () => {
  const phrases = Array.from({ length: 7 }, (_, i) => `search number ${i + 1}`).join("\n");
  const answers = { who: "teachers", result: "more students", topic: "yoga marketing", phrases, pace: "every day" };
  assert.equal(keywordRows(answers).length, 7);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "itv-wkw-"));
  const found = Array.from({ length: 25 }, (_, i) => ({ keyword: `found ${i}`, volume: 1000 + i, competition: "20", score: 80 - i, seed: "x" }));
  found.push({ keyword: "unticked", volume: 99999, competition: "1", score: 99, seed: "x", keep: false });
  wizardSave(dir, { answers, keywords: found });
  const draft = JSON.parse(fs.readFileSync(path.join(dir, "channel-wizard.json"), "utf8"));
  assert.equal(draft.answers.phrases.split("\n").length, 7);
  const card = loadCard(dir);
  for (let i = 1; i <= 7; i++) assert.ok(card.keywords.some((k) => k.keyword === `search number ${i}`), `line ${i} on the card`);
  assert.ok(!card.keywords.some((k) => k.keyword === "unticked"), "an unticked keyword stays out");
  const seeds = seedsFrom({ card });
  for (let i = 1; i <= 7; i++) assert.ok(seeds.includes(`search number ${i}`), `line ${i} is a Planner seed`);
  assert.match(QUESTIONS.find((q) => q.id === "phrases").label, /As many searches as you like, one per line\. Each one is looked up in vidIQ\./);
});

test("Channel keywords: comma separated, topic and searches first, ticked ones, within 500 characters", () => {
  const a = { topic: "yoga marketing", phrases: "how to fill a yoga class\nyoga, studio \"ideas\"" };
  const kw = [{ keyword: "yoga studio tips" }, { keyword: "never", keep: false }, { keyword: "x".repeat(140) }];
  const t = channelKeywords(a, kw);
  assert.ok(t.startsWith("yoga marketing, how to fill a yoga class, yoga studio ideas, yoga studio tips"));
  assert.doesNotMatch(t, /never|"/);
  const many = Array.from({ length: 80 }, (_, i) => ({ keyword: `keyword phrase number ${i}` }));
  const long = channelKeywords(a, many);
  assert.ok(long.length <= CHANNEL_KEYWORDS_MAX);
  assert.ok(long.length > 450, "fills the room it has");
  assert.ok(long.split(", ").every((w) => w.length <= 100 && w.trim() === w));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "itv-wkw-"));
  assert.equal(wizardKit(dir, { answers: a, keywords: kw }).channelKeywords, t, "the kit carries it");
});

test("pace: every day and several times a week are choices, the About text reads them", () => {
  const opts = QUESTIONS.find((q) => q.id === "pace").opts.map((o) => o[0]);
  assert.deepEqual(opts, ["every two weeks", "every week", "twice a week", "several times a week", "every day"]);
  assert.match(aboutText({ topic: "yoga", who: "teachers", pace: "every day" }), /New videos every day\./);
});

test("a version 1 card made before this change is still read, with no seed column", () => {
  const old = ["---", "card: youtube-evergreen-organic-traffic-card", "version: 1", "generated: 2026-10-01", "---", "", "# Card", "", "## Keywords", "", "| Rank | Keyword | Monthly search volume | Competition | Overall score |", "|---|---|---|---|---|", "| 1 | sourdough | 1000 | 30 | 60 |", ""].join("\n");
  const c = parseTrafficCard(old);
  assert.equal(c.keywords[0].keyword, "sourdough");
  assert.equal(c.keywords[0].seed, "");
  assert.deepEqual(seedsFrom({ card: c }), ["sourdough"]);
  assert.match(cardMarkdown({ answers: {} }), /^version: 1$/m, "the wizard still writes version 1");
});
