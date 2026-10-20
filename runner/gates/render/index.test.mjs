import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { renderVideo } from "./index.mjs";

// DECISIONS 126: hyperframes 0.8.181 opens a temporary folder next to the
// output file, so the render writes into a short folder of its own and the
// MP4 is copied into out/. A project path of about 260 characters renders.
function longProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "itv-long-"));
  let dir = root;
  while (dir.length < 250) dir = path.join(dir, "a-rather-long-folder-name");
  dir = path.join(dir, "x".repeat(Math.max(1, 260 - dir.length - 1)));
  fs.mkdirSync(path.join(dir, "build"), { recursive: true });
  fs.writeFileSync(path.join(dir, "build", "index.html"), "<html></html>");
  return { root, dir };
}

const shell = async () => ({ source: "managed", path: "shell.exe" });

test("a render on a ~260 character project path lands in out/ and leaves no temp folder", async () => {
  const { root, dir } = longProject();
  assert.ok(dir.length >= 258, String(dir.length));
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "itv-r-test-"));
  let output = null;
  const run = async (args) => {
    output = args[args.indexOf("-o") + 1];
    fs.writeFileSync(output, "mp4");
    return { code: 0, tail: "Render complete" };
  };
  const r = await renderVideo(dir, { env: { ITV_RENDER_TMP: tmpRoot }, run, browserFor: shell, measure: async () => 1.5 });
  assert.ok(output.startsWith(tmpRoot), output);
  assert.ok(output.length < 120, output);
  assert.equal(path.dirname(r.file), path.join(dir, "out"));
  assert.equal(fs.readFileSync(r.file, "utf8"), "mp4");
  assert.deepEqual(fs.readdirSync(tmpRoot), []);
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

test("a failed render cleans its temp folder too", async () => {
  const { root, dir } = longProject();
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "itv-r-test-"));
  const run = async (args) => {
    fs.writeFileSync(path.join(path.dirname(args[args.indexOf("-o") + 1]), "partial"), "");
    return { code: 1, tail: "boom" };
  };
  await assert.rejects(renderVideo(dir, { env: { ITV_RENDER_TMP: tmpRoot }, run, browserFor: shell, measure: async () => 0 }), /The render failed/);
  assert.deepEqual(fs.readdirSync(tmpRoot), []);
  assert.deepEqual(fs.readdirSync(path.join(dir, "out")), []);
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

test("the render asks for the shell and shows the download in words", async () => {
  const { root, dir } = longProject();
  const steps = [];
  const browserFor = async ({ onProgress }) => {
    onProgress({ step: "browser", percent: 40 });
    return { source: "managed", path: "shell.exe" };
  };
  const run = async (args) => {
    fs.writeFileSync(args[args.indexOf("-o") + 1], "mp4");
    return { code: 0, tail: "" };
  };
  await renderVideo(dir, { env: {}, run, browserFor, measure: async () => 1, onProgress: (p) => steps.push(p) });
  assert.deepEqual(steps[0], { step: "browser", message: "Downloading the render browser" });
  fs.rmSync(root, { recursive: true, force: true });
});
