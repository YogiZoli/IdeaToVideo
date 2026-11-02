// recorded/edit.mjs: the cut list applied to the files (docs/BUILD_PLAN.md phase 2).
// ffmpeg cuts every picture at the same whole frames and the sound is joined with
// a few milliseconds of fade, so a cut never clicks. A second file is lined up with
// the first by its sound. The picture stays in the composition; this only trims it.

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { bins, ffmpegRun } from "../audio.mjs";
import { ENVELOPE_RATE, FPS, envelope } from "./cuts.mjs";

export const SOUND_RATE = 48000;
const SAMPLES_PER_FRAME = SOUND_RATE / FPS;
const FADE_SAMPLES = Math.round(SOUND_RATE * 0.006);
const r3 = (x) => Math.round(x * 1000) / 1000;

/** ffmpeg with a percent: `seconds` is how much output it is making. */
export function ffmpegProgress(args, { env = process.env, seconds = 0, signal, onPercent = () => {} } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(bins(env).ffmpeg, ["-y", "-hide_banner", "-v", "error", "-nostats", "-progress", "pipe:1", ...args], { windowsHide: true, signal });
    let err = "";
    let buf = "";
    p.stdout.on("data", (d) => {
      buf += d;
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const l of lines) {
        const m = /^out_time_us=(\d+)/.exec(l);
        if (m && seconds > 0) onPercent(Math.min(99, Math.round((Number(m[1]) / 1e6 / seconds) * 100)));
      }
    });
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg failed: ${err.trim().split(/\r?\n/).slice(-3).join(" ")}`))));
  });
}

/**
 * How many seconds later the same moment sits in file B than in file A, from the
 * loudness of both. { lag, sure }: sure is false when the two do not line up
 * clearly (two separate takes), and the caller keeps them starting together.
 */
export function soundLag(a, b, { maxLag = 120, span = 300 } = {}) {
  const prep = (x) => {
    const n = Math.min(x.length, span * ENVELOPE_RATE);
    const out = new Float32Array(n);
    let mean = 0;
    for (let i = 0; i < n; i++) mean += x[i];
    mean /= n || 1;
    let power = 0;
    for (let i = 0; i < n; i++) {
      out[i] = x[i] - mean;
      power += out[i] * out[i];
    }
    const s = Math.sqrt(power) || 1;
    for (let i = 0; i < n; i++) out[i] /= s;
    return out;
  };
  const x = prep(a);
  const y = prep(b);
  const limit = Math.min(maxLag * ENVELOPE_RATE, Math.max(x.length, y.length));
  let best = 0;
  let bestScore = -Infinity;
  for (let lag = -limit; lag <= limit; lag++) {
    let sum = 0;
    const from = Math.max(0, -lag);
    const to = Math.min(x.length, y.length - lag);
    for (let i = from; i < to; i++) sum += x[i] * y[i + lag];
    if (sum > bestScore) {
      bestScore = sum;
      best = lag;
    }
  }
  return { lag: best / ENVELOPE_RATE, score: r3(bestScore), sure: bestScore >= 0.45 };
}

export const loudnessOf = (samples, rate = 16000) => envelope(samples, rate);

/** The select expression of the keeps, moved by a picture's offset in frames. Pure. */
export function selectExpression(keeps, shift = 0) {
  return keeps.map((k) => `between(n,${k.start + shift},${k.end + shift - 1})`).join("+");
}

/**
 * One picture cut to the keeps. `offset`: seconds this file's picture is later
 * than the sound clock. What is missing at either end repeats the nearest frame,
 * so every cut picture has exactly the same number of frames.
 */
export async function cutPicture({ file, out, keeps, offset = 0, sourceSeconds = 0, maxWidth = 1920, env = process.env, signal, onPercent }) {
  const shift = Math.round(offset * FPS);
  const lead = Math.max(0, -Math.min(0, keeps[0].start + shift));
  const frames = keeps.reduce((n, k) => n + k.end - k.start, 0);
  // never endless: ffmpeg does not stop a pad that goes on after its last output frame
  const tail = Math.max(0, keeps[keeps.length - 1].end + shift - Math.floor(sourceSeconds * FPS)) + FPS;
  const script = `${out}.filter.txt`;
  const filter = [
    `fps=${FPS}`,
    `tpad=start=${lead}:start_mode=clone:stop=${tail}:stop_mode=clone`,
    `select='${selectExpression(keeps, shift + lead)}'`,
    `setpts=N/${FPS}/TB`,
    `scale='min(${maxWidth},iw)':-2:flags=lanczos`,
    "format=yuv420p",
  ].join(",");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(script, filter);
  try {
    await ffmpegProgress(["-i", file, "-an", "-/filter:v", script, "-frames:v", String(frames), "-fps_mode", "cfr", "-r", String(FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-g", String(FPS), out], { env, signal, seconds: frames / FPS, onPercent });
  } finally {
    fs.rmSync(script, { force: true });
  }
  return { file: out, frames, seconds: frames / FPS };
}

/** Whole-frame keeps to bytes of 16 bit mono sound, with a short fade at each join. Pure. */
export function joinSound(pcm, keeps) {
  const total = keeps.reduce((n, k) => n + (k.end - k.start) * SAMPLES_PER_FRAME, 0);
  const out = new Int16Array(total);
  let at = 0;
  for (const k of keeps) {
    const from = k.start * SAMPLES_PER_FRAME;
    const n = (k.end - k.start) * SAMPLES_PER_FRAME;
    const fade = Math.min(FADE_SAMPLES, n >> 1);
    for (let i = 0; i < n; i++) {
      const v = from + i < pcm.length ? pcm[from + i] : 0;
      const g = i < fade ? i / fade : i >= n - fade ? (n - 1 - i) / fade : 1;
      out[at + i] = Math.round(v * g);
    }
    at += n;
  }
  return out;
}

const wavHeader = (samples, rate) => {
  const b = Buffer.alloc(44);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + samples * 2, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(samples * 2, 40);
  return b;
};

/**
 * The recording's sound, cut to the keeps: audio/vo.mp3, with a low cut for rumble.
 * The mix (audio.mjs) then brings it to YouTube's level, with music if the recipe
 * has any, and writes vo_bgm.mp3 as for any other video.
 */
export async function cutSound({ file, out, keeps, env = process.env }) {
  const raw = `${out}.raw`;
  const wav = `${out}.wav`;
  try {
    await ffmpegRun(["-i", file, "-vn", "-ac", "1", "-ar", String(SOUND_RATE), "-f", "s16le", raw], env);
    const b = fs.readFileSync(raw);
    const pcm = new Int16Array(b.length >> 1);
    Buffer.from(pcm.buffer).set(b.subarray(0, pcm.length * 2));
    const joined = joinSound(pcm, keeps);
    fs.writeFileSync(wav, Buffer.concat([wavHeader(joined.length, SOUND_RATE), Buffer.from(joined.buffer, joined.byteOffset, joined.byteLength)]));
    await ffmpegRun(["-i", wav, "-af", "highpass=f=70", "-c:a", "libmp3lame", "-b:a", "192k", "-ar", "44100", "-ac", "1", out], env);
    return { file: out, seconds: joined.length / SOUND_RATE };
  } finally {
    fs.rmSync(raw, { force: true });
    fs.rmSync(wav, { force: true });
  }
}
