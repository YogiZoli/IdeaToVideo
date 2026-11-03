// tools.mjs: the render toolchain the runner drives: the bundled engine (the
// pinned HyperFrames and GSAP), the bundled ffmpeg, and the render browser.
//
// Where things live (set by the Rust core, see runner.rs):
//   ITV_ENGINE_DIR  resources/engine (scripts/fetch-engine.mjs)
//   ITV_DATA_DIR    the app data folder; hyperframes gets <data>/hyperframes-home
//                   as its home, so its Chrome, font and model caches stay inside
//                   the app's own folder and go away with "Delete the
//                   application data" (DECISIONS 46), never in the user's ~/.cache
//   HYPERFRAMES_FFMPEG_PATH / HYPERFRAMES_FFPROBE_PATH   the bundled ffmpeg
//
// Browser (DECISIONS 25): the pinned chrome-headless-shell hyperframes downloads,
// in that home. Fallback: the installed Google Chrome. Never Edge. The chosen
// binary is always passed explicitly (HYPERFRAMES_BROWSER_PATH), so hyperframes
// never picks one on its own.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export function engineDir(env = process.env) {
  return env.ITV_ENGINE_DIR || path.join(here, "..", "app", "src-tauri", "engine");
}

export function dataDir(env = process.env) {
  if (env.ITV_DATA_DIR) return env.ITV_DATA_DIR;
  // Development without the app: a folder of its own, never the real profile.
  return path.join(os.tmpdir(), "ideatovideo-dev-data");
}

export const hfHome = (env = process.env) => path.join(dataDir(env), "hyperframes-home");

export function engineInfo(env = process.env) {
  const f = path.join(engineDir(env), "ENGINE.json");
  if (!fs.existsSync(f)) return null;
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {
    return null;
  }
}

export function hyperframesBin(env = process.env) {
  return path.join(engineDir(env), "node_modules", "hyperframes", "bin", "hyperframes.mjs");
}

// Env for every child the pipeline starts. Built from scratch on purpose: no key,
// no NODE_OPTIONS, nothing from the user's shell that could change the render.
export function childEnv({ env = process.env, browser, platform = process.platform } = {}) {
  const home = hfHome(env);
  const keep = ["PATH", "Path", "SystemRoot", "SYSTEMROOT", "windir", "ComSpec", "PATHEXT", "TEMP", "TMP", "TMPDIR", "LANG", "LC_ALL", "HYPERFRAMES_FFMPEG_PATH", "HYPERFRAMES_FFPROBE_PATH"];
  const out = {};
  for (const k of keep) if (env[k] !== undefined) out[k] = env[k];
  Object.assign(out, {
    HOME: home,
    XDG_CACHE_HOME: path.join(home, ".cache"),
    HYPERFRAMES_NO_TELEMETRY: "1",
    HYPERFRAMES_NO_UPDATE_CHECK: "1",
    HYPERFRAMES_NO_AUTO_INSTALL: "1",
  });
  if (platform === "win32") {
    // os.homedir() reads USERPROFILE on Windows; npm and friends use the rest
    const root = path.win32.parse(home).root; // "C:\"
    Object.assign(out, {
      USERPROFILE: home,
      HOMEDRIVE: root.replace(/\\$/, ""),
      HOMEPATH: home.slice(root.length - 1),
      LOCALAPPDATA: path.join(home, "AppData", "Local"),
      APPDATA: path.join(home, "AppData", "Roaming"),
    });
  }
  if (browser) out.HYPERFRAMES_BROWSER_PATH = browser;
  return out;
}

export function ffmpegPaths(env = process.env) {
  const ffmpeg = env.HYPERFRAMES_FFMPEG_PATH;
  const ffprobe = env.HYPERFRAMES_FFPROBE_PATH;
  return ffmpeg && ffprobe && fs.existsSync(ffmpeg) && fs.existsSync(ffprobe) ? { ffmpeg, ffprobe } : null;
}

// ---- browser --------------------------------------------------------------------

const SHELL_EXE = process.platform === "win32" ? "chrome-headless-shell.exe" : "chrome-headless-shell";

// The pinned shell hyperframes downloaded into our home, if it is there:
// <home>/.cache/hyperframes/chrome/chrome-headless-shell/<plat>-<ver>/<dir>/<exe>
export function managedBrowser(env = process.env) {
  const root = path.join(hfHome(env), ".cache", "hyperframes", "chrome", "chrome-headless-shell");
  if (!fs.existsSync(root)) return null;
  for (const ver of fs.readdirSync(root).sort().reverse()) {
    const vdir = path.join(root, ver);
    if (!fs.statSync(vdir).isDirectory()) continue;
    for (const sub of fs.readdirSync(vdir)) {
      const exe = path.join(vdir, sub, SHELL_EXE);
      if (fs.existsSync(exe)) return { path: exe, version: ver };
    }
  }
  return null;
}

// Google Chrome only (DECISIONS 25: no Edge).
export function systemChromeCandidates(env = process.env, platform = process.platform) {
  if (platform === "darwin") return ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
  if (platform === "win32") {
    const roots = [env.PROGRAMFILES || env.ProgramFiles, env["PROGRAMFILES(X86)"] || env["ProgramFiles(x86)"], env.LOCALAPPDATA].filter(Boolean);
    return roots.map((r) => path.join(r, "Google", "Chrome", "Application", "chrome.exe"));
  }
  return ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable"];
}

export function systemChrome(env = process.env) {
  return systemChromeCandidates(env).find((p) => fs.existsSync(p)) ?? null;
}

// Which browser renders, without downloading anything.
export function resolveBrowser(env = process.env) {
  const m = managedBrowser(env);
  if (m) return { source: "managed", path: m.path, version: m.version };
  const s = systemChrome(env);
  if (s) return { source: "system", path: s };
  return null;
}

// ---- running hyperframes ----------------------------------------------------------

// The engine is never stopped for being quiet (Zoltan, 2026-10-06: look
// first, then the user decides): the core's check-in (runner.rs) tells the
// user when a step seems stuck. `idleMs` stays for a caller that wants a
// limit of its own; by default there is none.
export const ENGINE_IDLE_MS = 0;

// Runs the engine's hyperframes CLI with our node. Streams every output line to
// onLine. Resolves { code, tail, stdout } (tail: the last lines, for error
// messages; stdout: the whole standard output as it came).
export function runHyperframes(args, { env = process.env, cwd, browser, onLine = () => {}, signal, idleMs = ENGINE_IDLE_MS } = {}) {
  const bin = hyperframesBin(env);
  if (!fs.existsSync(bin)) return Promise.reject(new Error(`The video engine is missing. Reinstall the app. Details: ${bin}`));
  fs.mkdirSync(hfHome(env), { recursive: true });
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bin, ...args], { cwd: cwd ?? engineDir(env), env: childEnv({ env, browser }), windowsHide: true, signal });
    let stuck = false;
    let timer = null;
    const arm = () => {
      clearTimeout(timer);
      if (!idleMs) return;
      timer = setTimeout(() => {
        stuck = true;
        child.kill();
      }, idleMs);
      timer.unref?.();
    };
    arm();
    const tail = [];
    const emit = (raw) => {
      // eslint-disable-next-line no-control-regex
      const line = raw.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").trim();
      if (!line) return;
      tail.push(line);
      if (tail.length > 40) tail.shift();
      onLine(line);
    };
    // A pipe hands the output over in pieces (64 KB on Windows) that can end
    // in the middle of a line, so each stream keeps its unfinished line until
    // the rest arrives. Without this a long `check --json` report came back
    // with a line broken in two and could not be read (2026-10-26).
    // `stdout` is kept whole for callers that read a report from it.
    let stdout = "";
    const reader = (isOut) => {
      let rest = "";
      return {
        take(buf) {
          arm();
          const text = buf.toString("utf8");
          if (isOut) stdout += text;
          const parts = (rest + text).split(/\r?\n|\r/);
          rest = parts.pop();
          for (const p of parts) emit(p);
        },
        end() {
          if (rest) emit(rest);
          rest = "";
        },
      };
    };
    const out = reader(true);
    const err = reader(false);
    child.stdout.setEncoding?.("utf8");
    child.stderr.setEncoding?.("utf8");
    child.stdout.on("data", out.take);
    child.stderr.on("data", err.take);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      out.end();
      err.end();
      if (stuck) reject(new Error(`The video engine gave no sign of life for ${Math.round(idleMs / 60000)} minutes, so the app stopped it (hyperframes ${args[0]}). Press the button again; if it happens again, send the diagnostics (Settings, General).`));
      else resolve({ code, tail: tail.join("\n"), stdout });
    });
  });
}

// "Downloading Chrome ... 42%" style lines -> 42
export function percentOf(line) {
  const m = /(\d{1,3})\s*%/.exec(line);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 0 && n <= 100 ? n : null;
}

// Downloads the pinned shell into our home with hyperframes' own downloader
// (`hyperframes browser ensure`). Resolves the run's { code, tail }.
export function downloadShell({ env = process.env, onProgress = () => {}, run = runHyperframes } = {}) {
  onProgress({ step: "browser", message: "Downloading the render browser (about 280 MB)" });
  let last = -1;
  return run(["browser", "ensure"], {
    env,
    onLine: (line) => {
      const pct = percentOf(line);
      if (pct !== null && pct !== last) {
        last = pct;
        onProgress({ step: "browser", percent: pct });
      }
    },
  });
}

// First launch: download the pinned render browser into our home. If that fails
// (no network, firewall, Windows on ARM has no pinned shell), fall back to the
// installed Google Chrome, and say so. The fallback serves lint, check and
// stills only: the render needs the shell (renderBrowser, DECISIONS 126).
export async function ensureBrowser({ env = process.env, onProgress = () => {}, run = runHyperframes } = {}) {
  const have = managedBrowser(env);
  if (have) return { source: "managed", path: have.path, version: have.version, downloaded: false };
  const r = await downloadShell({ env, onProgress, run });
  const got = managedBrowser(env);
  if (r.code === 0 && got) return { source: "managed", path: got.path, version: got.version, downloaded: true };
  const sys = systemChrome(env);
  if (sys) return { source: "system", path: sys, downloaded: false, warning: "The render browser could not be downloaded, so the installed Google Chrome is used." };
  throw new Error(`The render browser could not be downloaded, and Google Chrome is not installed. Check the internet connection and try again, or install Google Chrome. Details: ${r.tail.split("\n").slice(-3).join(" ")}`);
}

// The browser a render uses: always the pinned shell (DECISIONS 126). Since
// hyperframes 0.8.181 the render first runs the browser with --version, which
// the installed Google Chrome on Windows never answers, so there is no system
// fallback here. A missing shell is downloaded first.
export async function renderBrowser({ env = process.env, onProgress = () => {}, run = runHyperframes } = {}) {
  const have = managedBrowser(env);
  if (have) return { source: "managed", path: have.path, version: have.version, downloaded: false };
  const r = await downloadShell({ env, onProgress, run });
  const got = managedBrowser(env);
  if (r.code === 0 && got) return { source: "managed", path: got.path, version: got.version, downloaded: true };
  throw new Error(`The render browser could not be downloaded. Check the internet connection and press the button again; nothing is lost. Details: ${r.tail.split("\n").slice(-3).join(" ")}`);
}

export function toolsStatus(env = process.env) {
  const engine = engineInfo(env);
  const ff = ffmpegPaths(env);
  return {
    engine: engine ? { hyperframes: engine.hyperframes, gsap: engine.gsap } : null,
    ffmpeg: !!ff,
    browser: resolveBrowser(env),
  };
}
