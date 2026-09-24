#!/usr/bin/env node
// e2e.mjs: phase 0 exit test. Runs one real video through the Node pipeline on a
// simulated clean machine, and measures what the packaged app will have to ship.
//
// "Clean machine" here means: a fresh clone of brand-frames at a pinned commit,
// an empty user profile (no browser cache, no npm cache), a PATH with only Node
// and the OS, and ffmpeg / ffprobe reachable only through the env vars the app
// will set for its sidecar. Nothing from Zoltan's working copy is used except the
// project inputs (scenes, words, audio, avatar clips).
//
// STEPS (PIPELINE.md numbering)
//   clone      git clone brand-frames at --ref
//   install    npm install in the clone (clean npm cache)
//   browser    hyperframes browser ensure (clean cache), skipped with --browser
//   3          sentences.mjs from the word-level STT
//   5          build-video.mjs, stamp-timing.mjs
//   6          image-audio-lint.mjs (report only), hyperframes lint, check
//   8          hyperframes render
//   9          avatar-composite.mjs (segments mode), when --segments is given
//
// USAGE
//   node scripts/phase0/e2e.mjs --project <dir> --work <dir>
//   node scripts/phase0/e2e.mjs --project <dir> --work <dir> --reuse --browser "<chrome.exe>" --tag edge
//
//   --project     folder with scenes.json, words.json (or stt.json), the audio the
//                 scenes.json names, and the avatar clips
//   --segments    "avatar_open.webm=0:6,avatar_close.webm=62.8:71.3" (relative to --project)
//   --reference   sentences.json to compare the fresh sentence table with
//   --reuse       keep an existing clone + node_modules in --work (render-only rerun)
//   --browser     render with this Chrome instead of the downloaded headless shell
//   --tag         suffix for output names, so several renders sit side by side
//   --quality     draft | standard | high (default standard)
//   --compare     another render to measure this one against (PSNR)
//   --seconds     quick mode length (default 18): keep the first whole scenes up to
//                 about this long, cut the audio there, keep the avatar segments
//                 that fall inside. About a quarter of the render time on C2C.
//   --full        render the whole video instead of the quick cut
//
// Writes <work>/report-<tag>.json. Exit code 0 only if every step passed.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { cleanEnv, parseArgs, sttFromWords, diffSentences, dirSize, findNativeAddons, mb, quickCut, clipSegments } from "./lib.mjs";

const a = parseArgs(process.argv.slice(2), {
  project: { type: "string" },
  work: { type: "string", default: path.join(os.tmpdir(), "pvc-e2e") },
  repo: { type: "string", default: "https://github.com/YogiZoli/brand-frames.git" },
  ref: { type: "string", default: "61b4143bc8af8e74f37a010614140a31b4c7f72a" },
  segments: { type: "string" },
  reference: { type: "string" },
  reuse: { type: "switch", default: false },
  browser: { type: "string" },
  tag: { type: "string", default: "shell" },
  quality: { type: "string", default: "standard" },
  compare: { type: "string" },
  seconds: { type: "string", default: "18" },
  full: { type: "switch", default: false },
  ffmpeg: { type: "string" },
  ffprobe: { type: "string" },
});
if (!a.project) {
  console.error("Missing required option --project");
  process.exit(1);
}

const work = path.resolve(a.work);
const project = path.resolve(a.project);
const clone = path.join(work, "brand-frames");
const zg = path.join(clone, "zg-frames");
const proj = path.join(work, "project");
const out = path.join(work, "out");
for (const d of [work, proj, out, path.join(work, "home"), path.join(work, "tmp")]) fs.mkdirSync(d, { recursive: true });

// ffmpeg is taken from the caller's PATH once, then only passed by env var, the
// way the app will pass its bundled sidecar.
function which(bin) {
  const r = spawnSync(process.platform === "win32" ? "where" : "which", [bin], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : undefined;
}
const ffmpeg = a.ffmpeg || which("ffmpeg");
const ffprobe = a.ffprobe || which("ffprobe");
if (!ffmpeg || !ffprobe) {
  console.error("ffmpeg / ffprobe not found; pass --ffmpeg and --ffprobe");
  process.exit(1);
}
const nodeDir = path.dirname(process.execPath);
const env = cleanEnv({ work, nodeDir, ffmpeg, ffprobe, browser: a.browser });

const report = { tag: a.tag, ref: a.ref, platform: `${process.platform}/${process.arch}`, node: process.version, cpus: os.cpus().length, cpu: os.cpus()[0]?.model, ramGb: Math.round(os.totalmem() / 1e9), steps: [], ok: true };

function step(name, fn) {
  const t0 = Date.now();
  let res;
  try {
    res = fn() ?? {};
  } catch (e) {
    res = { ok: false, error: e.message };
  }
  const entry = { name, seconds: Math.round((Date.now() - t0) / 100) / 10, ok: res.ok !== false, ...res };
  report.steps.push(entry);
  const mark = entry.ok ? "ok  " : "FAIL";
  console.log(`[${mark}] ${name}  ${entry.seconds}s${entry.error ? "  " + entry.error : ""}`);
  if (!entry.ok) {
    report.ok = false;
    finish();
  }
  return entry;
}

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 1 << 28, env: opts.env ?? env, cwd: opts.cwd ?? work });
  const tail = ((r.stdout || "") + (r.stderr || "")).trim().split(/\r?\n/).slice(-15).join("\n");
  fs.appendFileSync(path.join(work, `log-${a.tag}.txt`), `\n$ ${cmd} ${args.join(" ")}\n${r.stdout || ""}${r.stderr || ""}\n`);
  return { status: r.status, tail, error: r.error?.message };
}
const node = (script, args, cwd) => sh(process.execPath, [script, ...args], { cwd });
const npmCli = [path.join(nodeDir, "node_modules", "npm", "bin", "npm-cli.js"), path.join(nodeDir, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js")].find((p) => fs.existsSync(p));
const hf = (args) => node(path.join(clone, "node_modules", "hyperframes", "bin", "hyperframes.mjs"), args, zg);
const must = (r, what) => {
  if (r.status !== 0) return { ok: false, error: `${what} exited ${r.status ?? r.error}`, tail: r.tail };
  return { tail: r.tail };
};

function finish() {
  const file = path.join(work, `report-${a.tag}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(`\n${report.ok ? "PASSED" : "FAILED"}  report: ${file.split(path.sep).join("/")}`);
  process.exit(report.ok ? 0 : 1);
}

// clone + install ------------------------------------------------------------
if (!(a.reuse && fs.existsSync(path.join(clone, "node_modules", "hyperframes")))) {
  step("clone", () => {
    fs.rmSync(clone, { recursive: true, force: true });
    // git runs with the caller's env: the app never clones, only the build does.
    const r1 = sh("git", ["clone", "--quiet", a.repo, clone], { env: process.env });
    if (r1.status !== 0) return { ok: false, error: "git clone failed", tail: r1.tail };
    const r2 = sh("git", ["-C", clone, "checkout", "--quiet", a.ref], { env: process.env });
    return must(r2, "git checkout");
  });
  step("install", () => {
    const hasLock = fs.existsSync(path.join(clone, "package-lock.json"));
    const r = sh(process.execPath, [npmCli, hasLock ? "ci" : "install", "--no-audit", "--no-fund"], { cwd: clone });
    if (r.status !== 0) return { ok: false, error: "npm failed", tail: r.tail };
    const nm = path.join(clone, "node_modules");
    const lock = JSON.parse(fs.readFileSync(path.join(clone, "package-lock.json"), "utf8"));
    const ver = (p) => lock.packages?.[`node_modules/${p}`]?.version;
    return {
      lockCommitted: hasLock,
      nodeModulesMb: mb(dirSize(nm)),
      packages: Object.keys(lock.packages ?? {}).length - 1,
      nativeAddons: findNativeAddons(nm),
      resolved: Object.fromEntries(["hyperframes", "puppeteer-core", "@puppeteer/browsers", "sharp", "onnxruntime-node", "esbuild"].map((p) => [p, ver(p)])),
      npmCacheMb: mb(dirSize(path.join(env.LOCALAPPDATA ?? path.join(env.HOME, ".npm"), "npm-cache"))),
    };
  });
}

if (!a.browser) {
  step("browser", () => {
    const r = hf(["browser", "ensure"]);
    if (r.status !== 0) return { ok: false, error: "browser ensure failed", tail: r.tail };
    const p = hf(["browser", "path"]);
    return { path: p.tail.split(/\r?\n/).pop(), cacheMb: mb(dirSize(path.join(env.HOME, ".cache"))) };
  });
}

// project inputs ---------------------------------------------------------------
step("inputs", () => {
  const scenes = JSON.parse(fs.readFileSync(path.join(project, "scenes.json"), "utf8"));
  fs.copyFileSync(path.join(project, "scenes.json"), path.join(proj, "scenes.json"));
  // build-video.mjs writes into zg-frames and the composition references the
  // audio relative to it, so the audio has to sit there (finding for phase 1).
  if (scenes.audio) fs.copyFileSync(path.join(project, scenes.audio), path.join(zg, path.basename(scenes.audio)));
  const sttSrc = path.join(project, "stt.json");
  const stt = fs.existsSync(sttSrc) ? JSON.parse(fs.readFileSync(sttSrc, "utf8")) : sttFromWords(JSON.parse(fs.readFileSync(path.join(project, "words.json"), "utf8")));
  fs.writeFileSync(path.join(proj, "stt.json"), JSON.stringify(stt));
  return { scenes: scenes.scenes.length, audio: scenes.audio, words: stt.words.length };
});

// 3. sentence table --------------------------------------------------------------
step("3 sentences", () => {
  const r = node(path.join(clone, "pipeline", "sentences.mjs"), ["--stt", path.join(proj, "stt.json"), "--outdir", proj], clone);
  const res = must(r, "sentences.mjs");
  if (res.ok === false) return res;
  const fresh = JSON.parse(fs.readFileSync(path.join(proj, "sentences.json"), "utf8"));
  if (!a.reference) return { sentences: fresh.length };
  const diffs = diffSentences(fresh, JSON.parse(fs.readFileSync(a.reference, "utf8")));
  return { ok: diffs.length === 0, sentences: fresh.length, referenceDiffs: diffs.slice(0, 20), error: diffs.length ? `${diffs.length} differences from reference` : undefined };
});

// quick cut --------------------------------------------------------------------
// The full C2C render takes ~4 minutes; the first ~18 seconds exercise every
// step (build, timing, check, render, avatar) in about a quarter of that.
let audioEnd;
if (!a.full) {
  step("quick cut", () => {
    const plan = JSON.parse(fs.readFileSync(path.join(proj, "scenes.json"), "utf8"));
    const sentences = JSON.parse(fs.readFileSync(path.join(proj, "sentences.json"), "utf8"));
    const cut = quickCut(plan.scenes, sentences, Number(a.seconds));
    audioEnd = cut.audioEnd;
    plan.scenes = plan.scenes.slice(0, cut.count);
    fs.writeFileSync(path.join(proj, "scenes.json"), JSON.stringify(plan, null, 2));
    if (plan.audio) {
      // cut the audio where the first dropped scene would start, with a short fade
      const dst = path.join(zg, path.basename(plan.audio));
      const r = spawnSync(ffmpeg, ["-y", "-v", "error", "-i", path.join(project, plan.audio), "-t", String(audioEnd), "-af", `afade=t=out:st=${Math.max(0, audioEnd - 0.3)}:d=0.3`, dst], { encoding: "utf8" });
      if (r.status !== 0) return { ok: false, error: "audio cut failed", tail: r.stderr };
    }
    return { scenes: cut.count, audioEnd };
  });
}

// 5. build + timing --------------------------------------------------------------
step("5 build-video", () => must(node(path.join(zg, "blocks", "build-video.mjs"), ["--scenes", path.join(proj, "scenes.json")], path.join(zg, "blocks")), "build-video.mjs"));
step("5 stamp-timing", () => must(node(path.join(clone, "pipeline", "stamp-timing.mjs"), ["--html", path.join(zg, "index.html"), "--sentences", path.join(proj, "sentences.json"), ...(audioEnd ? ["--audioEnd", String(audioEnd)] : [])], clone), "stamp-timing.mjs"));

// 6. lint + check ------------------------------------------------------------------
step("6 image-audio-lint", () => {
  const r = node(path.join(clone, "pipeline", "image-audio-lint.mjs"), ["--html", path.join(zg, "index.html"), "--words", path.join(proj, "words.json")], clone);
  // A filter, not a gate: never fails the run. It only knows <section class="clip">
  // scenes, not the mounted block slots build-video.mjs writes, so on the live
  // chain it checks nothing (inherited from image-audio-lint.ps1). Surface that.
  const noScenes = /No <section class="clip"> found/.test(r.tail);
  if (noScenes) console.log("       warning: image-audio-lint found no scenes (mounted slots not supported)");
  return { status: r.status, warning: noScenes ? "no scenes checked: mounted block slots not supported" : undefined, tail: r.tail };
});
step("6 hyperframes lint", () => must(hf(["lint"]), "hyperframes lint"));
step("6 hyperframes check", () => must(hf(["check"]), "hyperframes check"));

// 8. render --------------------------------------------------------------------------
const video = path.join(out, `video-${a.tag}.mp4`);
function probe(file) {
  const r = spawnSync(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "json", file], { encoding: "utf8" });
  return r.status === 0 ? JSON.parse(r.stdout) : {};
}
step("8 render", () => {
  const r = hf(["render", "-o", video, "--quality", a.quality]);
  const res = must(r, "hyperframes render");
  if (res.ok === false) return res;
  const p = probe(video);
  const dur = Number(p.format?.duration);
  return { output: video, videoSeconds: dur, mb: mb(fs.statSync(video).size), tail: r.tail };
});

// 9. avatar ----------------------------------------------------------------------------
const segments = a.segments && (audioEnd ? clipSegments(a.segments, audioEnd) : a.segments);
if (segments) {
  step("9 avatar-composite", () => {
    const segs = segments.split(",").map((s) => {
      const [file, t] = s.split("=");
      return `${path.join(project, file)}=${t}`;
    });
    const final = path.join(out, `final-${a.tag}.mp4`);
    // No --audio: build-video.mjs already puts the VO+BGM into the render. A
    // separate --audio makes the composite -shortest cut to the mp3 length and
    // drops the end card's hold (71.29s instead of 72.27s on the C2C video).
    const args = ["--background", video, "--segments", segs.join(","), "--out", final];
    const res = must(node(path.join(clone, "pipeline", "avatar-composite.mjs"), args, clone), "avatar-composite.mjs");
    if (res.ok === false) return res;
    const dur = Number(probe(final).format?.duration);
    const renderDur = report.steps.find((s) => s.name === "8 render")?.videoSeconds;
    const ok = Math.abs(dur - renderDur) < 0.05;
    return { ok, output: final, videoSeconds: dur, mb: mb(fs.statSync(final).size), error: ok ? undefined : `final is ${dur}s, render is ${renderDur}s` };
  });
}

// Visual comparison of this render with another one (PSNR, higher is closer;
// identical frames give inf, above ~40 dB the difference is not visible).
if (a.compare) {
  step("compare", () => {
    const r = spawnSync(ffmpeg, ["-hide_banner", "-nostats", "-i", video, "-t", String(report.steps.find((s) => s.name === "8 render")?.videoSeconds ?? 99999), "-i", a.compare, "-lavfi", "[0:v][1:v]psnr", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 1 << 26 });
    const m = /PSNR y:\S+ u:\S+ v:\S+ average:(\S+) min:(\S+) max:(\S+)/.exec(r.stderr || "");
    if (!m) return { ok: false, error: "psnr failed" };
    return { against: a.compare, psnrAverage: m[1], psnrMin: m[2], psnrMax: m[3] };
  });
}

const render = report.steps.find((s) => s.name === "8 render");
if (render?.videoSeconds) report.renderSecondsPerVideoMinute = Math.round((render.seconds / render.videoSeconds) * 60);
finish();
