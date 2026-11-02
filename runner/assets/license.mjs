// assets/license.mjs: the asset license module (docs/BUILD_PLAN.md, DECISIONS
// 135). Every external asset of a channel video is logged in the project's
// assets_license.json with its source URL, license, author and date, and
// anything without a clear CC0 or Public Domain license is refused. The check
// is one function, used when an image is added and again before a build.

import fs from "node:fs";
import path from "node:path";

export const LEDGER = "assets_license.json";
export const LEDGER_SCHEMA = "assets-license/1";

// What may come in, and how a source's own wording maps to it.
export const LICENSES = {
  cc0: "CC0",
  pd: "Public Domain",
  "no-known-restrictions": "No known restrictions (Library of Congress)",
  "us-federal": "US federal government work",
};

// Hosts of US federal agencies, whose own works are public domain. Not every
// .gov: a state government's work is not.
const FEDERAL_HOSTS = ["nasa.gov", "noaa.gov", "usgs.gov", "nps.gov", "loc.gov", "archives.gov", "fws.gov", "nih.gov", "cdc.gov", "energy.gov", "usda.gov", "army.mil", "navy.mil", "af.mil"];

const hostOf = (url) => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
};
const hostIn = (url, list) => list.some((h) => hostOf(url) === h || hostOf(url).endsWith(`.${h}`));

// The sources, each with the licenses it may give.
export const SOURCES = {
  openverse: { label: "Openverse", licenses: ["cc0", "pd"] },
  wikimedia: { label: "Wikimedia Commons", licenses: ["cc0", "pd", "us-federal"] },
  loc: { label: "Library of Congress", licenses: ["no-known-restrictions", "pd"] },
  "us-federal": { label: "US federal government", licenses: ["us-federal"] },
  "natural-earth": { label: "Natural Earth", licenses: ["pd"] },
};

// Words in a title or tags that point to a person: such an image is refused,
// people are drawn by code. A filter on words only, so the app also tells the
// user to look at every picture before using it.
const PERSON = /\b(portrait|selfie|headshot|president|actor|actress|singer|politician|celebrity|senator|queen|king|prince|princess|minister|general|athlete|mr\.|mrs\.|ms\.|dr\.|man|woman|men|women|boy|girl|people|person|family|crowd|face)\b/i;
export const looksLikePerson = (meta) => PERSON.test(`${meta?.title ?? ""} ${(meta?.tags ?? []).join?.(" ") ?? meta?.tags ?? ""}`);

/**
 * Why this asset may not be used, or null when it may.
 * { source, sourceUrl, license, author, date, title?, tags? }
 */
export function refusal(asset) {
  const src = SOURCES[asset?.source];
  if (!src) return `The source "${asset?.source ?? "unknown"}" is not an allowed one (Openverse, Wikimedia Commons, Library of Congress, US federal works).`;
  if (!LICENSES[asset.license]) return `The license "${asset.license ?? "none"}" is not a clear CC0 or Public Domain license.`;
  if (!src.licenses.includes(asset.license)) return `${src.label} cannot give the license "${LICENSES[asset.license]}".`;
  if (!/^https?:\/\//i.test(String(asset.sourceUrl ?? ""))) return "An asset needs its source URL.";
  if (asset.license === "us-federal" && asset.source === "us-federal" && !hostIn(asset.sourceUrl, FEDERAL_HOSTS)) return "Only a work on a US federal agency's own site counts as a federal work.";
  if (asset.source === "loc" && !hostIn(asset.sourceUrl, ["loc.gov"])) return "A Library of Congress asset must come from loc.gov.";
  if (!String(asset.author ?? "").trim()) return "An asset needs its author (or \"unknown\").";
  if (!String(asset.date ?? "").trim()) return "An asset needs the date it was taken.";
  if (looksLikePerson(asset)) return "This looks like a picture of a person. Real people are never shown; people are drawn by code.";
  return null;
}

const fileOf = (projectDir) => path.join(projectDir, LEDGER);

export function readLedger(projectDir) {
  try {
    return JSON.parse(fs.readFileSync(fileOf(projectDir), "utf8"));
  } catch {
    return { schema: LEDGER_SCHEMA, assets: [] };
  }
}

/** Logs one asset in the project. A refused asset throws, nothing is written. */
export function logAsset(projectDir, asset, now = new Date()) {
  const why = refusal(asset);
  if (why) throw new Error(why);
  const ledger = readLedger(projectDir);
  const record = {
    file: asset.file ?? null,
    title: asset.title ?? null,
    source: asset.source,
    sourceUrl: asset.sourceUrl,
    license: asset.license,
    licenseName: LICENSES[asset.license],
    licenseUrl: asset.licenseUrl ?? null,
    author: asset.author,
    date: asset.date,
    loggedAt: now.toISOString(),
  };
  const at = ledger.assets.findIndex((a) => a.sourceUrl === record.sourceUrl);
  if (at >= 0) ledger.assets[at] = record;
  else ledger.assets.push(record);
  fs.writeFileSync(fileOf(projectDir), JSON.stringify(ledger, null, 2) + "\n");
  return record;
}

/** The ledger's problems, as sentences (an edited or old file). */
export function checkLedger(projectDir) {
  return readLedger(projectDir).assets.flatMap((a) => {
    const why = refusal(a);
    return why ? [`${a.title ?? a.sourceUrl}: ${why}`] : [];
  });
}

// A clip from the Identity's footage library, as this module sees it. Own
// uploads and renders are not external assets; a clip from any other outside
// source (a stock site) has no CC0 or PD proof and is refused.
export function clipAsset(clip) {
  if (!clip?.credit) return null;
  const c = clip.credit;
  return { file: clip.file, title: clip.name, source: c.licenseKey ? c.sourceId : `stock:${c.source}`, sourceUrl: c.pageUrl ?? c.url ?? null, license: c.licenseKey ?? c.license, licenseUrl: c.licenseUrl ?? null, author: c.author ?? null, date: c.date ?? null };
}

/**
 * The footage a channel video's scene table uses: every external clip logged,
 * or the build stops with a sentence that names it.
 */
export function logTableFootage({ projectDir, table, clips = [] }) {
  const used = new Set((table?.footage ?? []).map((f) => f.clip));
  const logged = [];
  for (const clip of clips) {
    if (!used.has(clip.id)) continue;
    const asset = clipAsset(clip);
    if (!asset) continue;
    const why = refusal(asset);
    if (why) throw new Error(`"${clip.name}" cannot be in this channel's video: ${why} Remove it on the Scenes tab.`);
    logged.push(logAsset(projectDir, asset));
  }
  return logged;
}
