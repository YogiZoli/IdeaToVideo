// course/index.mjs: Course import (DECISIONS 121). A course planned on the
// Minicourse page arrives as one "Course Content Structure" file, or as the
// same text pasted, and becomes one prefilled ONE Video per lesson. The
// format belongs to the Minicourse repo and is frozen
// (schema/course-content-structure.md there); this is a reader only: it
// checks the type and the major version, refuses anything else in plain
// words, and ignores every field it does not know (the "outline" block too).
//
// A course is only a grouping above the videos; the app still works on one
// video at a time. Nothing here costs money or takes long: no AI call, no
// voice, no HeyGen, no render. The import only prepares.
//
//   <videos folder>/_courses/<slug>/<slug>-course-content-structure.json
//        the file as it came, byte for byte, so it can go on or back
//   <videos folder>/_courses/<slug>/course.json     the group (course-group/1)
//
//   <ONE Video>/project.json   series { courseSlug, lessonId, ... }
//   <ONE Video>/brief.json     the Video Brief Card the script gate reads
//   <ONE Video>/seed.json      hook, teach, do, review, closing line (lesson-seed/1)
//   <ONE Video>/packaging.json the YouTube title and description, as chosen
//   <ONE Video>/course-import.json   what was prefilled last time
//
// Importing the same course again: the key of a lesson is the course slug
// plus the lesson id. A prefilled value that still is what the last import
// wrote is updated; one the user changed by hand is left alone. A lesson
// never gets a second ONE Video.

import fs from "node:fs";
import path from "node:path";
import { createProject, loadProject, saveProject, writeJson, appendLog } from "../project.mjs";
import { validate, loadSchema } from "../schema/validate.mjs";
import { loadPackaging, writePackaging, setScriptTitle, PACKAGING_SCHEMA, TITLE_MAX, SUMMARY_MAX } from "../gates/render/youtube.mjs";

export const COURSE_TYPE = "course-content-structure";
export const COURSE_MAJOR = 1;
export const COURSES_FOLDER = "_courses";
export const SEED_SCHEMA = "lesson-seed/1";
export const MAX_BYTES = 2 * 1024 * 1024;
export const MAX_LESSONS = 200;
// The Video Brief Card allows 1 to 30 minutes.
export const MAX_MINUTES = 30;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PLAYLIST_ID = /^[A-Za-z0-9_-]{1,100}$/;
// The only link the app shows as a link (and the opener scope lets through).
export const PLAYLIST_URL = /^https:\/\/www\.youtube\.com\/playlist\?list=[A-Za-z0-9_-]{1,100}$/;
// A course comes from the Minicourse page, a playlist from the Playlist
// Planner (Wizards); both write the same Course Content Structure.
const AGAIN = 'Make the file again: for a course, on the Minicourse page use "Copy for IdeaToVideo" or "Download the file"; for a playlist, run Wizards, Playlist Planner again. Then try again.';

const str = (v, max = 5000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const int = (v) => (Number.isInteger(v) && v > 0 ? v : 0);
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

// The text of a Course Content Structure, checked and reduced to what this
// app reads. Throws a sentence for the user when it is something else.
export function parseCourse(text) {
  const raw = String(text ?? "").replace(/^﻿/, "");
  if (!raw.trim()) throw new Error(`There is nothing to read: the text is empty. ${AGAIN}`);
  if (Buffer.byteLength(raw) > MAX_BYTES) throw new Error("This is too large to be a Course Content Structure (more than 2 MB).");
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch {
    throw new Error(`This is not a Course Content Structure: the text is not valid JSON. ${AGAIN}`);
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) throw new Error(`This is not a Course Content Structure. ${AGAIN}`);
  if (doc.type !== COURSE_TYPE) {
    if (doc.type === "video-course-content-brief") throw new Error(`This is the older Video Course Content Brief, not a Course Content Structure. ${AGAIN}`);
    throw new Error(`This is not a Course Content Structure${typeof doc.type === "string" ? ` (its type is "${doc.type.slice(0, 60)}")` : ""}. ${AGAIN}`);
  }
  const version = typeof doc.schema_version === "string" ? doc.schema_version : "";
  const v = /^(\d+)\.(\d+)$/.exec(version);
  if (!v) throw new Error(`This Course Content Structure does not say which version it is. ${AGAIN}`);
  if (Number(v[1]) !== COURSE_MAJOR) {
    throw new Error(`This Course Content Structure is version ${version}. This app reads version ${COURSE_MAJOR} only. ${Number(v[1]) > COURSE_MAJOR ? "Update IdeaToVideo, then import it again." : AGAIN}`);
  }

  const c = obj(doc.course);
  const course = { title: str(c.title, 300), slug: typeof c.slug === "string" ? c.slug : "", boldPromise: str(c.bold_promise, 1000), idealClient: str(c.ideal_client, 2000) };
  if (!course.title) throw new Error(`This Course Content Structure has no course title. ${AGAIN}`);
  // The slug becomes a folder name and half of every lesson's key.
  if (!SLUG.test(course.slug) || course.slug.length > 60) throw new Error(`This Course Content Structure has no usable course slug (lowercase letters, numbers and hyphens, at most 60 characters). ${AGAIN}`);
  if (!Array.isArray(doc.lessons) || !doc.lessons.length) throw new Error(`This Course Content Structure has no lessons. ${AGAIN}`);
  if (doc.lessons.length > MAX_LESSONS) throw new Error(`This Course Content Structure has ${doc.lessons.length} lessons; the app takes at most ${MAX_LESSONS}.`);

  const warnings = [];
  const seen = new Set();
  const lessons = doc.lessons.map((raw, i) => {
    const l = obj(raw);
    const id = typeof l.id === "string" ? l.id : "";
    if (!SLUG.test(id) || id.length > 40) throw new Error(`Lesson ${i + 1} of this Course Content Structure has no usable id (like m1-l2). ${AGAIN}`);
    if (seen.has(id)) throw new Error(`Two lessons of this Course Content Structure have the same id (${id}), so they cannot be told apart. ${AGAIN}`);
    seen.add(id);
    const position = int(l.playlist_position) || i + 1;
    const [teach, practice, review, youtube] = [obj(l.teach), obj(l.do), obj(l.review), obj(l.youtube)];
    const lesson = {
      id,
      position,
      moduleTitle: str(l.module_title, 300),
      title: str(l.title, 300) || `Lesson ${position}`,
      keyword: str(l.keyword, 200),
      hook: str(l.hook, 1000),
      teach: { minutes: int(teach.minutes), points: (Array.isArray(teach.points) ? teach.points : []).map((p) => str(p, 1000)).filter(Boolean).slice(0, 30) },
      do: { minutes: int(practice.minutes), exercise: str(practice.exercise, 2000) },
      review: { minutes: int(review.minutes), check: str(review.check, 2000) },
      cta: str(l.cta, 1000),
      youtubeTitle: str(youtube.title, 500).replace(/\s+/g, " "),
      youtubeDescription: str(youtube.description, 20000),
    };
    if (lesson.youtubeTitle.length > TITLE_MAX) warnings.push(`${id}: the YouTube title is longer than ${TITLE_MAX} characters and will be cut.`);
    if (lesson.youtubeDescription.length > SUMMARY_MAX) warnings.push(`${id}: the YouTube description is longer than ${SUMMARY_MAX} characters; the video gets the first ${SUMMARY_MAX}. The whole text stays in the course file.`);
    if (minutesOf(lesson) > MAX_MINUTES) warnings.push(`${id}: ${minutesOf(lesson)} minutes planned; the script is written for ${MAX_MINUTES} at most.`);
    return lesson;
  });
  lessons.sort((a, b) => a.position - b.position);
  if (lessons.some((l, i) => l.position !== i + 1)) warnings.push("The playlist positions in the file are not 1, 2, 3 in a row. The app keeps them as they are.");
  if (Number.isInteger(c.lesson_count) && c.lesson_count !== lessons.length) warnings.push(`The file says ${c.lesson_count} lessons, and has ${lessons.length}.`);

  let playlist = null;
  if (doc.playlist && typeof doc.playlist === "object") {
    const id = typeof doc.playlist.id === "string" && PLAYLIST_ID.test(doc.playlist.id) ? doc.playlist.id : null;
    const url = typeof doc.playlist.url === "string" && PLAYLIST_URL.test(doc.playlist.url) ? doc.playlist.url : null;
    if (doc.playlist.url && !url) warnings.push("The playlist link in the file is not a YouTube playlist address, so it is not shown.");
    if (id || url) playlist = { id, url };
  }
  return { version, course, playlist, lessons, warnings };
}

const minutesOf = (l) => l.teach.minutes + l.do.minutes + l.review.minutes;
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== "" && v !== undefined && v !== null));

// What one lesson prefills in its ONE Video.
export function prefill({ course, playlist, lessons }, lesson) {
  const next = lessons[lessons.indexOf(lesson) + 1];
  const minutes = Math.min(MAX_MINUTES, minutesOf(lesson));
  return {
    title: lesson.title,
    // The Video Brief Card the script gate already reads.
    brief: clean({
      schema: "video-brief-card/1",
      title: lesson.title,
      audience: course.idealClient,
      keyword: lesson.keyword,
      playlist: clean({ name: course.title, position: lesson.position, of: lessons.length, nextTitle: next?.title }),
      targetLengthMin: minutes || undefined,
    }),
    // The script seed: the lesson's plan, in its order, the minutes as
    // target lengths. "Write script" gets it; nothing is written at import.
    seed: {
      schema: SEED_SCHEMA,
      course: clean({ title: course.title, boldPromise: course.boldPromise, module: lesson.moduleTitle }),
      hook: lesson.hook,
      teach: lesson.teach,
      do: lesson.do,
      review: lesson.review,
      closingLine: lesson.cta,
    },
    packagingTitle: lesson.youtubeTitle.slice(0, TITLE_MAX).trim(),
    packagingSummary: lesson.youtubeDescription.slice(0, SUMMARY_MAX).trim(),
    series: {
      courseSlug: course.slug,
      courseTitle: course.title,
      lessonId: lesson.id,
      playlistPosition: lesson.position,
      playlistCount: lessons.length,
      playlistId: playlist?.id ?? null,
      playlistUrl: playlist?.url ?? null,
    },
  };
}

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};
export const readSeed = (projectDir) => readJson(path.join(projectDir, "seed.json"));

// The file or the pasted text, as bytes: what is kept is what came.
function readInput({ file, text }) {
  if (file) {
    if (!/\.json$/i.test(file)) throw new Error("Choose the Course Content Structure file: its name ends in .json.");
    if (fs.statSync(file).size > MAX_BYTES) throw new Error("This is too large to be a Course Content Structure (more than 2 MB).");
    return fs.readFileSync(file);
  }
  return Buffer.from(String(text ?? ""), "utf8");
}

// Every ONE Video in the folder that belongs to a course lesson.
export function courseProjects(projectsDir) {
  const found = new Map();
  if (!projectsDir || !fs.existsSync(projectsDir)) return found;
  for (const name of fs.readdirSync(projectsDir).sort()) {
    const dir = path.join(projectsDir, name);
    try {
      const project = loadProject(dir);
      const key = project.series ? `${project.series.courseSlug}/${project.series.lessonId}` : null;
      if (key && !found.has(key)) found.set(key, { dir, project });
    } catch {
      // not a ONE Video
    }
  }
  return found;
}

const groupDir = (projectsDir, slug) => path.join(projectsDir, COURSES_FOLDER, slug);
const keptName = (slug) => `${slug}-course-content-structure.json`;

// What "Import" shows before anything is created.
export function previewCourse({ projectsDir, file, text }) {
  const parsed = parseCourse(readInput({ file, text }).toString("utf8"));
  const have = courseProjects(projectsDir);
  const lessons = parsed.lessons.map((l) => ({ id: l.id, position: l.position, moduleTitle: l.moduleTitle, title: l.title, minutes: minutesOf(l), exists: have.has(`${parsed.course.slug}/${l.id}`) }));
  return {
    version: parsed.version,
    course: parsed.course,
    playlist: parsed.playlist,
    lessons,
    warnings: parsed.warnings,
    newCount: lessons.filter((l) => !l.exists).length,
    existingCount: lessons.filter((l) => l.exists).length,
  };
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
// now: what the ONE Video has; last: what the last import wrote; next: what
// this import brings.
function merge3(now, last, next) {
  if (same(now, next)) return { value: now, state: "same" };
  if (same(now, last)) return { value: next, state: "updated" };
  return { value: now, state: "kept" };
}

const BRIEF_LABELS = { title: "title", audience: "audience", keyword: "keyword", playlist: "playlist", targetLengthMin: "target length" };
const SEED_LABELS = { course: "course details", hook: "hook", teach: "script seed", do: "script seed", review: "script seed", closingLine: "CTA" };

function writeNewPackaging(dir, fill) {
  if (!fill.packagingTitle) return;
  writePackaging(dir, { schema: PACKAGING_SCHEMA, titles: [fill.packagingTitle], title: fill.packagingTitle, summary: fill.packagingSummary, tags: [], chosen: true, at: new Date().toISOString() });
}

function updateLesson(dir, project, fill) {
  const last = readJson(path.join(dir, "course-import.json"))?.values ?? {};
  const updated = new Set();
  const kept = new Set();
  const note = (label, state) => (state === "updated" ? updated : state === "kept" ? kept : null)?.add(label);
  const next = structuredClone(project);

  // The title: after "Write script" the app itself sets it to the YouTube
  // title, which is not a change by hand.
  const byApp = last.packagingTitle && project.title === last.packagingTitle;
  if (!byApp) {
    const t = merge3(project.title, last.title, fill.title);
    next.title = t.value;
    note("title", t.state);
  }

  const brief = readJson(path.join(dir, "brief.json")) ?? {};
  const nextBrief = { ...brief };
  for (const key of Object.keys(BRIEF_LABELS)) {
    const m = merge3(brief[key], last.brief?.[key], fill.brief[key]);
    if (m.value === undefined) delete nextBrief[key];
    else nextBrief[key] = m.value;
    note(BRIEF_LABELS[key], m.state);
  }
  nextBrief.schema = "video-brief-card/1";
  if (!nextBrief.title) nextBrief.title = fill.title;
  if (!same(brief, nextBrief) && !validate(nextBrief, loadSchema("brief-card")).length) writeJson(path.join(dir, "brief.json"), nextBrief);

  const seed = readSeed(dir) ?? {};
  const nextSeed = { ...seed, schema: SEED_SCHEMA };
  for (const key of Object.keys(SEED_LABELS)) {
    const m = merge3(seed[key], last.seed?.[key], fill.seed[key]);
    nextSeed[key] = m.value;
    note(SEED_LABELS[key], m.state);
  }
  if (!same(seed, nextSeed)) writeJson(path.join(dir, "seed.json"), nextSeed);

  const pack = loadPackaging(dir);
  if (!pack) writeNewPackaging(dir, fill);
  else if (fill.packagingTitle) {
    const t = merge3(pack.title, last.packagingTitle, fill.packagingTitle);
    const s = merge3(pack.summary, last.packagingSummary, fill.packagingSummary);
    note("YouTube title", t.state);
    note("YouTube description", s.state);
    if (t.state === "updated" || s.state === "updated") {
      const titles = [t.value, ...(pack.titles ?? []).filter((x) => x !== t.value && x !== pack.title)];
      writePackaging(dir, { ...pack, titles, title: t.value, summary: s.value, at: new Date().toISOString() });
      if (t.state === "updated") {
        setScriptTitle(dir, t.value);
        if (byApp) next.title = t.value;
      }
    }
  }

  if (!same(project.series, fill.series)) updated.add("playlist");
  next.series = fill.series;
  // A value both updated in one part and kept in another reads as kept.
  for (const k of kept) updated.delete(k);
  if (!same(project, next)) saveProject(dir, next);
  return { updated: [...updated], kept: [...kept] };
}

const snapshot = (fill, at) => ({ schema: "course-import/1", courseSlug: fill.series.courseSlug, lessonId: fill.series.lessonId, at, values: { title: fill.title, brief: fill.brief, seed: fill.seed, packagingTitle: fill.packagingTitle, packagingSummary: fill.packagingSummary } });

// Creates the missing ONE Videos and updates the others. Returns what
// happened to each lesson, for the user to read.
export function importCourse({ projectsDir, file, text, identity = null, language = "en", now = new Date() }) {
  if (!projectsDir) throw new Error("No projects folder set.");
  const bytes = readInput({ file, text });
  const parsed = parseCourse(bytes.toString("utf8"));
  const { course, playlist, lessons } = parsed;
  const have = courseProjects(projectsDir);
  const at = now.toISOString();
  const report = [];

  lessons.forEach((lesson, i) => {
    const fill = prefill(parsed, lesson);
    const existing = have.get(`${course.slug}/${lesson.id}`);
    let dir;
    let line;
    if (!existing) {
      // Lesson 1 gets the latest time, so the list (newest first) reads in order.
      const made = createProject({ projectsDir, title: fill.title, language, brief: fill.brief, autopilot: false, identity, now: new Date(now.getTime() + lessons.length - i) });
      dir = made.dir;
      saveProject(dir, { ...made.project, series: fill.series });
      writeJson(path.join(dir, "seed.json"), fill.seed);
      writeNewPackaging(dir, fill);
      appendLog(dir, `course: made from ${course.slug}, lesson ${lesson.id} (position ${lesson.position} of ${lessons.length})`);
      line = { action: "created", updated: [], kept: [] };
    } else {
      dir = existing.dir;
      const r = updateLesson(dir, existing.project, fill);
      appendLog(dir, `course: imported again${r.updated.length ? `, updated: ${r.updated.join(", ")}` : ", nothing new"}${r.kept.length ? `; left alone (changed by hand): ${r.kept.join(", ")}` : ""}`);
      line = { action: r.updated.length ? "updated" : "unchanged", ...r };
      // The script is the user's from the moment it exists: a new seed never rewrites it.
      if (r.updated.length && existing.project.gates.script?.state !== "todo") line.scriptKept = true;
    }
    writeJson(path.join(dir, "course-import.json"), snapshot(fill, at));
    report.push({ id: lesson.id, position: lesson.position, title: lesson.title, dir, ...line });
  });

  // ONE Videos of this course whose lesson is not in the file any more.
  const ids = new Set(lessons.map((l) => l.id));
  const gone = [...have.values()].filter((p) => p.project.series.courseSlug === course.slug && !ids.has(p.project.series.lessonId)).map((p) => ({ id: p.project.series.lessonId, title: p.project.title, dir: p.dir }));

  const dir = groupDir(projectsDir, course.slug);
  fs.mkdirSync(dir, { recursive: true });
  const kept = path.join(dir, keptName(course.slug));
  fs.writeFileSync(kept, bytes);
  const before = readJson(path.join(dir, "course.json"));
  writeJson(path.join(dir, "course.json"), {
    schema: "course-group/1",
    slug: course.slug,
    title: course.title,
    version: parsed.version,
    playlist,
    lessons: lessons.map((l) => ({ id: l.id, position: l.position, title: l.title })),
    firstImportedAt: before?.firstImportedAt ?? at,
    importedAt: at,
    source: file ? "file" : "paste",
  });
  const count = (a) => report.filter((r) => r.action === a).length;
  return { course: { slug: course.slug, title: course.title }, playlist, again: !!before, created: count("created"), updated: count("updated"), unchanged: count("unchanged"), lessons: report, gone, warnings: parsed.warnings, file: kept };
}

// The course groups of this folder, each lesson with its ONE Video (if it
// has one) and that video's status.
export function listCourses(projectsDir) {
  const root = path.join(projectsDir ?? "", COURSES_FOLDER);
  if (!projectsDir || !fs.existsSync(root)) return { courses: [] };
  const have = courseProjects(projectsDir);
  const courses = [];
  for (const slug of fs.readdirSync(root).sort()) {
    const group = readJson(path.join(root, slug, "course.json"));
    if (!group || group.slug !== slug || !SLUG.test(slug)) continue;
    const lessons = (group.lessons ?? []).map((l) => {
      const p = have.get(`${slug}/${l.id}`);
      return { id: l.id, position: l.position, title: l.title, dir: p?.dir ?? null, videoTitle: p?.project.title ?? null, status: p?.project.status ?? null };
    });
    courses.push({ slug, title: group.title, playlist: group.playlist ?? null, importedAt: group.importedAt, lessons, hasFile: fs.existsSync(path.join(root, slug, keptName(slug))) });
  }
  courses.sort((a, b) => String(b.importedAt).localeCompare(String(a.importedAt)));
  return { courses };
}

// "Export Course Content Structure": the kept file, unchanged, to where the
// user chose.
export function exportCourse({ projectsDir, slug, file }) {
  if (!SLUG.test(String(slug ?? ""))) throw new Error("Choose a course or playlist first.");
  const kept = path.join(groupDir(projectsDir, slug), keptName(slug));
  if (!fs.existsSync(kept)) throw new Error("The file of this course is not on this computer any more. Make it again on the Minicourse page or with the Playlist Planner.");
  if (!file) throw new Error("Choose where to save the file.");
  const out = /\.json$/i.test(file) ? file : `${file}.json`;
  fs.copyFileSync(kept, out);
  return { file: out };
}
