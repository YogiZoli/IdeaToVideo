// gemini.mjs: the free Narrator Voice, Gemini TTS with the user's own Gemini
// key (the one onboarding already asks for). Hungarian is supported.
//
// Gemini TTS returns audio but no word timings, and hyperframes' transcriber
// needs a whisper.cpp build the user's machine does not have. So timing comes
// from the text and the audio: many sentences in one TTS call (speakMany), the
// sentences found again by the pauses between them; words inside a sentence
// are placed by character position.
//
// Output of speak(): { audio: WAV bytes (24 kHz mono 16-bit), words }.

import { readJson } from "../../net.mjs";
import { redact } from "../llm.mjs";
import { closesSentence } from "../../timing/sentences.mjs";
import { BusyError, patiently, busyStatus } from "../retry.mjs";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
export const DEFAULT_MODEL = "gemini-3.8-flash-tts";
export const GAP_SECONDS = 0.25; // between sentences inside one block
// A calm teaching read: slightly slower than the default is easier to follow.
export const DEFAULT_STYLE = "calm, clear teaching voice, speaking a little slowly";

export const VOICES = ["Kore", "Charon", "Puck", "Zephyr", "Fenrir", "Leda", "Orus", "Aoede", "Callirrhoe", "Autonoe", "Enceladus", "Iapetus", "Umbriel", "Algieba", "Despina", "Erinome", "Algenib", "Rasalgethi", "Laomedeia", "Achernar", "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi", "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat"];

export async function listVoices() {
  return VOICES.map((v) => ({ id: v, name: v, category: "prebuilt", gender: null, accent: null, description: null, previewUrl: null, languages: [] }));
}

// Sentences: the same rule as timing/sentences.mjs, so the TTS pieces and the
// sentence table agree.
export function splitSentences(text) {
  const out = [];
  let cur = [];
  for (const tok of String(text).split(/\s+/).filter(Boolean)) {
    cur.push(tok);
    if (closesSentence(tok)) {
      out.push(cur.join(" "));
      cur = [];
    }
  }
  if (cur.length) out.push(cur.join(" "));
  return out;
}

// ---- WAV (RIFF, PCM 16-bit) -----------------------------------------------------

export function parseWav(buf) {
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") throw new Error("Gemini returned audio that is not WAV.");
  let pos = 12;
  let fmt = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString("ascii", pos, pos + 4);
    let size = buf.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === "fmt ") fmt = { channels: buf.readUInt16LE(body + 2), rate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) };
    if (id === "data") {
      if (!fmt) break;
      // streamed WAVs may carry a 0 or 0xFFFFFFFF size: take the rest
      if (size === 0 || size === 0xffffffff || body + size > buf.length) size = buf.length - body;
      return { ...fmt, pcm: buf.subarray(body, body + size) };
    }
    pos = body + size + (size % 2);
  }
  throw new Error("Gemini returned WAV audio without data.");
}

export function writeWav({ channels, rate, bits, pcm }) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0, "ascii");
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVEfmt ", 8, "ascii");
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE((rate * channels * bits) / 8, 28);
  h.writeUInt16LE((channels * bits) / 8, 32);
  h.writeUInt16LE(bits, 34);
  h.write("data", 36, "ascii");
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

const seconds = (w) => w.pcm.length / (w.rate * w.channels * (w.bits / 8));

// Words of one sentence, spread over [start, end] by character position.
export function wordsByCharacters(sentence, start, end) {
  const toks = sentence.split(/\s+/).filter(Boolean);
  const total = toks.reduce((n, t) => n + t.length, 0) || 1;
  const r3 = (x) => Math.round(x * 1000) / 1000;
  let acc = 0;
  return toks.map((t) => {
    const s = start + ((end - start) * acc) / total;
    acc += t.length;
    return { text: t, start: r3(s), end: r3(start + ((end - start) * acc) / total), type: "word" };
  });
}

async function ttsOnce({ apiKey, fetchImpl = fetch, model, voice, style, text }) {
  // a busy Gemini (5xx, 429) or a dropped connection: BusyError, tried again
  const content = { type: "text", text };
  if (style) content.annotations = [{ type: "speech_metadata", style }];
  const body = { model, input: [{ type: "user_input", content: [content] }], response_format: { type: "audio" }, generation_config: { speech_config: [{ voice }] } };
  let res;
  try {
    res = await fetchImpl(ENDPOINT, { method: "POST", headers: { "x-goog-api-key": apiKey, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
  } catch (e) {
    throw new BusyError(`Could not reach Gemini: ${redact(e.message, apiKey)}`);
  }
  if (!res.ok) {
    const t = redact(await res.text().catch(() => ""), apiKey);
    let msg = "";
    try {
      msg = String(JSON.parse(t).error?.message ?? "").slice(0, 200);
    } catch {
      msg = "";
    }
    const why = msg ? ` (${msg})` : "";
    if (res.status === 401 || res.status === 403) throw new Error(`Gemini rejected the API key${why}. Check the key in Settings.`);
    // the day's free requests are used up: waiting three minutes cannot help, so say it at once
    if (res.status === 429 && /per day|perday|daily/i.test(msg)) throw new Error(`Gemini's free voice has used its readings for today${why}. Try again then, or choose another voice for this video on the Voice tab. What was read is kept.`);
    if (res.status === 429) throw new BusyError(`Gemini free quota or rate limit reached${why}. The app waited about three minutes. Try again later, or use ElevenLabs.`, { status: 429 });
    if (res.status === 404) throw new Error(`Gemini does not know this voice model${why}.`);
    if (busyStatus(res.status)) throw new BusyError(`Gemini answered with HTTP ${res.status}${why}. The app kept trying for about three minutes. Try again later; the parts already read are kept.`, { status: res.status });
    throw new Error(`Gemini answered with HTTP ${res.status}${why}. Try again later.`);
  }
  const j = await readJson(res, "Gemini");
  const audio = (j.steps ?? []).filter((s) => s.type === "model_output").flatMap((s) => s.content ?? []).filter((c) => c.type === "audio" && c.data).pop();
  if (!audio) throw new Error("Gemini returned no audio.");
  return parseWav(Buffer.from(audio.data, "base64"));
}

// ---- one request for many sentences (DECISIONS 198) --------------------------------------
// The free tier allows 10 voice requests a day (Gemini's own answer, 2026-11-19), and one request
// per sentence used them up in the first Short. Now the sentences go together: up to CHUNK_CHARS
// in one request (a Short is one request, a long video a few), and the sentences are found again
// in the audio by its pauses. A pause is looked for near where the letters say the sentence ends;
// with no pause near it, the letters' place is used, as before.

export const CHUNK_CHARS = 2500;
const FRAME_SECONDS = 0.01;
const MIN_PAUSE_SECONDS = 0.15;

/** The quiet stretches of a WAV, in seconds: [{ start, end }], at least MIN_PAUSE_SECONDS long. */
export function pausesOf(w, { minSeconds = MIN_PAUSE_SECONDS } = {}) {
  const bytes = w.bits / 8;
  const step = w.channels * bytes;
  const per = Math.max(1, Math.round(FRAME_SECONDS * w.rate));
  const frames = Math.floor(w.pcm.length / step / per);
  const rms = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let i = 0; i < per; i++) {
      const at = (f * per + i) * step;
      const v = bytes === 2 ? w.pcm.readInt16LE(at) / 32768 : (w.pcm[at] - 128) / 128;
      sum += v * v;
    }
    rms[f] = Math.sqrt(sum / per);
  }
  const sorted = [...rms].sort((a, b) => a - b);
  const loud = sorted[Math.floor(sorted.length * 0.8)] ?? 0;
  const quiet = Math.max(0.003, loud * 0.08);
  const out = [];
  let from = -1;
  for (let f = 0; f <= frames; f++) {
    const still = f < frames && rms[f] < quiet;
    if (still && from < 0) from = f;
    if (!still && from >= 0) {
      if ((f - from) * FRAME_SECONDS >= minSeconds) out.push({ start: from * FRAME_SECONDS, end: f * FRAME_SECONDS });
      from = -1;
    }
  }
  return out;
}

/**
 * Where each sentence ends in one reading of them all: `sentences.length - 1` cuts, in order,
 * each { at, start, end } (the pause it falls in; start = end = at when no pause was near).
 */
export function sentenceCuts(sentences, total, pauses) {
  const chars = sentences.map((s) => s.length || 1);
  const all = chars.reduce((a, b) => a + b, 0);
  const near = Math.max(0.6, (total / sentences.length) * 0.45);
  const cuts = [];
  let acc = 0;
  let after = 0;
  let used = -1;
  for (let k = 0; k < sentences.length - 1; k++) {
    acc += chars[k];
    const want = (total * acc) / all;
    let best = -1;
    for (let p = used + 1; p < pauses.length; p++) {
      const mid = (pauses[p].start + pauses[p].end) / 2;
      if (mid <= after) continue;
      if (Math.abs(mid - want) > near) {
        if (mid > want) break;
        continue;
      }
      if (best < 0 || Math.abs(mid - want) < Math.abs((pauses[best].start + pauses[best].end) / 2 - want)) best = p;
    }
    if (best >= 0) {
      const p = pauses[best];
      cuts.push({ at: (p.start + p.end) / 2, start: p.start, end: p.end });
      used = best;
      after = (p.start + p.end) / 2;
    } else {
      const at = Math.max(want, after + 0.05);
      cuts.push({ at, start: at, end: at });
      after = at;
    }
  }
  return cuts;
}

/** Many texts (the script's blocks), read in as few requests as possible; one result per text. */
export async function speakMany({ apiKey, fetchImpl, voiceId, texts, model = DEFAULT_MODEL, style = DEFAULT_STYLE, onChunk = () => {}, onRetry, sleep }) {
  if (!apiKey) throw new Error("No API key set for Gemini. Add it in Settings.");
  const voice = voiceId || "Kore";
  const items = texts.flatMap((t, b) => splitSentences(t).map((s) => ({ b, s })));
  if (!items.length) throw new Error("The script has no text to read aloud.");
  const chunks = [];
  for (const it of items) {
    const last = chunks.at(-1);
    const size = last ? last.reduce((n, x) => n + x.s.length + 1, 0) : 0;
    if (last && size + it.s.length <= CHUNK_CHARS) last.push(it);
    else chunks.push([it]);
  }
  const per = texts.map(() => ({ pcm: [], words: [], t: 0 }));
  let fmt = null;
  for (let c = 0; c < chunks.length; c++) {
    onChunk(c + 1, chunks.length);
    const chunk = chunks[c];
    // a new block starts a new paragraph, so the reader pauses there too
    const text = chunk.map((x, i) => (i && x.b !== chunk[i - 1].b ? "\n\n" : i ? " " : "") + x.s).join("");
    const w = await patiently(() => ttsOnce({ apiKey, fetchImpl, model, voice, style, text }), { label: "Gemini", onRetry, sleep });
    if (!fmt) fmt = { channels: w.channels, rate: w.rate, bits: w.bits };
    if (w.rate !== fmt.rate || w.channels !== fmt.channels || w.bits !== fmt.bits) throw new Error("Gemini changed the audio format mid-way.");
    const total = seconds(w);
    const cuts = sentenceCuts(chunk.map((x) => x.s), total, pausesOf(w));
    const frame = fmt.channels * (fmt.bits / 8);
    const byteAt = (sec) => Math.min(w.pcm.length, Math.max(0, Math.round(sec * fmt.rate) * frame));
    chunk.forEach((x, k) => {
      const from = k ? cuts[k - 1].at : 0;
      const to = k < cuts.length ? cuts[k].at : total;
      // the words go where the sentence is said: between the pauses around it
      const speechFrom = k ? cuts[k - 1].end : 0;
      const speechTo = k < cuts.length ? cuts[k].start : total;
      const o = per[x.b];
      o.pcm.push(w.pcm.subarray(byteAt(from), byteAt(to)));
      o.words.push(...wordsByCharacters(x.s, o.t + (speechFrom - from), o.t + Math.max(speechFrom - from + 0.05, speechTo - from)));
      o.t += to - from;
    });
  }
  return per.map((o) => ({ audio: writeWav({ ...fmt, pcm: Buffer.concat(o.pcm) }), words: o.words, ext: "wav" }));
}

export async function speak({ apiKey, fetchImpl, voiceId, text, model = DEFAULT_MODEL, style = DEFAULT_STYLE, onSentence = () => {}, onRetry, sleep }) {
  const [r] = await speakMany({ apiKey, fetchImpl, voiceId, texts: [text], model, style, onChunk: onSentence, onRetry, sleep });
  return r;
}
