#!/usr/bin/env node
// make-3d-blocks.mjs: writes the 3D Explainer's blocks from one list, so the pack's
// manifest, its blocks and the preset's templates cannot disagree. A tool for whoever
// changes the preset, not part of the app: the files it writes are committed.
//
//   node scripts/make-3d-blocks.mjs
//
// runner/presets/explainer-3d/pack/pack.json          the pack's manifest
// runner/presets/explainer-3d/pack/blocks/<id>.html   one thin block each: all the
//                                                     drawing is in shared/world3d.js
// runner/presets/explainer-3d/preset.json             templates (tokens, rules, objects stay)
//
// How a pack is written, and why a block keeps its two calls: scripts/preset-blocks.mjs.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { blockHtml as html, number, object, text, writePack } from "./preset-blocks.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "runner", "presets", "explainer-3d");
const PACK = "explainer-3d";

// id, what it is, when it fits, its role, its parameters; `first`: a rule tries it first.
export const BLOCKS = [
  { id: "title", label: "Question over one object", role: "opening", when: "The first scene: the video's one strange question, with the thing it is about.", params: { headline: text(6), object: object(), kicker: text(4, false) } },
  { id: "chapter", label: "Chapter on a turntable", role: "opening", when: "The start of a new section.", params: { headline: text(5), object: object() } },
  { id: "statement", label: "Object and two lines", role: "statement", when: "A claim: the first line sets it up, the second lands it.", params: { line1: text(5), line2: text(4), object: object() } },
  { id: "word", label: "One huge word", role: "emphasis", when: "One word is the whole point.", params: { word: text(2), object: object() } },
  { id: "highlight", label: "Marked line", role: "emphasis", when: "A short line with one key word to mark.", params: { line: text(6), mark: text(1), object: object() } },
  { id: "question", label: "Question mark", role: "statement", first: true, when: "The narration asks the viewer something.", params: { question: text(6), object: object(false) } },
  { id: "number", label: "Number and a pile", role: "proof", when: "The narration says a number and it matters; the object is what is counted.", params: { value: number(), before: text(1, false), after: text(1, false), object: object() } },
  { id: "percent", label: "Tank fills up", role: "proof", when: "The narration says a percentage.", params: { value: number() } },
  { id: "scale", label: "Scale comparison", role: "contrast", first: true, when: "How big one thing is next to another: the camera pulls back from the small one.", params: { small: text(3), big: text(3), smallObject: object(), bigObject: object(), ratio: text(3, false) } },
  { id: "cutaway", label: "Cutaway view", role: "detail", first: true, when: "What is inside something: a ball cut open, up to three named layers.", params: { headline: text(5), object: object(), outer: text(3, false), middle: text(3, false), inner: text(3, false) } },
  { id: "versus", label: "Two sides on plinths", role: "contrast", first: true, when: "This or that, before and after, wrong and right.", params: { left: text(4), right: text(4), leftObject: object(), rightObject: object() } },
  { id: "cause", label: "A leads to B", role: "relation", first: true, when: "One thing causes or leads to another.", params: { from: text(3), to: text(3), fromObject: object(), toObject: object() } },
  { id: "stairs", label: "Four steps", role: "process", when: "Exactly four steps in order.", params: { step1: text(3), step2: text(3), step3: text(3), step4: text(3) } },
  { id: "shelf", label: "Four things", role: "list", when: "Exactly four things that belong together.", params: { item1: text(3), item2: text(3), item3: text(3), item4: text(3), object1: object(), object2: object(), object3: object(), object4: object() } },
];

export const blockHtml = (b) => html(b, { prefix: "x3d", api: "ITV3D", neutral: "orb" });

function main() {
  writePack({ dir: DIR, pack: PACK, name: "3D Explainer", camera: "3D move, its own", runtime: ["three"], script: "shared/world3d.js", blocks: BLOCKS, neutral: "orb", html: blockHtml });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
