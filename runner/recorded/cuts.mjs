// recorded/cuts.mjs: what stays of a recording (docs/BUILD_PLAN.md phase 2). Pure
// functions over the words and the sound's envelope, no files, the tests call them.
//
//   silences       a pause longer than MAX_PAUSE becomes a short one
//   filler words   the sounds of a language, whole words only, never a real word
//   sounds         a sound with no word in it: the "um"s the speech model hides
//   repeated takes a phrase said again: the last good take stays
//
// Everything is marked, nothing is lost: each mark can be put back on the
// Recording tab, and the cut list is made again from the same words.

import { closesSentence } from "../timing/sentences.mjs";

export const FPS = 30;
export const MAX_PAUSE = 0.5;
const PAD_BEFORE = 0.07;
const PAD_AFTER = 0.12;
const PAD_SENTENCE = 0.24; // a sentence's end keeps a breath
const MIN_ISLAND = 0.16;
const PHRASE_GAP = 0.7;

const FILLERS = {
  en: ["um", "umm", "uh", "uhh", "uhm", "er", "erm", "ah", "ahh", "eh", "hmm", "hm", "mm", "mhm", "mmm"],
  hu: ["ö", "öö", "ööö", "öhm", "ööm", "hmm", "hm", "mm", "izé", "ee", "eee"],
  de: ["äh", "ähm", "öh", "öhm", "hm", "hmm", "mm"],
  es: ["eh", "em", "ehm", "mm", "hmm"],
  fr: ["euh", "heu", "hum", "mm", "hmm"],
};
// Said in passing, only when commas stand around them: "it was, you know, late".
const SOFT_FILLERS = {
  en: [["you", "know"], ["i", "mean"], ["like"], ["sort", "of"], ["kind", "of"]],
  hu: [["ugye"], ["szóval"], ["tudod"]],
};
const SAID_AGAIN = /^(sorry|no wait|wait|let me|let me start|again|one more time|take two|scratch that|start over|bocsánat|bocs|várj|még egyszer|újra|elölről)\b/i;

const r3 = (x) => Math.round(x * 1000) / 1000;
export const clean = (text) => String(text).toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
export const frameOf = (seconds) => Math.round(seconds * FPS);

// ---- the sound ----------------------------------------------------------------------

export const ENVELOPE_RATE = 100;

/** Loudness in dB, 100 values a second, from 16 kHz mono samples. */
export function envelope(samples, rate = 16000) {
  const hop = Math.round(rate / ENVELOPE_RATE);
  const out = new Float32Array(Math.ceil(samples.length / hop));
  for (let i = 0; i < out.length; i++) {
    let sum = 0;
    const end = Math.min(samples.length, (i + 1) * hop);
    for (let k = i * hop; k < end; k++) sum += samples[k] * samples[k];
    out[i] = 10 * Math.log10(sum / Math.max(1, end - i * hop) + 1e-10);
  }
  return out;
}

/**
 * Where someone is speaking, one value per 10 ms. The line sits between the
 * room's noise and the voice, measured on this file, so a quiet phone take and
 * a loud microphone take both work. A dip under `bridge` seconds counts as speech.
 */
export function voicedMask(env, { bridge = 0.12 } = {}) {
  const sorted = Float32Array.from(env).sort();
  const noise = sorted[Math.floor(sorted.length * 0.1)] ?? -60;
  const voice = sorted[Math.floor(sorted.length * 0.95)] ?? -20;
  const line = Math.max(noise + (voice - noise) * 0.3, -55);
  const mask = new Uint8Array(env.length);
  for (let i = 0; i < env.length; i++) mask[i] = env[i] > line ? 1 : 0;
  const gap = Math.round(bridge * ENVELOPE_RATE);
  let last = -1;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    if (last >= 0 && i - last > 1 && i - last <= gap) mask.fill(1, last + 1, i);
    last = i;
  }
  return mask;
}

/** The runs of speech as [{ start, end }] in seconds. */
export function runsOf(mask) {
  const runs = [];
  let from = -1;
  for (let i = 0; i <= mask.length; i++) {
    const on = i < mask.length && mask[i];
    if (on && from < 0) from = i;
    if (!on && from >= 0) {
      runs.push({ start: from / ENVELOPE_RATE, end: i / ENVELOPE_RATE });
      from = -1;
    }
  }
  return runs;
}

/** Pieces of at most `max` seconds, cut in the pauses, skipping what is silent. */
export function speechChunks(mask, { max = 28, pad = 0.25, seconds = mask.length / ENVELOPE_RATE } = {}) {
  const chunks = [];
  let cur = null;
  const push = () => {
    if (cur) chunks.push({ start: r3(Math.max(0, cur.start - pad)), end: r3(Math.min(seconds, cur.end + pad)) });
    cur = null;
  };
  for (const run of runsOf(mask)) {
    let { start, end } = run;
    // one run longer than a piece: cut it, the piece overlaps nothing
    while (end - start > max) {
      push();
      chunks.push({ start: r3(Math.max(0, start - pad)), end: r3(start + max) });
      start += max;
    }
    if (cur && end - cur.start > max) push();
    if (cur) cur.end = end;
    else cur = { start, end };
  }
  push();
  return chunks;
}

/**
 * Word ends on the sound. The model gives a word the time up to the next word;
 * here it starts where the sound starts and ends where that run of sound ends.
 * What is left between two words and is loud is a sound with no word.
 */
export function snapWords(words, mask) {
  const on = (t) => mask[Math.max(0, Math.min(mask.length - 1, Math.round(t * ENVELOPE_RATE)))] === 1;
  const step = 1 / ENVELOPE_RATE;
  return words.map((w, i) => {
    const limit = words[i + 1]?.start ?? w.end;
    let start = w.start;
    while (start < limit - step && !on(start)) start = r3(start + step);
    if (!on(start)) return { ...w, start: r3(w.start), end: r3(Math.min(limit, w.start + 0.25)), noSound: true };
    let end = start;
    while (end < limit && on(end)) end = r3(end + step);
    return { ...w, start: r3(start), end: r3(Math.max(end, start + 0.04)) };
  });
}

/**
 * The transcript checked against the recording's sound: words on speech, speech
 * with a word on it, and how far word starts sit from where a run of sound starts.
 * `ok` false: the app says so on the Recording tab and the cuts stay careful.
 */
export function checkWords(words, mask, seconds) {
  const on = (t) => mask[Math.max(0, Math.min(mask.length - 1, Math.round(t * ENVELOPE_RATE)))] === 1;
  let hit = 0;
  for (const w of words) if (on((w.start + w.end) / 2)) hit++;
  const covered = new Uint8Array(mask.length);
  for (const w of words) covered.fill(1, Math.round(w.start * ENVELOPE_RATE), Math.round(w.end * ENVELOPE_RATE) + 1);
  let voiced = 0;
  let voicedCovered = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    voiced++;
    if (covered[i]) voicedCovered++;
  }
  const runs = runsOf(mask);
  const offsets = [];
  for (const r of runs) {
    const first = words.find((w) => w.end > r.start);
    if (first && first.start < r.end) offsets.push(Math.abs(first.start - r.start));
  }
  offsets.sort((a, b) => a - b);
  const wordsOnSpeech = words.length ? hit / words.length : 0;
  const speechWithWords = voiced ? voicedCovered / voiced : 0;
  const drift = offsets.length ? offsets[Math.floor(offsets.length / 2)] : 0;
  const past = words.length ? Math.max(0, words[words.length - 1].end - seconds) : 0;
  const ok = words.length > 0 && wordsOnSpeech >= 0.85 && speechWithWords >= 0.6 && drift <= 0.3 && past <= 0.25;
  return { ok, words: words.length, wordsOnSpeech: r3(wordsOnSpeech), speechWithWords: r3(speechWithWords), drift: r3(drift), past: r3(past), seconds: r3(seconds) };
}

// ---- what comes out --------------------------------------------------------------------

/** Phrases: a sentence end, or a long pause. Each is { from, to } word indexes. */
export function phrasesOf(words, gap = PHRASE_GAP) {
  const out = [];
  let from = 0;
  words.forEach((w, i) => {
    const next = words[i + 1];
    if (!next || closesSentence(w.text) || next.start - w.end >= gap) {
      out.push({ from, to: i });
      from = i + 1;
    }
  });
  return out;
}

const tokensOf = (words, p) => words.slice(p.from, p.to + 1).map((w) => clean(w.text)).filter(Boolean);

function editRatio(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const hold = row[j];
      row[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, row[j], row[j - 1]);
      prev = hold;
    }
  }
  return 1 - row[b.length] / Math.max(a.length, b.length, 1);
}

/** Is the later phrase the same thing said again? */
export function sameTake(a, b) {
  if (a.length < 2 || b.length < 2) return false;
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  const shorter = Math.min(a.length, b.length);
  if (prefix >= 2 && prefix / shorter >= 0.6) return true;
  return shorter >= 4 && editRatio(a, b) >= 0.72;
}

const finished = (words, p) => closesSentence(words[p.to].text);

/**
 * The takes to drop. A phrase said again within the next few phrases, with only
 * short remarks between: all but the last good one go. Good: it finishes its
 * sentence and is not much shorter than the longest. The remarks between
 * ("sorry", "let me say that again") go with them.
 */
export function repeatedTakes(words, { look = 3 } = {}) {
  const phrases = phrasesOf(words);
  const tokens = phrases.map((p) => tokensOf(words, p));
  const groups = [];
  const used = new Set();
  for (let i = 0; i < phrases.length; i++) {
    if (used.has(i)) continue;
    const chain = [i];
    let cur = i;
    for (let j = i + 1; j < phrases.length && j <= cur + look; j++) {
      if (sameTake(tokens[cur], tokens[j])) {
        const between = tokens.slice(cur + 1, j);
        if (between.every((t, k) => t.length <= 5 || SAID_AGAIN.test(words.slice(phrases[cur + 1 + k].from, phrases[cur + 1 + k].to + 1).map((w) => w.text).join(" ")))) {
          chain.push(j);
          cur = j;
        }
      }
    }
    if (chain.length > 1) {
      chain.forEach((c) => used.add(c));
      groups.push(chain);
    }
  }
  const marks = [];
  for (const chain of groups) {
    const longest = Math.max(...chain.map((c) => tokens[c].length));
    let keep = chain[chain.length - 1];
    for (let k = chain.length - 1; k >= 0; k--) {
      const c = chain[k];
      if (finished(words, phrases[c]) && tokens[c].length >= longest * 0.5) {
        keep = c;
        break;
      }
      if (k === 0) keep = chain.reduce((best, x) => (tokens[x].length >= tokens[best].length ? x : best), chain[0]);
    }
    // everything from the first take to the last one goes, except the good one
    const first = chain[0];
    const last = chain[chain.length - 1];
    for (let n = first; n <= last; n++) {
      if (n === keep) continue;
      marks.push({ kind: "take", from: phrases[n].from, to: phrases[n].to });
    }
  }
  return marks;
}

/** A word or a few words said twice in a row: "the the", "I think I think". */
export function stutters(words) {
  const marks = [];
  const t = words.map((w) => clean(w.text));
  const keepDouble = new Set(["that", "had", "very", "really", "so", "bye", "no", "yes", "nagyon", "is", "már", "hát"]);
  for (let i = 0; i < t.length; i++) {
    for (const n of [4, 3, 2, 1]) {
      if (i + 2 * n > t.length) continue;
      const a = t.slice(i, i + n);
      if (a.some((x) => !x)) continue;
      if (a.join(" ") !== t.slice(i + n, i + 2 * n).join(" ")) continue;
      if (n === 1 && keepDouble.has(a[0])) continue;
      if (closesSentence(words[i + n - 1].text)) continue;
      marks.push({ kind: "take", from: i, to: i + n - 1 });
      i += n - 1;
      break;
    }
  }
  return marks;
}

export function fillerMarks(words, language = "en") {
  const lang = String(language).toLowerCase().slice(0, 2);
  const hard = new Set(FILLERS[lang] ?? FILLERS.en);
  const soft = SOFT_FILLERS[lang] ?? [];
  const marks = [];
  words.forEach((w, i) => {
    if (hard.has(clean(w.text))) marks.push({ kind: "filler", from: i, to: i });
    for (const phrase of soft) {
      if (phrase.some((p, k) => clean(words[i + k]?.text ?? "") !== p)) continue;
      const end = i + phrase.length - 1;
      if (/,$/.test(words[i - 1]?.text ?? "") && /,$/.test(words[end].text)) marks.push({ kind: "filler", from: i, to: end });
    }
  });
  return marks;
}

/** Sounds with no word: loud runs between two words, set apart by quiet. */
export function soundMarks(words, mask) {
  const marks = [];
  const runs = runsOf(mask);
  let w = 0;
  for (const r of runs) {
    while (w < words.length && words[w].end <= r.start) w++;
    const inside = w < words.length && words[w].start < r.end;
    if (!inside && r.end - r.start >= MIN_ISLAND && r.end - r.start <= 1.5 && w > 0 && w < words.length) marks.push({ kind: "sound", start: r3(r.start), end: r3(r.end) });
  }
  return marks;
}

/**
 * Every mark of a recording, in time order, numbered. Takes first: a filler
 * inside a dropped take is not listed twice.
 */
export function makeMarks(words, mask, { language = "en", careful = false } = {}) {
  const dropped = new Set();
  const out = [];
  const add = (m) => {
    for (let i = m.from; i <= m.to; i++) dropped.add(i);
    out.push({ kind: m.kind, start: words[m.from].start, end: words[m.to].end, from: m.from, to: m.to, text: words.slice(m.from, m.to + 1).map((w) => w.text).join(" ") });
  };
  for (const m of [...repeatedTakes(words), ...stutters(words)]) {
    let free = true;
    for (let i = m.from; i <= m.to; i++) if (dropped.has(i)) free = false;
    if (free) add(m);
  }
  for (const m of fillerMarks(words, language)) {
    let free = true;
    for (let i = m.from; i <= m.to; i++) if (dropped.has(i)) free = false;
    if (free) add(m);
  }
  // a transcript that did not fit the sound must not delete sound it cannot name
  if (!careful) for (const m of soundMarks(words, mask)) out.push({ kind: "sound", start: m.start, end: m.end, text: "" });
  out.sort((a, b) => a.start - b.start);
  return out.map((m, i) => ({ id: `c${i + 1}`, ...m }));
}

/**
 * The stretches that stay, in source seconds on whole frames, from the words that
 * stay. `off`: ids of marks the user put back. `keepPauses`: no pause is shortened.
 */
export function keepsOf(words, marks, { off = [], seconds, keepPauses = false, maxPause = MAX_PAUSE } = {}) {
  const live = marks.filter((m) => !off.includes(m.id));
  const gone = new Set();
  const sounds = [];
  for (const m of live) {
    if (m.kind === "sound") sounds.push(m);
    else for (let i = m.from; i <= m.to; i++) gone.add(i);
  }
  const stay = words.filter((_, i) => !gone.has(i));
  const total = seconds ?? words[words.length - 1]?.end ?? 0;
  const spans = [];
  if (keepPauses) {
    let at = 0;
    for (const g of live.map((m) => ({ start: m.start, end: m.end }))) {
      if (g.start > at) spans.push({ start: at, end: g.start });
      at = Math.max(at, g.end);
    }
    if (at < total) spans.push({ start: at, end: total });
  } else {
    for (const w of stay) {
      const start = Math.max(0, w.start - PAD_BEFORE);
      const end = Math.min(total, w.end + (closesSentence(w.text) ? PAD_SENTENCE : PAD_AFTER));
      const prev = spans[spans.length - 1];
      if (prev && start - prev.end <= maxPause - PAD_BEFORE - PAD_AFTER && !sounds.some((s) => s.start >= prev.end - 0.01 && s.end <= start + 0.01)) prev.end = Math.max(prev.end, end);
      else if (prev && start <= prev.end) prev.end = Math.max(prev.end, end);
      else spans.push({ start, end });
    }
  }
  // whole frames, so sound and picture are cut at one moment
  const frames = [];
  for (const s of spans) {
    const a = frameOf(s.start);
    const b = Math.max(a + 1, frameOf(s.end));
    const prev = frames[frames.length - 1];
    if (prev && a <= prev.end) prev.end = Math.max(prev.end, b);
    else frames.push({ start: a, end: b });
  }
  return frames;
}

/** Length of the keeps in seconds. */
export const keptSeconds = (keeps) => keeps.reduce((n, k) => n + (k.end - k.start), 0) / FPS;

/** Source seconds to seconds in the cut video; null when the moment was cut. */
export function toFinal(keeps, t) {
  let before = 0;
  const f = t * FPS;
  for (const k of keeps) {
    if (f < k.start) return null;
    if (f <= k.end) return r3((before + f - k.start) / FPS);
    before += k.end - k.start;
  }
  return null;
}

/** The words that stayed, on the cut video's clock. A word cut in half keeps its part. */
export function finalWords(words, marks, keeps, { off = [] } = {}) {
  const gone = new Set();
  for (const m of marks) {
    if (off.includes(m.id) || m.kind === "sound") continue;
    for (let i = m.from; i <= m.to; i++) gone.add(i);
  }
  const out = [];
  words.forEach((w, i) => {
    if (gone.has(i)) return;
    const start = toFinal(keeps, w.start);
    const end = toFinal(keeps, w.end);
    if (start === null && end === null) return;
    const s = start ?? (end - 0.05);
    out.push({ text: w.text, start: s, end: Math.max(end ?? s + 0.05, s + 0.01), type: "word" });
  });
  return out;
}
