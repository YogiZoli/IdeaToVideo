// brand/fonts.mjs: the fonts the app ships (library/fonts/, built by
// scripts/fetch-library.mjs, all OFL, every one with all letters of the 10
// content languages). A build gets the files of the families it uses under
// build/fonts/ and @font-face rules in index.html, so the render never asks
// the network for a font (docs/wizards/brand.md 6.2).

import fs from "node:fs";
import path from "node:path";
import { libraryDir } from "../gates/build/assemble.mjs";

let cache = null;
export function fontsIndex(dir = libraryDir()) {
  if (cache?.dir === dir) return cache.index;
  const file = path.join(dir, "fonts", "FONTS.json");
  const index = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { families: [] };
  cache = { dir, index };
  return index;
}

export const familyNames = (index = fontsIndex()) => index.families.map((f) => f.family);
export const categories = (index = fontsIndex()) => Object.fromEntries(index.families.map((f) => [f.family, f.category]));

// The @font-face rules (relative to index.html) and the files behind them.
// Families the app does not ship are skipped: the theme's fallback covers them.
export function fontFaces(families, { dir = libraryDir(), base = "fonts" } = {}) {
  const index = fontsIndex(dir);
  const rules = [];
  const files = [];
  for (const name of families) {
    const fam = index.families.find((f) => f.family === name);
    if (!fam) continue;
    // A family with one weight only (Bebas Neue, Archivo Black...) is drawn
    // as designed at every weight: declared for 100-900, the browser never
    // fakes a bold from it.
    const single = !fam.variable && new Set(fam.files.map((f) => f.weight)).size === 1;
    for (const f of fam.files) {
      const rel = `${base}/${fam.id}/${f.file}`;
      files.push({ from: path.join(dir, "fonts", fam.id, f.file), to: rel });
      rules.push(`@font-face { font-family: '${fam.family}'; font-style: normal; font-display: block; font-weight: ${single ? "100 900" : f.weight}; src: url('${rel}') format('woff2'); unicode-range: ${f.unicodeRange}; }`);
    }
  }
  return { css: rules.join("\n"), files };
}
