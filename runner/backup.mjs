// backup.mjs: ONE Video backups into a folder the user picked, usually inside
// the Google Drive, OneDrive or Dropbox desktop folder, whose own client
// uploads it (DECISIONS 66, docs/backup.md). No account, no key, no server.
//
//   <backupRoot>/<Identity folder>/<Full_Title_2026-10-01>/
//     <Full_Title>_script.md, _voice.mp3, _video.mp4 ... (Zoltan's names)
//     <Full_Title>_backup.json   which file came from where, for a restore
//
// Levels (the user chooses; App default, per ONE Video override):
//   1 script   2 + voice   3 + scene table   4 + the latest video and avatar
// Only changed files are copied (size and time). Nothing is ever deleted
// from a backup. The project folder gets backup.json (its backup folder,
// the level override, the last backup); project.json is never written here,
// so a backup can run next to a gate.
//
// Course groups (DECISIONS 123): the kept Course Content Structure file and
// course.json of an imported course go to
//   <backupRoot>/<Identity folder>/_courses/<slug>/
// with every backup of one of its lessons and with "Back up now", and come
// back with the first lesson restored. They ride with every level.

import fs from "node:fs";
import path from "node:path";
import { GATES, statusFor, writeJson } from "./project.mjs";

export const MANIFEST_FORMAT = "ideatovideo-backup/1";
export const LEVELS = [1, 2, 3, 4];
const WINDOWS_MAX_PATH = 259;

/** The files of a project for a level: [{ rel, suffix, level }], existing only. */
export function backupFiles(projectDir, level = 4) {
  const out = [];
  const add = (rel, suffix, lvl) => {
    if (lvl <= level && fs.existsSync(path.join(projectDir, rel)) && fs.statSync(path.join(projectDir, rel)).isFile()) out.push({ rel, suffix, level: lvl });
  };
  add("project.json", "_project.json", 1);
  add("script.md", "_script.md", 1);
  add("script.json", "_script.json", 1);
  add("brief.json", "_brief.json", 1);
  // the packaging chosen at gate 1, and what a course import prefilled
  add("packaging.json", "_packaging.json", 1);
  add("seed.json", "_seed.json", 1);
  add("course-import.json", "_course_import.json", 1);
  add("log.txt", "_log.txt", 1);
  add("audio/vo.mp3", "_voice.mp3", 2);
  add("audio/vo_bgm.mp3", "_voice_music.mp3", 2);
  for (const f of list(path.join(projectDir, "audio")).filter((f) => /^music\.\w+$/.test(f))) add(`audio/${f}`, `_${f}`, 2);
  add("audio/stt.json", "_stt.json", 2);
  add("audio/voice.json", "_voice.json", 2);
  add("sentences.json", "_sentences.json", 2);
  add("words.json", "_words.json", 2);
  add("scenes.json", "_scenes.json", 3);
  const mp4 = list(path.join(projectDir, "out")).filter((f) => /^video-.*\.mp4$/.test(f)).sort().pop();
  if (mp4) {
    const base = mp4.replace(/\.mp4$/, "");
    add(`out/${mp4}`, "_video.mp4", 4);
    add(`out/${base}.srt`, "_captions.srt", 4);
    add(`out/${base}.chapters.txt`, "_chapters.txt", 4);
  }
  for (const f of list(path.join(projectDir, "avatar"))) add(`avatar/${f}`, f === "avatar.json" ? "_avatar.json" : `_avatar_${f}`, 4);
  return out;
}

function list(dir) {
  try {
    return fs.readdirSync(dir).filter((f) => fs.statSync(path.join(dir, f)).isFile());
  } catch {
    return [];
  }
}

const COURSES = "_courses";
const COURSE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const changed = (src, dest) => {
  const s = fs.statSync(src);
  const d = fs.existsSync(dest) ? fs.statSync(dest) : null;
  return !(d && d.size === s.size && d.mtimeMs >= s.mtimeMs);
};

/** Copies one course group between a videos folder and its backup, only the
 * changed files. Returns how many files were copied. */
function copyCourse(fromDir, toDir, slug) {
  if (!COURSE_SLUG.test(String(slug ?? ""))) return 0;
  const from = path.join(fromDir, COURSES, slug);
  let copied = 0;
  for (const f of list(from).filter((n) => n.endsWith(".json"))) {
    const dest = path.join(toDir, COURSES, slug, f);
    if (!changed(path.join(from, f), dest)) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(from, f), dest);
    copied++;
  }
  return copied;
}

/** Every course group of one Identity's videos folder into the backup. */
export function backupCourses({ projectsDir, backupRoot, identityFolder }) {
  let slugs = [];
  try {
    slugs = fs.readdirSync(path.join(projectsDir, COURSES));
  } catch {
    return { courses: 0, copied: 0 };
  }
  let courses = 0;
  let copied = 0;
  for (const slug of slugs) {
    if (!fs.existsSync(path.join(projectsDir, COURSES, slug, "course.json"))) continue;
    courses++;
    copied += copyCourse(projectsDir, path.join(backupRoot, identityFolder), slug);
  }
  return { courses, copied };
}

/** "Freelancer to Owner: 3 steps?" -> "Freelancer_to_Owner_3_steps" (DECISIONS 66). */
export function titleName(title) {
  const s = String(title ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._]+|[._ ]+$/g, "");
  return s || "Video";
}

/** The project's own backup record (backup.json), {} when none. */
export function readRecord(projectDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(projectDir, "backup.json"), "utf8"));
  } catch {
    return {};
  }
}

function writeRecord(projectDir, patch) {
  writeJson(path.join(projectDir, "backup.json"), { ...readRecord(projectDir), ...patch });
}

/** A ONE Video's own level ("Use the default" when null). */
export function setLevel(projectDir, level) {
  if (level !== null && !LEVELS.includes(level)) throw new Error(`Unknown backup level: ${level}`);
  writeRecord(projectDir, { level });
  return readRecord(projectDir);
}

function manifestIn(dir) {
  const m = list(dir).find((f) => f.endsWith("_backup.json"));
  if (!m) return null;
  try {
    return { file: m, ...JSON.parse(fs.readFileSync(path.join(dir, m), "utf8")) };
  } catch {
    return null;
  }
}

/** The title part of the folder and the file names. Shortened only when the
 * longest file path would pass the Windows limit (DECISIONS 66): the folder
 * and the files both carry it, plus "_2026-10-01_2" and the longest suffix. */
function fitTitle(backupRoot, identityFolder, title) {
  const full = titleName(title);
  const fixed = path.join(backupRoot, identityFolder).length + 1 + "_2026-10-01_99".length + 1 + "_voice_music.mp3".length + 4;
  const room = Math.floor((WINDOWS_MAX_PATH - fixed) / 2);
  if (full.length <= room) return [full, false];
  return [full.slice(0, Math.max(8, room)).replace(/_+$/, ""), true];
}

/** The backup folder of a project: the one it used before, else a new one
 * "<Title>_<date>", "_2" when that name belongs to another ONE Video. */
function folderFor(backupRoot, identityFolder, project, record, title) {
  if (record.path && !record.path.split(/[\\/]/).includes("..")) return record.path;
  const date = (project.createdAt || new Date().toISOString()).slice(0, 10);
  const base = `${title}_${date}`;
  for (let n = 1; ; n++) {
    const name = n === 1 ? base : `${base}_${n}`;
    const dir = path.join(backupRoot, identityFolder, name);
    const m = fs.existsSync(dir) ? manifestIn(dir) : null;
    if (!fs.existsSync(dir) || m?.projectId === project.id) return path.join(identityFolder, name);
  }
}

/** Backs up one ONE Video. `level`: the App default; the project's own
 * override (backup.json) wins. Returns what happened. */
export function backupProject({ projectDir, backupRoot, identityFolder, level = 4, now = new Date(), onProgress = () => {} }) {
  if (!backupRoot) throw new Error("No backup folder set. Choose one in Settings, Backup.");
  const project = JSON.parse(fs.readFileSync(path.join(projectDir, "project.json"), "utf8"));
  const record = readRecord(projectDir);
  const lvl = LEVELS.includes(record.level) ? record.level : level;
  const [title, short] = fitTitle(backupRoot, identityFolder, project.title || project.id);
  const rel = folderFor(backupRoot, identityFolder, project, record, title);
  const dir = path.join(backupRoot, rel);
  fs.mkdirSync(dir, { recursive: true });
  const files = backupFiles(projectDir, lvl);
  const old = manifestIn(dir);
  const [prefix, shortened] = old?.prefix ? [old.prefix, !!old.shortened] : [title, short];

  let copied = 0;
  let skipped = 0;
  let bytes = 0;
  const map = { ...(old?.files ?? {}) };
  files.forEach((f, i) => {
    const src = path.join(projectDir, f.rel);
    const name = `${prefix}${f.suffix}`;
    const dest = path.join(dir, name);
    const s = fs.statSync(src);
    const d = fs.existsSync(dest) ? fs.statSync(dest) : null;
    if (d && d.size === s.size && d.mtimeMs >= s.mtimeMs) skipped++;
    else {
      fs.copyFileSync(src, dest);
      copied++;
      bytes += s.size;
    }
    map[name] = f.rel;
    onProgress({ step: "backup", done: i + 1, of: files.length });
  });
  const at = now.toISOString();
  writeJson(path.join(dir, `${prefix}_backup.json`), {
    format: MANIFEST_FORMAT,
    projectId: project.id,
    title: project.title ?? null,
    identityFolder,
    prefix,
    shortened,
    level: Math.max(lvl, old?.level ?? 0),
    at,
    files: map,
  });
  writeRecord(projectDir, { path: rel, at, lastLevel: lvl });
  // a course lesson takes its course group along (a problem there never
  // fails the video's own backup)
  try {
    if (project.series) copyCourse(path.dirname(projectDir), path.join(backupRoot, identityFolder), project.series.courseSlug);
  } catch {
    // the next backup tries again
  }
  return { path: rel, dir, level: lvl, copied, skipped, bytes, files: files.length, shortened, at };
}

/** Every ONE Video of the given Identity folders. */
export function backupAll({ backupRoot, projectsRoot, folders, level = 4, onProgress = () => {} }) {
  const done = [];
  const failed = [];
  const projects = [];
  for (const folder of folders) for (const p of projectDirs(path.join(projectsRoot, folder))) projects.push({ folder, dir: p });
  projects.forEach(({ folder, dir }, i) => {
    onProgress({ step: "backup", done: i, of: projects.length, project: path.basename(dir) });
    try {
      done.push(backupProject({ projectDir: dir, backupRoot, identityFolder: folder, level }));
    } catch (e) {
      failed.push({ project: path.basename(dir), error: e.message });
    }
  });
  // the course groups too, also one whose lessons have no video any more
  let courses = 0;
  for (const folder of folders) {
    try {
      courses += backupCourses({ projectsDir: path.join(projectsRoot, folder), backupRoot, identityFolder: folder }).courses;
    } catch (e) {
      failed.push({ project: `${folder}/${COURSES}`, error: e.message });
    }
  }
  return {
    projects: projects.length,
    courses,
    copied: done.reduce((a, r) => a + r.copied, 0),
    bytes: done.reduce((a, r) => a + r.bytes, 0),
    failed,
  };
}

function projectDirs(folder) {
  try {
    return fs
      .readdirSync(folder)
      .map((n) => path.join(folder, n))
      .filter((d) => fs.existsSync(path.join(d, "project.json")));
  } catch {
    return [];
  }
}

/** Size of a backup at each level, from the ONE Videos on this computer. */
export function estimate({ projectsRoot, folders }) {
  const levels = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let projects = 0;
  for (const folder of folders) {
    for (const dir of projectDirs(path.join(projectsRoot, folder))) {
      projects++;
      for (const f of backupFiles(dir, 4)) {
        const size = fs.statSync(path.join(dir, f.rel)).size;
        for (const l of LEVELS) if (f.level <= l) levels[l] += size;
      }
    }
  }
  return { projects, levels };
}

/** The backups of one Identity, and which are missing on this computer. */
export function listBackups({ backupRoot, identityFolder, projectsDir }) {
  const base = path.join(backupRoot, identityFolder);
  if (!fs.existsSync(base)) return [];
  const out = [];
  for (const name of fs.readdirSync(base)) {
    const dir = path.join(base, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    const m = manifestIn(dir);
    if (!m || m.format !== MANIFEST_FORMAT) continue;
    out.push({ path: path.join(identityFolder, name), title: m.title, projectId: m.projectId, at: m.at, level: m.level, here: fs.existsSync(path.join(projectsDir, m.projectId)) });
  }
  return out.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

// What a gate needs on disk to stay approved after a restore.
const NEEDS = {
  script: ["script.md"],
  voice: ["audio/vo.mp3", "sentences.json"],
  scenes: ["scenes.json"],
  review: [],
  avatar: [],
};

/** Brings a ONE Video back from a backup into `projectsDir`. Gates whose
 * files were not in the backup (a lower level) go back to "todo", with every
 * later gate, so they can be made again. */
export function restoreProject({ backupRoot, path: rel, projectsDir }) {
  if (!rel || path.isAbsolute(rel) || rel.split(/[\\/]/).includes("..")) throw new Error("That is not a backup in the backup folder.");
  const dir = path.join(backupRoot, rel);
  const m = manifestIn(dir);
  if (!m || m.format !== MANIFEST_FORMAT) throw new Error("No backup found in that folder.");
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}_[a-z0-9-]+$/.test(m.projectId ?? "")) throw new Error("The backup names an invalid ONE Video.");
  const target = path.join(projectsDir, m.projectId);
  if (fs.existsSync(target)) throw new Error("This ONE Video is already on this computer.");
  for (const [name, to] of Object.entries(m.files ?? {})) {
    if (path.isAbsolute(to) || to.split(/[\\/]/).includes("..") || name.includes("/") || name.includes("\\")) continue;
    const src = path.join(dir, name);
    if (!fs.existsSync(src)) continue;
    fs.mkdirSync(path.dirname(path.join(target, to)), { recursive: true });
    fs.copyFileSync(src, path.join(target, to));
  }
  const pj = path.join(target, "project.json");
  if (!fs.existsSync(pj)) {
    fs.rmSync(target, { recursive: true, force: true });
    throw new Error("The backup has no project.json, so it cannot be restored.");
  }
  const project = JSON.parse(fs.readFileSync(pj, "utf8"));
  let reset = false;
  for (const g of GATES) {
    const gate = project.gates[g];
    const missing = NEEDS[g].some((f) => !fs.existsSync(path.join(target, f)));
    if (reset || (["approved", "pending", "running"].includes(gate?.state) && missing)) {
      reset = true;
      project.gates[g] = { state: "todo" };
    }
  }
  project.status = statusFor(project);
  writeJson(pj, project);
  writeRecord(target, { path: rel, at: m.at, restoredAt: new Date().toISOString() });
  // a course lesson brings its course group back (never over a newer one here)
  let course = false;
  try {
    const slug = project.series?.courseSlug;
    if (slug && !fs.existsSync(path.join(projectsDir, COURSES, slug, "course.json"))) course = copyCourse(path.dirname(dir), projectsDir, slug) > 0;
  } catch {
    // the group comes back with an import of the course file
  }
  return { dir: target, id: m.projectId, reset, course };
}
