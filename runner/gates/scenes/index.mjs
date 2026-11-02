// gates/scenes: gate 3, the scene table. The approved narration is already cut
// into sentences (timing/sentences.mjs); the LLM plans one scene per sentence
// or group of sentences: a library component and its variables. Two steps
// (DECISIONS 130): the AI reads the whole catalog (catalog.mjs) and gives
// every scene its 3 to 5 best candidates; then it reads the full code of
// those candidates and picks the one that fits the sentence best, with one
// line on why. Every answer is checked (coverage, lengths, variables,
// on-screen text, variety) and repaired before the gate fails (SPEC 5). The
// result is scenes.json, which the assembler turns into build/.
//
// The user sees the table in plain words (roles.mjs), can swap a row for
// another component of the same role (one small LLM call fills it in), or edit
// its main text by hand (Custom).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chat, extractJson } from "../../providers/llm.mjs";
import { loadComponent, checkVars, sceneTimes, mountTheme } from "../build/assemble.mjs";
import { narrationFromMarkdown } from "../voice/narration.mjs";
import { duration } from "../../audio.mjs";
import { ROLES, COMPONENTS, roleOf, paceOf, componentMeta, PACK_COMPONENTS } from "./roles.mjs";
import { catalogForPlanner as catalogEntries, plannableNames, codeForPlanner, entryOf, CATALOG_ROLES } from "./catalog.mjs";
import { recentUses, recordHistory, maxUses } from "./history.mjs";
import { estimateUsd, tokensOf } from "../../providers/prices.mjs";
import { CALL_FIELDS } from "../script/index.mjs";
import { catalogForPlanner } from "../../footage/library.mjs";
import { simplePlan } from "./simple.mjs";
import { mixRule, MIX_PRESETS, DEFAULT_PRESET } from "../../scenes-profile.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

export const MIN_SECONDS = 2;
// A scene of several sentences may last at most this long; the Identity's
// pace (roles.mjs PACES, the Motion wizard) sets it, this is the default
// pace's (Zoltan, 2026-10-06: scenes of 9-11 s that joined three sentences
// read as slides). One long sentence may still be longer.
export const MAX_SECONDS = paceOf().joined;
export const MAX_WORDS = 6;
const HIDDEN_VARS = new Set(["exit", "cues"]);
const r3 = (x) => Math.round(x * 1000) / 1000;

// What the LLM (and the UI) know about each component, from its own
// registry-item.json. exit and cues stay at their defaults.
// `off`: components the Identity's Motion profile turned off (motion/profile.mjs).
export function libraryCatalog({ env = process.env, off = [] } = {}) {
  return Object.entries(COMPONENTS).filter(([name, meta]) => !off.includes(name) && !meta.retired).map(([name, meta]) => {
    const { item } = loadComponent(name, { env });
    return {
      name,
      role: meta.role,
      label: meta.label,
      description: item.description,
      ...(meta.words ? { maxWords: meta.words } : {}),
      variables: (item.variables ?? [])
        .filter((v) => !HIDDEN_VARS.has(v.id))
        .map((v) => {
          const out = { id: v.id, type: v.type, description: v.description, default: v.default };
          if (v.options) out.options = v.options.map((o) => o.value);
          if (v.min !== undefined) out.min = v.min;
          if (v.max !== undefined) out.max = v.max;
          return out;
        }),
    };
  }).concat(
    // the blocks of the Identity's packs (packs/registerPacks)
    [...PACK_COMPONENTS].filter(([name]) => !off.includes(name)).map(([name, meta]) => ({
      name,
      role: meta.role,
      label: meta.label,
      description: `${meta.description}${meta.realOnly ? " Only when the voice names a real person, record or quote; never invent one." : ""} Never a real brand, company or famous person.`,
      maxWords: meta.words,
      variables: meta.variables.map((v) => ({ id: v.id, type: v.type, description: v.icon ? `${v.label}: an icon, one or two plain words for a simple thing (rocket, mail, calendar)` : v.optional ? `${v.label} (optional, may be empty)` : v.label, default: v.default })),
    })),
  );
}

// Which script section each sentence belongs to, by counting words through
// the narration blocks (the voice gate reads one block per "## " section).
export function sentenceSections(markdown, sentences) {
  const blocks = narrationFromMarkdown(markdown ?? "");
  const ends = [];
  let n = 0;
  for (const b of blocks) {
    n += b.text.split(/\s+/).filter(Boolean).length;
    ends.push([n, b.heading]);
  }
  let seen = 0;
  return sentences.map((s) => {
    const mid = seen + (s.words ?? String(s.text).split(/\s+/).length) / 2;
    seen += s.words ?? String(s.text).split(/\s+/).length;
    return (ends.find(([end]) => mid <= end) ?? ends[ends.length - 1] ?? [0, ""])[1];
  });
}

export function buildData({ sentences, sections = [], name = null, themeIsLight = false, language = "en", calls = new Map() }) {
  return {
    language,
    name,
    theme: themeIsLight ? "light" : "dark",
    sentences: sentences.map((s, i) => ({ id: s.id, seconds: s.dur ?? r3(s.end - s.start), section: sections[i] || null, text: s.text, ...(calls.has(s.id) ? { commentCall: calls.get(s.id).keyword } : {}) })),
  };
}

// The sentences that carry the script's comment calls (script.json
// commentCalls, gates/script CALL_FIELDS): the one that says the keyword and
// shares the most words with the call. The recording may write the keyword
// in any case. Returns Map(sentence id -> { slot, keyword, temperature }).
const tokens = (t) => new Set(String(t).toLowerCase().match(/\p{L}+/gu) ?? []);
export function callSentences(script, sentences) {
  const out = new Map();
  for (const call of script?.commentCalls ?? []) {
    const field = CALL_FIELDS[call.slot].split(".").reduce((o, k) => o?.[k], script);
    const want = tokens(field ?? "");
    const rx = new RegExp(`(^|[^\\p{L}])${call.keyword}([^\\p{L}]|$)`, "iu");
    let best = null;
    for (const s of sentences) {
      if (out.has(s.id) || !rx.test(s.text)) continue;
      const have = tokens(s.text);
      const score = [...want].filter((w) => have.has(w)).length / Math.max(1, have.size);
      if (!best || score > best.score) best = { id: s.id, score };
    }
    if (best) out.set(best.id, { slot: call.slot, keyword: call.keyword, temperature: call.temperature });
  }
  return out;
}

export function readScript(projectDir) {
  const p = path.join(projectDir, "script.json");
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
}

const words = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;

// The strings a viewer reads, per component: one line of text, or list items.
// A list is a variable the component reads as comma (or bar) separated items:
// the first library's names, or any whose registry description says so.
const LIST_IDS = ["items", "nodes", "options", "labels"];
const NOT_SHOWN = ["type", "split", "style", "rule", "sketch", "pen", "orientation", "data", "unit", "prefix", "suffix", "url"];
export function listIds(item) {
  return new Set([...LIST_IDS, ...(item?.variables ?? []).filter((v) => v.type === "string" && /comma|separated|one per|pipe/i.test(String(v.description ?? ""))).map((v) => v.id)]);
}
function onScreen(component, vars = {}, lists = new Set(LIST_IDS)) {
  const lines = [];
  for (const [id, v] of Object.entries(vars)) {
    if (typeof v !== "string" || !v.trim()) continue;
    if (lists.has(id)) lines.push(...v.split(v.includes("|") ? "|" : ",").map((x) => ({ id, text: x.trim(), item: true })));
    else if (!NOT_SHOWN.includes(id)) lines.push({ id, text: v });
  }
  return lines;
}

// Every problem with a planned table, as sentences the repair call can act on.
// `warnings` do not fail the gate; the UI shows them.
// `timing: false` skips the coverage and length checks (step two checks a
// part of the video; step one checked them). `limit`: how often one
// component may appear (history.mjs maxUses), `before`: the component of
// the scene before the first one checked.
export function checkScenes(answer, { sentences, total, env = process.env, off = [], calls = new Map(), gaps = [], pace, timing = true, limit = null, before = null } = {}) {
  const maxJoined = paceOf(pace).joined;
  const issues = [];
  const warnings = [];
  const scenes = answer?.scenes;
  if (!Array.isArray(scenes) || !scenes.length) return { issues: ["scenes must be a non-empty array"], warnings };
  // A comment call's button is its keyword, whatever the answer said.
  for (const sc of scenes) {
    const call = sc && calls.get(sc.from);
    if (call && sc.component === "cta-close" && (sc.to ?? sc.from) === sc.from) sc.vars = { ...(sc.vars ?? {}), button_label: call.keyword };
  }
  for (const [id, call] of calls) {
    const sc = scenes.find((x) => x?.from === id);
    if (!sc || (sc.to ?? sc.from) !== id || sc.component !== "cta-close") issues.push(`${id} is a comment call (${call.keyword}): give it a scene of its own, from ${id} to ${id}, with cta-close`);
    else if (!new RegExp(`(^|[^\\p{L}])${call.keyword}([^\\p{L}]|$)`, "u").test(String(sc.vars?.action_line ?? ""))) issues.push(`${id}: action_line must contain ${call.keyword} exactly, in capital letters`);
  }
  if (calls.size) {
    scenes.forEach((sc, i) => {
      if (sc?.component === "cta-close" && !calls.has(sc.from)) issues.push(`scene ${i + 1}: cta-close is only for the comment calls`);
    });
  }
  scenes.forEach((sc, i) => {
    const at = `scene ${i + 1}`;
    if (!sc || typeof sc !== "object") return issues.push(`${at}: not an object`);
    if (!componentMeta(sc.component)) return issues.push(`${at}: unknown component ${sc.component} (use one from the LIBRARY)`);
    if (off.includes(sc.component)) return issues.push(`${at}: ${sc.component} is turned off for this channel (use one from the LIBRARY)`);
    if (sc.vars !== undefined && (typeof sc.vars !== "object" || Array.isArray(sc.vars) || sc.vars === null)) return issues.push(`${at}: vars must be an object`);
    const vars = sc.vars ?? {};
    const { item } = loadComponent(sc.component, { env });
    issues.push(...checkVars(item, vars).map((e) => `${at}: ${e}`));
    try {
      mountTheme(vars);
    } catch (e) {
      issues.push(`${at}: ${e.message}`);
    }
    for (const id of HIDDEN_VARS) if (id in vars) issues.push(`${at}: do not set ${id}`);
    for (const l of onScreen(sc.component, vars, listIds(item))) {
      if (l.item ? words(l.text) > 3 : words(l.text) > MAX_WORDS) issues.push(`${at}: ${l.id} "${l.text}" is too long (at most ${l.item ? 3 : MAX_WORDS} words)`);
    }
    if (componentMeta(sc.component).realOnly) warnings.push(`Scene ${i + 1}: ${componentMeta(sc.component).label} shows a real person, record or quote. Check that it is real.`);
    for (const [id, max] of Object.entries(componentMeta(sc.component).words ?? {})) {
      if (typeof vars[id] === "string" && words(vars[id]) > max) issues.push(`${at}: ${sc.component} ${id} "${vars[id]}" is too long for this component (at most ${max} words)`);
    }
    if ((i > 0 ? scenes[i - 1]?.component : before) === sc.component) issues.push(`${at}: same component as the scene before (${sc.component}); pick another of its candidates`);
    if (sc.component === "whiteboard-ink" && (typeof sc.icon !== "string" || !sc.icon.trim())) issues.push(`${at}: a whiteboard sketch needs "icon": one to three words for the concrete thing to draw`);
    else if (sc.component === "whiteboard-ink" && sc.icon.trim().split(/\s+/).length > 4) issues.push(`${at}: "icon" "${sc.icon}" is too long (one to three words)`);
  });
  if (limit) {
    const count = {};
    for (const sc of scenes) count[sc.component] = (count[sc.component] ?? 0) + 1;
    for (const [c, n] of Object.entries(count)) if (n > limit && c !== "cta-close") issues.push(`${c} is used ${n} times, at most ${limit}: give some of those scenes another of their candidates`);
  }
  if (issues.length || !timing) return { issues, warnings };

  let times;
  try {
    times = sceneTimes(scenes, sentences, total);
  } catch (e) {
    return { issues: [e.message], warnings };
  }
  const index = new Map(sentences.map((s, i) => [s.id, i]));
  scenes.forEach((sc, i) => {
    const from = index.get(sc.from);
    const to = index.get(sc.to ?? sc.from);
    // A segment or the end-screen tail plays over the scene before it: that
    // time is not the scene's own (DECISIONS 78).
    const d = r3(times[i].duration - gaps.reduce((t, g) => t + Math.max(0, Math.min(g.end, times[i].start + times[i].duration) - Math.max(g.start, times[i].start)), 0));
    if (d < MIN_SECONDS && scenes.length > 1 && !calls.has(sc.from)) issues.push(`scene ${i + 1} (${sc.from}) lasts ${d} s, under ${MIN_SECONDS} s: join it with a neighbour`);
    if (d > maxJoined && to > from) issues.push(`scene ${i + 1} (${sc.from} to ${sc.to}) lasts ${d} s, over ${maxJoined} s: split it`);
    // Numbers on screen should be numbers the voice says. Written-out numbers
    // ("eight") are not recognised, so this only warns.
    if (roleOf(sc.component) === "proof") {
      const said = sentences.slice(from, to + 1).map((s) => s.text).join(" ");
      const shown = JSON.stringify(sc.vars ?? {}).match(/\d+(?:[.,]\d+)?/g) ?? [];
      for (const num of new Set(shown)) if (num !== "0" && !said.includes(num)) warnings.push(`Scene ${i + 1}: ${num} is not in the narration as a number. Check it.`);
    }
  });
  return { issues, warnings, times };
}

function readJson(projectDir, f, what) {
  const p = path.join(projectDir, f);
  if (!fs.existsSync(p)) throw new Error(`There is no ${what} yet.`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

// A scene under MIN_SECONDS of its own joins its neighbour before the check
// (Zoltan's test, 2026-10-05: a 1.85 s last sentence failed the whole table
// after the repair). It goes into the scene before it, or after it when the
// one before is a comment call. A call scene is never joined.
export function joinShort(answer, { sentences, total, calls = new Map(), gaps = [] }) {
  const scenes = answer?.scenes;
  if (!Array.isArray(scenes) || scenes.length < 2) return answer;
  let times;
  try {
    times = sceneTimes(scenes, sentences, total);
  } catch {
    return answer; // the check reports the structure
  }
  const own = (i) => times[i].duration - gaps.reduce((t, g) => t + Math.max(0, Math.min(g.end, times[i].start + times[i].duration) - Math.max(g.start, times[i].start)), 0);
  const out = scenes.map((sc) => ({ ...sc }));
  for (let i = out.length - 1; i >= 0; i--) {
    if (out.length < 2 || calls.has(out[i].from) || own(i) >= MIN_SECONDS) continue;
    const prev = out[i - 1];
    const next = out[i + 1];
    if (prev && !calls.has(prev.from)) {
      prev.to = out[i].to ?? out[i].from;
      out.splice(i, 1);
      times.splice(i, 1);
    } else if (next && !calls.has(next.from)) {
      next.from = out[i].from;
      out.splice(i, 1);
      times.splice(i, 1);
    }
  }
  return { ...answer, scenes: out };
}

// The user's own footage (footage/library.mjs, DECISIONS 82): the planner may
// lay a clip under one sentence or a few, matching what the clip shows to
// what is said. Never under a comment call, never two at once, never a clip
// it was not given.
export function footageIssues(list, { sentences, calls = new Map(), clips = [] }) {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list)) return ["footage must be an array"];
  if (!clips.length && list.length) return ["there is no footage: leave footage empty"];
  const ids = new Map(sentences.map((s, i) => [s.id, i]));
  const known = new Set(clips.map((c) => c.id));
  const issues = [];
  let last = -1;
  list.forEach((f, n) => {
    const at = `footage ${n + 1}`;
    if (!f || typeof f !== "object") return issues.push(`${at}: not an object`);
    if (!known.has(f.clip)) return issues.push(`${at}: unknown clip ${f.clip} (use an id from DATA footage)`);
    const from = ids.get(f.from);
    const to = ids.get(f.to ?? f.from);
    if (from === undefined || to === undefined || to < from) return issues.push(`${at}: from and to must be sentence ids in order`);
    if (from <= last) issues.push(`${at}: overlaps the footage before it`);
    for (let i = from; i <= to; i++) if (calls.has(sentences[i].id)) issues.push(`${at}: ${sentences[i].id} is a comment call, it keeps its own scene`);
    last = to;
  });
  return issues;
}

// The CTA segments and the end screen in the table (Zoltan, 2026-10-05: a
// video whose three calls were all his clips showed no call at all): each
// after the row it follows, with its keyword and clip name.
export function insertRows(projectDir, times) {
  let v;
  let script = null;
  try {
    v = JSON.parse(fs.readFileSync(path.join(projectDir, "audio", "voice.json"), "utf8"));
    script = readScript(projectDir);
  } catch {
    return [];
  }
  const after = (t) => times.reduce((k, x, i) => (x.start !== null && x.start <= t ? i : k), 0);
  const rows = (v.inserts ?? []).map((g) => ({ kind: "segment", slot: g.slot, keyword: g.keyword, temperature: g.temperature, name: (script?.segmentCalls ?? []).find((c) => c.slot === g.slot)?.name ?? null, start: g.start, seconds: g.seconds, after: after(g.start) }));
  if (v.endScreen) rows.push({ kind: "end", start: v.endScreen.start, seconds: v.endScreen.seconds, after: times.length - 1 });
  return rows;
}

// The segments and the end-screen tail in the recorded voice (voice gate).
export function gapsOf(projectDir) {
  try {
    const v = JSON.parse(fs.readFileSync(path.join(projectDir, "audio", "voice.json"), "utf8"));
    return [...(v.inserts ?? []).map((x) => ({ start: x.start, end: x.end })), ...(v.endScreen ? [{ start: v.endScreen.start, end: v.endScreen.start + v.endScreen.seconds }] : [])];
  } catch {
    return [];
  }
}

export async function audioLength(projectDir, sentences, env) {
  try {
    return r3(await duration(path.join(projectDir, "audio", "vo_bgm.mp3"), env));
  } catch {
    return r3((sentences[sentences.length - 1]?.end ?? 0) + 0.5);
  }
}

// Issues about taste, not about a working video. After the repairs they
// become warnings the table shows, so the step never fails on them.
// "No component twice in a row" is a hard rule since DECISIONS 130 (Zoltan,
// 2026-10-28: every video looked like the same slide deck); a scene a
// little over the longest length stays a taste issue.
const SOFT = [/over \d+ s: split it/];
export const isSoft = (issue) => SOFT.some((rx) => rx.test(issue));
export const REPAIRS = 2;

async function ask(llm, messages, check) {
  const read = (text) => {
    try {
      const answer = extractJson(text);
      return { answer, result: check(answer) };
    } catch (e) {
      return { answer: null, result: { issues: [`the answer was not valid JSON (${e.message})`], warnings: [] } };
    }
  };
  let text = await chat({ ...llm, messages, json: true, temperature: 0.4 });
  let { answer, result } = read(text);
  for (let n = 1; n <= REPAIRS && result.issues.length; n++) {
    llm.onProgress?.({ step: "repairing", round: n, of: REPAIRS, issues: result.issues.slice(0, 10) });
    messages.push({ role: "assistant", content: text });
    messages.push({ role: "user", content: `Fix these problems and answer with the corrected JSON object only:\n- ${result.issues.slice(0, 20).join("\n- ")}` });
    text = await chat({ ...llm, messages, json: true, temperature: 0.2 });
    ({ answer, result } = read(text));
  }
  if (result.issues.length && answer && result.issues.every(isSoft)) {
    result = { ...result, issues: [], warnings: [...(result.warnings ?? []), ...result.issues.map((i) => `${i[0].toUpperCase()}${i.slice(1)} (left as it is).`)] };
  }
  if (result.issues.length) {
    const err = new Error(`The scene table did not pass the checks after ${REPAIRS} repairs: ${result.issues.slice(0, 5).join("; ")}. Press Plan again, or use the Simple plan (no AI).`);
    err.issues = result.issues;
    throw err;
  }
  return { answer, result };
}

export const clean = (sc) => ({
  component: sc.component,
  from: sc.from,
  ...(sc.to && sc.to !== sc.from ? { to: sc.to } : {}),
  ...(sc.component === "whiteboard-ink" && typeof sc.icon === "string" && sc.icon.trim() ? { icon: sc.icon.trim().slice(0, 60) } : {}),
  vars: sc.vars ?? {},
  ...(sc.call ? { call: sc.call } : {}),
  // the planner's ranked candidates (the visual check swaps to the next one)
  // and its one line on why this one fits (DECISIONS 130)
  ...(Array.isArray(sc.candidates) && sc.candidates.length ? { candidates: sc.candidates.filter((c) => typeof c === "string").slice(0, 5) } : {}),
  ...(typeof sc.why === "string" && sc.why.trim() ? { why: sc.why.trim().slice(0, 200) } : {}),
});
// The comment call a scene shows (assemble colours its button by temperature).
export const withCalls = (scenes, calls) =>
  scenes.map((sc) => {
    const call = calls.get(sc.from);
    const { call: _old, ...rest } = sc;
    return call && sc.component === "cta-close" ? { ...rest, vars: { ...(rest.vars ?? {}), button_label: call.keyword }, call } : rest;
  });

export function writeTable(projectDir, table) {
  fs.writeFileSync(path.join(projectDir, "scenes.json"), JSON.stringify(table, null, 2) + "\n");
}

// ---- step one: the whole catalog, 3 to 5 candidates per scene ----------------

export const CANDIDATES = { min: 3, max: 5 };

export function shortlistMessages(data, entries, { pace, mix } = {}) {
  const system = fs.readFileSync(path.join(here, "prompt-shortlist.md"), "utf8").replace("{{PACE}}", paceOf(pace).rule).replace("{{MIX}}", mix || mixRule(MIX_PRESETS[DEFAULT_PRESET].mix));
  const user = `CATALOG\n${JSON.stringify({ roles: CATALOG_ROLES, components: entries }, null, 1)}\nEND CATALOG\n\nDATA\n${JSON.stringify(data, null, 1)}\nEND DATA\n\nPlan the scenes and their candidates now. Answer with the JSON object only.`;
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

// A comment call's only candidate is cta-close, whatever the answer said.
export function forceCalls(answer, calls) {
  for (const sc of Array.isArray(answer?.scenes) ? answer.scenes : []) {
    if (sc && calls.has(sc.from) && (sc.to ?? sc.from) === sc.from) sc.candidates = ["cta-close"];
  }
  return answer;
}

export function checkShortlist(answer, { sentences, total, allowed, calls = new Map(), gaps = [], pace }) {
  const scenes = answer?.scenes;
  if (!Array.isArray(scenes) || !scenes.length) return { issues: ["scenes must be a non-empty array"], warnings: [] };
  const issues = [];
  const known = new Set(allowed);
  scenes.forEach((sc, i) => {
    const at = `scene ${i + 1}`;
    if (!sc || typeof sc !== "object") return issues.push(`${at}: not an object`);
    const list = sc.candidates;
    if (!Array.isArray(list) || !list.length) return issues.push(`${at}: candidates must be a list of ${CANDIDATES.min} to ${CANDIDATES.max} components`);
    const call = calls.has(sc.from) && (sc.to ?? sc.from) === sc.from;
    if (!call && (list.length < CANDIDATES.min || list.length > CANDIDATES.max)) issues.push(`${at}: give ${CANDIDATES.min} to ${CANDIDATES.max} candidates, not ${list.length}`);
    if (new Set(list).size !== list.length) issues.push(`${at}: the candidates repeat a component`);
    for (const c of list) {
      if (!known.has(c)) issues.push(`${at}: ${c} is not in the CATALOG`);
      else if (c === "cta-close" && calls.size && !call) issues.push(`${at}: cta-close is only for the comment calls`);
    }
  });
  for (const [id, call] of calls) {
    const sc = scenes.find((x) => x?.from === id);
    if (!sc || (sc.to ?? sc.from) !== id) issues.push(`${id} is a comment call (${call.keyword}): give it a scene of its own, from ${id} to ${id}`);
  }
  if (issues.length) return { issues, warnings: [] };
  // coverage and lengths, with the first candidate standing in
  return timingIssues(scenes.map((sc) => ({ from: sc.from, to: sc.to, component: sc.candidates[0] })), { sentences, total, calls, gaps, pace });
}

// Coverage and scene lengths (the timing half of checkScenes).
function timingIssues(scenes, { sentences, total, calls = new Map(), gaps = [], pace }) {
  const maxJoined = paceOf(pace).joined;
  const issues = [];
  let times;
  try {
    times = sceneTimes(scenes, sentences, total);
  } catch (e) {
    return { issues: [e.message], warnings: [] };
  }
  const index = new Map(sentences.map((s, i) => [s.id, i]));
  scenes.forEach((sc, i) => {
    const from = index.get(sc.from);
    const to = index.get(sc.to ?? sc.from);
    const d = r3(times[i].duration - gaps.reduce((t, g) => t + Math.max(0, Math.min(g.end, times[i].start + times[i].duration) - Math.max(g.start, times[i].start)), 0));
    if (d < MIN_SECONDS && scenes.length > 1 && !calls.has(sc.from)) issues.push(`scene ${i + 1} (${sc.from}) lasts ${d} s, under ${MIN_SECONDS} s: join it with a neighbour`);
    if (d > maxJoined && to > from) issues.push(`scene ${i + 1} (${sc.from} to ${sc.to}) lasts ${d} s, over ${maxJoined} s: split it`);
  });
  return { issues, warnings: [], times };
}

// ---- step two: the full code of the candidates, one pick per scene ----------

// Step two goes in parts, so that one part's candidate code stays readable
// in one call: consecutive scenes until their candidates' code would pass
// CHUNK_CHARS (about 60 000 tokens), at most CHUNK_SCENES scenes.
export const CHUNK_CHARS = 240000;
export const CHUNK_SCENES = 10;
export function chooseChunks(scenes, codeLength) {
  const chunks = [];
  let part = [];
  let names = new Set();
  let size = 0;
  for (const sc of scenes) {
    const extra = sc.candidates.filter((c) => !names.has(c)).reduce((t, c) => t + codeLength(c), 0);
    if (part.length && (size + extra > CHUNK_CHARS || part.length >= CHUNK_SCENES)) {
      chunks.push(part);
      part = [];
      names = new Set();
      size = 0;
    }
    part.push(sc);
    for (const c of sc.candidates) {
      if (names.has(c)) continue;
      names.add(c);
      size += codeLength(c);
    }
  }
  if (part.length) chunks.push(part);
  return chunks;
}

const sceneSentences = (sc, sentences) => {
  const ids = sentences.map((s) => s.id);
  return sentences.slice(ids.indexOf(sc.from), ids.indexOf(sc.to ?? sc.from) + 1);
};

export function chooseMessages({ scenes, sentences, codes, data, previous = null, usedInVideo = {}, limit, env = process.env }) {
  const system = fs.readFileSync(path.join(here, "prompt-choose.md"), "utf8").replace("{{REPEAT}}", `A component appears at most ${limit} times in this video.`);
  const names = [...new Set(scenes.flatMap((sc) => sc.candidates))];
  const blocks = names.map((n) => {
    const e = entryOf(n, env) ?? {};
    const meta = componentMeta(n);
    const head = { component: n, role: e.role ?? meta?.role, shows: e.shows, weak: e.weak, ...(meta?.words ? { maxWords: meta.words } : {}) };
    return `### ${n}\n${JSON.stringify(head)}\n\`\`\`html\n${codes(n)}\n\`\`\``;
  });
  const said = new Map(data.sentences.map((s) => [s.id, s]));
  const dataBlock = {
    language: data.language,
    theme: data.theme,
    name: data.name,
    previous,
    usedInVideo,
    scenes: scenes.map((sc) => ({ from: sc.from, ...(sc.to && sc.to !== sc.from ? { to: sc.to } : {}), candidates: sc.candidates, sentences: sceneSentences(sc, sentences).map((s) => said.get(s.id)) })),
  };
  const user = `CANDIDATES\n${blocks.join("\n\n")}\nEND CANDIDATES\n\nDATA\n${JSON.stringify(dataBlock, null, 1)}\nEND DATA\n\nPick one component per scene now. Answer with the JSON object only.`;
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

// The code of a component as step two reads it.
function codeReader(env) {
  const memo = new Map();
  return (name) => {
    if (!memo.has(name)) memo.set(name, codeForPlanner(loadComponent(name, { env }).html));
    return memo.get(name);
  };
}

// Step two for one part: the picks, checked against that part's candidates,
// the scene before it, the use limit and every rule of checkScenes.
async function choosePart(llm, { part, sentences, codes, data, previous, usedInVideo, limit, env, off, calls }) {
  const messages = chooseMessages({ scenes: part, sentences, codes, data, previous, usedInVideo, limit, env });
  const covered = part.flatMap((sc) => sceneSentences(sc, sentences));
  const { answer } = await ask(llm, messages, (raw) => {
    const got = Array.isArray(raw?.scenes) ? raw.scenes : null;
    if (!got || got.length !== part.length) return { issues: [`answer with exactly ${part.length} scenes, one per scene of DATA, in order`], warnings: [] };
    const issues = [];
    got.forEach((sc, i) => {
      if (sc?.from !== part[i].from || (sc.to ?? sc.from) !== (part[i].to ?? part[i].from)) issues.push(`scene ${i + 1} must be from ${part[i].from}${part[i].to ? ` to ${part[i].to}` : ""}, as in DATA`);
      else if (!part[i].candidates.includes(sc.component)) issues.push(`scene ${i + 1}: ${sc.component} is not one of its candidates (${part[i].candidates.join(", ")})`);
    });
    if (issues.length) return { issues, warnings: [] };
    const counts = { ...usedInVideo };
    for (const sc of got) counts[sc.component] = (counts[sc.component] ?? 0) + 1;
    for (const [c, n] of Object.entries(counts)) {
      if (n > limit && c !== "cta-close" && got.some((sc) => sc.component === c)) issues.push(`${c} would be used ${n} times in this video, at most ${limit}: give some of these scenes another of their candidates`);
    }
    const r = checkScenes({ scenes: got }, { sentences: covered, env, off, calls, timing: false, before: previous });
    return { ...r, issues: [...issues, ...r.issues] };
  });
  return answer.scenes.map((sc, i) => ({ ...sc, from: part[i].from, to: part[i].to, candidates: part[i].candidates }));
}

// Gate 3, Recommended. llm = { provider, apiKey, model, fetchImpl?, sleep? }.
// identityDir and videoId: the channel's history (history.mjs), read for
// variety and written with this video's picks.
export async function makeScenes({ llm, projectDir, env = process.env, language = "en", name = null, themeIsLight = false, off = [], footage = null, pace, mix = null, identityDir = null, videoId = null, onProgress = () => {} }) {
  const sentences = readJson(projectDir, "sentences.json", "sentence table (make the voice first)");
  const md = fs.existsSync(path.join(projectDir, "script.md")) ? fs.readFileSync(path.join(projectDir, "script.md"), "utf8") : "";
  const total = await audioLength(projectDir, sentences, env);
  const calls = callSentences(readScript(projectDir), sentences);
  const data = buildData({ sentences, sections: sentenceSections(md, sentences), name, themeIsLight, language, calls });
  const clips = footage ? catalogForPlanner(footage) : [];
  if (clips.length) data.footage = clips;
  const gaps = gapsOf(projectDir);
  const video = videoId ?? path.basename(projectDir);
  const allowed = plannableNames({ env, off });
  const entries = catalogEntries({ env, off, uses: recentUses(identityDir, video) });

  // step one: the whole catalog, the candidates
  onProgress({ step: "planning", provider: llm.provider, part: "shortlist", components: entries.length });
  const first = await ask({ ...llm, onProgress }, shortlistMessages(data, entries, { pace, mix: mix ? mixRule(mix, { pictures: clips.length > 0, video: clips.length > 0 }) : null }), (a) => {
    const joined = forceCalls(joinShort(a, { sentences, total, calls, gaps }), calls);
    const r = checkShortlist(joined, { sentences, total, allowed, calls, gaps, pace });
    return { ...r, issues: [...r.issues, ...footageIssues(a?.footage, { sentences, calls, clips })] };
  });
  const shortlist = forceCalls(joinShort(first.answer, { sentences, total, calls, gaps }), calls).scenes;
  const limit = maxUses(shortlist.length);

  // step two: the candidates' code, one pick per scene
  const codes = codeReader(env);
  const chunks = chooseChunks(shortlist, (c) => codes(c).length);
  const picked = [];
  const usedInVideo = {};
  for (const [k, part] of chunks.entries()) {
    onProgress({ step: "choosing", part: k + 1, of: chunks.length, provider: llm.provider });
    const got = await choosePart({ ...llm, onProgress }, { part, sentences, codes, data, previous: picked.at(-1)?.component ?? null, usedInVideo: { ...usedInVideo }, limit, env, off, calls });
    for (const sc of got) {
      picked.push(sc);
      usedInVideo[sc.component] = (usedInVideo[sc.component] ?? 0) + 1;
    }
  }

  const final = checkScenes({ scenes: picked }, { sentences, total, env, off, calls, gaps, pace, limit });
  const hard = final.issues.filter((i) => !isSoft(i));
  if (hard.length) {
    const err = new Error(`The scene table did not pass the checks: ${hard.slice(0, 5).join("; ")}. Press Plan again, or use the Simple plan (no AI).`);
    err.issues = hard;
    throw err;
  }
  const warnings = [...first.result.warnings, ...final.warnings, ...final.issues.filter(isSoft).map((i) => `${i[0].toUpperCase()}${i.slice(1)} (left as it is).`)];
  const gapList = Array.isArray(first.answer.gaps) ? first.answer.gaps.filter((g) => g && typeof g.need === "string").map((g) => ({ at: String(g.at ?? ""), need: g.need.slice(0, 200) })) : [];
  const previousTable = fs.existsSync(path.join(projectDir, "scenes.json")) ? readJson(projectDir, "scenes.json", "") : {};
  const footageList = clips.length && first.answer.footage?.length ? { footage: first.answer.footage.map((f) => ({ from: f.from, ...(f.to && f.to !== f.from ? { to: f.to } : {}), clip: f.clip })) } : {};
  const scenes = withCalls(picked.map(clean), calls);
  writeTable(projectDir, { ...(previousTable.theme ? { theme: previousTable.theme } : {}), scenes, ...footageList, gaps: gapList, warnings, planner: { steps: 2, parts: chunks.length, catalog: entries.length } });
  recordHistory(identityDir, video, scenes);
  return { scenes: scenes.length, gaps: gapList, warnings, parts: chunks.length };
}

// The price of planning, shown before it runs. The parts of step two depend
// on the candidates the AI picks, so they are estimated from the catalog:
// about 4 candidates a scene, about half of them shared with a neighbour.
const avgCodeCache = new Map();
function averageCode(env, names) {
  const key = names.join(",");
  if (!avgCodeCache.has(key)) {
    const codes = codeReader(env);
    const sizes = names
      .map((n) => {
        try {
          return codes(n).length;
        } catch {
          return 0;
        }
      })
      .filter(Boolean);
    avgCodeCache.set(key, sizes.length ? sizes.reduce((a, b) => a + b, 0) / sizes.length : 20000);
  }
  return avgCodeCache.get(key);
}

export function estimateScenes({ projectDir, llm, env = process.env, off = [] }) {
  const sentences = readJson(projectDir, "sentences.json", "sentence table (make the voice first)");
  const entries = catalogEntries({ env, off });
  const scenes = Math.max(1, Math.ceil(sentences.length * 0.8));
  const prompts = fs.readFileSync(path.join(here, "prompt-shortlist.md"), "utf8").length + fs.readFileSync(path.join(here, "prompt-choose.md"), "utf8").length;
  const sentenceChars = sentences.reduce((t, s) => t + String(s.text).length + 60, 0);
  const firstIn = tokensOf(prompts + JSON.stringify(entries).length + sentenceChars);
  const secondIn = tokensOf(scenes * 4 * 0.55 * averageCode(env, plannableNames({ env, off })) + sentenceChars * 1.3);
  // a repair round now and then
  const tokensIn = Math.round((firstIn + secondIn) * 1.25);
  const tokensOut = Math.round(scenes * (40 + 110) * 1.25);
  return { ...estimateUsd({ provider: llm.provider, model: llm.model, effort: llm.effort, tokensIn, tokensOut }), scenes, catalog: entries.length };
}

// One scene filled with one given component: step two with that single
// candidate (a swap in the table, a change asked for, the visual check).
export async function fillScene({ llm, sc, component, sentences, env = process.env, language = "en", name = null, themeIsLight = false, previous = null, next = null, wish = "" }) {
  const covered = sceneSentences(sc, sentences);
  const data = buildData({ sentences: covered, name, themeIsLight, language });
  const part = [{ from: sc.from, to: sc.to, candidates: [component] }];
  const messages = chooseMessages({ scenes: part, sentences: covered, codes: codeReader(env), data, previous, limit: 99, env });
  if (wish) messages[1].content += `\n\nThe current scene is ${sc.component} with ${JSON.stringify(sc.vars ?? {})}. The video's owner asks for this change to it (their own words; follow them within the rules above, the on-screen text still comes from the sentences):\n${wish}`;
  const { answer } = await ask(llm, messages, (raw) => {
    const a = raw && Array.isArray(raw.scenes) ? { ...raw, scenes: raw.scenes.slice(0, 1).map((x) => ({ ...x, from: sc.from, to: sc.to, component })) } : raw;
    const r = checkScenes(a, { sentences: covered, env, timing: false, before: previous });
    if (!r.issues.length && next && a.scenes[0].component === next) r.issues.push("the scene after uses the same component");
    return r;
  });
  return { ...answer.scenes[0], from: sc.from, to: sc.to, component };
}

// One scene's price with one component: its code and its sentences.
export function estimateFill({ llm, component, env = process.env, scenes = 1 }) {
  const code = codeReader(env)(component).length;
  const prompt = fs.readFileSync(path.join(here, "prompt-choose.md"), "utf8").length;
  return estimateUsd({ provider: llm.provider, model: llm.model, effort: llm.effort, tokensIn: tokensOf((code + prompt + 800) * scenes * 1.25), tokensOut: 150 * scenes });
}

// Default: the plan without AI (simple.mjs), checked like the AI's plan.
export async function simpleScenes({ projectDir, env = process.env, title = "", themeIsLight = false, off = [], pace }) {
  const sentences = readJson(projectDir, "sentences.json", "sentence table (make the voice first)");
  const md = fs.existsSync(path.join(projectDir, "script.md")) ? fs.readFileSync(path.join(projectDir, "script.md"), "utf8") : "";
  const total = await audioLength(projectDir, sentences, env);
  const calls = callSentences(readScript(projectDir), sentences);
  const gaps = gapsOf(projectDir);
  const answer = joinShort(simplePlan({ sentences, sections: sentenceSections(md, sentences), title, calls, off, themeIsLight, pace }), { sentences, total, calls, gaps });
  const { issues, warnings } = checkScenes(answer, { sentences, total, env, off, calls, gaps, pace });
  if (issues.length) throw new Error(`The simple plan did not pass the checks: ${issues.slice(0, 5).join("; ")}`);
  const previous = fs.existsSync(path.join(projectDir, "scenes.json")) ? readJson(projectDir, "scenes.json", "") : {};
  writeTable(projectDir, { ...(previous.theme ? { theme: previous.theme } : {}), scenes: withCalls(answer.scenes.map(clean), calls), gaps: [], warnings });
  return { scenes: answer.scenes.length, gaps: [], warnings };
}

// Custom: the user's edited table, checked the same way (no LLM).
export async function saveScenes({ projectDir, scenes, env = process.env, pace }) {
  const sentences = readJson(projectDir, "sentences.json", "sentence table");
  const total = await audioLength(projectDir, sentences, env);
  const calls = callSentences(readScript(projectDir), sentences);
  const { issues, warnings } = checkScenes({ scenes }, { sentences, total, env, calls, gaps: gapsOf(projectDir), pace });
  if (issues.length) throw new Error(`The scene table has problems: ${issues.slice(0, 5).join("; ")}`);
  const current = readJson(projectDir, "scenes.json", "scene table");
  writeTable(projectDir, { ...current, scenes: withCalls(scenes.map(clean), calls), warnings });
  return { scenes: scenes.length, warnings };
}

// Swap one row for another component (same role), or change it as the user
// asks in their own words. With a component, step two fills that one from
// its code; with only the user's words, step one first picks 3 to 5
// candidates for this scene from the catalog (never the neighbours' and
// never the comment-call scene), then step two picks one of them.
export async function refillScene({ llm, projectDir, index, component, request = "", env = process.env, language = "en", name = null, themeIsLight = false, off = [] }) {
  const table = readJson(projectDir, "scenes.json", "scene table");
  const sentences = readJson(projectDir, "sentences.json", "sentence table");
  const sc = table.scenes[index];
  if (!sc) throw new Error(`There is no scene ${index + 1}.`);
  const wish = String(request ?? "").trim().slice(0, 500);
  if (!component && !wish) throw new Error("Pick a scene type or say what to change.");
  if (component && !componentMeta(component)) throw new Error(`Unknown component: ${component}`);
  if (component && !wish && roleOf(component) !== roleOf(sc.component) && !(sc.candidates ?? []).includes(component)) throw new Error("Swap only within the same role, or to one of the planner's candidates.");
  if (sc.call) throw new Error(`This scene is the comment call ${sc.call.keyword}: it always shows the keyword.`);
  if (component && off.includes(component)) throw new Error("That scene type is turned off in the Motion profile.");
  const previous = table.scenes[index - 1]?.component ?? null;
  const next = table.scenes[index + 1]?.component ?? null;
  let pick = component;
  let candidates = sc.candidates;
  if (!pick) {
    const ids = sentences.map((s) => s.id);
    const covered = sentences.slice(ids.indexOf(sc.from), ids.indexOf(sc.to ?? sc.from) + 1);
    const allowed = plannableNames({ env, off }).filter((c) => c !== "cta-close" && c !== previous && c !== next);
    const entries = catalogEntries({ env, off }).filter((e) => allowed.includes(e.component));
    const messages = shortlistMessages(buildData({ sentences: covered, name, themeIsLight, language }), entries);
    messages[1].content += `\n\nThis is ONE scene of a longer video: answer with exactly one scene, from ${sc.from}${sc.to ? ` to ${sc.to}` : ""}, and its 3 to 5 candidates. Ignore the rules about the first and the last scene. The current scene is ${sc.component} with ${JSON.stringify(sc.vars ?? {})}. The video's owner asks for this change (their own words; follow them within the rules above, the on-screen text still comes from the sentences):\n${wish}`;
    const { answer } = await ask(llm, messages, (raw) => {
      const one = raw && Array.isArray(raw.scenes) ? { scenes: raw.scenes.slice(0, 1).map((x) => ({ ...x, from: sc.from, to: sc.to })) } : raw;
      return checkShortlist(one, { sentences: covered, total: r3(covered[covered.length - 1].end + 0.3), allowed });
    });
    candidates = answer.scenes[0].candidates;
    const codes = codeReader(env);
    const data = buildData({ sentences: covered, name, themeIsLight, language });
    const chosen = await choosePart(llm, { part: [{ from: sc.from, to: sc.to, candidates }], sentences: covered, codes, data, previous, usedInVideo: {}, limit: 99, env, off, calls: new Map() });
    pick = chosen[0].component;
    if (pick === next) throw new Error("The scene after uses the same component. Ask again.");
    const scenes = table.scenes.map((s, i) => (i === index ? clean({ ...chosen[0], from: sc.from, to: sc.to }) : s));
    writeTable(projectDir, { ...table, scenes });
    return { scene: scenes[index] };
  }
  if (pick === previous) throw new Error("The scene before uses the same component. Pick another one.");
  if (pick === next) throw new Error("The scene after uses the same component. Pick another one.");
  const filled = await fillScene({ llm, sc, component: pick, sentences, env, language, name, themeIsLight, previous, next, wish });
  const scenes = table.scenes.map((s, i) => (i === index ? clean({ ...filled, candidates: candidates ?? [pick] }) : s));
  writeTable(projectDir, { ...table, scenes });
  return { scene: scenes[index] };
}

// The table as the UI shows it: times, what is said, the component in plain
// words, the editable text, and the swap choices.
export async function sceneRows(projectDir, { env = process.env, off = [] } = {}) {
  if (!fs.existsSync(path.join(projectDir, "scenes.json"))) return { rows: [], gaps: [], warnings: [] };
  const table = readJson(projectDir, "scenes.json", "scene table");
  const sentences = readJson(projectDir, "sentences.json", "sentence table");
  const total = await audioLength(projectDir, sentences, env);
  let times = [];
  try {
    times = sceneTimes(table.scenes, sentences, total);
  } catch {
    times = table.scenes.map(() => ({ start: null, duration: null }));
  }
  const ids = sentences.map((s) => s.id);
  const gaps = gapsOf(projectDir);
  const own = (i) => (times[i].duration === null ? null : r3(times[i].duration - gaps.reduce((t, g) => t + Math.max(0, Math.min(g.end, times[i].start + times[i].duration) - Math.max(g.start, times[i].start)), 0)));
  const rows = table.scenes.map((sc, i) => {
    const meta = componentMeta(sc.component) ?? { role: null, label: sc.component, mainVar: null };
    return {
      index: i,
      from: sc.from,
      to: sc.to ?? sc.from,
      start: times[i].start,
      duration: own(i),
      said: sentences.slice(ids.indexOf(sc.from), ids.indexOf(sc.to ?? sc.from) + 1).map((s) => s.text).join(" "),
      component: sc.component,
      label: meta.label,
      role: meta.role,
      roleLabel: ROLES[meta.role]?.label ?? "",
      mainVar: meta.mainVar,
      mainText: meta.mainVar ? (sc.vars?.[meta.mainVar] ?? null) : null,
      shows: onScreen(sc.component, sc.vars).map((l) => l.text).join(" / "),
      call: sc.call ?? null,
      footage: (table.footage ?? []).find((f) => ids.indexOf(f.from) <= ids.indexOf(sc.to ?? sc.from) && ids.indexOf(f.to ?? f.from) >= ids.indexOf(sc.from))?.clip ?? null,
      why: sc.why ?? null,
      swappedFrom: sc.swappedFrom ?? [],
      // the planner's other candidates first, then the rest of the role
      // (block packs are never offered: DECISIONS 130, registry only)
      alternatives: [
        ...(sc.candidates ?? []).filter((c) => !sc.call && c !== sc.component && COMPONENTS[c] && !COMPONENTS[c].retired && !off.includes(c)).map((c) => ({ component: c, label: COMPONENTS[c].label, candidate: true })),
        ...Object.entries(COMPONENTS)
          .filter(([c, m]) => !sc.call && m.role === meta.role && c !== sc.component && !(sc.candidates ?? []).includes(c) && !off.includes(c) && !m.retired)
          .map(([c, m]) => ({ component: c, label: m.label })),
      ],
    };
  });
  return { rows, gaps: table.gaps ?? [], warnings: table.warnings ?? [], scenes: table.scenes, inserts: insertRows(projectDir, times) };
}
