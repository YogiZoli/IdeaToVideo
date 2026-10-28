import "./fixtures/test-catalog.mjs"; // the scene catalog fixture, before any scene module
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { prepareBuild, readCheckReport, savedCheckReport } from "./gates/build/index.mjs";
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

// 2026-10-26: "hyperframes check gave no readable report" although the report
// was there. A newer engine adds "_meta" (version, update notice), and
// anything printed before the report must not stop it from being read.
test("check report: read past notices, with the engine's _meta block", () => {
  const report = { ok: true, lint: { findings: [] }, _meta: { version: "0.8.181", latestVersion: "0.8.201", updateAvailable: true } };
  const stdout = `Checking {3 scenes}\nwarning: {odd} line\n${JSON.stringify(report, null, 2)}\n`;
  assert.deepEqual(readCheckReport(stdout), report);
  assert.equal(readCheckReport("no report here"), null);
  assert.equal(readCheckReport('{\n  "ok": tr'), null);
});

test("check report: the engine's saved copy when the output is unreadable", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "itv-check-"));
  assert.equal(savedCheckReport(out), null);
  const dir = path.join(out, ".hyperframes", "artifacts", "checks");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "a.json"), JSON.stringify({ ok: true, layout: { findings: [] } }));
  assert.deepEqual(savedCheckReport(out, Date.now() - 1000), { ok: true, layout: { findings: [] } });
  assert.equal(savedCheckReport(out, Date.now() + 60000), null);
  fs.rmSync(out, { recursive: true, force: true });
});
