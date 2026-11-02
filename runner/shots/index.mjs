// shots/index.mjs: the Shot map (docs/BUILD_PLAN.md phase 3), a stage after the
// voice. It needs no AI: from the word times and the scene table it makes every
// row a shot that starts on the exact word its main text is spoken, cuts a long
// template row at a pause, and says for each shot what it shows, how long, which
// camera, which change, and whether it is a hero moment.
//
// It works on the same scenes.json the build reads, through three fields on a row:
//   at    the shot's start, the start of a word, when it is not its sentence's start
//   cut   a plain cut into this shot: no transition inside a sentence
//   camera  "off": a shot too short for a camera move
// A row with no `template`, or marked `override`, is a block the user or the catalog
// plan chose: it stays that block, only its start can move to its word.
//
// shots.json is the map as the Shot map tab shows it, made again from the table,
// the B-roll plan and the word times. Nothing is ever only in there, except the
// Google Flow slots in shots-flow.json.

import fs from "node:fs";
import path from "node:path";
import { loadComponent, readWords, sceneTimes, speechCues } from "../gates/build/assemble.mjs";
import { audioLength, callSentences, checkScenes, gapsOf, isSoft, listIds, MIN_SECONDS, onScreen, readScript, writeTable } from "../gates/scenes/index.mjs";
import { componentMeta, paceOf } from "../gates/scenes/roles.mjs";
import { ruleScene } from "../gates/scenes/templates.mjs";
import { resolveTemplates } from "../presets/index.mjs";
import { attach, BROLL_SCHEMA, loadPlan, savePlan, voBytes } from "../broll/index.mjs";
import { addClip, footageDir, incomingFootage, loadLibrary } from "../footage/library.mjs";
import { logTableFootage, LICENSES } from "../assets/license.mjs";
import { promptRefusal } from "../generate/kie.mjs";
import { aspectOf } from "../generate/index.mjs";
import { STOP } from "../stock/index.mjs";

export const SHOTS_SCHEMA = "itv-shot-map/1";
export const SHOTS_FILE = "shots.json";
export const FLOW_FILE = "shots-flow.json";
export const FLOW_MODEL = "Veo (Google Flow)";
// A start this close to the row's own start is already on its word.
const ON_WORD = 0.25;
// A pause this long between two words is a place to cut.
const PAUSE = 0.2;
const SHORT_FOR_CAMERA = 2.5;
// A long sentence often has no comma: a clause starts at one of these.
const CLAUSE = /^(and|but|because|so|then|while|when|before|after|which|és|de|mert|hogy|amikor|mielőtt|miután|ami|aki)$/;
const r3 = (x) => Math.round(x * 1000) / 1000;
const norm = (w) => String(w).toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]/gu, "");
const readJson = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
};

// ---- which word ---------------------------------------------------------------------

/** The first word of `said` that speaks this text's first real word. Pure. */
export function wordFor(text, said) {
  const parts = String(text).split(/\s+/).map(norm).filter(Boolean);
  const want = parts.find((p) => p.length >= 3 || /\d/.test(p)) ?? parts[0];
  if (!want) return null;
  const stem = want.slice(0, Math.max(3, Math.min(want.length, 5)));
  return said.find((w) => {
    const got = norm(w.text);
    if (/^\d/.test(want)) return got === want || got.startsWith(want);
    return got === want || (got.length >= 3 && got.startsWith(stem));
  }) ?? null;
}

// Not text on screen: icon names and what only marks a word already shown.
const NOT_ELEMENT = /^(l|r)?ico\d*$|^layout$|^emphasis_word$|^underline_word$|^mark$|^cues$/;

/** What a row puts on screen, in order: text and numbers. */
export function elementsOf(sc, { env = process.env } = {}) {
  let lists;
  try {
    lists = listIds(loadComponent(sc.component, { env }).item);
  } catch {
    lists = undefined;
  }
  const lines = onScreen(sc.component, sc.vars ?? {}, lists).filter((l) => !NOT_ELEMENT.test(l.id));
  const numbers = Object.entries(sc.vars ?? {}).filter(([, v]) => typeof v === "number" && v !== 0).map(([id, v]) => ({ id, text: String(v) }));
  return [...numbers, ...lines];
}

const spanOf = (words, start, end) => words.filter((w) => w.start >= start - 0.05 && w.start < end);
const sentenceAt = (sentences, t) => {
  let found = 0;
  sentences.forEach((s, i) => {
    if (s.start <= t + 0.001) found = i;
  });
  return found;
};

// ---- the rows -----------------------------------------------------------------------

// Where this row may be cut: after a comma or a pause, or where a sentence starts,
// with enough time on both sides. The place nearest the middle wins. Null: nowhere.
export function cutPlace(said, { start, end, after = start, sentences = [], min = MIN_SECONDS }) {
  const starts = new Set(sentences.map((s) => r3(s.start)));
  const middle = (start + end) / 2;
  let best = null;
  said.forEach((w, i) => {
    if (i === 0) return;
    const before = said[i - 1];
    const place = /[,;:.!?]$/.test(String(before.text)) || w.start - before.end >= PAUSE || starts.has(r3(w.start)) || CLAUSE.test(norm(w.text));
    if (!place || w.start - start < min || end - w.start < min || w.start < after) return;
    if (!best || Math.abs(w.start - middle) < Math.abs(best.start - middle)) best = w;
  });
  return best;
}

/**
 * The table's rows as shots. Pure but for reading the components. Returns new rows;
 * `ctx`: { sentences, words, total, templates, calls, pace, title, env }.
 */
export function shotRows(rows, ctx) {
  const { sentences, words, total, templates = [], calls = new Map(), pace, title = "", env = process.env } = ctx;
  const { longest, joined } = paceOf(pace);
  const byId = Object.fromEntries(templates.map((t) => [t.id, t]));
  const ids = sentences.map((s) => s.id);
  const out = rows.map((r) => ({ ...r }));
  const isCall = (r) => calls.has(r.from) || r.component === "cta-close";
  const fixed = (r) => !r.template || r.override;
  const timesOf = () => sceneTimes(out, sentences, total);

  // 1. A row starts on the word of its main text; the shot before it holds until then.
  for (let n = 1; n < out.length; n++) {
    const row = out[n];
    const prev = out[n - 1];
    if (isCall(row) || isCall(prev)) continue;
    const times = timesOf();
    const start = times[n].start;
    const end = start + times[n].duration;
    const main = elementsOf(row, { env })[0];
    const word = main ? wordFor(main.text, spanOf(words, start, end)) : null;
    if (!word || word.start - start < ON_WORD || end - word.start < MIN_SECONDS) continue;
    const at = sentenceAt(sentences, word.start);
    if (at > ids.indexOf(row.to ?? row.from)) continue;
    // The shot before would hold too long: the words up to this one get a shot of
    // their own, by rule. Too short for that, or nothing fits: the row stays put.
    if (word.start - times[n - 1].start > joined) {
      if (word.start - start < MIN_SECONDS) continue;
      const before = spanOf(words, start, word.start).map((w) => w.text).join(" ");
      const firstAt = ids.indexOf(row.from);
      let filler = null;
      for (let turn = 0; turn < 4 && !filler; turn++) {
        const tried = ruleScene({ byId, sentences: [{ id: ids[firstAt], text: before }], previous: prev.component, turn: n + turn, first: false, title });
        if (tried && tried.component !== row.component) filler = tried;
      }
      if (!filler) continue;
      const midSentence = word.start > sentences[at].start + 0.05;
      const last = midSentence ? ids[at] : ids[at - 1];
      const { to: _to, ...rest } = filler;
      out.splice(n, 0, { ...rest, from: ids[firstAt], ...(last !== ids[firstAt] ? { to: last } : {}) });
      row.from = ids[at];
      if (ids.indexOf(row.to ?? row.from) === at) delete row.to;
      row.at = r3(word.start);
      if (midSentence) row.cut = true;
      n++;
      continue;
    }
    row.from = ids[at];
    if (ids.indexOf(row.to ?? row.from) === at) delete row.to;
    prev.to = ids[at - 1] ?? prev.to;
    if (prev.to === prev.from) delete prev.to;
    row.at = r3(word.start);
    // inside a sentence the picture changes on a cut, never on a transition
    if (word.start > sentences[at].start + 0.05) row.cut = true;
  }

  // 2. A template row over the pace's longest shot is cut at a pause, and the new
  // shot is filled by rule from its own words.
  for (let n = 0; n < out.length; n++) {
    const row = out[n];
    if (isCall(row) || fixed(row)) continue;
    const times = timesOf();
    const start = times[n].start;
    const end = start + times[n].duration;
    if (times[n].duration <= longest) continue;
    const said = spanOf(words, start, end);
    const main = elementsOf(row, { env })[0];
    const mainWord = main ? wordFor(main.text, said) : null;
    const place = cutPlace(said, { start, end, after: (mainWord?.start ?? start) + MIN_SECONDS, sentences });
    if (!place) continue;
    const text = said.filter((w) => w.start >= place.start).map((w) => w.text).join(" ");
    const atSentence = sentenceAt(sentences, place.start);
    const next = out[n + 1]?.component ?? null;
    let piece = null;
    for (let turn = 0; turn < 4 && !piece; turn++) {
      const tried = ruleScene({ byId, sentences: [{ id: ids[atSentence], text }], previous: row.component, turn: n + turn, first: false, title });
      if (tried && tried.component !== next) piece = tried;
    }
    if (!piece) continue;
    const onStart = Math.abs(place.start - sentences[atSentence].start) <= 0.05;
    const to = row.to ?? row.from;
    const second = { ...piece, from: ids[atSentence], ...(ids[atSentence] !== to ? { to } : {}), ...(onStart ? {} : { at: r3(place.start), cut: true }) };
    if (second.to === undefined) delete second.to;
    const lastOfFirst = onStart ? ids[atSentence - 1] : ids[atSentence];
    if (lastOfFirst === row.from) delete row.to;
    else row.to = lastOfFirst;
    out.splice(n + 1, 0, second);
    // the new shot can be long too: this loop reaches it next
  }

  // 3. A shot too short for a camera move stands still.
  const times = timesOf();
  out.forEach((row, n) => {
    if (times[n].duration < SHORT_FOR_CAMERA || isCall(row)) row.camera = "off";
    else delete row.camera;
  });
  return out;
}

/**
 * Makes the shots of a video on its scene table. Never stops the video: a result
 * that does not pass the table's checks leaves the table as it was, and says so.
 */
export async function makeShotMap({ projectDir, identityDir = null, preset, off = [], title = "", env = process.env }) {
  const tableFile = path.join(projectDir, "scenes.json");
  const table = readJson(tableFile, null);
  if (!table?.scenes?.length) throw new Error("There is no scene table yet. Plan the scenes first.");
  const sentences = JSON.parse(fs.readFileSync(path.join(projectDir, "sentences.json"), "utf8"));
  const words = readWords(projectDir);
  const total = await audioLength(projectDir, sentences, env);
  const calls = callSentences(readScript(projectDir), sentences);
  const pace = preset?.shotRules?.pacing;
  const templates = preset ? resolveTemplates(preset, { off, env }) : [];
  let scenes = table.scenes;
  let warning = null;
  if (words.length) {
    try {
      const rows = shotRows(table.scenes, { sentences, words, total, templates, calls, pace, title, env });
      const { issues } = checkScenes({ scenes: rows }, { sentences, total, env, off, calls, gaps: gapsOf(projectDir), pace });
      const hard = issues.filter((i) => !isSoft(i));
      if (hard.length) warning = `The shots stayed on their sentences: ${hard.slice(0, 2).join("; ")}.`;
      else scenes = rows;
    } catch (e) {
      warning = `The shots stayed on their sentences: ${String(e.message).slice(0, 200)}`;
    }
  } else warning = "This voice has no word times, so the shots stay on their sentences.";
  writeTable(projectDir, { ...table, scenes });
  return writeShotMap({ projectDir, identityDir, env, warning });
}

// ---- the map as the tab shows it --------------------------------------------------------

const flowOf = (projectDir) => readJson(path.join(projectDir, FLOW_FILE), {});
const saveFlow = (projectDir, flow) => fs.writeFileSync(path.join(projectDir, FLOW_FILE), JSON.stringify(flow, null, 2) + "\n");

/** A ready prompt for one shot, in plain words, with its exact length. Pure. */
export function flowPrompt({ said = "", seconds = 5, prompt = "" }) {
  const base = String(prompt).trim() || `A clear view of ${[...new Set((said.toLowerCase().match(/\p{L}{3,}/gu) ?? []).filter((w) => !STOP.has(w)))].slice(0, 6).join(" ") || "the scene"}, one continuous shot, one slow camera move, soft natural light, natural colours, nobody close to the camera, no text, no logos`;
  return `${base.replace(/[.\s]+$/, "")}. 16:9, ${Math.ceil(seconds)} seconds.`;
}

const SOURCE = { archive: "Public domain film", still: "Free still, moved in 2.5D", pixabay: "Pixabay", ai: "Paid AI clip", flow: "Google Flow (Veo), own generation" };

/** The map, made from what is on disk. Writes nothing. */
export async function shotMapView({ projectDir, env = process.env, warning = null }) {
  const table = readJson(path.join(projectDir, "scenes.json"), null);
  const sentences = readJson(path.join(projectDir, "sentences.json"), null);
  if (!table?.scenes?.length || !sentences?.length) return { schema: SHOTS_SCHEMA, shots: [], summary: null, warning };
  const words = readWords(projectDir);
  const total = await audioLength(projectDir, sentences, env);
  let times;
  try {
    times = sceneTimes(table.scenes, sentences, total);
  } catch (e) {
    return { schema: SHOTS_SCHEMA, shots: [], summary: null, warning: String(e.message) };
  }
  const ids = sentences.map((s) => s.id);
  const plan = loadPlan(projectDir);
  const items = plan && !plan.stale ? plan.items.filter((i) => i.use) : [];
  const flow = flowOf(projectDir);
  const shots = table.scenes.map((sc, n) => {
    const start = times[n].start;
    const end = start + times[n].duration;
    const span = spanOf(words, start, end);
    const said = span.length ? span.map((w) => w.text).join(" ") : sentences.slice(ids.indexOf(sc.from), ids.indexOf(sc.to ?? sc.from) + 1).map((s) => s.text).join(" ");
    const a = ids.indexOf(sc.from);
    const b = ids.indexOf(sc.to ?? sc.from);
    const overlaps = (i) => ids.indexOf(i.from) <= b && ids.indexOf(i.to ?? i.from) >= a;
    const item = items.find((i) => overlaps(i) && i.state === "done" && i.clip) ?? items.find((i) => overlaps(i));
    const live = item?.state === "done" && item.clip;
    const cues = speechCues(sc, span, start, end);
    const entrances = elementsOf(sc, { env }).map((el, k) => {
      const word = wordFor(el.text, span);
      if (!word) return { text: el.text, word: null, at: null, how: "not-said" };
      const onStart = word.start - start < ON_WORD;
      const how = el.item && cues ? "cue" : onStart || k === 0 ? "shot" : "block";
      return { text: el.text, word: word.text, at: r3(word.start), how };
    });
    const key = `${sc.from}@${r3(start)}`;
    const slot = flow[key] ?? null;
    const meta = componentMeta(sc.component);
    return {
      id: key,
      n: n + 1,
      from: sc.from,
      to: sc.to ?? sc.from,
      start: r3(start),
      seconds: r3(times[n].duration),
      said,
      kind: live ? "broll" : "graphic",
      block: meta?.label ?? sc.component,
      override: !sc.template || !!sc.override,
      call: !!sc.call,
      camera: live ? (item.source === "still" || item.aiTier === "image" ? `2.5D ${item.move ?? "move"}` : "As filmed") : sc.camera === "off" ? "Still" : "The channel's move",
      transition: sc.cut ? "Cut, inside a sentence" : n === 0 ? "None, the first shot" : "The channel's change",
      hero: !!item?.hero,
      source: live ? SOURCE[item.source] ?? item.source : null,
      license: live ? item.license ?? null : null,
      paid: item?.paidWanted ? { tier: item.paidTier ?? "image" } : null,
      entrances,
      flow: slot ? { on: !!slot.on, prompt: slot.prompt, seconds: r3(times[n].duration), clip: slot.clip ?? null, name: slot.name ?? null, short: !!slot.short } : null,
    };
  });
  const all = shots.flatMap((s) => s.entrances);
  return {
    schema: SHOTS_SCHEMA,
    voBytes: voBytes(projectDir),
    shots,
    summary: { shots: shots.length, broll: shots.filter((s) => s.kind === "broll").length, hero: shots.filter((s) => s.hero).length, overrides: shots.filter((s) => s.override).length, elements: all.length, onTheirWord: all.filter((e) => e.how === "shot" || e.how === "cue").length, withBlock: all.filter((e) => e.how === "block").length },
    warning,
  };
}

/** shots.json: the map as it stands, kept with the video. */
export async function writeShotMap({ projectDir, env = process.env, warning = null }) {
  const view = await shotMapView({ projectDir, env, warning });
  fs.writeFileSync(path.join(projectDir, SHOTS_FILE), JSON.stringify({ ...view, at: new Date().toISOString() }, null, 2) + "\n");
  return view;
}

// ---- the Google Flow slot (optional, off by default) --------------------------------------

/** On or off for one shot, and its prompt. Off takes its clip out of the video. */
export async function setFlow({ projectDir, identityDir = null, id, on, prompt, env = process.env }) {
  const view = await shotMapView({ projectDir, env });
  const shot = view.shots.find((s) => s.id === id);
  if (!shot) throw new Error("This shot is not in the map any more. Open the Shot map again.");
  const flow = flowOf(projectDir);
  const slot = flow[id] ?? {};
  if (typeof prompt === "string") {
    const clean = prompt.replace(/\s+/g, " ").trim().slice(0, 2000);
    const why = promptRefusal(clean);
    if (why) throw new Error(why);
    slot.prompt = clean;
  }
  if (typeof on === "boolean") {
    slot.on = on;
    if (on && !slot.prompt) {
      const planned = loadPlan(projectDir)?.items.find((i) => i.from === shot.from && i.prompt)?.prompt ?? "";
      slot.prompt = flowPrompt({ said: shot.said, seconds: shot.seconds, prompt: planned });
    }
    if (!on && slot.clip) {
      const plan = loadPlan(projectDir);
      const item = plan?.items.find((i) => i.clip === slot.clip && i.source === "flow");
      if (item) {
        item.use = false;
        savePlan(projectDir, plan);
        attach(projectDir);
        if (identityDir) logTableFootage({ projectDir, table: readJson(path.join(projectDir, "scenes.json"), {}), clips: loadLibrary(identityDir).clips });
      }
      delete slot.clip;
      delete slot.name;
      delete slot.short;
    }
  }
  flow[id] = slot;
  saveFlow(projectDir, flow);
  return writeShotMap({ projectDir, env });
}

/** The user's own mp4 for one shot: into the footage library, under the shot, in the ledger. */
export async function addFlowClip({ projectDir, identityDir, id, file, env = process.env, now = new Date() }) {
  if (!identityDir) throw new Error("No channel to keep the clip in.");
  const view = await shotMapView({ projectDir, env });
  const shot = view.shots.find((s) => s.id === id);
  const flow = flowOf(projectDir);
  const slot = flow[id];
  if (!shot || !slot?.on) throw new Error("Switch the Google Flow slot on for this shot first.");
  if (!/\.(mp4|mov|webm|m4v)$/i.test(String(file))) throw new Error("Choose the video file from Google Flow (an mp4).");
  if (!fs.existsSync(file)) throw new Error("That file is not there any more. Choose it again.");
  const dir = footageDir(identityDir);
  fs.mkdirSync(dir, { recursive: true });
  const incoming = incomingFootage(path.extname(file).toLowerCase());
  fs.copyFileSync(file, path.join(dir, incoming));
  const date = now.toISOString().slice(0, 10);
  const clip = await addClip({
    identityDir,
    file: incoming,
    name: `Google Flow: ${shot.said}`.slice(0, 80),
    description: slot.prompt.slice(0, 400),
    source: "flow",
    credit: { source: LICENSES["own-generation"], sourceId: "flow", licenseKey: "own-generation", license: LICENSES["own-generation"], author: "Own generation", model: FLOW_MODEL, prompt: slot.prompt, date, at: now.toISOString() },
    env,
  });
  const before = loadPlan(projectDir);
  const table = readJson(path.join(projectDir, "scenes.json"), {});
  const plan = before && !before.stale ? before : { schema: BROLL_SCHEMA, auto: true, voBytes: voBytes(projectDir), aspect: aspectOf(table), spentUsd: before?.spentUsd ?? 0, items: [], finished: true, at: now.toISOString(), plannedBy: "user" };
  const ids = readJson(path.join(projectDir, "sentences.json"), []).map((s) => s.id);
  const a = ids.indexOf(shot.from);
  const b = ids.indexOf(shot.to);
  // one clip per stretch: this one replaces what was planned over the same sentences
  for (const i of plan.items) if (ids.indexOf(i.from) <= b && ids.indexOf(i.to ?? i.from) >= a) i.use = false;
  plan.items.push({ id: `f${plan.items.length + 1}`, scene: shot.n - 1, from: shot.from, to: shot.to, at: shot.start, until: r3(shot.start + shot.seconds), said: shot.said, start: shot.start, seconds: shot.seconds, order: shot.seconds, query: "", hero: shot.hero, prompt: slot.prompt, library: null, use: true, state: "done", attempt: 0, source: "flow", clip: clip.id, usd: 0, license: LICENSES["own-generation"], sourceUrl: null, author: "Own generation", checked: false });
  savePlan(projectDir, plan);
  attach(projectDir);
  logTableFootage({ projectDir, table: readJson(path.join(projectDir, "scenes.json"), {}), clips: loadLibrary(identityDir).clips });
  slot.clip = clip.id;
  slot.name = path.basename(file);
  slot.short = clip.seconds < shot.seconds - 0.05;
  flow[id] = slot;
  saveFlow(projectDir, flow);
  return writeShotMap({ projectDir, env });
}
