#!/usr/bin/env node
// make-stick-blocks.mjs: writes Stick World's blocks from one list, so the pack's manifest,
// its blocks and the preset's templates cannot disagree. The files it writes are committed.
//
//   node scripts/make-stick-blocks.mjs
//
// All the drawing is in runner/presets/stick-world/pack/shared/stick.js.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { blockHtml as html, number, object, text, writePack } from "./preset-blocks.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "runner", "presets", "stick-world");
const PACK = "stick-world";
const NEUTRAL = "none";

// id, what it is, when it fits, its role, its parameters; `first`: a rule tries it first, in
// this order: "but" and "because" say more about a sentence than a verb of going does.
export const BLOCKS = [
  { id: "title", label: "The question and you", role: "opening", when: "The first scene: the video's what-if question, with you standing by the thing it is about.", params: { headline: text(8), object: object(false), kicker: text(4, false) } },
  { id: "chapter", label: "You walk into a new part", role: "opening", when: "The start of a new part of the story.", params: { headline: text(5), object: object(false) } },
  { id: "statement", label: "You and two lines", role: "statement", when: "A plain claim: the first line sets it up, the second lands it.", params: { line1: text(5), line2: text(4), object: object(false) } },
  { id: "word", label: "One huge word", role: "emphasis", when: "One word is the whole point, and you throw your arms up.", params: { word: text(2), object: object(false) } },
  { id: "highlight", label: "Marked line", role: "emphasis", when: "A short line with one key word to mark.", params: { line: text(6), mark: text(1), object: object(false) } },
  { id: "question", label: "You shrug", role: "statement", first: true, when: "The narration asks the viewer something.", params: { question: text(6), object: object(false) } },
  { id: "versus", label: "You and them", role: "contrast", first: true, when: "This or that, before and after, you and someone else.", params: { left: text(4), right: text(4), leftObject: object(false), rightObject: object(false) } },
  { id: "cause", label: "A leads to B", role: "relation", first: true, when: "One thing causes or leads to another.", params: { from: text(3), to: text(3), fromObject: object(false), toObject: object(false) } },
  { id: "thought", label: "A thought cloud", role: "detail", first: true, when: "You imagine, wish or wonder about something: it floats in a cloud.", params: { line: text(6), object: object(false) } },
  { id: "talk", label: "Two people talk", role: "relation", first: true, when: "Someone says, asks or tells something: it is in your speech bubble.", params: { said: text(6), object: object(false) } },
  { id: "walk", label: "You walk to it", role: "statement", first: true, when: "You go somewhere: you walk across the frame to the thing.", params: { line: text(6), object: object(false) } },
  { id: "number", label: "A big number and people", role: "proof", when: "The narration says a number and it matters. Under 10 shows exactly that many people.", params: { value: number(), before: text(1, false), after: text(1, false) } },
  { id: "percent", label: "100 people, some marked", role: "proof", when: "The narration says a percentage.", params: { value: number() } },
  { id: "path", label: "Four stops", role: "process", when: "Exactly four steps in order: you walk past four signs.", params: { step1: text(3), step2: text(3), step3: text(3), step4: text(3) } },
];

export const blockHtml = (b) => html(b, { prefix: "stk", api: "ITVStick", neutral: NEUTRAL });

function main() {
  writePack({ dir: DIR, pack: PACK, name: "Stick World", camera: "Nearly still", script: "shared/stick.js", blocks: BLOCKS, neutral: NEUTRAL, html: blockHtml });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
