#!/usr/bin/env node
// check-ffmpeg.mjs: proves the bundled ffmpeg can do what the pipeline needs
// (docs/ffmpeg.md): encoders, the VP9 decoder that keeps the HeyGen avatar's
// alpha, and the filters of the audio recipe (AUDIO.md), the avatar composite
// and the hyperframes self-check. Runs in CI on both platforms, so the macOS
// build from a different source is checked the same way.
//
// Usage: node scripts/check-ffmpeg.mjs [--dir app/src-tauri/ffmpeg]
// Exit code 0 only if everything is there.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { FFMPEG_DIR } from "./fetch-ffmpeg.mjs";

export const NEEDS = {
  encoders: ["libx264", "aac", "prores_ks", "libmp3lame"],
  decoders: ["libvpx-vp9", "h264", "mp3", "aac"],
  filters: ["overlay", "scale", "psnr", "loudnorm", "ebur128", "sidechaincompress", "amix", "afade", "atrim", "alphaextract", "signalstats"],
};

// `ffmpeg -encoders` lists " V....D libx264   ...": the name is the second column.
export function names(listing) {
  const out = new Set();
  let started = false;
  for (const line of listing.split(/\r?\n/)) {
    if (/^\s*-+\s*$/.test(line)) {
      started = true;
      continue;
    }
    if (!started) continue;
    const m = /^\s*\S+\s+(\S+)/.exec(line);
    if (m) out.add(m[1]);
  }
  return out;
}

export function missing(listings) {
  const gaps = [];
  for (const [kind, want] of Object.entries(NEEDS)) {
    const have = names(listings[kind] ?? "");
    for (const w of want) if (!have.has(w)) gaps.push(`${kind.slice(0, -1)} ${w}`);
  }
  return gaps;
}

function main(argv) {
  const dir = argv.includes("--dir") ? path.resolve(argv[argv.indexOf("--dir") + 1]) : FFMPEG_DIR;
  const exe = process.platform === "win32" ? ".exe" : "";
  const ffmpeg = path.join(dir, "ffmpeg" + exe);
  const ffprobe = path.join(dir, "ffprobe" + exe);
  for (const b of [ffmpeg, ffprobe]) {
    if (!fs.existsSync(b)) {
      console.error(`Not found: ${b}. Run: node scripts/fetch-sidecars.mjs`);
      process.exitCode = 1;
      return;
    }
  }
  const run = (bin, args) => execFileSync(bin, ["-hide_banner", ...args], { encoding: "utf8", maxBuffer: 1 << 26 });
  const version = run(ffmpeg, ["-version"]).split(/\r?\n/)[0];
  run(ffprobe, ["-version"]);
  const gaps = missing({ encoders: run(ffmpeg, ["-encoders"]), decoders: run(ffmpeg, ["-decoders"]), filters: run(ffmpeg, ["-filters"]) });
  console.log(version);
  if (gaps.length) {
    console.error(`Missing: ${gaps.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log("ffmpeg has everything the pipeline needs.");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
