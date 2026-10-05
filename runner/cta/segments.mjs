// cta/segments.mjs: the Identity's reusable comment-call segments
// (docs/wizards/cta.md, DECISIONS 78). A segment is a short clip, at most 30
// seconds, recorded once, that says one comment call itself ("Comment GUIDE
// below"), for example a full-screen avatar. Every segment belongs to exactly
// one of the 15 keywords, so the clip and the place it fills can never say
// different keywords. At most 3 per keyword; when a place uses a keyword with
// several, the least recently used one comes next, so videos vary by
// themselves.
//
//   <identity>/segments/segments.json   { schema, segments: [...] }
//   <identity>/segments/<id>.mp4        the clips
//
// A place is filled by the narrator or by a segment, never both: the script
// writes no call where a segment plays (cta/profile.mjs videoPlan).

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { keywordInfo } from "./catalog.mjs";
import { duration } from "../audio.mjs";

export const SEGMENTS_SCHEMA = "itv-segments/1";
export const SEGMENT_MAX_SECONDS = 30;
export const SEGMENTS_PER_KEYWORD = 3;
const VIDEO_EXT = /\.(mp4|mov|webm|m4v)$/i;

export const segmentsDir = (identityDir) => path.join(identityDir, "segments");
const indexFile = (identityDir) => path.join(segmentsDir(identityDir), "segments.json");

export function loadSegments(identityDir) {
  const p = identityDir ? indexFile(identityDir) : null;
  if (!p || !fs.existsSync(p)) return [];
  const data = JSON.parse(fs.readFileSync(p, "utf8"));
  return (data.segments ?? []).filter((s) => keywordInfo(s.keyword) && typeof s.file === "string" && fs.existsSync(path.join(segmentsDir(identityDir), s.file)));
}

function saveSegments(identityDir, segments) {
  fs.mkdirSync(segmentsDir(identityDir), { recursive: true });
  const p = indexFile(identityDir);
  fs.writeFileSync(`${p}.tmp`, JSON.stringify({ schema: SEGMENTS_SCHEMA, segments }, null, 2) + "\n");
  fs.renameSync(`${p}.tmp`, p);
}

// A new segment from a clip already inside <identity>/segments (an upload
// the app copied there, or a HeyGen video it downloaded). The clip is
// checked here; a refused one is deleted.
// text: what the clip says, optional; it goes into the captions and the
// publishing data (an upload's words are not in the narration).
export async function addSegment({ identityDir, file, keyword, name, text = "", source = "upload", env = process.env }) {
  const dir = segmentsDir(identityDir);
  const src = path.join(dir, path.basename(String(file ?? "")));
  const drop = () => fs.rmSync(src, { force: true });
  if (!fs.existsSync(src)) throw new Error("The clip is missing. Choose it again.");
  if (!VIDEO_EXT.test(src)) {
    drop();
    throw new Error("A segment must be a video file (MP4, MOV, WebM).");
  }
  const info = keywordInfo(keyword);
  if (!info) {
    drop();
    throw new Error("Pick the keyword this segment says.");
  }
  const all = loadSegments(identityDir);
  if (all.filter((s) => s.keyword === info.keyword).length >= SEGMENTS_PER_KEYWORD) {
    drop();
    throw new Error(`${info.keyword} already has ${SEGMENTS_PER_KEYWORD} segments. Remove one first.`);
  }
  let seconds;
  try {
    seconds = Math.round((await duration(src, env)) * 1000) / 1000;
  } catch {
    drop();
    throw new Error("This file could not be read as a video.");
  }
  if (seconds > SEGMENT_MAX_SECONDS + 0.05) {
    drop();
    throw new Error(`The clip is ${Math.round(seconds)} s long. A segment can be at most ${SEGMENT_MAX_SECONDS} s.`);
  }
  const id = crypto.randomBytes(5).toString("hex");
  const target = `${id}${path.extname(src).toLowerCase()}`;
  fs.renameSync(src, path.join(dir, target));
  const seg = { id, keyword: info.keyword, name: String(name ?? "").trim().slice(0, 60) || `${info.keyword} ${all.filter((s) => s.keyword === info.keyword).length + 1}`, file: target, seconds, source, text: String(text ?? "").replace(/\s+/g, " ").trim().slice(0, 400) || null, createdAt: new Date().toISOString(), lastUsedAt: null };
  saveSegments(identityDir, [...all, seg]);
  return seg;
}

export function removeSegment(identityDir, id) {
  const all = loadSegments(identityDir);
  const seg = all.find((s) => s.id === id);
  if (!seg) throw new Error("There is no such segment.");
  fs.rmSync(path.join(segmentsDir(identityDir), seg.file), { force: true });
  saveSegments(identityDir, all.filter((s) => s.id !== id));
  return { removed: id };
}

// The segment for a keyword: the wanted one if it still exists and says that
// keyword, else the least recently used (never used first).
export function pickSegment(segments, keyword, wantedId = null) {
  const mine = segments.filter((s) => s.keyword === keyword);
  const wanted = wantedId && mine.find((s) => s.id === wantedId);
  if (wanted) return wanted;
  return [...mine].sort((a, b) => String(a.lastUsedAt ?? "").localeCompare(String(b.lastUsedAt ?? "")) || a.createdAt.localeCompare(b.createdAt))[0] ?? null;
}

export function markUsed(identityDir, ids) {
  if (!ids.length) return;
  const now = new Date().toISOString();
  saveSegments(identityDir, loadSegments(identityDir).map((s) => (ids.includes(s.id) ? { ...s, lastUsedAt: now } : s)));
}

// A file the Rust core copied in (import_segment), or a HeyGen download,
// gets a temporary name until addSegment accepts it.
export const incomingName = (ext = ".mp4") => `incoming-${Date.now()}${ext}`;
