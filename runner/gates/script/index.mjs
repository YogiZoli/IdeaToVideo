// gates/script: PIPELINE step 1, gate 1. Topic or Video Brief Card in, a script
// in the Ownership Framework out (script.json for the machine, script.md for the
// human). The LLM answers JSON; it is schema-checked and style-checked, and one
// repair call is allowed before the gate fails (SPEC 5).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chat, extractJson } from "../../providers/llm.mjs";
import { validate, loadSchema } from "../../schema/validate.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const WORDS_PER_MINUTE = 150;

// The data block the model sees. Brief fields win over channel defaults.
// commentCalls: the video's comment calls (cta/profile.mjs ctaPlan), the
// only calls the narration makes. The landing page link goes into the YouTube
// description, never into the narration or on screen (Zoltan, 2026-10-05,
// CTA K10), so `cta` is always null now; the field stays for old scripts.
export function buildData({ topic, brief = {}, channel = {}, language, targetLengthMin, keyword, dictionary = null, commentCalls = [] }) {
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
    playlist: brief.playlist || null,
    nextVideo: brief.playlist?.nextTitle || null,
    cta,
    contentLanguage: language || brief.language || channel.contentLanguage || "en",
    targetLengthMin: targetLengthMin || brief.targetLengthMin || 8,
  };
  if (calls.length) data.commentCalls = calls;
  // The Identity's dictionary (dictionary.mjs dictionaryData), only when it has entries.
  if (dictionary) data.dictionary = dictionary;
  if (!data.topic) throw new Error("A topic or a brief title is needed to write a script.");
  return data;
}

export function buildMessages(data) {
  const minutes = data.targetLengthMin;
  const system = fs
    .readFileSync(path.join(here, "prompt.md"), "utf8")
    .replaceAll("{{targetWords}}", String(Math.round(minutes * WORDS_PER_MINUTE)))
    .replaceAll("{{targetMinutes}}", String(minutes));
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
    ["ownershipCta", script.ownershipCta],
    ["own.recap", script.own?.recap],
    ["own.cta", script.own?.cta],
    ["own.nextVideo", script.own?.nextVideo],
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

export function checkScript(script, data) {
  const problems = validate(script, loadSchema("script"));
  if (problems.length) return problems;
  const issues = styleIssues(script);
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
export function lengthIssues(script, data) {
  const target = Math.round((data.targetLengthMin || 8) * WORDS_PER_MINUTE);
  const words = wordCount(script);
  if (words < target * 0.85) return [`the script has ${words} spoken words, too short for ${data.targetLengthMin} minutes: write about ${target} words (at least ${Math.round(target * 0.85)}), with more substance in the TEACH sections, not padding`];
  if (words > target * 1.2) return [`the script has ${words} spoken words, too long for ${data.targetLengthMin} minutes: cut it to about ${target} words`];
  return [];
}

export function wordCount(script) {
  return spokenFields(script).reduce((n, [, t]) => n + t.split(/\s+/).filter(Boolean).length, 0);
}

export function renderMarkdown(script) {
  const lines = [`# ${script.title}`, "", "## OPEN", "", script.open.problem, "", script.open.promise, ""];
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
  if (issues.length) {
    // one repair call (SPEC 5), with the exact problems listed
    onProgress({ step: "repairing", issues: issues.slice(0, 10) });
    messages.push({ role: "assistant", content: text });
    messages.push({ role: "user", content: `Fix these problems and answer with the corrected JSON object only:\n- ${issues.slice(0, 20).join("\n- ")}` });
    text = await chat({ ...llm, messages, json: true });
    try {
      script = extractJson(text);
      issues = checkScript(script, data);
    } catch (e) {
      issues = [`the answer was not valid JSON (${e.message})`];
    }
    // The length is asked for once more, but a script that is only too short
    // or too long after the repair is kept: the gate shows its real length.
    if (issues.length) {
      const err = new Error(`The script did not pass the checks after one repair: ${issues.slice(0, 5).join("; ")}`);
      err.issues = issues;
      throw err;
    }
  }
  if (data.commentCalls) script.commentCalls = data.commentCalls.map((c) => ({ slot: c.place, keyword: c.keyword, temperature: c.temperature, gets: c.gets ?? null, offer: c.offer ?? null }));
  // For the publishing data next to the video (gates/render/publish.mjs).
  script.publishing = { searchKeyword: data.keyword, landingUrl: input.brief?.cta?.landingUrl || input.channel?.landingUrl || null, nextVideo: data.nextVideo, playlist: data.playlist?.title ?? data.playlist?.name ?? null };
  return { script, markdown: renderMarkdown(script), words: wordCount(script), data };
}
