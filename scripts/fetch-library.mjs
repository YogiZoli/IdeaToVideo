#!/usr/bin/env node
// fetch-library.mjs: builds the app's scene library (DECISIONS 48) into
//   app/src-tauri/library/components/<name>/{<name>.html, registry-item.json}
// from the HyperFrames registry (Apache-2.0) at the commit pinned in
// library/components.json. Every file is checked against library/library.lock.json
// (SHA256 of the file as downloaded); a mismatch fails the build.
//
// One change is made to each component on the way in: its GSAP <script> points
// at the local gsap.min.js next to the video's index.html, so checks and renders
// work offline. Same GSAP version (3.14.2) as the CDN one.
//
// Usage:
//   node scripts/fetch-library.mjs            download + verify (the build)
//   node scripts/fetch-library.mjs --update   download and (re)write the lock
//                                             (after changing components.json)

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const LIST = path.join(ROOT, "library", "components.json");
export const LOCK = path.join(ROOT, "library", "library.lock.json");
export const LIBRARY_DIR = path.join(ROOT, "app", "src-tauri", "library");

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

export function rawUrl(commit, name, file) {
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`Not a pinned commit: ${commit}`);
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`Bad component name: ${name}`);
  return `https://raw.githubusercontent.com/heygen-com/hyperframes/${commit}/registry/components/${name}/${file}`;
}

// The CDN GSAP inside a component becomes the local copy beside index.html.
export function localizeGsap(html) {
  return html.replace(/<script\s+src="https:\/\/cdn\.jsdelivr\.net\/npm\/gsap@[\d.]+\/dist\/gsap\.min\.js"><\/script>/g, '<script src="gsap.min.js"></script>');
}

async function get(url, fetchImpl) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function fetchLibrary({ update = false, fetchImpl = fetch, log = console.log, out = LIBRARY_DIR } = {}) {
  const list = JSON.parse(fs.readFileSync(LIST, "utf8"));
  const lock = update || !fs.existsSync(LOCK) ? { commit: list.commit, files: {} } : JSON.parse(fs.readFileSync(LOCK, "utf8"));
  if (!update && lock.commit !== list.commit) throw new Error("library.lock.json is for another commit. Run with --update.");
  const stage = `${out}.new`;
  fs.rmSync(stage, { recursive: true, force: true });
  for (const name of list.components) {
    for (const file of [`${name}.html`, "registry-item.json"]) {
      const url = rawUrl(list.commit, name, file);
      const buf = await get(url, fetchImpl);
      const key = `${name}/${file}`;
      const got = sha256(buf);
      if (update) lock.files[key] = got;
      else if (lock.files[key] !== got) throw new Error(`SHA256 mismatch for ${key}: expected ${lock.files[key]}, got ${got}`);
      const dst = path.join(stage, "components", name, file);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.writeFileSync(dst, file.endsWith(".html") ? localizeGsap(buf.toString("utf8")) : buf);
    }
    log(`library: ${name}`);
  }
  fs.writeFileSync(path.join(stage, "LIBRARY.json"), JSON.stringify({ source: list.source, commit: list.commit, components: list.components, license: "Apache-2.0 (HyperFrames by HeyGen)" }, null, 2) + "\n");
  if (update) fs.writeFileSync(LOCK, JSON.stringify(lock, null, 2) + "\n");
  fs.rmSync(out, { recursive: true, force: true });
  fs.renameSync(stage, out);
  return list.components;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fetchLibrary({ update: process.argv.includes("--update") })
    .then((c) => console.log(`library: ${c.length} components -> ${LIBRARY_DIR}`))
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    });
}
