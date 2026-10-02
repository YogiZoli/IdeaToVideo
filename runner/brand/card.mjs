// brand/card.mjs: the Brand Identity Card (DECISIONS 69, docs/wizards/brand.md
// 4): one design source per Identity, in <identity>/brand/brand-identity-card.json.
// Everything here works on the card: presets become cards, the card becomes
// the video theme (THEME_KEYS) and a generated FRAME.md, colours are checked
// for contrast. An Identity without a card gets its preset's card
// (identity.json brand.preset, DECISIONS 59), so old Identities look the same.

import fs from "node:fs";
import path from "node:path";
import { validate, loadSchema } from "../schema/validate.mjs";
import { libraryDir } from "../gates/build/assemble.mjs";

export const CARD_SCHEMA = "brand-identity-card/1";
export const CARD_FILE = "brand-identity-card.json";
export const FRAME_FILE = "FRAME.md";
export const DEFAULT_PRESET = "blue-professional";
export const CORNERS = { none: 0, small: 6, medium: 14, large: 24 };
export const COLOR_ROLES = ["background", "text", "muted", "surface", "border", "primary", "secondary", "tertiary"];
const DEFAULT_MONO = "JetBrains Mono";

// ---- colour arithmetic --------------------------------------------------------------

export function parseHex(hex) {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(String(hex).trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
export const toHex = (rgb) => "#" + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
export const normHex = (hex) => {
  const rgb = parseHex(hex);
  return rgb ? toHex(rgb) : null;
};

// `amount` of a over b (0..1), in sRGB, like a translucent fill on a canvas.
export const mix = (a, b, amount) => {
  const [x, y] = [parseHex(a), parseHex(b)];
  return toHex(x.map((v, i) => v * amount + y[i] * (1 - amount)));
};

export function luminance(hex) {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// WCAG contrast ratio, 1..21.
export function contrast(a, b) {
  const [la, lb] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.round(((la + 0.05) / (lb + 0.05)) * 100) / 100;
}

// The nearest colour to `color` (mixing it toward black or white, whichever
// works with fewer steps) that reaches `min` against `against`.
export function fixContrast(color, against, min) {
  if (contrast(color, against) >= min) return normHex(color);
  const toward = luminance(against) > 0.18 ? ["#000000", "#ffffff"] : ["#ffffff", "#000000"];
  for (const target of toward) {
    for (let step = 1; step <= 20; step++) {
      const c = mix(target, color, step / 20);
      if (contrast(c, against) >= min) return c;
    }
  }
  return luminance(against) > 0.18 ? "#000000" : "#ffffff";
}

// What the video needs to stay readable (WCAG AA): text 4.5:1 on the
// background and on cards, muted text 3:1, the primary colour 3:1.
export const CONTRAST_RULES = [
  { id: "text-on-background", fg: "text", bg: "background", min: 4.5, label: "Text on the background" },
  { id: "text-on-surface", fg: "text", bg: "surface", min: 4.5, label: "Text on cards" },
  { id: "muted-on-background", fg: "muted", bg: "background", min: 3, label: "Quiet text on the background" },
  { id: "primary-on-background", fg: "primary", bg: "background", min: 3, label: "Main color on the background" },
];

export function contrastReport(card) {
  return CONTRAST_RULES.map((r) => {
    const ratio = contrast(card.colors[r.fg], card.colors[r.bg]);
    return { ...r, ratio, ok: ratio >= r.min, fix: ratio >= r.min ? null : fixContrast(card.colors[r.fg], card.colors[r.bg], r.min) };
  });
}

export const appearanceOf = (colors) => (luminance(colors.background) > 0.18 ? "light" : "dark");

// The colours the user does not have to pick (Colors screen: three main
// fields), derived the way the Blue Professional preset defines its cards.
export function deriveColors(c) {
  const out = { ...c };
  out.secondary ??= out.primary;
  out.tertiary ??= out.secondary;
  out.text ??= appearanceOf({ background: out.background }) === "light" ? "#111111" : "#f4f5f7";
  out.muted ??= mix(out.text, out.background, 0.6);
  out.surface ??= mix(out.primary, out.background, 0.04);
  out.border ??= mix(out.primary, out.background, 0.2);
  for (const k of COLOR_ROLES) out[k] = normHex(out[k]);
  return out;
}

// ---- presets ------------------------------------------------------------------------

// The named hex colours of a FRAME.md (its front matter "colors:" block).
// rgba() and other values are skipped; the map never points at them.
export function frameColors(md) {
  const front = String(md).split(/^---\s*$/m)[1] ?? "";
  const block = /^colors:\s*\n((?:[ \t]+.*\n?)*)/m.exec(front)?.[1] ?? "";
  const out = {};
  for (const line of block.split("\n")) {
    const m = /^\s+([A-Za-z0-9-]+):\s*"?(#[0-9A-Fa-f]{3,6})"?/.exec(line);
    if (m) out[m[1]] = normHex(m[2]);
  }
  return out;
}

export function presetCard(id, md, entry) {
  const named = frameColors(md);
  const colors = {};
  for (const role of COLOR_ROLES) {
    const name = entry.colors[role];
    if (name === null || name === undefined) continue;
    if (!named[name]) throw new Error(`Preset ${id}: no colour called ${name} in its FRAME.md.`);
    colors[role] = named[name];
  }
  const full = deriveColors(colors);
  return finishCard({
    schema: CARD_SCHEMA,
    name: entry.label,
    source: { kind: "preset", preset: id },
    colors: full,
    fonts: { display: { family: entry.fonts.display, source: "bundled" }, body: { family: entry.fonts.body, source: "bundled" }, mono: { family: entry.fonts.mono ?? DEFAULT_MONO, source: "bundled" } },
    shape: { ...entry.shape },
  });
}

// "Warm paper": the first pilot video's look (DECISIONS 59), the app's own,
// not a HyperFrames preset. Its serif is EB Garamond (shipped), which is what
// a Georgia request became in the render anyway.
export const WARM_PAPER_CARD = {
  schema: CARD_SCHEMA,
  name: "Warm paper",
  source: { kind: "preset", preset: "warm-paper" },
  colors: { background: "#f6f3ec", text: "#1b1d22", muted: "#5d6470", surface: "#ffffff", border: "#d9d3c7", primary: "#0a7d55", secondary: "#1f5fbf", tertiary: "#7a3fb8" },
  fonts: { display: { family: "EB Garamond", source: "bundled" }, body: { family: "Inter", source: "bundled" }, mono: { family: DEFAULT_MONO, source: "bundled" } },
  shape: { corners: "medium", cards: "border" },
};

let presetCache = null;
// Every preset as a card, Blue Professional first (the default), Warm paper
// after the HyperFrames ones. Built from the shipped FRAME.md files.
export function presetCards({ dir = libraryDir(), fresh = false } = {}) {
  if (presetCache && !fresh && presetCache.dir === dir) return presetCache.list;
  const map = JSON.parse(fs.readFileSync(path.join(dir, "presets", "MAP.json"), "utf8"));
  const list = [];
  for (const [id, entry] of Object.entries(map)) {
    if (id.startsWith("$")) continue;
    const file = path.join(dir, "presets", id, "FRAME.md");
    if (!fs.existsSync(file)) continue;
    list.push({ id, label: entry.label, card: presetCard(id, fs.readFileSync(file, "utf8"), entry) });
  }
  list.push({ id: "warm-paper", label: "Warm paper", card: finishCard(structuredClone(WARM_PAPER_CARD)) });
  presetCache = { dir, list };
  return list;
}

export function cardForPreset(id, opts) {
  const all = presetCards(opts);
  return structuredClone((all.find((p) => p.id === id) ?? all.find((p) => p.id === DEFAULT_PRESET) ?? all[0]).card);
}

// ---- the card itself ----------------------------------------------------------------

function finishCard(card) {
  card.appearance = appearanceOf(card.colors);
  card.shape.radiusPx = CORNERS[card.shape.corners] ?? CORNERS.medium;
  return card;
}

export function validateCard(card) {
  const errors = validate(card, loadSchema("brand-identity-card"));
  if (errors.length) throw new Error(`The Brand Identity Card is not valid: ${errors.slice(0, 5).join("; ")}`);
  return card;
}

// Cleans what the UI sends: lower-case hex, derived fields recomputed,
// unknown fonts refused (only the shipped ones, K3).
export function normalizeCard(card, { families } = {}) {
  const c = structuredClone(card);
  c.schema = CARD_SCHEMA;
  c.colors = deriveColors(c.colors ?? {});
  for (const k of ["display", "body", "mono"]) {
    if (!c.fonts?.[k]) continue;
    c.fonts[k] = { family: String(c.fonts[k].family), ...(c.fonts[k].weight ? { weight: c.fonts[k].weight } : {}), source: "bundled" };
    if (families && !families.includes(c.fonts[k].family)) throw new Error(`The font ${c.fonts[k].family} is not one of the app's fonts.`);
  }
  c.fonts.mono ??= { family: DEFAULT_MONO, source: "bundled" };
  finishCard(c);
  return validateCard(c);
}

export const cardPath = (identityDir) => path.join(identityDir, "brand", CARD_FILE);

// The Identity's card: its own file, or the preset's (identity.json
// brand.preset). `own` tells the UI which one it is.
export function loadCard(identityDir, { preset, dir } = {}) {
  const file = identityDir ? cardPath(identityDir) : null;
  if (file && fs.existsSync(file)) {
    const card = JSON.parse(fs.readFileSync(file, "utf8"));
    return { card: validateCard(card), own: true };
  }
  let p = preset;
  if (!p && identityDir && fs.existsSync(path.join(identityDir, "identity.json"))) {
    p = JSON.parse(fs.readFileSync(path.join(identityDir, "identity.json"), "utf8")).brand?.preset;
  }
  return { card: cardForPreset(p ?? DEFAULT_PRESET, { dir }), own: false };
}

// Writes the card and the FRAME.md generated from it.
export function saveCard(identityDir, card, opts = {}) {
  const clean = normalizeCard({ ...card, updatedAt: (opts.now ?? new Date()).toISOString() }, opts);
  const dir = path.join(identityDir, "brand");
  fs.mkdirSync(dir, { recursive: true });
  const write = (name, text) => {
    const tmp = path.join(dir, `.${name}.tmp`);
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, path.join(dir, name));
  };
  write(CARD_FILE, JSON.stringify(clean, null, 2) + "\n");
  write(FRAME_FILE, frameMd(clean));
  return clean;
}

// ---- the card as the video's theme and as FRAME.md --------------------------------

// Generic families only after the chosen one and Inter: HyperFrames fetches
// any named family that has no @font-face (Georgia would become a download).
const FALLBACK = { serif: "serif", "sans-serif": "sans-serif", display: "sans-serif", handwriting: "sans-serif", monospace: "monospace" };
const stack = (family, category) => `'${family}', ${family === "Inter" ? "" : "Inter, "}${FALLBACK[category] ?? FALLBACK["sans-serif"]}`;

// THEME_KEYS (assemble.mjs) from the card. `categories`: family -> category,
// from FONTS.json, for a sensible fallback.
export function cardTheme(card, categories = {}) {
  const c = card.colors;
  const f = card.fonts;
  return {
    bg: c.background,
    fg: c.text,
    muted: c.muted,
    surface: c.surface,
    border: c.border,
    brand: c.primary,
    accent: c.secondary,
    "accent-2": c.tertiary,
    radius: `${card.shape.radiusPx ?? CORNERS[card.shape.corners] ?? 14}px`,
    "font-display": stack(f.display.family, categories[f.display.family]),
    "font-body": stack(f.body.family, categories[f.body.family]),
    "font-mono": stack((f.mono ?? { family: DEFAULT_MONO }).family, "monospace"),
  };
}

// The families a build needs files for: the card's three and Inter, which
// the components name as their fallback.
export const cardFamilies = (card) => [...new Set([card.fonts.display.family, card.fonts.body.family, (card.fonts.mono ?? { family: DEFAULT_MONO }).family, "Inter"])];

// A FRAME.md in the HyperFrames preset format (front matter of tokens), so
// people and HyperFrames tools can read the Identity's look. Generated: the
// card is the source, this file is overwritten on every save (K1).
export function frameMd(card) {
  const c = card.colors;
  const q = (s) => JSON.stringify(String(s));
  const lines = [
    "---",
    "version: alpha",
    `name: ${q(card.name || "Brand")}`,
    "description: >",
    "  Generated from brand-identity-card.json by IdeaToVideo. Do not edit this file:",
    "  change the look in the app (Settings, Identity, Brand); this file is rewritten on save.",
    "unit: the frame, 1920x1080",
    "",
    "colors:",
    ...COLOR_ROLES.map((k) => `  ${k}: ${q(c[k])}`),
    "",
    "radii:",
    `  card: ${q(`${card.shape.radiusPx}px`)}`,
    "",
    "typography:",
    `  display: { fontFamily: ${q(card.fonts.display.family)}${card.fonts.display.weight ? `, weight: ${card.fonts.display.weight}` : ""} }`,
    `  body:    { fontFamily: ${q(card.fonts.body.family)}${card.fonts.body.weight ? `, weight: ${card.fonts.body.weight}` : ""} }`,
    `  mono:    { fontFamily: ${q((card.fonts.mono ?? { family: DEFAULT_MONO }).family)} }`,
    "",
    `cards: ${q(card.shape.cards)}`,
    `appearance: ${q(card.appearance)}`,
    "---",
    "",
    `# ${card.name || "Brand"}`,
    "",
    "The look of this Identity's videos. The source is `brand-identity-card.json` next to this file.",
    "",
  ];
  return lines.join("\n");
}
