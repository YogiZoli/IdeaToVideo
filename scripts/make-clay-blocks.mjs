#!/usr/bin/env node
// make-clay-blocks.mjs: writes Soft Clay Chronicle's blocks from one list, so the pack's manifest,
// its blocks and the preset's templates cannot disagree. The files it writes are committed.
//
//   node scripts/make-clay-blocks.mjs
//
// All the drawing is in runner/presets/soft-clay/pack/shared/clay.js, on the renderer of the 3D
// Explainer's world3d.js. The maps are Archive Collage's, the same one file.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { blockHtml as html, number, object, place, text, writePack } from "./preset-blocks.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "runner", "presets", "soft-clay");
const PACK = "soft-clay";
const NEUTRAL = "scroll";

// The build gives every block this, from what the voice has said; the AI never fills it.
const DATE = [{ id: "date", type: "string", label: "Date", default: "", optional: true }];

// id, what it is, when it fits, its role, its parameters; `first`: a rule tries it first, in this order.
export const BLOCKS = [
  { id: "title", label: "One thing in the lamp's glow", role: "opening", when: "The first scene: what the video is about, with the thing it is about.", params: { headline: text(6), object: object(), kicker: text(4, false) } },
  { id: "chapter", label: "The lamp comes up on a book", role: "opening", when: "The start of a new part of the story.", params: { headline: text(5), object: object() } },
  { id: "statement", label: "A thing and two notes", role: "statement", when: "A plain claim: the first line sets it up, the second lands it.", params: { line1: text(5), line2: text(4), object: object() } },
  { id: "word", label: "One large word", role: "emphasis", when: "One word is the whole point.", params: { word: text(2), object: object() } },
  { id: "highlight", label: "A note with one word marked", role: "emphasis", when: "A short line with one key word to mark.", params: { line: text(6), mark: text(1), object: object() } },
  { id: "question", label: "Somebody wonders", role: "statement", first: true, when: "The narration asks the viewer something.", params: { question: text(6), object: object(false) } },
  { id: "number", label: "A number and a pile", role: "proof", when: "The narration says a number and it matters; the thing is what is counted.", params: { value: number(), before: text(1, false), after: text(1, false), object: object() } },
  { id: "year", label: "A year, large", role: "detail", first: true, when: "The narration says the year something happened.", params: { value: number(), line: { ...text(8, false) }, object: object() } },
  { id: "route", label: "A journey across the map", role: "relation", first: true, when: "Somebody or something travels between two places the narration names.", params: { fromPlace: place(), toPlace: place(), fromLabel: text(3, false), toLabel: text(3, false), line: text(9, false), object: object() } },
  { id: "map", label: "A pin in the old map", role: "detail", first: true, when: "The narration names one country or big city.", params: { place: place(), label: text(3, false), line: text(9, false) } },
  { id: "talk", label: "Two people talking", role: "detail", first: true, when: "Somebody says or asks something.", params: { said: { ...text(6), quoted: true }, object: object() } },
  { id: "versus", label: "Two sides on round bases", role: "contrast", first: true, when: "This or that, before and after, one side against another.", params: { left: text(4), right: text(4), leftObject: object(), rightObject: object() } },
  { id: "cause", label: "One thing leads to another", role: "relation", first: true, when: "One thing causes or leads to another.", params: { from: text(3), to: text(3), fromObject: object(), toObject: object() } },
  { id: "board", label: "Things in a row", role: "process", first: true, when: "Three or four things that belong together, in the order the narration says them.", params: { item1: text(3), item2: text(3), item3: text(3), item4: text(3, false), object1: object(), object2: object(), object3: object(), object4: object(false) } },
  { id: "relic", label: "The thing on a cloth", role: "detail", first: true, when: "One thing that was found, made or kept: the thing the story is about, alone in the light.", params: { object: object(true), line: text(9, false) } },
].map((b) => ({ ...b, extra: DATE }));

export const blockHtml = (b) => html(b, { prefix: "clay", api: "ITVClay", neutral: NEUTRAL });

function main() {
  writePack({ dir: DIR, pack: PACK, name: "Soft Clay Chronicle", camera: "One slow 3D move, its own", runtime: ["three"], script: ["../../archive-collage/pack/shared/map-data.js", "../../explainer-3d/pack/shared/world3d.js", "shared/clay.js"], blocks: BLOCKS, neutral: NEUTRAL, html: blockHtml, dateLabel: true });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
