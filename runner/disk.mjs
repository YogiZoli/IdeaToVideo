// disk.mjs: is there room for this step (docs/AUDIT_REPORT.md). Asked before heavy work,
// so a full disk is one plain sentence at the start, not a broken file at the end.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** Free bytes on the drive of this folder, which may not exist yet. Null: not known. */
export function freeBytes(dir) {
  let p = path.resolve(String(dir));
  for (;;) {
    try {
      const s = fs.statfsSync(p);
      return Number(s.bavail) * Number(s.bsize);
    } catch {
      const up = path.dirname(p);
      if (up === p) return null;
      p = up;
    }
  }
}

const size = (bytes) => (bytes >= GB ? `${(bytes / GB).toFixed(1)} GB` : `${Math.ceil(bytes / MB)} MB`);

/** Throws a sentence when the drive of `dir` has less than `bytes` free. Unknown space never stops a step. */
export function ensureRoom(dir, bytes, what) {
  const free = freeBytes(dir);
  if (free === null || free >= bytes) return;
  throw new Error(`There is not enough free disk space for ${what}: it needs about ${size(bytes)} and ${size(free)} is free. Free up some space and press the button again; nothing is lost.`);
}

// What a step needs, roughly and on the safe side.
export const RENDER_MB_PER_SECOND = 3;
export const roomForRender = (seconds) => Math.max(GB, (Number(seconds) || 60) * RENDER_MB_PER_SECOND * MB);
export const ROOM_FOR_BUILD = 500 * MB;
export const ROOM_FOR_VOICE = 200 * MB;

/** The render writes to the temp folder first, then into the video's folder. */
export function ensureRenderRoom(projectDir, seconds, env = process.env) {
  const need = roomForRender(seconds);
  ensureRoom(projectDir, need, "the finished video");
  ensureRoom(env.ITV_RENDER_TMP || os.tmpdir(), need, "the render's working files");
}

/** A cut of a recording is written anew: about the size of what goes in, with room to spare. */
export function roomForFiles(files, times = 2) {
  let total = 0;
  for (const f of files) {
    try {
      total += fs.statSync(f).size;
    } catch {
      // a missing file has its own sentence later
    }
  }
  return Math.max(ROOM_FOR_BUILD, total * times);
}
