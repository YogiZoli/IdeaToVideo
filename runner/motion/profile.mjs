// motion/profile.mjs: the Identity's Motion profile, <identity>/motion.json
// (docs/motion-wizard.md, docs/wizards/motion.md 4). Every ONE Video of the
// Identity inherits it; without one a video is built exactly as before the
// wizard (cut, plain background, no camera, every scene component).
//
// The Motion wizard starts from HyperFrames' own motion vocabulary
// (transitions.mjs MOODS, from its transition overview), and recommends a mood
// from the Brand: an open-design style's motion tokens (--motion-base,
// --ease-standard) say whether that design system moves slowly, snappily,
// with a bounce, in steps, or not at all.

import fs from "node:fs";
import path from "node:path";
import { validate, loadSchema } from "../schema/validate.mjs";
import { ALL_MOODS, moodPair, loadRegistry, knownTransition, CUT, SHADERS, ENERGIES } from "./transitions.mjs";
import { BACKGROUNDS, CAMERAS } from "./stage.mjs";
import { COMPONENTS, ROLES, PACES, DEFAULT_PACE } from "../gates/scenes/roles.mjs";
import { loadComponent, checkVars, libraryDir } from "../gates/build/assemble.mjs";
import { cssVars } from "../brand/tokens.mjs";

export const MOTION_SCHEMA = "motion-profile/1";
export const MOTION_FILE = "motion.json";
// The closing role belongs to the CTA wizard (docs/wizards/motion.md 9).
export const WIZARD_ROLES = Object.keys(ROLES).filter((r) => r !== "closing");
export const DEFAULT_MOOD = "premium";
// Style variables the wizard never offers: the accent is the Brand's, and a
// scene's exit belongs to the scene change (HyperFrames: "exit defaults to
// none everywhere: primitives hold their final frame and the frame root owns
// transitions").
const NOT_STYLE = new Set(["accent", "exit"]);

export const motionPath = (identityDir) => path.join(identityDir, MOTION_FILE);

// A whole profile from a mood (the Start screen's cards). The camera starts
// on (push): a still frame read as a slide (Zoltan, 2026-10-06); the
// background starts plain.
export function profileFromMood(mood = DEFAULT_MOOD, { energy } = {}) {
  const m = ALL_MOODS[mood];
  if (!m) throw new Error(`Unknown mood: ${mood}.`);
  return {
    schema: MOTION_SCHEMA,
    transition: { mood, ...moodPair(mood), energy: energy ?? m.energy, where: "every" },
    background: { type: "plain", vars: {} },
    camera: { move: "push" },
    pace: DEFAULT_PACE,
    scenes: { off: [], style: {} },
  };
}

// Everything a profile may say, checked; returns the clean profile or throws
// one readable sentence per problem.
export function normalizeProfile(input, { dir = libraryDir() } = {}) {
  if (!input || typeof input !== "object") throw new Error("The Motion profile is not an object.");
  const schemaErrors = validate(input, loadSchema("motion-profile"));
  if (schemaErrors.length) throw new Error(`The Motion profile is not valid: ${schemaErrors.slice(0, 4).join("; ")}`);
  const registry = loadRegistry(dir);
  const errors = [];
  const t = { mood: DEFAULT_MOOD, primary: CUT, accent: null, energy: "calm", where: "every", ...(input.transition ?? {}) };
  if (!ALL_MOODS[t.mood]) errors.push(`Unknown mood: ${t.mood}.`);
  if (!knownTransition(t.primary, registry)) errors.push(`Unknown transition: ${t.primary}.`);
  if (t.accent !== null && !knownTransition(t.accent, registry)) errors.push(`Unknown transition: ${t.accent}.`);
  const b = { type: "plain", vars: {}, ...(input.background ?? {}) };
  if (b.type !== "plain") {
    const item = loadComponent(BACKGROUNDS[b.type].component, { env: { ITV_LIBRARY_DIR: dir } }).item;
    errors.push(...checkVars(item, b.vars));
  }
  const camera = { move: "push", ...(input.camera ?? {}) };
  const off = [...new Set(input.scenes?.off ?? [])];
  for (const name of off) {
    if (!COMPONENTS[name]) errors.push(`Unknown scene component: ${name}.`);
    else if (!WIZARD_ROLES.includes(COMPONENTS[name].role)) errors.push(`${COMPONENTS[name].label} is not chosen here (its role belongs to the CTA wizard).`);
  }
  for (const role of Object.keys(ROLES)) {
    const left = Object.entries(COMPONENTS).filter(([n, c]) => c.role === role && !off.includes(n));
    if (!left.length) errors.push(`Keep at least one scene for "${ROLES[role].label}".`);
  }
  const style = {};
  for (const [name, vars] of Object.entries(input.scenes?.style ?? {})) {
    if (!COMPONENTS[name]) {
      errors.push(`Unknown scene component: ${name}.`);
      continue;
    }
    const item = loadComponent(name, { env: { ITV_LIBRARY_DIR: dir } }).item;
    const styleIds = new Set((item.variables ?? []).filter((v) => v.role === "style" && !NOT_STYLE.has(v.id)).map((v) => v.id));
    for (const id of Object.keys(vars)) if (!styleIds.has(id)) errors.push(`${COMPONENTS[name].label}: ${id} is not a style setting.`);
    errors.push(...checkVars(item, vars));
    if (Object.keys(vars).length) style[name] = { ...vars };
  }
  if (errors.length) throw new Error(errors.join(" "));
  const out = { schema: MOTION_SCHEMA, transition: t, background: b, camera, pace: input.pace ?? DEFAULT_PACE, scenes: { off, style } };
  if (input.updatedAt) out.updatedAt = input.updatedAt;
  return out;
}

// The saved profile, or null when the Identity has none (the build then
// stays exactly as before the wizard).
export function loadProfile(identityDir, opts = {}) {
  const file = identityDir ? motionPath(identityDir) : null;
  if (!file || !fs.existsSync(file)) return null;
  return normalizeProfile(JSON.parse(fs.readFileSync(file, "utf8")), opts);
}

export function saveProfile(identityDir, profile, opts = {}) {
  if (!identityDir) throw new Error("No Identity to save the Motion profile in.");
  const clean = normalizeProfile({ ...profile, updatedAt: (opts.now ?? new Date()).toISOString() }, opts);
  fs.mkdirSync(identityDir, { recursive: true });
  const tmp = path.join(identityDir, `.${MOTION_FILE}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(clean, null, 2) + "\n");
  fs.renameSync(tmp, motionPath(identityDir));
  return clean;
}

// ---- what the profile changes in a video --------------------------------------

// The scene components the scene table may use.
export const allowedComponents = (profile) => Object.keys(COMPONENTS).filter((n) => !profile?.scenes?.off?.includes(n));

// A scene's variables with the profile's style settings on top: the user's
// choice wins over the AI's.
export const styledVars = (profile, component, vars = {}) => ({ ...vars, ...(profile?.scenes?.style?.[component] ?? {}) });

// ---- the recommendation from the Brand ----------------------------------------

// open-design motion tokens -> a mood and an energy. Most design systems share
// the same values (150-240 ms, cubic-bezier(0.2, 0, 0, 1)); only the ones that
// differ say something, and only that is used.
export function moodFromTokens(css) {
  const vars = cssVars(css);
  const ms = (v) => {
    const m = /^\s*([\d.]+)\s*(ms|s)\s*$/.exec(v ?? "");
    return m ? Number(m[1]) * (m[2] === "s" ? 1000 : 1) : null;
  };
  const base = ms(vars["--motion-base"]);
  const ease = String(vars["--ease-standard"] ?? "").replace(/\s+/g, "");
  if (base === 0) return { mood: "none", reason: "Your brand style uses no motion." };
  if (/^steps\(/.test(ease)) return { mood: "retro", reason: "Your brand style moves in steps." };
  const bezier = /^cubic-bezier\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\)$/.exec(ease);
  if (bezier && (Number(bezier[2]) > 1 || Number(bezier[4]) > 1)) return { mood: "playful", reason: "Your brand style overshoots." };
  if (base !== null && base >= 260) return { mood: DEFAULT_MOOD, energy: "calm", reason: "Your brand style moves slowly." };
  if (base !== null && base <= 120) return { mood: "editorial", energy: "high", reason: "Your brand style moves fast." };
  return null;
}

// The Start screen's recommended mood for a Brand Identity Card.
export function recommendMood(card, { dir = libraryDir() } = {}) {
  const preset = card?.source?.preset ?? "";
  const m = /^od-([a-z0-9-]+)$/.exec(preset);
  if (m) {
    const file = path.join(dir, "opendesign", m[1], "tokens.css");
    if (fs.existsSync(file)) {
      const r = moodFromTokens(fs.readFileSync(file, "utf8"));
      if (r) return r;
    }
  }
  return { mood: DEFAULT_MOOD, reason: null };
}

// ---- what the wizard shows ------------------------------------------------------

// Every choice of the Motion wizard, in the words the user sees.
export function wizardOptions({ dir = libraryDir() } = {}) {
  const env = { ITV_LIBRARY_DIR: dir };
  const registry = loadRegistry(dir);
  const transition = (name) => ({ name, kind: name === CUT ? "cut" : SHADERS.includes(name) ? "shader" : "css", label: TRANSITION_LABELS[name] ?? name });
  const moods = Object.entries(ALL_MOODS).map(([id, m]) => ({ id, label: m.label, hint: m.hint, energy: m.energy, ...moodPair(id), transitions: [...m.css, ...m.shaders].map(transition) }));
  const scenes = WIZARD_ROLES.map((role) => ({
    role,
    label: ROLES[role].label,
    hint: ROLES[role].hint,
    components: Object.entries(COMPONENTS)
      .filter(([, c]) => c.role === role)
      .map(([name, c]) => {
        const { item } = loadComponent(name, { env });
        return {
          name,
          label: c.label,
          description: item.description,
          style: (item.variables ?? [])
            .filter((v) => v.role === "style" && !NOT_STYLE.has(v.id))
            .map((v) => ({ id: v.id, type: v.type, label: v.label ?? v.id, description: v.description, default: v.default, options: v.options?.map((o) => ({ value: o.value, label: o.label ?? o.value })) })),
        };
      }),
  }));
  return {
    moods,
    energies: Object.entries(ENERGIES).map(([id, e]) => ({ id, label: e.label, seconds: e.seconds })),
    transitions: [CUT, ...registry.transitions.map((t) => t.name), ...SHADERS].map(transition),
    backgrounds: Object.entries(BACKGROUNDS).map(([id, b]) => ({ id, label: b.label, darkOnly: Boolean(b.dark), cost: b.component ? RENDER_COST.background : null })),
    shaderCost: RENDER_COST.shader,
    cameras: Object.entries(CAMERAS).map(([id, c]) => ({ id, label: c.label })),
    paces: Object.entries(PACES).map(([id, p]) => ({ id, label: p.label, picture: p.picture })),
    scenes,
  };
}

// What a choice adds to the render time, measured on the sample video
// (scripts/phase2/motion-measure.mjs, docs/wizards/motion.md 6), in the
// words the wizard shows next to it. CSS transitions and the camera cost
// next to nothing.
export const RENDER_COST = {
  shader: "Renders about 1.5 times slower.",
  background: "Renders about 2 times slower.",
};

// The names the wizard shows for transitions (the registry's and the shader
// package's own descriptions, shortened).
export const TRANSITION_LABELS = {
  cut: "Cut",
  crossfade: "Crossfade",
  "blur-crossfade": "Soft blur",
  "push-slide": "Push",
  "zoom-through": "Zoom through",
  squeeze: "Squeeze",
  "domain-warp": "Domain warp",
  "ridged-burn": "Burn",
  "whip-pan": "Whip pan",
  "sdf-iris": "Iris",
  "ripple-waves": "Ripple",
  "gravitational-lens": "Lens warp",
  "cinematic-zoom": "Cinematic zoom",
  "chromatic-split": "Chromatic split",
  glitch: "Glitch",
  "swirl-vortex": "Swirl",
  "thermal-distortion": "Heat shimmer",
  "flash-through-white": "Flash",
  "cross-warp-morph": "Morph",
  "light-leak": "Light leak",
};
