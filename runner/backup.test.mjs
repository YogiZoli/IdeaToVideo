// Backups (DECISIONS 66, docs/backup.md): Zoltan's names, the four levels,
// only changed files, nothing deleted, and a restore that resets the gates
// whose files a lower level left out.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { titleName, backupFiles, backupProject, backupAll, estimate, listBackups, restoreProject, setLevel, readRecord } from "./backup.mjs";
import { createProject, loadProject, saveProject, setGate } from "./project.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "itv-backup-"));

function fullProject(root, title = "Freelancer to Owner") {
  const { dir } = createProject({ projectsDir: root, title, identity: "zoltan-gero", now: new Date("2026-10-01T10:00:00Z") });
  const w = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  };
  w("script.md", "# S");
  w("script.json", "{}");
  w("audio/vo.mp3", "voice");
  w("audio/vo_bgm.mp3", "voice and music");
  w("audio/music.mp3", "music");
  w("audio/blocks/01.mp3", "block");
  w("audio/stt.json", "{}");
  w("audio/voice.json", "{}");
  w("sentences.json", "[]");
  w("words.json", "[]");
  w("scenes.json", "{}");
  w("out/video-20260930-2000.mp4", "old video");
  w("out/video-20261001-1456.mp4", "video");
  w("out/video-20261001-1456.srt", "srt");
  w("out/video-20261001-1456.chapters.txt", "0:00 Intro");
  w("avatar/avatar.json", "{}");
  w("avatar/open.webm", "clip");
  w("build/index.html", "<html>");
  let p = loadProject(dir);
  for (const g of ["script", "voice", "scenes", "review"]) p = setGate(p, g, { state: "approved" });
  saveProject(dir, p);
  return dir;
}

test("titles become Zoltan's file names", () => {
  assert.equal(titleName("Freelancer to Owner"), "Freelancer_to_Owner");
  assert.equal(titleName("Árvíztűrő: tükör?  fúrógép"), "Arvizturo_tukor_furogep");
  assert.equal(titleName('a/b\\c*d"e<f>g|h'), "abcdefgh");
  assert.equal(titleName("  ...  "), "Video");
  assert.equal(titleName("IdeaToVideo: the new Backup feature!"), "IdeaToVideo_the_new_Backup_feature!");
});

test("levels pick the right files, the latest render only, nothing regenerable", () => {
  const dir = fullProject(tmp());
  const rels = (l) => backupFiles(dir, l).map((f) => f.rel);
  assert.deepEqual(rels(1), ["project.json", "script.md", "script.json", "log.txt"].filter((r) => fs.existsSync(path.join(dir, r))));
  assert.ok(rels(2).includes("audio/vo.mp3") && rels(2).includes("audio/music.mp3") && !rels(2).includes("scenes.json"));
  assert.ok(rels(3).includes("scenes.json") && !rels(3).some((r) => r.startsWith("out/")));
  const four = rels(4);
  assert.ok(four.includes("out/video-20261001-1456.mp4") && four.includes("out/video-20261001-1456.chapters.txt") && four.includes("avatar/open.webm"));
  assert.ok(!four.includes("out/video-20260930-2000.mp4"), "only the latest render");
  assert.ok(!four.some((r) => r.startsWith("build/") || r.startsWith("audio/blocks/")));
});

test("a backup uses Zoltan's names, copies only changes, and keeps its folder", () => {
  const root = tmp();
  const projects = path.join(root, "projects", "Zoltan Gero");
  const backups = path.join(root, "My Drive", "IdeaToVideo_Backup");
  const dir = fullProject(projects);
  const r1 = backupProject({ projectDir: dir, backupRoot: backups, identityFolder: "Zoltan Gero", level: 4, now: new Date("2026-10-01T12:00:00Z") });
  assert.equal(r1.path, path.join("Zoltan Gero", "Freelancer_to_Owner_2026-10-01"));
  const names = fs.readdirSync(r1.dir).sort();
  for (const n of ["Freelancer_to_Owner_script.md", "Freelancer_to_Owner_voice.mp3", "Freelancer_to_Owner_voice_music.mp3", "Freelancer_to_Owner_video.mp4", "Freelancer_to_Owner_captions.srt", "Freelancer_to_Owner_chapters.txt", "Freelancer_to_Owner_avatar_open.webm", "Freelancer_to_Owner_avatar.json", "Freelancer_to_Owner_backup.json"]) {
    assert.ok(names.includes(n), `${n} in ${names}`);
  }
  assert.equal(fs.readFileSync(path.join(r1.dir, "Freelancer_to_Owner_video.mp4"), "utf8"), "video");
  assert.ok(r1.copied > 10);
  assert.equal(readRecord(dir).path, r1.path);

  const r2 = backupProject({ projectDir: dir, backupRoot: backups, identityFolder: "Zoltan Gero", level: 4 });
  assert.equal(r2.copied, 0, "nothing changed, nothing copied");
  fs.writeFileSync(path.join(dir, "script.md"), "# S2, longer");
  const r3 = backupProject({ projectDir: dir, backupRoot: backups, identityFolder: "Zoltan Gero", level: 4 });
  assert.equal(r3.copied, 1);
  assert.equal(r3.path, r1.path, "the same folder every time");

  // nothing is deleted from a backup, even when the project loses a file
  fs.rmSync(path.join(dir, "avatar"), { recursive: true });
  backupProject({ projectDir: dir, backupRoot: backups, identityFolder: "Zoltan Gero", level: 4 });
  assert.ok(fs.existsSync(path.join(r1.dir, "Freelancer_to_Owner_avatar_open.webm")));
});

test("the same title on the same day gets _2; a project's own level wins", () => {
  const root = tmp();
  const projects = path.join(root, "p", "Z");
  const backups = path.join(root, "b");
  const a = fullProject(projects, "Same title");
  const b = fullProject(projects, "Same title");
  const ra = backupProject({ projectDir: a, backupRoot: backups, identityFolder: "Z", level: 4 });
  setLevel(b, 1);
  const rb = backupProject({ projectDir: b, backupRoot: backups, identityFolder: "Z", level: 4 });
  assert.ok(ra.path.endsWith("Same_title_2026-10-01"));
  assert.ok(rb.path.endsWith("Same_title_2026-10-01_2"));
  assert.equal(rb.level, 1);
  assert.ok(!fs.readdirSync(rb.dir).some((n) => n.endsWith("_voice.mp3")));
  assert.throws(() => setLevel(b, 7), /Unknown backup level/);
});

test("very long titles are shortened only to stay under the Windows path limit", () => {
  const root = tmp();
  const dir = fullProject(path.join(root, "p", "Z"), "word ".repeat(55));
  const r = backupProject({ projectDir: dir, backupRoot: path.join(root, "b"), identityFolder: "Z", level: 1 });
  assert.equal(r.shortened, true);
  for (const n of fs.readdirSync(r.dir)) assert.ok(path.join(r.dir, n).length <= 259, n);
});

test("estimate, backup-all, list and restore with the gates reset", () => {
  const root = tmp();
  const projectsRoot = path.join(root, "projects");
  const backups = path.join(root, "b");
  const dir = fullProject(path.join(projectsRoot, "Zoltan Gero"));
  const e = estimate({ projectsRoot, folders: ["Zoltan Gero", "Empty"] });
  assert.equal(e.projects, 1);
  assert.ok(e.levels[1] < e.levels[2] && e.levels[2] <= e.levels[3] && e.levels[3] < e.levels[4]);

  setLevel(dir, 1);
  const all = backupAll({ backupRoot: backups, projectsRoot, folders: ["Zoltan Gero"], level: 4 });
  assert.equal(all.projects, 1);
  assert.deepEqual(all.failed, []);

  const projectsDir = path.join(projectsRoot, "Zoltan Gero");
  assert.equal(listBackups({ backupRoot: backups, identityFolder: "Zoltan Gero", projectsDir })[0].here, true);
  fs.rmSync(dir, { recursive: true });
  const [b] = listBackups({ backupRoot: backups, identityFolder: "Zoltan Gero", projectsDir });
  assert.equal(b.here, false);
  assert.equal(b.title, "Freelancer to Owner");

  const r = restoreProject({ backupRoot: backups, path: b.path, projectsDir });
  assert.equal(r.reset, true, "level 1 had no voice: voice and later gates go back to todo");
  const p = loadProject(r.dir);
  assert.equal(p.gates.script.state, "approved");
  assert.equal(p.gates.voice.state, "todo");
  assert.equal(p.gates.scenes.state, "todo");
  assert.equal(p.status, "Scripted");
  assert.ok(fs.existsSync(path.join(r.dir, "script.md")));
  assert.throws(() => restoreProject({ backupRoot: backups, path: b.path, projectsDir }), /already on this computer/);
  assert.throws(() => restoreProject({ backupRoot: backups, path: "../elsewhere", projectsDir }), /not a backup/);
});

test("a full restore keeps every gate", () => {
  const root = tmp();
  const projectsDir = path.join(root, "projects", "Z");
  const backups = path.join(root, "b");
  const dir = fullProject(projectsDir);
  const { path: rel } = backupProject({ projectDir: dir, backupRoot: backups, identityFolder: "Z", level: 4 });
  fs.rmSync(dir, { recursive: true });
  const r = restoreProject({ backupRoot: backups, path: rel, projectsDir });
  assert.equal(r.reset, false);
  assert.equal(loadProject(r.dir).status, "Reviewed");
  assert.ok(fs.existsSync(path.join(r.dir, "out", "video-20261001-1456.mp4")));
  assert.ok(fs.existsSync(path.join(r.dir, "avatar", "open.webm")));
});
