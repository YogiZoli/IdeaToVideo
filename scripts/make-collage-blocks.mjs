#!/usr/bin/env node
// make-collage-blocks.mjs: writes Archive Collage's blocks from one list, so the pack's
// manifest, its blocks and the preset's templates cannot disagree. The files it writes are
// committed.
//
//   node scripts/make-collage-blocks.mjs
//
// All the drawing is in runner/presets/archive-collage/pack/shared/collage.js, the maps in
// pack/shared/map-data.js (scripts/make-map.mjs).

import path from "node:path";
import { fileURLToPath } from "node:url";
import { blockHtml as html, number, object, place, text, writePack } from "./preset-blocks.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "runner", "presets", "archive-collage");
const PACK = "archive-collage";
const NEUTRAL = "figure";

// id, what it is, when it fits, its role, its parameters; `first`: a rule tries it first, in
// this order: a year or two places say more about a sentence than one place does. `rare`: the
// plan keeps it at least that many scenes apart.
export const BLOCKS = [
  { id: "title", label: "Torn headline and cutout", role: "opening", when: "The first scene: the video's question or claim, with a cutout of what it is about.", params: { headline: text(8), object: object(false), kicker: text(4, false) } },
  { id: "chapter", label: "A new sheet", role: "opening", when: "The start of a new part of the story.", params: { headline: text(5), object: object(false) } },
  { id: "statement", label: "Two torn strips", role: "statement", when: "A plain claim: the first strip sets it up, the second lands it.", params: { line1: text(5), line2: text(4), object: object(false) } },
  { id: "word", label: "One huge word", role: "emphasis", when: "One word is the whole point.", params: { word: text(2), object: object(false) } },
  { id: "highlight", label: "Underline swipe", role: "emphasis", when: "A short line with one key word to underline.", params: { line: text(6), mark: text(1), object: object(false) } },
  { id: "question", label: "A question on the desk", role: "statement", first: true, when: "The narration asks the viewer something.", params: { question: text(6), object: object(false) } },
  { id: "versus", label: "Torn in two", role: "contrast", first: true, when: "This or that, before and after, two sides.", params: { left: text(4), right: text(4), leftObject: object(false), rightObject: object(false) } },
  { id: "cause", label: "A leads to B", role: "relation", first: true, when: "One thing causes or leads to another.", params: { from: text(3), to: text(3), fromObject: object(false), toObject: object(false) } },
  { id: "year", label: "A date stamp", role: "detail", first: true, when: "The narration says the year something happened.", params: { value: number(), line: text(6), object: object(false) } },
  { id: "route", label: "A route on the map", role: "relation", first: true, when: "Something moves between two places the narration names: a route line on the map.", params: { fromPlace: place(), toPlace: place(), fromLabel: text(3, false), toLabel: text(3, false), line: text(6, false) } },
  { id: "map", label: "A pin on the map", role: "detail", first: true, when: "The narration names one place: a pin on the map.", params: { place: place(), label: text(3, false), line: text(6, false) } },
  { id: "number", label: "A giant number", role: "proof", when: "The narration says a number and it matters: it ticks up, huge.", params: { value: number(), before: text(1, false), after: text(1, false), object: object(false) } },
  { id: "percent", label: "A share of a disc", role: "proof", when: "The narration says a percentage.", params: { value: number() } },
  { id: "path", label: "Four stops", role: "process", when: "Exactly four steps in order, joined by one line.", params: { step1: text(3), step2: text(3), step3: text(3), step4: text(3) } },
  { id: "alert", label: "The alert", role: "emphasis", rare: { every: 16 }, when: "Rarely, at the one moment of crisis: the whole frame floods with the accent color.", params: { line: text(6), object: object(false) } },
];

export const blockHtml = (b) => html(b, { prefix: "cx", api: "ITVCollage", neutral: NEUTRAL });

function main() {
  writePack({ dir: DIR, pack: PACK, name: "Archive Collage", camera: "One slow drift, layers in parallax", script: ["shared/map-data.js", "shared/collage.js"], blocks: BLOCKS, neutral: NEUTRAL, html: blockHtml });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
