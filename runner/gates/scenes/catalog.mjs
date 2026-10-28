// catalog.mjs: the scene catalog (DECISIONS 130). library/catalog.json says,
// for every one of the 234 registry components, what it shows, when it
// fits, its role, what it needs, its strong and weak points, an example
// sentence, and whether it passed the tests (status "on" or "off", never
// deleted). It is written from the components' own files and from their
// test renders (scripts/catalog/test-components.mjs, build-catalog.mjs).
// The build ships it as library/CATALOG.json.
//
// The planner reads it in two steps (index.mjs): the whole catalog to pick 3
// to 5 candidates per scene, then the full code of those candidates to pick
// the one that fits the sentence best.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

// The roles of the catalog, in the user's words.
export const CATALOG_ROLES = {
  opening: "Opening or chapter title: the start of the video, or a new section.",
  statement: "Key sentence: the main claim of a sentence, big on screen.",
  emphasis: "Highlight: one word or phrase of the line is the point.",
  proof: "Proof: a number, a chart, a result the narration says.",
  list: "List: two to six things, steps or options the voice names.",
  diagram: "Diagram: a drawing, a flow or a relation that explains an idea.",
  quote: "Quote: words someone said, a testimonial, a message.",
  transition: "Transition: a move between two scenes. Never planned for a sentence: the Motion wizard does scene changes.",
  closing: "Close: the call to action or the end of the video.",
};

// What a component may need beyond text. The app can give it text and
// numbers from the narration; an image or a screen recording it cannot put
// into a registry component, so those are never planned.
export const NEEDS = ["text", "number", "image", "recording"];
export const CAN_GIVE = new Set(["text", "number"]);

// The installed app has resources/library/CATALOG.json; the repo
// library/catalog.json. ITV_LIBRARY_DIR (the e2e) wins over both.
// ITV_CATALOG names a catalog file outright (the unit tests' fixture).
export function catalogFile(env = process.env) {
  const candidates = [
    env.ITV_CATALOG || process.env.ITV_CATALOG,
    env.ITV_LIBRARY_DIR && path.join(env.ITV_LIBRARY_DIR, "CATALOG.json"),
    path.join(here, "..", "..", "..", "library", "CATALOG.json"),
    path.join(here, "..", "..", "..", "library", "catalog.json"),
  ].filter(Boolean);
  return candidates.find((f) => fs.existsSync(f)) ?? candidates[candidates.length - 1];
}

const cache = new Map();
export function loadCatalog(env = process.env) {
  const file = catalogFile(env);
  if (!cache.has(file)) {
    const c = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { components: {} };
    cache.set(file, c);
  }
  return cache.get(file);
}

export const entryOf = (name, env = process.env) => loadCatalog(env).components?.[name] ?? null;

// Can the planner put this component under a sentence: it passed the tests,
// it is not a transition, and the app can give it everything it needs.
export function plannable(entry) {
  return Boolean(entry) && entry.status === "on" && entry.role !== "transition" && (entry.needs ?? ["text"]).every((n) => CAN_GIVE.has(n));
}

export function plannableNames({ env = process.env, off = [] } = {}) {
  return Object.entries(loadCatalog(env).components ?? {})
    .filter(([name, e]) => plannable(e) && !off.includes(name))
    .map(([name]) => name)
    .sort();
}

// The catalog as the first planning step reads it: one compact block per
// component, every field of the entry.
export function catalogForPlanner({ env = process.env, off = [], uses = {} } = {}) {
  const all = loadCatalog(env).components ?? {};
  return plannableNames({ env, off }).map((name) => {
    const e = all[name];
    return {
      component: name,
      role: e.role,
      shows: e.shows,
      fits: e.fitsWhen,
      needs: e.needs,
      strong: e.strong,
      weak: e.weak,
      example: e.example,
      ...(e.maxWords ? { maxWords: e.maxWords } : {}),
      ...(uses[name] ? { usedRecently: uses[name] } : {}),
    };
  });
}

// A component's full code for the second step: the HTML as shipped, without
// embedded data (fonts, pictures as base64), which says nothing about what
// the component does, and without runs of blank space.
export function codeForPlanner(html) {
  return String(html)
    .replace(/(data:[a-z]+\/[a-z0-9.+-]+;base64,)[A-Za-z0-9+/=]{80,}/gi, "$1...")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n");
}
