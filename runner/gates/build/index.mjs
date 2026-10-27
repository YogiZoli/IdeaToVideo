// gates/build: build/ is the project's HyperFrames project (index.html,
// compositions, audio, gsap.min.js). assemble.mjs writes it from the scene
// table; here are the parts around it: preparing the folder, and lint + check
// (0 errors is the condition, no gate).

import fs from "node:fs";
import path from "node:path";
import { engineDir, runHyperframes, resolveBrowser } from "../../tools.mjs";
import { landedTimes, mountsOf, withoutCameraPage } from "../review/index.mjs";

export const buildDir = (projectDir) => path.join(projectDir, "build");

// A clean build/ with the approved mix and the local GSAP next to index.html.
export function prepareBuild(projectDir, { env = process.env } = {}) {
  const mixFile = path.join(projectDir, "audio", "vo_bgm.mp3");
  if (!fs.existsSync(mixFile)) throw new Error("There is no approved voice yet.");
  const out = buildDir(projectDir);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  fs.copyFileSync(mixFile, path.join(out, "vo_bgm.mp3"));
  const gsap = path.join(engineDir(env), "node_modules", "gsap", "dist", "gsap.min.js");
  if (fs.existsSync(gsap)) fs.copyFileSync(gsap, path.join(out, "gsap.min.js"));
  return { out };
}

// The scene changes of a build with a Motion profile (assemble.mjs writes
// them): [{ at, seconds, type }]. None for a build without one.
export const TRANSITIONS_FILE = "transitions.json";
export function transitionWindows(out) {
  const f = path.join(out, TRANSITIONS_FILE);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : [];
}

// The CTA segments of a build (assemble.mjs writes them): [{ at, seconds }].
// A full-frame clip hides the scene under it, so nothing the check sees in
// that scene there is on screen (DECISIONS 78).
export const COVERED_FILE = "covered.json";
export function coveredWindows(out) {
  const f = path.join(out, COVERED_FILE);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : [];
}

// The errors of a `hyperframes check --json` report that count. During a
// scene change two scenes are on screen on purpose (a shader transition keeps
// both fully visible while the engine blends them), so a layout finding seen
// only inside a change window is not a problem of either scene.
const LAYERING = new Set(["content_overlap", "text_occluded"]);
export function countedErrors(report, windows = [], covered = []) {
  const within = (list) => (f) => {
    const from = f.firstSeen ?? f.time;
    const to = f.lastSeen ?? f.time;
    return typeof from === "number" && list.some((w) => from >= w.at - 0.01 && to <= w.at + w.seconds + 0.05);
  };
  const inside = within(windows);
  const hidden = within(covered);
  const errors = [];
  for (const section of ["lint", "runtime", "layout", "motion", "contrast"]) {
    for (const f of report?.[section]?.findings ?? []) {
      if (f.severity !== "error") continue;
      if (section === "layout" && LAYERING.has(f.code) && inside(f)) continue;
      if (["layout", "contrast", "motion"].includes(section) && hidden(f) && !/segment-/.test(f.selector ?? "")) continue;
      errors.push({ section, ...f });
    }
  }
  return errors;
}

// "Scene 9: " for a finding inside a scene's file, so the user knows which
// row of the scene table to change (Zoltan, 2026-10-06: the message only
// named a CSS class).
export function sceneOf(finding) {
  const m = /(?:^|\/)scene-(\d+)-/.exec(String(finding?.sourceFile ?? "").replace(/\\/g, "/"));
  return m ? `Scene ${m[1]}: ` : "";
}

const lastLines = (tail) => tail.split("\n").slice(-6).join(" ");

// The report of `hyperframes check --json` from its standard output. Anything
// the engine prints before it (a notice, a warning with a brace in it) is
// skipped: the report is the first object, starting a line, that reads whole
// to the end. Newer engines add a "_meta" block (version, update notice);
// it is ignored. null when there is none.
export function readCheckReport(stdout) {
  const text = String(stdout).trim();
  for (let i = text.indexOf("{"); i !== -1; i = text.indexOf("{", i + 1)) {
    if (i > 0 && text[i - 1] !== "\n") continue;
    try {
      const report = JSON.parse(text.slice(i));
      if (report && typeof report === "object" && !Array.isArray(report)) return report;
    } catch {
      // not this one
    }
  }
  return null;
}

// The copy the engine saves of every check (build/.hyperframes/artifacts/
// checks/<id>.json): the newest one written since `since`, else null.
export function savedCheckReport(out, since = 0) {
  const dir = path.join(out, ".hyperframes", "artifacts", "checks");
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ f: path.join(dir, f), t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .filter((x) => x.t >= since - 2000)
    .sort((a, b) => b.t - a.t);
  for (const { f } of files) {
    try {
      return JSON.parse(fs.readFileSync(f, "utf8"));
    } catch {
      // try the next one
    }
  }
  return null;
}

export async function lintAndCheck(projectDir, { env = process.env, onProgress = () => {} } = {}) {
  const out = buildDir(projectDir);
  if (!fs.existsSync(path.join(out, "index.html"))) throw new Error("Nothing to check yet: build the video first.");
  const browser = resolveBrowser(env);
  if (!browser) throw new Error("The render browser is not downloaded yet. Use Download now on the Projects page.");
  onProgress({ step: "lint" });
  const lint = await runHyperframes(["lint"], { env, cwd: out, browser: browser.path });
  fs.writeFileSync(path.join(out, "lint.log"), lint.tail + "\n");
  if (lint.code !== 0) throw new Error(`hyperframes lint found problems: ${lastLines(lint.tail)}`);
  onProgress({ step: "check" });
  const windows = transitionWindows(out);
  const covered = coveredWindows(out);
  if (!windows.length && !covered.length) {
    const r = await withoutCameraPage(out, () => runHyperframes(["check"], { env, cwd: out, browser: browser.path }));
    fs.writeFileSync(path.join(out, "check.log"), r.tail + "\n");
    if (r.code !== 0) throw new Error(`hyperframes check found problems: ${lastLines(r.tail)}`);
    return { ok: true };
  }
  // With scene changes: every scene is also checked once it has landed, and
  // the report is read as JSON so the change windows can be told apart.
  // The check looks at the page without the camera wrappers: inside them it
  // measures every scene as 0 px tall (withoutCameraPage).
  const started = Date.now();
  const r = await withoutCameraPage(out, (html) =>
    runHyperframes(["check", "--json", "--at", landedTimes(mountsOf(html)).join(",")], { env, cwd: out, browser: browser.path }),
  );
  const report = readCheckReport(r.stdout ?? "") ?? savedCheckReport(out, started);
  if (!report) {
    fs.writeFileSync(path.join(out, "check.log"), (r.stdout || r.tail) + "\n");
    throw new Error(`hyperframes check gave no readable report: ${lastLines(r.tail)}`);
  }
  const errors = countedErrors(report, windows, covered);
  fs.writeFileSync(path.join(out, "check.log"), JSON.stringify({ errors, report }, null, 2) + "\n");
  if (errors.length) {
    const what = errors.slice(0, 3).map((e) => `${sceneOf(e)}${e.section} ${e.code ?? ""} ${e.selector ?? ""} at ${e.time ?? "?"} s: ${e.message}`);
    throw new Error(`hyperframes check found problems: ${what.join("; ")}`);
  }
  return { ok: true };
}
