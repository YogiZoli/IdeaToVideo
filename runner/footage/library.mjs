// footage/library.mjs: the Identity's own footage (Zoltan, 2026-10-05,
// DECISIONS 82). Clips the user already has (often 30 to 90 seconds on one
// topic) become B-roll: muted, under the narrator's voice, in the scenes
// whose sentences they fit.
//
//   <identity>/footage/footage.json   { schema, clips: [...] }
//   <identity>/footage/<id>.<ext>      the clips
//   <identity>/footage/<id>-<n>.jpg    three stills (the list, and the AI's eyes)
//
// What makes a long clip usable many times:
//   - shots: the cut points inside the clip (ffmpeg scene detection), so a
//     piece always starts at the beginning of a shot, never mid-movement
//   - used: which seconds went into which ONE Video; the next video takes
//     the least used piece, so the same clip looks new each time
//   - description: what is on it, in the user's words or written by the AI
//     from the stills; the scene planner matches it to the sentences

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { duration, ffmpegRun, bins } from "../audio.mjs";
import { spawn } from "node:child_process";

export const FOOTAGE_SCHEMA = "itv-footage/1";
export const MAX_CLIP_SECONDS = 600;
export const MAX_CLIPS = 200;
export const MODES = { scene: "Its own scene: only the footage, full frame", background: "Behind the words: the footage, darkened, with the scene's short text on it" };
export const DEFAULT_MODE = "scene";
const VIDEO_EXT = /\.(mp4|mov|webm|m4v)$/i;

export const footageDir = (identityDir) => path.join(identityDir, "footage");
const indexFile = (identityDir) => path.join(footageDir(identityDir), "footage.json");

export function loadLibrary(identityDir) {
  const p = identityDir ? indexFile(identityDir) : null;
  const empty = { schema: FOOTAGE_SCHEMA, mode: DEFAULT_MODE, clips: [] };
  if (!p || !fs.existsSync(p)) return empty;
  const data = JSON.parse(fs.readFileSync(p, "utf8"));
  return {
    schema: FOOTAGE_SCHEMA,
    mode: MODES[data.mode] ? data.mode : DEFAULT_MODE,
    clips: (data.clips ?? []).filter((c) => typeof c.file === "string" && fs.existsSync(path.join(footageDir(identityDir), c.file))),
  };
}

function saveLibrary(identityDir, lib) {
  fs.mkdirSync(footageDir(identityDir), { recursive: true });
  const p = indexFile(identityDir);
  fs.writeFileSync(`${p}.tmp`, JSON.stringify({ schema: FOOTAGE_SCHEMA, mode: lib.mode, clips: lib.clips }, null, 2) + "\n");
  fs.renameSync(`${p}.tmp`, p);
}

// The cut points of a clip, in seconds, 0 first: ffmpeg's scene score over
// 0.3 on a small copy of the picture. A clip with one long shot has [0].
export async function detectShots(file, env = process.env) {
  const { ffmpeg } = bins(env);
  const err = await new Promise((resolve) => {
    const p = spawn(ffmpeg, ["-hide_banner", "-i", file, "-an", "-vf", "scale=160:-2,select='gt(scene,0.3)',showinfo", "-f", "null", "-"], { windowsHide: true });
    let e = "";
    p.stderr.on("data", (d) => (e += d));
    p.on("close", () => resolve(e));
    p.on("error", () => resolve(""));
  });
  const times = [...err.matchAll(/pts_time:([\d.]+)/g)].map((m) => Math.round(Number(m[1]) * 100) / 100);
  return [0, ...times.filter((t) => t > 0.5)];
}

// Three stills at a quarter, a half and three quarters of the clip.
async function stills(file, id, dir, seconds, env) {
  const out = [];
  for (const [n, at] of [0.25, 0.5, 0.75].entries()) {
    const name = `${id}-${n + 1}.jpg`;
    try {
      await ffmpegRun(["-ss", String(Math.max(0, seconds * at)), "-i", file, "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "4", path.join(dir, name)], env);
      out.push(name);
    } catch {
      // a still is a nicety; the clip works without it
    }
  }
  return out;
}

// A clip the Rust core copied in (import_footage, a temporary name) or a
// stock download: checked, measured, cut points found, stills made.
export async function addClip({ identityDir, file, name = "", description = "", source = "upload", credit = null, env = process.env }) {
  const dir = footageDir(identityDir);
  const src = path.join(dir, path.basename(String(file ?? "")));
  const drop = () => fs.rmSync(src, { force: true });
  if (!fs.existsSync(src)) throw new Error("The clip is missing. Choose it again.");
  if (!VIDEO_EXT.test(src)) {
    drop();
    throw new Error("Footage must be a video file (MP4, MOV, WebM).");
  }
  const lib = loadLibrary(identityDir);
  if (lib.clips.length >= MAX_CLIPS) {
    drop();
    throw new Error(`The library holds ${MAX_CLIPS} clips. Remove some first.`);
  }
  let seconds;
  try {
    seconds = Math.round((await duration(src, env)) * 100) / 100;
  } catch {
    drop();
    throw new Error("This file could not be read as a video.");
  }
  if (seconds > MAX_CLIP_SECONDS) {
    drop();
    throw new Error(`The clip is ${Math.round(seconds / 60)} minutes long. Footage can be at most ${MAX_CLIP_SECONDS / 60} minutes: cut it into parts.`);
  }
  if (seconds < 2) {
    drop();
    throw new Error("The clip is shorter than 2 seconds.");
  }
  const id = crypto.randomBytes(5).toString("hex");
  const target = `${id}${path.extname(src).toLowerCase()}`;
  fs.renameSync(src, path.join(dir, target));
  const full = path.join(dir, target);
  const clip = {
    id,
    file: target,
    name: String(name).trim().slice(0, 80) || path.basename(String(file)).replace(/^incoming-\d+/, "").replace(/\.[^.]+$/, "") || `Clip ${lib.clips.length + 1}`,
    description: String(description).replace(/\s+/g, " ").trim().slice(0, 400),
    seconds,
    shots: await detectShots(full, env),
    stills: await stills(full, id, dir, seconds, env),
    source,
    ...(credit ? { credit } : {}),
    used: [],
    createdAt: new Date().toISOString(),
  };
  saveLibrary(identityDir, { ...lib, clips: [...lib.clips, clip] });
  return clip;
}

export function updateClip(identityDir, id, { name, description }) {
  const lib = loadLibrary(identityDir);
  const clip = lib.clips.find((c) => c.id === id);
  if (!clip) throw new Error("There is no such clip.");
  if (typeof name === "string") clip.name = name.trim().slice(0, 80) || clip.name;
  if (typeof description === "string") clip.description = description.replace(/\s+/g, " ").trim().slice(0, 400);
  saveLibrary(identityDir, lib);
  return clip;
}

export function removeClip(identityDir, id) {
  const lib = loadLibrary(identityDir);
  const clip = lib.clips.find((c) => c.id === id);
  if (!clip) throw new Error("There is no such clip.");
  for (const f of [clip.file, ...(clip.stills ?? [])]) fs.rmSync(path.join(footageDir(identityDir), f), { force: true });
  saveLibrary(identityDir, { ...lib, clips: lib.clips.filter((c) => c.id !== id) });
  return { removed: id };
}

export function setMode(identityDir, mode) {
  if (!MODES[mode]) throw new Error(`Unknown footage mode: ${mode}.`);
  const lib = loadLibrary(identityDir);
  saveLibrary(identityDir, { ...lib, mode });
  return { mode };
}

// The piece of a clip for a scene of `seconds`: it starts at a cut point
// (or the clip's start), fits inside the clip, and among those the one
// least used before by other ONE Videos (overlap with earlier pieces, in
// seconds), ties to the earliest. A clip shorter than the scene plays from
// its start and loops.
export function choosePiece(clip, seconds, { project = null } = {}) {
  if (clip.seconds <= seconds) return { start: 0, end: clip.seconds, loop: true };
  const others = (clip.used ?? []).filter((u) => u.project !== project);
  const starts = [...new Set([...(clip.shots ?? [0]), 0])].filter((s) => s + seconds <= clip.seconds + 0.01).sort((a, b) => a - b);
  // a few more starting points between far-apart cuts, so a single long shot
  // still offers different pieces
  for (let t = seconds; t + seconds <= clip.seconds; t += seconds) if (!starts.some((s) => Math.abs(s - t) < seconds / 2)) starts.push(Math.round(t * 100) / 100);
  const overlap = (a, b) => Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
  let best = null;
  for (const start of starts.sort((a, b) => a - b)) {
    const piece = { start, end: Math.round((start + seconds) * 100) / 100 };
    const score = others.reduce((t, u) => t + overlap(piece, u), 0);
    if (!best || score < best.score - 0.001) best = { ...piece, score };
  }
  return { start: best.start, end: best.end, loop: false };
}

// Remembers which pieces a ONE Video used (replacing its earlier ones, so a
// rebuild does not count twice).
export function markPieces(identityDir, project, pieces) {
  const lib = loadLibrary(identityDir);
  for (const clip of lib.clips) {
    const mine = pieces.filter((p) => p.clip === clip.id).map((p) => ({ project, start: p.start, end: p.end, at: new Date().toISOString() }));
    clip.used = [...(clip.used ?? []).filter((u) => u.project !== project), ...mine];
  }
  saveLibrary(identityDir, lib);
}

// What the scene planner sees: id, what is on it, how long.
export const catalogForPlanner = (lib) => lib.clips.filter((c) => c.description).map((c) => ({ id: c.id, about: c.description, seconds: c.seconds }));

export const incomingFootage = (ext = ".mp4") => `incoming-${Date.now()}${ext}`;
