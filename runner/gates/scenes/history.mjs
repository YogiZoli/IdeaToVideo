// history.mjs: which components the channel's last videos used (DECISIONS
// 130, variety). Kept per Identity in scene-history.json:
//   { "<video folder>": { "at": ISO time, "components": { "<name>": count } } }
// The planner ranks a component the last videos used less first, so the
// channel does not look the same from video to video. Only the last KEEP
// videos are kept; the video being planned never counts against itself.

import fs from "node:fs";
import path from "node:path";

export const HISTORY_FILE = "scene-history.json";
export const KEEP = 5;

export function readHistory(identityDir) {
  if (!identityDir) return {};
  try {
    return JSON.parse(fs.readFileSync(path.join(identityDir, HISTORY_FILE), "utf8"));
  } catch {
    return {};
  }
}

// { name: count } over the last KEEP videos other than `videoId`.
export function recentUses(identityDir, videoId) {
  const uses = {};
  const others = Object.entries(readHistory(identityDir))
    .filter(([id]) => id !== videoId)
    .sort(([, a], [, b]) => String(b.at).localeCompare(String(a.at)))
    .slice(0, KEEP);
  for (const [, v] of others) for (const [name, n] of Object.entries(v.components ?? {})) uses[name] = (uses[name] ?? 0) + n;
  return uses;
}

export function recordHistory(identityDir, videoId, scenes, now = new Date()) {
  if (!identityDir || !videoId) return;
  const components = {};
  for (const sc of scenes ?? []) if (sc?.component) components[sc.component] = (components[sc.component] ?? 0) + 1;
  const all = { ...readHistory(identityDir), [videoId]: { at: now.toISOString(), components } };
  const keep = Object.entries(all)
    .sort(([, a], [, b]) => String(b.at).localeCompare(String(a.at)))
    .slice(0, KEEP * 2);
  fs.mkdirSync(identityDir, { recursive: true });
  fs.writeFileSync(path.join(identityDir, HISTORY_FILE), JSON.stringify(Object.fromEntries(keep), null, 2) + "\n");
}

// How often one component may appear in one video: never twice in a row
// (checked apart), and at most this many times, so a long video rotates
// through the catalog instead of repeating its favourites.
export const maxUses = (sceneCount) => Math.max(2, Math.ceil(sceneCount / 12));
