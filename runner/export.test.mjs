import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createProject } from "./project.mjs";
import { captionCues, toSrt, chapters, chapterTitle, writeExtras, MAX_LINE } from "./gates/render/export.mjs";

const w = (text, start, end) => ({ text, start, end });

test("captions: one line per cue, cut at sentence ends and at the line limit", () => {
  const words = [w("Short", 0.2, 0.5), w("one.", 0.5, 0.9), ...Array.from({ length: 12 }, (_, i) => w(`word${i}`, 1 + i * 0.3, 1.25 + i * 0.3))];
  const cues = captionCues(words);
  assert.equal(cues[0].text, "Short one.");
  for (const c of cues) assert.ok(c.text.length <= MAX_LINE, c.text);
  assert.equal(cues.map((c) => c.text).join(" "), words.map((x) => x.text).join(" "), "no word lost");
  assert.ok(cues.length >= 3);
});

test("captions: a long pause-free stretch is cut after 5 s", () => {
  const words = Array.from({ length: 8 }, (_, i) => w("ab", i, i + 0.9));
  assert.ok(captionCues(words).every((c) => c.end - c.start <= 5.9));
});

test("SRT format", () => {
  assert.equal(toSrt([{ start: 0.2, end: 1.5, text: "Hello there." }, { start: 3661.25, end: 3662, text: "Later." }]), "1\n00:00:00,200 --> 00:00:01,500\nHello there.\n\n2\n01:01:01,250 --> 01:01:02,000\nLater.\n");
});

test("chapter titles in the content language", () => {
  assert.equal(chapterTitle("OPEN", "hu"), "Bevezetés");
  assert.equal(chapterTitle("OWN", "en"), "Summary");
  assert.equal(chapterTitle("2. Pricing that works", "en"), "Pricing that works");
  assert.equal(chapterTitle("OPEN", "xx"), "Intro");
});

const S = (id, start, end) => ({ id, start, end, text: id });

test("chapters: first at 0:00, short ones join the one before, YouTube's minimum", () => {
  const sentences = [S("S1", 0.4, 5), S("S2", 30, 40), S("S3", 65, 70), S("S4", 71, 80), S("S5", 125, 130)];
  const sections = ["OPEN", "1. First", "2. Second", "3. Tiny", "OWN"];
  const r = chapters(sentences, sections, 140, "en");
  assert.equal(r.text, "0:00 Intro\n0:30 First\n1:05 Second\n2:05 Summary");
  assert.equal(r.ok, true);
  const few = chapters([S("S1", 0, 5), S("S2", 20, 30)], ["OPEN", "OWN"], 40, "en");
  assert.equal(few.ok, false);
  assert.match(few.note, /at least 3/);
});

test("both files go next to the video", () => {
  const { dir } = createProject({ projectsDir: fs.mkdtempSync(path.join(os.tmpdir(), "itv-export-")), title: "T" });
  fs.writeFileSync(path.join(dir, "words.json"), JSON.stringify([w("Hi.", 0.1, 0.4), w("Bye.", 20, 20.5)]));
  fs.writeFileSync(path.join(dir, "sentences.json"), JSON.stringify([{ ...S("S1", 0.1, 0.4), text: "Hi.", words: 1 }, { ...S("S2", 20, 20.5), text: "Bye.", words: 1 }]));
  fs.writeFileSync(path.join(dir, "script.md"), "# T\n\n## OPEN\n\nHi.\n\n## OWN\n\nBye.\n");
  fs.mkdirSync(path.join(dir, "out"));
  const r = writeExtras(dir, path.join(dir, "out", "video-20260930-2100.mp4"), { language: "en", total: 31 });
  assert.match(fs.readFileSync(r.srt, "utf8"), /00:00:20,000 --> 00:00:20,500\nBye\./);
  assert.equal(fs.readFileSync(r.chaptersFile, "utf8"), "0:00 Intro\n0:20 Summary\n");
  assert.match(r.chaptersNote, /at least 3/);
  fs.rmSync(dir, { recursive: true, force: true });
});
