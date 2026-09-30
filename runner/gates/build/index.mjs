// gates/build: build/ is the project's HyperFrames project (index.html,
// compositions, audio, gsap.min.js). assemble.mjs writes it from the scene
// table; here are the parts around it: preparing the folder, and lint + check
// (0 errors is the condition, no gate).

import fs from "node:fs";
import path from "node:path";
import { engineDir, runHyperframes, resolveBrowser } from "../../tools.mjs";

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

export async function lintAndCheck(projectDir, { env = process.env, onProgress = () => {} } = {}) {
  const out = buildDir(projectDir);
  if (!fs.existsSync(path.join(out, "index.html"))) throw new Error("Nothing to check yet: build the video first.");
  const browser = resolveBrowser(env);
  if (!browser) throw new Error("The render browser is not downloaded yet. Use Download now on the Projects page.");
  for (const cmd of ["lint", "check"]) {
    onProgress({ step: cmd });
    const r = await runHyperframes([cmd], { env, cwd: out, browser: browser.path });
    fs.writeFileSync(path.join(out, `${cmd}.log`), r.tail + "\n");
    if (r.code !== 0) throw new Error(`hyperframes ${cmd} found problems: ${r.tail.split("\n").slice(-6).join(" ")}`);
  }
  return { ok: true };
}
