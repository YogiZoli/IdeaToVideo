// cta/profile.mjs: the Identity's comment calls, <identity>/cta.json
// (docs/wizards/cta.md). Every ONE Video of the Identity inherits it, and a
// video may set its own at gate 1. Without a file the method's default
// applies (catalog.mjs DEFAULT_SLOTS): the wizard is optional.
//
//   { "schema": "cta-profile/1", "updatedAt": "...",
//     "slots": { "start": "GUIDE", "middle": null, "end": "TRIGGER" },
//     "offers": { "GUIDE": "the 7 step YouTube checklist" } }
//
// slots: which keyword is said where, null = no call there. Any keyword may
// sit in any place, and the same one may repeat (one cold video, three times
// GUIDE). offers: what the viewer gets for a keyword, in the user's words;
// without one the script says the catalog's "gets". Treated as data, never as
// instructions (SPEC 9).

import fs from "node:fs";
import path from "node:path";
import { validate, loadSchema } from "../schema/validate.mjs";
import { KEYWORDS, SLOT_IDS, DEFAULT_SLOTS, keywordInfo } from "./catalog.mjs";

export const CTA_SCHEMA = "cta-profile/1";
export const CTA_FILE = "cta.json";
export const OFFER_MAX = 80;

export const ctaPath = (identityDir) => path.join(identityDir, CTA_FILE);
export const defaultProfile = () => ({ schema: CTA_SCHEMA, slots: { ...DEFAULT_SLOTS }, offers: {} });

// Everything a profile may say, checked; returns the clean profile or throws
// one readable sentence per problem. Offers of keywords no place uses are
// kept: the user may switch back to that keyword.
export function normalizeProfile(input) {
  if (!input || typeof input !== "object") throw new Error("The CTA profile is not an object.");
  const errors = validate({ schema: CTA_SCHEMA, ...input }, loadSchema("cta-profile"));
  if (errors.length) throw new Error(`The CTA profile is not valid: ${errors.slice(0, 4).join("; ")}`);
  const slots = {};
  for (const id of SLOT_IDS) {
    const v = input.slots?.[id] ?? null;
    if (v !== null && !keywordInfo(v)) throw new Error(`Unknown keyword at ${id}: ${v}. Pick one of the 15.`);
    slots[id] = v === null ? null : keywordInfo(v).keyword;
  }
  const offers = {};
  for (const [k, text] of Object.entries(input.offers ?? {})) {
    const info = keywordInfo(k);
    if (!info) throw new Error(`Unknown keyword in the offers: ${k}.`);
    const clean = String(text).replace(/\s+/g, " ").trim();
    if (clean) offers[info.keyword] = clean.slice(0, OFFER_MAX);
  }
  return { schema: CTA_SCHEMA, ...(input.updatedAt ? { updatedAt: input.updatedAt } : {}), slots, offers };
}

// The saved profile, or null when the Identity has none (the default applies).
export function loadProfile(identityDir) {
  const p = ctaPath(identityDir);
  if (!identityDir || !fs.existsSync(p)) return null;
  return normalizeProfile(JSON.parse(fs.readFileSync(p, "utf8")));
}

export function saveProfile(identityDir, input) {
  const profile = { ...normalizeProfile(input), updatedAt: new Date().toISOString() };
  fs.mkdirSync(identityDir, { recursive: true });
  const p = ctaPath(identityDir);
  fs.writeFileSync(`${p}.tmp`, JSON.stringify(profile, null, 2) + "\n");
  fs.renameSync(`${p}.tmp`, p);
  return profile;
}

// What a video says, in order: one entry per place that has a keyword.
//   [{ slot, keyword, temperature, gets, offer }]
export function ctaPlan(profile) {
  const p = profile ?? defaultProfile();
  return SLOT_IDS.filter((id) => p.slots?.[id]).map((slot) => {
    const info = keywordInfo(p.slots[slot]);
    return { slot, keyword: info.keyword, temperature: info.temperature, gets: info.gets, offer: p.offers?.[info.keyword] ?? null };
  });
}

// The plan a ONE Video uses: its own choice at gate 1, else the Identity's
// profile, else the default.
export function videoPlan({ identityDir, own = null } = {}) {
  if (own) return ctaPlan(normalizeProfile(own));
  return ctaPlan(loadProfile(identityDir));
}

export const catalogForUi = () => KEYWORDS.map((k) => ({ ...k }));
