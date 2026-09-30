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
export function buildData({ topic, brief = {}, channel = {}, language, targetLengthMin, keyword }) {
  const cta = brief.cta?.text || brief.cta?.landingUrl || channel.ctaText || channel.landingUrl
    ? { text: brief.cta?.text || channel.ctaText || null, landingUrl: brief.cta?.landingUrl || channel.landingUrl || null }
    : null;
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
  if (data.cta && !script.own.cta) issues.push("own.cta is missing although the data has a CTA");
  if (!data.cta && (script.ownershipCta || script.own.cta)) issues.push("the data has no CTA, ownershipCta and own.cta must be null");
  return issues;
}

export function wordCount(script) {
  return spokenFields(script).reduce((n, [, t]) => n + t.split(/\s+/).filter(Boolean).length, 0);
}

export function renderMarkdown(script) {
  const lines = [`# ${script.title}`, "", "## OPEN", "", script.open.problem, "", script.open.promise, ""];
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
    issues = checkScript(script, data);
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
    if (issues.length) {
      const err = new Error(`The script did not pass the checks after one repair: ${issues.slice(0, 5).join("; ")}`);
      err.issues = issues;
      throw err;
    }
  }
  return { script, markdown: renderMarkdown(script), words: wordCount(script), data };
}
