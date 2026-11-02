// gates/script: PIPELINE step 1, gate 1. Topic or Video Brief Card in, a script
// in the Ownership Framework out (script.json for the machine, script.md for the
// human). The LLM answers JSON; it is schema-checked and style-checked, and one
// repair call is allowed before the gate fails (SPEC 5).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chat, extractJson } from "../../providers/llm.mjs";
import { validate, loadSchema } from "../../schema/validate.mjs";
import { humanizeScript, LEVELS } from "./humanize.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const WORDS_PER_MINUTE = 150;
const NOTES_MAX = 40000;
// Notes set their own length: a target would ask the AI to add what they do not say.
const NOTES_LENGTH = `## Length

The notes set the length. Cover everything they say, cut only repetition and false
starts, and never pad. Do not aim for a word count.

`;

// The data block the model sees. Brief fields win over channel defaults.
// commentCalls: the video's comment calls (cta/profile.mjs ctaPlan), the
// only calls the narration makes. The landing page link goes into the YouTube
// description, never into the narration or on screen (Zoltan, 2026-10-05,
// CTA K10), so `cta` is always null now; the field stays for old scripts.
// angle: the creator's own story, opinion or example for this video (gate 1,
// "Your own angle", optional; DECISIONS 88).
// bridge: the playlist bridge lines of a lesson (course/bridge.mjs). The app
// says them, so the model is not told the next video and writes no line
// about it (DECISIONS 128).
// notes: the creator's own notes or cleaned transcript, turned into the script
// and never added to (docs/BUILD_PLAN.md phase 3). research: an approved brief
// (research/index.mjs briefForScript), the only place new facts may come from.
export function buildData({ topic, brief = {}, channel = {}, language, targetLengthMin, keyword, dictionary = null, commentCalls = [], angle = null, seed = null, bridge = null, notes = null, research = null }) {
  const calls = (commentCalls ?? []).map((c) => ({ place: c.slot, keyword: c.keyword, temperature: c.temperature, ...(c.offer ? { offer: c.offer } : { gets: c.gets }) }));
  const cta = null;
  const data = {
    topic: topic || brief.title,
    title: brief.title || null,
    promise: brief.promise || null,
    audience: brief.audience || channel.audience || null,
    brandVoice: channel.brandVoice || null,
    channelProfile: channel.profile || null,
    keyword: keyword || brief.keyword || null,
    searchIntent: brief.searchIntent || null,
    playlist: bridge && brief.playlist ? { ...brief.playlist, nextTitle: undefined } : brief.playlist || null,
    nextVideo: bridge ? null : brief.playlist?.nextTitle || null,
    cta,
    contentLanguage: language || brief.language || channel.contentLanguage || "en",
    targetLengthMin: targetLengthMin || brief.targetLengthMin || 8,
  };
  if (calls.length) data.commentCalls = calls;
  const own = String(angle ?? "").trim().slice(0, 1500);
  if (own) data.ownAngle = own;
  const written = String(notes ?? "").trim().slice(0, NOTES_MAX);
  if (written) data.notes = written;
  if (research) data.research = research;
  // One lesson of an imported course: its plan (course/index.mjs, seed.json).
  const outline = lessonOutline(bridge && seed ? { ...seed, closingLine: undefined } : seed);
  if (outline) data.lessonOutline = outline;
  // The Identity's dictionary (dictionary.mjs dictionaryData), only when it has entries.
  if (dictionary) data.dictionary = dictionary;
  if (!data.topic) throw new Error("A topic or a brief title is needed to write a script.");
  return data;
}

// The script seed as the model sees it: only the parts that say something.
export function lessonOutline(seed) {
  if (!seed || typeof seed !== "object") return null;
  const out = {};
  if (seed.course?.title) out.course = seed.course;
  if (seed.hook) out.hook = seed.hook;
  if (seed.teach?.points?.length) out.teach = { minutes: seed.teach.minutes || null, points: seed.teach.points };
  if (seed.do?.exercise) out.do = { minutes: seed.do.minutes || null, exercise: seed.do.exercise };
  if (seed.review?.check) out.review = { minutes: seed.review.minutes || null, check: seed.review.check };
  if (seed.closingLine) out.closingLine = seed.closingLine;
  return out.hook || out.teach || out.do || out.review || out.closingLine ? out : null;
}

export function buildMessages(data) {
  const minutes = data.targetLengthMin;
  const system = fs
    .readFileSync(path.join(here, "prompt.md"), "utf8")
    .replaceAll("{{targetWords}}", String(Math.round(minutes * WORDS_PER_MINUTE)))
    .replaceAll("{{targetMinutes}}", String(minutes))
    .replaceAll("{{minWords}}", String(Math.round(minutes * WORDS_PER_MINUTE * 0.85)))
    .replace(/## Length[\s\S]*?(?=## Data)/, (part) => (data.notes ? NOTES_LENGTH : part));
  const user = `DATA\n${JSON.stringify(data, null, 2)}\nEND DATA\n\nWrite the script now. Answer with the JSON object only.`;
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

// Every piece of spoken text, with where it sits (for error messages).
export function spokenFields(script) {
  const out = [
    ["open.problem", script.open?.problem],
    ["open.promise", script.open?.promise],
    ["open.cta", script.open?.cta],
    ["open.credibility", script.open?.credibility],
    ["open.bridge", script.open?.bridge],
    ["ownershipCta", script.ownershipCta],
    ["own.recap", script.own?.recap],
    ["own.cta", script.own?.cta],
    ["own.nextVideo", script.own?.nextVideo],
    ["own.bridge", script.own?.bridge],
  ];
  (script.sections ?? []).forEach((s, i) => out.push([`sections[${i}].narration`, s.narration]));
  return out.filter(([, v]) => typeof v === "string" && v !== "");
}

// Spoken text allows commas and periods only (the app's script style rules). A hyphen
// inside a word is fine, a dash between words is not.
const FORBIDDEN = [
  [/:/, "colon"],
  [/;/, "semicolon"],
  [/[–—]|\s-\s|--/, "dash"],
  [/[!]/, "exclamation mark"],
  [/\.\.\.|…/, "ellipsis"],
  [/["“”„]/, "quotation mark"],
  [/[()[\]{}]/, "bracket"],
  [/\p{Extended_Pictographic}/u, "emoji"],
];

export function styleIssues(script) {
  const issues = [];
  for (const [where, text] of spokenFields(script)) {
    for (const [rx, name] of FORBIDDEN) if (rx.test(text)) issues.push(`${where}: contains a ${name}`);
  }
  const hv = (script.sections ?? []).filter((s) => s.highestValue).length;
  if (hv !== 1) issues.push(`exactly one section must have highestValue true, found ${hv}`);
  const callouts = (script.sections ?? []).filter((s) => s.callout).length;
  if (callouts > 3) issues.push(`at most 3 callouts, found ${callouts}`);
  return issues;
}

// Notes mode never adds a claim: a number in the script comes from the notes, or
// from the approved research. Words are the AI's to judge; digits can be checked.
const digitsIn = (text) => String(text ?? "").replace(/(\d),(?=\d)/g, "$1").match(/\d+(?:\.\d+)?/g) ?? [];
export function notesIssues(script, data) {
  if (!data.notes) return [];
  const known = new Set([...digitsIn(data.notes), ...digitsIn(JSON.stringify(data.research ?? {}))]);
  const out = [];
  for (const [where, text] of spokenFields(script)) {
    for (const n of digitsIn(text)) if (!known.has(n)) out.push(`${where}: the number ${n} is not in the notes${data.research ? " or the research" : ""}. Never add a claim they do not make: remove it`);
  }
  return out;
}

export function checkScript(script, data) {
  const problems = validate(script, loadSchema("script"));
  if (problems.length) return problems;
  const issues = [...styleIssues(script), ...notesIssues(script, data)];
  if (data.commentCalls) return [...issues, ...commentCallIssues(script, data.commentCalls)];
  if (data.cta && !script.own.cta) issues.push("own.cta is missing although the data has a CTA");
  if (!data.cta && (script.ownershipCta || script.own.cta)) issues.push("the data has no CTA, ownershipCta and own.cta must be null");
  if (script.open.cta) issues.push("the data has no comment calls, open.cta must be null");
  return issues;
}

// The field each place of a comment call is spoken in.
export const CALL_FIELDS = { start: "open.cta", middle: "ownershipCta", end: "own.cta" };
const fieldValue = (script, field) => field.split(".").reduce((o, k) => o?.[k], script);
const said = (text, keyword) => new RegExp(`(^|[^\p{L}])${keyword}([^\p{L}]|$)`, "u").test(String(text ?? ""));

// Every planned call is spoken in its own field with the keyword in capitals;
// unplanned places stay empty, and no keyword turns up anywhere else.
export function commentCallIssues(script, calls) {
  const issues = [];
  const planned = new Map(calls.map((c) => [CALL_FIELDS[c.place], c.keyword]));
  for (const field of Object.values(CALL_FIELDS)) {
    const text = fieldValue(script, field);
    const keyword = planned.get(field);
    if (!keyword && text) issues.push(`${field} must be null, the data has no comment call there`);
    if (keyword && !text) issues.push(`${field} is missing: the comment call with ${keyword}`);
    if (keyword && text && !said(text, keyword)) issues.push(`${field} must contain the keyword ${keyword} exactly, in capital letters`);
  }
  const keywords = [...new Set(calls.map((c) => c.keyword))];
  for (const [where, text] of spokenFields(script)) {
    if (Object.values(CALL_FIELDS).includes(where)) continue;
    for (const k of keywords) if (said(text, k)) issues.push(`${where}: the keyword ${k} belongs only in its comment call`);
  }
  return issues;
}

// The length the user set (Zoltan's test, 2026-10-05: 3 minutes asked, 318
// words written, about 2 minutes). Within 85 to 120 percent of the target
// passes; otherwise the repair call is told how many words to add or cut.
const targetWords = (data) => Math.round((data.targetLengthMin || 8) * WORDS_PER_MINUTE);
export function lengthIssues(script, data) {
  if (data.notes) return [];
  const target = targetWords(data);
  const words = wordCount(script);
  if (words < target * 0.85) return [`the script has ${words} spoken words, too short for ${data.targetLengthMin} minutes: write about ${target} words (at least ${Math.round(target * 0.85)}), with more substance in the TEACH sections, not padding`];
  if (words > target * 1.2) return [`the script has ${words} spoken words, too long for ${data.targetLengthMin} minutes: cut it to about ${target} words`];
  return [];
}

export function wordCount(script) {
  return spokenFields(script).reduce((n, [, t]) => n + t.split(/\s+/).filter(Boolean).length, 0);
}

export function renderMarkdown(script) {
  const lines = [`# ${script.title}`, "", "## OPEN", "", script.open.problem, ""];
  if (script.open.bridge) lines.push(script.open.bridge, "");
  lines.push(script.open.promise, "");
  if (script.open.cta) lines.push(script.open.cta, "");
  if (script.open.credibility) lines.push(script.open.credibility, "");
  script.sections.forEach((s, i) => {
    lines.push(`## ${i + 1}. ${s.name}`, "", s.narration, "");
    if (s.callout) lines.push(`[CALLOUT: ${s.callout}]`, "");
    if (s.highestValue && script.ownershipCta) lines.push(script.ownershipCta, "");
  });
  lines.push("## OWN", "", script.own.recap, "");
  if (script.own.cta) lines.push(script.own.cta, "");
  if (script.own.nextVideo) lines.push(script.own.nextVideo, "");
  if (script.own.bridge) lines.push(script.own.bridge, "");
  return lines.join("\n");
}

// Runs the gate. llm = { provider, apiKey, model, fetchImpl?, sleep? }.
export async function writeScript({ llm, input, onProgress = () => {} }) {
  const data = buildData(input);
  const messages = buildMessages(data);
  onProgress({ step: "writing", provider: llm.provider });
  let text = await chat({ ...llm, messages, json: true });
  let script;
  let issues;
  try {
    script = extractJson(text);
    issues = [...checkScript(script, data), ...lengthIssues(script, data)];
  } catch (e) {
    issues = [`the answer was not valid JSON (${e.message})`];
  }
  // Up to two repair calls (SPEC 5 had one; 2026-10-06: a second one turns
  // most failed scripts into good ones), with the exact problems listed.
  for (let n = 1; n <= 2 && issues.length; n++) {
    onProgress({ step: "repairing", round: n, of: 2, issues: issues.slice(0, 10) });
    messages.push({ role: "assistant", content: text });
    messages.push({ role: "user", content: `Fix these problems and answer with the corrected JSON object only:\n- ${issues.slice(0, 20).join("\n- ")}` });
    text = await chat({ ...llm, messages, json: true });
    try {
      script = extractJson(text);
      // the length is asked for again below; after a repair it never fails the script
      issues = checkScript(script, data);
    } catch (e) {
      issues = [`the answer was not valid JSON (${e.message})`];
    }
  }
  if (issues.length) {
    const err = new Error(`The script did not pass the checks after two repairs: ${issues.slice(0, 5).join("; ")}. Press Write again, or paste your own script.`);
    err.issues = issues;
    throw err;
  }
  // The length, up to two more times on its own (Zoltan's second test: 265
  // words for 3 minutes after the first repair). A longer answer is kept
  // only if it still passes every other check.
  for (let round = 0; round < 2; round++) {
    const short = lengthIssues(script, data);
    if (!short.length) break;
    onProgress({ step: "lengthening", issues: short });
    messages.push({ role: "assistant", content: JSON.stringify(script) });
    messages.push({ role: "user", content: `Keep everything that is right, and fix only this, answering with the whole corrected JSON object:\n- ${short.join("\n- ")}` });
    try {
      const next = extractJson(await chat({ ...llm, messages, json: true }));
      if (!checkScript(next, data).length && Math.abs(wordCount(next) - targetWords(data)) < Math.abs(wordCount(script) - targetWords(data))) script = next;
    } catch {
      break; // keep the script that passed
    }
  }
  // The optional natural-voice pass (humanize.mjs, DECISIONS 88): the video's
  // own choice, else the Identity's, else off.
  const level = LEVELS.includes(input.humanize) ? input.humanize : LEVELS.includes(input.channel?.humanize) ? input.channel.humanize : "off";
  let humanizeNote = null;
  if (level !== "off") ({ script, note: humanizeNote } = await humanizeScript({ llm, script, data, level, ownAngle: data.ownAngle ?? null, onProgress }));
  // The playlist bridge lines, the app's own words, after every AI step.
  if (input.bridge) {
    script.open = { ...script.open, bridge: input.bridge.open ?? null };
    script.own = { ...script.own, bridge: input.bridge.close ?? null };
  }
  if (data.commentCalls) script.commentCalls = data.commentCalls.map((c) => ({ slot: c.place, keyword: c.keyword, temperature: c.temperature, gets: c.gets ?? null, offer: c.offer ?? null }));
  // For the publishing data next to the video (gates/render/publish.mjs).
  script.publishing = { searchKeyword: data.keyword, landingUrl: input.brief?.cta?.landingUrl || input.channel?.landingUrl || null, nextVideo: data.nextVideo, playlist: data.playlist?.title ?? data.playlist?.name ?? null };
  return { script, markdown: renderMarkdown(script), words: wordCount(script), data, humanize: level, humanizeNote };
}
