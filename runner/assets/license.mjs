// assets/license.mjs: the asset license module (docs/BUILD_PLAN.md, DECISIONS
// 135, 137). Every external asset of a channel video is logged in the project's
// assets_license.json: source URL or model name, license or terms, author,
// prompt (for AI), cost and date. Only CC0 or Public Domain comes in, plus the
// two named exceptions: Pixabay (logged as free license, not CC0) and AI output
// (logged with its model and prompt). The check is one function, used when an
// asset is added and again before a build.

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
  pixabay: "Free license, not CC0 (Pixabay Content License)",
  "kie-terms": "Kie AI terms of use (AI output, see docs/BUILD_PLAN.md)",
  "heygen-terms": "HeyGen terms of use (AI output)",
  "gemini-terms": "Google Gemini terms of use (AI output)",
  "own-generation": "Google Flow (Veo), own generation",
  // RecCut: a lip sync clip the user made from the video's own voice (DECISIONS 184)
  "own-generation-outside": "Own generation, outside tool",
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
  prelinger: { label: "Prelinger Archives", licenses: ["pd", "cc0"], hosts: ["archive.org"] },
  nasa: { label: "NASA", licenses: ["us-federal"], hosts: ["nasa.gov"] },
  pixabay: { label: "Pixabay", licenses: ["pixabay"], hosts: ["pixabay.com"] },
  kie: { label: "Kie AI", licenses: ["kie-terms"], ai: true },
  heygen: { label: "HeyGen", licenses: ["heygen-terms"], ai: true },
  // a thumbnail's picture, on the Thumbnail tab's paid choice
  gemini: { label: "Gemini", licenses: ["gemini-terms"], ai: true },
  // the manual slot of a shot (docs/BUILD_PLAN.md phase 3): the user's own clip
  flow: { label: "Google Flow (Veo), own generation", licenses: ["own-generation"], ai: true },
  // RecCut: the face bubble made in any outside tool from the exported voice (DECISIONS 184)
  outside: { label: "Own generation, outside tool", licenses: ["own-generation-outside"], ai: true },
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
  if (!src) return `The source "${asset?.source ?? "unknown"}" is not an allowed one (Openverse, Wikimedia Commons, Library of Congress, Prelinger Archives, NASA and other US federal works, Pixabay, AI clips with their model and prompt).`;
  if (!LICENSES[asset.license]) return `The license "${asset.license ?? "none"}" is not a clear CC0 or Public Domain license.`;
  if (!src.licenses.includes(asset.license)) return `${src.label} cannot give the license "${LICENSES[asset.license]}".`;
  // AI output has no source address: its proof is the model and the prompt.
  if (src.ai) {
    if (!String(asset.model ?? "").trim()) return "An AI clip needs its model name.";
    if (!String(asset.prompt ?? "").trim()) return "An AI clip needs its prompt.";
    if (!String(asset.author ?? "").trim()) return "An asset needs its author (or \"unknown\").";
    if (!String(asset.date ?? "").trim()) return "An asset needs the date it was taken.";
    return null;
  }
  if (!/^https?:\/\//i.test(String(asset.sourceUrl ?? ""))) return "An asset needs its source URL.";
  if (src.hosts && !hostIn(asset.sourceUrl, src.hosts)) return `A ${src.label} asset must come from ${src.hosts.join(" or ")}.`;
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
    model: asset.model ?? null,
    prompt: asset.prompt ?? null,
    costUsd: Number(asset.costUsd) || 0,
    derived: asset.derived ?? null,
    date: asset.date,
    loggedAt: now.toISOString(),
  };
  // One record per clip: two pieces of the same film are two records.
  const at = ledger.assets.findIndex((a) => (record.file ? a.file === record.file : a.sourceUrl === record.sourceUrl));
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
// uploads and renders are not external assets, and test clips are not real
// ones. AI clips carry their model and prompt; Pixabay is logged as a free
// license; any other stock site has no proof and is refused.
export function clipAsset(clip) {
  const g = clip?.generated;
  if (g && !g.test) {
    const kie = String(g.generator ?? "").startsWith("kie-");
    return { file: clip.file, title: clip.name, source: kie ? "kie" : "heygen", sourceUrl: null, license: kie ? "kie-terms" : "heygen-terms", licenseUrl: kie ? "https://kie.ai/terms-of-use" : "https://www.heygen.com/terms", author: `AI: ${g.label ?? g.generator}`, model: g.model ?? g.generator, prompt: g.prompt ?? null, costUsd: g.usd ?? 0, derived: g.derived ?? null, date: String(g.at ?? clip.createdAt ?? "").slice(0, 10) };
  }
  if (!clip?.credit) return null;
  const c = clip.credit;
  if (c.source === "Pixabay") return { file: clip.file, title: clip.name, source: "pixabay", sourceUrl: c.pageUrl ?? null, license: "pixabay", licenseUrl: c.licenseUrl ?? null, author: c.author ?? null, date: String(c.at ?? clip.createdAt ?? "").slice(0, 10) };
  return { derived: c.derived ?? null, file: clip.file, title: clip.name, source: c.licenseKey ? c.sourceId : `stock:${c.source}`, sourceUrl: c.pageUrl ?? c.url ?? null, license: c.licenseKey ?? c.license, licenseUrl: c.licenseUrl ?? null, author: c.author ?? null, model: c.model ?? null, prompt: c.prompt ?? null, date: c.date ?? null };
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
  // A clip taken out of the video leaves the ledger: it lists what is in it.
  const ledger = readLedger(projectDir);
  const inVideo = new Set(logged.map((a) => a.file));
  const kept = ledger.assets.filter((a) => !a.file || inVideo.has(a.file));
  if (kept.length !== ledger.assets.length) fs.writeFileSync(fileOf(projectDir), JSON.stringify({ ...ledger, assets: kept }, null, 2) + "\n");
  return logged;
}
