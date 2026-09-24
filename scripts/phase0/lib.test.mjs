import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cleanEnv, parseArgs, sttFromWords, diffSentences, dirSize, findNativeAddons, quickCut, clipSegments } from "./lib.mjs";

test("cleanEnv on Windows isolates the profile and hides the caller's PATH", () => {
  const env = cleanEnv({
    work: "D:\\w",
    nodeDir: "C:\\node",
    ffmpeg: "C:\\ff\\ffmpeg.exe",
    ffprobe: "C:\\ff\\ffprobe.exe",
    platform: "win32",
    base: { SystemRoot: "C:\\Windows", PATH: "C:\\ff;C:\\git", GEMINI_API_KEY: "secret" },
  });
  assert.equal(env.USERPROFILE, path.join("D:\\w", "home"));
  assert.equal(env.LOCALAPPDATA, path.join("D:\\w", "home", "AppData", "Local"));
  assert.ok(!env.PATH.includes("C:\\ff"), "ffmpeg only via env var");
  assert.ok(!env.PATH.includes("git"));
  assert.ok(env.PATH.startsWith("C:\\node"));
  assert.equal(env.FFMPEG_PATH, "C:\\ff\\ffmpeg.exe");
  assert.equal(env.HYPERFRAMES_FFPROBE_PATH, "C:\\ff\\ffprobe.exe");
  assert.equal(env.HYPERFRAMES_NO_TELEMETRY, "1");
  assert.equal(env.GEMINI_API_KEY, undefined, "no caller variable leaks through");
  assert.equal(env.HYPERFRAMES_BROWSER_PATH, undefined);
});

test("cleanEnv on macOS and the browser override", () => {
  const env = cleanEnv({ work: "/w", nodeDir: "/opt/node/bin", ffmpeg: "/x/ffmpeg", ffprobe: "/x/ffprobe", browser: "/Apps/Chrome", platform: "darwin", base: {} });
  assert.equal(env.HOME, path.join("/w", "home"));
  assert.equal(env.PATH, "/opt/node/bin:/usr/bin:/bin");
  assert.equal(env.HYPERFRAMES_BROWSER_PATH, "/Apps/Chrome");
});

test("parseArgs: case-insensitive flags, switches, defaults, unknown flag", () => {
  const spec = { project: { type: "string" }, reuse: { type: "switch", default: false }, tag: { type: "string", default: "shell" } };
  assert.deepEqual(parseArgs(["--Project", "p", "--reuse"], spec), { project: "p", reuse: true, tag: "shell" });
  assert.throws(() => parseArgs(["--nope"], spec), /Unknown option/);
  assert.throws(() => parseArgs(["--project"], spec), /Missing value/);
});

test("sttFromWords gives the shape sentences.mjs reads", () => {
  assert.deepEqual(sttFromWords([{ text: "Hi", start: "0.1", end: 0.3 }]), { words: [{ text: "Hi", start: 0.1, end: 0.3, type: "word" }] });
});

test("diffSentences reports count and field differences", () => {
  const e = [{ id: "S1", start: 0, end: 1, text: "A." }, { id: "S2", start: 1, end: 2, text: "B." }];
  assert.deepEqual(diffSentences(e, e), []);
  const d = diffSentences([{ id: "S1", start: 0, end: 1.5, text: "A." }], e);
  assert.deepEqual(d, ["count 1 vs 2", "S1.end: 1.5 vs 1"]);
});

test("quickCut keeps whole scenes up to the target length", () => {
  const sentences = [
    { id: "S1", start: 0.1, end: 1.8 },
    { id: "S2", start: 2.2, end: 5.6 },
    { id: "S3", start: 5.9, end: 8.7 },
    { id: "S4", start: 9.0, end: 14.5 },
    { id: "S5", start: 15.3, end: 17.2 },
    { id: "S6", start: 17.9, end: 21.1 },
  ];
  const scenes = [{ sent: "S1" }, { sent: "S2-S3" }, { sent: "S4" }, { sent: "S5" }, { sent: "S6#1/2" }, { sent: "S6#2/2" }];
  assert.deepEqual(quickCut(scenes, sentences, 18), { count: 4, audioEnd: 17.9 });
  assert.deepEqual(quickCut(scenes, sentences, 12), { count: 2, audioEnd: 9.0 }, "closest boundary wins");
  assert.deepEqual(quickCut(scenes, sentences, 1), { count: 1, audioEnd: 2.2 });
  assert.deepEqual(quickCut(scenes, sentences, 99), { count: 6, audioEnd: 21.1 });
  // never between the two halves of a split sentence
  const split = [{ sent: "S1" }, { sent: "S4#1/2" }, { sent: "S4#2/2" }, { sent: "S6" }];
  assert.deepEqual(quickCut(split, sentences, 12), { count: 1, audioEnd: 9.0 });
  assert.throws(() => quickCut([{ sent: "S1" }, { sent: "S9" }], sentences, 18), /S9 not in the table/);
});

test("clipSegments drops late avatar segments and clamps the rest", () => {
  assert.equal(clipSegments("a.webm=0:6,b.webm=62.8:71.3", 17.9), "a.webm=0:6");
  assert.equal(clipSegments("a.webm=0:20,b.webm=10", 17.9), "a.webm=0:17.9,b.webm=10:17.9");
  assert.equal(clipSegments("b.webm=62.8:71.3", 17.9), "");
});

test("dirSize and findNativeAddons walk a tree", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pvc-lib-"));
  fs.mkdirSync(path.join(root, "a", "b"), { recursive: true });
  fs.writeFileSync(path.join(root, "a", "x.txt"), "12345");
  fs.writeFileSync(path.join(root, "a", "b", "sharp.node"), "123");
  assert.equal(dirSize(root), 8);
  assert.deepEqual(findNativeAddons(root), ["a/b/sharp.node"]);
  assert.equal(dirSize(path.join(root, "missing")), 0);
  fs.rmSync(root, { recursive: true, force: true });
});
