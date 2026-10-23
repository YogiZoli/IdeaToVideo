// planner.test.mjs: the Playlist Planner (DECISIONS 127). Seeds from the
// Traffic Card, vidIQ research through a fake MCP server, the checks on the
// AI's plan and outline, and the contract: the file it builds is read by the
// course import unchanged.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { seedsFrom, research, planIssues, planRows, checkRows, outlineIssues, buildStructure, slugOf, contextOf, MIN_VIDEOS } from "./planner/index.mjs";
import { parseTrafficCard } from "./planner/traffic-card.mjs";
import { parseCourse, importCourse, listCourses } from "./course/index.mjs";

const CARD = parseTrafficCard(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "example-traffic-card.md"), "utf8"));

test("planner: seeds from the card, playlists first, Start here skipped", () => {
  assert.deepEqual(seedsFrom({ card: CARD }), ["sourdough starter", "sourdough for beginners", "why is my sourdough dense"]);
  assert.deepEqual(seedsFrom({ topic: "  knife sharpening " }), ["knife sharpening"]);
  assert.deepEqual(seedsFrom({}), []);
  const c = contextOf({ card: CARD, answers: { promise: "typed promise" }, channel: { audience: "ignored" } });
  assert.equal(c.audience, CARD.audience);
  assert.equal(c.promise, "typed promise", "a typed answer wins over the card");
});

// A fake vidIQ MCP server: initialize, notifications, balance, research.
function fakeVidiq({ credits = [100, 94] } = {}) {
  let balance = 0;
  const calls = [];
  const fetchImpl = async (_url, init) => {
    const m = JSON.parse(init.body);
    calls.push(m.params?.name ?? m.method);
    const reply = (result) => new Response(JSON.stringify({ jsonrpc: "2.0", id: m.id, result }), { status: 200, headers: { "mcp-session-id": "s1" } });
    if (m.method === "initialize") return reply({});
    if (!m.id) return new Response("", { status: 202 });
    if (m.params.name === "vidiq_balance") return reply({ structuredContent: { totalCredits: credits[Math.min(balance++, credits.length - 1)] } });
    const k = m.params.arguments.keyword;
    if (k === "broken") return reply({ isError: true, content: [{ type: "text", text: "no data" }] });
    return reply({ structuredContent: { seedKeyword: { keyword: k, estimatedMonthlySearch: 1000, competition: 40, overall: 60 }, relatedKeywords: [{ keyword: `${k} tips`, volume: 300, competition: 20, overall: 70 }, { keyword: "shared", volume: 5, competition: 1, overall: 10 }] } });
  };
  return { fetchImpl, calls };
}

test("planner: research is one vidIQ call per seed, credits before and after", async () => {
  const v = fakeVidiq();
  const r = await research({ apiKey: "k", seeds: ["a", "b", "broken"], fetchImpl: v.fetchImpl });
  assert.equal(v.calls.filter((c) => c === "vidiq_keyword_research").length, 3);
  assert.deepEqual(r.keywords.map((k) => k.keyword), ["a tips", "b tips", "a", "b", "shared"], "best score first, each keyword once");
  assert.equal(r.keywords.find((k) => k.keyword === "a").volume, 1000);
  assert.equal(r.creditsUsed, 6);
  assert.equal(r.failed.length, 1);
  await assert.rejects(research({ apiKey: "k", seeds: [], fetchImpl: v.fetchImpl }), /at least one seed/);
});

const KEYWORDS = Array.from({ length: 12 }, (_, i) => ({ keyword: `kw ${i + 1}`, volume: 1000 - i, competition: 30, score: 60 }));
const plan = (n) => ({ playlist: { title: "Sourdough Basics" }, why: "Ten strong keywords.", videos: KEYWORDS.slice(0, n).map((k, i) => ({ keyword: k.keyword.toUpperCase(), title: `Video ${i + 1}` })) });

test("planner: the plan is checked, numbers come from vidIQ, not the AI", () => {
  assert.deepEqual(planIssues(plan(10), KEYWORDS), []);
  assert.match(planIssues(plan(5), KEYWORDS).join(), /5 videos, it must be 8 to 16/);
  const bad = plan(9);
  bad.videos[1].keyword = "made up";
  bad.videos[2].keyword = bad.videos[0].keyword;
  assert.match(planIssues(bad, KEYWORDS).join(" | "), /"made up" is not one of the KEYWORDS.*used twice/);
  const rows = planRows(plan(MIN_VIDEOS), KEYWORDS);
  assert.deepEqual(rows[0], { position: 1, title: "Video 1", keyword: "kw 1", volume: 1000, competition: 30 });
});

test("planner: the approved table and the outline are checked", () => {
  assert.throws(() => checkRows([]), /no videos/);
  assert.throws(() => checkRows([{ title: "x", keyword: "" }]), /no keyword/);
  assert.throws(() => checkRows(Array.from({ length: 17 }, () => ({ title: "t", keyword: "k" }))), /at most 16/);
  assert.deepEqual(checkRows([{ title: " B ", keyword: "b", position: 9 }, { title: "A", keyword: "a" }]).map((r) => [r.position, r.title]), [[1, "B"], [2, "A"]], "positions follow the shown order");
});

test("planner: an outline outside 10 to 20 minutes is sent back", () => {
  const rows = checkRows([{ title: "A", keyword: "a" }]);
  const ok = { videos: [{ hook: "h", teach: { minutes: 12, points: ["1", "2", "3"] }, do: { minutes: 3, exercise: "e" }, review: { minutes: 1, check: "c" } }] };
  assert.deepEqual(outlineIssues(ok, rows), []);
  const short = structuredClone(ok);
  short.videos[0].teach.minutes = 2;
  assert.match(outlineIssues(short, rows).join(), /6 minutes, it must be 10 to 20/);
});

test("planner: the file it builds is a Course Content Structure the import reads", () => {
  const rows = planRows(plan(8), KEYWORDS);
  const outline = rows.map((r) => ({ hook: `Hook ${r.position}`, teach: { minutes: 12, points: ["p1", "p2", "p3"] }, do: { minutes: 3, exercise: "Do it" }, review: { minutes: 1, check: "Check" }, youtube_title: `YT ${r.position}` }));
  const doc = buildStructure({ title: "Sourdough Basics", promise: "Bake a loaf", audience: CARD.audience, rows, outline, now: new Date("2026-10-23T00:00:00Z") });
  assert.equal(doc.type, "course-content-structure");
  assert.equal(doc.schema_version, "1.0");
  const parsed = parseCourse(JSON.stringify(doc));
  assert.equal(parsed.course.slug, "sourdough-basics");
  assert.equal(parsed.lessons.length, 8);
  assert.deepEqual(parsed.warnings, []);
  assert.equal(parsed.lessons[0].keyword, "kw 1");
  assert.equal(parsed.lessons[0].teach.minutes + parsed.lessons[0].do.minutes + parsed.lessons[0].review.minutes, 16);
  assert.equal(parsed.lessons[0].cta, "Watch the next video: Video 2.");
  assert.equal(parsed.lessons[0].youtubeTitle, "YT 1");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "itv-planner-"));
  const r = importCourse({ projectsDir: dir, text: JSON.stringify(doc) });
  assert.equal(r.created, 8);
  assert.equal(listCourses(dir).courses[0].title, "Sourdough Basics");
  assert.equal(slugOf("Árvíztűrő Kenyér!!"), "arvizturo-kenyer");
  assert.equal(slugOf("!!!"), "playlist");
});
