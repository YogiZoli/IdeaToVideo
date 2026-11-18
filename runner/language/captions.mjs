// language/captions.mjs: the words the captions show (DECISIONS 189). In the voice's language they
// are the voice's own words with their own timing. In another language they are the approved
// translation of each sentence, shown while that sentence is spoken: each translated sentence's
// words share the time of its source sentence, by their length (a sentence of the translation is
// never shown before or after its own sentence is said).

import fs from "node:fs";
import path from "node:path";
import { videoLanguages, fontFor, languageLabel, NO_SPACES } from "./index.mjs";
import { translationOf, splitSentences } from "./translate.mjs";

const r3 = (x) => Math.round(x * 1000) / 1000;
const readJson = (f, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {
    return fallback;
  }
};

/** Words of one caption sentence spread over [start, end] by their length. */
export function spreadWords(text, start, end, lang = "en") {
  // a language without spaces between words still has spaces between phrases: those are the units
  const parts = String(text).split(/\s+/).filter(Boolean);
  const units = NO_SPACES.has(lang) && parts.length === 1 ? [...String(text).matchAll(/.{1,12}/gu)].map((m) => m[0]) : parts;
  const total = units.reduce((a, u) => a + [...u].length, 0) || 1;
  let t = start;
  return units.map((u) => {
    const d = ((end - start) * [...u].length) / total;
    const w = { text: u, start: r3(t), end: r3(t + d) };
    t += d;
    return w;
  });
}

/**
 * Caption words for a build: { words, families, note }. `words`, `sentences`: the voice's
 * (words.json, sentences.json). The source text of each voice sentence is matched to the
 * translation units in order; when the counts differ, by their share of the narration.
 */
export function captionWords(projectDir, { words = [], sentences = [] } = {}) {
  const project = readJson(path.join(projectDir, "project.json"), {});
  const langs = videoLanguages(project);
  const families = [fontFor(langs.captions)].filter(Boolean);
  if (langs.captions === langs.voice) return { words, families, note: null };
  // the captions' text: the source script, or its translation
  let texts = null;
  if (langs.captions === langs.source) {
    const t = translationOf(projectDir, langs.voice);
    texts = t && !t.stale ? t.units.map((u) => u.src) : null;
  } else {
    const t = translationOf(projectDir, langs.captions);
    texts = t && t.approved && !t.stale ? t.units.map((u) => u.text) : null;
  }
  if (!texts?.length || !sentences.length) return { words, families: [fontFor(langs.voice)].filter(Boolean), note: `The captions are in ${languageLabel(langs.voice)}, the voice's language: there is no approved ${languageLabel(langs.captions)} translation of this script.` };
  const out = [];
  if (texts.length === sentences.length) {
    sentences.forEach((s, k) => out.push(...spreadWords(texts[k], s.start, s.end, langs.captions)));
  } else {
    // by share: caption sentence k covers the same share of the spoken time as of the text
    const start = sentences[0].start;
    const end = sentences[sentences.length - 1].end;
    const lens = texts.map((t) => [...t].length);
    const sum = lens.reduce((a, b) => a + b, 0) || 1;
    let at = start;
    texts.forEach((t, k) => {
      const d = ((end - start) * lens[k]) / sum;
      out.push(...spreadWords(t, at, at + d, langs.captions));
      at += d;
    });
  }
  return { words: out, families, note: null };
}

/** The sentences of a caption text, for tests and the Script tab. */
export const captionSentences = splitSentences;
