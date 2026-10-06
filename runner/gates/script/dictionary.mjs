// gates/script/dictionary.mjs: the Identity's dictionary (DECISIONS 68,
// docs/wizards/brand.md 10), <identity>/dictionary.json. Four lists:
//   preferred   words written exactly so ("Owner", capital O)
//   banned      words never used ("blasting email"), with what to say instead
//   distinct    pairs never mixed up (YouTube Subscriber, Email Subscriber)
//   positions   what the YouTube channel stands against, and its stance
// The script prompt gets all four as data. A machine check (not the AI) then
// finds banned words and other spellings of preferred words in the script and
// in the scene texts; the gates show them, they never block.

import fs from "node:fs";
import path from "node:path";
import { validate, loadSchema } from "../../schema/validate.mjs";

export const DICTIONARY_FILE = "dictionary.json";
export const EMPTY = { schema: "dictionary/1", preferred: [], banned: [], distinct: [], positions: [] };
const LISTS = ["preferred", "banned", "distinct", "positions"];

export function loadDictionary(identityDir) {
  const file = identityDir ? path.join(identityDir, DICTIONARY_FILE) : null;
  if (!file || !fs.existsSync(file)) return structuredClone(EMPTY);
  const dict = JSON.parse(fs.readFileSync(file, "utf8"));
  const errors = validate(dict, loadSchema("dictionary"));
  if (errors.length) throw new Error(`The dictionary is not valid: ${errors.slice(0, 5).join("; ")}`);
  return { ...structuredClone(EMPTY), ...dict };
}

const clean = (s) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : undefined);

// Trims every field, drops empty rows and repeats, then validates.
export function normalizeDictionary(dict = {}) {
  const out = { schema: "dictionary/1" };
  const keyOf = { preferred: (r) => r.term, banned: (r) => r.term, distinct: (r) => `${r.a}|${r.b}`, positions: (r) => r.against };
  for (const list of LISTS) {
    const seen = new Set();
    out[list] = (dict[list] ?? [])
      .map((r) => Object.fromEntries(Object.entries(r ?? {}).map(([k, v]) => [k, clean(v)]).filter(([, v]) => v)))
      .filter((r) => (list === "distinct" ? r.a && r.b : list === "positions" ? r.against : r.term))
      .filter((r) => {
        const k = keyOf[list](r).toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
  }
  for (const p of out.positions) if (p.kind && !["phenomenon", "type", "person"].includes(p.kind)) delete p.kind;
  const errors = validate(out, loadSchema("dictionary"));
  if (errors.length) throw new Error(`The dictionary is not valid: ${errors.slice(0, 5).join("; ")}`);
  return out;
}

export function saveDictionary(identityDir, dict) {
  const clean = normalizeDictionary(dict);
  const file = path.join(identityDir, DICTIONARY_FILE);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(clean, null, 2) + "\n");
  fs.renameSync(tmp, file);
  return clean;
}

export const isEmpty = (dict) => LISTS.every((l) => !(dict?.[l]?.length));

// What goes into the script prompt's DATA block (data, never instructions).
export function dictionaryData(dict) {
  if (isEmpty(dict)) return null;
  return {
    preferredSpellings: dict.preferred.map((r) => (r.note ? { term: r.term, note: r.note } : { term: r.term })),
    bannedWords: dict.banned.map((r) => (r.instead ? { term: r.term, insteadSay: r.instead } : { term: r.term })),
    neverMixUp: dict.distinct.map((r) => ({ a: r.a, b: r.b, ...(r.note ? { note: r.note } : {}) })),
    standsAgainst: dict.positions.map((r) => ({ against: r.against, kind: r.kind ?? "phenomenon", ...(r.stance ? { stance: r.stance } : {}) })),
  };
}

// ---- the machine check ------------------------------------------------------------

// Lower case, accents off, character by character, keeping where each
// normalised character came from, so a hit points back at the original text.
function fold(text) {
  let s = "";
  const at = [];
  let i = 0;
  for (const ch of text) {
    const f = ch.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    for (const c of f) {
      s += c;
      at.push(i);
    }
    i += ch.length;
  }
  at.push(i);
  return { s, at };
}

const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const termRx = (folded) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRx(folded).replace(/\s+/g, "\\s+")}(?![\\p{L}\\p{N}])`, "gu");

function hits(text, term) {
  const { s, at } = fold(text);
  const t = fold(term).s.trim();
  if (!t) return [];
  const out = [];
  for (const m of s.matchAll(termRx(t))) {
    const start = at[m.index];
    const end = at[m.index + m[0].length];
    out.push({ start, end, found: text.slice(start, end) });
  }
  return out;
}

// A capital first letter at the start of a sentence is not a misspelling.
const sentenceStart = (text, start) => /(^|[.!?]\s+|\n\s*(#+\s*)?)$/.test(text.slice(Math.max(0, start - 8), start));

// Findings in one piece of text: banned words, and preferred words written
// another way. Each: { kind, term, found, instead?, where }.
export function checkText(dict, text, where = "") {
  if (!text || isEmpty(dict)) return [];
  const out = [];
  for (const b of dict.banned ?? []) {
    for (const h of hits(text, b.term)) out.push({ kind: "banned", term: b.term, found: h.found, ...(b.instead ? { instead: b.instead } : {}), where });
  }
  for (const p of dict.preferred ?? []) {
    for (const h of hits(text, p.term)) {
      if (h.found === p.term) continue;
      const capitalised = h.found.length && h.found[0] !== p.term[0] && h.found.slice(1) === p.term.slice(1) && h.found[0] === p.term[0].toUpperCase();
      if (capitalised && sentenceStart(text, h.start)) continue;
      out.push({ kind: "spelling", term: p.term, found: h.found, where });
    }
  }
  return out;
}

// Over several texts: [[where, text], ...].
export const checkAll = (dict, pieces) => pieces.flatMap(([where, text]) => checkText(dict, text, where));
