// course.test.mjs: Course import (DECISIONS 121, 122). The fixture is a copy
// of the Minicourse repo's schema/example-course-content-structure.json: the
// reader's rules, one prepared ONE Video per lesson, a safe second import,
// the kept file, and the optional series block of the publishing card.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCourse, previewCourse, importCourse, listCourses, exportCourse, readSeed, PLAYLIST_URL, COURSES_FOLDER } from "./course/index.mjs";
import { loadProject, saveProject, GATES } from "./project.mjs";
import { loadPackaging, savePackaging, mergePackaging } from "./gates/render/youtube.mjs";
import { buildData, buildMessages } from "./gates/script/index.mjs";
import { buildCard, checkCard } from "./gates/render/publish.mjs";
import { validate, loadSchema } from "./schema/validate.mjs";
import { backupAll, backupProject, listBackups, restoreProject } from "./backup.mjs";

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "example-course-content-structure.json");
const TEXT = fs.readFileSync(FIXTURE, "utf8");
const doc = () => JSON.parse(TEXT);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "itv-course-"));
const videos = (dir) => fs.readdirSync(dir).filter((n) => fs.existsSync(path.join(dir, n, "project.json")));
const read = (dir, f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));

test("course: the example is read, lessons in playlist order, the outline block ignored", () => {
  const c = parseCourse(TEXT);
  assert.equal(c.course.title, "TEST Sourdough in a Weekend");
  assert.equal(c.course.slug, "test-sourdough-in-a-weekend");
  assert.deepEqual(c.lessons.map((l) => [l.id, l.position]), [["m1-l1", 1], ["m1-l2", 2], ["m2-l1", 3], ["m2-l2", 4]]);
  assert.deepEqual(c.playlist, { id: "PLxxxxxxxxxxxxxxxx", url: "https://www.youtube.com/playlist?list=PLxxxxxxxxxxxxxxxx" });
  assert.deepEqual(c.warnings, []);
  const { outline, ...rest } = doc();
  assert.deepEqual(parseCourse(JSON.stringify(rest)), c, "the same without the outline");
  assert.deepEqual(parseCourse(JSON.stringify({ ...doc(), outline: "anything", extra: { a: 1 } })), c, "unknown fields are ignored");
  assert.deepEqual(parseCourse("﻿" + TEXT), c, "a byte order mark is no problem");
});

test("course: a newer minor version is read, anything else is refused in plain words", () => {
  assert.equal(parseCourse(JSON.stringify({ ...doc(), schema_version: "1.7", lessons: doc().lessons.map((l) => ({ ...l, new_field: 1 })) })).lessons.length, 4);
  const refused = (change, rx) => assert.throws(() => parseCourse(typeof change === "string" ? change : JSON.stringify({ ...doc(), ...change })), rx);
  refused("", /nothing to read/);
  refused("{ not json", /not valid JSON/);
  refused("[1, 2]", /not a Course Content Structure/);
  refused({ type: "video-publishing-card/1" }, /not a Course Content Structure \(its type is "video-publishing-card\/1"\)/);
  refused({ type: "video-course-content-brief", schema_version: "1.0" }, /older Video Course Content Brief/);
  refused({ schema_version: "2.0" }, /version 2\.0\. This app reads version 1 only\. Update IdeaToVideo/);
  refused({ schema_version: 1.1 }, /does not say which version/);
  refused({ course: { ...doc().course, slug: "../outside" } }, /no usable course slug/);
  refused({ course: { ...doc().course, title: "" } }, /no course title/);
  refused({ lessons: [] }, /no lessons/);
  refused({ lessons: [doc().lessons[0], doc().lessons[0]] }, /same id \(m1-l1\)/);
  refused({ lessons: [{ ...doc().lessons[0], id: "a/b" }] }, /no usable id/);
});

test("course: a playlist link that is not a YouTube playlist is not shown; no playlist is fine", () => {
  assert.equal(parseCourse(JSON.stringify({ ...doc(), playlist: null })).playlist, null);
  const odd = parseCourse(JSON.stringify({ ...doc(), playlist: { id: "PLabc", url: "https://evil.example.com/playlist?list=PLabc" } }));
  assert.deepEqual(odd.playlist, { id: "PLabc", url: null });
  assert.match(odd.warnings.join(" "), /not a YouTube playlist address/);
  assert.equal(PLAYLIST_URL.test("https://www.youtube.com/playlist?list=PLabc&x=https://evil.example.com"), false);
});

test("course: the preview creates nothing", () => {
  const dir = tmp();
  const p = previewCourse({ projectsDir: dir, text: TEXT });
  assert.equal(p.course.title, "TEST Sourdough in a Weekend");
  assert.deepEqual(p.lessons.map((l) => [l.position, l.title, l.minutes, l.exists]), [
    [1, "What a ready starter looks like", 10, false],
    [2, "Mix the dough: touch one", 10, false],
    [3, "Fold and shape: touch two", 10, false],
    [4, "Score and bake: touch three", 10, false],
  ]);
  assert.equal(p.playlist.url, "https://www.youtube.com/playlist?list=PLxxxxxxxxxxxxxxxx");
  assert.deepEqual([p.newCount, p.existingCount], [4, 0]);
  assert.deepEqual(fs.readdirSync(dir), []);
  assert.deepEqual(previewCourse({ projectsDir: dir, file: FIXTURE }), p, "the file and the pasted text are read by the same parser");
  assert.throws(() => previewCourse({ projectsDir: dir, file: path.join(dir, "notes.txt") }), /ends in \.json/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("course: one prepared ONE Video per lesson, nothing started, the file kept unchanged", () => {
  const dir = tmp();
  const r = importCourse({ projectsDir: dir, file: FIXTURE, identity: "my-identity", language: "en" });
  assert.deepEqual([r.created, r.updated, r.unchanged, r.again], [4, 0, 0, false]);
  assert.equal(videos(dir).length, 4);
  const first = r.lessons[0].dir;
  const p = loadProject(first);
  assert.equal(p.title, "What a ready starter looks like");
  assert.equal(p.identity, "my-identity");
  assert.equal(p.autopilot, false);
  assert.equal(p.status, "Idea");
  assert.ok(GATES.every((g) => p.gates[g].state === "todo"), "no gate is started");
  assert.equal(p.render, undefined);
  assert.deepEqual(p.series, { courseSlug: "test-sourdough-in-a-weekend", courseTitle: "TEST Sourdough in a Weekend", lessonId: "m1-l1", playlistPosition: 1, playlistCount: 4, playlistId: "PLxxxxxxxxxxxxxxxx", playlistUrl: "https://www.youtube.com/playlist?list=PLxxxxxxxxxxxxxxxx" });
  const brief = read(first, "brief.json");
  assert.deepEqual(validate(brief, loadSchema("brief-card")), []);
  assert.equal(brief.keyword, "sourdough starter ready");
  assert.equal(brief.targetLengthMin, 10);
  assert.deepEqual(brief.playlist, { name: "TEST Sourdough in a Weekend", position: 1, of: 4, nextTitle: "Mix the dough: touch one" });
  const seed = readSeed(first);
  assert.equal(seed.hook, "Your loaf was flat for one reason, and it happened the day before you baked.");
  assert.deepEqual(seed.teach, { minutes: 4, points: ["The float test and why it works", "The three signs: bubbles, dome, smell"] });
  assert.deepEqual(seed.do, { minutes: 4, exercise: "Feed your starter and mark the jar with a rubber band." });
  assert.deepEqual(seed.review, { minutes: 2, check: "Did it double within 6 hours? If not, feed it again." });
  assert.equal(seed.closingLine, "Watch the next lesson to mix your dough.");
  const pack = loadPackaging(first);
  assert.equal(pack.title, "Is Your Sourdough Starter Ready? 3 Signs");
  assert.match(pack.summary, /^Three signs your starter is ready/);
  assert.equal(pack.chosen, true);
  // only what the import prepares is in the folder: no script, voice, scenes, video
  assert.deepEqual(fs.readdirSync(first).sort(), ["brief.json", "course-import.json", "log.txt", "packaging.json", "project.json", "seed.json"]);
  assert.equal(read(r.lessons[3].dir, "brief.json").playlist.nextTitle, undefined, "the last lesson has no next one");
  assert.ok(fs.readFileSync(r.file).equals(fs.readFileSync(FIXTURE)), "the kept file is the file that came, byte for byte");
  assert.equal(path.basename(r.file), "test-sourdough-in-a-weekend-course-content-structure.json");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("course: the script gets the seed, teach then do then review, the minutes as lengths", () => {
  const dir = tmp();
  const r = importCourse({ projectsDir: dir, text: TEXT });
  const first = r.lessons[0].dir;
  const data = buildData({ topic: "x", brief: read(first, "brief.json"), seed: readSeed(first) });
  assert.equal(data.targetLengthMin, 10);
  assert.equal(data.keyword, "sourdough starter ready");
  assert.deepEqual(Object.keys(data.lessonOutline), ["course", "hook", "teach", "do", "review", "closingLine"]);
  assert.equal(data.lessonOutline.teach.minutes, 4);
  assert.match(buildMessages(data)[1].content, /"exercise": "Feed your starter and mark the jar with a rubber band\."/);
  assert.equal(buildData({ topic: "x" }).lessonOutline, undefined, "a video of no course is written as before");
  assert.equal(buildData({ topic: "x", seed: { hook: "", teach: { points: [] } } }).lessonOutline, undefined);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("course: importing again updates what was not changed by hand, and never makes a second video", () => {
  const dir = tmp();
  const a = importCourse({ projectsDir: dir, text: TEXT });
  const same = importCourse({ projectsDir: dir, text: TEXT });
  assert.deepEqual([same.created, same.updated, same.unchanged, same.again], [0, 0, 4, true]);
  assert.equal(videos(dir).length, 4);

  const [l1, l2] = a.lessons.map((l) => l.dir);
  // by hand: lesson 1's YouTube title and hook, lesson 2's title
  savePackaging(l1, { title: "My own title", summary: loadPackaging(l1).summary, tags: ["bread"] });
  fs.writeFileSync(path.join(l1, "seed.json"), JSON.stringify({ ...readSeed(l1), hook: "My own hook." }));
  saveProject(l2, { ...loadProject(l2), title: "My name for lesson two" });

  const next = doc();
  next.lessons[0].keyword = "is my sourdough starter ready";
  next.lessons[0].hook = "A new hook from the course.";
  next.lessons[0].youtube.title = "A new YouTube title from the course";
  next.lessons[0].cta = "A new closing line.";
  next.lessons[1].title = "Mix the dough, renamed";
  next.lessons[1].teach.points.push("A third point");
  next.playlist = { id: "PLnew", url: "https://www.youtube.com/playlist?list=PLnew" };
  next.lessons.splice(2, 1); // m2-l1 leaves the course
  next.lessons[2].playlist_position = 3;
  next.lessons.push({ ...doc().lessons[0], id: "m2-l3", playlist_position: 4, title: "A brand new lesson" });

  const r = importCourse({ projectsDir: dir, text: JSON.stringify(next) });
  assert.deepEqual([r.created, r.updated, r.unchanged], [1, 3, 0]);
  assert.equal(videos(dir).length, 5, "four from before and the one new lesson");
  const by = Object.fromEntries(r.lessons.map((l) => [l.id, l]));
  assert.deepEqual(by["m1-l1"].updated.sort(), ["CTA", "keyword", "playlist"]);
  assert.deepEqual(by["m1-l1"].kept.sort(), ["YouTube title", "hook"]);
  assert.deepEqual(by["m1-l2"].kept, ["title"]);
  assert.ok(by["m1-l2"].updated.includes("script seed"));
  assert.equal(by["m2-l3"].action, "created");
  assert.deepEqual(r.gone.map((g) => g.id), ["m2-l1"]);

  assert.equal(read(l1, "brief.json").keyword, "is my sourdough starter ready");
  assert.equal(readSeed(l1).hook, "My own hook.");
  assert.equal(readSeed(l1).closingLine, "A new closing line.");
  assert.equal(loadPackaging(l1).title, "My own title");
  assert.deepEqual(loadPackaging(l1).tags, ["bread"]);
  assert.equal(loadProject(l1).series.playlistId, "PLnew");
  assert.equal(loadProject(l2).title, "My name for lesson two");
  assert.equal(read(l2, "brief.json").title, "Mix the dough, renamed", "the brief was not touched by hand, so it follows the course");
  assert.equal(readSeed(l2).teach.points.length, 3);
  assert.match(fs.readFileSync(path.join(l1, "log.txt"), "utf8"), /course: imported again, updated: .*; left alone \(changed by hand\): /);

  // what was left alone stays left alone on the next import too
  const again = importCourse({ projectsDir: dir, text: JSON.stringify(next) });
  assert.deepEqual([again.created, again.updated], [0, 0]);
  assert.equal(loadPackaging(l1).title, "My own title");
  assert.deepEqual(by["m1-l1"].scriptKept, undefined);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("course: a written script is never rewritten; the title the app set from the YouTube title is not a change by hand", () => {
  const dir = tmp();
  const a = importCourse({ projectsDir: dir, text: TEXT });
  const l1 = a.lessons[0].dir;
  // what "Write script" does: the script exists, the ONE Video takes the packaging title
  fs.writeFileSync(path.join(l1, "script.md"), "# Is Your Sourdough Starter Ready? 3 Signs\n\n## OPEN\n\nHello.\n");
  const p = loadProject(l1);
  saveProject(l1, { ...p, title: "Is Your Sourdough Starter Ready? 3 Signs", gates: { ...p.gates, script: { state: "pending" } } });
  const next = doc();
  next.lessons[0].youtube.title = "Starter Ready? The 3 Signs";
  next.lessons[0].hook = "A new hook.";
  const r = importCourse({ projectsDir: dir, text: JSON.stringify(next) });
  assert.deepEqual(r.lessons[0].updated.sort(), ["YouTube title", "hook"]);
  assert.deepEqual(r.lessons[0].kept, []);
  assert.equal(r.lessons[0].scriptKept, true);
  assert.equal(loadProject(l1).title, "Starter Ready? The 3 Signs");
  assert.equal(loadProject(l1).gates.script.state, "pending", "no gate is reset or started");
  assert.match(fs.readFileSync(path.join(l1, "script.md"), "utf8"), /^# Starter Ready\? The 3 Signs\n\n## OPEN\n\nHello\.\n$/, "only the title line follows the chosen title");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("course: the imported title and description stay when the AI makes the packaging; it adds the tags", () => {
  const dir = tmp();
  const l1 = importCourse({ projectsDir: dir, text: TEXT }).lessons[0].dir;
  const merged = mergePackaging(loadPackaging(l1), { titles: ["Idea one", "Idea two"], summary: "AI summary.", tags: ["sourdough", "starter"] });
  assert.equal(merged.title, "Is Your Sourdough Starter Ready? 3 Signs");
  assert.match(merged.summary, /^Three signs/);
  assert.deepEqual(merged.tags, ["sourdough", "starter"]);
  assert.deepEqual(merged.titles, ["Is Your Sourdough Starter Ready? 3 Signs", "Idea one", "Idea two"]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("course: the group lists every lesson with its video's status, and the file goes out unchanged", () => {
  const dir = tmp();
  assert.deepEqual(listCourses(dir), { courses: [] });
  const r = importCourse({ projectsDir: dir, text: TEXT });
  fs.rmSync(r.lessons[2].dir, { recursive: true, force: true }); // the user deleted one video
  const { courses } = listCourses(dir);
  assert.equal(courses.length, 1);
  assert.equal(courses[0].title, "TEST Sourdough in a Weekend");
  assert.equal(courses[0].playlist.url, "https://www.youtube.com/playlist?list=PLxxxxxxxxxxxxxxxx");
  assert.deepEqual(courses[0].lessons.map((l) => [l.position, l.id, l.status]), [[1, "m1-l1", "Idea"], [2, "m1-l2", "Idea"], [3, "m2-l1", null], [4, "m2-l2", "Idea"]]);
  const back = importCourse({ projectsDir: dir, text: TEXT });
  assert.deepEqual([back.created, back.unchanged], [1, 3], "the missing lesson is made again, the others are not doubled");
  const out = exportCourse({ projectsDir: dir, slug: "test-sourdough-in-a-weekend", file: path.join(dir, "out") }).file;
  assert.match(out, /out\.json$/);
  assert.equal(fs.readFileSync(out, "utf8"), TEXT, "pasted text is kept as it was pasted");
  assert.throws(() => exportCourse({ projectsDir: dir, slug: "../x", file: out }), /Choose a course/);
  assert.throws(() => exportCourse({ projectsDir: dir, slug: "no-such-course", file: out }), /not on this computer/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("card: the optional series block, only on a course lesson; a card without it is valid as before", () => {
  const dir = tmp();
  const l2 = importCourse({ projectsDir: dir, text: TEXT }).lessons[1].dir;
  const card = checkCard(buildCard(l2, path.join(l2, "out", "video-1.mp4"), { total: 48 }));
  assert.equal(card.schema, "video-publishing-card/1");
  assert.deepEqual(card.series, { courseSlug: "test-sourdough-in-a-weekend", lessonId: "m1-l2", playlistPosition: 2, playlistId: "PLxxxxxxxxxxxxxxxx", playlistUrl: "https://www.youtube.com/playlist?list=PLxxxxxxxxxxxxxxxx" });
  const { series, ...plain } = card;
  assert.deepEqual(validate(plain, loadSchema("video-publishing-card")), [], "no series block: valid exactly as today");
  // a course with no playlist yet: the id is null, the block is still there
  const none = tmp();
  const n1 = importCourse({ projectsDir: none, text: JSON.stringify({ ...doc(), playlist: null }) }).lessons[0].dir;
  assert.deepEqual(checkCard(buildCard(n1, path.join(n1, "out", "video-1.mp4"), { total: 48 })).series, { courseSlug: "test-sourdough-in-a-weekend", lessonId: "m1-l1", playlistPosition: 1, playlistId: null, playlistUrl: null });
  // the block is checked when it is there
  const bad = (s) => validate({ ...card, series: s }, loadSchema("video-publishing-card"));
  assert.match(bad({ courseSlug: "a", lessonId: "m1-l1", playlistPosition: 1 }).join(" "), /missing playlistId/);
  assert.match(bad({ courseSlug: "a", lessonId: "m1-l1", playlistPosition: 0, playlistId: null }).join(" "), /below 1/);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(none, { recursive: true, force: true });
});

test("backup: the course group and what the import prefilled go along, and come back with a lesson", () => {
  const root = tmp();
  const projectsRoot = path.join(root, "projects");
  const backups = path.join(root, "b");
  const dir = path.join(projectsRoot, "My Identity");
  fs.mkdirSync(dir, { recursive: true });
  const r = importCourse({ projectsDir: dir, file: FIXTURE });
  const slug = "test-sourdough-in-a-weekend";
  const kept = path.join(COURSES_FOLDER, slug, `${slug}-course-content-structure.json`);

  const all = backupAll({ backupRoot: backups, projectsRoot, folders: ["My Identity"], level: 1 });
  assert.deepEqual([all.projects, all.courses, all.failed.length], [4, 1, 0]);
  assert.ok(fs.readFileSync(path.join(backups, "My Identity", kept)).equals(fs.readFileSync(FIXTURE)), "the course file is in the backup, unchanged");
  assert.ok(fs.existsSync(path.join(backups, "My Identity", COURSES_FOLDER, slug, "course.json")));
  const list = listBackups({ backupRoot: backups, identityFolder: "My Identity", projectsDir: dir });
  assert.equal(list.length, 4, "the course folder is not offered as a video to restore");

  // the computer is new: nothing is here
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir);
  const first = list.find((b) => b.title === "What a ready starter looks like");
  const back = restoreProject({ backupRoot: backups, path: first.path, projectsDir: dir });
  assert.equal(back.course, true);
  assert.equal(loadProject(back.dir).series.lessonId, "m1-l1");
  assert.equal(readSeed(back.dir).hook, "Your loaf was flat for one reason, and it happened the day before you baked.");
  assert.equal(loadPackaging(back.dir).title, "Is Your Sourdough Starter Ready? 3 Signs");
  assert.ok(fs.existsSync(path.join(back.dir, "course-import.json")));
  assert.ok(fs.readFileSync(path.join(dir, kept)).equals(fs.readFileSync(FIXTURE)));
  const { courses } = listCourses(dir);
  assert.deepEqual(courses[0].lessons.map((l) => l.status), ["Idea", null, null, null], "the group is back; the other lessons are restored or imported again");
  const again = importCourse({ projectsDir: dir, file: FIXTURE });
  assert.deepEqual([again.created, again.unchanged, again.updated], [3, 1, 0], "the restored lesson is known, not doubled, and nothing in it reads as changed by hand");

  // one video's own backup (after an approval or a render) takes the group too
  const solo = path.join(root, "solo");
  backupProject({ projectDir: again.lessons[1].dir, backupRoot: solo, identityFolder: "My Identity", level: 1 });
  assert.ok(fs.existsSync(path.join(solo, "My Identity", kept)));
  assert.equal(r.lessons.length, 4);
  fs.rmSync(root, { recursive: true, force: true });
});
