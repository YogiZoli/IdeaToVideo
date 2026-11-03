// stock/unsplash.mjs: Unsplash photos for the scenes (docs/stock.md,
// DECISIONS 117). Photos only. The key is the user's own Access Key (BYOK);
// the Secret key is never asked for. The API Guidelines ask for four things,
// all kept here or in the panel:
//   - the pictures are shown from the addresses the API returns (hotlinked
//     previews, images.unsplash.com), never copied to another host;
//   - when the user picks a photo, its links.download_location is called
//     (download tracking) before the file is fetched;
//   - the panel credits every photo: "Photo by X on Unsplash", both linked,
//     with utm_source and utm_medium=referral;
//   - no automated use: only what the user searches and picks.
// Demo mode allows 50 requests an hour, so searches are cached for an hour
// and the rate limit gets a plain message.

import { retrying, readJson } from "../net.mjs";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { redact } from "../providers/llm.mjs";

const API = "https://api.unsplash.com";
const CACHE_MS = 3600 * 1000;
export const UTM = "utm_source=ideatovideo&utm_medium=referral";
export const LICENSE = { name: "Unsplash License", url: "https://unsplash.com/license" };
export const RATE_LIMIT_MESSAGE = "Unsplash allows 50 searches an hour while the key is in Demo mode. Wait a while (the limit resets every hour), or search Pixabay meanwhile.";

const isHost = (url, re) => {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && re.test(u.hostname);
  } catch {
    return false;
  }
};
// Files and previews only from Unsplash's image host; tracking only to its API.
export const isUnsplashImageUrl = (url) => isHost(url, /^(images|plus)\.unsplash\.com$/);
export const isUnsplashApiUrl = (url) => isHost(url, /^api\.unsplash\.com$/);

// A link with the referral parameters the guidelines ask for.
export function withUtm(url) {
  if (!url) return "";
  return `${url}${url.includes("?") ? "&" : "?"}${UTM}`;
}

// One photo as the app keeps it. The file is the raw address resized by
// Unsplash to 1920 px wide (still their hotlinked address).
export function shapeHit(p) {
  if (!p?.id || !p.urls?.raw || !p.links?.download_location) return null;
  const sep = p.urls.raw.includes("?") ? "&" : "?";
  return {
    id: String(p.id),
    kind: "image",
    width: p.width ?? null,
    height: p.height ?? null,
    seconds: null,
    tags: String(p.alt_description || p.description || "photo").slice(0, 120),
    author: String(p.user?.name ?? ""),
    authorUrl: withUtm(p.user?.links?.html ?? ""),
    pageUrl: withUtm(p.links?.html ?? ""),
    preview: p.urls.small || p.urls.thumb || null,
    download: `${p.urls.raw}${sep}w=1920&fm=jpg&q=85`,
    downloadLocation: p.links.download_location,
  };
}

const cacheFile = (dir, q) => path.join(dir, `unsplash-${crypto.createHash("sha1").update(q.toLowerCase()).digest("hex").slice(0, 16)}.json`);
const clean = (q) => String(q ?? "").replace(/\s+/g, " ").trim().slice(0, 100);

const headers = (apiKey) => ({ Authorization: `Client-ID ${apiKey}`, "Accept-Version": "v1" });

// What went wrong, in words; the limit is a 403 (or 429) with no requests left.
export function failure(res) {
  const left = res.headers?.get?.("x-ratelimit-remaining");
  if (res.status === 429 || (res.status === 403 && left === "0")) return RATE_LIMIT_MESSAGE;
  if (res.status === 401 || res.status === 403) return "Unsplash did not accept the key. Use the Access Key (not the Secret key) in Settings, Connections.";
  return `Unsplash answered with HTTP ${res.status}. Try again later.`;
}

async function get(url, apiKey, fetchImpl, what) {
  try {
    return await retrying(fetchImpl)(url, { headers: headers(apiKey), timeout: 30000 });
  } catch (e) {
    throw new Error(`Could not reach Unsplash${what}: ${redact(String(e.message), apiKey)}`);
  }
}

// A search: landscape, safe content, 18 photos, cached for an hour.
export async function search({ apiKey, q, kind = "image", cacheDir, fetchImpl = fetch, now = Date.now() }) {
  const query = clean(q);
  if (!query) throw new Error("Write what the picture should show.");
  if (kind !== "image") throw new Error("Unsplash has photos only. Pick Photos, or search Pixabay for videos.");
  const cached = cacheDir ? cacheFile(cacheDir, query) : null;
  if (cached && fs.existsSync(cached)) {
    const c = JSON.parse(fs.readFileSync(cached, "utf8"));
    if (now - c.at < CACHE_MS) return { hits: c.hits, cached: true };
  }
  if (!apiKey) throw new Error("No Unsplash key yet. Add your Access Key in Settings, Connections.");
  const params = new URLSearchParams({ query, per_page: "18", orientation: "landscape", content_filter: "high" });
  const res = await get(`${API}/search/photos?${params}`, apiKey, fetchImpl, "");
  if (!res.ok) throw new Error(failure(res));
  const body = await readJson(res, "Unsplash");
  const hits = (body.results ?? []).map(shapeHit).filter(Boolean);
  if (cached) {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cached, JSON.stringify({ at: now, q: query, kind, hits }));
  }
  return { hits, cached: false };
}

// A hit from the cache by id (the UI sends back only the id).
export function cachedHit(cacheDir, kind, q, id) {
  const file = cacheFile(cacheDir, clean(q));
  if (!fs.existsSync(file)) throw new Error("Search again: the result is no longer in the list.");
  const hit = JSON.parse(fs.readFileSync(file, "utf8")).hits.find((h) => h.id === String(id));
  if (!hit) throw new Error("Search again: the result is no longer in the list.");
  return hit;
}

// Download tracking: the guidelines ask for this call whenever a photo is
// used. It counts against the hourly limit, the file itself does not.
export async function trackDownload({ apiKey, hit, fetchImpl = fetch }) {
  if (!isUnsplashApiUrl(hit.downloadLocation)) throw new Error("Not an Unsplash address.");
  if (!apiKey) throw new Error("No Unsplash key yet. Add your Access Key in Settings, Connections.");
  const res = await get(hit.downloadLocation, apiKey, fetchImpl, " to register the download");
  if (!res.ok) throw new Error(failure(res));
  return true;
}

export async function download({ hit, out, fetchImpl = fetch }) {
  if (!isUnsplashImageUrl(hit.download)) throw new Error("Not an Unsplash address.");
  const res = await retrying(fetchImpl)(hit.download, { timeout: 300000 });
  if (!res.ok) throw new Error(`Could not download from Unsplash (HTTP ${res.status}).`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  return out;
}
