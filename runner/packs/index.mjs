// packs/index.mjs: block packs (.itvpack, DECISIONS 107). A pack is a zip
// of scene types someone designed (Zoltan's 39 archetypes are the first),
// imported per Identity:
//
//   <identity>/packs/<pack id>/pack.json        the manifest (PACK_SCHEMA)
//   <identity>/packs/<pack id>/blocks/<id>.html one self-contained block each
//   <identity>/packs/<pack id>/shared/fontface.css  the pack's font, once
//
// In a scene table a pack block is "<pack id>:<block id>". The build copies
// the block, puts the pack's font into the copy, gives it the scene's length
// and, when the pack follows the Identity's Brand, the brand's colours and
// font (fitPackBlock). Nothing of a pack is ever in the app's repo or
// installer: it lives in the user's Identity folder.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { unzipBuffer } from "./zip.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

export const PACK_SCHEMA = "itv-pack/1";
export const PACK_EXT = ".itvpack";
export const ROLES = ["opening", "statement", "emphasis", "proof", "list", "sketch", "closing", "relation", "contrast", "process", "detail", "footage", "cta"];
const ID = /^[a-z0-9][a-z0-9-]{0,40}$/;

export const packsDir = (identityDir) => path.join(identityDir, "packs");
export const isPackComponent = (name) => typeof name === "string" && name.includes(":");
const split = (name) => {
  const [pack, block] = String(name).split(":");
  return { pack, block };
};

// The manifest, checked. Throws one sentence per problem.
export function checkManifest(m) {
  const errors = [];
  if (!m || typeof m !== "object") throw new Error("pack.json is not an object.");
  if (m.schema !== PACK_SCHEMA) errors.push(`schema must be ${PACK_SCHEMA}`);
  if (!ID.test(String(m.id ?? ""))) errors.push("id: lowercase letters, digits and dashes");
  if (!m.name || typeof m.name !== "string") errors.push("name is missing");
  if (!["own", "brand"].includes(m.look ?? "own")) errors.push('look must be "own" or "brand"');
  if (!Array.isArray(m.blocks) || !m.blocks.length) errors.push("blocks must be a non-empty list");
  for (const b of m.blocks ?? []) {
    const at = `block ${b?.id ?? "?"}`;
    if (!ID.test(String(b?.id ?? ""))) errors.push(`${at}: id`);
    if (!ROLES.includes(b?.role)) errors.push(`${at}: role must be one of ${ROLES.join(", ")}`);
    if (!b?.label) errors.push(`${at}: label`);
    if (!Array.isArray(b?.variables)) errors.push(`${at}: variables`);
    if (!(b?.seconds > 0)) errors.push(`${at}: seconds`);
  }
  if (errors.length) throw new Error(`The pack is not valid: ${errors.slice(0, 6).join("; ")}.`);
  return m;
}

export function listPacks(identityDir) {
  const dir = identityDir ? packsDir(identityDir) : null;
  if (!dir || !fs.existsSync(dir)) return [];
  const out = [];
  for (const id of fs.readdirSync(dir).sort()) {
    try {
      const m = checkManifest(JSON.parse(fs.readFileSync(path.join(dir, id, "pack.json"), "utf8")));
      const state = readState(identityDir, m.id);
      out.push({ ...m, dir: path.join(dir, id), on: state.on, followBrand: state.followBrand ?? m.look === "brand", off: state.off ?? [] });
    } catch {
      // a broken pack is skipped, never fatal
    }
  }
  return out;
}

// Per Identity: is the pack on, does it follow the Identity's Brand, which
// of its blocks are turned off. <identity>/packs/<id>/state.json
const stateFile = (identityDir, id) => path.join(packsDir(identityDir), id, "state.json");
export function readState(identityDir, id) {
  try {
    return { on: true, ...JSON.parse(fs.readFileSync(stateFile(identityDir, id), "utf8")) };
  } catch {
    return { on: true };
  }
}
export function writeState(identityDir, id, state) {
  if (!fs.existsSync(path.join(packsDir(identityDir), id))) throw new Error("There is no such pack.");
  const clean = { on: state.on !== false, followBrand: Boolean(state.followBrand), off: [...new Set((state.off ?? []).filter((x) => ID.test(x)))] };
  fs.writeFileSync(stateFile(identityDir, id), JSON.stringify(clean, null, 2) + "\n");
  return clean;
}

// The blocks the planner may use: every block of every pack that is on, not
// turned off, and not in need of something the video does not have.
export function packCatalog(identityDir, { hasFootage = false } = {}) {
  return listPacks(identityDir)
    .filter((p) => p.on)
    .flatMap((p) =>
      p.blocks
        .filter((b) => !p.off.includes(b.id) && (!(b.needs ?? []).includes("footage") || hasFootage))
        .map((b) => ({ name: `${p.id}:${b.id}`, role: b.role, label: b.label, description: b.what ?? "", variables: b.variables, realOnly: Boolean(b.realOnly), pack: p.name })),
    );
}

// A style preset can bring its own pack, in its folder (runner/presets/<id>/pack).
// Unlike an imported pack it ships with the app, it belongs to that preset: its
// blocks are never offered to the catalog plan or to another channel, and it keeps
// its own look. `runtime` names libraries from the engine, `script` the pack's own
// shared code; both go on the root page.
const presetsDir = path.join(here, "..", "presets");
let builtin = null;
export function builtinPacks() {
  if (builtin) return builtin;
  builtin = [];
  for (const e of fs.readdirSync(presetsDir, { withFileTypes: true })) {
    const dir = path.join(presetsDir, e.name, "pack");
    if (!e.isDirectory() || !fs.existsSync(path.join(dir, "pack.json"))) continue;
    builtin.push({ ...checkManifest(JSON.parse(fs.readFileSync(path.join(dir, "pack.json"), "utf8"))), dir, builtin: true, on: true, off: [] });
  }
  return builtin;
}

// One block for the build: { html, item, pack } (item: name + variables, the
// registry-item shape the checks use).
export function loadPackBlock(name, identityDir) {
  const { pack, block } = split(name);
  const p = builtinPacks().find((x) => x.id === pack) ?? listPacks(identityDir).find((x) => x.id === pack);
  if (!p) throw new Error(`The pack ${pack} is not in this Identity. Import it in Settings, Import & Export.`);
  const b = p.blocks.find((x) => x.id === block);
  if (!b) throw new Error(`The pack ${p.name} has no block ${block}.`);
  const file = path.join(p.dir, "blocks", `${block}.html`);
  if (!fs.existsSync(file)) throw new Error(`The pack ${p.name} is missing ${block}.html. Import it again.`);
  const shared = path.join(p.dir, "shared", "fontface.css");
  return {
    html: fs.readFileSync(file, "utf8"),
    fontface: fs.existsSync(shared) ? fs.readFileSync(shared, "utf8") : "",
    item: { name, variables: b.variables },
    block: b,
    pack: p,
  };
}

const r3 = (x) => Math.round(x * 1000) / 1000;

// The build copy of a pack block for one scene: the pack's font inside it
// (a mounted block does not see the page's @font-face reliably), the scene's
// length (the camera and the idle use it; entrances are pulled in when the
// scene is shorter than the block was drawn for), and, when the pack follows
// the Brand, the Identity's colours and display font over the pack's tokens.
export function fitPackBlock(html, { fontface = "", seconds, drawn, theme = null, family = null, icons = null }) {
  let out = html;
  // a pack made before window.ITV_ICONS (scripts/make-pack.mjs) draws nothing
  // for an icon outside its own set: the same one-line change, here, in the
  // build copy only (the pack's files stay untouched)
  out = out.replace(/var p = P\[e\.dataset\.icon\];/, "var p = P[e.dataset.icon] || (window.ITV_ICONS || {})[e.dataset.icon];");
  // icons an icon variable names beyond the block's own set (window.ITV_ICONS)
  if (icons && Object.keys(icons).length) out = out.replace(/<script>/, `<script>window.ITV_ICONS = Object.assign(window.ITV_ICONS || {}, ${JSON.stringify(icons)});</script>
<script>`);
  if (fontface) out = out.replace(/<style>/, `<style>\n${fontface}\n`);
  out = out.replace(/data-scene-dur="[\d.]+"/g, `data-scene-dur="${r3(seconds)}"`);
  const k = drawn && seconds < drawn ? seconds / drawn : 1;
  if (k < 1) out = out.replace(/data-at="([\d.]+)"/g, (_, v) => `data-at="${r3(Number(v) * k)}"`);
  if (theme) {
    const map = { "--bg": theme.bg, "--bg-w": theme.bg, "--card": theme.surface, "--navy": theme.fg, "--sub": theme.muted, "--muted": theme.muted, "--label": theme.muted, "--line": theme.border, "--blue": theme.brand, "--green": theme.accent, "--cta": theme.accent, "--green-dk": theme.fg };
    const vars = Object.entries(map).filter(([, v]) => v).map(([k2, v]) => `${k2}: ${v} !important;`).join(" ");
    const font = family ? ` [data-composition-id] * { font-family: "${String(family).replace(/["\\]/g, "")}", system-ui, sans-serif !important; }` : "";
    out = out.replace(/<style>/, `<style>\n:root, [data-composition-id] { ${vars} }${font}\n`);
  }
  return out;
}

// A pack file, read and checked: { manifest, files: [{ name, data }] }.
// Only pack.json, blocks/<id>.html, shared/*.css and previews/<id>.(png|jpg).
export function readPackFile(file) {
  const entries = unzipBuffer(fs.readFileSync(file));
  const get = (n) => entries.find((e) => e.name === n);
  const mf = get("pack.json");
  if (!mf) throw new Error("This is not an IdeaToVideo pack: pack.json is missing.");
  const manifest = checkManifest(JSON.parse(mf.data.toString("utf8")));
  const ok = (n) => n === "pack.json" || /^blocks\/[a-z0-9-]+\.html$/.test(n) || /^shared\/[a-z0-9-]+\.css$/.test(n) || /^previews\/[a-z0-9-]+\.(png|jpe?g)$/.test(n);
  const bad = entries.filter((e) => !ok(e.name)).map((e) => e.name);
  if (bad.length) throw new Error(`The pack has files a pack never has: ${bad.slice(0, 3).join(", ")}.`);
  for (const b of manifest.blocks) if (!get(`blocks/${b.id}.html`)) throw new Error(`The pack lists ${b.id}, but blocks/${b.id}.html is missing.`);
  return { manifest, files: entries };
}

// Import: the pack into <identity>/packs/<id>/, replacing an older copy of
// the same pack (its on/off state is kept).
export function importPack(identityDir, file) {
  const { manifest, files } = readPackFile(file);
  const dir = path.join(packsDir(identityDir), manifest.id);
  const keep = fs.existsSync(stateFile(identityDir, manifest.id)) ? fs.readFileSync(stateFile(identityDir, manifest.id)) : null;
  const stage = `${dir}.new`;
  fs.rmSync(stage, { recursive: true, force: true });
  for (const f of files) {
    const to = path.join(stage, ...f.name.split("/"));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(to, f.data);
  }
  if (keep) fs.writeFileSync(path.join(stage, "state.json"), keep);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.renameSync(stage, dir);
  return { id: manifest.id, name: manifest.name, blocks: manifest.blocks.length };
}

export function removePack(identityDir, id) {
  if (!ID.test(String(id))) throw new Error("There is no such pack.");
  const dir = path.join(packsDir(identityDir), id);
  if (!fs.existsSync(dir)) throw new Error("There is no such pack.");
  fs.rmSync(dir, { recursive: true, force: true });
  return { removed: id };
}

// Export: the pack as it was imported (without this Identity's on/off state).
export async function exportPack(identityDir, id, out) {
  const p = listPacks(identityDir).find((x) => x.id === id);
  if (!p) throw new Error("There is no such pack.");
  const { zipBuffers } = await import("./zip.mjs");
  const entries = [];
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(p.dir, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(r);
      else if (r !== "state.json") entries.push({ name: r, data: fs.readFileSync(path.join(p.dir, ...r.split("/"))) });
    }
  };
  walk("");
  entries.sort((a, b) => (a.name === "pack.json" ? -1 : b.name === "pack.json" ? 1 : a.name.localeCompare(b.name)));
  const file = out.toLowerCase().endsWith(PACK_EXT) ? out : `${out}${PACK_EXT}`;
  fs.writeFileSync(file, zipBuffers(entries));
  return { file, blocks: p.blocks.length };
}

// The pack blocks this Identity may use, made known to the scene table's
// checks and the planner for one command (roles.mjs PACK_COMPONENTS).
export async function registerPacks(identityDir, { hasFootage = false } = {}) {
  const { PACK_COMPONENTS } = await import("../gates/scenes/roles.mjs");
  PACK_COMPONENTS.clear();
  for (const p of builtinPacks()) {
    for (const b of p.blocks) {
      const text = b.variables.filter((v) => v.type === "string" && !v.optional);
      PACK_COMPONENTS.set(`${p.id}:${b.id}`, { role: b.role, label: `${b.label} (${p.name})`, mainVar: text[0]?.id ?? null, words: Object.fromEntries(b.variables.filter((v) => v.maxWords).map((v) => [v.id, v.maxWords])), description: b.what ?? "", variables: b.variables, pack: true, presetOnly: true, camera: "3D move, its own" });
    }
  }
  if (!identityDir) return PACK_COMPONENTS.size;
  for (const b of packCatalog(identityDir, { hasFootage })) {
    const text = b.variables.filter((v) => v.type === "string" && !v.optional);
    PACK_COMPONENTS.set(b.name, {
      role: b.role,
      label: `${b.label} (${b.pack})`,
      mainVar: text[0]?.id ?? null,
      words: Object.fromEntries(b.variables.filter((v) => v.maxWords).map((v) => [v.id, v.maxWords])),
      description: b.description,
      variables: b.variables,
      realOnly: b.realOnly,
      pack: true,
    });
  }
  return PACK_COMPONENTS.size;
}
