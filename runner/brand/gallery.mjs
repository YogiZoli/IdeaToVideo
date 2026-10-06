// brand/gallery.mjs: everything the Brand wizard's gallery offers, as cards.
// Two sources: the HyperFrames frame presets (card.mjs presetCards) and the
// open-design design systems (library/opendesign/, tokens.mjs). An
// open-design look is named "<name> style" and gets the id "od-<id>"; the
// gallery says the styles are not affiliated with the brands named
// (Zoltan, 2026-10-02; docs/wizards/brand.md 12b).

import fs from "node:fs";
import path from "node:path";
import { libraryDir } from "../gates/build/assemble.mjs";
import { presetCards, DEFAULT_PRESET } from "./card.mjs";
import { cardFromTokens } from "./tokens.mjs";
import { familyNames, fontsIndex } from "./fonts.mjs";

export const HYPERFRAMES_GROUP = "HyperFrames presets";
export const STYLE_NOTE = "Style names describe a look only. Not affiliated with or endorsed by the brands named.";

// A few open-design categories mean the same thing under different names.
const CATEGORY = {
  "Editorial · Studio": "Editorial & Print",
  "Editorial / Personal / Publication": "Editorial & Print",
  "Social & Messaging": "Media & Consumer",
};

let cache = null;
export function openDesignCards({ dir = libraryDir(), fresh = false } = {}) {
  if (cache && !fresh && cache.dir === dir) return cache.list;
  const root = path.join(dir, "opendesign");
  const list = [];
  if (fs.existsSync(path.join(root, "SOURCE.json"))) {
    const families = familyNames(fontsIndex(dir));
    for (const id of JSON.parse(fs.readFileSync(path.join(root, "SOURCE.json"), "utf8")).systems) {
      try {
        const manifest = JSON.parse(fs.readFileSync(path.join(root, id, "manifest.json"), "utf8"));
        const name = String(manifest.name ?? id).slice(0, 60);
        const label = `${name} style`;
        const { card, notes } = cardFromTokens(fs.readFileSync(path.join(root, id, "tokens.css"), "utf8"), { families, name: label, source: { kind: "preset", preset: `od-${id}` } });
        list.push({ id: `od-${id}`, label, group: CATEGORY[manifest.category] ?? manifest.category ?? "Other", card, fonts: notes });
      } catch {
        // a system that does not read as tokens is simply not offered
      }
    }
    list.sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label));
  }
  cache = { dir, list };
  return list;
}

// The whole gallery: the HyperFrames presets first (Blue Professional, the
// default, leading), then the open-design styles by category.
export function galleryCards(opts = {}) {
  return [...presetCards(opts).map((p) => ({ ...p, group: HYPERFRAMES_GROUP })), ...openDesignCards(opts)];
}

export function cardForLook(id, opts = {}) {
  const all = galleryCards(opts);
  return structuredClone((all.find((p) => p.id === id) ?? all.find((p) => p.id === DEFAULT_PRESET)).card);
}
