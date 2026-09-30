// gates/review: gate 4. Builds the video from the approved scene table
// (assemble.mjs), runs lint + check (0 errors is the condition), and makes the
// contact sheet: one frame just before every scene ends (the landed state; a
// scene builds up over its whole length, so its middle can show half of it),
// tiled by ffmpeg into review/contact.png. The user approves the sheet, then
// renders. The sheet shows no motion; the UI says so.

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { assemble } from "../build/assemble.mjs";
import { lintAndCheck, buildDir } from "../build/index.mjs";
import { runHyperframes, resolveBrowser, ffmpegPaths } from "../../tools.mjs";

export const COLUMNS = 5;
export const TILE_WIDTH = 384;

// The moment to capture for each scene: 0.2 s before it ends, never before its
// middle.
export function landedTimes(mounts) {
  return mounts.map((m) => Math.round((m.start + Math.max(m.duration - 0.2, m.duration / 2)) * 100) / 100);
}

// The scenes as the built index.html mounts them.
export function mountsOf(html) {
  return [...html.matchAll(/id="scene-(\d+)"[^>]*data-start="([\d.]+)" data-duration="([\d.]+)"/g)].map((m) => ({ n: Number(m[1]), start: Number(m[2]), duration: Number(m[3]) }));
}

export function tileFilter(count, columns = COLUMNS, width = TILE_WIDTH) {
  const cols = Math.min(columns, Math.max(1, count));
  const rows = Math.max(1, Math.ceil(count / cols));
  return `scale=${width}:-1,tile=${cols}x${rows}:padding=6:margin=6:color=0x808080`;
}

const byNumber = (a, b) => a.localeCompare(b, "en", { numeric: true });

function ffmpeg(args, env) {
  const bin = ffmpegPaths(env)?.ffmpeg;
  if (!bin) return Promise.reject(new Error("The bundled ffmpeg is missing. Reinstall the app."));
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ["-hide_banner", "-loglevel", "error", "-y", ...args], { windowsHide: true });
    let err = "";
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg failed: ${err.slice(-400)}`))));
  });
}

export async function contactSheet(projectDir, { env = process.env, onProgress = () => {} } = {}) {
  const html = fs.readFileSync(path.join(buildDir(projectDir), "index.html"), "utf8");
  const mounts = mountsOf(html);
  if (!mounts.length) throw new Error("The build has no scenes.");
  const browser = resolveBrowser(env);
  if (!browser) throw new Error("The render browser is not downloaded yet. Use Download now on the Projects page.");
  const review = path.join(projectDir, "review");
  const shots = path.join(review, "snapshots");
  fs.rmSync(shots, { recursive: true, force: true });
  fs.mkdirSync(shots, { recursive: true });
  onProgress({ step: "snapshots", frames: mounts.length });
  const r = await runHyperframes(["snapshot", "-o", shots, "--at", landedTimes(mounts).join(","), "--no-end", "--describe", "false"], { env, cwd: buildDir(projectDir), browser: browser.path });
  fs.writeFileSync(path.join(review, "snapshot.log"), r.tail + "\n");
  if (r.code !== 0) throw new Error(`The snapshots failed: ${r.tail.split("\n").slice(-4).join(" ")}`);
  const pngs = fs.readdirSync(shots).filter((f) => f.endsWith(".png")).sort(byNumber);
  if (!pngs.length) throw new Error("The snapshots made no pictures.");
  onProgress({ step: "sheet" });
  const list = path.join(shots, "list.txt");
  fs.writeFileSync(list, pngs.map((f) => `file '${path.join(shots, f).replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n") + "\n");
  const sheet = path.join(review, "contact.png");
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", list, "-vf", tileFilter(pngs.length), "-frames:v", "1", sheet], env);
  return { sheet, frames: pngs.length, stills: stillsOf(projectDir) };
}

// The stills of the last build, in scene order, for the UI: one per scene,
// with the moment it shows ("frame-03-at-12.9s.png" -> scene 4 at 12.9 s).
export function stillsOf(projectDir) {
  const shots = path.join(projectDir, "review", "snapshots");
  if (!fs.existsSync(shots)) return [];
  return fs
    .readdirSync(shots)
    .filter((f) => /^frame-\d+-at-[\d.]+s\.png$/.test(f))
    .sort(byNumber)
    .map((f, i) => ({ scene: i + 1, at: Number(/-at-([\d.]+)s\.png$/.exec(f)[1]), file: path.join(shots, f) }));
}

// Gate 4: build, check, sheet.
export async function buildAndReview(projectDir, { env = process.env, language, title, look, onProgress = () => {} } = {}) {
  onProgress({ step: "build" });
  const built = await assemble(projectDir, { env, language, title, look });
  await lintAndCheck(projectDir, { env, onProgress });
  const sheet = await contactSheet(projectDir, { env, onProgress });
  return { scenes: built.scenes, seconds: built.seconds, ...sheet };
}
