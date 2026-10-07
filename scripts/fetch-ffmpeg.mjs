#!/usr/bin/env node
// fetch-ffmpeg.mjs: downloads the pinned ffmpeg + ffprobe the app ships with
// (DECISIONS 30, 43: the user never installs ffmpeg) into
//   app/src-tauri/ffmpeg/
// which tauri.conf.json bundles as a resource. The runner hands the two paths to
// hyperframes through HYPERFRAMES_FFMPEG_PATH / HYPERFRAMES_FFPROBE_PATH.
//
// Sources (docs/phase-2-plan.md, step 4):
//   Windows  BtbN GPL shared build, a month-end autobuild (BtbN keeps those;
//            the daily ones are deleted after a few weeks).
//   macOS    arm64: Martin Riedl's static release build (ffmpeg.martin-riedl.de).
//            The ffmpeg-static arm64 binary is really 6.0 and lacks overlay,
//            scale, loudnorm and other filters the pipeline needs (Mac v1 CI).
//            x64: eugeneware/ffmpeg-static GitHub release (BtbN has no macOS build).
// Every file is pinned by SHA256 (the digest GitHub shows for the release asset).
// A download that does not match is refused. Bumping = new URLs + new hashes.
//
// Usage:
//   node scripts/fetch-ffmpeg.mjs                 the host's target triple
//   node scripts/fetch-ffmpeg.mjs --target aarch64-apple-darwin

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const FFMPEG_DIR = path.join(ROOT, "app", "src-tauri", "ffmpeg");

const BTBN = "https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-08-31-13-27";
const BTBN_SOURCE = "https://github.com/BtbN/FFmpeg-Builds (build scripts), https://github.com/FFmpeg/FFmpeg/tree/n8.1.2 (source)";
const RIEDL = "https://ffmpeg.martin-riedl.de/download/macos/arm64/1789931890_9.0.2";
const RIEDL_SOURCE = "https://ffmpeg.martin-riedl.de (build scripts: https://gitlab.com/martinr92/ffmpeg), https://github.com/FFmpeg/FFmpeg/tree/n9.0.2 (source)";
const STATIC = "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1";
const STATIC_SOURCE = "https://github.com/eugeneware/ffmpeg-static (build scripts), https://github.com/FFmpeg/FFmpeg/tree/n6.1.1 (source)";

// kind "zip": one archive; its bin/ (minus ffplay) and LICENSE.txt are kept.
// kind "gz":  single binaries (gzipped, or a zip holding just that one file)
//             plus a plain license file.
export const FFMPEG_TARGETS = {
  "x86_64-pc-windows-msvc": {
    kind: "zip",
    version: "n8.1.2-50-g1a748fe2cd (BtbN GPL shared)",
    source: BTBN_SOURCE,
    files: [
      { url: `${BTBN}/ffmpeg-n8.1.2-50-g1a748fe2cd-win64-gpl-shared-8.1.zip`, sha256: "0a41f31caff48e3035b48f09f5d840bd8d1863008240fc43e457f15e589cf5b3" },
    ],
  },
  "aarch64-pc-windows-msvc": {
    kind: "zip",
    version: "n8.1.2-50-g1a748fe2cd (BtbN GPL shared)",
    source: BTBN_SOURCE,
    files: [
      { url: `${BTBN}/ffmpeg-n8.1.2-50-g1a748fe2cd-winarm64-gpl-shared-8.1.zip`, sha256: "9498c9cc25da7eab4f211b3a20bc85c318706d0634a449a9e5287eb4f9a59121" },
    ],
  },
  "aarch64-apple-darwin": {
    kind: "gz",
    version: "9.0.2 (Martin Riedl static release build, GPL)",
    source: RIEDL_SOURCE,
    files: [
      { url: `${RIEDL}/ffmpeg.zip`, sha256: "c8ed4c4e6978a03c485edbfe4e0a5dc2380f8a30bba5150531b31b094492d924", out: "ffmpeg" },
      { url: `${RIEDL}/ffprobe.zip`, sha256: "fcbe839537485eaee7a7a8bc5cbc0f90d53617e80943e8a5b2e31cb851197ea6", out: "ffprobe" },
      { url: "https://raw.githubusercontent.com/FFmpeg/FFmpeg/n9.0.2/COPYING.GPLv3", sha256: "8ceb4b9ee5adedde47b31e975c1d90c73ad27b6b165a1dcd80c7c545eb65b903", out: "LICENSE.txt" },
    ],
  },
  "x86_64-apple-darwin": {
    kind: "gz",
    version: "6.1.1 (ffmpeg-static b6.1.1, GPL static)",
    source: STATIC_SOURCE,
    files: [
      { url: `${STATIC}/ffmpeg-darwin-x64.gz`, sha256: "929b375c1182d956c51f7ac25e0b2b0411fb01f6f407aa15c9758efeb4242106", out: "ffmpeg" },
      { url: `${STATIC}/ffprobe-darwin-x64.gz`, sha256: "d4da574d6e2e197bd259b47d69cf262df9e312af24ad960444f6d806d3d4c186", out: "ffprobe" },
      { url: `${STATIC}/darwin-x64.LICENSE`, sha256: "2e1d16c72fd74e12063776371da757322f8b77589386532f4fd8634bde7de1af", out: "LICENSE.txt" },
    ],
  },
};

export function hostTriple() {
  const arch = { x64: "x86_64", arm64: "aarch64" }[process.arch];
  if (process.platform === "win32") return `${arch}-pc-windows-msvc`;
  if (process.platform === "darwin") return `${arch}-apple-darwin`;
  return `${arch}-unknown-linux-gnu`;
}

export function ffmpegTarget(triple) {
  const t = FFMPEG_TARGETS[triple];
  if (!t) throw new Error(`Unsupported ffmpeg target: ${triple}. Supported: ${Object.keys(FFMPEG_TARGETS).join(", ")}`);
  return t;
}

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
// One marker for the whole set: the hashes of every pinned file plus the triple.
const fingerprint = (triple) => sha256(Buffer.from(triple + ffmpegTarget(triple).files.map((f) => f.sha256).join(",")));

// bsdtar reads zip. It ships with Windows 10+ (System32) and macOS. On Windows the
// GNU tar of Git Bash may come first on PATH and cannot, so name System32's.
function bsdtar() {
  if (process.platform !== "win32") return "tar";
  return path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
}

async function download(file, fetchImpl) {
  const res = await fetchImpl(file.url);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status} for ${file.url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const got = sha256(buf);
  if (got !== file.sha256) throw new Error(`SHA256 mismatch for ${file.url}: expected ${file.sha256}, got ${got}`);
  return buf;
}

export async function fetchFfmpeg(triple, { fetchImpl = fetch, log = console.log, dir = FFMPEG_DIR } = {}) {
  const t = ffmpegTarget(triple);
  const marker = path.join(dir, ".fingerprint");
  if (fs.existsSync(marker) && fs.readFileSync(marker, "utf8").trim() === fingerprint(triple)) {
    log(`ffmpeg for ${triple}: already there`);
    return dir;
  }
  // Download and check everything first, so a bad hash leaves the old set alone.
  const bufs = [];
  for (const f of t.files) {
    log(`ffmpeg for ${triple}: downloading ${f.url}`);
    bufs.push(await download(f, fetchImpl));
  }
  // Unpack into a staging folder next to the target, swap in only when complete.
  const exe = triple.includes("windows") ? ".exe" : "";
  const stage = `${dir}.new`;
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });

  if (t.kind === "zip") {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "itv-ffmpeg-"));
    try {
      const archive = path.join(tmp, "ffmpeg.zip");
      fs.writeFileSync(archive, bufs[0]);
      execFileSync(bsdtar(), ["-xf", archive, "-C", tmp], { stdio: "inherit" });
      const top = fs.readdirSync(tmp).find((n) => n.startsWith("ffmpeg-") && fs.statSync(path.join(tmp, n)).isDirectory());
      if (!top) throw new Error("Unexpected archive layout: no ffmpeg-* folder");
      const bin = path.join(tmp, top, "bin");
      for (const name of fs.readdirSync(bin)) {
        if (/^ffplay/i.test(name)) continue; // a video player, not needed
        fs.copyFileSync(path.join(bin, name), path.join(stage, name));
      }
      fs.copyFileSync(path.join(tmp, top, "LICENSE.txt"), path.join(stage, "LICENSE.txt"));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  } else {
    t.files.forEach((f, i) => {
      if (f.url.endsWith(".zip")) {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "itv-ffmpeg-"));
        try {
          const archive = path.join(tmp, "one.zip");
          fs.writeFileSync(archive, bufs[i]);
          execFileSync(bsdtar(), ["-xf", archive, "-C", tmp, f.out], { stdio: "inherit" });
          fs.copyFileSync(path.join(tmp, f.out), path.join(stage, f.out));
        } finally {
          fs.rmSync(tmp, { recursive: true, force: true });
        }
        return;
      }
      const data = f.url.endsWith(".gz") ? zlib.gunzipSync(bufs[i]) : bufs[i];
      fs.writeFileSync(path.join(stage, f.out), data);
    });
  }

  for (const b of ["ffmpeg", "ffprobe"]) {
    const p = path.join(stage, b + exe);
    if (!fs.existsSync(p)) throw new Error(`${b}${exe} missing after unpacking`);
    fs.chmodSync(p, 0o755);
  }
  // GPL: version and where the source is, next to the binaries (ffmpeg.md).
  fs.writeFileSync(
    path.join(stage, "SOURCE.txt"),
    [`FFmpeg ${t.version}`, `Downloaded from: ${t.files.map((f) => f.url).join(" , ")}`, `Source code and build scripts: ${t.source}`, "License: GPL, see LICENSE.txt", ""].join("\n"),
  );
  fs.writeFileSync(path.join(stage, ".fingerprint"), fingerprint(triple) + "\n");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.renameSync(stage, dir);
  log(`ffmpeg for ${triple}: ${dir}`);
  return dir;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const triple = argv.includes("--target") ? argv[argv.indexOf("--target") + 1] : hostTriple();
  fetchFfmpeg(triple).catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
}
