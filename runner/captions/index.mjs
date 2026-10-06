// captions/index.mjs: burned-in caption styles (DECISIONS 106). Each is one
// of HyperFrames' caption-* registry components: a whole-frame overlay that
// ships with a demo transcript in a script constant. At build time the copy
// gets the video's own words with their timing (words.json), its own word
// groups, the video's length, the Identity's display font, and no remote
// font; the registry file is untouched. Zoltan, 2026-10-06: "all of them,
// not three", "the spoken word highlighted, like a transcription".
//
// Three data shapes in the registry: a transcript constant (TRANSCRIPT,
// WORDS or W) of { text, start, end }; groups as RAW_GROUPS [[a, b]] or
// GROUPS [{ wordStart, wordEnd, start, end }]; or blocks (editorial:
// { line1, line2 } of [index, "n" | "e"]; parallax: { behind, front } of
// [[index]]). The last word of a block is its emphasis.

import fs from "node:fs";
import path from "node:path";
import { libraryDir } from "../gates/build/assemble.mjs";

// The styles the app offers, calmest first (label, what it does).
export const CAPTION_STYLES = {
  "caption-pill-karaoke": { label: "Pill karaoke", hint: "Words on a soft pill; the spoken word darkens.", calm: true },
  "caption-highlight": { label: "Highlight", hint: "A colour block sweeps behind each spoken word.", calm: true },
  "caption-weight-shift": { label: "Weight shift", hint: "The spoken word turns bold.", calm: true },
  "caption-editorial-emphasis": { label: "Editorial", hint: "Two lines like a magazine, the key word set apart.", calm: true },
  "caption-gradient-fill": { label: "Gradient fill", hint: "Each word fills with colour as it is said.", calm: true },
  "caption-clip-wipe": { label: "Clip wipe", hint: "Words wipe in as they are said.", calm: true },
  "caption-texture": { label: "Texture", hint: "Bold letters with a printed texture.", calm: false },
  "caption-kinetic-slam": { label: "Kinetic slam", hint: "Big words slam in one by one.", calm: false },
  "caption-parallax-layers": { label: "Parallax layers", hint: "A big word behind, the line in front, moving apart.", calm: false },
  "caption-emoji-pop": { label: "Emoji pop", hint: "Words pop with a small picture and colour.", calm: false },
  "caption-matrix-decode": { label: "Matrix decode", hint: "Letters decode into the word.", calm: false },
  "caption-glitch-rgb": { label: "Glitch", hint: "Words arrive with a colour glitch.", calm: false },
  "caption-neon-accent": { label: "Neon accent", hint: "Neon-lit key words.", calm: false },
  "caption-neon-glow": { label: "Neon glow", hint: "The whole line glows like a sign.", calm: false },
  "caption-particle-burst": { label: "Particle burst", hint: "Each word bursts into particles.", calm: false },
};

export const captionDir = (env = process.env) => path.join(libraryDir(env), "captions");
export function loadCaption(name, { env = process.env } = {}) {
  if (!CAPTION_STYLES[name]) throw new Error(`Unknown caption style: ${name}.`);
  const file = path.join(captionDir(env), name, `${name}.html`);
  if (!fs.existsSync(file)) throw new Error(`The caption style ${CAPTION_STYLES[name].label} is not in the app's library. Reinstall the app.`);
  return fs.readFileSync(file, "utf8");
}

// Word groups the way the registry demos group them: at most four words,
// a new group after a sentence mark or a pause.
export function captionGroups(words, { maxWords = 4, pause = 0.3 } = {}) {
  const groups = [];
  let cur = [];
  words.forEach((w, i) => {
    cur.push(i);
    const next = words[i + 1];
    const end = !next || cur.length >= maxWords || /[,.:;!?]$/.test(w.text) || next.start - w.end >= pause;
    if (end) {
      groups.push([cur[0], cur[cur.length - 1]]);
      cur = [];
    }
  });
  return groups;
}

const r3 = (x) => Math.round(x * 1000) / 1000;

// The array literal `var NAME = [ ... ];` (or const/let), from its "[" to
// the matching "]", skipping strings and comments.
export function arraySpan(src, name) {
  const m = new RegExp(String.raw`\b(?:var|const|let)\s+${name}\s*=\s*\[`).exec(src);
  if (!m) return null;
  const open = m.index + m[0].length - 1;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === "\\") i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      i = src.indexOf("\n", i);
      if (i < 0) break;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      i = src.indexOf("*/", i) + 1;
      continue;
    }
    if (c === "[") depth++;
    else if (c === "]" && --depth === 0) return { start: open, end: i + 1 };
  }
  return null;
}

function replaceArray(src, name, value) {
  const span = arraySpan(src, name);
  if (!span) return null;
  return src.slice(0, span.start) + JSON.stringify(value) + src.slice(span.end);
}

// The styles were drawn for dark footage: white words, neon colours. On the
// app's scenes the colours come from the Identity's look, read at 3:1 at
// least (hyperframes check): on a light look the white and pale words take
// the text colour; neon and code green take the main colour; the accent
// lists take the three brand colours. On a dark look white stays white.
const PALE = ["#ffffff", "#fff", "#f5f0d0", "#eeeeee", "#ffd0a0"];
const LOUD = ["#00ff41", "#e50914"];
export function recolorCaption(html, theme = {}, light = false) {
  if (!theme.fg) return html;
  let out = html;
  const swap = (from, to) => (out = out.replace(new RegExp(from, "gi"), to));
  // the karaoke pill: its own light plate, dim words still to come
  out = out.replace(/(\b(?:var|const)\s+COLOR_INACTIVE\s*=\s*)"[^"]*"/, `$1"${theme.muted ?? theme.fg}"`);
  out = out.replace(/(\b(?:var|const)\s+COLOR_ACTIVE\s*=\s*)"[^"]*"/, `$1"${theme.fg}"`);
  out = out.replace(/background:\s*#e7e5e7/gi, `background: ${theme.surface ?? theme.bg}`);
  out = out.replace(/color:\s*#a6a6a6/gi, `color: ${theme.muted ?? theme.fg}`);
  out = out.replace(/(\b(?:var|const)\s+ACCENT_COLORS\s*=\s*)\[[^\]]*\]/, `$1${JSON.stringify([theme.brand, theme.accent, theme["accent-2"]].filter(Boolean))}`);
  for (const c of LOUD) swap(c, theme.brand ?? theme.fg);
  if (light) {
    out = out.replace(/(\b(?:var|const)\s+PRIMARY_COLOR\s*=\s*)"[^"]*"/, `$1"${theme.fg}"`);
    for (const c of PALE) out = out.replace(new RegExp(String.raw`(color:\s*)${c}\b`, "gi"), `$1${theme.fg}`);
  }
  return out;
}

// The build copy of a caption style for one video. `words`: [{ text, start,
// end }] on the video's timeline; `total`: its length; `family`: the display
// font's family name; `theme` and `light`: the look (recolorCaption).
export function adaptCaption(name, html, { words, total, family, theme = null, light = false }) {
  if (!words.length) throw new Error("There are no words to caption (make the voice first).");
  const w = words.map((x) => ({ text: String(x.text), start: r3(x.start), end: r3(Math.max(x.end, x.start + 0.05)) }));
  const groups = captionGroups(w);
  let out = html;
  let set = false;
  for (const name of ["TRANSCRIPT", "WORDS", "W"]) {
    const next = replaceArray(out, name, w);
    if (next) {
      out = next;
      set = true;
      break;
    }
  }
  if (!set) throw new Error(`${name} changed upstream: its transcript was not found. Update runner/captions/index.mjs.`);
  const raw = replaceArray(out, "RAW_GROUPS", groups);
  if (raw) out = raw;
  const objs = replaceArray(out, "GROUPS", groups.map(([a, b]) => ({ wordStart: a, wordEnd: b, start: w[a].start, end: w[b].end })));
  if (objs) out = objs;
  if (arraySpan(out, "BLOCKS")) {
    const parallax = /behind\s*:/.test(out.slice(arraySpan(out, "BLOCKS").start, arraySpan(out, "BLOCKS").end));
    const blocks = groups.map(([a, b]) => {
      const idx = Array.from({ length: b - a + 1 }, (_, k) => a + k);
      if (parallax) return idx.length > 1 ? { behind: [[b]], front: idx.slice(0, -1).map((i) => [i]) } : { behind: null, front: [[a]] };
      const half = Math.ceil(idx.length / 2);
      const line1 = idx.slice(0, half).map((i) => [i, "n"]);
      const line2 = idx.length > 1 ? idx.slice(half).map((i, k, all) => [i, k === all.length - 1 ? "e" : "n"]) : null;
      return { line1: line2 ? line1 : [[a, "e"]], line2 };
    });
    out = replaceArray(out, "BLOCKS", blocks);
  }
  // the video's length: the root's data-duration and a DURATION constant
  out = out.replace(/(data-composition-id="[^"]+"[^>]*?data-duration=")[\d.]+(")/, `$1${r3(total)}$2`);
  out = out.replace(/(data-duration=")[\d.]+("[^>]*?data-composition-id=")/, `$1${r3(total)}$2`);
  out = out.replace(/\b((?:var|const|let)\s+DURATION\s*=\s*)[\d.]+/, `$1${r3(total)}`);
  // no remote fonts: the Identity's display font, bundled with the build
  out = out.replace(/<link\b[^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>/g, "");
  const fam = String(family ?? "").replace(/["\\]/g, "");
  if (fam) {
    out = out.replace(/font-family:\s*"[^"]+"/g, `font-family: "${fam}"`);
    out = out.replace(/\b((?:var|const|let)\s+FONT_FAMILY\s*=\s*)"[^"]*"/g, `$1"${fam}"`);
    out = out.replace(/(\d+(?:px)?\s+)"(?:Poppins|Montserrat|Anton|Inter|Outfit|Gabarito|Space Grotesk|Instrument Serif)"/g, `$1"${fam}"`);
  }
  if (/cdn\.jsdelivr\.net\/npm\/gsap/.test(out)) throw new Error(`${name}: still loads GSAP from the internet.`);
  // Captions sit over the scenes on purpose (hyperframes check: intentional
  // layering is marked on the layer itself).
  // The marking is not inherited and the words are made by the style's
  // script, so a last script marks every element of the layer.
  const mark = `<script>(function () { var r = document.querySelector('[data-composition-id="${name}"]'); if (r) r.querySelectorAll("*").forEach(function (e) { e.setAttribute("data-layout-allow-overlap", ""); }); })();</script>`;
  out = out.includes("</body>") ? out.replace(/<\/body>(?![\s\S]*<\/body>)/, `${mark}\n</body>`) : `${out}\n${mark}`;
  return theme ? recolorCaption(out, theme, light) : out;
}
