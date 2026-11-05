// recorded/shots.mjs: what happens on screen over a cut recording (docs/BUILD_PLAN.md
// phase 2), planned from the words: chapters, big words, the layout switches of a
// screen share, the color beats of a silhouette. Every entrance sits on the exact
// word where it is said. The AI only names chapters and picks words; its answer is
// checked, repaired once, and otherwise the rule below fills it, so a video always
// comes out. Pure functions, except planRecording.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chat, extractJson } from "../providers/llm.mjs";
import { STOP } from "../stock/index.mjs";
import { clean } from "./cuts.mjs";

export const PROMPT_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "prompt-plan.md");
const REPAIRS = 1;
export const CHAPTER_GAP = 45; // at least this far apart, seconds
export const WORD_GAP = 7; // at least this far between two big words
export const WORD_HOLD = 1.5;
export const LAYOUT_SECONDS = 8;
export const BEAT_SECONDS = 24;
const MAX_PROMPT_CHARS = 60000;
const r3 = (x) => Math.round(x * 1000) / 1000;

export const LAYOUTS = ["full-face", "split", "big-screen"];

const wordsOf = (t) => String(t ?? "").split(/\s+/).filter(Boolean);
const concrete = (w) => {
  const c = clean(w);
  return c.length >= 4 && !STOP.has(c);
};

/** The words of each sentence, with their times. */
export function sentenceWords(sentences, words) {
  let at = 0;
  return sentences.map((s) => {
    const list = words.slice(at, at + s.words);
    at += s.words;
    return { ...s, list };
  });
}

/** How many chapters a video of this length gets: YouTube's minimum when it fits. */
export const chapterCount = (total) => (total < 30 ? 1 : Math.max(3, Math.min(12, Math.round(total / 75))));

/** Chapters by rule: even stretches, each named by its first sentence's words. */
export function ruleChapters(sentences, total) {
  const want = chapterCount(total);
  const out = [];
  for (let n = 0; n < want; n++) {
    const target = (total * n) / want;
    const s = sentences.reduce((best, x) => (Math.abs(x.start - target) < Math.abs(best.start - target) ? x : best), sentences[0]);
    if (out.some((c) => c.sentence === s.id)) continue;
    const named = wordsOf(s.text).filter(concrete).slice(0, 4).map((w) => clean(w));
    const words = (named.length ? named : wordsOf(s.text).slice(0, 4).map((w) => clean(w))).join(" ");
    let title = words ? words[0].toUpperCase() + words.slice(1) : `Part ${n + 1}`;
    // two parts with one name would count as one chapter
    if (out.some((c) => c.title === title)) title = `${title} ${n + 1}`;
    out.push({ sentence: s.id, title });
  }
  return out;
}

const hasNumber = (w) => /\d/.test(w);

/** Big words by rule: a number first, else the longest concrete word of a sentence. */
export function ruleBigWords(sentences, words) {
  const out = [];
  let last = -Infinity;
  for (const s of sentenceWords(sentences, words)) {
    if (s.start - last < WORD_GAP * 1.5 || !s.list.length) continue;
    const num = s.list.find((w) => hasNumber(w.text));
    const pick = num ?? s.list.filter((w) => concrete(w.text)).sort((a, b) => clean(b.text).length - clean(a.text).length)[0];
    if (!pick || (!num && clean(pick.text).length < 7)) continue;
    out.push({ sentence: s.id, words: clean(pick.text) || pick.text });
    last = s.start;
  }
  return out;
}

/** Finds the words of a big word in its sentence; null when they are not said there. */
export function locate(entry, sentenceList) {
  const want = wordsOf(entry.words).map((w) => clean(w)).filter(Boolean);
  if (!want.length || want.length > 3) return null;
  const list = sentenceList.list;
  for (let i = 0; i + want.length <= list.length; i++) {
    if (want.every((w, k) => clean(list[i + k].text) === w)) return { start: list[i].start, end: list[i + want.length - 1].end, text: list.slice(i, i + want.length).map((w) => w.text.replace(/^[^\p{L}\p{N}$€£]+|[^\p{L}\p{N}%]+$/gu, "")).join(" ") };
  }
  return null;
}

/** Everything wrong with an AI answer, as sentences it can read. */
export function planIssues(answer, { sentences, words }) {
  const issues = [];
  const byId = new Map(sentenceWords(sentences, words).map((s) => [s.id, s]));
  const chapters = Array.isArray(answer?.chapters) ? answer.chapters : null;
  if (!chapters?.length) issues.push("chapters is missing");
  let last = -Infinity;
  for (const c of chapters ?? []) {
    const s = byId.get(c?.sentence);
    if (!s) {
      issues.push(`chapter "${c?.title}": there is no sentence ${c?.sentence}`);
      continue;
    }
    if (!String(c.title ?? "").trim()) issues.push(`chapter at ${c.sentence}: the title is empty`);
    if (wordsOf(c.title).length > 6) issues.push(`chapter at ${c.sentence}: at most 6 words in a title`);
    if (s.start - last < CHAPTER_GAP) issues.push(`chapter at ${c.sentence}: chapters must be at least ${CHAPTER_GAP} s apart`);
    last = s.start;
  }
  if (chapters?.[0] && chapters[0].sentence !== sentences[0].id) issues.push(`the first chapter must start at ${sentences[0].id}`);
  let lastWord = -Infinity;
  for (const b of Array.isArray(answer?.bigWords) ? answer.bigWords : []) {
    const s = byId.get(b?.sentence);
    const at = s && locate(b, s);
    if (!at) {
      issues.push(`big word "${b?.words}": these exact words are not in sentence ${b?.sentence}`);
      continue;
    }
    if (at.start - lastWord < WORD_GAP) issues.push(`big word "${b.words}": at least ${WORD_GAP} s between two big words`);
    lastWord = at.start;
  }
  return issues;
}

/** Layout switches of a screen share, about every 8 s, always on a sentence start. */
export function layoutPlan(sentences, total, { every = LAYOUT_SECONDS } = {}) {
  if (!sentences.length) return [{ start: 0, mode: "full-face" }];
  const out = [{ start: 0, mode: "full-face" }];
  let target = every;
  const order = ["split", "big-screen", "full-face", "big-screen", "split", "big-screen"];
  let n = 0;
  while (target < total - 3) {
    const s = sentences.reduce((best, x) => (Math.abs(x.start - target) < Math.abs(best.start - target) ? x : best), sentences[0]);
    const prev = out[out.length - 1];
    if (s.start - prev.start >= every * 0.5 && total - s.start >= 2.5) {
      // what points at the screen goes to the big screen
      const pointing = /\b(here|this|click|see|look|screen|button|page|ez|itt|nézd|kattint)\b/i.test(s.text);
      let mode = pointing ? "big-screen" : order[n++ % order.length];
      if (mode === prev.mode) mode = order[n++ % order.length];
      if (mode === prev.mode) mode = LAYOUTS.find((m) => m !== prev.mode);
      out.push({ start: s.start, mode });
    }
    target = Math.max(target + every, s.start + every);
  }
  return out;
}

/** The moments a silhouette's background changes: every chapter, and between. */
export function beatPlan(sentences, chapters, colors, { every = BEAT_SECONDS } = {}) {
  const starts = new Set(chapters.map((c) => c.start));
  let last = 0;
  for (const s of sentences) {
    if (s.start - last >= every) {
      starts.add(s.start);
      last = s.start;
    }
    if (starts.has(s.start)) last = s.start;
  }
  const list = [...starts].sort((a, b) => a - b);
  if (list[0] !== 0) list.unshift(0);
  return list.map((start, i) => ({ start: r3(start), color: colors[i % colors.length] }));
}

/** One scene row per stretch of about 8 s: the table the B-roll engine and the Preview read. */
export function shotRows(sentences, { every = LAYOUT_SECONDS } = {}) {
  const rows = [];
  let cur = null;
  for (const s of sentences) {
    if (!cur) cur = { from: s.id, to: s.id, start: s.start };
    cur.to = s.id;
    cur.end = s.end;
    if (cur.end - cur.start >= every) {
      rows.push(cur);
      cur = null;
    }
  }
  if (cur) rows.push(cur);
  return rows.map((r) => ({ from: r.from, ...(r.to !== r.from ? { to: r.to } : {}), component: "recorded-shot", vars: {} }));
}

/** The plan of a video from checked pieces. Every time is a word's own time. */
export function finishPlan({ title, chapters, bigWords, sentences, words, total, preset, cutout = false }) {
  const list = sentenceWords(sentences, words);
  const byId = new Map(list.map((s) => [s.id, s]));
  const ch = chapters.map((c, i) => ({ start: i === 0 ? 0 : byId.get(c.sentence).start, sentence: c.sentence, title: String(c.title).trim() }));
  const big = [];
  for (const b of bigWords) {
    const s = byId.get(b.sentence);
    const at = s && locate(b, s);
    if (!at || (big.length && at.start - big[big.length - 1].start < WORD_GAP)) continue;
    big.push({ id: `w${big.length + 1}`, sentence: b.sentence, text: at.text, start: r3(at.start), said: r3(at.end), end: r3(Math.min(total, Math.max(at.end + 0.5, at.start + WORD_HOLD))), behind: !!cutout });
  }
  const colors = preset.tokens?.beats ?? [preset.tokens?.colors?.background ?? "#1b2a4a"];
  const engine = preset.recorded ?? {};
  return {
    schema: "recorded-plan/1",
    preset: preset.id,
    title,
    total: r3(total),
    chapters: ch,
    bigWords: engine.bigWords ? big : [],
    layouts: engine.layouts ? layoutPlan(sentences, total) : [],
    beats: engine.beats ? beatPlan(sentences, ch, colors, { every: Math.min(BEAT_SECONDS, Math.max(5, total / 3)) }) : [],
  };
}

/** The markdown the publishing tail reads: chapter headings over the spoken words. */
export function scriptFromPlan(plan, sentences, words) {
  const starts = plan.chapters.map((c) => c.sentence);
  const parts = [];
  let cur = [];
  for (const s of sentenceWords(sentences, words)) {
    if (starts.includes(s.id) && cur.length) {
      parts.push(cur);
      cur = [];
    }
    cur.push(s.list.map((w) => w.text).join(" "));
  }
  parts.push(cur);
  const body = parts.map((p, i) => `## ${plan.chapters[i]?.title ?? `Part ${i + 1}`}\n\n${p.join(" ")}`).join("\n\n");
  return `# ${plan.title}\n\n${body}\n`;
}

/** `llm`: { provider, apiKey, model, effort }, or null for the rule. */
/** The video's title: what the user typed stays, otherwise the AI's, otherwise the file's name. Pure. */
export const planTitle = (answer, title, keepTitle = false) => (keepTitle ? title : String(answer ?? "").trim() || title);

export async function planRecording({ llm = null, sentences, words, total, title, keepTitle = false, preset, language = "en", cutout = false, onProgress = () => {} }) {
  let answer = null;
  const data = { language, total: r3(total), wants: preset.recorded ?? {}, sentences: sentences.map((s) => ({ id: s.id, at: Math.round(s.start), text: s.text })) };
  const payload = JSON.stringify(data);
  if (llm?.apiKey && payload.length <= MAX_PROMPT_CHARS) {
    const messages = [{ role: "system", content: fs.readFileSync(PROMPT_FILE, "utf8") }, { role: "user", content: `DATA:\n${payload}` }];
    onProgress({ step: "recorded-plan" });
    try {
      for (let n = 0; n <= REPAIRS && !answer; n++) {
        const text = await chat({ ...llm, messages, json: true, temperature: n ? 0.2 : 0.4, onProgress });
        let issues;
        let a = null;
        try {
          a = extractJson(text);
          issues = planIssues(a, { sentences, words });
        } catch (e) {
          issues = [`the answer was not valid JSON (${e.message})`];
        }
        if (!issues.length) answer = a;
        else messages.push({ role: "assistant", content: text }, { role: "user", content: `Fix these problems and answer with the corrected JSON object only:\n- ${issues.slice(0, 12).join("\n- ")}` });
      }
    } catch {
      // a dead AI still gives a video: the rule below
    }
  }
  const chapters = answer?.chapters ?? ruleChapters(sentences, total);
  const bigWords = answer?.bigWords ?? ruleBigWords(sentences, words);
  return { ...finishPlan({ title: planTitle(answer?.title, title, keepTitle), chapters, bigWords, sentences, words, total, preset, cutout }), plannedBy: answer ? llm.provider : "rule" };
}
