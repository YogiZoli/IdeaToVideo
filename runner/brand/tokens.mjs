// brand/tokens.mjs: a design system's tokens.css (CSS custom properties on
// :root) to a Brand Identity Card. One reader for both the open-design
// gallery (library/opendesign/, built by scripts/fetch-library.mjs) and the
// wizard's "Import tokens.css" (Claude Design, open-design, shadcn and the
// like). Only facts come over: colours, corner radius, which fonts the
// system names. A font the app does not ship (most brand fonts are not free)
// becomes its nearest shipped OFL font, the way a browser falls back along a
// font stack, only predictably (docs/wizards/brand.md 12b).

import { mix, normHex, deriveColors, CARD_SCHEMA, CORNERS, appearanceOf } from "./card.mjs";

// ---- reading the CSS ----------------------------------------------------------------

// Every custom property declared in a :root (or html) block, comments removed.
export function cssVars(css) {
  const text = String(css).replace(/\/\*[\s\S]*?\*\//g, "");
  const vars = {};
  for (const block of text.matchAll(/(?:^|[},\s])(?::root|html)(?:\s*,\s*[^{]+)?\s*\{([^{}]*)\}/g)) {
    for (const m of block[1].matchAll(/(--[A-Za-z0-9_-]+)\s*:\s*([^;]+);?/g)) vars[m[1].toLowerCase()] = m[2].replace(/\s+/g, " ").trim();
  }
  return vars;
}

// ---- colours ------------------------------------------------------------------------

const NAMED = { white: "#ffffff", black: "#000000", transparent: null, currentcolor: null };
const clamp = (v) => Math.max(0, Math.min(255, v));
const hex = (r, g, b) => "#" + [r, g, b].map((v) => Math.round(clamp(v)).toString(16).padStart(2, "0")).join("");
const num = (s, scale = 1) => (String(s).trim().endsWith("%") ? (parseFloat(s) / 100) * scale : parseFloat(s));

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function oklchToRgb(L, C, H) {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  return lin.map((v) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.max(v, 0) ** (1 / 2.4) - 0.055));
}

// A CSS colour to { hex, alpha }, or null. var() is resolved against `vars`;
// color-mix() in any space is approximated in sRGB.
export function parseColor(value, vars = {}, depth = 0) {
  if (value == null || depth > 8) return null;
  let v = String(value).trim().replace(/\s*!important$/, "");
  const ref = /^var\(\s*(--[A-Za-z0-9_-]+)\s*(?:,\s*([\s\S]+))?\)$/.exec(v);
  if (ref) return parseColor(vars[ref[1].toLowerCase()], vars, depth + 1) ?? parseColor(ref[2], vars, depth + 1);
  const low = v.toLowerCase();
  if (low in NAMED) return NAMED[low] ? { hex: NAMED[low], alpha: 1 } : null;
  let m = /^#([0-9a-f]{3,8})$/i.exec(v);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    return { hex: "#" + h.slice(0, 6).toLowerCase(), alpha: h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1 };
  }
  m = /^(rgba?|hsla?|oklch)\(([^)]*)\)$/i.exec(v);
  if (m) {
    const parts = m[2].replace(/\//g, " ").replace(/,/g, " ").trim().split(/\s+/);
    const alpha = parts[3] !== undefined ? num(parts[3]) : 1;
    const fn = m[1].toLowerCase();
    if (fn.startsWith("rgb")) return { hex: hex(num(parts[0], 255), num(parts[1], 255), num(parts[2], 255)), alpha };
    if (fn.startsWith("hsl")) return { hex: hex(...hslToRgb(parseFloat(parts[0]), num(parts[1]) / (String(parts[1]).endsWith("%") ? 1 : 100), num(parts[2]) / (String(parts[2]).endsWith("%") ? 1 : 100))), alpha };
    const L = String(parts[0]).endsWith("%") ? parseFloat(parts[0]) / 100 : parseFloat(parts[0]);
    return { hex: hex(...oklchToRgb(L, parseFloat(parts[1]), parseFloat(parts[2]) || 0)), alpha };
  }
  // shadcn style: bare HSL components ("222.2 84% 4.9%")
  m = /^(-?[\d.]+)(?:deg)?\s+([\d.]+)%\s+([\d.]+)%$/.exec(v);
  if (m) return { hex: hex(...hslToRgb(+m[1], +m[2] / 100, +m[3] / 100)), alpha: 1 };
  m = /^color-mix\(\s*in\s+[a-z-]+\s*,\s*([\s\S]+)\)$/i.exec(v);
  if (m) {
    const args = splitTop(m[1]);
    if (args.length !== 2) return null;
    const read = (s) => {
      const p = /^([\s\S]*?)\s+([\d.]+)%$/.exec(s.trim());
      return p ? { c: parseColor(p[1], vars, depth + 1), w: +p[2] / 100 } : { c: parseColor(s, vars, depth + 1), w: null };
    };
    const [a, b] = args.map(read);
    if (!a.c || !b.c) return null;
    const wa = a.w ?? (b.w !== null ? 1 - b.w : 0.5);
    return { hex: mix(a.c.hex, b.c.hex, wa), alpha: 1 };
  }
  return null;
}

// Splits "a, rgb(1,2,3) 20%" at top-level commas.
function splitTop(s) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// A colour as an opaque hex: translucent ones are laid over `under`.
function solid(value, vars, under) {
  const c = parseColor(value, vars);
  if (!c) return null;
  return c.alpha >= 0.999 || !under ? c.hex : mix(c.hex, under, c.alpha);
}

// ---- fonts --------------------------------------------------------------------------

// Not free brand and system fonts named by design systems, to the shipped
// OFL font that comes closest. Anything not listed falls back by kind
// (serif, monospace, sans-serif) to Source Serif 4, JetBrains Mono or Inter.
export const FONT_STAND_INS = {
  "sf mono": "JetBrains Mono", "sf pro mono": "JetBrains Mono", "berkeley mono": "JetBrains Mono", menlo: "JetBrains Mono", monaco: "JetBrains Mono", consolas: "JetBrains Mono", "courier new": "IBM Plex Mono", courier: "IBM Plex Mono",
  "söhne mono": "JetBrains Mono", "sohne mono": "JetBrains Mono", saansmono: "Geist Mono", geistmono: "Geist Mono", "geist mono": "Geist Mono", "geist": "Geist", "jetbrains-mono": "JetBrains Mono", "commit mono": "JetBrains Mono", "pp neue montreal mono": "JetBrains Mono", cohermono: "JetBrains Mono", coheremono: "JetBrains Mono", figmamono: "Roboto Mono", "gg mono": "Roboto Mono", "anthropic mono": "JetBrains Mono",
  georgia: "Source Serif 4", charter: "Source Serif 4", "source serif pro": "Source Serif 4", "times new roman": "Source Serif 4", times: "Source Serif 4", signifier: "Source Serif 4", "anthropic serif": "Source Serif 4", "mongodb value serif": "Source Serif 4", canela: "Playfair Display", didot: "Bodoni Moda",
  "inter variable": "Inter", "inter display": "Inter", notioninter: "Inter", "geist sans": "Geist", "mona sans": "Mona Sans", "cal sans": "Cal Sans", "source sans pro": "Source Sans 3", "ibm plex sans": "IBM Plex Sans",
  "arial black": "Archivo Black", "druk wide": "Archivo Black", impact: "Archivo Black", "franklin gothic": "Archivo", "d-din": "Barlow", "d-din-bold": "Barlow", "din": "Barlow",
  futura: "Jost", "nike futura nd": "Jost", "futura pt": "Jost", avenir: "DM Sans", "avenir next": "DM Sans", "airbnb cereal vf": "DM Sans", "airbnb cereal": "DM Sans", spotifymixui: "DM Sans", spotifymixuititle: "DM Sans", "gt walsheim framer medium": "DM Sans", "gt walsheim": "DM Sans",
  "comic sans ms": "Quicksand", "feather bold": "Rubik", "euclid circular a": "DM Sans", circular: "DM Sans", degular: "DM Sans", "the future": "DM Sans", polysans: "DM Sans", "matter regular": "DM Sans", larsseit: "DM Sans",
  "google sans": "Roboto", roboto: "Roboto", outfit: "Outfit", "dm sans": "DM Sans", rubik: "Rubik", "press start 2p": "Space Mono", inconsolata: "Inconsolata", "fira code": "Fira Code", "source code pro": "Source Code Pro", sourcecodepro: "Source Code Pro", "roboto mono": "Roboto Mono", "azeret mono": "Azeret Mono", "space mono": "Space Mono",
};

const GENERIC = { serif: "Source Serif 4", monospace: "JetBrains Mono", "ui-monospace": "JetBrains Mono", "ui-serif": "Source Serif 4" };

// The first family of a stack the app ships, else the stand-in of the first
// one that has one, else by the stack's generic kind. `families`: shipped names.
export function pickFont(stack, families, kind = "sans-serif") {
  const names = splitTop(String(stack ?? "")).map((f) => f.replace(/^["']|["']$/g, "").trim()).filter(Boolean);
  const shipped = new Map(families.map((f) => [f.toLowerCase(), f]));
  // in stack order, as a browser would: the first name we ship, or can stand in for
  for (const n of names) {
    const key = n.toLowerCase();
    if (shipped.has(key)) return { family: shipped.get(key), named: names[0], exact: n === names[0] };
    const s = FONT_STAND_INS[key] ?? GENERIC[key];
    if (s && shipped.has(s.toLowerCase())) return { family: s, named: names[0], exact: false };
  }
  return { family: kind === "monospace" ? "JetBrains Mono" : kind === "serif" ? "Source Serif 4" : "Inter", named: names[0] ?? null, exact: false };
}

// ---- tokens to a card ---------------------------------------------------------------

// The names each role goes by in the common token sets: open-design first,
// then shadcn / Tailwind-style and plain names.
const ROLE_NAMES = {
  background: ["--bg", "--background", "--color-background", "--color-bg", "--bg-primary", "--surface-0", "--canvas"],
  text: ["--fg", "--foreground", "--text", "--color-text", "--color-foreground", "--text-primary", "--ink"],
  muted: ["--muted-foreground", "--muted", "--fg-2", "--text-muted", "--color-text-muted", "--text-secondary"],
  surface: ["--surface", "--card", "--color-surface", "--bg-secondary", "--panel"],
  border: ["--border", "--color-border", "--line", "--border-color"],
  primary: ["--primary", "--accent", "--brand", "--color-primary", "--color-accent", "--color-brand"],
  secondary: ["--accent-2", "--secondary-accent", "--accent-active", "--success", "--color-secondary"],
  tertiary: ["--accent-3", "--meta", "--warn", "--color-tertiary"],
};

// Which of the names is shadcn's: there --muted and --secondary are quiet
// background fills, and --accent too, so they must not become text or brand colours.
const isShadcn = (vars) => "--muted-foreground" in vars && "--card" in vars;

function role(vars, role, under) {
  let names = ROLE_NAMES[role];
  if (isShadcn(vars)) {
    if (role === "muted") names = ["--muted-foreground"];
    if (role === "primary") names = ["--primary", "--ring"];
    if (role === "secondary") names = ["--chart-2", "--ring"];
    if (role === "tertiary") names = ["--chart-3"];
  }
  for (const n of names) {
    if (!(n in vars)) continue;
    const c = solid(vars[n], vars, under);
    if (c) return c;
  }
  return null;
}

const nearestCorners = (px) => Object.entries(CORNERS).reduce((best, [k, v]) => (Math.abs(v - px) < Math.abs(CORNERS[best] - px) ? k : best), "medium");

// A Brand Identity Card from tokens.css. Throws when there is no background
// or no text colour: then it is not a design system's tokens.
export function cardFromTokens(css, { families, name = "Imported", source = { kind: "import" } } = {}) {
  const vars = cssVars(css);
  const background = role(vars, "background", null);
  if (!background) throw new Error("No background colour found (--bg or --background). Is this a tokens.css file?");
  const text = role(vars, "text", background);
  if (!text) throw new Error("No text colour found (--fg or --foreground).");
  const colors = { background, text };
  for (const r of ["muted", "surface", "border", "primary", "secondary", "tertiary"]) {
    const c = role(vars, r, background);
    if (c) colors[r] = c;
  }
  // a surface identical to the background shows no cards: derive one instead
  if (colors.surface === background) delete colors.surface;
  if (!colors.primary) colors.primary = text;
  const full = deriveColors(colors);
  const radiusRaw = vars["--radius-md"] ?? vars["--radius"] ?? vars["--radius-lg"] ?? vars["--border-radius"];
  const radiusPx = radiusRaw ? (/rem$/.test(radiusRaw) ? parseFloat(radiusRaw) * 16 : parseFloat(radiusRaw)) : 14;
  const shadow = String(vars["--elev-raised"] ?? vars["--shadow-card"] ?? vars["--shadow"] ?? vars["--shadow-md"] ?? "none");
  const ring = vars["--elev-ring"] && vars["--elev-ring"] !== "none";
  const cards = /\d+px\s+\d+px/.test(shadow) && !/^0\s+0\s+0\s+1px/.test(shadow.trim()) ? "shadow" : ring ? "border" : "flat";
  const fonts = {};
  const notes = [];
  for (const [k, kind] of [["display", "sans-serif"], ["body", "sans-serif"], ["mono", "monospace"]]) {
    const stack = vars[`--font-${k}`] ?? vars[`--font-${k === "display" ? "heading" : k === "body" ? "sans" : "mono"}`] ?? vars["--font-sans"];
    const kindOf = /(^|,)\s*serif\b/.test(stack ?? "") && !/sans-serif/.test(stack ?? "") ? "serif" : kind;
    const f = pickFont(stack, families, kindOf);
    fonts[k] = { family: f.family, source: "bundled" };
    if (f.named && !f.exact) notes.push(`${f.named} -> ${f.family}`);
  }
  const card = {
    schema: CARD_SCHEMA,
    name,
    source,
    colors: Object.fromEntries(Object.entries(full).map(([k, v]) => [k, normHex(v)])),
    fonts,
    shape: { corners: nearestCorners(Number.isFinite(radiusPx) ? radiusPx : 14), cards },
  };
  card.appearance = appearanceOf(card.colors);
  card.shape.radiusPx = CORNERS[card.shape.corners];
  return { card, notes };
}
