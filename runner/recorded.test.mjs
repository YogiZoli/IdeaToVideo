// The Recorded engine's pure parts: the cut list, sound, plan, layouts, cursor and
// composition. The real files run in scripts/phase2/recorded-e2e.mjs.

import test from "node:test";
import assert from "node:assert/strict";
import { checkWords, envelope, fillerMarks, finalWords, frameOf, keepsOf, keptSeconds, makeMarks, phrasesOf, repeatedTakes, runsOf, sameTake, snapWords, soundMarks, speechChunks, stutters, toFinal, voicedMask, ENVELOPE_RATE, FPS } from "./recorded/cuts.mjs";
import { joinSound, selectExpression, soundLag } from "./recorded/edit.mjs";
import { beatPlan, chapterCount, finishPlan, layoutPlan, locate, planIssues, planRecording, planTitle, ruleBigWords, ruleChapters, scriptFromPlan, shotRows } from "./recorded/shots.mjs";
import { blobsOf, chooseTrack, cursorRect, fillGaps, findClicks, findStops, smoothPath, transitOf, viewPath, zoomPlan, TRACK_FPS } from "./recorded/cursor.mjs";
import { inputSize, toInput, toMask } from "./recorded/matte.mjs";
import { fitBox, placeInBox, recordedHtml, wordSize, LAYOUT_BOXES } from "./recorded/compose.mjs";
import { filesProblem, pictureRoles, voiceSource } from "./recorded/index.mjs";
import { makeTokenizer, medianFilter, melFilters, warp, wordsFromTokens } from "./recorded/whisper.mjs";
import { promptFor } from "./recorded/transcribe.mjs";
import { listPresets, loadPreset, checkPreset } from "./presets/index.mjs";
import { normalizeRecipe } from "./channels/recipe.mjs";
import { sentenceSections } from "./gates/scenes/index.mjs";
import { chapters } from "./gates/render/export.mjs";
import { groupSentences } from "./timing/sentences.mjs";

const w = (text, start, end) => ({ text, start, end });
// a mask with speech on the given stretches, in seconds
const maskOf = (seconds, ...runs) => {
  const m = new Uint8Array(Math.round(seconds * ENVELOPE_RATE));
  for (const [a, b] of runs) m.fill(1, Math.round(a * ENVELOPE_RATE), Math.round(b * ENVELOPE_RATE));
  return m;
};
const take = (s, at = 0, gap = 0.25) => s.split(" ").map((x, i) => w(x, at + i * gap, at + i * gap + gap - 0.02));

// ---- the sound ------------------------------------------------------------------------

test("loud and quiet are told apart on this file's own levels", () => {
  const rate = 16000;
  const samples = new Float32Array(rate * 4);
  for (let i = 0; i < samples.length; i++) samples[i] = (i > rate && i < rate * 2) || (i > rate * 3 && i < rate * 3.5) ? 0.2 * Math.sin(i / 7) : 0.0005 * Math.sin(i * 3);
  const mask = voicedMask(envelope(samples, rate));
  const runs = runsOf(mask);
  assert.equal(runs.length, 2);
  assert.ok(Math.abs(runs[0].start - 1) < 0.03 && Math.abs(runs[0].end - 2) < 0.03);
});

test("a short dip in the voice stays one run; a long one does not", () => {
  const env = new Float32Array(300).fill(-20);
  env.fill(-70, 100, 105);
  env.fill(-70, 200, 260);
  assert.equal(runsOf(voicedMask(env)).length, 2);
});

test("long speech is cut into pieces the model can read", () => {
  const chunks = speechChunks(maskOf(100, [1, 20], [21, 40], [42, 95]));
  assert.ok(chunks.every((c) => c.end - c.start <= 28.6), JSON.stringify(chunks));
  assert.ok(chunks[0].start < 1 && chunks.at(-1).end > 94);
});

test("a word starts and ends on the sound, not where the model guessed", () => {
  const [a, b] = snapWords([w("one", 1.0, 2.0), w("two", 2.0, 2.5)], maskOf(4, [1.2, 1.5], [2.1, 2.4]));
  assert.deepEqual([a.start, a.end], [1.2, 1.5]);
  assert.equal(b.start, 2.1);
});

test("the check says when the words do not fit the recording", () => {
  const mask = maskOf(10, [1, 3], [5, 8]);
  const good = checkWords([w("a", 1, 2), w("b", 2, 3), w("c", 5, 6.5), w("d", 6.5, 8)], mask, 10);
  assert.equal(good.ok, true);
  const shifted = checkWords([w("a", 3.2, 4.2), w("b", 8.2, 9), w("c", 9, 9.5)], mask, 10);
  assert.equal(shifted.ok, false);
  assert.equal(checkWords([w("a", 1, 2), w("b", 5, 12)], mask, 10).ok, false, "past the end of the file");
  assert.equal(checkWords([], mask, 10).ok, false);
});

// ---- what comes out ---------------------------------------------------------------------

test("a false start goes, the finished take stays", () => {
  const words = [...take("The best way to start,", 0), ...take("The best way to start is one promise.", 3)];
  const marks = repeatedTakes(words);
  assert.equal(marks.length, 1);
  assert.deepEqual([marks[0].from, marks[0].to], [0, 4]);
});

test("a whole sentence said again: the last good take stays", () => {
  const words = [...take("Pick one viewer and name a problem.", 0), ...take("Pick one viewer and name one problem.", 3), ...take("That is it.", 6)];
  const marks = repeatedTakes(words);
  assert.deepEqual(marks.map((m) => [m.from, m.to]), [[0, 6]]);
});

test("the last try was cut short: the good take before it stays", () => {
  const words = [...take("Pick one viewer and name one problem.", 0), ...take("Pick one viewer", 3)];
  assert.deepEqual(repeatedTakes(words).map((m) => [m.from, m.to]), [[7, 9]]);
});

test("a remark between two takes goes with the first", () => {
  const words = [...take("The price goes up in May,", 0), ...take("sorry, let me say that again.", 2), ...take("The price goes up in June.", 4)];
  const gone = new Set(repeatedTakes(words).flatMap((m) => Array.from({ length: m.to - m.from + 1 }, (_, k) => m.from + k)));
  words.forEach((x, i) => assert.equal(gone.has(i), i < 12, `${x.text} ${i}`));
});

test("different sentences that start alike are not takes", () => {
  assert.equal(repeatedTakes([...take("The first thing you need is a clear promise for one viewer.", 0), ...take("The second thing you need is a short opening line today.", 5)]).length, 0);
  assert.equal(sameTake(["it", "is"], ["it", "works", "well", "for", "everyone", "here"]), false);
});

test("a word said twice in a row goes once; a real double stays", () => {
  assert.deepEqual(stutters(take("I think the the plan works")).map((m) => [m.from, m.to]), [[2, 2]]);
  assert.deepEqual(stutters(take("I think I think it works")).map((m) => [m.from, m.to]), [[0, 1]]);
  assert.equal(stutters(take("she said that that was fine")).length, 0);
});

test("filler words are whole words, in the video's language", () => {
  assert.deepEqual(fillerMarks([w("Um,", 0, 1), w("umbrella", 1, 2), w("uh", 2, 3)], "en").map((m) => m.from), [0, 2]);
  assert.deepEqual(fillerMarks([w("Ööö,", 0, 1), w("hát", 1, 2)], "hu").map((m) => m.from), [0]);
  // said in passing only between commas
  const soft = [w("it", 0, 1), w("was,", 1, 2), w("you", 2, 3), w("know,", 3, 4), w("late.", 4, 5), w("You", 5, 6), w("know", 6, 7), w("this.", 7, 8)];
  assert.deepEqual(fillerMarks(soft, "en").map((m) => [m.from, m.to]), [[2, 3]]);
});

test("a sound with no word is marked; a breath at the edge is not", () => {
  const words = [w("one", 1, 1.5), w("two", 4, 4.5)];
  const marks = soundMarks(words, maskOf(6, [0.1, 0.5], [1, 1.5], [2.5, 2.9], [4, 4.5], [5.2, 5.6]));
  assert.deepEqual(marks.map((m) => m.start), [2.5]);
});

test("a transcript that does not fit never deletes sound it cannot name", () => {
  const words = [w("one", 1, 1.5), w("two", 4, 4.5)];
  const mask = maskOf(6, [1, 1.5], [2.5, 2.9], [4, 4.5]);
  assert.equal(makeMarks(words, mask, { careful: false }).filter((m) => m.kind === "sound").length, 1);
  assert.equal(makeMarks(words, mask, { careful: true }).filter((m) => m.kind === "sound").length, 0);
});

test("long pauses go, short ones stay, every cut is on a whole frame", () => {
  const words = [w("one", 1, 1.5), w("two", 1.7, 2), w("three", 5, 5.5)];
  const keeps = keepsOf(words, [], { seconds: 8 });
  assert.equal(keeps.length, 2);
  assert.ok(keeps.every((k) => Number.isInteger(k.start) && Number.isInteger(k.end)));
  assert.equal(keeps[0].start, frameOf(0.93));
  assert.ok(keptSeconds(keeps) < 2);
});

test("putting a cut back brings its words back", () => {
  const words = take("One two three four five six.", 0, 0.3);
  const marks = [{ id: "c1", kind: "filler", start: words[2].start, end: words[3].end, from: 2, to: 3 }];
  const out = finalWords(words, marks, keepsOf(words, marks, { seconds: 3 }));
  assert.equal(out.length, 4);
  const back = finalWords(words, marks, keepsOf(words, marks, { off: ["c1"], seconds: 3 }), { off: ["c1"] });
  assert.equal(back.length, 6);
});

test("words land on the cut video's own clock", () => {
  const keeps = [{ start: 30, end: 60 }, { start: 150, end: 180 }];
  assert.equal(toFinal(keeps, 1.5), 0.5);
  assert.equal(toFinal(keeps, 5.5), 1.5);
  assert.equal(toFinal(keeps, 3), null);
  const words = finalWords([w("a", 1.1, 1.4), w("cut", 3, 3.5), w("b", 5.2, 5.6)], [], keeps);
  assert.deepEqual(words.map((x) => x.text), ["a", "b"]);
  assert.ok(Math.abs(words[1].start - 1.2) < 0.001);
});

test("phrases split at sentence ends and long pauses", () => {
  assert.deepEqual(phrasesOf([w("One.", 0, 1), w("Two", 1, 2), w("three", 3, 4)]), [{ from: 0, to: 0 }, { from: 1, to: 1 }, { from: 2, to: 2 }]);
});

// ---- the sound and the pictures, cut ---------------------------------------------------------

test("the sound is joined on the frames, with no click at a join", () => {
  const pcm = new Int16Array(48000 * 2).fill(10000);
  const out = joinSound(pcm, [{ start: 0, end: 15 }, { start: 30, end: 45 }]);
  assert.equal(out.length, 48000);
  assert.equal(out[0], 0, "fades in");
  assert.ok(Math.abs(out[23999]) < 100 && Math.abs(out[24000]) < 100, "quiet at the join");
  assert.equal(out[12000], 10000);
});

test("the select filter takes each picture's offset", () => {
  assert.equal(selectExpression([{ start: 0, end: 30 }, { start: 60, end: 90 }]), "between(n,0,29)+between(n,60,89)");
  assert.equal(selectExpression([{ start: 0, end: 30 }], 15), "between(n,15,44)");
});

test("two files are lined up by their sound; two takes are not forced", () => {
  const noise = (n, seed) => Float32Array.from({ length: n }, (_, i) => -40 + 20 * Math.sin(i * 0.13 + seed) + 15 * Math.sin(i * 0.031 * seed));
  const a = noise(4000, 1.7);
  const later = new Float32Array(4000).fill(-60);
  later.set(a.subarray(0, 3300), 700);
  const r = soundLag(a, later, { maxLag: 30 });
  assert.equal(r.sure, true);
  assert.ok(Math.abs(r.lag - 7) < 0.02, String(r.lag));
  // a different take has no such match
  const other = Float32Array.from({ length: 4000 }, (_, i) => -40 + ((i * 7919) % 97) / 3);
  assert.equal(soundLag(a, other, { maxLag: 30 }).sure, false);
});

// ---- the speech model's pure parts -------------------------------------------------------------

test("the mel filters have the model's shape", () => {
  const f = melFilters();
  assert.equal(f.length, 80);
  assert.equal(f[0].length, 201);
  assert.ok(f.every((r) => r.some((v) => v > 0)));
});

test("the tokenizer goes there and back, a letter across two tokens too", () => {
  // ő is two bytes: c5 91. The table maps them to single characters.
  const t = makeTokenizer({ vocab: { "\u0120hi": 1, "\u00c5\u0133": 2, "\u0120fo": 3 }, merges: [], added: { "<|x|>": 9 } });
  assert.equal(t.id("<|x|>"), 9);
  const words = wordsFromTokens([3, 2, 1], [0, 0.5, 1, 1.5], t.bytes);
  assert.deepEqual(words.map((x) => x.text), ["foő", "hi"]);
  assert.deepEqual([words[0].start, words[0].end], [0, 1]);
});

test("the warp runs forward through the attention", () => {
  const row = (at, n = 20) => Float32Array.from({ length: n }, (_, i) => (i === at ? 1 : 0));
  const first = warp([row(2), row(7), row(13)], 20);
  assert.deepEqual(first, [2, 7, 13]);
  assert.deepEqual([...medianFilter(Float32Array.from([0, 0, 0, 9, 0, 0, 0, 0]))].slice(2, 5), [0, 0, 0]);
});

test("the prompt that keeps fillers follows the language", () => {
  assert.match(promptFor("en"), /um/);
  assert.match(promptFor("hu-HU"), /ööö/);
  assert.equal(promptFor("xx"), "");
});

// ---- presets and files ----------------------------------------------------------------------------

const RECORDED = ["talking-head", "screen-recording", "screen-share", "profile-silhouette"];

test("the four recorded presets are valid and carry no sound effect", () => {
  const list = listPresets().filter((p) => p.engine === "recorded");
  assert.deepEqual(list.map((p) => p.id).sort(), [...RECORDED].sort());
  for (const p of list) {
    assert.deepEqual(checkPreset(p), []);
    assert.match(p.shotRules.sound, /No transition sounds/);
    assert.ok(p.recorded.slots.length);
  }
  assert.ok(checkPreset({ ...list[0], recorded: {} }).some((i) => i.includes("names its files")));
});

test("a recipe of the Recorded engine asks for no voice, no avatar, no length", () => {
  const r = normalizeRecipe({ engine: "recorded", preset: "talking-head", music: { on: true, source: "synth", mood: "calm" }, broll: { on: true }, recorded: { cutout: true } }, { language: "hu" });
  assert.equal(r.engine, "recorded");
  assert.equal(r.avatar.on, false);
  assert.equal(r.voice.provider, "recording");
  assert.equal(r.recorded.cutout, true);
  assert.equal(r.recorded.smoothCursor, true);
  assert.throws(() => normalizeRecipe({ engine: "recorded", preset: "motion-frames" }), /belongs to the script engine/);
});

test("each preset says which files it needs", () => {
  const p = (id) => loadPreset(id);
  assert.match(filesProblem(p("talking-head"), {}), /camera file/);
  assert.equal(filesProblem(p("talking-head"), { combined: "a" }), null);
  assert.equal(filesProblem(p("screen-recording"), { screen: "a" }), null);
  assert.match(filesProblem(p("screen-share"), { camera: "a" }), /camera file and a screen file/);
  assert.match(filesProblem(p("screen-share"), { combined: "a" }), /two pictures/);
  assert.equal(filesProblem(p("screen-share"), { camera: "a", screen: "b" }), null);
  assert.match(filesProblem(p("profile-silhouette"), {}), /side-angle/);
  assert.equal(filesProblem(p("motion-frames"), { camera: "a" })?.includes("not a preset"), true);
});

test("the voice comes from the front take first; one combined file is the picture", () => {
  const has = { hasAudio: true };
  assert.equal(voiceSource({ front: "f", camera: "c" }, { front: has, camera: has }), "front");
  assert.equal(voiceSource({ camera: "c", screen: "s" }, { camera: { hasAudio: false }, screen: has }), "screen");
  assert.equal(voiceSource({ camera: "c" }, { camera: { hasAudio: false } }), null);
  assert.deepEqual(pictureRoles(loadPreset("screen-recording"), { combined: "x" }), { screen: "combined" });
  assert.deepEqual(pictureRoles(loadPreset("screen-recording"), { screen: "x", camera: "y" }), { screen: "screen", camera: "camera" });
  assert.deepEqual(pictureRoles(loadPreset("talking-head"), { combined: "x" }), { camera: "combined" });
});

// ---- the plan -------------------------------------------------------------------------------------

const sampleWords = () => {
  const out = [];
  let t = 0;
  for (let s = 0; s < 40; s++) {
    for (const x of ["Channels", "lose", "viewers", "because", "thirty", "seconds", "matter."]) {
      out.push({ text: x.replace("thirty", s % 3 ? "thirty" : "30"), start: t, end: t + 0.35 });
      t += 0.45;
    }
    t += 0.6;
  }
  return out;
};

test("chapters by rule: at least what YouTube wants, first at the first sentence", () => {
  const words = sampleWords();
  const sentences = groupSentences(words);
  const total = words.at(-1).end;
  const ch = ruleChapters(sentences, total);
  assert.ok(ch.length >= 3);
  assert.equal(ch[0].sentence, "S1");
  assert.equal(chapterCount(20), 1);
  assert.equal(chapterCount(40), 3);
  assert.equal(chapterCount(3000), 12);
});

test("big words sit on the exact word, far enough apart", () => {
  const words = sampleWords();
  const sentences = groupSentences(words);
  const plan = finishPlan({ title: "T", chapters: ruleChapters(sentences, words.at(-1).end), bigWords: ruleBigWords(sentences, words), sentences, words, total: words.at(-1).end, preset: loadPreset("talking-head") });
  assert.ok(plan.bigWords.length >= 3);
  for (const b of plan.bigWords) assert.ok(words.some((x) => Math.abs(x.start - b.start) < 0.002), `${b.text} at ${b.start}`);
  assert.ok(plan.bigWords.every((b, i) => !i || b.start - plan.bigWords[i - 1].start >= 7));
  assert.ok(plan.bigWords.every((b) => !b.behind));
});

test("the AI's answer is checked word by word", () => {
  const words = sampleWords();
  const sentences = groupSentences(words);
  const ok = { chapters: [{ sentence: "S1", title: "Start" }, { sentence: "S20", title: "Middle" }], bigWords: [{ sentence: "S2", words: "viewers" }] };
  assert.deepEqual(planIssues(ok, { sentences, words }), []);
  const bad = { chapters: [{ sentence: "S2", title: "Late" }, { sentence: "S3", title: "a b c d e f g" }, { sentence: "S99", title: "x" }], bigWords: [{ sentence: "S2", words: "not said here" }, { sentence: "S3", words: "lose viewers because thirty" }] };
  const issues = planIssues(bad, { sentences, words }).join(" | ");
  assert.match(issues, /first chapter must start/);
  assert.match(issues, /at most 6 words/);
  assert.match(issues, /no sentence S99/);
  assert.match(issues, /not in sentence/);
  assert.equal(locate({ words: "LOSE, viewers" }, { list: words.slice(0, 7) })?.text, "lose viewers");
});

test("a dead AI still gives a plan; a repaired answer is used", async () => {
  const words = sampleWords();
  const sentences = groupSentences(words);
  const total = words.at(-1).end;
  const preset = loadPreset("talking-head");
  const rule = await planRecording({ llm: null, sentences, words, total, title: "My title", preset });
  assert.equal(rule.plannedBy, "rule");
  assert.equal(rule.title, "My title");
  assert.ok(rule.chapters.length >= 3);
});

test("a typed title stays, the AI only names a video with none; Talking Head asks for one file (DECISIONS 177)", () => {
  assert.equal(planTitle("The AI's title", "My typed title", true), "My typed title");
  assert.equal(planTitle("The AI's title", "file name", false), "The AI's title");
  assert.equal(planTitle("  ", "file name", false), "file name");
  assert.equal(planTitle(undefined, "file name"), "file name");
  assert.deepEqual(loadPreset("talking-head").recorded.slots.map((s) => s.id), ["camera"]);
  assert.ok(loadPreset("screen-recording").recorded.slots.some((s) => s.id === "combined"), "Screen Recording keeps it");
});

test("layouts change about every 8 s, on a sentence, never twice alike", () => {
  const words = sampleWords();
  const sentences = groupSentences(words);
  const total = words.at(-1).end;
  const l = layoutPlan(sentences, total);
  assert.equal(l[0].mode, "full-face");
  assert.ok(l.length >= 8);
  for (let i = 1; i < l.length; i++) {
    assert.notEqual(l[i].mode, l[i - 1].mode);
    assert.ok(sentences.some((s) => Math.abs(s.start - l[i].start) < 0.002));
    const gap = l[i].start - l[i - 1].start;
    assert.ok(gap >= 4 && gap <= 13, `${gap}`);
  }
  assert.ok(new Set(l.map((x) => x.mode)).size === 3);
});

test("what points at the screen goes to the big screen", () => {
  const s = [{ id: "S1", start: 0, text: "Hello there" }, { id: "S2", start: 8, text: "Now click this button here" }, { id: "S3", start: 16, text: "Fine" }];
  assert.equal(layoutPlan(s, 24)[1].mode, "big-screen");
});

test("the color changes at chapters and between them", () => {
  const sentences = Array.from({ length: 30 }, (_, i) => ({ id: `S${i + 1}`, start: i * 4 }));
  const beats = beatPlan(sentences, [{ start: 0 }, { start: 60 }], ["#111111", "#222222", "#333333"]);
  assert.equal(beats[0].start, 0);
  assert.ok(beats.some((b) => b.start === 60));
  assert.ok(beats.every((b, i) => !i || b.color !== beats[i - 1].color));
});

test("the script for the tail: chapter headings, every word in the right chapter", () => {
  const words = sampleWords();
  const sentences = groupSentences(words);
  const total = words.at(-1).end;
  const plan = finishPlan({ title: "T", chapters: ruleChapters(sentences, total), bigWords: [], sentences, words, total, preset: loadPreset("talking-head") });
  const md = scriptFromPlan(plan, sentences, words);
  assert.match(md, /^# T/);
  const sections = sentenceSections(md, sentences);
  const ch = chapters(sentences, sections, total, "en");
  assert.equal(ch.chapters.length, plan.chapters.length, ch.text);
  ch.chapters.forEach((c, i) => {
    assert.ok(Math.abs(c.start - plan.chapters[i].start) < 0.002);
    assert.equal(c.title, plan.chapters[i].title);
  });
});

test("one scene row per stretch of about 8 s covers every sentence", () => {
  const words = sampleWords();
  const sentences = groupSentences(words);
  const rows = shotRows(sentences);
  assert.equal(rows[0].from, "S1");
  assert.equal(rows.at(-1).to ?? rows.at(-1).from, sentences.at(-1).id);
  assert.ok(rows.length >= 8 && rows.length < sentences.length);
});

// ---- the cursor ----------------------------------------------------------------------------------

test("tiles group into blobs with their box", () => {
  const cols = 6;
  const t = new Uint8Array(cols * 4);
  t[0] = t[1] = t[cols] = 1;
  t[cols * 3 + 5] = 1;
  const b = blobsOf(t, cols, 4);
  assert.equal(b.length, 2);
  assert.deepEqual([b[0].x, b[0].y, b[0].w, b[0].h, b[0].count], [0, 0, 8, 8, 3]);
});

const blob = (x, y, extra = {}) => ({ x, y, w: 16, h: 24, count: 10, moving: 0.5, look: 0.05, ...extra });

test("the thing that travels is the cursor, not what plays in place", () => {
  const steps = [];
  for (let i = 0; i < 90; i++) {
    const blobs = [blob(600 + (i % 2), 400, { w: 40, h: 40, look: 0.06 })]; // an animation, in place
    if (i >= 10 && i < 40) blobs.push(blob(100 + (i - 10) * 12, 200));
    steps.push({ blobs, big: false });
  }
  const frames = chooseTrack(steps, { width: 960, height: 540 });
  assert.ok(frames[39].x > 400 && frames[39].x < 500, String(frames[39].x));
  assert.equal(frames[39].y, 200);
  // it stopped, and it stays where it stopped
  assert.equal(frames[80].x, frames[39].x);
  // the stopped blob corrects where it really stopped
  const late = [...steps];
  late[40] = { blobs: [...steps[40].blobs, blob(frames[39].x + 9, 200, { moving: 0 })], big: false };
  assert.equal(chooseTrack(late, { width: 960, height: 540 })[60].x, frames[39].x + 9);
  assert.ok(frames.filter((f) => f.sure).length >= 25);
});

test("a blob of the same size some way off is on its way; one that grows is not", () => {
  assert.equal(transitOf(blob(100, 100), [blob(80, 100)]), 1);
  assert.equal(transitOf(blob(100, 100), [blob(100, 100)]), 0);
  assert.equal(transitOf(blob(100, 100, { w: 60, h: 60 }), [blob(90, 100, { w: 16, h: 24 })]), 0);
});

test("a click is a stop with the screen answering next to it", () => {
  const f = [];
  for (let i = 0; i < 40; i++) f.push({ t: i / 15, x: i < 10 ? i * 20 : 200, y: 100, near: i === 20 ? [{ x: 210, y: 110, count: 8 }] : [], big: false });
  const clicks = findClicks(f, { width: 960 });
  assert.equal(clicks.length, 1);
  assert.ok(Math.abs(clicks[0].t - 20 / 15) < 0.01);
  // far away: no click
  const far = f.map((x) => ({ ...x, near: x.near.map((n) => ({ ...n, x: 800 })) }));
  assert.equal(findClicks(far, { width: 960 }).length, 0);
  // the screen was busy anyway: a playing video is no click
  const busy = f.map((x) => ({ ...x, near: [{ x: 210, y: 110, count: 8 }] }));
  assert.equal(findClicks(busy, { width: 960 }).length, 0);
});

test("stops are long pauses of the cursor", () => {
  const f = [];
  for (let i = 0; i < 60; i++) f.push({ t: i / 15, x: i < 10 || i > 40 ? i * 10 : 100, y: 50 });
  assert.equal(findStops(f, { min: 1.2 }).length, 1);
});

test("clicks close together share one zoom; the whole screen comes back", () => {
  const near = [{ t: 2, x: 0.3, y: 0.3 }, { t: 3, x: 0.32, y: 0.3 }];
  assert.equal(zoomPlan(near, 30).length, 1);
  assert.equal(zoomPlan([...near, { t: 20, x: 0.8, y: 0.8 }], 30).length, 2);
  // busy for a minute: never one endless zoom
  const busy = Array.from({ length: 60 }, (_, i) => ({ t: i, x: 0.5, y: 0.5 }));
  const z = zoomPlan(busy, 60);
  assert.ok(z.length >= 3, JSON.stringify(z.map((q) => [q.start, q.end])));
  assert.ok(z.every((q) => q.end - q.start <= 9.01));
  // before the first click, and it fits inside the video
  const one = zoomPlan([{ t: 0.2, x: 0.5, y: 0.5 }], 1.5);
  assert.ok(one.every((q) => q.start >= 0 && q.end <= 1.5));
});

test("the view moves softly and never leaves the picture", () => {
  const total = 12;
  const zooms = [{ start: 2, end: 6, path: [{ t: 2, x: 0.95, y: 0.05 }] }];
  const v = viewPath(zooms, null, total);
  assert.equal(v.length, Math.ceil(total * TRACK_FPS) + 1);
  assert.deepEqual(v[0], [0.5, 0.5, 1]);
  for (const [x, y, s] of v) {
    assert.ok(s >= 1 && s <= 1.76);
    assert.ok(x - 0.5 / s >= -0.0001 && x + 0.5 / s <= 1.0001);
    assert.ok(y - 0.5 / s >= -0.0001 && y + 0.5 / s <= 1.0001);
  }
  for (let i = 1; i < v.length; i++) assert.ok(Math.abs(v[i][2] - v[i - 1][2]) < 0.15, "no jump");
  assert.ok(Math.abs(v.at(-1)[2] - 1) < 0.01, "back to the whole screen");
});

test("a path is smooth, without lag, and gaps fill from their neighbours", () => {
  const steps = Array.from({ length: 40 }, (_, i) => (i < 20 ? 0 : 100));
  const s = smoothPath(steps);
  assert.ok(s[19] > 20 && s[20] < 80, "the step is spread on both sides");
  assert.deepEqual(fillGaps([null, 2, null, 4, null]), [2, 2, 3, 4, 4]);
  assert.deepEqual(fillGaps([null, null]), [0, 0]);
});

test("the painted rectangle stays inside the frame", () => {
  const r = cursorRect([955, 535, 16, 24], 2, 1920, 1080);
  assert.ok(r.x + r.w <= 1920 && r.y + r.h <= 1080);
  assert.ok(r.w > 0 && r.h > 0);
  assert.deepEqual(cursorRect([0, 0, 16, 24], 1, 1920, 1080).x, 0);
});

// ---- the person ------------------------------------------------------------------------------------

test("the model's input and its answer", () => {
  assert.deepEqual(inputSize(1920, 1080), { width: 512, height: 288 });
  assert.equal(inputSize(1080, 1920).height % 32, 0);
  const x = toInput(Uint8Array.from([255, 0, 127]), 1, 1);
  assert.equal(x[0], 1);
  assert.equal(x[1], -1);
  const m = toMask(Float32Array.from([0, 0.5, 1]));
  assert.deepEqual([...m], [0, 128, 255]);
  const steady = toMask(Float32Array.from([1, 1, 1]), Uint8Array.from([0, 0, 0]), { keep: 0.5 });
  assert.equal(steady[0], 128);
});

// ---- the composition --------------------------------------------------------------------------------

const planOf = (over = {}) => ({ title: "T", chapters: [{ start: 0, sentence: "S1", title: "One" }, { start: 40, sentence: "S9", title: "Two & more" }], bigWords: [], layouts: [], beats: [], ...over });

test("a talking head: the camera, big words on the word, and no sound but the voice", () => {
  const html = recordedHtml({ plan: planOf({ bigWords: [{ id: "w1", text: "30%", start: 12.5, end: 14, behind: false }] }), preset: loadPreset("talking-head"), total: 60, pictures: { camera: "pictures/camera.mp4" }, shots: [{ start: 0, duration: 60 }] });
  assert.match(html, /id="cam"[^>]*src="pictures\/camera.mp4"/);
  assert.match(html, /id="w1" class="clip bigword" data-start="12.5"/);
  assert.match(html, /tl\.fromTo\("#w1"[^;]*12\.5\)/);
  assert.match(html, /Two &amp; more/);
  assert.match(html, /id="scene-1"[^>]*data-start="0" data-duration="60"/);
  assert.equal((html.match(/<audio/g) ?? []).length, 1);
  assert.doesNotMatch(html, /whoosh|sfx|\.wav/i);
});

test("a big word behind the head sits under the cut-out, over B-roll it stays on top", () => {
  const big = [{ id: "w1", text: "WORD", start: 5, end: 7, behind: true }, { id: "w2", text: "OTHER", start: 20, end: 22, behind: true }];
  const html = recordedHtml({ plan: planOf({ bigWords: big }), preset: loadPreset("talking-head"), total: 60, pictures: { camera: "c.mp4" }, cutouts: [{ id: "w1", start: 5, seconds: 2, file: "pictures/cut-w1.webm" }, { id: "w2", start: 20, seconds: 2, file: "x.webm" }], footage: [{ start: 19, end: 23, file: "footage/f-1.mp4" }] });
  assert.match(html, /id="w1"[^>]*z-index:2/);
  assert.match(html, /id="cut-w1"[^>]*z-index:3/);
  assert.match(html, /id="w2"[^>]*z-index:5/);
  assert.match(html, /id="footage-1"[^>]*z-index:4/);
});

test("a screen share moves both pictures at each layout", () => {
  const html = recordedHtml({ plan: planOf({ layouts: [{ start: 0, mode: "full-face" }, { start: 8.2, mode: "split" }, { start: 16.5, mode: "big-screen" }] }), preset: loadPreset("screen-share"), total: 30, pictures: { camera: "c.mp4", screen: "s.mp4" } });
  assert.match(html, /id="screen"/);
  assert.match(html, /id="cam"/);
  assert.equal((html.match(/tl\.to\("#cam"/g) ?? []).length, 2);
  assert.match(html, /8(\.0)?\);/);
  for (const b of Object.values(LAYOUT_BOXES)) assert.ok(b.cam.left + b.cam.width <= 1920 && b.screen.top + b.screen.height <= 1080);
  assert.doesNotMatch(html, /tl\.to\("#cam", \{[^}]*"left"/, "transforms only, as the engine's lint wants");
  // the camera fills its box and is cropped to it; the screen fits whole
  const cam = placeInBox(LAYOUT_BOXES.split.cam, true);
  assert.ok(Math.abs(cam.scale - 740 / 1080) < 0.001);
  assert.ok(Math.abs(cam.x + (1920 - 616 / cam.scale) / 2 * cam.scale - 1264) < 0.05);
  const screen = placeInBox(LAYOUT_BOXES.split.screen, false);
  assert.ok(Math.abs(screen.scale - 1184 / 1920) < 0.001);
  assert.deepEqual(placeInBox(LAYOUT_BOXES["full-face"].cam, true), { x: 0, y: 0, scale: 1, clipPath: "inset(0px 0px 0px 0px round 0px)" });
});

test("a screen recording: the view path, the drawn cursor only when the old one is gone", () => {
  const motion = { size: { width: 1920, height: 1080 }, view: [[0.5, 0.5, 1]], cursor: [[0.2, 0.2]], fps: 15, painted: true };
  const html = recordedHtml({ plan: planOf(), preset: loadPreset("screen-recording"), total: 30, pictures: { screen: "s.mp4", camera: "c.mp4" }, motion });
  assert.match(html, /id="cursor"/);
  assert.match(html, /var VIEW = /);
  assert.match(html, /id="bubble"/);
  const kept = recordedHtml({ plan: planOf(), preset: loadPreset("screen-recording"), total: 30, pictures: { screen: "s.mp4" }, motion: { ...motion, painted: false } });
  assert.doesNotMatch(kept, /id="cursor"/);
  assert.doesNotMatch(kept, /id="bubble"/);
});

test("a silhouette: the figure over a color that changes at each beat", () => {
  const html = recordedHtml({ plan: planOf({ beats: [{ start: 0, color: "#d9482b" }, { start: 24, color: "#2a7f8e" }] }), preset: loadPreset("profile-silhouette"), total: 60, pictures: { figure: "pictures/figure.webm" } });
  assert.match(html, /id="figure"[^>]*figure\.webm/);
  assert.match(html, /background:#d9482b/);
  assert.match(html, /tl\.set\("#stage", \{ backgroundColor: "#2a7f8e" \}, 24\)/);
  assert.doesNotMatch(html, /class="clip chapter"/);
});

test("the fit and the word sizes", () => {
  assert.deepEqual(fitBox(1920, 1080), { x: 0, y: 0, w: 1920, h: 1080 });
  assert.deepEqual(fitBox(1000, 1000), { x: 420, y: 0, w: 1080, h: 1080 });
  assert.ok(wordSize("30%") > wordSize("transformation"));
  assert.equal(FPS, 30);
});
