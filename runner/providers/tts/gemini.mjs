// gemini.mjs: the free Narrator Voice, Gemini TTS with the user's own Gemini
// key (the one onboarding already asks for). Hungarian is supported.
//
// Gemini TTS returns audio but no word timings, and hyperframes' transcriber
// needs a whisper.cpp build the user's machine does not have. So timing comes
// from the text itself: one TTS call per sentence, the pieces joined with a
// short gap. Every sentence's start and end are then exact; words inside a
// sentence are placed by character position.
//
// Output of speak(): { audio: WAV bytes (24 kHz mono 16-bit), words }.

import { redact } from "../llm.mjs";
import { closesSentence } from "../../timing/sentences.mjs";

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
  const content = { type: "text", text };
  if (style) content.annotations = [{ type: "speech_metadata", style }];
  const body = { model, input: [{ type: "user_input", content: [content] }], response_format: { type: "audio" }, generation_config: { speech_config: [{ voice }] } };
  let res;
  try {
    res = await fetchImpl(ENDPOINT, { method: "POST", headers: { "x-goog-api-key": apiKey, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
  } catch (e) {
    throw new Error(`Could not reach Gemini: ${redact(e.message, apiKey)}`);
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
    if (res.status === 429) throw new Error(`Gemini free quota or rate limit reached${why}. Wait a minute and try again, or use ElevenLabs.`);
    if (res.status === 404) throw new Error(`Gemini does not know this voice model${why}.`);
    throw new Error(`Gemini answered with HTTP ${res.status}${why}. Try again later.`);
  }
  const j = await res.json();
  const audio = (j.steps ?? []).filter((s) => s.type === "model_output").flatMap((s) => s.content ?? []).filter((c) => c.type === "audio" && c.data).pop();
  if (!audio) throw new Error("Gemini returned no audio.");
  return parseWav(Buffer.from(audio.data, "base64"));
}

export async function speak({ apiKey, fetchImpl, voiceId, text, model = DEFAULT_MODEL, style = DEFAULT_STYLE, onSentence = () => {} }) {
  if (!apiKey) throw new Error("No API key set for Gemini. Add it in Settings.");
  const voice = voiceId || "Kore";
  const sentences = splitSentences(text);
  const pieces = [];
  const words = [];
  let t = 0;
  let fmt = null;
  for (let i = 0; i < sentences.length; i++) {
    onSentence(i + 1, sentences.length);
    const w = await ttsOnce({ apiKey, fetchImpl, model, voice, style, text: sentences[i] });
    if (!fmt) fmt = { channels: w.channels, rate: w.rate, bits: w.bits };
    if (w.rate !== fmt.rate || w.channels !== fmt.channels || w.bits !== fmt.bits) throw new Error("Gemini changed the audio format mid-way.");
    if (i > 0) {
      const gap = Buffer.alloc(Math.round(GAP_SECONDS * fmt.rate) * fmt.channels * (fmt.bits / 8));
      pieces.push(gap);
      t += GAP_SECONDS;
    }
    const d = seconds(w);
    words.push(...wordsByCharacters(sentences[i], t, t + d));
    pieces.push(w.pcm);
    t += d;
  }
  return { audio: writeWav({ ...fmt, pcm: Buffer.concat(pieces) }), words, ext: "wav" };
}
