#!/usr/bin/env node
// fetch-engine.mjs: builds the render toolchain the app ships with into
//   app/src-tauri/engine/
// which tauri.conf.json bundles as a resource: the HyperFrames engine and GSAP
// at the versions pinned in engine/package-lock.json, without onnxruntime-node
// (DECISIONS 26: 208 MB, not needed for render, check or composite), and three.js
// for the presets that draw in 3D, reduced to the one file a build reads.
//
// The app's own library (scene types from the HyperFrames registry) and all
// pipeline code live in this repo (DECISIONS 48).
//
// Usage: node scripts/fetch-engine.mjs [--force]
// Needs npm on PATH (the build machine only; the user never runs this).

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const ENGINE_SRC = path.join(ROOT, "engine");
export const ENGINE_DIR = path.join(ROOT, "app", "src-tauri", "engine");
export const STRIP = ["onnxruntime-node"];

export function dirSize(dir) {
  let total = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return total;
}

export function lockHash() {
  return createHash("sha256").update(fs.readFileSync(path.join(ENGINE_SRC, "package-lock.json"))).digest("hex").slice(0, 16);
}

// A build only reads three.cjs (gates/build/assemble.mjs packScripts). The rest of the
// package is 19 MB of examples and other formats; its license stays with it.
export const THREE_KEEP = ["LICENSE", "package.json", "build/three.cjs"];
export function trimThree(dir) {
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        walk(r);
        if (!fs.readdirSync(path.join(dir, r)).length) fs.rmdirSync(path.join(dir, r));
      } else if (!THREE_KEEP.includes(r)) fs.rmSync(path.join(dir, r));
    }
  };
  walk("");
}

function main(argv) {
  const lock = lockHash();
  const marker = path.join(ENGINE_DIR, "ENGINE.json");
  if (!argv.includes("--force") && fs.existsSync(marker) && JSON.parse(fs.readFileSync(marker, "utf8")).lock === lock) {
    console.log(`engine ${lock}: already there`);
    return;
  }
  const stage = `${ENGINE_DIR}.new`;
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  for (const f of ["package.json", "package-lock.json"]) fs.copyFileSync(path.join(ENGINE_SRC, f), path.join(stage, f));
  console.log("engine: npm ci (HyperFrames, GSAP)");
  // npm is a .cmd on Windows, which only cmd.exe can start.
  const [cmd, pre] = process.platform === "win32" ? ["cmd.exe", ["/d", "/s", "/c", "npm"]] : ["npm", []];
  execFileSync(cmd, [...pre, "ci", "--no-audit", "--no-fund", "--loglevel=error"], { cwd: stage, stdio: "inherit" });
  for (const p of STRIP) fs.rmSync(path.join(stage, "node_modules", p), { recursive: true, force: true });
  trimThree(path.join(stage, "node_modules", "three"));
  const ver = (p) => JSON.parse(fs.readFileSync(path.join(stage, "node_modules", p, "package.json"), "utf8")).version;
  const info = { lock, hyperframes: ver("hyperframes"), gsap: ver("gsap"), sizeMb: Math.round(dirSize(stage) / 1e6) };
  fs.writeFileSync(path.join(stage, "ENGINE.json"), JSON.stringify(info, null, 2) + "\n");
  fs.rmSync(ENGINE_DIR, { recursive: true, force: true });
  fs.renameSync(stage, ENGINE_DIR);
  console.log(`engine ${lock}: hyperframes ${info.hyperframes}, gsap ${info.gsap}, ${info.sizeMb} MB -> ${ENGINE_DIR}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
