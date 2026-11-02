// Channels (docs/BUILD_PLAN.md, phase 1): the locked recipe, the week batch, the
// free voice's pronunciation and timing, and music made by code.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defaultRecipe, normalizeRecipe, saveRecipe, loadRecipe, scriptMarkdown, ownMusic, musicDir } from "./channels/recipe.mjs";
import { cleanIdeas, ideaMessages, runWeekBatch, listQueue, WEEK } from "./channels/batch.mjs";
import { createProject, loadProject, saveProject, setGate } from "./project.mjs";
import { narrationFromMarkdown } from "./gates/voice/narration.mjs";
import { arpabetToPhonemes, spellOut, numberWords, spokenWords, phonemize } from "./providers/tts/g2p.mjs";
import { tokenTimes, pieces, VOICES, DEFAULT_VOICE, MODEL_FILES } from "./providers/tts/kokoro.mjs";
import { synthLoop, loopSeconds, MOODS } from "./providers/music/synth.mjs";
import { toRemove, NOT_OURS } from "../scripts/prune-runner.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "itv-channel-"));
const free = { engine: "script", preset: "motion-frames", voice: { provider: "kokoro", voice: "am_michael" }, avatar: { on: false }, music: { on: true, source: "synth", mood: "calm" }, targetLengthMin: 8 };

test("a new channel starts free: local voice, music by code, the default preset", () => {
  const r = defaultRecipe({});
  assert.equal(r.voice.provider, "kokoro");
  assert.equal(r.music.source, "synth");
  assert.equal(r.preset, "motion-frames");
  assert.equal(r.avatar.on, false);
});

test("a channel that already has its clone and avatar keeps them", () => {
  const r = defaultRecipe({ narrator: { provider: "elevenlabs", voice: "abc" }, avatar: { enabled: true, lookId: "look" }, defaults: { targetLengthMin: 12 } });
  assert.deepEqual(r.voice, { provider: "elevenlabs", voice: "abc" });
  assert.equal(r.avatar.on, true);
  assert.equal(r.targetLengthMin, 12);
});

test("the avatar rule is not a choice: avatar_iii, overlay", () => {
  const r = normalizeRecipe({ ...free, avatar: { on: true, lookId: "x", engine: "avatar_v", layout: "circle" } });
  assert.equal(r.avatar.engine, "avatar_iii");
  assert.equal(r.avatar.layout, "overlay");
});

test("a recipe that cannot work says so", () => {
  assert.throws(() => normalizeRecipe({ ...free, engine: "cinema" }), /not built yet/);
  assert.throws(() => normalizeRecipe({ ...free, engine: "recorded" }), /belongs to the script engine/);
  assert.throws(() => normalizeRecipe({ ...free, preset: "nope" }), /no style preset/);
  assert.throws(() => normalizeRecipe({ ...free, voice: { provider: "gemini", voice: "Kore" } }), /free voice, or your ElevenLabs/);
  assert.throws(() => normalizeRecipe({ ...free, voice: { provider: "elevenlabs", voice: "" } }), /Choose which ElevenLabs/);
  assert.throws(() => normalizeRecipe({ ...free, avatar: { on: true } }), /avatar look/);
  assert.throws(() => normalizeRecipe({ ...free, targetLengthMin: 0 }), /1 to 30/);
  assert.throws(() => normalizeRecipe(free, { language: "hu" }), /English only/);
  assert.equal(normalizeRecipe({ ...free, voice: { provider: "kokoro", voice: "unknown" } }).voice.voice, DEFAULT_VOICE);
});

test("the recipe survives a save, and the channel gets its own music folder", () => {
  const dir = tmp();
  assert.equal(loadRecipe(dir), null);
  const saved = saveRecipe(dir, free);
  assert.deepEqual(loadRecipe(dir), saved);
  assert.ok(fs.statSync(musicDir(dir)).isDirectory());
  fs.writeFileSync(path.join(musicDir(dir), "a.mp3"), "x");
  fs.writeFileSync(path.join(musicDir(dir), "notes.txt"), "x");
  assert.deepEqual(ownMusic(dir), ["a.mp3"]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a video keeps the recipe it started with", () => {
  const dir = tmp();
  const { dir: v } = createProject({ projectsDir: dir, title: "T", recipe: normalizeRecipe(free) });
  assert.equal(loadProject(v).recipe.preset, "motion-frames");
  saveProject(v, setGate(loadProject(v), "script", { state: "approved" }));
  assert.equal(loadProject(v).recipe.voice.provider, "kokoro");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a pasted script: its own title and parts, or cut into parts", () => {
  const own = scriptMarkdown("# My title\n\n## One\n\nFirst part.\n\n## Two\n\nSecond part.");
  assert.equal(own.title, "My title");
  assert.deepEqual(narrationFromMarkdown(own.markdown).map((b) => b.heading), ["One", "Two"]);

  const para = Array.from({ length: 100 }, (_, i) => `word${i}`).join(" ");
  const plain = scriptMarkdown(`${para}.\n\n${para}.\n\n${para}.`);
  assert.equal(plain.title, "word0 word1 word2 word3 word4 word5 word6 word7");
  const blocks = narrationFromMarkdown(plain.markdown);
  assert.equal(blocks.length, 2);
  // nothing lost
  assert.equal(blocks.flatMap((b) => b.text.split(" ")).length, 300);
  assert.throws(() => scriptMarkdown("  "), /empty/);
});

test("the ideas: exactly the count, none twice, none already made", () => {
  const answer = { videos: [{ title: "One" }, { title: "one " }, { title: "Two", angle: " a  b " }, { title: "" }, { title: "Done" }, { title: "Three" }] };
  const ideas = cleanIdeas(answer, { count: 2, avoid: ["Done"] });
  assert.deepEqual(ideas, [{ title: "One", angle: "" }, { title: "Two", angle: "a b" }]);
  assert.deepEqual(cleanIdeas({ videos: "x" }), []);
  const m = ideaMessages({ channel: { audience: "makers" }, name: "C", theme: "maps", avoid: ["Old video"] }).map((x) => x.content).join(" ");
  assert.match(m, /exactly 7 videos/);
  assert.match(m, /maps/);
  assert.match(m, /Old video/);
});

test("week batch: seven scripts in one run, queued in order; one failure stops nothing", async () => {
  const dir = tmp();
  const prior = globalThis.fetch;
  const titles = Array.from({ length: WEEK }, (_, i) => ({ title: `Video ${i + 1}`, angle: "Why." }));
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ videos: titles }) } }] }) });
  try {
    const wrote = [];
    const r = await runWeekBatch({
      llm: { provider: "gemini", model: "m", apiKey: "k" },
      channel: {},
      name: "C",
      create: ({ title, queue }) => createProject({ projectsDir: dir, title, queue, recipe: normalizeRecipe(free) }),
      write: async ({ dir: d, idea }) => {
        if (idea.title === "Video 3") throw new Error("the AI said no");
        wrote.push(idea.title);
        saveProject(d, setGate(loadProject(d), "script", { state: "pending" }));
      },
    });
    assert.equal(r.written, WEEK - 1);
    assert.equal(r.failed, 1);
    assert.equal(wrote.length, WEEK - 1);
    const q = listQueue(dir);
    assert.deepEqual(q.map((x) => x.position), [1, 2, 3, 4, 5, 6, 7]);
    assert.equal(q[2].script, "todo");
    assert.equal(q[0].script, "pending");
    assert.equal(q[0].of, WEEK);
    // a finished video leaves the queue; nothing here renders or publishes
    const done = { ...setGate(loadProject(q[0].dir), "review", { state: "approved" }), render: { state: "done" } };
    saveProject(q[0].dir, done);
    assert.equal(listQueue(dir).length, WEEK - 1);
  } finally {
    globalThis.fetch = prior;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("pronunciation: the dictionary's sounds in the model's symbols", () => {
  assert.equal(arpabetToPhonemes("HH AH0 L OW1"), "həlˈO");
  assert.equal(arpabetToPhonemes("W AO1 T ER0"), "wˈɔTəɹ", "an American flap in water");
  assert.equal(arpabetToPhonemes("DH AH0", { weak: true }), "ðə");
  assert.equal(arpabetToPhonemes("T UW1", { weak: true }), "tu");
  assert.ok(spellOut("zorgleflax").startsWith("z"));
  assert.ok(spellOut("zorgleflax").includes("ˈ"));
});

test("numbers are said as words", () => {
  assert.equal(numberWords(0), "zero");
  assert.equal(numberWords(42), "forty two");
  assert.equal(numberWords(1300), "one thousand three hundred");
  assert.equal(numberWords(2500000), "two million five hundred thousand");
  assert.deepEqual(spokenWords("40%,"), ["forty", "percent"]);
  assert.deepEqual(spokenWords("$5"), ["five", "dollars"]);
  assert.deepEqual(spokenWords("1984"), ["nineteen", "eighty", "four"]);
  assert.deepEqual(spokenWords("2005"), ["two", "thousand", "five"]);
  assert.deepEqual(spokenWords("3.5"), ["three", "point", "five"]);
  assert.deepEqual(spokenWords("2nd"), ["second"]);
  assert.deepEqual(spokenWords("10k"), ["ten", "thousand"]);
});

test("phonemes come back on the script's own words, marks included", async () => {
  const t = await phonemize("They lost 40%, sadly. KPI - water!");
  assert.deepEqual(t.map((x) => x.text), ["They", "lost", "40%,", "sadly.", "KPI -", "water!"]);
  assert.ok(t[2].phonemes.endsWith(","));
  assert.ok(t[5].phonemes.endsWith("!"));
  assert.match(t[4].phonemes, /k.* p.*/, "an acronym is said letter by letter");
});

test("word times: rounded like the model's own sound, and they add up", () => {
  // pad, a, space, b, c, pad; a=word 0, b and c=word 1
  const d = [10.4, 1.6, 0.2, 2.4, 3.49, 7.5];
  const owner = [0, -1, 1, 1];
  const { times, total } = tokenTimes(d, owner, 2, 1);
  assert.deepEqual(times[0], { start: 10, end: 12 });
  // 0.2 is held for one unit at least
  assert.deepEqual(times[1], { start: 13, end: 18 });
  assert.equal(total, 26);
  // a token with no sound stays null, the caller gives it its neighbour's time
  assert.equal(tokenTimes([1, 1, 1], [-1], 1, 1).times[0], null);
});

test("a long sentence is cut at a pause, within the model's limit", () => {
  const tk = (p) => ({ text: p, phonemes: p });
  const long = Array.from({ length: 30 }, (_, i) => tk(`${"a".repeat(20)}${i % 8 === 7 ? "," : ""}`));
  const out = pieces(long, 200);
  assert.ok(out.length >= 2);
  assert.deepEqual(out.flat(), long, "nothing lost, nothing moved");
  for (const p of out) assert.ok(p.reduce((n, t) => n + t.phonemes.length + 1, 0) <= 200);
});

test("the free voice's files are pinned", () => {
  for (const f of Object.values(MODEL_FILES)) assert.match(f.sha256, /^[0-9a-f]{64}$/);
  for (const v of Object.values(VOICES)) assert.match(v.sha256, /^[0-9a-f]{64}$/);
  assert.ok(VOICES[DEFAULT_VOICE]);
  // American voices only, the phonemes are American English
  assert.ok(Object.keys(VOICES).every((k) => /^a[fm]_/.test(k)));
});

test("music by code: a real WAV, deterministic, different per video, no seam", () => {
  const a = synthLoop({ mood: "calm", seed: 1 });
  assert.equal(a.toString("ascii", 0, 4), "RIFF");
  assert.deepEqual(a, synthLoop({ mood: "calm", seed: 1 }));
  assert.notDeepEqual(a, synthLoop({ mood: "calm", seed: 2 }));
  const pcm = a.subarray(44);
  const frames = pcm.length / 4;
  assert.ok(Math.abs(frames / 44100 - loopSeconds("calm")) < 0.01);
  let peak = 0;
  for (let i = 0; i < frames; i += 7) peak = Math.max(peak, Math.abs(pcm.readInt16LE(i * 4)));
  assert.ok(peak > 8000 && peak < 32767, `peak ${peak}`);
  // the end meets the start: no jump bigger than the signal's own movement
  const jump = Math.abs(pcm.readInt16LE(0) - pcm.readInt16LE((frames - 1) * 4));
  assert.ok(jump < 2000, `seam jump ${jump}`);
  for (const m of Object.keys(MOODS)) assert.ok(synthLoop({ mood: m, seed: 3 }).length > 44, m);
});

test("the bundle keeps one platform of the voice runtime, without Microsoft's DirectML", () => {
  const dir = tmp();
  for (const f of ["napi-v3/win32/x64/onnxruntime.dll", "napi-v3/win32/x64/DirectML.dll", "napi-v3/win32/x64/dxil.dll", "napi-v3/win32/arm64/onnxruntime.dll", "napi-v3/linux/x64/libonnxruntime.so", "napi-v3/darwin/arm64/libonnxruntime.dylib"]) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), "x");
  }
  const gone = toRemove(dir, "win32", "x64").map((p) => path.relative(dir, p).replace(/\\/g, "/")).sort();
  assert.deepEqual(gone, ["napi-v3/darwin", "napi-v3/linux", "napi-v3/win32/arm64", "napi-v3/win32/x64/DirectML.dll", "napi-v3/win32/x64/dxil.dll"]);
  assert.ok(NOT_OURS.includes("DirectML.dll"));
  fs.rmSync(dir, { recursive: true, force: true });
});
