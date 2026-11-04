// assets/sources.mjs: searching the allowed image sources, no key needed
// (docs/BUILD_PLAN.md). Each search asks the source for CC0 or Public Domain
// only, reads the license again from the answer, and drops whatever the
// license module refuses. Nothing is trusted from the search filter alone.

import { retrying, readJson } from "../net.mjs";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { refusal, SOURCES } from "./license.mjs";
import { photoClip } from "../stock/index.mjs";
import { addClip, footageDir, incomingFootage, loadLibrary } from "../footage/library.mjs";

const AGENT = "IdeaToVideo/0.1 (desktop video app; image search for public domain works)";
const PAGE = 12;

async function getJson(url, { fetchImpl = fetch, label }) {
  let res;
  try {
    res = await retrying(fetchImpl)(url, { headers: { "user-agent": AGENT, accept: "application/json" }, timeout: 30000 });
  } catch (e) {
    throw new Error(`Could not reach ${label}: ${e.message}`);
  }
  if (!res.ok) throw new Error(`${label} answered with HTTP ${res.status}. Try again later.`);
  return readJson(res, label);
}

const keep = (hits) => hits.filter((h) => !refusal(h));
const strip = (s) => String(s ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const today = () => new Date().toISOString().slice(0, 10);

// ---- Openverse (license filter cc0 and pdm) -----------------------------------------

export function openverseHits(json) {
  return keep(
    (json?.results ?? []).map((r) => ({
      id: String(r.id),
      source: "openverse",
      title: strip(r.title),
      tags: (r.tags ?? []).map((t) => t?.name ?? "").filter(Boolean),
      sourceUrl: r.foreign_landing_url,
      imageUrl: r.url,
      preview: r.thumbnail ?? r.url,
      license: r.license === "cc0" ? "cc0" : r.license === "pdm" ? "pd" : String(r.license ?? ""),
      licenseUrl: r.license_url ?? null,
      width: r.width ?? null,
      author: strip(r.creator) || "unknown",
      date: today(),
    })),
  );
}
export async function searchOpenverse({ q, fetchImpl }) {
  const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&license=cc0,pdm&mature=false&page_size=${PAGE}`;
  return openverseHits(await getJson(url, { fetchImpl, label: "Openverse" }));
}

// ---- Wikimedia Commons (PD and CC0 only) --------------------------------------------

// Commons' own license names to this module's words.
export function commonsLicense(meta = {}) {
  const short = String(meta.LicenseShortName?.value ?? "").toLowerCase();
  const code = String(meta.License?.value ?? "").toLowerCase();
  if (code === "cc0" || /^cc0\b/.test(short)) return "cc0";
  if (/^pd-usgov/.test(code) || /pd.*us ?gov/.test(short)) return "us-federal";
  if (code === "pd" || /^pd\b/.test(code) || /^public domain$/.test(short) || /^pd\b/.test(short)) return "pd";
  return "";
}
export function wikimediaHits(json) {
  const pages = Object.values(json?.query?.pages ?? {});
  return keep(
    pages.map((p) => {
      const info = p.imageinfo?.[0] ?? {};
      const meta = info.extmetadata ?? {};
      return {
        id: String(p.pageid),
        source: "wikimedia",
        title: strip(meta.ObjectName?.value ?? p.title).replace(/^File:/, ""),
        tags: strip(meta.Categories?.value).split("|").filter(Boolean),
        sourceUrl: info.descriptionurl,
        imageUrl: info.url,
        preview: info.thumburl ?? info.url,
        license: commonsLicense(meta),
        licenseUrl: meta.LicenseUrl?.value ?? null,
        width: info.width ?? null,
        author: strip(meta.Artist?.value) || "unknown",
        date: today(),
      };
    }),
  );
}
export async function searchWikimedia({ q, fetchImpl }) {
  const u = new URL("https://commons.wikimedia.org/w/api.php");
  for (const [k, v] of Object.entries({ action: "query", format: "json", generator: "search", gsrnamespace: "6", gsrlimit: String(PAGE * 2), gsrsearch: `${q} filetype:bitmap`, prop: "imageinfo", iiprop: "url|size|extmetadata", iiurlwidth: "480" })) u.searchParams.set(k, v);
  return wikimediaHits(await getJson(u.toString(), { fetchImpl, label: "Wikimedia Commons" })).slice(0, PAGE);
}

// ---- Library of Congress ("no known restrictions") ----------------------------------

export function locHits(json) {
  return keep(
    (json?.results ?? []).map((r) => {
      const rights = [r.rights_advisory, r.item?.rights_advisory, r.rights].flat().filter(Boolean).join(" ");
      const images = (r.image_url ?? []).filter((x) => typeof x === "string");
      const fix = (u) => (u?.startsWith("//") ? `https:${u}` : u);
      return {
        id: String(r.id ?? r.url),
        source: "loc",
        title: strip(r.title),
        tags: [...(r.subject ?? [])],
        sourceUrl: fix(r.url ?? r.id),
        imageUrl: fix(images.at(-1)),
        preview: fix(images[0]),
        license: /no known restrictions/i.test(rights) ? "no-known-restrictions" : "",
        licenseUrl: "https://www.loc.gov/legal/",
        author: strip([r.contributor ?? []].flat()[0]) || "unknown",
        date: today(),
      };
    }),
  ).filter((h) => h.imageUrl);
}
export async function searchLoc({ q, fetchImpl }) {
  const url = `https://www.loc.gov/photos/?q=${encodeURIComponent(q)}&fo=json&c=${PAGE * 2}`;
  return locHits(await getJson(url, { fetchImpl, label: "The Library of Congress" })).slice(0, PAGE);
}

// ---- NASA (US federal works, nothing it marks as someone else's) ----------------------

// NASA's own works are public domain; its site also hosts other people's. A
// copyright notice, a credit to someone else, or a named creator that does not
// say NASA (a launch company's own film) is not NASA's to give, so it stays out.
export function nasaBlocked(d) {
  const credit = [d?.photographer, d?.secondary_creator].filter(Boolean).join(" ");
  if (credit && !/\bnasa\b/i.test(credit)) return true;
  return /©|copyright|courtesy|all rights reserved|credit:\s*(?!\s|nasa\b)/i.test(`${d?.description ?? ""} ${credit}`);
}
export const nasaHit = (item, kind) => {
  const d = item?.data?.[0];
  if (!d?.nasa_id || nasaBlocked(d)) return null;
  return {
    id: String(d.nasa_id),
    source: "nasa",
    kind,
    title: strip(d.title),
    tags: (d.keywords ?? []).map(String),
    sourceUrl: `https://images.nasa.gov/details/${encodeURIComponent(d.nasa_id)}`,
    preview: item.links?.find((l) => l.render === "image")?.href ?? null,
    license: "us-federal",
    licenseUrl: "https://www.nasa.gov/nasa-brand-center/images-and-media/",
    author: strip(d.photographer ?? d.secondary_creator ?? d.center) || "NASA",
    date: today(),
    collection: item.href ?? null,
  };
};
export function nasaImageHits(json) {
  return keep((json?.collection?.items ?? []).map((item) => {
    const hit = nasaHit(item, "image");
    if (!hit) return null;
    const large = item.links?.find((l) => /~(large|orig)\.(jpe?g|png)$/i.test(l.href ?? ""));
    return large ? { ...hit, imageUrl: large.href, width: large.width ?? null } : null;
  }).filter(Boolean));
}
export async function searchNasaImages({ q, fetchImpl }) {
  return nasaImageHits(await getJson(`https://images-api.nasa.gov/search?q=${encodeURIComponent(q)}&media_type=image&page_size=${PAGE}`, { fetchImpl, label: "NASA" }));
}

export const SEARCHERS = { openverse: searchOpenverse, wikimedia: searchWikimedia, nasa: searchNasaImages, loc: searchLoc };

/** Every source at once. One that fails does not hide the others. */
export async function searchAll({ q, sources = Object.keys(SEARCHERS), fetchImpl }) {
  const text = String(q ?? "").trim();
  if (!text) throw new Error("Type what the image should show.");
  const results = await Promise.allSettled(sources.map((s) => SEARCHERS[s]({ q: text, fetchImpl })));
  return {
    hits: results.flatMap((r) => (r.status === "fulfilled" ? r.value : [])),
    failed: results.flatMap((r, i) => (r.status === "rejected" ? [{ source: SOURCES[sources[i]].label, message: String(r.reason?.message ?? r.reason) }] : [])),
  };
}

/** A picture for the results grid, cached in the app's own folder. */
export async function cachePreview({ url, dir, fetchImpl = fetch }) {
  const out = path.join(dir, `${createHash("sha256").update(String(url)).digest("hex").slice(0, 32)}.jpg`);
  if (fs.existsSync(out)) return out;
  const res = await retrying(fetchImpl)(url, { headers: { "user-agent": AGENT }, timeout: 30000 });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  return out;
}

/** An allowed image into the Identity's footage library, with its license. */
export async function addFreeImage({ identityDir, hit, about = "", fetchImpl = fetch, env = process.env }) {
  const why = refusal(hit);
  if (why) throw new Error(why);
  if (!hit.imageUrl) throw new Error("This result has no image to download.");
  const have = loadLibrary(identityDir).clips.find((c) => c.credit?.pageUrl === hit.sourceUrl);
  if (have) return { clip: have, again: true };
  const dir = footageDir(identityDir);
  fs.mkdirSync(dir, { recursive: true });
  const img = path.join(dir, `free-${createHash("sha256").update(hit.sourceUrl).digest("hex").slice(0, 16)}${path.extname(new URL(hit.imageUrl).pathname) || ".jpg"}`);
  const res = await retrying(fetchImpl)(hit.imageUrl, { headers: { "user-agent": AGENT }, timeout: 120000 });
  if (!res.ok) throw new Error(`Could not download the image: HTTP ${res.status}.`);
  fs.writeFileSync(img, Buffer.from(await res.arrayBuffer()));
  const target = incomingFootage(".mp4");
  try {
    await photoClip(img, path.join(dir, target), { env });
  } finally {
    fs.rmSync(img, { force: true });
  }
  const label = SOURCES[hit.source].label;
  const clip = await addClip({
    identityDir,
    file: target,
    name: `Image: ${hit.title || label}`.slice(0, 80),
    // what it is for comes first: the scene planner matches this text to the sentences
    description: `${about ? `${String(about).trim().slice(0, 240)} ` : ""}${hit.title || "A public domain image"} (${label}).`.slice(0, 400),
    source: hit.source,
    credit: { source: label, sourceId: hit.source, id: hit.id, kind: "image", author: hit.author, license: hit.licenseName ?? hit.license, licenseKey: hit.license, licenseUrl: hit.licenseUrl ?? null, pageUrl: hit.sourceUrl, date: hit.date },
    env,
  });
  return { clip, again: false };
}
