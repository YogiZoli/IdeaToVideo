// gates/scenes: gate 3, the scene table. The approved narration is already cut
// into sentences (timing/sentences.mjs); the LLM plans one scene per sentence
// or group of sentences: a library component and its variables. The answer is
// checked (coverage, lengths, variables, on-screen text) and one repair call is
// allowed before the gate fails (SPEC 5). The result is scenes.json, which the
// assembler turns into build/.
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
import { ROLES, COMPONENTS, roleOf } from "./roles.mjs";
import { CALL_FIELDS } from "../script/index.mjs";
import { catalogForPlanner } from "../../footage/library.mjs";
import { simplePlan } from "./simple.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

export const MIN_SECONDS = 2;
export const MAX_SECONDS = 12;
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
  });
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

function readScript(projectDir) {
  const p = path.join(projectDir, "script.json");
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
}

export function buildMessages(data, catalog) {
  const system = fs.readFileSync(path.join(here, "prompt.md"), "utf8");
  const library = catalog.map((c) => ({ component: c.name, role: c.role, what: c.description, ...(c.maxWords ? { maxWords: c.maxWords } : {}), variables: c.variables }));
  const roles = Object.fromEntries(Object.entries(ROLES).map(([id, r]) => [id, r.hint]));
  const user = `LIBRARY\n${JSON.stringify({ roles, components: library }, null, 1)}\nEND LIBRARY\n\nDATA\n${JSON.stringify(data, null, 1)}\nEND DATA\n\nPlan the scenes now. Answer with the JSON object only.`;
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

const words = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;

// The strings a viewer reads, per component: one line of text, or list items.
function onScreen(component, vars = {}) {
  const lines = [];
  for (const [id, v] of Object.entries(vars)) {
    if (typeof v !== "string" || !v.trim()) continue;
    if (["items", "nodes", "options", "labels"].includes(id)) lines.push(...v.split(",").map((x) => ({ id, text: x.trim(), item: true })));
    else if (!["type", "split", "style", "rule", "sketch", "pen", "orientation", "data", "unit", "prefix", "suffix", "url"].includes(id)) lines.push({ id, text: v });
  }
  return lines;
}

// Every problem with a planned table, as sentences the repair call can act on.
// `warnings` do not fail the gate; the UI shows them.
export function checkScenes(answer, { sentences, total, env = process.env, off = [], calls = new Map(), gaps = [] }) {
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
    if (!COMPONENTS[sc.component]) return issues.push(`${at}: unknown component ${sc.component} (use one from the LIBRARY)`);
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
    for (const l of onScreen(sc.component, vars)) {
      if (l.item ? words(l.text) > 3 : words(l.text) > MAX_WORDS) issues.push(`${at}: ${l.id} "${l.text}" is too long (at most ${l.item ? 3 : MAX_WORDS} words)`);
    }
    for (const [id, max] of Object.entries(COMPONENTS[sc.component].words ?? {})) {
      if (typeof vars[id] === "string" && words(vars[id]) > max) issues.push(`${at}: ${sc.component} ${id} "${vars[id]}" is too long for this component (at most ${max} words)`);
    }
    if (i > 0 && scenes[i - 1]?.component === sc.component) issues.push(`${at}: same component as the scene before (${sc.component})`);
  });
  if (issues.length) return { issues, warnings };

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
    if (d > MAX_SECONDS && to > from) issues.push(`scene ${i + 1} (${sc.from} to ${sc.to}) lasts ${d} s, over ${MAX_SECONDS} s: split it`);
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

async function audioLength(projectDir, sentences, env) {
  try {
    return r3(await duration(path.join(projectDir, "audio", "vo_bgm.mp3"), env));
  } catch {
    return r3((sentences[sentences.length - 1]?.end ?? 0) + 0.5);
  }
}

// Issues about taste, not about a working video: the same scene type twice in
// a row, a scene a little over the longest length. After the repairs they
// become warnings the table shows, so the step never fails on them (Zoltan's
// test, 2026-10-05: "same component as the scene before" failed the table).
const SOFT = [/same component as the scene before/, /over \d+ s: split it/];
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

const clean = (sc) => ({ component: sc.component, from: sc.from, ...(sc.to && sc.to !== sc.from ? { to: sc.to } : {}), vars: sc.vars ?? {}, ...(sc.call ? { call: sc.call } : {}) });
// The comment call a scene shows (assemble colours its button by temperature).
const withCalls = (scenes, calls) =>
  scenes.map((sc) => {
    const call = calls.get(sc.from);
    const { call: _old, ...rest } = sc;
    return call && sc.component === "cta-close" ? { ...rest, vars: { ...(rest.vars ?? {}), button_label: call.keyword }, call } : rest;
  });

export function writeTable(projectDir, table) {
  fs.writeFileSync(path.join(projectDir, "scenes.json"), JSON.stringify(table, null, 2) + "\n");
}

// Gate 3, Recommended. llm = { provider, apiKey, model, fetchImpl?, sleep? }.
export async function makeScenes({ llm, projectDir, env = process.env, language = "en", name = null, themeIsLight = false, off = [], footage = null, onProgress = () => {} }) {
  const sentences = readJson(projectDir, "sentences.json", "sentence table (make the voice first)");
  const md = fs.existsSync(path.join(projectDir, "script.md")) ? fs.readFileSync(path.join(projectDir, "script.md"), "utf8") : "";
  const total = await audioLength(projectDir, sentences, env);
  const catalog = libraryCatalog({ env, off });
  const calls = callSentences(readScript(projectDir), sentences);
  const data = buildData({ sentences, sections: sentenceSections(md, sentences), name, themeIsLight, language, calls });
  const clips = footage ? catalogForPlanner(footage) : [];
  if (clips.length) data.footage = clips;
  onProgress({ step: "planning", provider: llm.provider });
  const { answer, result } = await ask({ ...llm, onProgress }, buildMessages(data, catalog), (a) => {
    const r = checkScenes(joinShort(a, { sentences, total, calls, gaps: gapsOf(projectDir) }), { sentences, total, env, off, calls, gaps: gapsOf(projectDir) });
    return { ...r, issues: [...r.issues, ...footageIssues(a?.footage, { sentences, calls, clips })] };
  });
  const gaps = Array.isArray(answer.gaps) ? answer.gaps.filter((g) => g && typeof g.need === "string").map((g) => ({ at: String(g.at ?? ""), need: g.need.slice(0, 200) })) : [];
  const previous = fs.existsSync(path.join(projectDir, "scenes.json")) ? readJson(projectDir, "scenes.json", "") : {};
  writeTable(projectDir, { ...(previous.theme ? { theme: previous.theme } : {}), scenes: withCalls(joinShort(answer, { sentences, total, calls, gaps: gapsOf(projectDir) }).scenes.map(clean), calls), ...(clips.length && answer.footage?.length ? { footage: answer.footage.map((f) => ({ from: f.from, ...(f.to && f.to !== f.from ? { to: f.to } : {}), clip: f.clip })) } : {}), gaps, warnings: result.warnings });
  return { scenes: joinShort(answer, { sentences, total, calls, gaps: gapsOf(projectDir) }).scenes.length, gaps, warnings: result.warnings };
}

// Default: the plan without AI (simple.mjs), checked like the AI's plan.
export async function simpleScenes({ projectDir, env = process.env, title = "", themeIsLight = false, off = [] }) {
  const sentences = readJson(projectDir, "sentences.json", "sentence table (make the voice first)");
  const md = fs.existsSync(path.join(projectDir, "script.md")) ? fs.readFileSync(path.join(projectDir, "script.md"), "utf8") : "";
  const total = await audioLength(projectDir, sentences, env);
  const calls = callSentences(readScript(projectDir), sentences);
  const gaps = gapsOf(projectDir);
  const answer = joinShort(simplePlan({ sentences, sections: sentenceSections(md, sentences), title, calls, off, themeIsLight }), { sentences, total, calls, gaps });
  const { issues, warnings } = checkScenes(answer, { sentences, total, env, off, calls, gaps });
  if (issues.length) throw new Error(`The simple plan did not pass the checks: ${issues.slice(0, 5).join("; ")}`);
  const previous = fs.existsSync(path.join(projectDir, "scenes.json")) ? readJson(projectDir, "scenes.json", "") : {};
  writeTable(projectDir, { ...(previous.theme ? { theme: previous.theme } : {}), scenes: withCalls(answer.scenes.map(clean), calls), gaps: [], warnings });
  return { scenes: answer.scenes.length, gaps: [], warnings };
}

// Custom: the user's edited table, checked the same way (no LLM).
export async function saveScenes({ projectDir, scenes, env = process.env }) {
  const sentences = readJson(projectDir, "sentences.json", "sentence table");
  const total = await audioLength(projectDir, sentences, env);
  const calls = callSentences(readScript(projectDir), sentences);
  const { issues, warnings } = checkScenes({ scenes }, { sentences, total, env, calls, gaps: gapsOf(projectDir) });
  if (issues.length) throw new Error(`The scene table has problems: ${issues.slice(0, 5).join("; ")}`);
  const current = readJson(projectDir, "scenes.json", "scene table");
  writeTable(projectDir, { ...current, scenes: withCalls(scenes.map(clean), calls), warnings });
  return { scenes: scenes.length, warnings };
}

// Swap one row for another component (same role): the LLM fills in only that
// scene's variables, from that scene's sentences.
export async function refillScene({ llm, projectDir, index, component, request = "", env = process.env, language = "en", name = null, themeIsLight = false, off = [] }) {
  const table = readJson(projectDir, "scenes.json", "scene table");
  const sentences = readJson(projectDir, "sentences.json", "sentence table");
  const sc = table.scenes[index];
  if (!sc) throw new Error(`There is no scene ${index + 1}.`);
  const wish = String(request ?? "").trim().slice(0, 500);
  if (!component && !wish) throw new Error("Pick a scene type or say what to change.");
  if (component && !COMPONENTS[component]) throw new Error(`Unknown component: ${component}`);
  if (component && !wish && roleOf(component) !== roleOf(sc.component)) throw new Error("Swap only within the same role.");
  if (sc.call) throw new Error(`This scene is the comment call ${sc.call.keyword}: it always shows the keyword.`);
  if (component && off.includes(component)) throw new Error("That scene type is turned off in the Motion profile.");
  const ids = sentences.map((s) => s.id);
  const covered = sentences.slice(ids.indexOf(sc.from), ids.indexOf(sc.to ?? sc.from) + 1);
  // With the user's words and no type: any type except the neighbours' (never
  // the same twice in a row) and the comment-call scene.
  const neighbours = [table.scenes[index - 1]?.component, table.scenes[index + 1]?.component];
  const catalog = component
    ? libraryCatalog({ env }).filter((c) => c.name === component)
    : libraryCatalog({ env, off }).filter((c) => c.name !== "cta-close" && !neighbours.includes(c.name));
  const data = buildData({ sentences: covered, name, themeIsLight, language });
  const messages = buildMessages(data, catalog);
  messages[1].content += `\n\nThis is ONE scene of a longer video: answer with exactly one scene, from ${sc.from}${sc.to ? ` to ${sc.to}` : ""}${component ? `, component ${component}` : ", with the component from the LIBRARY that best fits the request below"}. Ignore the rules about the first and the last scene.`;
  if (wish) {
    messages[1].content += `\n\nThe current scene is ${sc.component} with ${JSON.stringify(sc.vars ?? {})}. The video's owner asks for this change to it (their own words; follow them within the rules above, the on-screen text still comes from the sentences):\n${wish}`;
  }
  const total = r3(covered[covered.length - 1].end + 0.3);
  const check = (raw) => {
    // one scene is asked for; a second one in the answer is not this scene's problem
    const a = raw && Array.isArray(raw.scenes) ? { ...raw, scenes: raw.scenes.slice(0, 1) } : raw;
    const r = checkScenes(a, { sentences: covered, total, env, gaps: gapsOf(projectDir) });
    if (!r.issues.length && a.scenes.length !== 1) r.issues.push("answer with exactly one scene");
    else if (!r.issues.length && component && a.scenes[0].component !== component) r.issues.push(`answer with exactly one scene using ${component}`);
    else if (!r.issues.length && !catalog.some((c) => c.name === a.scenes[0].component)) r.issues.push(`use one of: ${catalog.map((c) => c.name).join(", ")}`);
    return r;
  };
  const { answer } = await ask(llm, messages, check);
  const scenes = table.scenes.map((s, i) => (i === index ? clean({ ...answer.scenes[0], from: sc.from, to: sc.to, call: sc.call }) : s));
  const chosen = scenes[index].component;
  if (index > 0 && scenes[index - 1].component === chosen) throw new Error("The scene before uses the same component. Pick another one.");
  if (scenes[index + 1]?.component === chosen) throw new Error("The scene after uses the same component. Pick another one.");
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
    const meta = COMPONENTS[sc.component] ?? { role: null, label: sc.component, mainVar: null };
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
      alternatives: Object.entries(COMPONENTS)
        .filter(([c, m]) => !sc.call && m.role === meta.role && c !== sc.component && !off.includes(c) && !m.retired)
        .map(([c, m]) => ({ component: c, label: m.label })),
    };
  });
  return { rows, gaps: table.gaps ?? [], warnings: table.warnings ?? [], scenes: table.scenes, inserts: insertRows(projectDir, times) };
}
