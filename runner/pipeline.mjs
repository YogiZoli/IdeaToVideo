// pipeline.mjs: runs the canon's own scripts (PIPELINE.md) on a project. The
// scripts are the bundled canon's (tools.mjs canonDir), started with our node,
// with the clean child env. Nothing here re-implements a canon step.

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { canonDir, childEnv } from "./tools.mjs";

export function runCanonScript(rel, args, { env = process.env, cwd } = {}) {
  const script = path.join(canonDir(env), rel);
  if (!fs.existsSync(script)) return Promise.reject(new Error(`The video engine is missing a part (${rel}). Reinstall the app.`));
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [script, ...args], { cwd: cwd ?? path.dirname(script), env: childEnv({ env }), windowsHide: true });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("error", reject);
    // eslint-disable-next-line no-control-regex
    const clean = () => out.replace(/\x1b\[[0-9;]*m/g, "").trim();
    p.on("close", (code) => (code === 0 ? resolve(clean()) : reject(new Error(`${rel} failed: ${clean().split(/\r?\n/).slice(-4).join(" ")}`))));
  });
}

// Step 3 (no gate: a measurement of the approved audio): audio/stt.json ->
// sentences.json, words.json, sentences.md in the project root (SPEC 4.3).
export async function sentenceTable(projectDir, { env = process.env } = {}) {
  const stt = path.join(projectDir, "audio", "stt.json");
  if (!fs.existsSync(stt)) throw new Error("There is no voice yet, so there is nothing to time.");
  await runCanonScript("pipeline/sentences.mjs", ["--stt", stt, "--outdir", projectDir], { env });
  const sentences = JSON.parse(fs.readFileSync(path.join(projectDir, "sentences.json"), "utf8"));
  return { sentences: sentences.length };
}
