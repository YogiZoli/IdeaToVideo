import "./fixtures/test-catalog.mjs"; // the scene catalog fixture, before any scene module
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { landedTimes, mountsOf, tileFilter, stillsOf } from "./gates/review/index.mjs";
import { createProject, loadProject, saveProject, setGate } from "./project.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

test("the contact sheet takes each scene just before it ends", () => {
  const html = '<div id="scene-1" class="clip" data-composition-id="a" data-composition-src="x" data-start="0" data-duration="4.3"></div>\n<div id="scene-2" class="clip" data-composition-id="b" data-composition-src="y" data-start="4.3" data-duration="0.3"></div>';
  const mounts = mountsOf(html);
  assert.deepEqual(mounts, [{ n: 1, start: 0, duration: 4.3 }, { n: 2, start: 4.3, duration: 0.3 }]);
  assert.deepEqual(landedTimes(mounts), [4.1, 4.45], "a very short scene: its middle, never before");
});

test("the sheet grid has 5 columns and as many rows as needed", () => {
  assert.match(tileFilter(15), /tile=5x3/);
  assert.match(tileFilter(16), /tile=5x4/);
  assert.match(tileFilter(3), /tile=3x1/);
});

test("build-video and render-video wait for the gate before them", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "itv-review-"));
  const { dir: proj } = createProject({ projectsDir: dir, title: "Test" });
  const run = (cmd) => {
    const r = spawnSync(process.execPath, [path.join(here, "main.mjs"), cmd], { input: JSON.stringify({ projectDir: proj }), encoding: "utf8" });
    return JSON.parse(r.stdout.trim().split("\n").at(-1));
  };
  assert.match(run("build-video").message, /Approve the scene table first/);
  assert.match(run("render-video").message, /Approve the preview first/);
  saveProject(proj, setGate(loadProject(proj), "review", { state: "pending" }));
  assert.match(run("render-video").message, /Approve the preview first/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("the stills in scene order, with their moment", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "itv-stills-"));
  assert.deepEqual(stillsOf(dir), []);
  const shots = path.join(dir, "review", "snapshots");
  fs.mkdirSync(shots, { recursive: true });
  for (const f of ["frame-10-at-40.2s.png", "frame-02-at-9.36s.png", "frame-00-at-3.89s.png", "contact-sheet.jpg", "list.txt"]) fs.writeFileSync(path.join(shots, f), "");
  assert.deepEqual(stillsOf(dir).map((s) => [s.scene, s.at]), [[1, 3.89], [2, 9.36], [3, 40.2]]);
  fs.rmSync(dir, { recursive: true, force: true });
});
