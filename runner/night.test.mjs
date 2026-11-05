// night.test.mjs: the Night shift's files and its list (DECISIONS 182).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { nightCandidates, loadShift, saveShift, clearShift, prepareForNight, NIGHT_FILE } from "./channels/night.mjs";
import { createProject, loadProject, saveProject } from "./project.mjs";
import { saveRecipe, defaultRecipe } from "./channels/recipe.mjs";
import { newShift, nextItem, counts, morningLine, WAITS } from "../app/src/lib/night.ts";

const folder = () => fs.mkdtempSync(path.join(os.tmpdir(), "itv \u00e9jszaka "));

test("night shift: the videos left, a playlist in its order first, a finished one left out", () => {
  const root = folder();
  const make = (title, more = {}) => {
    const { dir } = createProject({ projectsDir: root, title, language: "en", identity: "x" });
    saveProject(dir, { ...loadProject(dir), ...more });
    return dir;
  };
  make("Lone video");
  make("Lesson two", { series: { courseSlug: "bread", courseTitle: "Bread", lessonId: "b", playlistPosition: 2 } });
  make("Lesson one", { series: { courseSlug: "bread", courseTitle: "Bread", lessonId: "a", playlistPosition: 1 } });
  make("Queued", { queue: { batch: "2026-11-05T10:00", position: 1, of: 7 } });
  const done = make("Finished");
  const p = loadProject(done);
  saveProject(done, { ...p, render: { state: "done" }, gates: { ...p.gates, review: { state: "approved" } } });
  fs.writeFileSync(path.join(root, NIGHT_FILE), "{}");
  const { groups } = nightCandidates(root);
  assert.deepEqual(groups.map((g) => g.title), ["Playlist: Bread", "Week batch 2026-11-05", "Other videos"]);
  assert.deepEqual(groups[0].videos.map((v) => v.title), ["Lesson one", "Lesson two"]);
  assert.deepEqual(groups[2].videos.map((v) => v.title), ["Lone video"]);
  fs.rmSync(root, { recursive: true, force: true });
});

test("night shift: its file comes back, a damaged one is no shift, and it can be cleared", () => {
  const root = folder();
  assert.equal(loadShift(root), null);
  const s = newShift([{ dir: "a", title: "A" }], "2026-11-05T22:00:00.000Z");
  saveShift(root, s);
  assert.deepEqual(loadShift(root), s);
  fs.writeFileSync(path.join(root, NIGHT_FILE), "{ broken");
  assert.equal(loadShift(root), null);
  clearShift(root);
  assert.ok(!fs.existsSync(path.join(root, NIGHT_FILE)));
  fs.rmSync(root, { recursive: true, force: true });
});

test("night shift: a lesson with no recipe takes its Identity's, a video with one keeps it", () => {
  const root = folder();
  const identity = folder();
  saveRecipe(identity, defaultRecipe({}), { language: "en" });
  const { dir } = createProject({ projectsDir: root, title: "Lesson", language: "en", identity: "x" });
  assert.ok(!loadProject(dir).recipe);
  const { recipe } = prepareForNight(dir, identity);
  assert.equal(recipe.engine, "script");
  assert.equal(loadProject(dir).recipe.engine, "script");
  const marked = { ...loadProject(dir).recipe, targetLengthMin: 99 };
  saveProject(dir, { ...loadProject(dir), recipe: marked });
  assert.equal(prepareForNight(dir, identity).recipe.targetLengthMin, 99);
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(identity, { recursive: true, force: true });
});

test("night shift: after a restart the video at work goes first, and the morning line counts them", () => {
  const s = newShift([{ dir: "a", title: "A" }, { dir: "b", title: "B" }, { dir: "c", title: "C" }, { dir: "d", title: "D" }]);
  assert.equal(nextItem(s).dir, "a");
  s.items[0].status = "ready";
  s.items[2].status = "running";
  assert.equal(nextItem(s).dir, "c", "the one cut off, before the next in line");
  s.items[1].status = "failed";
  s.items[2].status = "waiting";
  assert.equal(nextItem(s).dir, "d");
  assert.deepEqual(counts(s), { total: 4, ready: 1, waiting: 1, failed: 1, left: 1, done: 3 });
  assert.equal(morningLine(s), "1 ready to watch, 1 waiting for you, 1 failed, 1 not made.");
  s.items[3].status = "ready";
  assert.equal(nextItem(s), null);
  for (const w of Object.values(WAITS)) assert.ok(w.reason.endsWith("."));
});

test("the night shift never spends HeyGen credits, never publishes, and approves the avatar with nothing", () => {
  const src = fs.readFileSync(new URL("../app/src/lib/night.svelte.ts", import.meta.url), "utf8");
  assert.match(src, /approveAvatar: async \(\) => "wait"/);
  for (const never of ["make-avatar", "card-send", "broll-auto-order", "publish"]) assert.ok(!src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n").includes(`"${never}`), never);
});
