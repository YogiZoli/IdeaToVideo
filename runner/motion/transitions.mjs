// motion/transitions.mjs: scene changes for the Motion wizard (docs/motion-wizard.md),
// made only from what HyperFrames ships, never our own recipes:
//
//   - CSS transitions: HyperFrames' transition registry (library/motion/transitions.json,
//     the faceless-explainer workflow's curated set: crossfade, blur-crossfade,
//     push-slide, zoom-through, squeeze), each a GSAP template on the two scene
//     wrappers. Applied the way HyperFrames' own injector does it
//     (skills/faceless-explainer/scripts/transitions.mjs): the outgoing scene is
//     extended by the transition's length and holds its last frame, the incoming
//     one starts where it always starts (on its sentence), the two sit on
//     different tracks, the template goes on the main timeline at the incoming
//     start. Nothing that is timed to the voice moves.
//   - Shader transitions: the @hyperframes/shader-transitions package (engine/),
//     HyperShader.init over all scenes. It then owns every scene change: a shader
//     where one is chosen, its CSS crossfade elsewhere (a cut is a one-frame
//     crossfade). A CSS registry transition at such a change keeps its
//     non-opacity part (blur, scale, travel) on top of that crossfade.
//
// Which transition goes where follows HyperFrames' transition overview
// (library/motion/overview.md, "Energy", "Mood" and "Narrative Position"): one
// primary between related points, the accent at the opening and at a topic
// change (a new script section), the outro the slowest and simplest.

import fs from "node:fs";
import path from "node:path";

// @hyperframes/shader-transitions 0.8.181 SHADER_NAMES (checked against the
// bundled package by the tests).
export const SHADERS = [
  "domain-warp", "ridged-burn", "whip-pan", "sdf-iris", "ripple-waves", "gravitational-lens", "cinematic-zoom",
  "chromatic-split", "glitch", "swirl-vortex", "thermal-distortion", "flash-through-white", "cross-warp-morph", "light-leak",
];
export const SHADER_FILE = "hyper-shader.global.js";
export const CUT = "cut";
export const FRAME = 1 / 30;

// overview.md "Energy -> Primary Transition": the middle of each duration
// range, and its easing (used where a template has none of its own: shaders
// and the crossfade the shader package draws).
export const ENERGIES = {
  calm: { label: "Calm", seconds: 0.65, ease: "sine.inOut" },
  medium: { label: "Medium", seconds: 0.4, ease: "power2.inOut" },
  high: { label: "High", seconds: 0.25, ease: "power4.inOut" },
};
// overview.md "Narrative Position", Outro: crossfade, 0.6-1.0 s.
export const OUTRO = { type: "crossfade", seconds: 0.8 };

// overview.md "Mood -> Transition Type", reduced to the transitions that exist
// here (the registry's five and the package's fourteen), in the table's order.
// The tests check every name against the bundled overview.md. The hints are
// the table's "Why it works" column in a few words.
export const MOODS = {
  warm: { label: "Warm", hint: "Soft edges and warm light, nothing sharp.", css: ["blur-crossfade"], shaders: ["light-leak", "thermal-distortion", "cross-warp-morph"], energy: "calm" },
  premium: { label: "Premium", hint: "Restraint: scenes flow into each other.", css: ["blur-crossfade"], shaders: ["cross-warp-morph", "thermal-distortion"], energy: "calm" },
  editorial: { label: "Editorial", hint: "Like turning a page: clean, directional.", css: ["push-slide"], shaders: ["whip-pan"], energy: "medium" },
  cold: { label: "Cold", hint: "Mechanical: content compresses and shrinks.", css: ["squeeze"], shaders: ["gravitational-lens"], energy: "medium" },
  tech: { label: "Tech", hint: "Digital: glitches and split colors.", css: [], shaders: ["glitch", "chromatic-split"], energy: "high" },
  tense: { label: "Tense", hint: "Unstable: warps, burns and glitches.", css: [], shaders: ["ridged-burn", "glitch", "domain-warp"], energy: "high" },
  playful: { label: "Playful", hint: "Ripples and swirls.", css: [], shaders: ["ripple-waves", "swirl-vortex"], energy: "medium" },
  dramatic: { label: "Dramatic", hint: "Scale and light pushed to the extreme.", css: ["zoom-through"], shaders: ["cinematic-zoom", "gravitational-lens", "domain-warp"], energy: "high" },
  retro: { label: "Retro", hint: "Warm light leaks, an analog feel.", css: [], shaders: ["light-leak"], energy: "calm" },
};
// Two plain choices beside the moods: the registry's "any energy" crossfade,
// and no transition at all (HyperFrames' `cut`).
export const PLAIN = {
  simple: { label: "Simple", hint: "A plain crossfade at every change.", css: ["crossfade"], shaders: [], energy: "calm" },
  none: { label: "No transitions", hint: "Straight cuts, no transitions.", css: [], shaders: [], energy: "medium" },
};
export const ALL_MOODS = { ...MOODS, ...PLAIN };

// The mood's own pair: its first transition as the primary, its first shader
// (when that is another one) as the accent.
export function moodPair(mood) {
  const m = ALL_MOODS[mood];
  if (!m) throw new Error(`Unknown mood: ${mood}.`);
  const options = [...m.css, ...m.shaders];
  if (!options.length) return { primary: CUT, accent: null };
  const primary = options[0];
  const accent = m.shaders.find((s) => s !== primary) ?? null;
  return { primary, accent };
}

export function loadRegistry(libraryDir) {
  const file = path.join(libraryDir, "motion", "transitions.json");
  if (!fs.existsSync(file)) throw new Error("The library has no transition registry (motion/transitions.json). Reinstall the app.");
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(data.transitions) || !data.transitions.length) throw new Error("motion/transitions.json has no transitions.");
  return data;
}

export const isShader = (name) => SHADERS.includes(name);
export const knownTransition = (name, registry) => name === CUT || isShader(name) || registry.transitions.some((t) => t.name === name);

const r3 = (x) => Math.round(x * 1000) / 1000;

// One entry per scene change (n scenes, n - 1 changes): { type, seconds, ease,
// direction }. `scenes`: [{ start, duration }] as sceneTimes gives them;
// `sectionStarts`: indexes of scenes that open a new script section.
export function planTransitions(scenes, { transition, registry, sectionStarts = new Set() }) {
  const t = transition ?? {};
  const energy = ENERGIES[t.energy] ?? ENERGIES.calm;
  const primary = t.primary ?? CUT;
  const accent = t.accent ?? primary;
  const plan = [];
  for (let i = 1; i < scenes.length; i++) {
    const last = i === scenes.length - 1;
    const topic = sectionStarts.has(i);
    let type;
    if (primary === CUT && !t.accent) type = CUT;
    else if (last && scenes.length > 2) type = OUTRO.type;
    else if (i === 1 || topic) type = accent;
    else type = t.where === "sections" ? CUT : primary;
    if (type === CUT) {
      plan.push({ type: CUT, seconds: 0 });
      continue;
    }
    const rec = registry.transitions.find((x) => x.name === type);
    // The energy's length (overview.md "Energy"), not the recipe's default:
    // the energy is what the user chose.
    const base = last && scenes.length > 2 ? OUTRO.seconds : energy.seconds;
    // Never longer than the registry allows, nor than a third of the
    // incoming scene (it must land well before the next change).
    const seconds = r3(Math.max(FRAME, Math.min(base, registry.max_duration_s ?? 2, scenes[i].duration / 3)));
    plan.push({ type, seconds, ease: energy.ease, direction: t.direction ?? rec?.default_direction });
  }
  return plan;
}

// The GSAP lines of one registry transition, tokens filled in the way
// HyperFrames' injector fills them (buildGsap): __OLD__, __NEW__, __T__,
// __DUR__, and for a directional one __DX__/__DXIN__ or __DY__/__DYIN__.
export function templateLines(rec, { from, to, at, seconds, direction, width = 1920, height = 1080 }) {
  const subs = { __OLD__: JSON.stringify(`#${from}`), __NEW__: JSON.stringify(`#${to}`), __T__: String(at), __DUR__: String(seconds) };
  let template;
  if (rec.directions?.length) {
    const dir = String(direction || rec.default_direction || rec.directions[0]).toUpperCase();
    if (!rec.directions.includes(dir)) throw new Error(`${rec.name} has no direction ${dir}.`);
    const vertical = dir === "UP" || dir === "DOWN";
    template = vertical ? rec.gsap_template_vertical : rec.gsap_template_horizontal;
    if (vertical) {
      const dy = dir === "UP" ? -height : height;
      Object.assign(subs, { __DY__: String(dy), __DYIN__: String(-dy) });
    } else {
      const dx = dir === "LEFT" ? -width : width;
      Object.assign(subs, { __DX__: String(dx), __DXIN__: String(-dx) });
    }
  } else template = rec.gsap_template;
  if (!Array.isArray(template)) throw new Error(`${rec.name}: no GSAP template.`);
  return template.map((line) => Object.entries(subs).reduce((out, [k, v]) => out.split(k).join(v), line));
}

// A template line without its opacity: the shader package draws the
// crossfade itself, the rest of the recipe (blur, scale, travel) stays.
export function withoutOpacity(line) {
  return line
    .replace(/,?\s*opacity:\s*[\d.]+/g, "")
    .replace(/\{\s*,\s*/g, "{ ")
    .replace(/\{\s*\}/g, "{}");
}

// Everything the build needs for the scene changes:
//   extend[i]   seconds scene i holds past its own end (its outgoing change)
//   lines       GSAP lines for the main timeline
//   shader      the HyperShader.init config, or null (then no package is loaded)
// `ids`: the scene wrappers' element ids, in order.
export function transitionBuild(scenes, plan, { ids, registry, theme = {}, width = 1920, height = 1080 }) {
  const extend = scenes.map(() => 0);
  const lines = [];
  const byName = new Map(registry.transitions.map((t) => [t.name, t]));
  const shaderMode = plan.some((p) => isShader(p.type));
  const shaderList = [];
  plan.forEach((p, k) => {
    const from = ids[k];
    const to = ids[k + 1];
    const at = scenes[k + 1].start;
    if (shaderMode) {
      const seconds = p.type === CUT ? r3(FRAME) : p.seconds;
      extend[k] = seconds;
      if (isShader(p.type)) shaderList.push({ time: at, shader: p.type, duration: seconds, ease: p.ease });
      else {
        shaderList.push({ time: at, duration: seconds, ease: p.ease });
        const rec = byName.get(p.type);
        if (rec) lines.push(...templateLines(rec, { from, to, at, seconds, direction: p.direction, width, height }).map(withoutOpacity));
      }
      return;
    }
    if (p.type === CUT) return;
    const rec = byName.get(p.type);
    if (!rec) throw new Error(`Unknown transition: ${p.type}.`);
    extend[k] = p.seconds;
    lines.push(...templateLines(rec, { from, to, at, seconds: p.seconds, direction: p.direction, width, height }));
  });
  const shader = shaderMode
    ? { bgColor: hex(theme.bg) ?? "#000000", accentColor: hex(theme.brand) ?? undefined, scenes: ids, transitions: shaderList, compositionId: "main" }
    : null;
  return { extend: extend.map(r3), lines, shader };
}

const hex = (v) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim() : null);
