// bridge.test.mjs: the playlist bridge lines (DECISIONS 128). Made from the
// course group's order at script time, never stored in the course file; at
// most 12 seconds; spoken text rules kept; the comment calls untouched.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { importCourse } from "./course/index.mjs";
import { bridgeLines, spokenTitle, fit, MAX_WORDS, LAST } from "./course/bridge.mjs";
import { loadProject } from "./project.mjs";
import { buildData, renderMarkdown, spokenFields, styleIssues } from "./gates/script/index.mjs";
import { narrationFromMarkdown } from "./gates/voice/narration.mjs";
import { validate, loadSchema } from "./schema/validate.mjs";

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "example-course-content-structure.json");
const doc = () => JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
const words = (s) => s.split(/\s+/).filter(Boolean).length;

function imported(d = doc()) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "itv-bridge-"));
  const r = importCourse({ projectsDir: dir, text: JSON.stringify(d) });
  const series = Object.fromEntries(r.lessons.map((l) => [l.id, loadProject(l.dir).series]));
  return { dir, series };
}

test("bridge: first, middle and last lesson", () => {
  const { dir, series } = imported();
  assert.deepEqual(bridgeLines(dir, series["m1-l1"]), { open: null, close: "Next, watch Mix the dough, touch one. It is the next step in this playlist." });
  assert.deepEqual(bridgeLines(dir, series["m1-l2"]), {
    open: "If you have not watched What a ready starter looks like yet, watch it first. The link is on screen.",
    close: `Next, watch ${spokenTitle(doc().lessons[2].title)}. It is the next step in this playlist.`,
  });
  assert.equal(bridgeLines(dir, series["m2-l2"]).close, LAST);
  assert.equal(bridgeLines(dir, null), null, "not a lesson: no lines");
  assert.equal(bridgeLines(dir, { courseSlug: "gone", lessonId: "x" }), null);
});

test("bridge: a new order needs no fix, the course file has no bridge text", () => {
  const d = doc();
  const { dir, series } = imported(d);
  const swapped = structuredClone(d);
  [swapped.lessons[0].playlist_position, swapped.lessons[1].playlist_position] = [2, 1];
  importCourse({ projectsDir: dir, text: JSON.stringify(swapped) });
  assert.equal(bridgeLines(dir, series["m1-l1"]).open, "If you have not watched Mix the dough, touch one yet, watch it first. The link is on screen.");
  assert.equal(bridgeLines(dir, series["m1-l2"]).open, null);
  const kept = fs.readFileSync(path.join(dir, "_courses", d.course.slug, `${d.course.slug}-course-content-structure.json`), "utf8");
  assert.doesNotMatch(kept, /If you have not watched|It is the next step/);
});

test("bridge: at most 12 seconds, spoken text rules kept", () => {
  const long = "The Complete Guide: Why Your Sourdough Starter (Even a Good One) Fails, And Exactly What To Do About It, Step By Step, Every Single Time";
  for (const line of [fit((t) => `If you have not watched ${t} yet, watch it first. The link is on screen.`, long), fit((t) => `Next, watch ${t}. It is the next step in this playlist.`, long)]) {
    assert.ok(words(line) <= MAX_WORDS, `${words(line)} words`);
    assert.equal(MAX_WORDS, 30);
    assert.deepEqual(styleIssues({ open: { problem: "p", promise: "p", bridge: line }, own: { recap: "r" }, sections: [{ narration: "n", highestValue: true }] }), []);
  }
  assert.equal(spokenTitle('Shape it: "the" (real) way - fast!'), "Shape it, the real way, fast");
});

test("bridge: in the script after the hook and at the very end, read aloud, CTAs untouched", () => {
  const script = {
    title: "T",
    open: { problem: "Hook line.", promise: "Promise line.", cta: "Comment COURSE below.", credibility: null, bridge: "If you have not watched A yet, watch it first. The link is on screen." },
    sections: [{ name: "One", narration: "Body.", highestValue: true }],
    ownershipCta: null,
    own: { recap: "Recap.", cta: null, nextVideo: null, bridge: LAST },
  };
  assert.deepEqual(validate(script, loadSchema("script")).filter((e) => /bridge/.test(e)), []);
  const md = renderMarkdown(script);
  const lines = md.split("\n").filter(Boolean);
  assert.equal(lines.indexOf(script.open.bridge), lines.indexOf("Hook line.") + 1, "right after the hook");
  assert.equal(lines.at(-1), LAST, "the last line, before the end screen");
  assert.ok(lines.includes("Comment COURSE below."), "the video's own comment call stays");
  assert.match(narrationFromMarkdown(md).map((b) => b.text).join(" "), /The link is on screen\..*start from lesson 1\./);
  assert.ok(spokenFields(script).some(([k]) => k === "own.bridge"));
});

test("bridge: with the lines, the AI is not told the next video and gets no closing line", () => {
  const brief = { title: "T", playlist: { name: "P", position: 2, of: 4, nextTitle: "Old next" } };
  const seed = { hook: "h", closingLine: "Watch the next lesson." };
  const without = buildData({ topic: "t", brief, seed });
  assert.equal(without.nextVideo, "Old next");
  assert.equal(without.lessonOutline.closingLine, "Watch the next lesson.");
  const withBridge = buildData({ topic: "t", brief, seed, bridge: { open: "x", close: "y" } });
  assert.equal(withBridge.nextVideo, null);
  assert.equal(withBridge.playlist.nextTitle, undefined);
  assert.equal(withBridge.lessonOutline.closingLine, undefined);
});
