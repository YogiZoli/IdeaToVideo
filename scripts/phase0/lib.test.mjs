import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cleanEnv, parseArgs, sttFromWords, diffSentences, dirSize, findNativeAddons } from "./lib.mjs";

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
