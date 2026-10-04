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
  return Object.entries(COMPONENTS).filter(([name]) => !off.includes(name)).map(([name, meta]) => {
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

export function buildData({ sentences, sections = [], name = null, themeIsLight = false, language = "en" }) {
  return {
    language,
    name,
    theme: themeIsLight ? "light" : "dark",
    sentences: sentences.map((s, i) => ({ id: s.id, seconds: s.dur ?? r3(s.end - s.start), section: sections[i] || null, text: s.text })),
  };
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
export function checkScenes(answer, { sentences, total, env = process.env, off = [] }) {
  const issues = [];
  const warnings = [];
  const scenes = answer?.scenes;
  if (!Array.isArray(scenes) || !scenes.length) return { issues: ["scenes must be a non-empty array"], warnings };
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
    const d = times[i].duration;
    if (d < MIN_SECONDS && scenes.length > 1) issues.push(`scene ${i + 1} (${sc.from}) lasts ${d} s, under ${MIN_SECONDS} s: join it with a neighbour`);
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

async function audioLength(projectDir, sentences, env) {
  try {
    return r3(await duration(path.join(projectDir, "audio", "vo_bgm.mp3"), env));
  } catch {
    return r3((sentences[sentences.length - 1]?.end ?? 0) + 0.5);
  }
}

async function ask(llm, messages, check) {
  let text = await chat({ ...llm, messages, json: true, temperature: 0.4 });
  let answer;
  let result;
  try {
    answer = extractJson(text);
    result = check(answer);
  } catch (e) {
    result = { issues: [`the answer was not valid JSON (${e.message})`], warnings: [] };
  }
  if (!result.issues.length) return { answer, result };
  llm.onProgress?.({ step: "repairing", issues: result.issues.slice(0, 10) });
  messages.push({ role: "assistant", content: text });
  messages.push({ role: "user", content: `Fix these problems and answer with the corrected JSON object only:\n- ${result.issues.slice(0, 20).join("\n- ")}` });
  text = await chat({ ...llm, messages, json: true, temperature: 0.2 });
  try {
    answer = extractJson(text);
    result = check(answer);
  } catch (e) {
    result = { issues: [`the answer was not valid JSON (${e.message})`], warnings: [] };
  }
  if (result.issues.length) {
    const err = new Error(`The scene table did not pass the checks after one repair: ${result.issues.slice(0, 5).join("; ")}`);
    err.issues = result.issues;
    throw err;
  }
  return { answer, result };
}

const clean = (sc) => ({ component: sc.component, from: sc.from, ...(sc.to && sc.to !== sc.from ? { to: sc.to } : {}), vars: sc.vars ?? {} });

export function writeTable(projectDir, table) {
  fs.writeFileSync(path.join(projectDir, "scenes.json"), JSON.stringify(table, null, 2) + "\n");
}

// Gate 3, Recommended. llm = { provider, apiKey, model, fetchImpl?, sleep? }.
export async function makeScenes({ llm, projectDir, env = process.env, language = "en", name = null, themeIsLight = false, off = [], onProgress = () => {} }) {
  const sentences = readJson(projectDir, "sentences.json", "sentence table (make the voice first)");
  const md = fs.existsSync(path.join(projectDir, "script.md")) ? fs.readFileSync(path.join(projectDir, "script.md"), "utf8") : "";
  const total = await audioLength(projectDir, sentences, env);
  const catalog = libraryCatalog({ env, off });
  const data = buildData({ sentences, sections: sentenceSections(md, sentences), name, themeIsLight, language });
  onProgress({ step: "planning", provider: llm.provider });
  const { answer, result } = await ask({ ...llm, onProgress }, buildMessages(data, catalog), (a) => checkScenes(a, { sentences, total, env, off }));
  const gaps = Array.isArray(answer.gaps) ? answer.gaps.filter((g) => g && typeof g.need === "string").map((g) => ({ at: String(g.at ?? ""), need: g.need.slice(0, 200) })) : [];
  const previous = fs.existsSync(path.join(projectDir, "scenes.json")) ? readJson(projectDir, "scenes.json", "") : {};
  writeTable(projectDir, { ...(previous.theme ? { theme: previous.theme } : {}), scenes: answer.scenes.map(clean), gaps, warnings: result.warnings });
  return { scenes: answer.scenes.length, gaps, warnings: result.warnings };
}

// Custom: the user's edited table, checked the same way (no LLM).
export async function saveScenes({ projectDir, scenes, env = process.env }) {
  const sentences = readJson(projectDir, "sentences.json", "sentence table");
  const total = await audioLength(projectDir, sentences, env);
  const { issues, warnings } = checkScenes({ scenes }, { sentences, total, env });
  if (issues.length) throw new Error(`The scene table has problems: ${issues.slice(0, 5).join("; ")}`);
  const current = readJson(projectDir, "scenes.json", "scene table");
  writeTable(projectDir, { ...current, scenes: scenes.map(clean), warnings });
  return { scenes: scenes.length, warnings };
}

// Swap one row for another component (same role): the LLM fills in only that
// scene's variables, from that scene's sentences.
export async function refillScene({ llm, projectDir, index, component, env = process.env, language = "en", name = null, themeIsLight = false, off = [] }) {
  const table = readJson(projectDir, "scenes.json", "scene table");
  const sentences = readJson(projectDir, "sentences.json", "sentence table");
  const sc = table.scenes[index];
  if (!sc) throw new Error(`There is no scene ${index + 1}.`);
  if (!COMPONENTS[component]) throw new Error(`Unknown component: ${component}`);
  if (roleOf(component) !== roleOf(sc.component)) throw new Error("Swap only within the same role.");
  if (off.includes(component)) throw new Error("That scene type is turned off in the Motion profile.");
  const ids = sentences.map((s) => s.id);
  const covered = sentences.slice(ids.indexOf(sc.from), ids.indexOf(sc.to ?? sc.from) + 1);
  const catalog = libraryCatalog({ env }).filter((c) => c.name === component);
  const data = buildData({ sentences: covered, name, themeIsLight, language });
  const messages = buildMessages(data, catalog);
  messages[1].content += `\n\nThis is ONE scene of a longer video: answer with exactly one scene, from ${sc.from}${sc.to ? ` to ${sc.to}` : ""}, component ${component}. Ignore the rules about the first and the last scene.`;
  const total = r3(covered[covered.length - 1].end + 0.3);
  const check = (a) => {
    const r = checkScenes(a, { sentences: covered, total, env });
    if (!r.issues.length && (a.scenes.length !== 1 || a.scenes[0].component !== component)) r.issues.push(`answer with exactly one scene using ${component}`);
    return r;
  };
  const { answer } = await ask(llm, messages, check);
  const scenes = table.scenes.map((s, i) => (i === index ? clean({ ...answer.scenes[0], from: sc.from, to: sc.to }) : s));
  if (index > 0 && scenes[index - 1].component === component) throw new Error("The scene before uses the same component. Pick another one.");
  if (scenes[index + 1]?.component === component) throw new Error("The scene after uses the same component. Pick another one.");
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
  const rows = table.scenes.map((sc, i) => {
    const meta = COMPONENTS[sc.component] ?? { role: null, label: sc.component, mainVar: null };
    return {
      index: i,
      from: sc.from,
      to: sc.to ?? sc.from,
      start: times[i].start,
      duration: times[i].duration,
      said: sentences.slice(ids.indexOf(sc.from), ids.indexOf(sc.to ?? sc.from) + 1).map((s) => s.text).join(" "),
      component: sc.component,
      label: meta.label,
      role: meta.role,
      roleLabel: ROLES[meta.role]?.label ?? "",
      mainVar: meta.mainVar,
      mainText: meta.mainVar ? (sc.vars?.[meta.mainVar] ?? null) : null,
      shows: onScreen(sc.component, sc.vars).map((l) => l.text).join(" / "),
      alternatives: Object.entries(COMPONENTS)
        .filter(([c, m]) => m.role === meta.role && c !== sc.component && !off.includes(c))
        .map(([c, m]) => ({ component: c, label: m.label })),
    };
  });
  return { rows, gaps: table.gaps ?? [], warnings: table.warnings ?? [], scenes: table.scenes };
}
