#!/usr/bin/env node
// fetch-canon.mjs: builds the runtime copy of the canon the app ships with
// (SPEC 3, docs/phase-2-plan.md step 2) into
//   app/src-tauri/canon/
// which tauri.conf.json bundles as a resource. The source is the pinned
// brand-frames submodule (vendor/brand-frames); the canon itself is never
// edited here. Changing the canon = a brand-frames PR + moving the submodule.
//
// What goes in: the pipeline scripts, the built archetype blocks, the block
// catalog and motion rules (the scene prompt reads them), and the hyperframes
// toolchain from the canon's own lockfile, without onnxruntime-node (DECISIONS
// 26: 208 MB, not needed for render, check or composite).
// What never goes in: Zoltan's own brand folders (zoltan-gero, voxflow), the
// archive, feedback, samplers, test renders (DECISIONS 18).
//
// Usage: node scripts/fetch-canon.mjs [--src vendor/brand-frames]
// Needs npm on PATH (the build machine only; the user never runs this).

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const CANON_DIR = path.join(ROOT, "app", "src-tauri", "canon");
export const CANON_SRC = path.join(ROOT, "vendor", "brand-frames");

export const PIPELINE_FILES = ["lib.mjs", "sentences.mjs", "stamp-timing.mjs", "image-audio-lint.mjs", "avatar-composite.mjs", "TIMING.md"];
export const BLOCK_ROOT_FILES = ["_blocks.mjs", "build-video.mjs", "_fontface.css", "CATALOG.md"];
export const DOC_FILES = ["MOTION.md", "AUDIO.md"];
// Removed from node_modules after install (DECISIONS 26).
export const STRIP = ["onnxruntime-node"];
// Must never appear in the bundle (DECISIONS 18).
export const FORBIDDEN_DIRS = ["zoltan-gero", "voxflow", "_archive", "_feedback"];

// A block folder is one that holds <name>.src.html (the archetype source).
export function blockNames(blocksDir) {
  return fs
    .readdirSync(blocksDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(blocksDir, d.name, `${d.name}.src.html`)))
    .map((d) => d.name)
    .sort();
}

function copy(src, dst) {
  if (!fs.existsSync(src)) throw new Error(`Missing in the canon: ${src}`);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

export function dirSize(dir) {
  let total = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return total;
}

function git(src, args) {
  return execFileSync("git", ["-C", src, ...args], { encoding: "utf8" }).trim();
}

// Copies the runtime files. Separate from the install so tests can run it.
export function copyCanon(src, out) {
  for (const f of PIPELINE_FILES) copy(path.join(src, "pipeline", f), path.join(out, "pipeline", f));
  const blocks = path.join(src, "zg-frames", "blocks");
  for (const f of BLOCK_ROOT_FILES) copy(path.join(blocks, f), path.join(out, "zg-frames", "blocks", f));
  const names = blockNames(blocks);
  for (const n of names) {
    for (const f of [`${n}.src.html`, `${n}.html`]) copy(path.join(blocks, n, f), path.join(out, "zg-frames", "blocks", n, f));
  }
  copy(path.join(src, "zg-frames", "hyperframes.json"), path.join(out, "zg-frames", "hyperframes.json"));
  for (const f of DOC_FILES) copy(path.join(src, f), path.join(out, f));
  for (const f of ["package.json", "package-lock.json"]) copy(path.join(src, f), path.join(out, f));
  return names;
}

function main(argv) {
  const src = argv.includes("--src") ? path.resolve(argv[argv.indexOf("--src") + 1]) : CANON_SRC;
  if (!fs.existsSync(path.join(src, "PIPELINE.md"))) {
    throw new Error(`No canon at ${src}. Run: git submodule update --init`);
  }
  const commit = git(src, ["rev-parse", "HEAD"]);
  const marker = path.join(CANON_DIR, "CANON.json");
  if (fs.existsSync(marker) && JSON.parse(fs.readFileSync(marker, "utf8")).commit === commit && !argv.includes("--force")) {
    console.log(`canon ${commit.slice(0, 7)}: already there`);
    return;
  }

  const stage = `${CANON_DIR}.new`;
  fs.rmSync(stage, { recursive: true, force: true });
  const names = copyCanon(src, stage);

  // The canon's own lockfile, so the app renders with the exact versions the
  // regress baseline was made with (DECISIONS 27).
  console.log("canon: npm ci (the hyperframes toolchain)");
  // npm is a .cmd on Windows, which only cmd.exe can start.
  const [cmd, pre] = process.platform === "win32" ? ["cmd.exe", ["/d", "/s", "/c", "npm"]] : ["npm", []];
  execFileSync(cmd, [...pre, "ci", "--no-audit", "--no-fund", "--loglevel=error"], { cwd: stage, stdio: "inherit" });
  for (const p of STRIP) fs.rmSync(path.join(stage, "node_modules", p), { recursive: true, force: true });

  for (const bad of FORBIDDEN_DIRS) {
    if (fs.existsSync(path.join(stage, bad))) throw new Error(`Forbidden folder in the canon bundle: ${bad}`);
  }
  const hf = JSON.parse(fs.readFileSync(path.join(stage, "node_modules", "hyperframes", "package.json"), "utf8")).version;
  const info = {
    commit,
    date: git(src, ["log", "-1", "--format=%cI"]),
    hyperframes: hf,
    blocks: names,
    sizeMb: Math.round(dirSize(stage) / 1e6),
  };
  fs.writeFileSync(path.join(stage, "CANON.json"), JSON.stringify(info, null, 2) + "\n");
  fs.rmSync(CANON_DIR, { recursive: true, force: true });
  fs.renameSync(stage, CANON_DIR);
  console.log(`canon ${commit.slice(0, 7)}: ${names.length} blocks, hyperframes ${hf}, ${info.sizeMb} MB -> ${CANON_DIR}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
