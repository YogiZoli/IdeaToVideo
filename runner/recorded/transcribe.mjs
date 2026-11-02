// recorded/transcribe.mjs: a recording's sound to words with times, on this
// computer (docs/BUILD_PLAN.md phase 2), checked against the recording: every word
// is snapped to the sound, then the words and the sound are compared. The result
// stays in recorded/transcript.json, in the source file's own seconds.

import fs from "node:fs";
import path from "node:path";
import { bins } from "../audio.mjs";
import { spawn } from "node:child_process";
import { decodeChunk, ensureWhisper, releaseWhisper, SAMPLE_RATE } from "./whisper.mjs";
import { checkWords, envelope, snapWords, speechChunks, voicedMask, ENVELOPE_RATE } from "./cuts.mjs";

// Words in the prompt keep the sounds Whisper otherwise leaves out.
const PROMPTS = {
  en: "So, um, I was, uh, thinking about it, hmm, and, you know, it worked.",
  hu: "Szóval, ööö, arra gondoltam, hogy, hmm, ez így, izé, működik.",
  de: "Also, äh, ich habe, ähm, darüber nachgedacht, hm, und es geht.",
  es: "Bueno, eh, estaba, em, pensando en esto, y funciona.",
  fr: "Alors, euh, je pensais, hum, à ça, et ça marche.",
};
export const promptFor = (language) => PROMPTS[String(language).toLowerCase().slice(0, 2)] ?? "";

const runFfprobe = (args, env) =>
  new Promise((resolve, reject) => {
    const p = spawn(bins(env).ffprobe, args, { windowsHide: true });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`This file cannot be read: ${args.at(-1)}`))));
  });

/** What a file holds: size, length, frame rate, sound, and where each stream starts. */
export async function probeMedia(file, env = process.env) {
  const out = await runFfprobe(["-v", "error", "-show_entries", "stream=codec_type,width,height,start_time,avg_frame_rate:stream_side_data=rotation:format=duration", "-of", "json", file], env);
  const j = JSON.parse(out);
  const video = j.streams.find((s) => s.codec_type === "video");
  const audio = j.streams.find((s) => s.codec_type === "audio");
  const [n, d] = String(video?.avg_frame_rate ?? "0/1").split("/").map(Number);
  const rotation = Math.abs(Number(video?.side_data_list?.[0]?.rotation ?? 0));
  return {
    file,
    seconds: Number(j.format?.duration) || 0,
    hasVideo: !!video,
    hasAudio: !!audio,
    width: rotation === 90 ? video?.height : video?.width,
    height: rotation === 90 ? video?.width : video?.height,
    fps: d ? n / d : 0,
    // how much later the sound starts than the picture, in the file itself
    audioLate: video && audio ? (Number(audio.start_time) || 0) - (Number(video.start_time) || 0) : 0,
  };
}

/** The sound of a file as 16 kHz mono samples. */
export function readSamples(file, env = process.env, rate = SAMPLE_RATE) {
  return new Promise((resolve, reject) => {
    const p = spawn(bins(env).ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", file, "-vn", "-ac", "1", "-ar", String(rate), "-f", "f32le", "-"], { windowsHide: true });
    const parts = [];
    let err = "";
    p.stdout.on("data", (d) => parts.push(d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => {
      if (code !== 0) return reject(new Error(`The sound of this file cannot be read: ${err.trim().split(/\r?\n/).slice(-1)[0] ?? ""}`));
      const b = Buffer.concat(parts);
      const copy = new Float32Array(b.length >> 2);
      Buffer.from(copy.buffer).set(b.subarray(0, copy.length * 4));
      resolve(copy);
    });
  });
}

/**
 * Words of a whole file: pieces cut in its pauses, each read by the model, snapped
 * to the sound. `decode` stands in for the model in the tests.
 */
export async function transcribeFile({ file, language = "en", env = process.env, signal, onProgress = () => {}, decode = decodeChunk, ensure = ensureWhisper, read = readSamples }) {
  await ensure({ env, onProgress });
  const samples = await read(file, env);
  const seconds = samples.length / SAMPLE_RATE;
  if (!seconds) throw new Error("This recording has no sound, so there is nothing to transcribe.");
  const env100 = envelope(samples, SAMPLE_RATE);
  const mask = voicedMask(env100);
  const chunks = speechChunks(mask);
  const prompt = promptFor(language);
  const raw = [];
  try {
    for (let i = 0; i < chunks.length; i++) {
      if (signal?.aborted) throw new Error("Stopped.");
      onProgress({ step: "transcribe", n: i + 1, of: chunks.length, percent: Math.round((i / chunks.length) * 100) });
      const c = chunks[i];
      const piece = samples.subarray(Math.round(c.start * SAMPLE_RATE), Math.round(c.end * SAMPLE_RATE));
      const words = await decode(piece, { language, prompt, env, signal });
      for (const w of words) raw.push({ text: w.text, start: w.start + c.start, end: Math.min(w.end + c.start, c.end) });
    }
  } finally {
    await releaseWhisper();
  }
  const words = snapWords(raw, mask);
  return { words, mask, seconds, check: checkWords(words, mask, seconds), chunks: chunks.length };
}

export const maskToJson = (mask) => {
  // runs, not 100 values a second
  const out = [];
  let from = -1;
  for (let i = 0; i <= mask.length; i++) {
    const on = i < mask.length && mask[i];
    if (on && from < 0) from = i;
    if (!on && from >= 0) {
      out.push([from, i]);
      from = -1;
    }
  }
  return { rate: ENVELOPE_RATE, length: mask.length, runs: out };
};

export const maskFromJson = (j) => {
  const mask = new Uint8Array(j.length);
  for (const [a, b] of j.runs) mask.fill(1, a, b);
  return mask;
};

export const transcriptFile = (projectDir) => path.join(projectDir, "recorded", "transcript.json");
export function loadTranscript(projectDir) {
  try {
    return JSON.parse(fs.readFileSync(transcriptFile(projectDir), "utf8"));
  } catch {
    return null;
  }
}
