// assets/video-sources.mjs: moving footage that costs nothing and needs no key
// (docs/BUILD_PLAN.md phase 1b): the Prelinger Archives on the Internet Archive,
// NASA media, and Wikimedia Commons, Public Domain and CC0 only. Like the image
// searches, each one reads the license again from the answer and drops whatever
// the license module refuses.

import { refusal, looksLikePerson } from "./license.mjs";
import { commonsLicense, nasaHit } from "./sources.mjs";

const AGENT = "IdeaToVideo/0.1 (desktop video app; footage search for public domain works)";
const PAGE = 8;

const strip = (s) => String(s ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const today = () => new Date().toISOString().slice(0, 10);
const keep = (hits) => hits.filter((h) => h && !refusal(h) && h.videoUrl);

async function getJson(url, { fetchImpl = fetch, label }) {
  let res;
  try {
    res = await fetchImpl(url, { headers: { "user-agent": AGENT, accept: "application/json" }, signal: AbortSignal.timeout(30000) });
  } catch (e) {
    throw new Error(`Could not reach ${label}: ${e.message}`);
  }
  if (!res.ok) throw new Error(`${label} answered with HTTP ${res.status}. Try again later.`);
  return res.json();
}

// ---- Prelinger Archives --------------------------------------------------------------

// The collection has no blanket license: only an item that itself says public
// domain or CC0 comes in. Items that say nothing are refused.
export function prelingerLicense(licenseurl) {
  const u = String(licenseurl ?? "").toLowerCase();
  if (/creativecommons\.org\/publicdomain\/zero/.test(u)) return "cc0";
  if (/creativecommons\.org\/(publicdomain\/mark|licenses\/publicdomain)/.test(u)) return "pd";
  return "";
}

// The H.264 file with the most pixels up to 1080 lines, else the largest MP4.
export function prelingerFile(files = []) {
  const mp4 = files.filter((f) => /\.mp4$/i.test(f.name ?? ""));
  const sized = (f) => Number(f.height) || 0;
  return mp4.filter((f) => sized(f) <= 1080).sort((a, b) => sized(b) - sized(a) || Number(b.size ?? 0) - Number(a.size ?? 0))[0] ?? null;
}

export function prelingerHit(doc, meta) {
  const file = prelingerFile(meta?.files);
  if (!file) return null;
  const id = String(doc.identifier);
  const url = (name) => `https://archive.org/download/${encodeURIComponent(id)}/${name.split("/").map(encodeURIComponent).join("/")}`;
  const thumb = (meta.files ?? []).find((f) => /^__ia_thumb\.jpg$/i.test(f.name ?? ""));
  return {
    id,
    source: "prelinger",
    kind: "video",
    title: strip(doc.title),
    tags: [doc.subject ?? []].flat().map(String),
    sourceUrl: `https://archive.org/details/${encodeURIComponent(id)}`,
    videoUrl: url(file.name),
    preview: thumb ? url(thumb.name) : null,
    seconds: Number(file.length) || Number(meta.metadata?.runtime) || null,
    width: Number(file.width) || null,
    license: prelingerLicense(doc.licenseurl),
    licenseUrl: doc.licenseurl ?? null,
    author: strip([doc.creator ?? []].flat()[0]) || "unknown",
    date: today(),
  };
}

export async function searchPrelinger({ q, fetchImpl }) {
  const words = String(q).split(/\s+/).filter(Boolean).map((w) => w.replace(/["():]/g, "")).filter(Boolean).join(" OR ");
  const params = new URLSearchParams({ q: `collection:prelinger AND mediatype:movies AND licenseurl:* AND (title:(${words}) OR subject:(${words}))`, rows: String(PAGE * 2), output: "json" });
  params.append("sort[]", "downloads desc");
  for (const f of ["identifier", "title", "licenseurl", "creator", "subject"]) params.append("fl[]", f);
  const found = await getJson(`https://archive.org/advancedsearch.php?${params}`, { fetchImpl, label: "The Internet Archive" });
  // only what can pass: the file list is one more request per item
  const docs = (found?.response?.docs ?? []).filter((d) => prelingerLicense(d.licenseurl) && !looksLikePerson({ title: d.title, tags: [d.subject ?? []].flat() })).slice(0, PAGE);
  const metas = await Promise.allSettled(docs.map((d) => getJson(`https://archive.org/metadata/${encodeURIComponent(d.identifier)}`, { fetchImpl, label: "The Internet Archive" })));
  return keep(docs.map((d, i) => (metas[i].status === "fulfilled" ? prelingerHit(d, metas[i].value) : null)));
}

// ---- NASA --------------------------------------------------------------------------------

// A video item's file list holds several sizes; 1080p-ish first, never the
// original master, which can be gigabytes.
export function nasaFile(list = []) {
  const mp4 = list.filter((u) => /\.mp4$/i.test(u)).map((u) => u.replace(/^http:/, "https:"));
  return ["~large", "~medium", "~small", "~mobile"].map((tag) => mp4.find((u) => u.includes(tag))).find(Boolean) ?? null;
}

export async function searchNasaVideo({ q, fetchImpl }) {
  const json = await getJson(`https://images-api.nasa.gov/search?q=${encodeURIComponent(q)}&media_type=video&page_size=${PAGE}`, { fetchImpl, label: "NASA" });
  const hits = (json?.collection?.items ?? []).map((item) => nasaHit(item, "video")).filter((h) => h?.collection && !looksLikePerson(h));
  const lists = await Promise.allSettled(hits.map((h) => getJson(h.collection.replace(/^http:/, "https:"), { fetchImpl, label: "NASA" })));
  return keep(hits.map((h, i) => (lists[i].status === "fulfilled" ? { ...h, videoUrl: nasaFile(lists[i].value) } : null)));
}

// ---- Wikimedia Commons --------------------------------------------------------------------

export function commonsVideoHits(json) {
  return keep(
    Object.values(json?.query?.pages ?? {}).map((p) => {
      const info = p.imageinfo?.[0] ?? {};
      const meta = info.extmetadata ?? {};
      return {
        id: String(p.pageid),
        source: "wikimedia",
        kind: "video",
        title: strip(meta.ObjectName?.value ?? p.title).replace(/^File:/, ""),
        tags: strip(meta.Categories?.value).split("|").filter(Boolean),
        sourceUrl: info.descriptionurl,
        videoUrl: info.url,
        preview: info.thumburl ?? null,
        seconds: Number(info.duration) || null,
        width: info.width ?? null,
        license: commonsLicense(meta),
        licenseUrl: meta.LicenseUrl?.value ?? null,
        author: strip(meta.Artist?.value) || "unknown",
        date: today(),
      };
    }),
  );
}

export async function searchCommonsVideo({ q, fetchImpl }) {
  const u = new URL("https://commons.wikimedia.org/w/api.php");
  for (const [k, v] of Object.entries({ action: "query", format: "json", generator: "search", gsrnamespace: "6", gsrlimit: String(PAGE * 2), gsrsearch: `${q} filetype:video`, prop: "imageinfo", iiprop: "url|size|extmetadata", iiurlwidth: "480" })) u.searchParams.set(k, v);
  return commonsVideoHits(await getJson(u.toString(), { fetchImpl, label: "Wikimedia Commons" })).slice(0, PAGE);
}

export const VIDEO_SEARCHERS = { prelinger: searchPrelinger, nasa: searchNasaVideo, wikimedia: searchCommonsVideo };

/** Every video source at once. One that fails does not hide the others. */
export async function searchVideos({ q, sources = Object.keys(VIDEO_SEARCHERS), fetchImpl }) {
  const results = await Promise.allSettled(sources.map((s) => VIDEO_SEARCHERS[s]({ q, fetchImpl })));
  return {
    hits: results.flatMap((r) => (r.status === "fulfilled" ? r.value : [])),
    failed: results.flatMap((r, i) => (r.status === "rejected" ? [{ source: sources[i], message: String(r.reason?.message ?? r.reason) }] : [])),
  };
}
