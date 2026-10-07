#!/usr/bin/env node
// fetch-icons.mjs: the icon sets (library/icons.json, DECISIONS 105) into
// <library>/icons/<id>.json, one file per family:
//   { id, label, license, version, grid: 24, icons: { <name>: { w: [search words], d: [path data] } } }
// and <id>.LICENSE next to it. Each tarball is checked against its pinned
// sha512 integrity before anything is read from it. Run by fetch-library.mjs;
// on its own: node scripts/fetch-icons.mjs [--out <dir>]

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { svgToPaths } from "../runner/icons/svg.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIST = path.join(ROOT, "library", "icons.json");

export const integrityOf = (buf) => `sha512-${createHash("sha512").update(buf).digest("base64")}`;

// Search words per icon, from the family's own metadata where it has some.
function tagsOf(dir, family) {
  if (!family.tags) return {};
  const raw = JSON.parse(fs.readFileSync(path.join(dir, family.tags.file), "utf8"));
  if (family.tags.shape === "lucide") return raw;
  // tabler: { name: { tags: [...], category } }
  return Object.fromEntries(Object.entries(raw).map(([name, v]) => [name, [...(v.tags ?? []), ...(v.category ? [v.category] : [])].map(String)]));
}

// Zoltan's rule (2026-09-24, runner.test.mjs repo hygiene): these third-party
// names never appear in the product, not even as an icon's search word. Built
// from parts so this file does not match itself.
const BANNED = [["hand", "raiser"], ["fran", "kie"], ["sun", "ny"], ["hot ", "formula"], ["er", "hart"]].map((p) => p.join(""));
const bannedRx = new RegExp(`(^|[^a-z])(${BANNED.join("|")})([^a-z]|$)`, "i");

export function buildFamily(dir, family) {
  const svgDir = path.join(dir, family.svgDir);
  const tags = tagsOf(dir, family);
  const icons = {};
  for (const f of fs.readdirSync(svgDir).filter((x) => x.endsWith(".svg")).sort()) {
    const name = f.slice(0, -4);
    if (bannedRx.test(name.replace(/-/g, " "))) continue;
    const d = svgToPaths(fs.readFileSync(path.join(svgDir, f), "utf8"));
    if (!d.length) continue;
    const words = [...new Set([...name.split("-"), ...(tags[name] ?? []).flatMap((t) => String(t).toLowerCase().split(/[\s-]+/))].filter((w) => w && !bannedRx.test(w)))];
    icons[name] = { w: words, d };
  }
  return { id: family.id, label: family.label, license: family.license, version: family.version, grid: 24, icons };
}

export async function fetchIcons({ out, fetchImpl = fetch, log = console.log } = {}) {
  const list = JSON.parse(fs.readFileSync(LIST, "utf8"));
  fs.mkdirSync(out, { recursive: true });
  for (const family of list.families) {
    const res = await fetchImpl(family.tarball);
    if (!res.ok) throw new Error(`icons: ${family.package} download failed (HTTP ${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    const got = integrityOf(buf);
    if (got !== family.integrity) throw new Error(`icons: integrity mismatch for ${family.package}@${family.version}: expected ${family.integrity}, got ${got}`);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "itv-icons-"));
    try {
      fs.writeFileSync(path.join(tmp, "p.tgz"), buf);
      const t = spawnSync("tar", ["-xzf", "p.tgz"], { cwd: tmp, encoding: "utf8" });
      if (t.status !== 0) throw new Error(`icons: could not unpack ${family.package}: ${t.stderr || t.error?.message}`);
      const built = buildFamily(tmp, family);
      fs.writeFileSync(path.join(out, `${family.id}.json`), JSON.stringify(built));
      fs.copyFileSync(path.join(tmp, "package", "LICENSE"), path.join(out, `${family.id}.LICENSE`));
      log(`icons: ${family.label} ${family.version}, ${Object.keys(built.icons).length} icons`);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
  return list.families.map((f) => f.id);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf("--out");
  const out = i > 0 ? process.argv[i + 1] : path.join(ROOT, "app", "src-tauri", "library", "icons");
  fetchIcons({ out }).catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
}
