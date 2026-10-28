// footage.test.mjs: the Identity's own footage as B-roll (DECISIONS 82): the
// library (cuts, stills, limits), the piece each video takes (from a cut,
// least used first), the planner's check, the build plan.

import "./fixtures/test-catalog.mjs"; // the scene catalog fixture, before any scene module
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { addClip, loadLibrary, removeClip, updateClip, setMode, choosePiece, markPieces, catalogForPlanner, footageDir } from "./footage/library.mjs";
import { footageIssues } from "./gates/scenes/index.mjs";
import { footagePlan, footageVideo } from "./gates/build/assemble.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const ffdir = path.join(here, "..", "app", "src-tauri", "ffmpeg");
const exe = process.platform === "win32" ? ".exe" : "";
const env = { ...process.env, HYPERFRAMES_FFMPEG_PATH: path.join(ffdir, "ffmpeg" + exe), HYPERFRAMES_FFPROBE_PATH: path.join(ffdir, "ffprobe" + exe) };
const haveFf = fs.existsSync(env.HYPERFRAMES_FFMPEG_PATH);

// A clip of three shots: black, white, black, 4 s each (a clear cut each time).
function threeShots(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const r = spawnSync(env.HYPERFRAMES_FFMPEG_PATH, ["-y", "-v", "error", "-f", "lavfi", "-i", "color=black:size=320x180:rate=15:duration=4", "-f", "lavfi", "-i", "color=white:size=320x180:rate=15:duration=4", "-f", "lavfi", "-i", "color=black:size=320x180:rate=15:duration=4", "-filter_complex", "[0][1][2]concat=n=3:v=1:a=0", "-c:v", "libx264", "-pix_fmt", "yuv420p", file]);
  assert.equal(r.status, 0, String(r.stderr));
}

test("the library: a clip gets its cuts and stills, a description, a mode", { skip: !haveFf && "bundled ffmpeg not fetched" }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "itv-foot-"));
  threeShots(path.join(footageDir(dir), "incoming-1office walk.mp4"));
  const clip = await addClip({ identityDir: dir, file: "incoming-1office walk.mp4", env });
  assert.equal(clip.name, "office walk", "named after the file");
  assert.ok(Math.abs(clip.seconds - 12) < 0.2);
  assert.deepEqual(clip.shots.map((s) => Math.round(s)), [0, 4, 8], "the cuts between the shots");
  assert.equal(clip.stills.length, 3);
  assert.deepEqual(catalogForPlanner(loadLibrary(dir)), [], "no description: the planner does not see it");
  updateClip(dir, clip.id, { description: "  A person walks through a bright office.  " });
  assert.deepEqual(catalogForPlanner(loadLibrary(dir)), [{ id: clip.id, about: "A person walks through a bright office.", seconds: clip.seconds }]);
  assert.equal(loadLibrary(dir).mode, "scene", "its own scene by default (Zoltan, B2)");
  setMode(dir, "background");
  assert.equal(loadLibrary(dir).mode, "background");
  assert.throws(() => setMode(dir, "corner"), /Unknown footage mode/);
  fs.writeFileSync(path.join(footageDir(dir), "incoming-2.txt"), "x");
  await assert.rejects(addClip({ identityDir: dir, file: "incoming-2.txt", env }), /must be a video/);
  removeClip(dir, clip.id);
  assert.equal(loadLibrary(dir).clips.length, 0);
  assert.equal(fs.readdirSync(footageDir(dir)).filter((f) => f !== "footage.json").length, 0, "the file and its stills go too");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("each video takes the piece used least, from the start of a shot", () => {
  const clip = { id: "c1", seconds: 90, shots: [0, 12.5, 31, 47.2, 70], used: [] };
  const a = choosePiece(clip, 6, { project: "v1" });
  assert.deepEqual(a, { start: 0, end: 6, loop: false });
  clip.used = [{ project: "v1", start: 0, end: 6 }];
  const b = choosePiece(clip, 6, { project: "v2" });
  assert.equal(b.start, 6, "the next free piece, not the one v1 used");
  assert.deepEqual(choosePiece(clip, 6, { project: "v1" }), a, "a rebuild of v1 keeps its own piece");
  clip.used = [{ project: "v1", start: 0, end: 30 }, { project: "v2", start: 30, end: 60 }];
  assert.ok(choosePiece(clip, 6, { project: "v3" }).start >= 60, "a new video goes where nobody was");
  assert.deepEqual(choosePiece({ id: "s", seconds: 4, shots: [0], used: [] }, 6), { start: 0, end: 4, loop: true }, "a short clip loops");
});

test("the planner's footage: known clips, in order, never under a comment call", () => {
  const sentences = ["S1", "S2", "S3", "S4"].map((id, i) => ({ id, start: i * 3, end: i * 3 + 2.5 }));
  const clips = [{ id: "c1", about: "office", seconds: 30 }];
  assert.deepEqual(footageIssues([{ from: "S1", to: "S2", clip: "c1" }], { sentences, clips }), []);
  assert.match(footageIssues([{ from: "S1", clip: "zz" }], { sentences, clips }).join(), /unknown clip zz/);
  assert.match(footageIssues([{ from: "S2", clip: "c1" }, { from: "S2", clip: "c1" }], { sentences, clips }).join(), /overlaps/);
  assert.match(footageIssues([{ from: "S3", clip: "c1" }], { sentences, clips, calls: new Map([["S3", {}]]) }).join(), /S3 is a comment call/);
  assert.match(footageIssues([{ from: "S1", clip: "c1" }], { sentences, clips: [] }).join(), /no footage/);
  assert.deepEqual(footageIssues(undefined, { sentences, clips }), []);
});

test("the build plan: from the first sentence to the next one, the piece from the library", () => {
  const sentences = [
    { id: "S1", start: 0, end: 3 },
    { id: "S2", start: 3.4, end: 6 },
    { id: "S3", start: 30, end: 33 },
  ];
  const lib = { dir: "/lib", mode: "scene", clips: [{ id: "c1", file: "c1.mp4", seconds: 60, shots: [0, 20], used: [] }] };
  const plan = footagePlan({ footage: [{ from: "S1", clip: "c1" }, { from: "S2", clip: "c1" }] }, sentences, lib, "v1");
  assert.deepEqual(plan.map((f) => [f.start, f.end]), [[0, 3.4], [3.4, 6.6]], "the second stops 0.6 s after its last word: a segment after it is not footage time");
  assert.match(footageVideo({ ...plan[0], n: 1, file: "footage/f-1.mp4" }, "scene"), /muted data-volume="0".*z-index:4/);
  assert.match(footageVideo({ ...plan[0], n: 1, file: "footage/f-1.mp4" }, "background"), /z-index:0[\s\S]*footage-veil-1/);
});

test("used pieces are remembered per video", { skip: !haveFf && "bundled ffmpeg not fetched" }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "itv-foot-"));
  threeShots(path.join(footageDir(dir), "incoming-9.mp4"));
  const clip = await addClip({ identityDir: dir, file: "incoming-9.mp4", env });
  markPieces(dir, "v1", [{ clip: clip.id, start: 0, end: 4 }]);
  markPieces(dir, "v1", [{ clip: clip.id, start: 4, end: 8 }]);
  assert.deepEqual(loadLibrary(dir).clips[0].used.map((u) => [u.project, u.start, u.end]), [["v1", 4, 8]], "a rebuild replaces, it does not add");
  fs.rmSync(dir, { recursive: true, force: true });
});
