// kokoro.mjs: the free Narrator Voice (docs/BUILD_PLAN.md, DECISIONS 133).
// Kokoro 82M (Apache 2.0) on this computer, no key, no cost, no network after
// the model's first download. The model is the timestamped export: it returns
// how long it held every phoneme, so the word timings come from the speech
// model itself and every scene change lands on the right word.
//
// Same shape as the other voices: speak() returns { audio: WAV bytes (24 kHz
// mono 16-bit), words, ext: "wav" }.

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { dataDir } from "../../tools.mjs";
import { stallGuard } from "../../net.mjs";
import { ensureRoom } from "../../disk.mjs";
import { phonemize } from "./g2p.mjs";
import { splitSentences, writeWav, GAP_SECONDS } from "./gemini.mjs";

const REPO = "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX-timestamped/resolve/dd4401a9add81ac692d20e240d22ec9dda82cc29";
export const MODEL_BYTES = 86072942;
export const MODEL_FILES = {
  "model_q8f16.onnx": { url: `${REPO}/onnx/model_q8f16.onnx`, sha256: "db06e3f12daac36b13638ff6f6c4541241705405dac6d23126a7827dadf4c677" },
  "tokenizer.json": { url: `${REPO}/tokenizer.json`, sha256: "77a02c8e164413299b4b4c403b14f8e0e1c1b727db4d46a09d6327b861060a34" },
};
// American voices only: the phonemes (g2p.mjs) are American English.
export const VOICES = {
  af_heart: { name: "Heart", gender: "female", sha256: "d583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b" },
  am_michael: { name: "Michael", gender: "male", sha256: "1d1f21dd8da39c30705cd4c75d039d265e9bc4a2a93ed09bc9e1b1225eb95ba1" },
  af_bella: { name: "Bella", gender: "female", sha256: "f69d836209b78eb8c66e75e3cda491e26ea838a3674257e9d4e5703cbaf55c8b" },
  am_fenrir: { name: "Fenrir", gender: "male", sha256: "c27989f741f7ee34d273a39d8a595cc0837d35f5ced9a29b7cc162614616df43" },
  af_nicole: { name: "Nicole", gender: "female", sha256: "cd2191ab31b914ed7b318416b0e4440fdf392ddad9106a060819aa600a64f59a" },
  am_puck: { name: "Puck", gender: "male", sha256: "fcf73c989033e9233e0b98713eca600c8c74dcc1614b37009d5450ff4a2274a0" },
  af_sarah: { name: "Sarah", gender: "female", sha256: "4409fbc125afabacc615d94db5398d847006a737b0247d6892b7a9a0007a2f0a" },
  am_adam: { name: "Adam", gender: "male", sha256: "162b035ed91cfc48b6046982184c645f72edcdd1b82843347f605d7bf7b15716" },
};
export const DEFAULT_VOICE = "am_michael";
export const SAMPLE_RATE = 24000;
// the model's own unit: every duration counts blocks of this many samples
const SAMPLES_PER_UNIT = 600;
// the longest input the model takes, in phonemes; a longer sentence is cut at a pause
const MAX_PHONEMES = 480;
// what stays of the model's silence around a sentence
const KEEP_SILENCE = 0.06;
// below this a sample is silence (the signal runs from -1 to 1)
const QUIET = 0.002;
const STYLE = 256;

export const modelDir = (env = process.env) => path.join(dataDir(env), "models", "kokoro-82m-v1");

const sha256 = (file) => new Promise((resolve, reject) => {
  const h = createHash("sha256");
  fs.createReadStream(file).on("data", (d) => h.update(d)).on("end", () => resolve(h.digest("hex"))).on("error", reject);
});

// One file into the model folder, checked against its pinned hash. A partial
// or wrong download is removed, never used.
export async function fetchFile({ url, sha, out, fetchImpl, label, onProgress, what = "the free voice" }) {
  if (fs.existsSync(out)) {
    if ((await sha256(out)) === sha) return;
    fs.rmSync(out, { force: true });
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const tmp = `${out}.part`;
  const say = (why) => `Could not download ${what} (${label}): ${why}. Check the internet connection and press the button again.`;
  for (let attempt = 1; ; attempt++) {
    // a slow line may take its time; a line where nothing arrives for a minute does not
    const stall = stallGuard();
    let failed = null;
    let writeError = null;
    try {
      const res = await fetchImpl(url, { signal: stall.signal });
      if (!res.ok) {
        // a missing file or a refusal does not get better by asking again
        if (res.status !== 429 && res.status < 500) throw Object.assign(new Error(`Could not download ${what} (${label}): HTTP ${res.status}. Try again later.`), { final: true });
        throw new Error(`HTTP ${res.status}`);
      }
      const total = Number(res.headers?.get?.("content-length")) || 0;
      if (total) ensureRoom(path.dirname(out), total * 1.1, what);
      const w = fs.createWriteStream(tmp);
      w.on("error", (e) => (writeError = e));
      let got = 0;
      let shown = -1;
      try {
        for await (const chunk of res.body) {
          stall.touch();
          if (writeError) throw writeError;
          got += chunk.length;
          if (!w.write(chunk)) await new Promise((r) => w.once("drain", r));
          const pct = total ? Math.floor((got / total) * 100) : 0;
          if (pct !== shown) {
            shown = pct;
            onProgress({ step: "model-download", file: label, percent: pct });
          }
        }
      } finally {
        await new Promise((r) => w.end(r));
      }
      if (writeError) throw writeError;
    } catch (e) {
      failed = e;
    } finally {
      stall.done();
    }
    if (!failed) break;
    fs.rmSync(tmp, { force: true });
    if (failed.final || failed.code === "ENOSPC" || /disk space/.test(failed.message)) throw failed;
    if (attempt >= 3) throw new Error(say(failed.name === "TimeoutError" ? "nothing arrived for a minute" : failed.message));
    onProgress({ step: "model-download", file: label, percent: 0 });
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
  if ((await sha256(tmp)) !== sha) {
    fs.rmSync(tmp, { force: true });
    throw new Error(`The download of ${what} (${label}) did not match its checksum, so it was not used. Press the button again.`);
  }
  fs.renameSync(tmp, out);
}

/** Model, tokenizer and one voice on this computer (downloaded once). */
export async function ensureModel({ voice = DEFAULT_VOICE, env = process.env, fetchImpl = fetch, onProgress = () => {} } = {}) {
  if (!VOICES[voice]) throw new Error(`The free voice has no voice called ${voice}.`);
  const dir = modelDir(env);
  for (const [name, f] of Object.entries(MODEL_FILES)) await fetchFile({ url: f.url, sha: f.sha256, out: path.join(dir, name), fetchImpl, label: name === "tokenizer.json" ? "tokenizer" : "voice model", onProgress });
  await fetchFile({ url: `${REPO}/voices/${voice}.bin`, sha: VOICES[voice].sha256, out: path.join(dir, "voices", `${voice}.bin`), fetchImpl, label: VOICES[voice].name, onProgress });
  return dir;
}

export async function listVoices() {
  return Object.entries(VOICES).map(([id, v]) => ({ id, name: v.name, category: "free", gender: v.gender, accent: "american", description: "Free, runs on this computer.", previewUrl: null, languages: ["en"] }));
}

// ---- the model -------------------------------------------------------------------

let session = null;
let vocabulary = null;
async function loadModel(dir) {
  if (!session) {
    const ort = await import("onnxruntime-node");
    session = { ort, run: await ort.InferenceSession.create(path.join(dir, "model_q8f16.onnx"), { executionProviders: ["cpu"] }) };
    vocabulary = JSON.parse(fs.readFileSync(path.join(dir, "tokenizer.json"), "utf8")).model.vocab;
  }
  return session;
}

/**
 * Pieces the model can read in one go: a sentence, or a long sentence cut at
 * its commas, then between words. Pure, the tests call it.
 */
export function pieces(tokens, max = MAX_PHONEMES) {
  const out = [];
  let cur = [];
  let size = 0;
  const flush = () => {
    if (cur.length) out.push(cur);
    cur = [];
    size = 0;
  };
  for (const t of tokens) {
    if (size + t.phonemes.length + 1 > max) flush();
    cur.push(t);
    size += t.phonemes.length + 1;
    if (size > max * 0.7 && /[,;:]$/.test(t.phonemes)) flush();
  }
  flush();
  return out;
}

/**
 * The time of each text token from the model's durations. `ids` are the
 * phoneme characters in order, `owner[i]` the token of character i (-1 for a
 * space or a mark between words); durations has one entry per character plus
 * the two pad tokens at the ends. Pure, the tests call it.
 */
export function tokenTimes(durations, owner, count, secondsPerUnit = SAMPLES_PER_UNIT / SAMPLE_RATE) {
  const times = Array.from({ length: count }, () => null);
  // The model rounds each duration before it makes the sound, at least 1. The
  // raw values drift against the audio (0.2 s late after a long sentence,
  // measured 2026-11-02); the rounded ones add up to its exact length.
  const units = (v) => Math.max(1, Math.round(v ?? 0));
  let t = units(durations[0]) * secondsPerUnit;
  for (let i = 0; i < owner.length; i++) {
    const d = units(durations[i + 1]) * secondsPerUnit;
    const o = owner[i];
    if (o >= 0) {
      if (!times[o]) times[o] = { start: t, end: t + d };
      times[o].end = t + d;
    }
    t += d;
  }
  return { times, total: t + units(durations[owner.length + 1]) * secondsPerUnit };
}

const r3 = (x) => Math.round(x * 1000) / 1000;

// One piece through the model: its samples without the model's long silence at
// the ends, and its tokens' times inside those samples.
async function readPiece({ tokens, styleTable, ort, run, speed }) {
  const chars = [];
  const owner = [];
  tokens.forEach((t, n) => {
    if (n > 0) {
      chars.push(" ");
      owner.push(-1);
    }
    for (const c of t.phonemes) {
      chars.push(c);
      owner.push(/[.,!?;:…]/.test(c) ? -1 : n);
    }
  });
  const known = chars.map((c) => vocabulary[c]);
  const kept = known.map((id, i) => [id, owner[i]]).filter(([id]) => id !== undefined);
  const ids = [0, ...kept.map(([id]) => id), 0];
  const at = Math.min(kept.length, styleTable.length / STYLE - 1);
  const style = styleTable.slice(at * STYLE, (at + 1) * STYLE);
  const r = await run.run({
    input_ids: new ort.Tensor("int64", BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
    style: new ort.Tensor("float32", style, [1, STYLE]),
    speed: new ort.Tensor("float32", new Float32Array([speed]), [1]),
  });
  const { times } = tokenTimes(Array.from(r.durations.data), kept.map(([, o]) => o), tokens.length);
  const wave = r.waveform.data;
  const said = times.filter(Boolean);
  const from = Math.max(0, (said[0]?.start ?? 0) - KEEP_SILENCE);
  // the model holds a sentence's last sound long past its end: the sound ends
  // where the signal does, not where the duration says
  let lastLoud = wave.length - 1;
  while (lastLoud > 0 && Math.abs(wave[lastLoud]) < QUIET) lastLoud--;
  const to = Math.min(wave.length / SAMPLE_RATE, lastLoud / SAMPLE_RATE + KEEP_SILENCE);
  const samples = wave.subarray(Math.floor(from * SAMPLE_RATE), Math.ceil(to * SAMPLE_RATE));
  const seconds = samples.length / SAMPLE_RATE;
  // a token whose every phoneme was unknown takes the time of its neighbour
  let last = 0;
  const words = tokens.map((tk, n) => {
    const x = times[n] ?? { start: last + from, end: last + from };
    last = x.end - from;
    return { text: tk.text, start: Math.min(seconds, x.start - from), end: Math.min(seconds, x.end - from) };
  });
  return { samples, seconds, words };
}

function toPcm16(chunks) {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const pcm = Buffer.alloc(total * 2);
  let at = 0;
  for (const c of chunks) {
    for (let i = 0; i < c.length; i++) {
      pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(c[i] * 32767))), at);
      at += 2;
    }
  }
  return pcm;
}

export async function speak({ voiceId, text, speed = 1, env = process.env, fetchImpl = fetch, onSentence = () => {}, onRetry = () => {} }) {
  const voice = VOICES[voiceId] ? voiceId : DEFAULT_VOICE;
  const dir = await ensureModel({ voice, env, fetchImpl, onProgress: onRetry });
  const { ort, run } = await loadModel(dir);
  const raw = fs.readFileSync(path.join(dir, "voices", `${voice}.bin`));
  const styleTable = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length));

  const sentences = splitSentences(text);
  const gap = new Float32Array(Math.round(GAP_SECONDS * SAMPLE_RATE));
  const chunks = [];
  const words = [];
  let t = 0;
  for (let i = 0; i < sentences.length; i++) {
    onSentence(i + 1, sentences.length);
    for (const tokens of pieces(await phonemize(sentences[i]))) {
      const p = await readPiece({ tokens, styleTable, ort, run, speed });
      if (chunks.length) {
        chunks.push(gap);
        t += GAP_SECONDS;
      }
      for (const w of p.words) words.push({ text: w.text, start: r3(t + w.start), end: r3(t + w.end), type: "word" });
      chunks.push(p.samples);
      t += p.seconds;
    }
  }
  if (!chunks.length) throw new Error("The script has no text the free voice can read.");
  return { audio: writeWav({ channels: 1, rate: SAMPLE_RATE, bits: 16, pcm: toPcm16(chunks) }), words, ext: "wav" };
}
