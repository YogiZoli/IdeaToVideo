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
// Every component passes the licence check (checkLicense) and must be in
// library/catalog.json, which goes in as CATALOG.json.
// And for the Motion wizard (library/components.json "motion"): the background
// components into components/, and HyperFrames' transition registry and
// transition overview into motion/.
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

import { fetchIcons } from "./fetch-icons.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const LIST = path.join(ROOT, "library", "components.json");
export const LOCK = path.join(ROOT, "library", "library.lock.json");
export const CATALOG = path.join(ROOT, "library", "catalog.json");
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

// HyperFrames' own files the Motion wizard takes: only these two, so a typo in
// components.json cannot pull anything else from the repo.
export const MOTION_FILES = ["skills/faceless-explainer/scripts/lib/transitions.json", "skills/hyperframes-animation/transitions/overview.md"];

export function skillUrl(commit, file) {
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`Not a pinned commit: ${commit}`);
  if (!MOTION_FILES.includes(file)) throw new Error(`Not a HyperFrames file the Motion wizard takes: ${file}`);
  return `https://raw.githubusercontent.com/heygen-com/hyperframes/${commit}/${file}`;
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

export const OD_LIST = path.join(ROOT, "library", "opendesign.json");
export const OD_LOCK = path.join(ROOT, "library", "opendesign.lock.json");

export function openDesignUrl(commit, file) {
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`Not a pinned commit: ${commit}`);
  if (!/^(LICENSE|design-systems\/[a-z0-9-]+\/(manifest\.json|tokens\.css))$/.test(file)) throw new Error(`Not an open-design file we take: ${file}`);
  return `https://raw.githubusercontent.com/nexu-io/open-design/${commit}/${file}`;
}

// open-design's design systems (the gallery's second source): only each
// system's manifest.json and tokens.css, and the repo's LICENSE.
export async function fetchOpenDesign({ update = false, fetchImpl = fetch, log = console.log, out } = {}) {
  const list = JSON.parse(fs.readFileSync(OD_LIST, "utf8"));
  const lock = update || !fs.existsSync(OD_LOCK) ? { commit: list.commit, files: {} } : JSON.parse(fs.readFileSync(OD_LOCK, "utf8"));
  if (!update && lock.commit !== list.commit) throw new Error("opendesign.lock.json is for another commit. Run with --update.");
  const files = ["LICENSE", ...list.systems.flatMap((id) => [`design-systems/${id}/manifest.json`, `design-systems/${id}/tokens.css`])];
  // a few at a time: 300 small files
  for (let i = 0; i < files.length; i += 12) {
    await Promise.all(
      files.slice(i, i + 12).map(async (file) => {
        const buf = await get(openDesignUrl(list.commit, file), fetchImpl);
        const got = sha256(buf);
        if (update) lock.files[file] = got;
        else if (lock.files[file] !== got) throw new Error(`SHA256 mismatch for open-design ${file}: expected ${lock.files[file]}, got ${got}`);
        const dst = path.join(out, file.replace(/^design-systems\//, ""));
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        // Checked as downloaded, shipped reduced to facts: tokens.css without
        // its comments (they describe the brands), manifest.json with only the
        // name and the category. No brand prose goes into the app.
        if (file.endsWith("tokens.css")) fs.writeFileSync(dst, buf.toString("utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\n\s*\n+/g, "\n"));
        else if (file.endsWith("manifest.json")) {
          const m = JSON.parse(buf.toString("utf8"));
          fs.writeFileSync(dst, JSON.stringify({ id: m.id, name: m.name, category: m.category }, null, 2) + "\n");
        } else fs.writeFileSync(dst, buf);
      }),
    );
  }
  fs.writeFileSync(path.join(out, "SOURCE.json"), JSON.stringify({ source: list.source, commit: list.commit, license: list.license, systems: list.systems }, null, 2) + "\n");
  if (update) {
    lock.files = Object.fromEntries(Object.entries(lock.files).sort(([a], [b]) => a.localeCompare(b)));
    fs.writeFileSync(OD_LOCK, JSON.stringify(lock, null, 2) + "\n");
  }
  log(`library: ${list.systems.length} open-design systems`);
  return list.systems;
}

// The licence check (library/components.json "licenses"): an item with no
// licence of its own is under the registry's Apache-2.0; one that names
// another licence, and every font file an item carries, must be listed with
// its licence (THIRD-PARTY-NOTICES.md names them), or the build fails.
export const FONT_FILE = /\.(woff2?|ttf|otf)$/i;
export function checkLicense(name, item, licenses = {}) {
  if (item.license && item.license !== "Apache-2.0" && !licenses.items?.[name]) throw new Error(`${name} is under ${item.license}, not Apache-2.0: list it in library/components.json "licenses.items" with its licence, or leave it out.`);
  for (const f of item.files ?? []) {
    const base = path.posix.basename(f.path);
    if (FONT_FILE.test(base) && !licenses.fonts?.[base]) throw new Error(`${name} carries the font ${base}: list it in library/components.json "licenses.fonts" with its licence, or leave the component out.`);
  }
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
  // The Motion wizard's background components go in beside the scene
  // components (same mount contract); the scene table never sees them
  // (runner/gates/scenes/roles.mjs lists the scene components).
  for (const name of new Set([...list.components, ...(list.motion?.backgrounds ?? [])])) {
    // registry-item.json first: it lists the component's files (the HTML, and
    // for some, assets such as fonts), every one of them pinned in the lock.
    const item = await get(rawUrl(list.commit, name, "registry-item.json"), fetchImpl);
    const meta = JSON.parse(item.toString("utf8"));
    checkLicense(name, meta, list.licenses);
    const files = meta.files?.map((f) => f.path) ?? [];
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
  // Caption styles (DECISIONS 106): the component file and its preview
  // picture, both pinned in the lock.
  for (const name of list.captions ?? []) {
    const item = await get(rawUrl(list.commit, name, "registry-item.json"), fetchImpl);
    const meta = JSON.parse(item.toString("utf8"));
    checkLicense(name, meta, list.licenses);
    // every file the item lists (the HTML, and assets such as textures)
    const files = meta.files?.map((f) => f.path) ?? [`${name}.html`];
    if (!files.includes(`${name}.html`)) throw new Error(`${name}: registry-item.json does not list ${name}.html`);
    const parts = [["registry-item.json", item], ...files.map((f) => [f, null])];
    if (meta.preview?.poster) parts.push(["preview.png", null]);
    for (const [file, have] of parts) {
      const buf = have ?? (file === "preview.png" ? await get(meta.preview.poster, fetchImpl) : await get(rawUrl(list.commit, name, file), fetchImpl));
      const key = `captions/${name}/${file}`;
      const got = sha256(buf);
      if (update) lock.files[key] = got;
      else if (lock.files[key] !== got) throw new Error(`SHA256 mismatch for ${key}: expected ${lock.files[key]}, got ${got}`);
      const dst = path.join(stage, key);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.writeFileSync(dst, file.endsWith(".html") ? localizeGsap(buf.toString("utf8")) : buf);
    }
  }
  log(`library: ${list.captions?.length ?? 0} caption styles`);
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
  for (const file of list.motion?.files ?? []) {
    const buf = await get(skillUrl(list.commit, file), fetchImpl);
    const key = `motion/${path.basename(file)}`;
    const got = sha256(buf);
    if (update) lock.files[key] = got;
    else if (lock.files[key] !== got) throw new Error(`SHA256 mismatch for ${key}: expected ${lock.files[key]}, got ${got}`);
    const dst = path.join(stage, key);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, buf);
  }
  log(`library: ${list.motion?.backgrounds?.length ?? 0} backgrounds, ${list.motion?.files?.length ?? 0} motion files`);
  log(`library: ${list.presets?.length ?? 0} presets`);
  await fetchFonts({ update, fetchImpl, log, out: path.join(stage, "fonts") });
  await fetchOpenDesign({ update, fetchImpl, log, out: path.join(stage, "opendesign") });
  await fetchIcons({ fetchImpl, log, out: path.join(stage, "icons") });
  // The scene catalog (library/catalog.json, DECISIONS 130): what each
  // component is for, written from its files and its test renders; the
  // planner reads it. It must name exactly the bundled components.
  const catalog = JSON.parse(fs.readFileSync(CATALOG, "utf8"));
  const named = Object.keys(catalog.components ?? {});
  const missing = list.components.filter((c) => !named.includes(c));
  const extra = named.filter((c) => !list.components.includes(c));
  if (missing.length || extra.length) throw new Error(`library/catalog.json does not match the component list (missing: ${missing.join(", ") || "none"}; extra: ${extra.join(", ") || "none"}).`);
  fs.copyFileSync(CATALOG, path.join(stage, "CATALOG.json"));
  fs.writeFileSync(path.join(stage, "LIBRARY.json"), JSON.stringify({ source: list.source, commit: list.commit, components: list.components, presets: list.presets ?? [], backgrounds: list.motion?.backgrounds ?? [], license: "Apache-2.0 (HyperFrames by HeyGen); kinetic-center-build MIT (Remocn); fonts OFL-1.1 or Apache-2.0 (see fonts/<id>/LICENSE and THIRD-PARTY-NOTICES.md)" }, null, 2) + "\n");
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
