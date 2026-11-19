import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { narrationFromMarkdown, wordCount } from "./gates/voice/narration.mjs";
import { wordsFromCharacters } from "./providers/tts/align.mjs";
import { listVoices, speak, previewAllowed } from "./providers/tts/elevenlabs.mjs";
import { parseIntegrated, joinFilter, musicGainDb, mixFilter, joinBlocks, mix, loudness, duration, PAUSE_SECONDS } from "./audio.mjs";
import { makeVoice, VOICE_PROVIDERS } from "./gates/voice/index.mjs";
import { WAITS } from "./providers/retry.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const KEY = "el-test-0123456789abcdefghij";

const MD = `# Three steps to your first video

## OPEN

You want to start a channel.

In this video I'll show you three steps.

## 1. Pick one viewer

Most channels fail because they talk to everyone.

[CALLOUT: one viewer, one problem]

If you want this as a checklist, get it below.

## OWN

So it comes down to one viewer.
`;

test("narration: one block per section, no title, no headings, no callouts", () => {
  const b = narrationFromMarkdown(MD);
  assert.deepEqual(b.map((x) => x.heading), ["OPEN", "1. Pick one viewer", "OWN"]);
  assert.equal(b[0].text, "You want to start a channel. In this video I'll show you three steps.");
  assert.ok(!b[1].text.includes("CALLOUT"));
  assert.ok(b[1].text.endsWith("get it below."));
  assert.ok(!b.some((x) => x.text.includes("Three steps to your first video")));
  assert.equal(wordCount(b), 6 + 8 + 8 + 10 + 7);
});

test("alignment: characters become words with offset times", () => {
  const chars = [..."Hi there"];
  const starts = chars.map((_, i) => i * 0.1);
  const ends = chars.map((_, i) => i * 0.1 + 0.08);
  const w = wordsFromCharacters({ characters: chars, character_start_times_seconds: starts, character_end_times_seconds: ends }, 10);
  assert.deepEqual(w, [
    { text: "Hi", start: 10, end: 10.18, type: "word" },
    { text: "there", start: 10.3, end: 10.78, type: "word" },
  ]);
});

function fakeFetch(res) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    return { ok: res.status < 300, status: res.status, json: async () => res.json, text: async () => JSON.stringify(res.json ?? res.body ?? "") };
  };
  impl.calls = calls;
  return impl;
}

test("ElevenLabs voices: all of the account (v2), the user's own clone first, key only in the header", async () => {
  const f = fakeFetch({ status: 200, json: { voices: [{ voice_id: "v1", name: "Anna", category: "premade", labels: { gender: "female", accent: "hungarian" }, preview_url: "https://x/p.mp3", verified_languages: [{ language: "hu" }] }, { voice_id: "me", name: "Zoltan clone", category: "cloned", labels: {} }], has_more: false } });
  const v = await listVoices({ apiKey: KEY, fetchImpl: f });
  assert.deepEqual(v.map((x) => [x.id, x.own]), [["me", true], ["v1", false]]);
  assert.deepEqual(v[1], { id: "v1", name: "Anna", category: "premade", own: false, gender: "female", accent: "hungarian", description: null, previewUrl: "https://x/p.mp3", languages: ["hu"] });
  assert.equal(v[0].previewUrl, null, "no ready preview: the UI plays a sample instead");
  assert.match(f.calls[0].url, /\/v2\/voices\?page_size=100/);
  assert.equal(f.calls[0].init.headers["xi-api-key"], KEY);
  assert.ok(!f.calls[0].url.includes(KEY));
});

test("ElevenLabs speak: audio and word timings; errors never show the key", async () => {
  const chars = [..."Hello world"];
  const f = fakeFetch({ status: 200, json: { audio_base64: Buffer.from("mp3").toString("base64"), alignment: { characters: chars, character_start_times_seconds: chars.map((_, i) => i / 10), character_end_times_seconds: chars.map((_, i) => i / 10 + 0.05) } } });
  const r = await speak({ apiKey: KEY, fetchImpl: f, voiceId: "v1", text: "Hello world", previousText: "Before." });
  assert.equal(r.audio.toString(), "mp3");
  assert.deepEqual(r.words.map((w) => w.text), ["Hello", "world"]);
  const body = JSON.parse(f.calls[0].init.body);
  assert.equal(body.previous_text, "Before.");
  assert.equal(body.model_id, "eleven_v4", "Eleven v4 is the default (2026-10-06)");

  const bad = fakeFetch({ status: 401, json: { detail: { status: "invalid_api_key", message: `bad key ${KEY}` } } });
  await assert.rejects(speak({ apiKey: KEY, fetchImpl: bad, voiceId: "v1", text: "x" }), (e) => /rejected the API key/.test(e.message) && !e.message.includes(KEY));
  await assert.rejects(speak({ apiKey: KEY, fetchImpl: f, voiceId: "", text: "x" }), /No ElevenLabs voice/);
});

test("loudness summary is parsed from the last Summary block", () => {
  const err = "[Parsed_ebur128_0 @ x] t: 1 M: -30 S: -30 I: -99 LUFS\nSummary:\n  Integrated loudness:\n    I:         -27.2 LUFS\n    Threshold: -37.5 LUFS";
  assert.equal(parseIntegrated(err), -27.2);
});

test("music gain puts the music 24 LU under the narration, from measurements", () => {
  // the 2026-08-15 measurements: narration -27.2, music -11.5 => -39.7 dB
  assert.equal(musicGainDb(-27.2, -11.5), -39.7);
});

test("filters: pauses between blocks only, the ducked mix chain", () => {
  const j = joinFilter(3, 1.2);
  assert.equal((j.match(/apad=pad_dur=1.2/g) ?? []).length, 2);
  assert.ok(j.endsWith("concat=n=3:v=0:a=1[out]"));
  const m = mixFilter({ seconds: 60, gainDb: -20 });
  for (const part of ["volume=-20dB", "afade=t=out:st=55.00:d=5", "sidechaincompress", "amix=inputs=2:duration=first:normalize=0", "loudnorm=I=-14:TP=-1.5"]) assert.ok(m.includes(part), part);
  assert.equal(mixFilter({ seconds: 60 }), "[0:a]loudnorm=I=-14:TP=-1.5:LRA=11[out]");
});

// Real ffmpeg, when the bundled one has been fetched (scripts/fetch-sidecars.mjs).
const ffdir = path.join(here, "..", "app", "src-tauri", "ffmpeg");
const exe = process.platform === "win32" ? ".exe" : "";
const env = { ...process.env, HYPERFRAMES_FFMPEG_PATH: path.join(ffdir, "ffmpeg" + exe), HYPERFRAMES_FFPROBE_PATH: path.join(ffdir, "ffprobe" + exe) };
const haveFf = fs.existsSync(env.HYPERFRAMES_FFMPEG_PATH);

test("join and mix with the real ffmpeg: offsets, length, -14 LUFS", { skip: !haveFf && "bundled ffmpeg not fetched" }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "itv-audio-"));
  const tone = (name, freq, secs, vol) => {
    const f = path.join(dir, name);
    const r = spawnSync(env.HYPERFRAMES_FFMPEG_PATH, ["-y", "-v", "error", "-f", "lavfi", "-i", `sine=frequency=${freq}:duration=${secs}`, "-af", `volume=${vol}dB`, "-ac", "1", "-c:a", "libmp3lame", f]);
    assert.equal(r.status, 0, String(r.stderr));
    return f;
  };
  const a = tone("a.mp3", 440, 2, -20);
  const b = tone("b.mp3", 550, 3, -20);
  const music = tone("m.mp3", 220, 10, -3);
  const vo = path.join(dir, "vo.mp3");
  const j = await joinBlocks([a, b], vo, { env });
  assert.equal(j.offsets[0], 0);
  assert.ok(Math.abs(j.offsets[1] - (2 + PAUSE_SECONDS)) < 0.1, `second block at ${j.offsets[1]}`);
  assert.ok(Math.abs((await duration(vo, env)) - (5 + PAUSE_SECONDS)) < 0.15);
  const out = path.join(dir, "vo_bgm.mp3");
  const m = await mix({ vo, bgm: music, out, env });
  assert.ok(Math.abs(m.finalLufs - -14) < 0.6, `final ${m.finalLufs} LUFS`);
  assert.ok(m.musicGainDb < 0);
  assert.ok(Math.abs((await duration(out, env)) - (5 + PAUSE_SECONDS)) < 0.15);
  const solo = path.join(dir, "solo.mp3");
  const s = await mix({ vo, out: solo, env });
  assert.equal(s.musicGainDb, null);
  assert.ok(Math.abs((await loudness(solo, { env })) - -14) < 1.5);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("voice samples only from ElevenLabs' own addresses", () => {
  assert.ok(previewAllowed("https://storage.googleapis.com/eleven-public-prod/premade/voices/x/y.mp3"));
  assert.ok(previewAllowed("https://api.elevenlabs.io/v1/sample.mp3"));
  assert.ok(!previewAllowed("https://storage.googleapis.com/someone-else/x.mp3"));
  assert.ok(!previewAllowed("http://api.elevenlabs.io/x.mp3"));
  assert.ok(!previewAllowed("https://elevenlabs.io.evil.com/x.mp3"));
  assert.ok(!previewAllowed("file:///C:/Windows/win.ini"));
});

test("step 3: the app's own sentence table from the voice timings", async () => {
  const { sentenceTable, closesSentence } = await import("./timing/sentences.mjs");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "itv-sent-"));
  fs.mkdirSync(path.join(dir, "audio"));
  const words = ["Pick", "one", "viewer.", "Dr.", "Smith", "said", "so.", "Wait...", "record", "today!", "\"Done.\"", "Tail"].map((text, i) => ({ text, start: i * 0.5, end: i * 0.5 + 0.4, type: "word" }));
  words.splice(3, 0, { text: " ", start: 1.45, end: 1.5, type: "spacing" });
  fs.writeFileSync(path.join(dir, "audio", "stt.json"), JSON.stringify({ words }));
  const r = sentenceTable(dir);
  const s = JSON.parse(fs.readFileSync(path.join(dir, "sentences.json"), "utf8"));
  assert.equal(r.sentences, 5);
  assert.deepEqual(s.map((x) => x.text), ["Pick one viewer.", "Dr. Smith said so.", "Wait... record today!", "\"Done.\"", "Tail"]);
  assert.deepEqual([s[0].id, s[0].start, s[0].end, s[0].words], ["S1", 0, 1.4, 3]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "words.json"), "utf8")).length, 12);
  assert.ok(!closesSentence("J.") && !closesSentence("kb.") && closesSentence("end.)"));
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---- Gemini TTS ----------------------------------------------------------------------

import { splitSentences, parseWav, writeWav, wordsByCharacters, speak as geminiSpeak, speakMany as geminiMany, sentenceCuts, pausesOf, CHUNK_CHARS, listVoices as geminiVoices } from "./providers/tts/gemini.mjs";

test("a Khmer full stop ends a sentence, for the voice and the sentence table (DECISIONS 198)", async () => {
  const { closesSentence } = await import("./timing/sentences.mjs");
  assert.deepEqual(splitSentences("សួស្តី! ថ្ងៃនេះ ជាមួយ AI។ វាងាយស្រួល។"), ["សួស្តី!", "ថ្ងៃនេះ ជាមួយ AI។", "វាងាយស្រួល។"]);
  assert.ok(closesSentence("नमस्ते।") && closesSentence("你好。") && !closesSentence("ថ្ងៃនេះ"));
});

test("gemini: sentences split like the sentence table", () => {
  assert.deepEqual(splitSentences("One idea. Two ideas? Wait... not yet! \"Quoted.\" Tail"), ["One idea.", "Two ideas?", "Wait... not yet!", "\"Quoted.\"", "Tail"]);
});

test("gemini: WAV round trip keeps format and samples", () => {
  const pcm = Buffer.alloc(24000 * 2); // 1 s of silence, 24 kHz mono 16-bit
  const w = parseWav(writeWav({ channels: 1, rate: 24000, bits: 16, pcm }));
  assert.deepEqual([w.channels, w.rate, w.bits, w.pcm.length], [1, 24000, 16, 48000]);
  assert.throws(() => parseWav(Buffer.from("not a wav file at all, nope")), /not WAV/);
});

test("gemini: words spread over the sentence by characters", () => {
  const w = wordsByCharacters("ab cd", 1, 2);
  assert.deepEqual(w, [{ text: "ab", start: 1, end: 1.5, type: "word" }, { text: "cd", start: 1.5, end: 2, type: "word" }]);
});

// a tone, a pause, a tone: what one Gemini reading of two sentences looks like (DECISIONS 198)
const toneWav = (parts) => {
  const rate = 24000;
  const pcm = Buffer.concat(parts.map(([sec, loud]) => {
    const b = Buffer.alloc(Math.round(sec * rate) * 2);
    if (loud) for (let i = 0; i < b.length / 2; i++) b.writeInt16LE(Math.round(Math.sin(i / 7) * 9000), i * 2);
    return b;
  }));
  return writeWav({ channels: 1, rate, bits: 16, pcm });
};

test("gemini: two sentences in one request, cut at the pause between them, key only in the header", async () => {
  const audio = toneWav([[1, true], [0.4, false], [1.2, true]]).toString("base64");
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => ({ steps: [{ type: "model_output", content: [{ type: "audio", data: audio }] }] }) };
  };
  const r = await geminiSpeak({ apiKey: KEY, fetchImpl, voiceId: "Kore", text: "First one. Second one." });
  assert.equal(calls.length, 1, "one request for the whole text");
  assert.equal(calls[0].init.headers["x-goog-api-key"], KEY);
  assert.ok(!calls[0].url.includes(KEY));
  assert.equal(calls[0].body.model, "gemini-3.8-flash-tts");
  assert.deepEqual(calls[0].body.generation_config.speech_config, [{ voice: "Kore" }]);
  assert.equal(calls[0].body.input[0].content[0].text, "First one. Second one.");
  assert.equal(r.ext, "wav");
  assert.equal(parseWav(r.audio).pcm.length, Math.round(2.6 * 24000) * 2, "nothing added, nothing lost");
  assert.equal(r.words[0].start, 0);
  assert.ok(Math.abs(r.words[1].end - 1) < 0.03, `first sentence ends where its sound ends: ${r.words[1].end}`);
  assert.ok(Math.abs(r.words[2].start - 1.4) < 0.03, `second starts after the pause: ${r.words[2].start}`);
  assert.ok(Math.abs(r.words[3].end - 2.6) < 0.03);
});

test("gemini: the blocks of a script come back one by one from one request", async () => {
  const audio = toneWav([[1, true], [0.5, false], [1, true], [0.5, false], [1, true]]).toString("base64");
  let n = 0;
  let sent = "";
  const fetchImpl = async (url, init) => {
    n++;
    sent = JSON.parse(init.body).input[0].content[0].text;
    return { ok: true, status: 200, json: async () => ({ steps: [{ type: "model_output", content: [{ type: "audio", data: audio }] }] }) };
  };
  const out = await geminiMany({ apiKey: KEY, fetchImpl, texts: ["One here. Two here.", "Three here."] });
  assert.equal(n, 1);
  assert.equal(sent, "One here. Two here.\n\nThree here.", "a new block is a new paragraph");
  assert.equal(out.length, 2);
  const a = parseWav(out[0].audio);
  const b = parseWav(out[1].audio);
  assert.ok(Math.abs(a.pcm.length / 48000 - 2.75) < 0.03, "block one: two sentences up to the middle of the second pause");
  assert.ok(Math.abs(b.pcm.length / 48000 - 1.25) < 0.03);
  assert.ok(Math.abs(out[1].words[0].start - 0.25) < 0.03, "block two's words start after its own pause");
});

test("gemini: with no pause found, the letters place the cut, as before", () => {
  const cuts = sentenceCuts(["aaaa.", "bbbbbbbbbbbbbb."], 4, []);
  assert.equal(cuts.length, 1);
  assert.ok(Math.abs(cuts[0].at - 1) < 0.01);
  assert.deepEqual(pausesOf(parseWav(toneWav([[1, true]]))), []);
});

test("gemini: a long script is read in a few requests, never one per sentence", async () => {
  const audio = toneWav([[0.5, true]]).toString("base64");
  let n = 0;
  const fetchImpl = async () => (n++, { ok: true, status: 200, json: async () => ({ steps: [{ type: "model_output", content: [{ type: "audio", data: audio }] }] }) });
  const sentence = "This is one plain sentence of a long script, said at an even pace. ";
  await geminiMany({ apiKey: KEY, fetchImpl, texts: [sentence.repeat(60), sentence.repeat(60)] });
  const least = Math.ceil((sentence.length * 120) / CHUNK_CHARS);
  assert.ok(n >= least && n <= least + 1, `${n} requests for 120 sentences`);
});

test("the voice step reads every block in one go when the voice can (DECISIONS 198)", { skip: !haveFf && "bundled ffmpeg not fetched" }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "itv-voice-many-"));
  fs.writeFileSync(path.join(dir, "script.md"), ["# T", "", "## OPEN", "", "First part.", "", "## 1. Two", "", "Second part.", "", "## 2. Three", "", "Third part.", ""].join("\n"));
  const seen = [];
  VOICE_PROVIDERS.many = {
    speak: async () => assert.fail("speak is not used when speakMany exists"),
    speakMany: async ({ texts }) => (seen.push(texts), texts.map((t) => ({ audio: toneWav([[0.5, true]]), words: [{ text: t, start: 0, end: 0.5, type: "word" }], ext: "wav" }))),
  };
  try {
    const info = await makeVoice({ projectDir: dir, narrator: { provider: "many", voice: "v" }, apiKey: KEY, env });
    assert.deepEqual(seen, [["First part.", "Second part.", "Third part."]], "one call with all three blocks");
    assert.equal(info.reused, 0);
    const words = JSON.parse(fs.readFileSync(path.join(dir, "audio", "stt.json"), "utf8")).words;
    assert.deepEqual(words.map((w) => w.text), ["First part.", "Second part.", "Third part."]);
    assert.ok(words[1].start >= 0.5 && words[2].start >= 1, "each block in its place");
  } finally {
    delete VOICE_PROVIDERS.many;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// 2026-10-06: one busy answer used to fail the whole narration.
test("a busy voice service is waited out, and a failed run keeps the parts already read", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "itv-voice-retry-"));
  fs.writeFileSync(path.join(dir, "script.md"), ["# T", "", "## OPEN", "", "First part.", "", "## 1. Two", "", "Second part.", ""].join("\n"));
  const said = [];
  let calls = 0;
  let failSecond = true;
  const provider = {
    speak: async ({ text, onRetry }) => {
      calls++;
      if (text.startsWith("Second") && failSecond) {
        onRetry?.({ attempt: 1, of: 7, waitSeconds: 3, status: 503, message: "busy" });
        throw new Error("down for good");
      }
      return { audio: Buffer.from(`audio of ${text}`), words: [{ text, start: 0, end: 1, type: "word" }], ext: "mp3" };
    },
  };
  VOICE_PROVIDERS.fake = provider;
  try {
    await assert.rejects(makeVoice({ projectDir: dir, narrator: { provider: "fake", voice: "v" }, apiKey: KEY, onProgress: (p) => said.push(p.step) }), /down for good/);
    assert.ok(said.includes("retry"));
    assert.equal(calls, 2);
    // the second run reads only the part that failed
    failSecond = false;
    calls = 0;
    await makeVoice({ projectDir: dir, narrator: { provider: "fake", voice: "v" }, apiKey: KEY }).catch(() => {});
    assert.equal(calls, 1, "the first part came from the kept blocks");
  } finally {
    delete VOICE_PROVIDERS.fake;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("gemini: quota and key errors are plain and never show the key", async () => {
  const mk = (status) => async () => ({ ok: false, status, text: async () => JSON.stringify({ error: { message: `bad ${KEY}` } }) });
  const waited = [];
  await assert.rejects(geminiSpeak({ apiKey: KEY, fetchImpl: mk(429), text: "x.", sleep: async (ms) => waited.push(ms) }), (e) => /free quota/.test(e.message) && !e.message.includes(KEY));
  assert.equal(waited.length, WAITS.length, "a rate limit is waited out first");
  waited.length = 0;
  await assert.rejects(geminiSpeak({ apiKey: KEY, fetchImpl: mk(403), text: "x.", sleep: async (ms) => waited.push(ms) }), /rejected the API key/);
  assert.equal(waited.length, 0, "a refused key is not tried again");
  await assert.rejects(geminiSpeak({ apiKey: "", text: "x." }), /No API key set for Gemini/);
  assert.equal((await geminiVoices()).length, 30);
  // the day's free readings used up: said at once, no three minutes of waiting (DECISIONS 198)
  const daily = async () => ({ ok: false, status: 429, text: async () => JSON.stringify({ error: { message: "Rate limit exceeded for model gemini-3.8-flash-tts (limit: 10 requests per day on Free Tier). Please retry in 50m52s." } }) });
  waited.length = 0;
  await assert.rejects(geminiSpeak({ apiKey: KEY, fetchImpl: daily, text: "x.", sleep: async (ms) => waited.push(ms) }), /used its readings for today.*50m52s/);
  assert.equal(waited.length, 0, "a used-up day is not waited out");
});
