// recorded/whisper.mjs: speech to words on this computer (docs/BUILD_PLAN.md
// phase 2). Whisper Base (MIT) in its ONNX export, on the ONNX runtime the free
// voice already uses, so no program and no package comes with it. The model is
// downloaded once and checked against pinned hashes.
//
// Word times come from the model's own attention: for every token it looks at
// some part of the sound, and a dynamic time warp walks through that matrix
// (the method of Whisper's own word timestamps). transcribe.mjs snaps them to
// the sound afterwards.

import fs from "node:fs";
import path from "node:path";
import { dataDir } from "../tools.mjs";
import { fetchFile } from "../providers/tts/kokoro.mjs";

const REPO = "https://huggingface.co/onnx-community/whisper-base_timestamped/resolve/608c49e61301901684bc36cac8f74b95ff6b5a8e";
export const WHISPER_FILES = {
  "encoder_model_q4.onnx": { path: "onnx/encoder_model_q4.onnx", sha256: "0df94e35822653ba16e23c3f19f05b9b7fe7aae97884d1b277e02044f33c4880", bytes: 18771046 },
  "decoder_model_merged_int8.onnx": { path: "onnx/decoder_model_merged_int8.onnx", sha256: "cf9a8d5bcddc0917a0078135b484cedcaf44f28909cd91910abd29dced9171db", bytes: 53712708 },
  "vocab.json": { path: "vocab.json", sha256: "50d6a919f0a0601d56a04eb583c780d18553aa388254ba3158eb6a00f13e2c1a", bytes: 1036584 },
  "merges.txt": { path: "merges.txt", sha256: "2df2990a395e35e8dfbc7511e08c12d56018d8d04691e0133e5d63b21e154dc6", bytes: 493869 },
  "added_tokens.json": { path: "added_tokens.json", sha256: "9715fd2243b6f06a5858b5e32950d2853f73dd5bc201aafcf76f5082a2d8acd1", bytes: 34604 },
  "generation_config.json": { path: "generation_config.json", sha256: "61070cf8de25b1e9256e8e102ded49d8d24a8369ed36ef84fdf21549e68125a0", bytes: 3832 },
};
export const WHISPER_BYTES = Object.values(WHISPER_FILES).reduce((n, f) => n + f.bytes, 0);

export const SAMPLE_RATE = 16000;
export const CHUNK_SECONDS = 30;
const N_FFT = 400;
const HOP = 160;
const N_MELS = 80;
const FRAMES = 3000;
const PER_SECOND = 50; // the encoder halves the 100 frames a second
const MAX_TOKENS = 220;

export const whisperDir = (env = process.env) => path.join(dataDir(env), "models", "whisper-base");

/** The model on this computer (downloaded once, about 79 MB). */
export async function ensureWhisper({ env = process.env, fetchImpl = fetch, onProgress = () => {} } = {}) {
  for (const [name, f] of Object.entries(WHISPER_FILES)) {
    await fetchFile({ url: `${REPO}/${f.path}`, sha: f.sha256, out: path.join(whisperDir(env), name), fetchImpl, label: name, what: "the speech model", onProgress });
  }
  return whisperDir(env);
}

// ---- the sound as the model wants it -----------------------------------------------

const hzToMel = (f) => (f < 1000 ? (3 * f) / 200 : 15 + (27 * Math.log(f / 1000)) / Math.log(6.4));
const melToHz = (m) => (m < 15 ? (200 * m) / 3 : 1000 * Math.pow(6.4, (m - 15) / 27));

/** The triangular filters Whisper was trained with (slaney scale and area). */
export function melFilters(mels = N_MELS, nFft = N_FFT, rate = SAMPLE_RATE) {
  const bins = nFft / 2 + 1;
  const top = hzToMel(rate / 2);
  const hz = Array.from({ length: mels + 2 }, (_, i) => melToHz((top * i) / (mels + 1)));
  const out = [];
  for (let m = 0; m < mels; m++) {
    const row = new Float64Array(bins);
    const norm = 2 / (hz[m + 2] - hz[m]);
    for (let b = 0; b < bins; b++) {
      const f = (b * rate) / nFft;
      const up = (f - hz[m]) / (hz[m + 1] - hz[m]);
      const down = (hz[m + 2] - f) / (hz[m + 2] - hz[m + 1]);
      row[b] = Math.max(0, Math.min(up, down)) * norm;
    }
    out.push(row);
  }
  return out;
}

let tables = null;
function dftTables() {
  if (tables) return tables;
  const bins = N_FFT / 2 + 1;
  const cos = new Float64Array(bins * N_FFT);
  const sin = new Float64Array(bins * N_FFT);
  for (let k = 0; k < bins; k++) {
    for (let n = 0; n < N_FFT; n++) {
      cos[k * N_FFT + n] = Math.cos((2 * Math.PI * k * n) / N_FFT);
      sin[k * N_FFT + n] = Math.sin((2 * Math.PI * k * n) / N_FFT);
    }
  }
  const hann = Float64Array.from({ length: N_FFT }, (_, n) => 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / N_FFT));
  const mel = melFilters().map((row) => {
    let first = 0;
    let last = row.length - 1;
    while (first < row.length && row[first] === 0) first++;
    while (last > first && row[last] === 0) last--;
    return { first, last, row };
  });
  tables = { bins, cos, sin, hann, mel };
  return tables;
}

/** 30 seconds of 16 kHz sound as the 80 x 3000 log mel the encoder takes. */
export function logMel(samples) {
  const { bins, cos, sin, hann, mel } = dftTables();
  const need = CHUNK_SECONDS * SAMPLE_RATE;
  const padded = new Float32Array(need + N_FFT);
  const half = N_FFT / 2;
  padded.set(samples.subarray(0, need), half);
  for (let i = 0; i < half; i++) padded[half - 1 - i] = padded[half + 1 + i];
  const out = new Float32Array(N_MELS * FRAMES);
  const used = Math.min(FRAMES, Math.ceil(samples.length / HOP) + 2);
  const power = new Float64Array(bins);
  const frame = new Float64Array(N_FFT);
  let top = -Infinity;
  for (let t = 0; t < FRAMES; t++) {
    if (t < used) {
      const at = t * HOP;
      for (let n = 0; n < N_FFT; n++) frame[n] = padded[at + n] * hann[n];
      for (let k = 0; k < bins; k++) {
        let re = 0;
        let im = 0;
        const base = k * N_FFT;
        for (let n = 0; n < N_FFT; n++) {
          re += frame[n] * cos[base + n];
          im -= frame[n] * sin[base + n];
        }
        power[k] = re * re + im * im;
      }
    } else {
      power.fill(0);
    }
    for (let m = 0; m < N_MELS; m++) {
      const f = mel[m];
      let sum = 0;
      for (let k = f.first; k <= f.last; k++) sum += f.row[k] * power[k];
      const v = Math.log10(Math.max(sum, 1e-10));
      out[m * FRAMES + t] = v;
      if (v > top) top = v;
    }
  }
  for (let i = 0; i < out.length; i++) out[i] = (Math.max(out[i], top - 8) + 4) / 4;
  return out;
}

// ---- the tokenizer --------------------------------------------------------------------

function byteTable() {
  const keep = [];
  for (let b = 33; b <= 126; b++) keep.push(b);
  for (let b = 161; b <= 172; b++) keep.push(b);
  for (let b = 174; b <= 255; b++) keep.push(b);
  const toChar = new Map();
  let extra = 0;
  for (let b = 0; b < 256; b++) toChar.set(b, keep.includes(b) ? String.fromCharCode(b) : String.fromCharCode(256 + extra++));
  return { toChar, toByte: new Map([...toChar].map(([b, c]) => [c, b])) };
}

/** Text to token ids and back, from the model's own vocabulary. */
export function makeTokenizer({ vocab, merges, added = {} }) {
  const { toChar, toByte } = byteTable();
  const idOf = { ...vocab, ...added };
  const textOf = new Map(Object.entries(idOf).map(([t, i]) => [i, t]));
  const rank = new Map(merges.map((m, i) => [m, i]));
  const bpe = (word) => {
    let parts = [...word];
    for (;;) {
      let best = null;
      let bestRank = Infinity;
      for (let i = 0; i < parts.length - 1; i++) {
        const r = rank.get(`${parts[i]} ${parts[i + 1]}`);
        if (r !== undefined && r < bestRank) {
          bestRank = r;
          best = i;
        }
      }
      if (best === null) return parts;
      parts = [...parts.slice(0, best), parts[best] + parts[best + 1], ...parts.slice(best + 2)];
    }
  };
  const encode = (text) => {
    const ids = [];
    for (const m of text.matchAll(/'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu)) {
      const word = [...Buffer.from(m[0], "utf8")].map((b) => toChar.get(b)).join("");
      for (const p of bpe(word)) if (idOf[p] !== undefined) ids.push(idOf[p]);
    }
    return ids;
  };
  // The bytes of one token: a letter can sit across two tokens.
  const bytes = (id) => [...(textOf.get(id) ?? "")].map((c) => toByte.get(c)).filter((b) => b !== undefined);
  return { encode, bytes, id: (t) => idOf[t], text: (id) => textOf.get(id) };
}

let tokenizerCache = null;
export function loadTokenizer(env = process.env) {
  if (tokenizerCache) return tokenizerCache;
  const dir = whisperDir(env);
  const vocab = JSON.parse(fs.readFileSync(path.join(dir, "vocab.json"), "utf8"));
  const added = JSON.parse(fs.readFileSync(path.join(dir, "added_tokens.json"), "utf8"));
  const merges = fs.readFileSync(path.join(dir, "merges.txt"), "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("#version"));
  const config = JSON.parse(fs.readFileSync(path.join(dir, "generation_config.json"), "utf8"));
  tokenizerCache = { tokens: makeTokenizer({ vocab, merges, added }), config };
  return tokenizerCache;
}

// ---- word times from the attention ----------------------------------------------------

/** Running median over time, per row: one strong frame does not pull a word. */
export function medianFilter(row, width = 7) {
  const half = width >> 1;
  const out = new Float32Array(row.length);
  const win = new Float32Array(width);
  for (let i = 0; i < row.length; i++) {
    for (let k = -half; k <= half; k++) win[k + half] = row[Math.max(0, Math.min(row.length - 1, i + k))];
    out[i] = win.slice().sort()[half];
  }
  return out;
}

/**
 * The cheapest monotone path through rows x frames (rows and frames both only go
 * forward). Returns, for every row, the frame where the path first enters it.
 */
export function warp(rows, frames) {
  const n = rows.length;
  const w = frames;
  const cost = new Float64Array((n + 1) * (w + 1)).fill(Infinity);
  const from = new Uint8Array((n + 1) * (w + 1));
  const at = (i, j) => i * (w + 1) + j;
  cost[at(0, 0)] = 0;
  for (let j = 1; j <= w; j++) cost[at(0, j)] = 0;
  for (let i = 1; i <= n; i++) {
    const row = rows[i - 1];
    for (let j = 1; j <= w; j++) {
      const a = cost[at(i - 1, j - 1)];
      const b = cost[at(i - 1, j)];
      const c = cost[at(i, j - 1)];
      const best = Math.min(a, b, c);
      cost[at(i, j)] = best - row[j - 1];
      from[at(i, j)] = best === a ? 0 : best === b ? 1 : 2;
    }
  }
  const first = new Array(n).fill(0);
  let i = n;
  let j = w;
  while (i > 0 && j > 0) {
    first[i - 1] = j - 1;
    const f = from[at(i, j)];
    if (f === 0) {
      i--;
      j--;
    } else if (f === 1) {
      i--;
    } else {
      j--;
    }
  }
  return first;
}

/**
 * Tokens into words: a word starts at the token that begins with a space. Its
 * time runs to where the next word starts; transcribe.mjs snaps both ends to the
 * sound. `starts` has one more entry than `ids` (the end of the text).
 */
export function wordsFromTokens(ids, starts, bytesOf) {
  const words = [];
  let cur = null;
  ids.forEach((id, i) => {
    const b = bytesOf(id);
    if (!cur || b[0] === 0x20) {
      if (cur) words.push(cur);
      cur = { bytes: [...b], start: starts[i], end: starts[i + 1] };
    } else {
      cur.bytes.push(...b);
      cur.end = starts[i + 1];
    }
  });
  if (cur) words.push(cur);
  return words.map((w) => ({ text: Buffer.from(w.bytes).toString("utf8").trim(), start: w.start, end: w.end })).filter((w) => w.text);
}

// ---- the model ----------------------------------------------------------------------------

let sessions = null;
async function loadSessions(env) {
  if (sessions) return sessions;
  const ort = await import("onnxruntime-node");
  const dir = whisperDir(env);
  const options = { executionProviders: ["cpu"] };
  const encoder = await ort.InferenceSession.create(path.join(dir, "encoder_model_q4.onnx"), options);
  const decoder = await ort.InferenceSession.create(path.join(dir, "decoder_model_merged_int8.onnx"), options);
  sessions = { ort, encoder, decoder };
  return sessions;
}

/** The model out of memory. A process that ends with it loaded can die on the way out. */
export async function releaseWhisper() {
  const s = sessions;
  sessions = null;
  if (s) await Promise.all([s.encoder.release(), s.decoder.release()]);
}

const stuck = (ids) => {
  // a model that repeats itself has lost the sound
  const n = ids.length;
  for (const size of [1, 2, 3, 4, 5, 6]) {
    if (n < size * 5) continue;
    const tail = ids.slice(n - size).join();
    let same = true;
    for (let k = 1; k < 5 && same; k++) same = ids.slice(n - size * (k + 1), n - size * k).join() === tail;
    if (same) return true;
  }
  return false;
};

/**
 * The words of one piece of sound, at most 30 s, times from its own start.
 * `prompt`: words that set the style, here to keep the "um"s Whisper tends to hide.
 */
export async function decodeChunk(samples, { language = "en", prompt = "", env = process.env, signal } = {}) {
  const { ort, encoder, decoder } = await loadSessions(env);
  const { tokens, config } = loadTokenizer(env);
  const mel = logMel(samples);
  const enc = await encoder.run({ [encoder.inputNames[0]]: new ort.Tensor("float32", mel, [1, N_MELS, FRAMES]) });
  const hidden = enc[encoder.outputNames[0]];
  const heads = config.alignment_heads;
  const eot = config.eos_token_id;
  const lang = config.lang_to_id[`<|${String(language).toLowerCase().slice(0, 2)}|>`] ?? config.lang_to_id["<|en|>"];
  const start = [...(prompt ? [tokens.id("<|startofprev|>"), ...tokens.encode(` ${prompt.trim()}`)] : []), config.decoder_start_token_id, lang, tokens.id("<|transcribe|>"), config.no_timestamps_token_id];
  const suppress = new Set(config.suppress_tokens ?? []);
  const beginSuppress = new Set(config.begin_suppress_tokens ?? []);
  const firstTimestamp = config.no_timestamps_token_id + 1;
  const pastNames = decoder.inputNames.filter((n) => n.startsWith("past_key_values"));
  let past = Object.fromEntries(pastNames.map((n) => [n, new ort.Tensor("float32", new Float32Array(0), [1, 8, 0, 64])]));
  const ids = [];
  const rows = [];
  const frames = Math.min(1500, Math.ceil((samples.length / SAMPLE_RATE) * PER_SECOND));
  let input = start;
  for (let step = 0; step < MAX_TOKENS; step++) {
    if (signal?.aborted) throw new Error("Stopped.");
    const feeds = {
      input_ids: new ort.Tensor("int64", BigInt64Array.from(input.map(BigInt)), [1, input.length]),
      encoder_hidden_states: hidden,
      use_cache_branch: new ort.Tensor("bool", [step > 0], [1]),
      ...past,
    };
    const out = await decoder.run(feeds);
    // the attention of the last token in: what the model looks at for the next one
    const row = new Float32Array(frames);
    for (const [layer, head] of heads) {
      const a = out[`cross_attentions.${layer}`];
      const [, h, t, f] = a.dims;
      const offset = (head % h) * t * f + (t - 1) * f;
      for (let j = 0; j < frames; j++) row[j] += a.data[offset + j];
    }
    rows.push(medianFilter(row));
    const logits = out.logits;
    const vocabSize = logits.dims[2];
    const base = (logits.dims[1] - 1) * vocabSize;
    let best = eot;
    let bestScore = -Infinity;
    for (let k = 0; k < vocabSize; k++) {
      if (k >= firstTimestamp || suppress.has(k) || (step === 0 && beginSuppress.has(k))) continue;
      if (logits.data[base + k] > bestScore) {
        bestScore = logits.data[base + k];
        best = k;
      }
    }
    if (best === eot || stuck([...ids, best])) break;
    ids.push(best);
    // the encoder's part of the memory is made once, in the first step
    const next = {};
    for (const n of pastNames) {
      const o = n.replace("past_key_values", "present");
      next[n] = step === 0 || n.includes(".decoder.") ? out[o] : past[n];
    }
    past = next;
    input = [best];
  }
  if (!ids.length) return [];
  const first = warp(rows, frames).map((f) => f / PER_SECOND);
  return wordsFromTokens(ids, [...first.slice(0, ids.length), first[ids.length] ?? samples.length / SAMPLE_RATE], tokens.bytes);
}
