// gates/render: the render, once, locally (0 tokens). The engine's
// hyperframes renders the project's build/ folder into out/ under a new
// time-stamped name every time, so no render ever overwrites another.
// Progress comes from hyperframes' own output.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { runHyperframes, renderBrowser } from "../../tools.mjs";
import { percentOf } from "../../tools.mjs";

// hyperframes' own percent moves in coarse stages (20% after two seconds of
// setup, then 10% steps, frames end at 80%), so a bar fed with it said
// "Finishing now" at the start and then stood still for minutes (Zoltan,
// 2026-10-05). Every captured frame is printed ("Streaming frame 3817/3848"):
// that is the real progress. Setup 0-3%, frames 3-95%, assembling 96%.
export function renderPercent(line) {
  const f = /frame\s+(\d+)\s*\/\s*(\d+)/i.exec(line);
  if (f && Number(f[2]) > 0) return { percent: Math.min(95, Math.round(3 + (92 * Number(f[1])) / Number(f[2]))), frame: Number(f[1]), frames: Number(f[2]) };
  if (/assembl/i.test(line)) return { percent: 96 };
  if (/render complete/i.test(line)) return { percent: 100 };
  const pct = percentOf(line);
  // before the first frame only the setup stages count, kept small
  return pct === null ? null : { percent: Math.min(3, Math.round(pct / 10)) };
}
import { duration } from "../../audio.mjs";

// Local time, as the user reads the clock: video-20260930-1645.mp4
export function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

// Where hyperframes writes the video while it renders. Since 0.8.181 it opens
// a temporary folder next to the output file, which on a long project path
// went past the Windows limit (ENAMETOOLONG, DECISIONS 126). hyperframes has
// no flag or variable for that folder, so the render goes to a short folder
// of its own (<tmp>/itv-r/<id>) and the finished MP4 is copied into out/.
export function renderTemp(env = process.env) {
  const root = env.ITV_RENDER_TMP || path.join(os.tmpdir(), "itv-r");
  const dir = path.join(root, randomBytes(4).toString("hex"));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export async function renderVideo(projectDir, { env = process.env, quality = "standard", onProgress = () => {}, signal, run = runHyperframes, browserFor = renderBrowser, measure = duration } = {}) {
  const build = path.join(projectDir, "build");
  if (!fs.existsSync(path.join(build, "index.html"))) throw new Error("Nothing to render yet: build the video first.");
  // The bar shows the download in words only: its percent is the render's.
  const browser = await browserFor({ env, onProgress: (p) => onProgress({ step: "browser", message: p.message ?? "Downloading the render browser" }) });
  const outDir = path.join(projectDir, "out");
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `video-${stamp()}.mp4`);
  const tmp = renderTemp(env);
  const tmpFile = path.join(tmp, "video.mp4");
  let last = -1;
  const t0 = Date.now();
  try {
    const r = await run(["render", "-o", tmpFile, "--quality", quality], {
      env,
      cwd: build,
      browser: browser.path,
      signal,
      onLine: (line) => {
        const p = renderPercent(line);
        if (p && p.percent > last) {
          last = p.percent;
          onProgress({ step: "render", ...p });
        }
      },
    });
    fs.writeFileSync(path.join(build, "render.log"), r.tail + "\n");
    if (r.code !== 0 || !fs.existsSync(tmpFile)) throw new Error(`The render failed: ${r.tail.split("\n").slice(-4).join(" ")}`);
    fs.copyFileSync(tmpFile, file);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return { file, seconds: Math.round((await measure(file, env)) * 100) / 100, renderSeconds: Math.round((Date.now() - t0) / 1000) };
}
