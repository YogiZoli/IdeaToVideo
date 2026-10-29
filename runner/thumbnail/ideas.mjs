// thumbnail/ideas.mjs: the words and the picture idea of each thumbnail
// variant (DECISIONS 131). A small Gemini text call writes them from the
// chosen YouTube title, the hook and the audience. The words go on the image
// (at most 4, they must read at phone size); the picture idea goes to the
// image model, which draws no text at all. The app places the words itself,
// in the Identity's font (compose.mjs).

import { chat, extractJson } from "../providers/llm.mjs";
import { estimateUsd } from "../providers/prices.mjs";
import { IDEAS_MODEL } from "./models.mjs";

export const MAX_WORDS = 4;
export const MAX_CHARS = 28;

export const countWords = (s) => String(s ?? "").trim().split(/\s+/).filter(Boolean).length;

// Words for the image: trimmed, one line, no quotes, at most MAX_WORDS.
export function cleanWords(s) {
  return String(s ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/["“”„«»]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function wordsIssue(words) {
  const w = cleanWords(words);
  if (!w) return "the words are empty";
  if (countWords(w) > MAX_WORDS) return `"${w}" has more than ${MAX_WORDS} words`;
  if (w.length > MAX_CHARS) return `"${w}" is longer than ${MAX_CHARS} characters`;
  return null;
}

const SYSTEM = `You write YouTube thumbnail ideas. Each idea has:
- "words": the text on the thumbnail, at most ${MAX_WORDS} words and ${MAX_CHARS} characters, in the content language. It must read at phone size, so short, strong, concrete words. It adds curiosity or a promise to the title; it never repeats the title word for word. No emoji, no hashtags, no quotes.
- "accent": the 0-based index of the one word to show in the accent colour (the most important word).
- "picture": in English, what the image shows: one clear subject, a strong emotion or a before/after contrast, simple background. The image must contain no text, no letters, no numbers, no logos.
The ideas must differ from each other: a different angle each.
Answer with JSON only: {"ideas":[{"words":"...","accent":0,"picture":"..."}]}`;

function dataOf({ title, hook, audience, language, count }) {
  return { language, title, hook: String(hook ?? "").slice(0, 600), audience: String(audience ?? "").slice(0, 600), count };
}

// Price of the ideas call, before it runs.
export function estimateIdeas({ title, hook, audience, language, count = 3 }) {
  const chars = SYSTEM.length + JSON.stringify(dataOf({ title, hook, audience, language, count })).length + 200;
  return estimateUsd({ provider: "gemini", model: IDEAS_MODEL, effort: "low", tokensIn: Math.ceil(chars / 4), tokensOut: 90 * count });
}

export function issuesOf(answer, count) {
  const ideas = answer?.ideas;
  if (!Array.isArray(ideas) || ideas.length < count) return [`give exactly ${count} ideas in "ideas"`];
  const out = [];
  ideas.slice(0, count).forEach((x, i) => {
    const w = wordsIssue(x?.words);
    if (w) out.push(`idea ${i + 1}: ${w}`);
    if (!String(x?.picture ?? "").trim()) out.push(`idea ${i + 1}: the picture description is empty`);
  });
  return out;
}

const normalize = (x) => {
  const words = cleanWords(x.words);
  const n = countWords(words);
  const a = Number.isInteger(x.accent) && x.accent >= 0 && x.accent < n ? x.accent : n - 1;
  return { words, accent: a, picture: String(x.picture).trim().slice(0, 800) };
};

// [{ words, accent, picture }] x count. One repair round, as the packaging.
export async function writeIdeas({ apiKey, fetchImpl, title, hook, audience, language = "en", count = 3, onProgress = () => {} }) {
  const llm = { provider: "gemini", model: IDEAS_MODEL, effort: "low", apiKey, fetchImpl };
  const messages = [
    { role: "system", content: SYSTEM },
    { role: "user", content: `DATA\n${JSON.stringify(dataOf({ title, hook, audience, language, count }), null, 1)}\nEND DATA\n\nWrite ${count} ideas now. JSON only.` },
  ];
  let text = await chat({ ...llm, messages, json: true, temperature: 0.9 });
  let answer = null;
  let issues;
  try {
    answer = extractJson(text);
    issues = issuesOf(answer, count);
  } catch (e) {
    issues = [`the answer was not valid JSON (${e.message})`];
  }
  if (issues.length) {
    onProgress({ step: "repairing", issues });
    messages.push({ role: "assistant", content: text }, { role: "user", content: `Fix these problems and answer with the corrected JSON only:\n- ${issues.join("\n- ")}` });
    text = await chat({ ...llm, messages, json: true, temperature: 0.4 });
    answer = extractJson(text);
    issues = issuesOf(answer, count);
    if (issues.length) throw new Error(`The thumbnail ideas did not pass the checks: ${issues.join("; ")}`);
  }
  return answer.ideas.slice(0, count).map(normalize);
}

// The free test maker's ideas: from the title, no AI.
export function testIdeas({ title, count = 3 }) {
  const words = cleanWords(title).split(" ").filter(Boolean);
  return Array.from({ length: count }, (_, i) => {
    const w = words.slice(i, i + 3).join(" ") || `Test ${i + 1}`;
    return { words: w.slice(0, MAX_CHARS).trim(), accent: 0, picture: `test picture ${i + 1}` };
  });
}
