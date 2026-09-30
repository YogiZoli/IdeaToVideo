import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { prepareBuild } from "./gates/build/index.mjs";
import { stamp } from "./gates/render/index.mjs";

test("build folder: clean, with the approved mix and a local GSAP", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "itv-build-"));
  const eng = path.join(dir, "engine", "node_modules", "gsap", "dist");
  fs.mkdirSync(eng, { recursive: true });
  fs.writeFileSync(path.join(eng, "gsap.min.js"), "gsap");
  const env = { ITV_ENGINE_DIR: path.join(dir, "engine") };
  assert.throws(() => prepareBuild(dir, { env }), /no approved voice/);
  fs.mkdirSync(path.join(dir, "audio"));
  fs.writeFileSync(path.join(dir, "audio", "vo_bgm.mp3"), "mp3");
  fs.mkdirSync(path.join(dir, "build"));
  fs.writeFileSync(path.join(dir, "build", "stale.html"), "old");
  const { out } = prepareBuild(dir, { env });
  assert.equal(fs.readFileSync(path.join(out, "vo_bgm.mp3"), "utf8"), "mp3");
  assert.equal(fs.readFileSync(path.join(out, "gsap.min.js"), "utf8"), "gsap");
  assert.ok(!fs.existsSync(path.join(out, "stale.html")), "a rebuild starts clean");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("render names are new every time and sortable", () => {
  assert.equal(stamp(new Date(2026, 8, 30, 16, 45, 12)), "20260930-1645");
});
