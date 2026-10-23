// course/bridge.mjs: the two playlist bridge lines of a ONE Video that is one
// lesson of an imported course or playlist (DECISIONS 128). Made at script
// time from the course group's order as it is now (_courses/<slug>/
// course.json), never stored in the Course Content Structure, so a new order
// (imported again) needs no fix by hand: the next script says it right.
//
//   open   after the hook, from position 2 on:
//          "If you have not watched <previous> yet, watch it first. The link is on screen."
//   close  before the end screen:
//          "Next, watch <next>. It is the next step in this playlist."
//          the last lesson: "If you missed any part of this playlist, start from lesson 1."
//
// The app writes these words, not the AI, and each line is at most 12
// seconds: a long title is shortened. The comment calls are not touched.

import fs from "node:fs";
import path from "node:path";
import { COURSES_FOLDER } from "./index.mjs";

export const WORDS_PER_SECOND = 150 / 60;
export const MAX_SECONDS = 12;
export const MAX_WORDS = Math.floor(MAX_SECONDS * WORDS_PER_SECOND);

const OPEN = (t) => `If you have not watched ${t} yet, watch it first. The link is on screen.`;
const NEXT = (t) => `Next, watch ${t}. It is the next step in this playlist.`;
export const LAST = "If you missed any part of this playlist, start from lesson 1.";

const words = (s) => s.split(/\s+/).filter(Boolean);

// A title as spoken text: the script's style allows commas and periods only,
// so a colon, a dash, quotes, brackets and the like become a comma or go.
export function spokenTitle(title) {
  return String(title ?? "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/["“”„«»'‘’()[\]{}]/g, "")
    .replace(/\s*(?:[:;–—|!?]|\s-\s|--)\s*/g, ", ")
    .replace(/\.\.\.|…/g, "")
    .replace(/[\s,.]+$/g, "")
    .replace(/^[\s,]+/, "")
    .replace(/\s*,\s*(,\s*)+/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

// The sentence with the title cut to fit 12 seconds.
export function fit(make, title) {
  const t = words(spokenTitle(title));
  const room = MAX_WORDS - words(make("")).length;
  if (!t.length) return null;
  return make(t.slice(0, Math.max(1, room)).join(" ").replace(/,$/, ""));
}

// The lessons of one course group in the current order, or null.
export function courseOrder(projectsDir, slug) {
  try {
    const group = JSON.parse(fs.readFileSync(path.join(projectsDir, COURSES_FOLDER, slug, "course.json"), "utf8"));
    const lessons = (group.lessons ?? []).filter((l) => l && l.id && Number.isInteger(l.position)).sort((a, b) => a.position - b.position);
    return lessons.length ? lessons : null;
  } catch {
    return null;
  }
}

// The two lines for this ONE Video, or null when it is not a lesson (or its
// course group is not on this computer any more).
export function bridgeLines(projectsDir, series) {
  if (!series?.courseSlug || !series?.lessonId) return null;
  const lessons = courseOrder(projectsDir, series.courseSlug);
  if (!lessons) return null;
  const i = lessons.findIndex((l) => l.id === series.lessonId);
  if (i < 0) return null;
  const prev = lessons[i - 1];
  const next = lessons[i + 1];
  return {
    open: prev ? fit(OPEN, prev.title) : null,
    close: next ? fit(NEXT, next.title) : LAST,
  };
}
