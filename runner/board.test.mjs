// board.test.mjs: the Channels board and the Uploaded tick (DECISIONS 127).
// One imported course: done "X of N", the next video, Sent to Publishing
// kept on the ONE Video, the YouTube link read from every usual form.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { importCourse } from "./course/index.mjs";
import { channelBoard, youtubeVideoId, setUpload, markSent, isDone } from "./course/board.mjs";
import { loadProject, saveProject } from "./project.mjs";

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "example-course-content-structure.json");
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "itv-board-"));

function finish(dir) {
  const p = loadProject(dir);
  for (const g of ["script", "voice", "scenes", "review"]) p.gates[g] = { state: "approved" };
  p.gates.avatar = { state: "skipped" };
  p.render = { state: "done" };
  saveProject(dir, p);
}

test("board: an empty folder has no playlists", () => {
  assert.deepEqual(channelBoard(tmp()), { playlists: [] });
  assert.deepEqual(channelBoard(path.join(tmp(), "missing")), { playlists: [] });
});

test("board: done X of N, the next video, sent and uploaded", () => {
  const dir = tmp();
  const r = importCourse({ projectsDir: dir, file: FIXTURE });
  let b = channelBoard(dir).playlists[0];
  assert.equal(b.total, 4);
  assert.equal(b.done, 0);
  assert.equal(b.next, "m1-l1");
  assert.equal(b.videos[0].sentAt, null);

  const first = r.lessons[0].dir;
  finish(first);
  assert.ok(isDone(loadProject(first)));
  markSent(first, "0b7c8f1e-1111-4222-8333-944455556666", new Date("2026-10-23T10:00:00Z"));
  setUpload(first, { url: "https://youtu.be/dQw4w9WgXcQ?t=3", at: "2026-10-24" });

  b = channelBoard(dir).playlists[0];
  assert.equal(b.done, 1);
  assert.equal(b.uploaded, 1);
  assert.equal(b.next, "m1-l2", "the next video is the first one not done");
  assert.equal(b.videos[0].sentAt, "2026-10-23T10:00:00.000Z");
  assert.deepEqual(b.videos[0].upload, { at: "2026-10-24T12:00:00.000Z", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", videoId: "dQw4w9WgXcQ" });

  setUpload(first, { clear: true });
  assert.equal(channelBoard(dir).playlists[0].uploaded, 0);
  assert.equal(loadProject(first).upload, undefined);
});

test("board: the YouTube link in its usual forms, anything else refused", () => {
  const id = "dQw4w9WgXcQ";
  for (const u of [id, `https://www.youtube.com/watch?v=${id}`, `https://m.youtube.com/watch?v=${id}&list=PLx`, `https://youtu.be/${id}`, `https://www.youtube.com/shorts/${id}`, `https://www.youtube.com/live/${id}`, `https://studio.youtube.com/video/${id}/edit`]) {
    assert.equal(youtubeVideoId(u), id, u);
  }
  for (const u of ["", "hello", "https://vimeo.com/123", `https://evil.example/watch?v=${id}`, "https://www.youtube.com/watch?v=short", "javascript:alert(1)"]) {
    assert.equal(youtubeVideoId(u), null, u);
  }
  const dir = tmp();
  const r = importCourse({ projectsDir: dir, file: FIXTURE });
  assert.throws(() => setUpload(r.lessons[0].dir, { url: "https://vimeo.com/1" }), /YouTube/);
});
