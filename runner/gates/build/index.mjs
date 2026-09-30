// gates/build: PIPELINE steps 5 and 6, no gate ("0 errors" is the condition).
//   5  build-video.mjs  scenes.json + the library -> build/index.html + compositions
//      stamp-timing.mjs data-start / data-duration from sentences.json
//   6  image-audio-lint.mjs (a filter, never fails the run), hyperframes lint, check
// Everything is the canon's own tooling; the project folder is the output
// (build-video --outdir, brand-frames app-integration), so projects never
// overwrite each other and the library stays untouched.

import fs from "node:fs";
import path from "node:path";
import { canonDir, runHyperframes, resolveBrowser } from "../../tools.mjs";
import { runCanonScript } from "../../pipeline.mjs";

export const buildDir = (projectDir) => path.join(projectDir, "build");

// The scene list as build-video reads it, with the audio next to index.html.
export function prepareBuild(projectDir) {
  const scenesFile = path.join(projectDir, "scenes.json");
  if (!fs.existsSync(scenesFile)) throw new Error("There is no scene table yet.");
  const mixFile = path.join(projectDir, "audio", "vo_bgm.mp3");
  if (!fs.existsSync(mixFile)) throw new Error("There is no approved voice yet.");
  const out = buildDir(projectDir);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  fs.copyFileSync(mixFile, path.join(out, "vo_bgm.mp3"));
  const plan = JSON.parse(fs.readFileSync(scenesFile, "utf8"));
  plan.audio = "vo_bgm.mp3";
  const planFile = path.join(out, "scenes.build.json");
  fs.writeFileSync(planFile, JSON.stringify(plan, null, 2) + "\n");
  return { out, planFile };
}

export async function buildAndCheck(projectDir, { env = process.env, theme, onProgress = () => {} } = {}) {
  const { out, planFile } = prepareBuild(projectDir);
  const canon = canonDir(env);
  const gsap = path.join(canon, "node_modules", "gsap", "dist", "gsap.min.js");
  const html = path.join(out, "index.html");

  onProgress({ step: "build" });
  const args = ["--scenes", planFile, "--outdir", out, "--gsap", gsap];
  if (theme) args.push("--theme", theme);
  await runCanonScript("zg-frames/blocks/build-video.mjs", args, { env, cwd: path.join(canon, "zg-frames", "blocks") });
  await runCanonScript("pipeline/stamp-timing.mjs", ["--html", html, "--sentences", path.join(projectDir, "sentences.json")], { env });

  onProgress({ step: "image-audio-lint" });
  let drift = "";
  try {
    drift = await runCanonScript("pipeline/image-audio-lint.mjs", ["--html", html, "--words", path.join(projectDir, "words.json")], { env });
  } catch (e) {
    drift = e.message; // a filter, not a gate (PIPELINE.md step 6)
  }

  const browser = resolveBrowser(env);
  if (!browser) throw new Error("The render browser is not downloaded yet. Use Download now on the Projects page.");
  for (const cmd of ["lint", "check"]) {
    onProgress({ step: cmd });
    const r = await runHyperframes([cmd], { env, cwd: out, browser: browser.path });
    fs.writeFileSync(path.join(out, `${cmd}.log`), r.tail + "\n");
    if (r.code !== 0) throw new Error(`hyperframes ${cmd} found problems: ${r.tail.split("\n").slice(-6).join(" ")}`);
  }
  return { html, drift: drift.split(/\r?\n/).slice(-20).join("\n") };
}
