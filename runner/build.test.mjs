import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { prepareBuild } from "./gates/build/index.mjs";
import { stamp } from "./gates/render/index.mjs";

test("build input: the scene list gets the project's mix next to index.html", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "itv-build-"));
  assert.throws(() => prepareBuild(dir), /no scene table/);
  fs.writeFileSync(path.join(dir, "scenes.json"), JSON.stringify({ title: "T", audio: "somewhere/else.mp3", scenes: [{ block: "statement", sent: "S1" }] }));
  assert.throws(() => prepareBuild(dir), /no approved voice/);
  fs.mkdirSync(path.join(dir, "audio"));
  fs.writeFileSync(path.join(dir, "audio", "vo_bgm.mp3"), "mp3");
  fs.mkdirSync(path.join(dir, "build"));
  fs.writeFileSync(path.join(dir, "build", "stale.html"), "old");
  const { out, planFile } = prepareBuild(dir);
  assert.equal(fs.readFileSync(path.join(out, "vo_bgm.mp3"), "utf8"), "mp3");
  assert.equal(JSON.parse(fs.readFileSync(planFile, "utf8")).audio, "vo_bgm.mp3");
  assert.ok(!fs.existsSync(path.join(out, "stale.html")), "a rebuild starts clean");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("render names are new every time and sortable", () => {
  assert.equal(stamp(new Date("2026-09-30T16:45:12Z")), "20260930-1645");
});
