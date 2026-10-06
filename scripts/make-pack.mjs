#!/usr/bin/env node
// make-pack.mjs: builds a block pack (.itvpack, DECISIONS 107) from a folder
// of self-contained HyperFrames blocks and a pack source file. A tool for the
// one who designs a pack (Zoltan's 39 archetypes are the first), not part of
// the app. The blocks folder is only read.
//
//   node scripts/make-pack.mjs --src <pack.src.json> --out <file.itvpack>
//
// pack.src.json: { id, name, author, version, look: "own" | "brand", neutral?,
//   description, blocksDir, blocks: { <id>: { role, label, what, needs?,
//   realOnly?, optional?: [variable ids] } } }
//
// For every block: the built <id>/<id>.html is copied, its embedded
// @font-face rules are taken out (kept once in shared/fontface.css; the
// build puts them back into the copies a video uses), the variables are the
// ones the block both declares and uses (plus any it uses without
// declaring), and the review's fixes go into the copy (docs/pilot/
// archetypes-review.md 4): no filter blur, an empty optional line hides.

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { zipBuffers } from "../runner/packs/zip.mjs";
import { checkManifest, PACK_SCHEMA } from "../runner/packs/index.mjs";
import { libraryDir } from "../runner/gates/build/assemble.mjs";

const words = (s) => String(s ?? "").trim().split(/\s+/).filter(Boolean).length;
const FONTFACE = /@font-face\s*\{[^}]*\}/g;

// The review's fixes, in the copy only.
export function fixBlock(html) {
  let out = html;
  // display-word: the same entrance without filter: blur (the motion rules
  // forbid it: it doubles the render time)
  out = out
    .replace(/\{ opacity: 0, filter: "blur\(26px\)", scale: \.96 \}/g, "{ opacity: 0, scale: .96 }")
    .replace(/\{ opacity: 1, filter: "blur\(12px\)", scale: 1, /g, "{ opacity: 1, scale: 1, ")
    .replace(/\{ filter: "blur\(5px\)", scale: PULSE, /g, "{ scale: PULSE, ")
    .replace(/\{ filter: "blur\(0px\)", scale: 1, /g, "{ scale: 1, ");
  // an optional line left empty takes no room
  out = out.replace(/<style>/, "<style>\n.kick:empty, .subcap:empty, [data-vars]:empty { display: none !important; }\n");
  return out;
}

// No brand left anywhere in a pack (Zoltan, 2026-10-07: "no own brand, no
// C2C, no zg remnant anywhere"): comments out, the code's names neutral, the
// branded sample texts replaced by neutral examples. Base64 data is never
// touched. Throws when something is still left.
const TEXT_SWAPS = [
  ["Zoltan Gero", "Alex Morgan"],
  ["ZG-FRAMES", "THE LIBRARY"],
  ["PURPOSEFUL · PEACEFUL · PROFITABLE", "LEARN · BUILD · GROW"],
  ["ONE SITTING", "ONE IDEA"],
  ["The judgment is mine. What changed is when it arrives", "Clarity beats cleverness, every single time"],
  ["AI agents · evergreen income", "Teacher · creator"],
];
const LEFT = /zg|zolt|c2c|purposeful|vidrev|voxflow|one sitting/i;
const swapText = (s) => TEXT_SWAPS.reduce((t, [a, b]) => t.split(a).join(b), String(s));
export function debrand(html) {
  const parts = html.split(/(base64,[A-Za-z0-9+/=]+)/);
  const out = parts
    .map((p, i) => {
      if (i % 2 === 1) return p;
      let s = p
        .replace(/<!--(?!\s*\/?(?:zg))[\s\S]*?-->/g, "")
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^[ \t]*\/\/.*$/gm, "")
        // per-channel token sets: the pack has one look (its own, or the Brand)
        .replace(/[^{}]*\[data-channel="[^"]+"\][^{}]*\{[^{}]*\}/g, "")
        .replace(/\bZG([A-Z]*)\b/g, "PK$1")
        .replace(/(^|[^A-Za-z0-9])zg(?=[-_A-Za-z0-9])/g, "$1pk")
        .replace(/(^|[^A-Za-z0-9])zg\b/g, "$1pk");
      for (const [a, b] of TEXT_SWAPS) s = s.split(a).join(b);
      return s;
    })
    .join("");
  const left = out.split(/base64,[A-Za-z0-9+/=]+/).join("").match(new RegExp(`.{0,40}(${LEFT.source}).{0,40}`, "i"));
  if (left) throw new Error(`A brand trace is left in the block: "${left[0].trim()}"`);
  return out;
}

// The pack's icons: Lucide (ISC), a free, widely used line set, in the
// blocks' own circle (Zoltan, 2026-10-07: not his 37 as the base, a proven
// free set). Each of the blocks' icon names has its Lucide equivalent; any
// other name an icon variable gets is looked up at build time
// (window.ITV_ICONS, packs/fitPackBlock).
export const ICON_NAMES = {
  comment: "message-circle", client: "user", script: "file-text", voice: "mic", visuals: "image", face: "smile",
  check: "check", cross: "x", clock: "clock", money: "banknote", place: "map-pin", title: "heading", caption: "captions",
  globe: "globe", spark: "sparkles", lock: "lock", branch: "git-branch", funnel: "funnel", cycle: "refresh-cw",
  gauge: "gauge", quote: "quote", question: "circle-question-mark", warn: "triangle-alert", heart: "heart", code: "code",
  grid: "layout-grid", mail: "mail", tag: "tag", bang: "circle-alert", query: "circle-question-mark", dash: "minus", paint: "paintbrush",
};
export function lucideIcons(lucide) {
  const pick = (name) => {
    const icon = lucide.icons[name];
    if (!icon) throw new Error(`Lucide has no icon ${name}.`);
    return icon.d.map((d) => `<path d="${d}"/>`).join("");
  };
  return Object.fromEntries(Object.entries(ICON_NAMES).map(([k, v]) => [k, pick(v)]));
}
export function withLucide(html, icons) {
  const p = arraySpanObject(html, "P");
  const g = arraySpanObject(html, "G");
  if (!p || !g) throw new Error("The icon library was not found in the block.");
  let out = html;
  const glyphs = Object.fromEntries(["cross", "check", "bang", "query", "dash", "heart"].map((k) => [k, icons[k]]));
  // replace the later one first so the earlier offsets stay right
  for (const [span, map] of [[g, glyphs], [p, icons]].sort((a, b) => b[0].start - a[0].start)) out = out.slice(0, span.start) + JSON.stringify(map) + out.slice(span.end);
  return out.replace(/var p = P\[e\.dataset\.icon\];/, "var p = P[e.dataset.icon] || (window.ITV_ICONS || {})[e.dataset.icon];");
}
// The object literal `var NAME = { ... };`, from "{" to its matching "}".
function arraySpanObject(src, name) {
  const m = new RegExp(String.raw`\bvar\s+${name}\s*=\s*\{`).exec(src);
  if (!m) return null;
  let depth = 0;
  for (let i = m.index + m[0].length - 1; i < src.length; i++) {
    const c = src[i];
    if (c === "'" || c === '"') {
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === "\\") i++;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return { start: m.index + m[0].length - 1, end: i + 1 };
  }
  return null;
}

// The sampler's kicker and archetype description are not content: an
// optional line is empty unless the video fills it, so it hides (fixBlock's
// :empty rule). Its declared default and its written text both go.
export function emptyOptional(html, ids) {
  let out = html.replace(/data-composition-variables='([^']*)'/, (m, json) => {
    const vars = JSON.parse(json).map((v) => (ids.includes(v.id) ? { ...v, default: "" } : v));
    return `data-composition-variables='${JSON.stringify(vars)}'`;
  });
  for (const id of ids) out = out.replace(new RegExp(String.raw`(data-vars='\{"text":"${id}"\}'[^>]*>)[^<]*`, "g"), "$1");
  return out;
}

// What the block says about its variables, and what it really uses.
export function blockVariables(html, { optional = [], neutral = true } = {}) {
  const declared = JSON.parse((/data-composition-variables='([^']*)'/.exec(html) ?? [, "[]"])[1].replace(/&#39;/g, "'"));
  const used = new Map();
  const icons = new Set();
  for (const m of html.matchAll(/<([a-z0-9]+)\b[^>]*data-vars='([^']*)'[^>]*>([^<]*)/g)) {
    let map = {};
    try {
      map = JSON.parse(m[2]);
    } catch {
      continue;
    }
    for (const [attr, v] of Object.entries(map)) {
      if (typeof v !== "string") continue;
      if (attr === "icon" || attr === "data-icon") icons.add(v);
      if (!used.has(v)) used.set(v, m[3].trim());
    }
  }
  const vars = [];
  for (const d of declared) if (used.has(d.id)) vars.push(d);
  for (const [id, text] of used) if (!declared.some((d) => d.id === id)) vars.push({ id, type: "string", label: id, default: text });
  return vars.map((v) => ({
    id: v.id,
    type: v.type ?? "string",
    label: v.label ?? v.id,
    default: neutral ? swapText(v.default ?? "") : v.default ?? "",
    ...(icons.has(v.id) ? { icon: true } : {}),
    maxWords: Math.max(2, words(v.default) + 3),
    ...(optional.includes(v.id) || ["kick", "subcap", "caption"].includes(v.id) ? { optional: true } : {}),
  }));
}

export function makePack(src) {
  const lucide = lucideIcons(JSON.parse(fs.readFileSync(path.join(libraryDir(), "icons", "lucide.json"), "utf8")));
  const blocksDir = path.resolve(src.blocksDir);
  const files = [];
  let fontface = "";
  const blocks = [];
  for (const [id, meta] of Object.entries(src.blocks)) {
    const file = path.join(blocksDir, id, `${id}.html`);
    if (!fs.existsSync(file)) throw new Error(`No built block at ${file}.`);
    const raw = fs.readFileSync(file, "utf8");
    const faces = raw.match(FONTFACE) ?? [];
    if (!fontface && faces.length) fontface = faces.join("\n");
    const variables = blockVariables(raw, { ...meta, neutral: src.neutral !== false });
    const fixed = emptyOptional(fixBlock(raw.replace(FONTFACE, "")), variables.filter((v) => v.optional).map((v) => v.id));
    // "neutral" (the default): no brand trace, Lucide icons; an "original" pack
    // (neutral: false) keeps the designer's own look, icons and names
    const html = src.neutral === false ? fixed : debrand(withLucide(fixed, lucide));
    const seconds = Number((/data-scene-dur="([\d.]+)"/.exec(raw) ?? [])[1]);
    if (!(seconds > 0)) throw new Error(`${id}: no data-scene-dur, the block's drawn length is unknown.`);
    blocks.push({ id, role: meta.role, label: meta.label, what: meta.what ?? "", seconds, variables: variables.map((v) => (v.optional ? { ...v, default: "" } : v)), ...(meta.needs ? { needs: meta.needs } : {}), ...(meta.realOnly ? { realOnly: true } : {}) });
    files.push({ name: `blocks/${id}.html`, data: html });
  }
  const manifest = checkManifest({ schema: PACK_SCHEMA, id: src.id, name: src.name, author: src.author ?? "", version: src.version ?? "1.0.0", description: src.description ?? "", look: src.look ?? "own", blocks });
  return zipBuffers([{ name: "pack.json", data: JSON.stringify(manifest, null, 2) + "\n" }, ...(fontface ? [{ name: "shared/fontface.css", data: fontface + "\n" }] : []), ...files]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values: a } = parseArgs({ options: { src: { type: "string" }, out: { type: "string" } } });
  if (!a.src || !a.out) {
    console.error("Usage: node scripts/make-pack.mjs --src <pack.src.json> --out <file.itvpack>");
    process.exit(2);
  }
  const src = JSON.parse(fs.readFileSync(a.src, "utf8"));
  if (src.blocksDir && !path.isAbsolute(src.blocksDir)) src.blocksDir = path.join(path.dirname(a.src), src.blocksDir);
  const buf = makePack(src);
  fs.writeFileSync(a.out, buf);
  console.log(`pack: ${Object.keys(src.blocks).length} blocks, ${(buf.length / 1048576).toFixed(1)} MB -> ${a.out}`);
}
