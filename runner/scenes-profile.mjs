// scenes-profile.mjs: the Identity's Scenes profile, the Scenes wizard's
// result (Zoltan, 2026-10-06: "a fourth wizard, a rich one"; DECISIONS 110).
// What is on screen, where the Motion wizard says how it moves:
//
//   <identity>/scenes.json  { schema, preset, mix, off, icons, pictures }
//
//   mix       the share of scene kinds the planner aims for: words on screen,
//             icons and drawings, pictures, video (percent, adds up to 100)
//   off       built-in scene types turned off (they moved here from the
//             Motion profile; an old Motion profile's list still counts)
//   icons     which icon sets the drawings use, in order of preference
//   pictures  where pictures and video may come from
//
// Packs keep their own on/off state per Identity (packs/), the wizard shows
// and changes it in place.

import fs from "node:fs";
import path from "node:path";
import { COMPONENTS, ROLES } from "./gates/scenes/roles.mjs";
import { FAMILIES } from "./icons/index.mjs";

export const SCENES_SCHEMA = "scenes-profile/1";
export const SCENES_FILE = "scenes.json";
export const KINDS = ["text", "icon", "image", "video"];
export const KIND_LABELS = { text: "Words on screen", icon: "Icons and drawings", image: "Pictures", video: "Video clips" };

export const MIX_PRESETS = {
  balanced: { label: "Balanced", hint: "A bit of everything: words carry the point, icons and pictures keep it moving.", mix: { text: 40, icon: 30, image: 20, video: 10 } },
  visual: { label: "Visual", hint: "Mostly pictures and drawings, words only where they matter.", mix: { text: 25, icon: 30, image: 30, video: 15 } },
  drawn: { label: "Drawn", hint: "A whiteboard feel: icons and drawings lead, few pictures.", mix: { text: 30, icon: 50, image: 15, video: 5 } },
  words: { label: "Word-led", hint: "Big kinetic words lead, icons and pictures as accents.", mix: { text: 60, icon: 25, image: 10, video: 5 } },
};
export const DEFAULT_PRESET = "balanced";

// Where pictures and video come from; "later" ones are shown but not usable yet.
export const PICTURE_SOURCES = {
  footage: { label: "Your own footage", hint: "Clips you added in Settings, Identity, Footage. Free.", kinds: ["video", "image"] },
  pixabay: { label: "Pixabay", hint: "Free stock photos and videos, also for commercial use. Needs a free Pixabay key (Settings, Identity, Footage).", kinds: ["image", "video"] },
  "ai-broll": { label: "AI B-roll (HeyGen)", hint: "Generated clips; costs HeyGen API credits, off by default (Settings, Identity, Footage).", kinds: ["video"] },
  "ai-image": { label: "AI pictures", hint: "Generated pictures with your Gemini key. Coming soon; costs a little per picture.", kinds: ["image"], later: true },
};

export const scenesPath = (identityDir) => path.join(identityDir, SCENES_FILE);
const ROLES_WITH_LIBRARY = Object.keys(ROLES).filter((r) => r !== "closing" && Object.values(COMPONENTS).some((c) => c.role === r && !c.retired));

export function defaultScenes({ off = [] } = {}) {
  return { schema: SCENES_SCHEMA, preset: DEFAULT_PRESET, mix: { ...MIX_PRESETS[DEFAULT_PRESET].mix }, off: [...off], icons: { families: [...FAMILIES] }, pictures: { sources: ["footage", "pixabay"] } };
}

// The profile checked and evened out: the mix adds up to 100, unknown names
// go, each role of the built-in library keeps at least one scene type.
export function normalizeScenes(input) {
  if (!input || typeof input !== "object") throw new Error("The Scenes profile is not an object.");
  const errors = [];
  const raw = KINDS.map((k) => Math.max(0, Math.round(Number(input.mix?.[k] ?? 0))));
  const sum = raw.reduce((a, b) => a + b, 0);
  if (!sum) errors.push("The mix needs at least one kind of scene.");
  const mix = Object.fromEntries(KINDS.map((k, i) => [k, sum ? Math.round((raw[i] * 100) / sum) : 0]));
  const drift = 100 - KINDS.reduce((a, k) => a + mix[k], 0);
  if (sum) mix[KINDS.reduce((best, k) => (mix[k] > mix[best] ? k : best), "text")] += drift;
  const off = [...new Set((input.off ?? []).filter((n) => COMPONENTS[n] && COMPONENTS[n].role !== "closing"))];
  for (const role of ROLES_WITH_LIBRARY) {
    const left = Object.entries(COMPONENTS).filter(([n, c]) => c.role === role && !c.retired && !off.includes(n));
    if (!left.length) errors.push(`Keep at least one scene type for "${ROLES[role].label}".`);
  }
  const families = [...new Set((input.icons?.families ?? FAMILIES).filter((f) => FAMILIES.includes(f)))];
  if (!families.length) errors.push("Keep at least one icon set.");
  const sources = [...new Set((input.pictures?.sources ?? []).filter((s) => PICTURE_SOURCES[s] && !PICTURE_SOURCES[s].later))];
  if (errors.length) throw new Error(errors.join(" "));
  const preset = MIX_PRESETS[input.preset] && KINDS.every((k) => MIX_PRESETS[input.preset].mix[k] === mix[k]) ? input.preset : "custom";
  return { schema: SCENES_SCHEMA, preset, mix, off, icons: { families }, pictures: { sources }, ...(input.updatedAt ? { updatedAt: input.updatedAt } : {}) };
}

// The saved profile, or the default (with an old Motion profile's off list,
// so nothing the user turned off comes back).
export function loadScenes(identityDir, { motionOff = [] } = {}) {
  const file = identityDir ? scenesPath(identityDir) : null;
  if (file && fs.existsSync(file)) {
    try {
      return { profile: normalizeScenes(JSON.parse(fs.readFileSync(file, "utf8"))), saved: true };
    } catch {
      // a broken file falls back to the default, never stops a build
    }
  }
  return { profile: defaultScenes({ off: motionOff.filter((n) => COMPONENTS[n]) }), saved: false };
}

export function saveScenes(identityDir, input) {
  const clean = normalizeScenes({ ...input, updatedAt: new Date().toISOString() });
  fs.writeFileSync(scenesPath(identityDir), JSON.stringify(clean, null, 2) + "\n");
  return clean;
}

// The planner's instruction for the mix, said for the sources this video
// really has: a kind with no source is folded into the others, with a note.
export function mixRule(mix, { pictures = false, video = false } = {}) {
  const m = { ...mix };
  if (!pictures) (m.icon += m.image), (m.image = 0);
  if (!video) (m.icon += Math.round(m.video / 2)), (m.text += m.video - Math.round(m.video / 2)), (m.video = 0);
  const parts = [`about ${m.text}% words on screen (key lines, emphasis, numbers)`, `about ${m.icon}% icons and drawings (whiteboard sketches, lists and blocks with icons)`];
  if (m.image) parts.push(`about ${m.image}% pictures`);
  if (m.video) parts.push(`about ${m.video}% video clips`);
  return `Mix the scenes: ${parts.join(", ")}. Never more than two scenes of the same kind in a row.`;
}
