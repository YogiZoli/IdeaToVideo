// presets/index.mjs: the preset engine (docs/BUILD_PLAN.md, DECISIONS 134). A
// style preset is one folder, runner/presets/<id>/, with preset.json: the style
// sheet's JSON tokens, 8 to 15 parameterized scene templates, and the shot
// rules. Its PNG style sheet is rendered by code from the tokens
// (stylesheet.mjs). Adding a preset is adding a folder; nothing else changes.
//
// A template's `use` list names what draws it, the first one this channel has
// wins. Motion Frames names the channel's own block pack first and the bundled
// components after it, so a channel without the pack still works.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COMPONENTS, PACK_COMPONENTS, PACES } from "../gates/scenes/roles.mjs";
import { BASE_MOTION, loadComponent } from "../gates/build/assemble.mjs";
import { fixContrast } from "../brand/card.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

export const PRESET_SCHEMA = "style-preset/1";
export const DEFAULT_PRESET = "motion-frames";
export const TEMPLATES_MIN = 8;
export const TEMPLATES_MAX = 15;
export const ENGINES = { script: "Script", recorded: "Recorded" };
const RULES = ["pacing", "cutFrequency", "camera", "characters", "sound"];

// Every problem with a preset, as sentences. A preset with one is not offered.
export function checkPreset(p) {
  const issues = [];
  if (p?.schema !== PRESET_SCHEMA) issues.push(`schema must be ${PRESET_SCHEMA}`);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(String(p?.id ?? ""))) issues.push("id must be lowercase letters, digits and dashes");
  if (!String(p?.label ?? "").trim()) issues.push("label is missing");
  if (!ENGINES[p?.engine]) issues.push(`engine must be one of ${Object.keys(ENGINES).join(", ")}`);
  if (!p?.tokens?.colors?.background || !p?.tokens?.colors?.primary) issues.push("tokens need at least the background and primary colors");
  for (const r of RULES) if (!String(p?.shotRules?.[r] ?? "").trim()) issues.push(`shotRules.${r} is missing`);
  if (p?.shotRules?.pacing && !PACES[p.shotRules.pacing]) issues.push(`shotRules.pacing must be one of ${Object.keys(PACES).join(", ")}`);
  const list = p?.templates;
  // A recording brings its own picture: a Recorded preset names only what it adds to it.
  const least = p?.engine === "recorded" ? 1 : TEMPLATES_MIN;
  if (!Array.isArray(list) || list.length < least || list.length > TEMPLATES_MAX) issues.push(`a preset has ${least} to ${TEMPLATES_MAX} templates`);
  if (p?.engine === "recorded" && !p?.recorded?.slots?.length) issues.push("a Recorded preset names its files (recorded.slots)");
  const seen = new Set();
  for (const t of Array.isArray(list) ? list : []) {
    const at = `template ${t?.id ?? "?"}`;
    if (Object.values(t?.params ?? {}).some((x) => x.type === "object") && !p.objects?.length) issues.push(`${at}: an object parameter needs the preset's objects list`);
    if (!t?.id || seen.has(t.id)) issues.push(`${at}: needs a unique id`);
    seen.add(t?.id);
    if (!String(t?.when ?? "").trim()) issues.push(`${at}: says nothing about when it fits`);
    if (!t?.params || !Object.values(t.params).some((x) => x.required)) issues.push(`${at}: needs at least one required parameter`);
    if (!Array.isArray(t?.use) || !t.use.length) issues.push(`${at}: names nothing that draws it`);
    for (const u of t?.use ?? []) {
      for (const v of Object.values(u.vars ?? {})) {
        for (const m of String(v).matchAll(/\$([A-Za-z0-9_]+)/g)) if (!t.params?.[m[1]]) issues.push(`${at}: ${u.component} uses an unknown parameter ${m[1]}`);
      }
    }
  }
  return issues;
}

let cache = null;
export function listPresets({ dir = here } = {}) {
  if (dir === here && cache) return cache;
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, e.name, "preset.json");
    if (!e.isDirectory() || !fs.existsSync(file)) continue;
    const p = JSON.parse(fs.readFileSync(file, "utf8"));
    const issues = checkPreset(p);
    if (issues.length) throw new Error(`The preset ${e.name} is not valid: ${issues.slice(0, 3).join("; ")}`);
    out.push(p);
  }
  // the default first, then by name
  out.sort((a, b) => (a.id === DEFAULT_PRESET ? -1 : b.id === DEFAULT_PRESET ? 1 : a.label.localeCompare(b.label)));
  if (dir === here) cache = out;
  return out;
}

export function loadPreset(id, opts) {
  const p = listPresets(opts).find((x) => x.id === id);
  if (!p) throw new Error(`There is no style preset called ${id}. Choose another in the channel's recipe.`);
  return p;
}

/** What the recipe editor shows of a preset. */
export const presetCard = (p) => ({ id: p.id, label: p.label, description: p.description, engine: p.engine, templates: p.templates.map((t) => ({ id: t.id, label: t.label })), shotRules: p.shotRules, ...(p.recorded ? { recorded: p.recorded } : {}), ...(p.defaults ? { defaults: p.defaults } : {}) });

/**
 * The look of a build on this preset. A preset that says tokens.from "brand" (Motion
 * Frames) takes the channel's look as it is. One with its own palette keeps it, and
 * its own scene moves: its blocks hold their own camera, so no 2D camera or changing
 * background goes around them, and scenes change on a cut. The channel's captions stay.
 */
export function presetLook(preset, look) {
  if (!preset || preset.engine !== "script" || preset.tokens.from === "brand") return look;
  const { colors: c, fonts: f } = preset.tokens;
  const stack = (family) => `'${family}', Inter, sans-serif`;
  return {
    ...look,
    theme: { bg: c.background, fg: c.text, muted: c.muted, surface: c.surface ?? c.background, border: c.border ?? c.muted, brand: fixContrast(c.primary, c.background, 3), accent: fixContrast(c.secondary ?? c.primary, c.background, 3), "accent-2": fixContrast(c.tertiary ?? c.secondary ?? c.primary, c.background, 3), radius: "28px", "font-display": stack(f.display), "font-body": stack(f.body), "font-mono": "ui-monospace, Consolas, monospace" },
    families: [...new Set([f.display, f.body, "Inter"])],
    light: preset.tokens.appearance !== "dark",
    motion: { ...BASE_MOTION, camera: { move: "off" }, ...(look?.motion?.captions ? { captions: look.motion.captions } : {}), ...(look?.motion?.spokenWord ? { spokenWord: look.motion.spokenWord } : {}) },
  };
}

// The block's own text variables nobody fills would show its sample text, so a
// pack block counts only when the template fills all of them.
function usable(u) {
  if (!String(u.component).includes(":")) return Boolean(COMPONENTS[u.component]);
  const meta = PACK_COMPONENTS.get(u.component);
  if (!meta) return false;
  return (meta.variables ?? []).every((v) => v.optional || v.type !== "string" || v.id in (u.vars ?? {}));
}

/**
 * The templates this channel can draw, each with the one `use` that draws it.
 * A template nothing can draw is left out. `off`: components the channel
 * turned off.
 */
export function resolveTemplates(preset, { off = [], env = process.env } = {}) {
  return preset.templates.flatMap((t) => {
    const use = t.use.find((u) => !off.includes(u.component) && usable(u));
    if (!use) return [];
    const variables = PACK_COMPONENTS.get(use.component)?.variables ?? loadComponent(use.component, { env }).item.variables ?? [];
    return [{ ...t, ...(preset.objects ? { objects: preset.objects } : {}), draw: { ...use, types: Object.fromEntries(variables.map((v) => [v.id, v.type])) } }];
  });
}
