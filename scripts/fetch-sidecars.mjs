#!/usr/bin/env node
// fetch-sidecars.mjs: downloads the pinned Node binary the app ships with
// (DECISIONS 26: the user never installs Node) and places it where Tauri's
// `externalBin` expects it:
//   app/src-tauri/binaries/node-<target-triple>[.exe]
// Then the pinned ffmpeg + ffprobe for the same target (fetch-ffmpeg.mjs).
// With --all only Node is fetched: the ffmpeg folder holds one target at a time.
//
// Usage:
//   node scripts/fetch-sidecars.mjs                 the host's target triple
//   node scripts/fetch-sidecars.mjs --target aarch64-apple-darwin
//   node scripts/fetch-sidecars.mjs --all           every supported target
//
// The SHA256 of every archive is pinned below, taken once from
// https://nodejs.org/dist/v24.16.0/SHASUMS256.txt. A download that does not
// match is deleted and the script fails. Bumping Node = new version + new hashes.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { fetchFfmpeg } from "./fetch-ffmpeg.mjs";

export const NODE_VERSION = "24.16.0";

// target triple -> nodejs.org file, pinned SHA256, and the binary inside it.
export const TARGETS = {
  "x86_64-pc-windows-msvc": {
    file: "win-x64/node.exe",
    sha256: "b3094d0b49f9ad602262a9921551737bb97637c05dd357a06ae98188d7290aa3",
    inner: null,
  },
  "aarch64-pc-windows-msvc": {
    file: "win-arm64/node.exe",
    sha256: "6694c2553f41d6b7cd6e396536e9ad5a9f4e1b898d59e4e0ec5de127096eb6db",
    inner: null,
  },
  "aarch64-apple-darwin": {
    file: `node-v${NODE_VERSION}-darwin-arm64.tar.gz`,
    sha256: "39189dab4eeb15706c424af0ac08a3044c9e48f7db12a7d77f6b7aafc7dd5df6",
    inner: `node-v${NODE_VERSION}-darwin-arm64/bin/node`,
  },
  "x86_64-apple-darwin": {
    file: `node-v${NODE_VERSION}-darwin-x64.tar.gz`,
    sha256: "298b4c7b3cb80765c8703e42b90324a4ece3b6634947b89e769c3c980ab55185",
    inner: `node-v${NODE_VERSION}-darwin-x64/bin/node`,
  },
};

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const BIN_DIR = path.join(ROOT, "app", "src-tauri", "binaries");

export function hostTriple() {
  const arch = { x64: "x86_64", arm64: "aarch64" }[process.arch];
  if (process.platform === "win32") return `${arch}-pc-windows-msvc`;
  if (process.platform === "darwin") return `${arch}-apple-darwin`;
  return `${arch}-unknown-linux-gnu`;
}

export function outputName(triple) {
  return `node-${triple}${triple.includes("windows") ? ".exe" : ""}`;
}

export function downloadUrl(triple) {
  const t = TARGETS[triple];
  if (!t) throw new Error(`Unsupported target: ${triple}. Supported: ${Object.keys(TARGETS).join(", ")}`);
  return `https://nodejs.org/dist/v${NODE_VERSION}/${t.file}`;
}

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

// Already there with the right version? Then nothing to do. A foreign binary
// (other OS) cannot be run, so for those only the pinned hash marker counts.
function upToDate(triple, dest) {
  const marker = dest + ".sha256";
  return fs.existsSync(dest) && fs.existsSync(marker) && fs.readFileSync(marker, "utf8").trim() === TARGETS[triple].sha256;
}

export async function fetchSidecar(triple, { fetchImpl = fetch, log = console.log } = {}) {
  const t = TARGETS[triple];
  const url = downloadUrl(triple);
  const dest = path.join(BIN_DIR, outputName(triple));
  if (upToDate(triple, dest)) {
    log(`node ${NODE_VERSION} for ${triple}: already there`);
    return dest;
  }
  fs.mkdirSync(BIN_DIR, { recursive: true });
  log(`node ${NODE_VERSION} for ${triple}: downloading ${url}`);
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const got = sha256(buf);
  if (got !== t.sha256) throw new Error(`SHA256 mismatch for ${url}: expected ${t.sha256}, got ${got}`);

  if (!t.inner) {
    fs.writeFileSync(dest, buf);
  } else {
    // tar ships with macOS, Linux and Windows 10+ (bsdtar), so no extra dependency.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "studio-node-"));
    try {
      const archive = path.join(tmp, path.basename(t.file));
      fs.writeFileSync(archive, buf);
      execFileSync("tar", ["-xzf", archive, "-C", tmp, t.inner], { stdio: "inherit" });
      fs.copyFileSync(path.join(tmp, t.inner), dest);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
  fs.chmodSync(dest, 0o755);
  fs.writeFileSync(dest + ".sha256", t.sha256 + "\n");
  log(`node ${NODE_VERSION} for ${triple}: ${dest}`);
  return dest;
}

async function main(argv) {
  let triples;
  if (argv.includes("--all")) triples = Object.keys(TARGETS);
  else if (argv.includes("--target")) triples = [argv[argv.indexOf("--target") + 1]];
  else triples = [hostTriple()];
  for (const t of triples) await fetchSidecar(t);
  if (!argv.includes("--all")) await fetchFfmpeg(triples[0]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
}
