// timing/sentences.mjs: the sentence table, the app's own implementation
// (DECISIONS 49). Every scene's time comes from the approved audio, never
// typed: the voice gate measures words, this groups them into sentences, and
// the builder places each scene on its sentences.
//
// In:  audio/stt.json   { words: [ { text, start, end, type } ] }
// Out: sentences.json   [ { id: "S1", start, end, dur, words, text } ]
//      words.json       [ { text, start, end } ]  (flat, for drift checks)

import fs from "node:fs";
import path from "node:path";

// Short forms that end in a period but do not end a sentence.
const ABBREVIATIONS = new Set(["mr.", "mrs.", "ms.", "dr.", "prof.", "st.", "vs.", "etc.", "e.g.", "i.e.", "approx.", "no.", "dl.", "pl.", "stb.", "kb.", "ill.", "ún.", "vö."]);

const r3 = (x) => Math.round(x * 1000) / 1000;

// Does this word close a sentence? . ? ! (optionally followed by closing
// quotes or brackets). An ellipsis keeps the thought open, and so do short
// forms and single initials ("J.").
export function closesSentence(word) {
  const w = String(word).trim();
  const core = w.replace(/["'”’»)\]]+$/, "");
  // the full stops of other scripts: Khmer ។ and ៕, Devanagari । and ॥, CJK 。！？, Arabic ؟ (DECISIONS 198)
  if (/[។៕।॥。！？؟]$/.test(core)) return true;
  if (!/[.?!]$/.test(core)) return false;
  if (/\.\.\.$|…$/.test(core)) return false;
  if (/[?!]$/.test(core)) return true;
  const lower = core.toLowerCase().replace(/^["'“„«(\[]+/, "");
  if (ABBREVIATIONS.has(lower)) return false;
  if (/^\p{L}\.$/u.test(lower)) return false; // an initial
  return true;
}

export function wordsFromStt(stt) {
  const out = [];
  for (const w of stt?.words ?? []) {
    if (w.type && w.type !== "word") continue;
    const text = String(w.text ?? "").trim();
    if (!text) continue;
    out.push({ text, start: Number(w.start), end: Number(w.end) });
  }
  return out;
}

export function groupSentences(words) {
  const sentences = [];
  let cur = [];
  const flush = () => {
    if (!cur.length) return;
    const start = r3(cur[0].start);
    const end = r3(cur[cur.length - 1].end);
    sentences.push({ id: `S${sentences.length + 1}`, start, end, dur: r3(end - start), words: cur.length, text: cur.map((w) => w.text).join(" ") });
    cur = [];
  };
  for (const w of words) {
    cur.push(w);
    if (closesSentence(w.text)) flush();
  }
  flush();
  return sentences;
}

export function sentenceTable(projectDir) {
  const sttFile = path.join(projectDir, "audio", "stt.json");
  if (!fs.existsSync(sttFile)) throw new Error("There is no voice yet, so there is nothing to time.");
  const words = wordsFromStt(JSON.parse(fs.readFileSync(sttFile, "utf8")));
  if (!words.length) throw new Error("The voice has no word timings.");
  const sentences = groupSentences(words);
  fs.writeFileSync(path.join(projectDir, "sentences.json"), JSON.stringify(sentences, null, 2) + "\n");
  fs.writeFileSync(path.join(projectDir, "words.json"), JSON.stringify(words.map((w) => ({ text: w.text, start: r3(w.start), end: r3(w.end) })), null, 2) + "\n");
  return { sentences: sentences.length };
}
