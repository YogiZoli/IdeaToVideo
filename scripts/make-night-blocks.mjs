#!/usr/bin/env node
// make-night-blocks.mjs: writes Night Case File's blocks from one list, so the pack's manifest,
// its blocks and the preset's templates cannot disagree. The files it writes are committed.
//
//   node scripts/make-night-blocks.mjs
//
// All the drawing is in runner/presets/night-case-file/pack/shared/nightfile.js. The maps are
// Archive Collage's, the same one file.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { blockHtml as html, number, object, place, text, writePack } from "./preset-blocks.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "runner", "presets", "night-case-file");
const PACK = "night-case-file";
const NEUTRAL = "folder";

// id, what it is, when it fits, its role, its parameters; `first`: a rule tries it first, in this
// order: what must only be implied comes before all else. `fallback`: it needs no words, so a
// sentence whose words may not go on screen still has a picture. `sound`: made by code, played
// `at` seconds into the scene, on the light (FLASH_AT in nightfile.js).
export const BLOCKS = [
  { id: "title", label: "A figure under a street light", role: "opening", when: "The first scene: the video's question or claim.", params: { headline: text(8), kicker: text(4, false) } },
  { id: "chapter", label: "A folder and a flashlight", role: "opening", when: "The start of a new part of the story.", params: { headline: text(5), object: object(false) } },
  { id: "statement", label: "Two lines in a dark room", role: "statement", when: "A plain claim: the first line sets it up, the second lands it.", params: { line1: text(5), line2: text(4), object: object(false) } },
  { id: "word", label: "One word like a lit sign", role: "emphasis", when: "One word is the whole point.", params: { word: text(2), object: object(false) } },
  { id: "highlight", label: "A line with one word marked", role: "emphasis", when: "A short line with one key word to underline.", params: { line: text(6), mark: text(1), object: object(false) } },
  { id: "flash", label: "A light flash and a sound", role: "emphasis", first: true, fallback: true, sound: { kind: "hit", at: 0.5 }, when: "Something violent or sudden happens. Nothing is shown: only windows flash in the dark and a dull sound is heard. Never name a weapon or an injury in its line.", params: { object: object(true), line: text(9, false) } },
  { id: "question", label: "Somebody in a lit doorway", role: "statement", first: true, when: "The narration asks the viewer something.", params: { question: text(6) } },
  { id: "stamp", label: "A date and place stamp", role: "detail", first: true, when: "The narration says when something happened: a date, a year or a time, and where if it says so.", params: { when: { ...text(4), said: true }, where: text(3, false), line: text(8, false), object: object(false) } },
  { id: "route", label: "A route on the dark map", role: "relation", first: true, when: "Somebody or something moves between two places the narration names.", params: { fromPlace: place(), toPlace: place(), fromLabel: text(3, false), toLabel: text(3, false), line: text(9, false) } },
  { id: "map", label: "A pin on the dark map", role: "detail", first: true, when: "The narration names one country or big city.", params: { place: place(), label: text(3, false), line: text(9, false) } },
  { id: "board", label: "The evidence board", role: "process", first: true, when: "Three or four clues, people or facts that belong together: cards pinned to a board, one string joining them.", params: { item1: text(3), item2: text(3), item3: text(3), item4: text(3, false) } },
  { id: "evidence", label: "One thing under a lamp", role: "detail", first: true, when: "One thing that was found or that matters: it lies on a table in a pool of light.", params: { object: object(true), line: text(6, false) } },
  { id: "number", label: "A number that glows", role: "proof", when: "The narration says a number and it matters.", params: { value: number(), before: text(1, false), after: text(1, false), object: object(false) } },
  { id: "street", label: "Somebody walks at night", role: "detail", first: true, when: "The story is outside: a street, a road, a car, a night.", params: { object: object(true), line: text(9, false) } },
  { id: "room", label: "Somebody crosses a room", role: "detail", first: true, fallback: true, when: "The story is inside a house, a room or an office.", params: { object: object(true), line: text(9, false) } },
];

export const blockHtml = (b) => html(b, { prefix: "nf", api: "ITVNight", neutral: NEUTRAL });

function main() {
  writePack({ dir: DIR, pack: PACK, name: "Night Case File", camera: "One slow push, layers in parallax", script: ["../../archive-collage/pack/shared/map-data.js", "shared/nightfile.js"], blocks: BLOCKS, neutral: NEUTRAL, html: blockHtml });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
