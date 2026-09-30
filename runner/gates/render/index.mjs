// gates/render: the render, once, locally (0 tokens). The engine's
// hyperframes renders the project's build/ folder into out/ under a new
// time-stamped name every time, so no render ever overwrites another.
// Progress comes from hyperframes' own output.

import fs from "node:fs";
import path from "node:path";
import { runHyperframes, resolveBrowser } from "../../tools.mjs";
import { percentOf } from "../../tools.mjs";
import { duration } from "../../audio.mjs";

// Local time, as the user reads the clock: video-20260930-1645.mp4
export function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export async function renderVideo(projectDir, { env = process.env, quality = "standard", onProgress = () => {}, signal } = {}) {
  const build = path.join(projectDir, "build");
  if (!fs.existsSync(path.join(build, "index.html"))) throw new Error("Nothing to render yet: build the video first.");
  const browser = resolveBrowser(env);
  if (!browser) throw new Error("The render browser is not downloaded yet. Use Download now on the Projects page.");
  const outDir = path.join(projectDir, "out");
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `video-${stamp()}.mp4`);
  let last = -1;
  const t0 = Date.now();
  const r = await runHyperframes(["render", "-o", file, "--quality", quality], {
    env,
    cwd: build,
    browser: browser.path,
    signal,
    onLine: (line) => {
      const pct = percentOf(line);
      if (pct !== null && pct !== last) {
        last = pct;
        onProgress({ step: "render", percent: pct });
      }
    },
  });
  fs.writeFileSync(path.join(build, "render.log"), r.tail + "\n");
  if (r.code !== 0 || !fs.existsSync(file)) throw new Error(`The render failed: ${r.tail.split("\n").slice(-4).join(" ")}`);
  return { file, seconds: Math.round((await duration(file, env)) * 100) / 100, renderSeconds: Math.round((Date.now() - t0) / 1000) };
}
