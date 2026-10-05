// audio.mjs: the voice gate's ffmpeg work, standard broadcast practice:
//   - narration blocks joined with a pause between them
//   - loudness MEASURED (ebur128), never a guessed relative dB value
//   - music 24 LU under the narration, gentle ducking, faded in and out
//   - the final mix normalised to -14 LUFS, true peak -1.5 dB
// ffmpeg / ffprobe are the bundled ones (HYPERFRAMES_FFMPEG_PATH / _FFPROBE_PATH).

import fs from "node:fs";
import { spawn } from "node:child_process";

export const PAUSE_SECONDS = 0.6; // before each major section (1.2 s felt like dead air in the first real video, DECISIONS 58)
export const MUSIC_UNDER_LU = 24; // music this far below the narration 
export const TARGET_LUFS = -14; // YouTube's level 

export function bins(env = process.env) {
  const ffmpeg = env.HYPERFRAMES_FFMPEG_PATH;
  const ffprobe = env.HYPERFRAMES_FFPROBE_PATH;
  if (!ffmpeg || !ffprobe || !fs.existsSync(ffmpeg) || !fs.existsSync(ffprobe)) {
    throw new Error("The video engine is incomplete: ffmpeg is missing. Reinstall the app.");
  }
  return { ffmpeg, ffprobe };
}

function run(bin, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { windowsHide: true });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve({ out, err }) : reject(new Error(`ffmpeg failed (${code}): ${err.trim().split(/\r?\n/).slice(-3).join(" ")}`))));
  });
}

export async function duration(file, env = process.env) {
  const { ffprobe } = bins(env);
  const { out } = await run(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file]);
  const d = Number(out.trim());
  if (!Number.isFinite(d)) throw new Error(`Could not read the length of ${file}`);
  return d;
}

// Integrated loudness in LUFS, from ebur128's summary ("I:  -27.2 LUFS").
export function parseIntegrated(stderr) {
  const summary = stderr.slice(stderr.lastIndexOf("Summary:"));
  const m = /I:\s*(-?[\d.]+)\s*LUFS/.exec(summary);
  if (!m) throw new Error("Could not measure the loudness.");
  return Number(m[1]);
}

export async function loudness(file, { env = process.env, seconds } = {}) {
  const { ffmpeg } = bins(env);
  const args = ["-hide_banner", "-nostats", ...(seconds ? ["-t", String(seconds)] : []), "-i", file, "-af", "ebur128=framelog=quiet", "-f", "null", "-"];
  const { err } = await run(ffmpeg, args);
  return parseIntegrated(err);
}

// The filter that joins N blocks with a pause after each one but the last.
export function joinFilter(n, pause = PAUSE_SECONDS) {
  const parts = [];
  const labels = [];
  for (let i = 0; i < n; i++) {
    const pad = i < n - 1 ? `,apad=pad_dur=${pause}` : "";
    parts.push(`[${i}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=mono${pad}[b${i}]`);
    labels.push(`[b${i}]`);
  }
  return `${parts.join(";")};${labels.join("")}concat=n=${n}:v=0:a=1[out]`;
}

// Joins the blocks into one narration file. Returns each block's start time in
// the joined audio, measured from the decoded blocks, so word timings line up.
export async function joinBlocks(files, out, { env = process.env, pause = PAUSE_SECONDS } = {}) {
  const { ffmpeg } = bins(env);
  const offsets = [];
  let t = 0;
  for (let i = 0; i < files.length; i++) {
    offsets.push(Math.round(t * 1000) / 1000);
    t += (await duration(files[i], env)) + (i < files.length - 1 ? pause : 0);
  }
  const inputs = files.flatMap((f) => ["-i", f]);
  await run(ffmpeg, ["-y", "-hide_banner", "-v", "error", ...inputs, "-filter_complex", joinFilter(files.length, pause), "-map", "[out]", "-c:a", "libmp3lame", "-b:a", "192k", "-ar", "44100", out]);
  return { offsets, seconds: Math.round(t * 1000) / 1000 };
}

const TRUE_PEAK_LINEAR = 0.841; // -1.5 dBTP

// How far to lift (or lower) a finished mix to reach TARGET_LUFS; 0 when it is
// within half a LU already.
export function correctionDb(measured) {
  const d = Math.round((TARGET_LUFS - measured) * 10) / 10;
  return Math.abs(d) < 0.5 ? 0 : d;
}

// Music gain from two measurements: music ends up
// MUSIC_UNDER_LU below the narration, whatever the source levels are.
export const musicGainDb = (voLufs, bgmLufs) => Math.round((voLufs - MUSIC_UNDER_LU - bgmLufs) * 10) / 10;

// "The working command". Without music: only the -14 LUFS step.
export function mixFilter({ seconds, gainDb }) {
  const loud = `loudnorm=I=${TARGET_LUFS}:TP=-1.5:LRA=11`;
  if (gainDb === undefined) return `[0:a]${loud}[out]`;
  const fadeOut = Math.max(0, seconds - 5).toFixed(2);
  return [
    `[1:a]atrim=0:${seconds.toFixed(3)},asetpts=N/SR/TB,volume=${gainDb}dB,afade=t=in:st=0:d=3,afade=t=out:st=${fadeOut}:d=5[bg]`,
    `[bg][0:a]sidechaincompress=threshold=0.02:ratio=6:attack=20:release=500[duck]`,
    `[duck][0:a]amix=inputs=2:duration=first:normalize=0[mix]`,
    `[mix]${loud}[out]`,
  ].join(";");
}

// vo = the joined narration; bgm = optional music file (looped to length).
export async function mix({ vo, bgm, out, env = process.env }) {
  const { ffmpeg } = bins(env);
  const seconds = await duration(vo, env);
  const voLufs = await loudness(vo, { env });
  let gainDb;
  let bgmLufs;
  if (bgm) {
    bgmLufs = await loudness(bgm, { env, seconds: 60 });
    gainDb = musicGainDb(voLufs, bgmLufs);
  }
  const inputs = ["-i", vo, ...(bgm ? ["-stream_loop", "-1", "-i", bgm] : [])];
  await run(ffmpeg, ["-y", "-hide_banner", "-v", "error", ...inputs, "-filter_complex", mixFilter({ seconds, gainDb }), "-map", "[out]", "-c:a", "libmp3lame", "-b:a", "192k", "-ar", "44100", out]);
  let finalLufs = await loudness(out, { env });
  // One-pass loudnorm undershoots on speech with pauses (-15.8 instead of -14
  // in the first real video). A second, linear step closes the gap: a gain,
  // then a limiter at -1.5 dBTP, so nothing clips.
  const delta = correctionDb(finalLufs);
  if (delta !== 0) {
    const tmp = out.replace(/\.mp3$/i, ".pre.mp3");
    fs.renameSync(out, tmp);
    await run(ffmpeg, ["-y", "-hide_banner", "-v", "error", "-i", tmp, "-af", `volume=${delta}dB,alimiter=limit=${TRUE_PEAK_LINEAR}:level=disabled`, "-c:a", "libmp3lame", "-b:a", "192k", "-ar", "44100", out]);
    fs.rmSync(tmp, { force: true });
    finalLufs = await loudness(out, { env });
  }
  return { seconds: Math.round(seconds * 100) / 100, voLufs, bgmLufs: bgmLufs ?? null, musicGainDb: gainDb ?? null, finalLufs };
}

// ffmpeg with the app's usual quiet flags (the CTA segments use it).
export async function ffmpegRun(args, env = process.env) {
  const { ffmpeg } = bins(env);
  return run(ffmpeg, ["-y", "-hide_banner", "-v", "error", ...args]);
}

// N seconds of silence (the end-screen tail, a segment without sound).
export async function silence(seconds, out, env = process.env) {
  await ffmpegRun(["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", String(seconds), "-c:a", "libmp3lame", "-b:a", "192k", out], env);
  return out;
}

// The sound of a video clip as mp3; silence of its length when it has none.
export async function clipAudio(video, out, env = process.env) {
  const seconds = await duration(video, env);
  try {
    await ffmpegRun(["-i", video, "-vn", "-ac", "2", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "192k", "-t", String(seconds), out], env);
  } catch {
    await silence(seconds, out, env);
  }
  return { file: out, seconds: Math.round(seconds * 1000) / 1000 };
}
