// cta/profile.mjs: the Identity's comment calls, <identity>/cta.json
// (docs/wizards/cta.md). Every ONE Video of the Identity inherits it, and a
// video may set its own at gate 1. Without a file the method's default
// applies (catalog.mjs DEFAULT_SLOTS): the wizard is optional.
//
//   { "schema": "cta-profile/1", "updatedAt": "...",
//     "slots": { "start": "GUIDE", "middle": null, "end": "TRIGGER" },
//     "modes": { "start": "segment", "end": "narrator" },
//     "offers": { "GUIDE": "the 7 step YouTube checklist" },
//     "endScreen": 20 }
//
// slots: which keyword is said where, null = no call there. Any keyword may
// sit in any place, and the same one may repeat (one cold video, three times
// GUIDE). modes: the narrator says the call (default), or one of the
// Identity's segments plays it (segments.mjs), never both. offers: what the viewer gets for a
// keyword, in the user's words; without one the script says the catalog's
// "gets". endScreen: seconds left at the end for YouTube's end screen
// (DECISIONS 53: 20 by default, 5 to 20, 0 = none). Treated as data, never as
// instructions (SPEC 9).

import fs from "node:fs";
import path from "node:path";
import { validate, loadSchema } from "../schema/validate.mjs";
import { KEYWORDS, SLOT_IDS, DEFAULT_SLOTS, keywordInfo } from "./catalog.mjs";
import { loadSegments, segmentFor } from "./segments.mjs";

export const CTA_SCHEMA = "cta-profile/1";
export const CTA_FILE = "cta.json";
export const LAST_FILE = "cta-last.json";
export const OFFER_MAX = 600; // a full call sentence fits (Zoltan, 2026-10-16)
export const END_SCREEN_DEFAULT = 20;

export const ctaPath = (identityDir) => path.join(identityDir, CTA_FILE);
export const defaultProfile = () => ({ schema: CTA_SCHEMA, slots: { ...DEFAULT_SLOTS }, modes: { start: "auto", middle: "auto", end: "auto" }, offers: {}, endScreen: END_SCREEN_DEFAULT });

// Everything a profile may say, checked; returns the clean profile or throws
// one readable sentence per problem. Offers of keywords no place uses are
// kept: the user may switch back to that keyword.
export function normalizeProfile(input) {
  if (!input || typeof input !== "object") throw new Error("The CTA profile is not an object.");
  const errors = validate({ schema: CTA_SCHEMA, ...input }, loadSchema("cta-profile"));
  if (errors.length) throw new Error(`The CTA profile is not valid: ${errors.slice(0, 4).join("; ")}`);
  const slots = {};
  const modes = {};
  for (const id of SLOT_IDS) {
    const v = input.slots?.[id] ?? null;
    if (v !== null && !keywordInfo(v)) throw new Error(`Unknown keyword at ${id}: ${v}. Pick one of the 15.`);
    slots[id] = v === null ? null : keywordInfo(v).keyword;
    // auto (default): your segment when the keyword has one (Zoltan's test,
    // 2026-10-05: three uploaded segments, none used).
    // A save from before "auto" (no modesV) wrote narrator as a mere
    // default: it reads as auto (Zoltan's second test, 2026-10-05).
    const m = input.modes?.[id];
    // heygen (DECISIONS 119): HeyGen makes the clip before the next script;
    // until it exists it reads as auto.
    // upload, previous, heygen-new: one ONE Video's own choice (DECISIONS 120)
    modes[id] = ["segment", "heygen", "upload", "previous", "heygen-new"].includes(m) || (m === "narrator" && input.modesV === 2) ? m : "auto";
  }
  const offers = {};
  for (const [k, text] of Object.entries(input.offers ?? {})) {
    const info = keywordInfo(k);
    if (!info) throw new Error(`Unknown keyword in the offers: ${k}.`);
    const clean = String(text).replace(/\s+/g, " ").trim();
    if (clean) offers[info.keyword] = clean.slice(0, OFFER_MAX);
  }
  return {
    schema: CTA_SCHEMA,
    ...(input.updatedAt ? { updatedAt: input.updatedAt } : {}),
    slots,
    modes,
    modesV: 2,
    offers,
    endScreen: input.endScreen ?? END_SCREEN_DEFAULT,
  };
}

// The saved profile, or null when the Identity has none (the default applies).
export function loadProfile(identityDir) {
  const p = ctaPath(identityDir);
  if (!identityDir || !fs.existsSync(p)) return null;
  return normalizeProfile(JSON.parse(fs.readFileSync(p, "utf8")));
}

function writeJson(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(`${p}.tmp`, JSON.stringify(data, null, 2) + "\n");
  fs.renameSync(`${p}.tmp`, p);
}

export function saveProfile(identityDir, input) {
  const profile = { ...normalizeProfile(input), updatedAt: new Date().toISOString() };
  writeJson(ctaPath(identityDir), profile);
  return profile;
}

// "Previously selected": the calls of the Identity's last written script,
// so the next video's gate 1 starts from them.
export function loadLast(identityDir) {
  const p = identityDir && path.join(identityDir, LAST_FILE);
  if (!p || !fs.existsSync(p)) return null;
  try {
    return normalizeProfile(JSON.parse(fs.readFileSync(p, "utf8")));
  } catch {
    return null;
  }
}
export const saveLast = (identityDir, profile) => writeJson(path.join(identityDir, LAST_FILE), normalizeProfile(profile));

// What a video says, in order: one entry per place that has a keyword.
//   [{ slot, keyword, temperature, gets, offer, mode, segment }]
// A place set to "segment" whose keyword has no segment (yet) falls back to
// the narrator, with a note; `segments` is the Identity's library.
export function ctaPlan(profile, segments = []) {
  const p = profile ?? defaultProfile();
  return SLOT_IDS.filter((id) => p.slots?.[id]).map((slot) => {
    const info = keywordInfo(p.slots[slot]);
    const base = { slot, keyword: info.keyword, temperature: info.temperature, gets: info.gets, offer: p.offers?.[info.keyword] ?? null, mode: "narrator", segment: null };
    const mode = p.modes?.[slot] ?? "auto";
    if (mode === "narrator") return base;
    const seg = segmentFor(segments, info.keyword);
    if (mode === "upload" || mode === "previous") {
      const fits = seg && (seg.source === "upload") === (mode === "upload");
      if (fits) return { ...base, mode: "segment", segment: seg };
      return { ...base, note: `No ${mode === "upload" ? "uploaded" : "earlier HeyGen"} clip for ${info.keyword}, so the narrator says it.` };
    }
    if (seg) return { ...base, mode: "segment", segment: seg };
    if (mode === "heygen-new") return { ...base, note: `No HeyGen clip for ${info.keyword} yet, so the narrator says it.` };
    if (mode === "heygen") return { ...base, note: `No HeyGen clip for ${info.keyword} yet, so the narrator says it.` };
    return mode === "segment" ? { ...base, note: `No segment for ${info.keyword} yet, so the narrator says it.` } : base;
  });
}

// The plan a ONE Video uses: its own choice at gate 1, else the Identity's
// profile, else the default.
export function videoPlan({ identityDir, own = null } = {}) {
  const segments = identityDir ? loadSegments(identityDir) : [];
  if (own) return ctaPlan(normalizeProfile(own), segments);
  return ctaPlan(loadProfile(identityDir), segments);
}

export const endScreenOf = (identityDir, own = null) => (own ? normalizeProfile(own) : (loadProfile(identityDir) ?? defaultProfile())).endScreen;

export const catalogForUi = () => KEYWORDS.map((k) => ({ ...k }));
