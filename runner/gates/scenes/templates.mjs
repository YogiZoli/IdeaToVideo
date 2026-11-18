// gates/scenes/templates.mjs: planning a video from a style preset's templates
// (docs/BUILD_PLAN.md, DECISIONS 134). The LLM only outputs scene JSON that
// fills the templates: a prompt of about a thousand tokens, one short part of
// the script at a time, so a small free model handles it. Its answer is never
// trusted: every part is walked sentence by sentence, whatever is missing,
// wrong or too long is mended by rule, and one that needed too much mending is
// asked once more. A part the AI cannot answer at all is planned by rule, so a
// video can always be made. The result is the same scenes.json the catalog
// plan writes; preview, build and render do not know the difference.

import fs from "node:fs";
import path from "node:path";
import { chat, extractJson } from "../../providers/llm.mjs";
import { paceOf } from "./roles.mjs";
import { callSentences, checkScenes, joinShort, isSoft, gapsOf, writeTable, audioLength, readScript, clean, withCalls, sentenceSections, MAX_WORDS, MIN_SECONDS } from "./index.mjs";
import { callLine, simplePlan } from "./simple.mjs";
import { recordHistory } from "./history.mjs";
import { CLOCK, DATE, YEAR, whenIn } from "./when.mjs";
import { resolveTemplates } from "../../presets/index.mjs";
import { estimateUsd, tokensOf } from "../../providers/prices.mjs";

// One call plans this many sentences at most: short enough for any model.
export const PART_SENTENCES = 24;
// More of a part's scenes than this mended by rule: the AI is asked once more.
const ASK_AGAIN_SHARE = 0.34;

export { whenIn };

const wordsOf = (t) => String(t).replace(/[^\p{L}\p{N}'’ %$.,:-]+/gu, " ").split(/\s+/).map((w) => w.replace(/^[.,:-]+|[.,:-]+$/g, "")).filter(Boolean);
const lengthOf = (s) => s.dur ?? s.end - s.start;
const cap = (text, max) => wordsOf(text).slice(0, max).join(" ");
// A preset that asks a question on screen keeps its question mark, when the whole text fits.
const capFor = (template, text, max) => {
  // and a line it has to cut does not stop on a word that needs the next one
  const out = template?.objects && wordsOf(text).length > max ? headlineOf(text, max) : cap(text, max);
  return template?.objects && out && /\?\s*$/.test(String(text)) && wordsOf(text).length <= max ? `${out}?` : out;
};
const longest = (ws) => ws.reduce((best, w) => (w.length > best.length ? w : best), "");

// ---- the prompt ------------------------------------------------------------------

export function templateList(templates) {
  const kind = (p) => (p.type === "number" ? " (number)" : p.type === "object" ? " (one of OBJECTS)" : p.type === "place" ? " (a country or big city the sentence names)" : ` (max ${p.maxWords} words)`);
  const list = templates
    .map((t) => `${t.id}: ${t.when} Params: ${Object.entries(t.params).map(([id, p]) => `${id}${p.required ? "" : "?"}${kind(p)}`).join(", ")}`)
    .join("\n");
  const objects = templates.find((t) => t.objects)?.objects;
  return objects ? `${list}\n\nOBJECTS (what the scene shows, pick what the sentence is about)\n${objects.map((o) => o.id).join(", ")}` : list;
}

export function planMessages({ templates, sentences, title = "", language = "en", pace, previous = null, shotRules = {}, note = "" }) {
  const rule = paceOf(pace).rule;
  const list = sentences.map((s) => `${s.id} (${Math.round(lengthOf(s) * 10) / 10}s): ${s.text}`).join("\n");
  return [
    {
      role: "system",
      content: `You plan the scenes of a video by filling templates. Answer with one JSON object only: {"scenes":[{"from":"S1","to":"S2","template":"statement","params":{"line1":"...","line2":"..."}}]}.
Rules:
- Cover every sentence, in order, with no gaps. "to" is the last sentence of the scene.
- ${rule} ${shotRules.cutFrequency ?? ""}
- Never use the same template twice in a row.
- Every on-screen text uses the words of its own sentences, in ${language}. Keep it short.
- A number on screen must be a number the sentence says, written in digits.
- Only the templates below. Only their params.

TEMPLATES
${templateList(templates)}`,
    },
    {
      role: "user",
      content: `Video: ${title}\n${previous ? `The scene before this part used: ${previous}\n` : ""}SENTENCES\n${list}${note ? `\n\nYour last answer had these problems, fix them:\n${note}` : ""}`,
    },
  ];
}

// ---- mending ---------------------------------------------------------------------

// The number a sentence says in digits, with what stands around it: "$5",
// "40%". Null when it says none.
export function numberIn(text) {
  const m = /(\$)?(\d[\d,]*(?:\.\d+)?)\s*(%|percent\b|[kKmMbB]\b)?/.exec(String(text));
  if (!m) return null;
  const value = Number(m[2].replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;
  return { value, before: m[1] ?? "", after: m[3]?.toLowerCase() === "percent" ? "%" : (m[3] ?? "") };
}

const wordKey = (w) => String(w).toLowerCase().normalize("NFC").replace(/[^\p{L}\p{N}]/gu, "");
const plain = (w) => wordKey(w).replace(/(es|s)$/, "");

/** What a text is about, from a preset's objects: the matches in the order they are said. Pure. */
export function objectsIn(text, objects = []) {
  const out = [];
  for (const raw of wordsOf(text)) {
    const w = wordKey(raw);
    const hit = objects.find((o) => (o.words ?? []).some((x) => x === w || x === plain(raw)));
    if (hit && !out.some((x) => x.object.id === hit.id)) out.push({ object: hit, word: raw });
  }
  return out;
}

/** A word a preset never puts on screen (`never` in its preset.json). The voice may still say it. Pure. */
export function neverIn(text, never) {
  if (!never) return false;
  return wordsOf(text).some((raw) => {
    const w = wordKey(raw);
    return (never.words ?? []).includes(w) || (never.stems ?? []).some((s) => w.startsWith(s));
  });
}

// What a rule made, without what may not go on screen: an optional line stays out, and a
// template that cannot do without it is not this sentence's template.
function offScreen(template, params) {
  if (!params || !template.never) return params;
  const out = { ...params };
  for (const [id, value] of Object.entries(params)) {
    const p = template.params?.[id];
    if (!p || p.type === "object" || p.type === "place" || p.type === "number" || !neverIn(value, template.never)) continue;
    if (p.required) return null;
    delete out[id];
  }
  return out;
}

// The sentence without what the stamp already says, so the line under it adds something.
function restOf(said, when, where) {
  const words = [when.raw, where?.word].filter(Boolean).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  let rest = said;
  for (const w of words) rest = rest.replace(new RegExp(`(?:\\b(?:on|in|at|by|around|since|from|of)\\s+)?${w}[,.]?`, "i"), " ");
  return rest.replace(/^[\s,.]+/, "").replace(/\s+/g, " ").trim();
}

// A list the sentence says: "a receipt, a key and a torn note". Null when it says none.
const ARTICLE = /^(a|an|the|his|her|their|one|two|three|egy|az)\s+/i;
function listIn(text) {
  const parts = String(text).replace(/[.!?]+\s*$/, "").split(/,\s*(?:and\s+|or\s+|és\s+)?|\s+(?:and|és)\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  const items = parts.map((p, i) => {
    // the first one starts with the sentence around it
    const ws = wordsOf(p);
    return (i === 0 ? ws.slice(-2).join(" ") : ws.join(" ")).replace(ARTICLE, "");
  });
  return items.slice(1).every((x) => wordsOf(x).length <= 3) ? items.slice(0, 4) : null;
}

// A name as a sentence writes it: a Hungarian one takes an ending (Párizsban, Angliából).
const PLACE_ENDINGS = /^(?:'s|’s|ban|ben|ba|be|ból|ből|ról|ről|ra|re|nak|nek|hoz|hez|höz|tól|től|ig|on|en|ön|n|i)$/;
const LETTERS = /[\p{L}\p{N}]/u;

/**
 * The places a text names, in the order it says them, from a preset's list. A name is written
 * with its capital, so "turkey" on a plate and "reading" are not places. Pure.
 */
export function placesIn(text, places = []) {
  const said = String(text);
  const hits = [];
  for (const place of places) {
    for (const word of place.words ?? []) {
      // a Hungarian name's last a or e lengthens before an ending
      const stems = /[ae]$/.test(word) ? [word, word.slice(0, -1) + (word.endsWith("a") ? "á" : "é")] : [word];
      for (const stem of stems) {
        for (let at = said.indexOf(stem); at >= 0; at = said.indexOf(stem, at + 1)) {
          if (at > 0 && LETTERS.test(said[at - 1])) continue;
          let end = at + stem.length;
          while (end < said.length && (LETTERS.test(said[end]) || "'’".includes(said[end]))) end++;
          const tail = said.slice(at + stem.length, end);
          if (stem !== word && !tail) continue;
          if (!tail || PLACE_ENDINGS.test(tail)) hits.push({ place, word, at, end: at + stem.length });
        }
      }
    }
  }
  hits.sort((a, b) => a.at - b.at || b.end - a.end);
  const out = [];
  let reached = 0;
  for (const h of hits) {
    if (h.at < reached) continue;
    reached = h.end;
    if (!out.some((x) => x.place.id === h.place.id)) out.push({ place: h.place, word: h.word });
  }
  return out;
}

// A place by its id, name or word, as an AI may answer it.
function placeNamed(answer, places = []) {
  const key = wordKey(answer);
  if (!key) return null;
  return places.find((p) => wordKey(p.id) === key || wordKey(p.name) === key || (p.words ?? []).some((w) => wordKey(w) === key)) ?? null;
}

// Which object a text shows. Nothing named: the preset's first, its neutral one.
const objectFor = (text, objects = []) => objectsIn(text, objects)[0]?.object.id ?? objects[0]?.id ?? "";

// A line cut to its limit must not stop on a word that needs the next one.
const HANGING = /^(a|an|the|and|or|but|of|to|in|on|at|for|with|from|by|is|are|was|were|be|that|this|its|your|my|when|while|if|than|as|into|onto|through|az|egy|és|de|hogy)$/i;
function headlineOf(text, max) {
  const ws = wordsOf(text).slice(0, max);
  while (ws.length > 1 && HANGING.test(ws.at(-1))) ws.pop();
  return ws.join(" ");
}

// Before and after a joining word, up to `max` words each. The words nearest to it say the most.
function around(text, joint, max) {
  const m = joint.exec(text);
  if (!m) return null;
  const left = text.slice(0, m.index);
  const right = text.slice(m.index + m[0].length);
  const before = wordsOf(left).slice(-max);
  const after = wordsOf(right).slice(0, max);
  while (after.length > 2 && HANGING.test(after.at(-1))) after.pop();
  return before.length >= 2 && after.length >= 2 ? { before: before.join(" "), after: after.join(" "), left, right, joint: m[0].toLowerCase() } : null;
}

// One object for each side of a sentence: what that side names, else what the other
// part of the sentence names that this side's partner does not show.
function sideObjects(left, right, said, objects) {
  const a = objectsIn(left, objects)[0]?.object.id;
  const b = objectsIn(right, objects)[0]?.object.id;
  const rest = objectsIn(said, objects).map((o) => o.object.id);
  const fallback = objects[0]?.id ?? "";
  return [a ?? rest.find((id) => id !== b) ?? fallback, b ?? rest.find((id) => id !== a) ?? fallback];
}

// A rule's line, as long as this template's line may be.
const lineOf = (template, said) => headlineOf(said, template.params?.line?.maxWords ?? 6);

// The rules of a preset's own templates: a template is filled only when the sentence
// really says that thing, else the next one is tried.
function ownRule(template, said) {
  const objects = template.objects ?? [];
  switch (template.id) {
    case "scale": {
      if (!/\b(bigger|larger|smaller|taller|shorter|heavier|lighter|wider|size of|as big as|times)\b|nagyobb|kisebb|magasabb/i.test(said)) return null;
      const found = objectsIn(said, objects);
      if (found.length < 2) return null;
      const [a, b] = found.slice(0, 2).sort((x, y) => (x.object.size ?? 0) - (y.object.size ?? 0));
      const times = /(\d[\d,.]*)\s*times\b/i.exec(said);
      return { small: a.word, big: b.word, smallObject: a.object.id, bigObject: b.object.id, ...(times ? { ratio: `${times[1]} times` } : {}) };
    }
    case "cutaway": {
      if (!/\b(inside|core|layers?|beneath|underneath|interior|crust)\b|belsej|réteg/i.test(said)) return null;
      return { headline: headlineOf(said, 5), object: objectFor(said, objects) };
    }
    case "versus": {
      const m = around(said, /\b(but|instead of|instead|versus|vs\.?|unlike|rather than)\b/i, 4);
      if (!m) return null;
      const [leftObject, rightObject] = sideObjects(m.left, m.right, said, objects);
      return { left: m.before, right: m.after, leftObject, rightObject };
    }
    case "cause": {
      const m = around(said, /\b(because|leads to|causes|turns into|becomes)\b/i, 3);
      if (!m) return null;
      // "B because A": the cause comes second in the sentence
      const reversed = m.joint === "because";
      const [from, to] = reversed ? [m.after, m.before] : [m.before, m.after];
      const [fromObject, toObject] = reversed ? sideObjects(m.right, m.left, said, objects) : sideObjects(m.left, m.right, said, objects);
      return { from, to, fromObject, toObject };
    }
    case "thought":
      if (!/\b(imagine|imagines|think|thinks|thought|dream|dreams|wish|wishes|wonder|wonders)\b|képzel|gondol/i.test(said)) return null;
      return { line: headlineOf(said, 6), object: objectFor(said, objects) };
    case "talk": {
      if (!/\b(say|says|said|ask|asks|asked|tell|tells|told|shout|shouts|shouted)\b|mond|kérdez/i.test(said)) return null;
      const quoted = /["“„]([^"”]+)["”]/.exec(said)?.[1];
      // a preset may want real speech only: "nobody asked" is not two people talking
      if (template.params.said.quoted && !quoted) return null;
      return { said: headlineOf(quoted ?? said, 6), object: objectFor(said, objects) };
    }
    case "year": {
      const m = /\b(in|since|by|until|from|year|around|early|late|after|before)\s+(1[0-9]{3}|20[0-9]{2})\b|\b(1[0-9]{3}|20[0-9]{2})(?:-ban|-ben|-ig|-től|-tól|-as|-es)/i.exec(said);
      if (!m) return null;
      return { value: Number(m[2] ?? m[3]), line: headlineOf(said, 6), object: objectFor(said, objects) };
    }
    case "route": {
      const found = placesIn(said, template.places);
      if (found.length < 2) return null;
      const [from, to] = found;
      return { fromPlace: from.place.id, toPlace: to.place.id, fromLabel: from.word, toLabel: to.word, line: lineOf(template, said) };
    }
    case "map": {
      const found = placesIn(said, template.places)[0];
      if (!found) return null;
      return { place: found.place.id, label: found.word, line: lineOf(template, said) };
    }
    case "alert":
      if (!/\b(crisis|collapse|collapsed|collapses|disaster|catastrophe|crash|crashed|panic|bankrupt|bankruptcy|emergency|meltdown)\b|válság|összeoml|katasztróf|csőd|pánik/i.test(said)) return null;
      return { line: headlineOf(said, 6), object: objectFor(said, objects) };
    case "flash":
      // something happened: only a light and a sound say so
      if (!neverIn(said, template.never) && !/\b(suddenly|explosion|blast|crash|crashed|scream|screamed|struck|vanished|disappeared)\b|hirtelen|robban|sikoly|eltűnt/i.test(said)) return null;
      return { line: lineOf(template, said), object: objectFor(said, objects) };
    case "stamp": {
      const when = whenIn(said);
      if (!when) return null;
      const where = placesIn(said, template.places)[0];
      const line = lineOf(template, restOf(said, when, where));
      return { when: when.text, ...(where ? { where: where.word } : {}), ...(wordsOf(line).length >= 2 ? { line } : {}), object: objectFor(said, objects) };
    }
    case "board": {
      const items = listIn(said);
      if (!items) return null;
      const things = template.params?.object1 ? items.map((x, i) => [`object${i + 1}`, objectFor(x, objects)]) : [];
      return Object.fromEntries([...items.map((x, i) => [`item${i + 1}`, x]), ...things]);
    }
    case "evidence":
      if (!/\b(evidence|clue|clues|found|discovered|fingerprints?|footprints?|receipts?|photographs?|photos?|recordings?|tapes?|notebook|diary)\b|bizonyíték|nyom\b|találta|találtak/i.test(said)) return null;
      return { line: lineOf(template, said), object: objectFor(said, objects) };
    case "relic": {
      const named = objectsIn(said, objects)[0];
      // a number the voice says is the point of a sentence that has one
      if (!named || /\d/.test(said) || !/\b(found|discovered|unearthed|treasure|treasured|relic|artifact|artefact|kept|buried|preserved|survived|invented|built|made|carved|forged|printed)\b|találta|találtak|kincs|épít|feltal/i.test(said)) return null;
      return { line: lineOf(template, said), object: named.object.id };
    }
    case "room":
      if (!/\b(room|house|home|apartment|flat|office|kitchen|bedroom|hotel|inside|upstairs|basement)\b|szoba|lakás|házban|iroda/i.test(said)) return null;
      return { line: lineOf(template, said), object: objectFor(said, objects) };
    case "street":
      if (!/\b(street|road|highway|alley|walked|walking|drove|driving|car|outside|night|parking)\b|utca|országút|sétált|autó|éjjel|éjszaka/i.test(said)) return null;
      return { line: lineOf(template, said), object: objectFor(said, objects) };
    case "walk":
      if (!/\b(walk|walks|walked|walking|run|runs|ran|running|leave|leaves|go|goes|went|arrive|arrives|arrived|sétál|mész|elindul)\b/i.test(said)) return null;
      return { line: headlineOf(said, 6), object: objectFor(said, objects) };
    default:
      return null;
  }
}

// What a rule can say for a template from the words of its sentences. Null: it
// cannot fill it (four steps need four things the words do not give). A template with
// an object parameter gets the thing the sentence names.
export function ruleParams(template, sentences) {
  const params = offScreen(template, ruleWords(template, sentences));
  if (!params) return null;
  const said = sentences.map((s) => s.text).join(" ");
  for (const [id, p] of Object.entries(template.params ?? {})) {
    if (p.type === "object" && !(id in params)) params[id] = objectFor(said, template.objects);
  }
  return params;
}

function ruleWords(template, sentences) {
  // the words of one sentence: a line made across two reads as nonsense (a shot cut
  // from the words before another shot can hold the end of one and the start of the next)
  const first = String(sentences[0]?.text ?? "").split(/(?<=[.!?])(?<![ap]\.m\.)\s+/)[0];
  const ws = wordsOf(first);
  if (!ws.length) return null;
  const said = sentences.map((s) => s.text).join(" ");
  const own = ownRule(template, first);
  if (own) return own;
  // on a preset with objects a line it has to cut does not stop on a word that needs the next one
  const upTo = (from, max) => {
    const part = ws.slice(from, from + max);
    while (template.objects && part.length > 1 && HANGING.test(part.at(-1))) part.pop();
    return part;
  };
  switch (template.id) {
    case "statement": {
      const a = Math.min(5, Math.ceil(ws.length / 2));
      return { line1: upTo(0, a).join(" "), line2: upTo(a, 4).join(" ") || longest(ws) };
    }
    case "word":
      return { word: longest(ws) };
    case "highlight": {
      const line = upTo(0, 6);
      return { line: line.join(" "), mark: longest(line) };
    }
    case "title":
    case "chapter":
      return { headline: ws.slice(0, 5).join(" ") };
    case "question":
      return /\?/.test(said) ? { question: upTo(0, 6).join(" ") } : null;
    case "number": {
      const n = numberIn(said.replace(DATE, " ").replace(CLOCK, " ").replace(YEAR, " ").replace(/\b\d{1,2}:\d{2}\b/g, " "));
      return n && n.after !== "%" ? { value: n.value, before: n.before, after: n.after } : null;
    }
    case "percent": {
      const n = numberIn(said);
      return n && n.after === "%" && n.value <= 100 ? { value: n.value } : null;
    }
    default:
      return null;
  }
}

const digitsSaid = (text, said) => (String(text).match(/\d+/g) ?? []).every((n) => said.includes(n));

// The AI's params for a template, cut to their limits. Null when a required one
// is missing or a number was not said.
export function cleanParams(template, params, sentences) {
  const said = sentences.map((s) => s.text).join(" ");
  const out = {};
  for (const [id, p] of Object.entries(template.params)) {
    const v = params?.[id];
    // never an object the preset cannot draw: the sentence's own, or the neutral one
    if (p.type === "object") {
      const ids = (template.objects ?? []).map((o) => o.id);
      const asked = String(v ?? "").trim().toLowerCase();
      if (ids.includes(asked)) out[id] = asked;
      else if (p.required) out[id] = objectFor(said, template.objects);
      continue;
    }
    // a place is one the maps have: the one named, else the one the sentences say
    if (p.type === "place") {
      const place = placeNamed(v, template.places);
      if (place) out[id] = place.id;
      else if (p.required) {
        const taken = Object.values(out);
        const found = placesIn(said, template.places).find((x) => !taken.includes(x.place.id));
        if (!found) return null;
        out[id] = found.place.id;
      }
      continue;
    }
    if (p.type === "number") {
      const n = Number(String(v ?? "").replace(/[,%$\s]/g, ""));
      if (!Number.isFinite(n) || v === "" || v === undefined || v === null) {
        if (p.required) return null;
        continue;
      }
      // never a number the voice does not say
      if (p.said && !said.replace(/,/g, "").includes(String(n))) return null;
      out[id] = n;
      continue;
    }
    const text = capFor(template, v ?? "", p.maxWords ?? MAX_WORDS);
    // never a word the preset keeps off the screen, never a date the voice does not say
    const allowed = text && !neverIn(text, template.never) && !(p.said && !digitsSaid(text, said));
    if (!allowed) {
      if (p.required) return null;
      continue;
    }
    out[id] = text;
  }
  return out;
}

// The template's params in the variables of what draws it, each in the type
// that variable declares (the same number is a number on a dial and text on a
// label). A list ("$a,$b") stays whole; an empty optional line stays out.
export function toScene(template, params, { from, to }) {
  const vars = {};
  for (const [id, spec] of Object.entries(template.draw.vars ?? {})) {
    const value = String(spec).replace(/\$([A-Za-z0-9_]+)/g, (_, k) => (params[k] === undefined ? "" : String(params[k])));
    const list = String(spec).includes(",");
    if (template.draw.types?.[id] === "number") {
      if (value.trim() && Number.isFinite(Number(value))) vars[id] = Number(value);
    } else if (list) vars[id] = value;
    // a preset with its own pack states each limit, the others share one
    else if (value.trim()) vars[id] = capFor(template, value, (template.objects && template.params?.[id]?.maxWords) || MAX_WORDS);
  }
  // the template's own words stay with the row: a Short draws its vertical screen from them (DECISIONS 188)
  const kept = Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => typeof v === "string" || typeof v === "number"));
  return { from, ...(to !== from ? { to } : {}), component: template.draw.component, vars, template: template.id, ...(Object.keys(kept).length ? { params: kept } : {}) };
}

// The templates a rule rotates through when nothing better is known.
const ROTATION = ["statement", "highlight", "word"];

// A scene by rule: a number the sentence says if there is one, else the
// rotation, never what the scene before it used.
export function ruleScene({ byId, sentences, previous, turn, first, title }) {
  const from = sentences[0].id;
  const to = sentences[sentences.length - 1].id;
  if (first && byId.title && previous !== byId.title.draw.component) {
    const headline = [capFor(byId.title, title, byId.title.params.headline.maxWords), ruleParams(byId.title, sentences)?.headline].find((h) => h && !neverIn(h, byId.title.never));
    if (headline) return toScene(byId.title, { ...ruleParams(byId.title, sentences), headline }, { from, to });
  }
  // a preset's own templates come first, they fill only when the sentence says that thing
  const own = Object.values(byId).filter((t) => t.ruleFirst && !t.rare).map((t) => t.id);
  const tried = [...own, "percent", "number", ...Array.from({ length: ROTATION.length }, (_, i) => ROTATION[(turn + i) % ROTATION.length]), "chapter", "question"];
  for (const id of tried) {
    const t = byId[id];
    if (!t || t.draw.component === previous) continue;
    const params = ruleParams(t, sentences);
    if (params) return toScene(t, params, { from, to });
  }
  // a template that needs no words: for a sentence with none a preset may show
  const said = sentences.map((s) => s.text).join(" ");
  for (const t of Object.values(byId)) {
    if (t.fallback && t.draw.component !== previous) return toScene(t, { object: objectFor(said, t.objects) }, { from, to });
  }
  return null;
}

/**
 * A template the plan keeps rare (`rare: {every}`): never closer than that many scenes. A rule
 * gives one to a plain scene whose sentences say that thing, an AI's extra ones become the
 * rule's choice. Over the whole plan, so it holds across the parts. Pure.
 */
export function spaceRare(scenes, { templates, sentences, title = "" }) {
  const rare = templates.filter((t) => t.rare);
  if (!rare.length) return scenes;
  const byId = Object.fromEntries(templates.map((t) => [t.id, t]));
  const index = new Map(sentences.map((s, i) => [s.id, i]));
  const spanOf = (sc) => sentences.slice(index.get(sc.from), (index.get(sc.to ?? sc.from) ?? 0) + 1);
  const out = scenes.map((sc) => ({ ...sc }));
  for (const t of rare) {
    let since = t.rare.every;
    out.forEach((sc, i) => {
      if (sc.template === t.id) {
        if (since >= t.rare.every) since = 0;
        else {
          let other = null;
          for (let turn = 0; turn < 4 && !other; turn++) {
            const tried = ruleScene({ byId, sentences: spanOf(sc), previous: out[i - 1]?.component ?? null, turn: i + turn, first: false, title });
            if (tried && tried.component !== out[i + 1]?.component) other = tried;
          }
          if (other) out[i] = other;
          since++;
        }
        return;
      }
      // it wins over any other picture but the opening: this is the moment of the video
      if (since >= t.rare.every && sc.template && sc.template !== "title" && out[i - 1]?.template !== t.id && out[i + 1]?.template !== t.id) {
        const params = ruleParams(t, spanOf(sc));
        if (params) {
          out[i] = toScene(t, params, { from: sc.from, to: sc.to ?? sc.from });
          since = 0;
          return;
        }
      }
      since++;
    });
  }
  return out;
}

/**
 * One part of the AI's answer, walked over its sentences: every sentence
 * covered in order, nothing too long, nothing the templates do not have, no
 * component twice in a row. Returns the scenes and how many needed a rule.
 */
export function mendPart({ answer, part, templates, previous = null, pace, title = "", atStart = false, off = [] }) {
  const byId = Object.fromEntries(templates.map((t) => [t.id, t]));
  const { joined } = paceOf(pace);
  const index = new Map(part.map((s, i) => [s.id, i]));
  const asked = Array.isArray(answer?.scenes) ? answer.scenes : [];
  const scenes = [];
  const problems = [];
  let mended = 0;
  let at = 0;
  let turn = 0;
  let last = previous;

  const byRule = (from, to) => {
    // grown by the pace's target: never one long slide over a gap
    const { target } = paceOf(pace);
    let i = from;
    while (i <= to) {
      let j = i;
      let t = lengthOf(part[i]);
      while (j < to && t < target && t + lengthOf(part[j + 1]) <= joined) t += lengthOf(part[++j]);
      const sc = ruleScene({ byId, sentences: part.slice(i, j + 1), previous: last, turn: turn++, first: atStart && i === 0, title }) ?? fallbackScene(part.slice(i, j + 1), last, off);
      scenes.push(sc);
      last = sc.component;
      mended++;
      i = j + 1;
    }
  };

  for (const a of asked) {
    let from = index.get(a?.from);
    if (from === undefined || from < at) {
      problems.push(`a scene starts at ${a?.from ?? "nothing"}, which is not the next sentence`);
      continue;
    }
    if (from > at) {
      problems.push(`no scene covers ${part[at].id}`);
      byRule(at, from - 1);
      at = from;
    }
    let to = index.get(a?.to ?? a?.from);
    if (to === undefined || to < from) to = from;
    // too long for the pace: the end comes back, the rest goes on
    let seconds = 0;
    let end = from;
    for (let i = from; i <= to; i++) {
      if (i > from && seconds + lengthOf(part[i]) > joined) break;
      seconds += lengthOf(part[i]);
      end = i;
    }
    const span = part.slice(from, end + 1);
    const t = byId[a?.template];
    const params = t ? cleanParams(t, a?.params, span) : null;
    if (!t) problems.push(`there is no template ${a?.template}`);
    else if (!params) problems.push(`${a.template} at ${a.from} has a param missing, or a number the sentence does not say`);
    if (t && params && t.draw.component !== last) {
      const sc = toScene(t, params, { from: part[from].id, to: part[end].id });
      scenes.push(sc);
      last = sc.component;
    } else {
      if (t && params) problems.push(`${a.template} twice in a row`);
      byRule(from, end);
    }
    at = end + 1;
  }
  if (at < part.length) {
    problems.push(`the sentences from ${part[at].id} on have no scene`);
    byRule(at, part.length - 1);
  }
  return { scenes, mended, problems };
}

// Nothing in the preset fits: the plainest words on screen.
function fallbackScene(sentences, previous, off = []) {
  const from = sentences[0].id;
  const to = sentences[sentences.length - 1].id;
  const text = cap(sentences.map((s) => s.text).join(" "), MAX_WORDS) || "...";
  const component = ["per-word-rise", "text-shimmer", "push-in"].find((c) => c !== previous && !off.includes(c));
  return { from, ...(to !== from ? { to } : {}), component, vars: { text } };
}

/** The sentences as parts for the AI: at most PART_SENTENCES, cut at a comment call. */
export function partsOf(sentences, calls = new Map(), size = PART_SENTENCES) {
  const out = [];
  let cur = [];
  for (const s of sentences) {
    if (calls.has(s.id)) {
      if (cur.length) out.push(cur);
      out.push([s]);
      cur = [];
      continue;
    }
    cur.push(s);
    if (cur.length >= size) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

/** What planning costs: small on purpose. */
export function estimateTemplatePlan({ projectDir, llm, preset, off = [] }) {
  const sentences = JSON.parse(fs.readFileSync(path.join(projectDir, "sentences.json"), "utf8"));
  const templates = resolveTemplates(preset, { off });
  const parts = partsOf(sentences).length;
  const tokensIn = tokensOf(templateList(templates)) * parts + tokensOf(sentences.map((s) => s.text).join(" ")) + 200 * parts;
  return estimateUsd({ provider: llm.provider, model: llm.model, effort: llm.effort, tokensIn, tokensOut: 60 * sentences.length });
}

/**
 * The scene table of a preset. `llm` null plans by rule only. Never throws
 * because of the AI: a part it cannot answer is planned by rule and a warning
 * says so.
 */
export async function makeTemplateScenes({ llm, projectDir, preset, env = process.env, language = "en", title = "", off = [], identityDir = null, videoId = null, onProgress = () => {} }) {
  const sentences = JSON.parse(fs.readFileSync(path.join(projectDir, "sentences.json"), "utf8"));
  const md = fs.existsSync(path.join(projectDir, "script.md")) ? fs.readFileSync(path.join(projectDir, "script.md"), "utf8") : "";
  const total = await audioLength(projectDir, sentences, env);
  const calls = callSentences(readScript(projectDir), sentences);
  const gaps = gapsOf(projectDir);
  const pace = preset.shotRules?.pacing;
  const templates = resolveTemplates(preset, { off });
  if (!templates.length) throw new Error(`Nothing can draw the templates of ${preset.label} on this channel.`);

  const parts = partsOf(sentences, calls);
  const planned = [];
  const warnings = [];
  let byRule = 0;
  let ai = llm;
  for (const [k, part] of parts.entries()) {
    onProgress({ step: "planning", provider: llm?.provider ?? null, part: k + 1, of: parts.length });
    if (calls.has(part[0].id)) {
      const { keyword } = calls.get(part[0].id);
      planned.push({ from: part[0].id, component: "cta-close", vars: { action_line: callLine(part[0].text, keyword), button_label: keyword } });
      continue;
    }
    const previous = planned.at(-1)?.component ?? null;
    const atStart = k === 0;
    let best = null;
    let note = "";
    for (let round = 0; ai && round < 2; round++) {
      try {
        const text = await chat({ ...ai, messages: planMessages({ templates, sentences: part, title, language, pace, previous: planned.at(-1)?.template ?? null, shotRules: preset.shotRules, note }), json: true, temperature: 0.3 });
        const got = mendPart({ answer: extractJson(text), part, templates, previous, pace, title, atStart, off });
        if (!best || got.mended < best.mended) best = got;
        if (got.mended / Math.max(1, got.scenes.length) <= ASK_AGAIN_SHARE) break;
        note = got.problems.slice(0, 8).join("\n");
        onProgress({ step: "repairing", part: k + 1, of: parts.length });
      } catch (e) {
        // a rate limit, a dead key, an unreadable answer: this part goes by rule
        warnings.push(`Part ${k + 1} of the plan was made without the AI (${String(e.message).slice(0, 160)}).`);
        // no AI answers at all: the other parts do not wait for it, one after the other
        if (e.offline) ai = null;
        break;
      }
    }
    best ??= mendPart({ answer: null, part, templates, previous, pace, title, atStart, off });
    byRule += best.mended;
    planned.push(...best.scenes);
  }

  let answer = joinShort({ scenes: spaceRare(planned, { templates, sentences, title }) }, { sentences, total, calls, gaps });
  const { issues, warnings: seen } = checkScenes(answer, { sentences, total, env, off, calls, gaps, pace });
  const hard = issues.filter((i) => !isSoft(i));
  if (hard.length) {
    // the plain plan always passes: the video is never stopped here
    warnings.push(`The plan was replaced by the simple plan: ${hard.slice(0, 3).join("; ")}.`);
    answer = joinShort(simplePlan({ sentences, sections: sentenceSections(md, sentences), title, calls, off, pace }), { sentences, total, calls, gaps });
    const again = checkScenes(answer, { sentences, total, env, off, calls, gaps, pace });
    const still = again.issues.filter((i) => !isSoft(i));
    if (still.length) throw new Error(`The scene table did not pass the checks: ${still.slice(0, 5).join("; ")}`);
  }
  const scenes = withCalls(answer.scenes.map(clean), calls);
  const previousTable = fs.existsSync(path.join(projectDir, "scenes.json")) ? JSON.parse(fs.readFileSync(path.join(projectDir, "scenes.json"), "utf8")) : {};
  writeTable(projectDir, { ...(previousTable.theme ? { theme: previousTable.theme } : {}), scenes, gaps: [], warnings: [...warnings, ...seen], planner: { steps: 1, preset: preset.id, parts: parts.length, byRule } });
  recordHistory(identityDir, videoId ?? path.basename(projectDir), scenes);
  return { scenes: scenes.length, gaps: [], warnings: [...warnings, ...seen], parts: parts.length, byRule, minSeconds: MIN_SECONDS };
}
