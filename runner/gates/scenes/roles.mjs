// roles.mjs: what each library component is for, in the words the user sees
// (DECISIONS 55; since 130 from the catalog, catalog.mjs). The scene table
// groups components by role: the AI picks one per scene, the user may swap a
// row for another one of the same role, and nobody has to know what a
// "component" is.
//
// mainVar: the on-screen text the user can edit in the table (Custom). null
// when the component's content is not one line of text (numbers, lists).
// words: word limits per variable where the component is made for less than
// the general limit (MAX_WORDS). headline-slam shrinks a longer line until
// its fixed letter spacing crushes the letters (seen in the first real video).

import { loadCatalog, plannable, entryOf } from "./catalog.mjs";

// The catalog's roles (catalog.mjs CATALOG_ROLES), and the ones block packs
// bring (packs/index.mjs ROLES), in the words the user sees.
export const ROLES = {
  opening: { label: "Opening or chapter", hint: "The start of the video, or a new section." },
  statement: { label: "Key sentence", hint: "The main claim of a sentence, big on screen." },
  emphasis: { label: "Highlight", hint: "One word or phrase is the point." },
  proof: { label: "Proof", hint: "A number, a chart or a result the narration says." },
  list: { label: "List or steps", hint: "Two to six things." },
  diagram: { label: "Diagram", hint: "A drawing, a flow or a relation for an idea." },
  quote: { label: "Quote", hint: "Words someone said, a message." },
  transition: { label: "Transition", hint: "A move between scenes (the Motion wizard does these)." },
  closing: { label: "Closing", hint: "The call to action, or your name at the end." },
  // the roles block packs bring (packs/index.mjs ROLES)
  sketch: { label: "Sketch", hint: "A simple drawing for an idea." },
  relation: { label: "Relation", hint: "How two things connect: A leads to B, or one of two ways." },
  contrast: { label: "Contrast", hint: "Wrong and right, before and after." },
  process: { label: "Process", hint: "Steps in order, states, a cycle." },
  detail: { label: "Detail", hint: "A close look at one real thing: a record, a form, a command." },
  footage: { label: "Over footage", hint: "Titles and callouts over your own footage." },
  cta: { label: "Comment call", hint: "Asks the viewer to comment a keyword." },
};

// What the scene table knows of the first library components, by hand
// (DECISIONS 55): the UI label, the main text the user can edit (Custom),
// and word limits where a component is made for fewer words than MAX_WORDS
// (headline-slam crushes its letters past 3 words, seen in the first real
// video). Every other component takes these from the catalog.
const TUNED = {
  "titlecard-lockup": { label: "Title card", mainVar: "wordmark" },
  "titlecard-calm": { label: "Quiet chapter title", mainVar: "headline" },
  "per-word-rise": { label: "Words rise in", mainVar: "text" },
  "kinetic-type-swap": { label: "One word changes", mainVar: null, words: { prefix: 3, suffix: 2 } },
  "headline-slam": { label: "Headline lands hard", mainVar: "text", words: { text: 3 } },
  "marker-highlight": { label: "Word marked", mainVar: "text" },
  "count-up": { label: "Number counts up", mainVar: null },
  "chart-story": { label: "Chart", mainVar: null },
  "conic-progress-ring": { label: "Progress ring", mainVar: null },
  "grid-card-assemble": { label: "Cards in a grid", mainVar: "items" },
  "constellation-hub": { label: "Ideas around a center", mainVar: "nodes" },
  "whiteboard-ink": { label: "Whiteboard sketch", mainVar: "caption" },
  "cta-close": { label: "Call to action", mainVar: "action_line", words: { button_label: 3 } },
};
// Retired (Zoltan, 2026-10-05, CTA K12): no longer planned or offered, old
// scene tables that use it still build.
const RETIRED = { "logo-brand-close": { role: "closing", label: "Name at the end", mainVar: "wordmark", retired: true } };

// Every component the planner may use (catalog.mjs plannable): status "on",
// not a transition, nothing the app cannot give it. The rest of the 234 are
// in the catalog with the reason they are off, never deleted.
export const COMPONENTS = (() => {
  const out = {};
  for (const [name, e] of Object.entries(loadCatalog().components ?? {})) {
    if (!plannable(e)) continue;
    out[name] = { role: e.role, label: e.label ?? name, mainVar: e.mainVar ?? null, ...(e.maxWords ? { words: e.maxWords } : {}), ...(TUNED[name] ?? {}) };
  }
  for (const [name, meta] of Object.entries(RETIRED)) if (!out[name]) out[name] = meta;
  return out;
})();

// Block packs (packs/, DECISIONS 107) add their blocks here per command,
// "<pack>:<block>": { role, label, mainVar, words, pack: true, realOnly }.
export const PACK_COMPONENTS = new Map();
// A component the catalog has off is never planned or offered, but a scene
// table that already uses it (made before DECISIONS 130) still checks and
// builds: it is known, marked off.
export const componentMeta = (name) => {
  if (COMPONENTS[name] || PACK_COMPONENTS.has(name)) return COMPONENTS[name] ?? PACK_COMPONENTS.get(name);
  const e = entryOf(name);
  return e ? { role: e.role, label: e.label ?? name, mainVar: e.mainVar ?? null, ...(e.maxWords ? { words: e.maxWords } : {}), ...(TUNED[name] ?? {}), off: true } : null;
};

export const roleOf = (component) => componentMeta(component)?.role ?? null;

// How often the picture changes, the Identity's choice in the Motion wizard
// (Zoltan, 2026-10-06: "not something I should decide for every user").
//   target  the Simple plan grows a scene until it lasts this long
//   longest the Simple plan never grows a scene past this
//   joined  the check sends back a scene of several sentences longer than this
//   rule    the planner's instruction
export const PACES = {
  calm: { label: "Calm", picture: "a new picture every 5 to 8 seconds", target: 5, longest: 9, joined: 10, rule: "A new picture every 5 to 8 seconds. Join sentences that belong together while the joined scene stays under 10 seconds. A scene is at least 2 seconds." },
  balanced: { label: "Balanced", picture: "a new picture every 3 to 5 seconds", target: 3, longest: 6, joined: 7, rule: "A new picture every 3 to 5 seconds. Give every sentence its own scene. Join only very short sentences that belong together, and only while the joined scene stays under 6 seconds. A scene is at least 2 seconds." },
  fast: { label: "Fast", picture: "a new picture every 2 to 4 seconds", target: 2, longest: 4, joined: 5, rule: "A new picture every 2 to 4 seconds. Give every sentence its own scene; join two sentences only when one of them is under 2 seconds. A scene is at least 2 seconds." },
};
export const DEFAULT_PACE = "balanced";
export const paceOf = (id) => PACES[id] ?? PACES[DEFAULT_PACE];
