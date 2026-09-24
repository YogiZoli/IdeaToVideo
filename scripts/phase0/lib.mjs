// lib.mjs: helpers for the phase 0 clean-machine harness (e2e.mjs).
//
// Kept separate from e2e.mjs so the pure parts (environment, argument parsing,
// comparisons) have unit tests without cloning or rendering anything.

import fs from "node:fs";
import path from "node:path";

// The environment a fresh machine would give the packaged app: an empty user
// profile (no browser cache, no npm cache), a PATH with only Node and the OS,
// and ffmpeg / ffprobe reachable only through the env vars the app will set for
// its sidecar. Telemetry and update checks of the hyperframes CLI are off,
// because the app promises no phone-home (SPEC 9).
export function cleanEnv({ work, nodeDir, ffmpeg, ffprobe, browser, platform = process.platform, base = process.env }) {
  const home = path.join(work, "home");
  const tmp = path.join(work, "tmp");
  const env = {};
  if (platform === "win32") {
    const sysRoot = base.SystemRoot || base.SYSTEMROOT || "C:\\Windows";
    Object.assign(env, {
      SystemRoot: sysRoot,
      SystemDrive: base.SystemDrive || "C:",
      WINDIR: sysRoot,
      COMSPEC: path.join(sysRoot, "System32", "cmd.exe"),
      PATHEXT: base.PATHEXT || ".COM;.EXE;.BAT;.CMD",
      NUMBER_OF_PROCESSORS: base.NUMBER_OF_PROCESSORS,
      PROCESSOR_ARCHITECTURE: base.PROCESSOR_ARCHITECTURE,
      USERPROFILE: home,
      HOMEDRIVE: path.parse(home).root.replace(/\\$/, ""),
      HOMEPATH: home.slice(path.parse(home).root.length - 1),
      APPDATA: path.join(home, "AppData", "Roaming"),
      LOCALAPPDATA: path.join(home, "AppData", "Local"),
      TEMP: tmp,
      TMP: tmp,
      PATH: [nodeDir, path.join(sysRoot, "System32"), sysRoot, path.join(sysRoot, "System32", "Wbem")].join(";"),
    });
  } else {
    Object.assign(env, { HOME: home, TMPDIR: tmp, PATH: [nodeDir, "/usr/bin", "/bin"].join(":"), LANG: base.LANG || "en_US.UTF-8" });
  }
  Object.assign(env, {
    HOME: home,
    FFMPEG_PATH: ffmpeg,
    FFPROBE_PATH: ffprobe,
    HYPERFRAMES_FFMPEG_PATH: ffmpeg,
    HYPERFRAMES_FFPROBE_PATH: ffprobe,
    HYPERFRAMES_NO_TELEMETRY: "1",
    HYPERFRAMES_NO_UPDATE_CHECK: "1",
    FORCE_COLOR: "0",
  });
  if (browser) env.HYPERFRAMES_BROWSER_PATH = browser;
  for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k];
  return env;
}

// "--flag value" / "--switch" parser, flags case-insensitive.
export function parseArgs(argv, spec) {
  const out = {};
  for (const [k, def] of Object.entries(spec)) out[k] = def.default;
  const byLower = Object.fromEntries(Object.keys(spec).map((k) => [k.toLowerCase(), k]));
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("-")) throw new Error(`Unexpected argument: ${a}`);
    const key = byLower[a.replace(/^-+/, "").toLowerCase()];
    if (!key) throw new Error(`Unknown option: ${a}`);
    if (spec[key].type === "switch") out[key] = true;
    else {
      const v = argv[++i];
      if (v === undefined) throw new Error(`Missing value for ${a}`);
      out[key] = v;
    }
  }
  return out;
}

// ElevenLabs STT shape that sentences.mjs reads, from a flat words.json.
export function sttFromWords(words) {
  return { words: words.map((w) => ({ text: w.text, start: Number(w.start), end: Number(w.end), type: "word" })) };
}

// Compare two sentence tables. Returns a list of human-readable differences.
export function diffSentences(actual, expected) {
  const diffs = [];
  if (actual.length !== expected.length) diffs.push(`count ${actual.length} vs ${expected.length}`);
  const n = Math.min(actual.length, expected.length);
  for (let i = 0; i < n; i++) {
    const a = actual[i];
    const e = expected[i];
    for (const k of ["id", "start", "end", "text"]) {
      if (a[k] !== e[k]) diffs.push(`${e.id}.${k}: ${JSON.stringify(a[k])} vs ${JSON.stringify(e[k])}`);
    }
  }
  return diffs;
}

// Disk usage of a directory, in bytes. Symlinks are not followed.
export function dirSize(dir) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) total += fs.statSync(p).size;
    }
  }
  return total;
}

// Native addons (.node files) under a directory, relative paths.
export function findNativeAddons(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    if (!fs.existsSync(d)) continue;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.name.endsWith(".node")) out.push(path.relative(dir, p).split(path.sep).join("/"));
    }
  }
  return out.sort();
}

export const mb = (bytes) => Math.round(bytes / 1e6);

// Quick mode: keep the first scenes of a scene list so the test video is about
// `seconds` long. A scene's anchor is the first sentence of its data-sent
// ("S2-S3" and "S20#1/3" both anchor on their first sentence). The cut goes on the
// scene boundary closest to `seconds` (the earlier one on a tie), where the first
// dropped scene would start, so no kept scene is shortened. A boundary inside a
// split sentence ("S20#2/3") is never used. Returns { count, audioEnd }.
export function quickCut(scenes, sentences, seconds) {
  const idOf = (sent) => String(sent).split(/[-#]/)[0];
  const startOf = (sent) => {
    const s = sentences.find((x) => x.id === idOf(sent));
    if (!s) throw new Error(`scene anchor ${sent}: sentence ${idOf(sent)} not in the table`);
    return Number(s.start);
  };
  let best = { count: scenes.length, audioEnd: Math.max(...sentences.map((s) => Number(s.end))) };
  for (let i = 1; i < scenes.length; i++) {
    if (idOf(scenes[i].sent) === idOf(scenes[i - 1].sent)) continue;
    const t = startOf(scenes[i].sent);
    if (Math.abs(t - seconds) < Math.abs(best.audioEnd - seconds)) best = { count: i, audioEnd: t };
  }
  return best;
}

// Avatar segments ("file=start:end,...") that still fall inside a cut video,
// with their end clamped to the cut.
export function clipSegments(spec, audioEnd) {
  const out = [];
  for (const s of spec.split(",")) {
    const [file, t] = s.split("=");
    const [start, end] = t.split(":").map(Number);
    if (start >= audioEnd) continue;
    const e = end === undefined || Number.isNaN(end) ? audioEnd : Math.min(end, audioEnd);
    out.push(`${file}=${start}:${e}`);
  }
  return out.join(",");
}
