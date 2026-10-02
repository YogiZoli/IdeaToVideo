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
// Also, from the same commit and lock: the FRAME.md of each frame preset
// (library/components.json "presets", the Brand wizard's gallery) into
// library/presets/<name>/FRAME.md. And the fonts (library/fonts.json, OFL,
// fontsource at a pinned version, own lock library/fonts.lock.json) into
// library/fonts/<id>/, with FONTS.json: the files and their unicode ranges.
// Every family must cover all 10 content languages (runner/brand/cmap.mjs),
// or the build fails. And library/presets.map.json as presets/MAP.json.
// So renders never fetch a font from the network (docs/wizards/brand.md 6).
//
// Usage:
//   node scripts/fetch-library.mjs            download + verify (the build)
//   node scripts/fetch-library.mjs --update   download and (re)write the lock
//                                             (after changing components.json)

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { codepoints, coverage } from "../runner/brand/cmap.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const LIST = path.join(ROOT, "library", "components.json");
export const LOCK = path.join(ROOT, "library", "library.lock.json");
export const LIBRARY_DIR = path.join(ROOT, "app", "src-tauri", "library");
export const FONT_LIST = path.join(ROOT, "library", "fonts.json");
export const FONT_LOCK = path.join(ROOT, "library", "fonts.lock.json");

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

export function rawUrl(commit, name, file) {
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`Not a pinned commit: ${commit}`);
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`Bad component name: ${name}`);
  if (!/^[a-z0-9-]+(\/[a-z0-9-]+)*\.[a-z0-9]+$/i.test(file)) throw new Error(`Bad file path in ${name}: ${file}`);
  return `https://raw.githubusercontent.com/heygen-com/hyperframes/${commit}/registry/components/${name}/${file}`;
}

export function presetUrl(commit, name) {
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`Not a pinned commit: ${commit}`);
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`Bad preset name: ${name}`);
  return `https://raw.githubusercontent.com/heygen-com/hyperframes/${commit}/skills/hyperframes-creative/frame-presets/${name}/FRAME.md`;
}

// fontsource on jsDelivr: a variable family is one file per subset
// ("<id>:vf@<v>/<subset>-wght-normal.woff2"), a static one a file per weight.
export function fontFiles(fam, version) {
  if (!/^[a-z0-9-]+$/.test(fam.id)) throw new Error(`Bad font id: ${fam.id}`);
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Not a pinned font version: ${version}`);
  const base = "https://cdn.jsdelivr.net/fontsource/fonts";
  return Object.entries(fam.subsets).flatMap(([subset, unicodeRange]) =>
    fam.wght
      ? [{ file: `${subset}-wght-normal.woff2`, url: `${base}/${fam.id}:vf@${version}/${subset}-wght-normal.woff2`, subset, unicodeRange, weight: `${fam.wght.min} ${fam.wght.max}` }]
      : fam.weights.map((w) => ({ file: `${subset}-${w}-normal.woff2`, url: `${base}/${fam.id}@${version}/${subset}-${w}-normal.woff2`, subset, unicodeRange, weight: String(w) })),
  );
}

export async function fetchFonts({ update = false, fetchImpl = fetch, log = console.log, out } = {}) {
  const list = JSON.parse(fs.readFileSync(FONT_LIST, "utf8"));
  const lock = update || !fs.existsSync(FONT_LOCK) ? { version: list.version, files: {} } : JSON.parse(fs.readFileSync(FONT_LOCK, "utf8"));
  if (!update && lock.version !== list.version) throw new Error("fonts.lock.json is for another version. Run with --update.");
  const families = [];
  for (const fam of list.families) {
    const dir = path.join(out, fam.id);
    fs.mkdirSync(dir, { recursive: true });
    const points = new Set();
    const files = [];
    const licenseUrl = `https://cdn.jsdelivr.net/npm/@fontsource/${fam.id}@${list.version}/LICENSE`;
    for (const f of [...fontFiles(fam, list.version), { file: "LICENSE", url: licenseUrl }]) {
      const buf = await get(f.url, fetchImpl);
      const key = `${fam.id}/${f.file}`;
      const got = sha256(buf);
      if (update) lock.files[key] = got;
      else if (lock.files[key] !== got) throw new Error(`SHA256 mismatch for ${key}: expected ${lock.files[key]}, got ${got}`);
      fs.writeFileSync(path.join(dir, f.file), buf);
      if (f.subset) {
        for (const c of codepoints(buf)) points.add(c);
        files.push({ file: f.file, subset: f.subset, weight: f.weight, unicodeRange: f.unicodeRange });
      }
    }
    // Every shipped family has every letter of the 10 content languages
    // (Zoltan, 2026-10-02): a font with gaps is left out, not flagged.
    const missing = Object.entries(coverage(points)).filter(([, gap]) => gap);
    if (missing.length) throw new Error(`${fam.family} lacks letters (${missing.map(([lang, gap]) => `${lang}: ${gap}`).join("; ")}). Remove it from library/fonts.json.`);
    families.push({ id: fam.id, family: fam.family, category: fam.category, variable: Boolean(fam.wght), files });
    log(`fonts: ${fam.family}`);
  }
  fs.writeFileSync(path.join(out, "FONTS.json"), JSON.stringify({ source: list.source, version: list.version, license: list.license, families }, null, 2) + "\n");
  if (update) fs.writeFileSync(FONT_LOCK, JSON.stringify(lock, null, 2) + "\n");
  return families;
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
    // registry-item.json first: it lists the component's files (the HTML, and
    // for some, assets such as fonts), every one of them pinned in the lock.
    const item = await get(rawUrl(list.commit, name, "registry-item.json"), fetchImpl);
    const files = JSON.parse(item.toString("utf8")).files?.map((f) => f.path) ?? [];
    if (!files.includes(`${name}.html`)) throw new Error(`${name}: registry-item.json does not list ${name}.html`);
    for (const file of ["registry-item.json", ...files]) {
      const url = rawUrl(list.commit, name, file);
      const buf = file === "registry-item.json" ? item : await get(url, fetchImpl);
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
  for (const name of list.presets ?? []) {
    const buf = await get(presetUrl(list.commit, name), fetchImpl);
    const key = `presets/${name}/FRAME.md`;
    const got = sha256(buf);
    if (update) lock.files[key] = got;
    else if (lock.files[key] !== got) throw new Error(`SHA256 mismatch for ${key}: expected ${lock.files[key]}, got ${got}`);
    const dst = path.join(stage, "presets", name, "FRAME.md");
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, buf);
  }
  fs.copyFileSync(path.join(ROOT, "library", "presets.map.json"), path.join(stage, "presets", "MAP.json"));
  log(`library: ${list.presets?.length ?? 0} presets`);
  await fetchFonts({ update, fetchImpl, log, out: path.join(stage, "fonts") });
  fs.writeFileSync(path.join(stage, "LIBRARY.json"), JSON.stringify({ source: list.source, commit: list.commit, components: list.components, presets: list.presets ?? [], license: "Apache-2.0 (HyperFrames by HeyGen); fonts OFL-1.1 (see fonts/<id>/LICENSE)" }, null, 2) + "\n");
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
