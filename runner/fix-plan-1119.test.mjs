// fix-plan-1119.test.mjs: the must-haves of docs/FIX_PLAN_2026-11-19.md (DECISIONS 187 to 190):
// Shorts (9:16), the three languages of a video and Khmer, a stuck AI step. The top bar with a long
// Identity name is scripts/ui-mock/topbar.test.mjs; renaming keeps the folder is a Rust test
// (identity.rs a_rename_changes_only_the_display_name); real renders: scripts/phase2/shorts-e2e.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { withFormat, formatOf, isShort, safeBox, middleThird, SHORT_SECONDS, sizeOf } from "./shorts/index.mjs";
import { contentOf, fitText, keyWords, screenHtml, captionsHtml, captionChunks, skinOf, ZONES, SKINS } from "./shorts/vertical.mjs";
import { screensOf } from "./shorts/build.mjs";
import { normalizeRecipe, defaultRecipe } from "./channels/recipe.mjs";
import { canSpeak, voiceProblem, videoLanguages, needsTranslation, speakersOf, scriptFallbackCss, CONTENT_LANGUAGES } from "./language/index.mjs";
import { saveTranslation, translationOf, translatedMarkdown, sourceUnits, splitSentences } from "./language/translate.mjs";
import { captionWords, spreadWords } from "./language/captions.mjs";
import { firstInTime, withDeadline, DeadlineError, aiTries, aiStepSeconds } from "./deadline.mjs";
import { makeVoice } from "./gates/voice/index.mjs";
import { shortTexts } from "./gates/render/youtube.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "itv-1119-"));

// ---- Shorts --------------------------------------------------------------------------------

test("a Short is 1080x1920, its length in seconds", () => {
  const r = withFormat({ targetLengthMin: 8 }, { format: "short", shortSeconds: 30 });
  assert.equal(r.format, "short");
  assert.equal(r.shortSeconds, 30);
  assert.equal(r.targetLengthMin, 0.5);
  assert.deepEqual(sizeOf("short"), { width: 1080, height: 1920 });
  assert.deepEqual(sizeOf("long"), { width: 1920, height: 1080 });
  assert.equal(withFormat({ format: "short" }, { shortSeconds: 7 }).shortSeconds, 60, "an unknown length takes the default");
  assert.deepEqual(SHORT_SECONDS, [15, 30, 45, 60, 90]);
  assert.equal(formatOf({ recipe: { format: "short" } }), "short");
  assert.equal(isShort({}), false, "an old project is long form");
});

test("the recipe keeps the format; a video can change it", () => {
  const base = { ...defaultRecipe({}), preset: "stick-world" };
  const short = normalizeRecipe({ ...base, format: "short", shortSeconds: 45 });
  assert.equal(short.format, "short");
  assert.equal(short.shortSeconds, 45);
  assert.equal(short.targetLengthMin, 0.75);
  const long = normalizeRecipe({ ...base, targetLengthMin: 6 });
  assert.equal(long.format, "long");
  assert.equal(long.targetLengthMin, 6);
  assert.throws(() => normalizeRecipe({ ...base, targetLengthMin: 0.5 }), /1 to 30 minutes/);
  assert.equal(withFormat(long, { format: "short", shortSeconds: 15 }).targetLengthMin, 0.25);
});

test("one idea per screen: a scene of three sentences is three screens", () => {
  const sentences = [
    { id: "S1", start: 0, end: 2, text: "Most people start the day tired." },
    { id: "S2", start: 2.2, end: 4, text: "Here is a fix." },
    { id: "S3", start: 4.2, end: 6, text: "It takes five minutes." },
    { id: "S4", start: 6.2, end: 8, text: "Try it." },
  ];
  const scenes = [{ from: "S1", to: "S3", template: "statement", params: { line1: "Start tired", line2: "Fix it" } }, { from: "S4", template: "word", params: { word: "Try" } }];
  const screens = screensOf(scenes, sentences, [{ start: 0, duration: 6.2 }, { start: 6.2, duration: 2 }]);
  assert.equal(screens.length, 4);
  assert.equal(screens[0].content.layout, "lines");
  assert.equal(screens[1].start, 2.2);
  assert.equal(screens[3].content.layout, "word");
  assert.equal(screens.reduce((a, s) => a + s.seconds, 0).toFixed(2), "8.20", "the screens cover the whole video");
});

test("what a scene says becomes its vertical layout", () => {
  assert.equal(contentOf({ params: { value: 27 }, template: "percent" }, "27% of your air").layout, "percent");
  assert.equal(contentOf({ params: { step1: "a", step2: "b", step3: "c", step4: "d" } }, "").layout, "list");
  assert.equal(contentOf({ params: { left: "you", right: "them" } }, "").layout, "versus");
  assert.equal(contentOf({ params: { from: "rain", to: "flood" } }, "").layout, "flow");
  assert.equal(contentOf({ params: { question: "Why" } }, "").layout, "question");
  assert.equal(contentOf({ params: { headline: "Hi", object: "none" }, template: "title" }, "").icon, null, "the neutral object names nothing to draw");
  assert.equal(contentOf({ component: "cta-close", vars: { action_line: "Comment GUIDE", button_label: "GUIDE" } }, "").layout, "cta");
  assert.equal(contentOf({}, "Finally we show it to the class today").layout, "lines");
});

test("key words: a long sentence is never cut in the middle of a phrase", () => {
  assert.equal(keyWords("Here is a fix."), "Here is a fix");
  const k = keyWords("Finally we show it to the whole class at the end of the lesson today");
  assert.ok(!/the$/.test(k), k);
  assert.ok(k.split(" ").length <= 7, k);
});

test("text fits its zone: never past the safe box, never into the captions", () => {
  const box = safeBox();
  assert.equal(box.right, 950, "the right 12 percent stays free");
  assert.equal(box.bottom, 1536, "the lower 20 percent stays free");
  const mid = middleThird();
  assert.ok(ZONES.captions.top >= mid.top && ZONES.captions.bottom <= mid.bottom, "the captions sit in the middle third");
  const { size, lines } = fitText("Then open the window and breathe slowly", { k: 0.58, maxLines: 3, height: ZONES.phrase.bottom - ZONES.phrase.top });
  assert.ok(lines * size * 1.1 <= ZONES.phrase.bottom - ZONES.phrase.top, `${lines} lines at ${size}px`);
});

test("every preset has a 9:16 skin, and a screen registers its own timeline by name", () => {
  for (const p of ["motion-frames", "explainer-3d", "stick-world", "archive-collage", "night-case-file", "soft-clay"]) {
    assert.ok(SKINS[p], p);
    const html = screenHtml({ id: "vscreen-3", seconds: 2.5, skin: skinOf(p), content: { layout: "lines", line1: "Small steps beat big plans" }, icon: { d: ["M2 2 L22 22"] } });
    assert.match(html, /window\.__timelines\["vscreen-3"\] = tl/);
    assert.match(html, /data-duration="2.5"/);
    // nothing placed past the right edge of the safe box
    for (const m of html.matchAll(/left:(\d+)px;width:(\d+)px/g)) assert.ok(Number(m[1]) + Number(m[2]) <= 950, `${p}: ${m[0]}`);
  }
  assert.equal(skinOf("talking-head").id, "motion-frames", "an unknown preset takes the default skin");
});

test("captions: short groups, a new one after a pause or a sentence end", () => {
  const w = (text, start, end) => ({ text, start, end });
  const chunks = captionChunks([w("One", 0, 0.3), w("two", 0.3, 0.6), w("three", 0.6, 0.9), w("four.", 0.9, 1.2), w("Next", 2, 2.3)]);
  assert.deepEqual(chunks.map((c) => c.words.length), [3, 1, 1]);
  const html = captionsHtml({ words: [w("Hello", 0, 0.4)], total: 2 });
  assert.match(html, /window\.__timelines\["vcaptions"\]/);
});

test("the Short's Publishing Card: one title line, a short description, hashtags", () => {
  const t = shortTexts({ title: "Three habits for a calm morning", summary: "Most people start tired. Here is a fix that takes five minutes.", tags: ["morning routine", "habits"] });
  assert.equal(t.titles.length, 1);
  assert.match(t.description, /#Shorts #morningroutine #habits$/);
  assert.ok(t.description.length < 260);
});

// ---- languages and Khmer --------------------------------------------------------------------

test("no ElevenLabs model speaks Khmer; HeyGen does inside an avatar video", () => {
  for (const m of ["eleven_v4", "eleven_v3", "eleven_multilingual_v2", "eleven_turbo_v2_5"]) assert.equal(canSpeak("elevenlabs", m, "km"), false, m);
  assert.equal(canSpeak("heygen", "heygen-voice-1", "km"), false);
  assert.equal(canSpeak("heygen", "avatar-video", "km"), true);
  assert.equal(canSpeak("elevenlabs", "eleven_v4", "hu"), true);
  assert.equal(canSpeak("kokoro", "kokoro", "hu"), false);
  assert.equal(voiceProblem("elevenlabs", "eleven_v3", "km"), "ElevenLabs cannot speak Khmer with eleven_v3. Gemini (free), Azure or HeyGen inside an avatar video can.");
  assert.equal(canSpeak("azure", null, "km"), true);
  assert.equal(canSpeak("googlecloud", null, "km"), false, "Google has no Khmer (its voice list, 2026-11-19)");
  assert.equal(voiceProblem("elevenlabs", "eleven_v4", "en"), null);
  assert.equal(voiceProblem("unknown-voice", null, "km"), null, "a provider the table does not know is not judged");
  assert.deepEqual(speakersOf("km"), [{ provider: "gemini", model: "gemini" }, { provider: "azure", model: "azure" }, { provider: "heygen", model: "avatar-video" }]);
});

test("the free Gemini voice speaks Khmer and every content language (DECISIONS 197)", () => {
  assert.equal(canSpeak("gemini", null, "km"), true);
  assert.equal(voiceProblem("gemini", null, "km"), null);
  for (const l of CONTENT_LANGUAGES) assert.equal(canSpeak("gemini", null, l.code ?? l), true, l.code ?? l);
  assert.equal(canSpeak("gemini", null, "uk"), false, "its model page lists no Ukrainian");
});

test("the three languages default to the video's language", () => {
  const l = videoLanguages({ language: "en", languages: { captions: "km" } });
  assert.deepEqual(l, { source: "en", voice: "en", captions: "km", screen: "en" });
  assert.deepEqual(needsTranslation(l), ["captions"]);
});

function khmerProject() {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, "project.json"), JSON.stringify({ language: "en", languages: { captions: "km" } }));
  fs.writeFileSync(path.join(dir, "script.md"), "# Morning\n\n## Open\n\nMost people start tired. Here is a fix.\n\n[CALLOUT: on screen only]\n\n## Close\n\nTry it for 7 days.\n");
  return dir;
}

test("a translation: sentence by sentence, approved into script.<lang>.md", () => {
  const dir = khmerProject();
  assert.deepEqual(sourceUnits(dir), ["Most people start tired.", "Here is a fix.", "Try it for 7 days."]);
  assert.throws(() => saveTranslation(dir, "km", ["a", "b"]), /has 2 sentences, the script has 3/);
  assert.throws(() => saveTranslation(dir, "km", ["a", "", "c"], { approve: true }), /no translation yet/);
  const t = saveTranslation(dir, "km", ["មនុស្សភាគច្រើនហត់។", "នេះជាដំណោះស្រាយ។", "សាកល្បង 7 ថ្ងៃ។"], { approve: true });
  assert.equal(t.approved, true);
  const md = fs.readFileSync(path.join(dir, "script.km.md"), "utf8");
  assert.match(md, /## Open\n\nមនុស្សភាគច្រើនហត់។ នេះជាដំណោះស្រាយ។/);
  assert.match(md, /\[CALLOUT: on screen only\]/, "a callout line stays as it is");
  assert.equal(translationOf(dir, "km").stale, false);
  fs.appendFileSync(path.join(dir, "script.md"), "\nOne more line.\n");
  assert.equal(translationOf(dir, "km").stale, true, "a changed script makes the translation stale");
  assert.deepEqual(splitSentences("ផឹកទឹក។ បើកបង្អួច។"), ["ផឹកទឹក។", "បើកបង្អួច។"]);
});

test("Khmer captions on the English voice's sentence times", () => {
  const dir = khmerProject();
  saveTranslation(dir, "km", ["មនុស្សភាគច្រើនហត់។", "នេះជាដំណោះស្រាយ។", "សាកល្បង 7 ថ្ងៃ។"], { approve: true });
  const sentences = [
    { id: "S1", start: 0, end: 2 },
    { id: "S2", start: 2.5, end: 3.5 },
    { id: "S3", start: 4, end: 6 },
  ];
  const cap = captionWords(dir, { words: [{ text: "Most", start: 0, end: 0.3 }], sentences });
  assert.deepEqual(cap.families, ["Noto Sans Khmer"]);
  assert.ok(cap.words.length >= 3);
  assert.equal(cap.words[0].start, 0);
  const s3 = cap.words.filter((w) => w.start >= 4);
  assert.ok(s3.length && s3.every((w) => w.end <= 6.001), "the third sentence's words stay in its time");
  // a long Khmer phrase without spaces is split into readable pieces
  assert.ok(spreadWords("មនុស្សភាគច្រើនចាប់ផ្តើមថ្ងៃដោយហត់នឿយ", 0, 2, "km").length > 1);
});

test("Khmer letters draw with Noto Sans Khmer under every display font", () => {
  const css = "@font-face { font-family: 'Noto Sans Khmer'; src: url('k.woff2'); unicode-range: U+1780-17FF; }\n@font-face { font-family: 'Noto Sans Khmer'; src: url('l.woff2'); unicode-range: U+0000-00FF; }";
  const extra = scriptFallbackCss(css, ["Rubik", "Noto Sans Khmer"]);
  assert.match(extra, /font-family: 'Rubik'; src: url\('k\.woff2'\); unicode-range: U\+1780-17FF/);
  assert.ok(!extra.includes("l.woff2"), "only the Khmer part, the display font keeps its own Latin letters");
});

test("the voice gate never sends Khmer to ElevenLabs: it refuses before any call", async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, "project.json"), JSON.stringify({ language: "km" }));
  fs.writeFileSync(path.join(dir, "script.md"), "# T\n\n## A\n\nសួស្តី។\n");
  let called = 0;
  await assert.rejects(makeVoice({ projectDir: dir, narrator: { provider: "elevenlabs", voice: "v1", model: "eleven_v4" }, apiKey: "k", language: "km", fetchImpl: async () => (called++, new Response("{}")) }), /ElevenLabs cannot speak Khmer/);
  assert.equal(called, 0);
});

// ---- a stuck AI step --------------------------------------------------------------------------

test("a stuck AI try is given up at its limit, the next key gets one try", async () => {
  const never = () => new Promise(() => {});
  const seen = [];
  const t0 = Date.now();
  const got = await firstInTime([{ provider: "gemini" }, { provider: "claude" }], (ai) => (ai.provider === "gemini" ? never() : Promise.resolve("plan")), { seconds: 0.2, onGiveUp: (e, ai, next) => seen.push([ai.provider, next?.provider ?? null]) });
  assert.equal(got.result, "plan");
  assert.deepEqual(seen, [["gemini", "claude"]]);
  assert.ok(Date.now() - t0 < 2000);
});

test("when every try gives up, the caller takes the free path", async () => {
  const got = await firstInTime([{ provider: "gemini" }, { provider: "claude" }], () => new Promise(() => {}), { seconds: 0.1 });
  assert.equal(got.result, null);
  assert.equal(got.failed.length, 2);
  assert.ok(got.failed.every((f) => f.timedOut));
});

test("a refused scene table is an error, not a stuck AI", async () => {
  await assert.rejects(firstInTime([{ provider: "gemini" }, { provider: "claude" }], () => Promise.reject(new Error("did not pass the checks")), { seconds: 1 }), /did not pass the checks/);
  await assert.rejects(withDeadline(() => new Promise(() => {}), 0.05, "too slow"), DeadlineError);
});

test("at most two tries, without the long patient waits; the limit is the user's choice", () => {
  const tries = aiTries({ provider: "gemini", model: "x" }, "k1", [{ provider: "gemini", apiKey: "k2" }, { provider: "claude", apiKey: "k3" }, { provider: "openai", apiKey: "k4" }]);
  assert.deepEqual(tries.map((t) => t.provider), ["gemini", "claude"]);
  assert.ok(tries.every((t) => t.patient === false));
  assert.equal(aiStepSeconds("scenes", {}), 180, "3 minutes unless the user chose otherwise");
  assert.equal(aiStepSeconds("scenes", {}, 90), 90);
  assert.equal(aiStepSeconds("scenes", {}, 0), Infinity, "No limit: wait like before");
  assert.equal(aiStepSeconds("scenes", { ITV_AI_SCENES_SECONDS: "30" }), 30);
});

test("the window's language list is the runner's, with who speaks each", async () => {
  const { source, OUT } = await import("../scripts/make-language-list.mjs");
  assert.equal(fs.readFileSync(OUT, "utf8").replace(/\r\n/g, "\n"), source(), "run node scripts/make-language-list.mjs");
  const { languageList } = await import("../scripts/make-language-list.mjs");
  const km = languageList().find((l) => l.code === "km");
  assert.deepEqual(km.voices, ["Gemini (free)", "Azure", "HeyGen (avatar video)"]);
  assert.ok(!languageList().find((l) => l.code === "hu").voices.includes("The free voice"), "the free voice is English only");
});

// ---- items 5 to 9 (DECISIONS 191 to 195) -----------------------------------------------------

import { keyPhrase, keyWord } from "./gates/scenes/keyphrase.mjs";
import * as googlecloud from "./providers/tts/googlecloud.mjs";
import * as azure from "./providers/tts/azure.mjs";
import { writeWav } from "./providers/tts/gemini.mjs";
import { screenTexts, applyScreenTexts } from "./language/screen.mjs";

test("the free plan never cuts a phrase in the middle, and its big word means something", () => {
  assert.equal(keyPhrase("Finally we show it to the class at the end of the lesson", 6), "show class end lesson");
  assert.equal(keyPhrase("Look inside the Moon and find a core.", 5), "Look inside the Moon");
  assert.equal(keyPhrase("Drink water.", 6), "Drink water");
  assert.equal(keyWord("First drink a glass of water before your phone"), "drink");
});

const wav = (seconds) => writeWav({ channels: 1, rate: 24000, bits: 16, pcm: Buffer.alloc(Math.round(seconds * 24000) * 2) });

test("Google Cloud: one call per sentence, each sentence's words in its own time, the key only in the header", async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, key: init.headers["x-goog-api-key"], body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ audioContent: wav(1).toString("base64") }), { status: 200 });
  };
  const r = await googlecloud.speak({ apiKey: "g-key", fetchImpl, voiceId: "hu-HU-Chirp3-HD-Kore", text: "Jó reggelt. Igyál vizet." });
  assert.equal(seen.length, 2);
  assert.ok(seen.every((x) => !x.url.includes("g-key") && x.key === "g-key"));
  assert.equal(seen[0].body.voice.languageCode, "hu-HU");
  assert.equal(r.ext, "wav");
  assert.equal(r.words.find((w) => w.text === "Igyál").start, 1.25, "the second sentence starts after the first and the gap");
});

test("Azure: the key is region:key, Khmer goes as km-KH SSML, a refused key is one sentence", async () => {
  assert.throws(() => azure.splitKey("abc"), /region:key/);
  assert.deepEqual(azure.splitKey("SoutheastAsia:abc"), { region: "southeastasia", key: "abc" });
  let body = "";
  let url = "";
  const ok = async (u, init) => {
    url = u;
    body = init.body;
    return new Response(wav(0.5), { status: 200 });
  };
  const r = await azure.speak({ apiKey: "southeastasia:abc", fetchImpl: ok, voiceId: "km-KH-SreymomNeural", text: "សួស្តី។" });
  assert.match(url, /^https:\/\/southeastasia\.tts\.speech\.microsoft\.com\//);
  assert.match(body, /xml:lang="km-KH"><voice name="km-KH-SreymomNeural">សួស្តី។<\/voice>/);
  assert.equal(r.words.length, 1);
  await assert.rejects(azure.speak({ apiKey: "westeurope:bad", fetchImpl: async () => new Response("no", { status: 401 }), voiceId: "km-KH-PisethNeural", text: "a." }), /Azure refused the key/);
});

test("the words on screen: text params translated, objects, numbers and keywords never", () => {
  const templates = [{ id: "statement", params: { line1: { maxWords: 5 }, line2: { maxWords: 4 }, object: { type: "object" } }, draw: { component: "x:statement", vars: { line1: "$line1", line2: "$line2", object: "$object" } } }];
  const table = { scenes: [
    { from: "S1", template: "statement", component: "x:statement", params: { line1: "Drink water", line2: "every day", object: "glass" }, vars: { line1: "Drink water", line2: "every day", object: "glass" } },
    { from: "S2", component: "cta-close", vars: { action_line: "Comment GUIDE below", button_label: "GUIDE" } },
  ] };
  const items = screenTexts(table, templates);
  assert.deepEqual(items.map((i) => i.text), ["Drink water", "every day", "Comment GUIDE below"]);
  const next = applyScreenTexts(table, templates, items, ["ផឹកទឹក", "រៀងរាល់ថ្ងៃ", "Comment GUIDE ខាងក្រោម"]);
  assert.equal(next.scenes[0].vars.line1, "ផឹកទឹក");
  assert.equal(next.scenes[0].vars.object, "glass", "a drawn object keeps its name");
  assert.equal(next.scenes[1].vars.button_label, "GUIDE", "the comment keyword stays");
  assert.equal(next.scenes[0].screenSource.params.line1, "Drink water", "the words before are kept");
  assert.equal(screenTexts(next, templates)[0].text, "Drink water", "a second run translates from the words before");
});

test("Free only is kept by the recipe", () => {
  const base = { ...defaultRecipe({}), preset: "stick-world" };
  assert.equal(normalizeRecipe({ ...base, freeOnly: true }).freeOnly, true);
  assert.equal(normalizeRecipe(base).freeOnly, false);
});

test("Khmer keeps its vowel signs in every on-screen text of the plan", () => {
  assert.equal(keyPhrase("ផឹកទឹក", 6), "ផឹកទឹក");
  assert.equal(keyPhrase("ផឹកទឹកមួយកែវ មុនពេល មើលទូរស័ព្ទ", 6), "ផឹកទឹកមួយកែវ មុនពេល មើលទូរស័ព្ទ");
  assert.match(shortTexts({ title: "t", summary: "s.", tags: ["ទម្លាប់"] }).description, /#ទម្លាប់/);
});

test("a video made from the ONE Video list takes its Identity's recipe: a Short stays a Short", async () => {
  const { spawnSync } = await import("node:child_process");
  const { saveRecipe } = await import("./channels/recipe.mjs");
  const base = tmp();
  const identityDir = path.join(base, "identity");
  const projectsDir = path.join(base, "videos");
  fs.mkdirSync(projectsDir, { recursive: true });
  saveRecipe(identityDir, { ...defaultRecipe({}), preset: "stick-world", format: "short", shortSeconds: 60 });
  const r = spawnSync(process.execPath, [path.join(import.meta.dirname, "main.mjs"), "create-project"], { input: JSON.stringify({ projectsDir, identityDir, title: "Hello Cambodia", language: "en", identity: "x" }), encoding: "utf8" });
  const last = JSON.parse(r.stdout.trim().split("\n").at(-1));
  assert.equal(last.event, "result", r.stderr);
  const project = JSON.parse(fs.readFileSync(path.join(last.data.dir, "project.json"), "utf8"));
  assert.equal(project.recipe.preset, "stick-world");
  assert.equal(project.recipe.format, "short");
});

test("a recipe can choose the free Gemini voice, also for Khmer (DECISIONS 197)", () => {
  const r = normalizeRecipe({ ...defaultRecipe(), voice: { provider: "gemini", voice: "Kore" } }, { language: "km" });
  assert.deepEqual([r.voice.provider, r.voice.voice], ["gemini", "Kore"]);
  assert.throws(() => normalizeRecipe({ ...defaultRecipe(), voice: { provider: "gemini", voice: "" } }, { language: "km" }), /Gemini voice/);
});

test("the Voice tab offers Gemini first, as the free choice (DECISIONS 197)", () => {
  const src = fs.readFileSync(new URL("../app/src/lib/catalog.ts", import.meta.url), "utf8");
  const list = src.slice(src.indexOf("export const VOICE_SERVICES"));
  assert.ok(list.indexOf('id: "gemini"') > 0 && list.indexOf('id: "gemini"') < list.indexOf('id: "googlecloud"'));
});
