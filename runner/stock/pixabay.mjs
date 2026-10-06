// stock/pixabay.mjs: Pixabay photos and videos for the scenes (docs/stock.md,
// DECISIONS 104, 108, 111). The Pixabay Content License allows commercial
// use with no credit required; the API asks for three things, all kept here:
// search results are cached for 24 hours, files are downloaded (never
// hotlinked), and the search shows where the pictures come from (the UI).
// The key goes only in the request address, and never into a message.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { redact } from "../providers/llm.mjs";

const API = "https://pixabay.com/api/";
const CACHE_MS = 24 * 3600 * 1000;
export const LICENSE = { name: "Pixabay Content License", url: "https://pixabay.com/service/license-summary/" };

// Only Pixabay's own hosts are ever fetched (previews and files).
export function isPixabayUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && /(^|\.)pixabay\.com$/.test(u.hostname);
  } catch {
    return false;
  }
}

// One hit as the app keeps it. Images: the 1280 px file; videos: the
// 1920 px one when there is one (never 4K), else the next smaller.
export function shapeHit(kind, h) {
  if (kind === "video") {
    const v = h.videos ?? {};
    const file = [v.medium, v.small, v.tiny].find((x) => x?.url && x.width <= 1920) ?? null;
    if (!file) return null;
    return { id: String(h.id), kind, width: file.width, height: file.height, seconds: h.duration ?? null, tags: String(h.tags ?? ""), author: String(h.user ?? ""), pageUrl: String(h.pageURL ?? ""), preview: v.tiny?.thumbnail || v.small?.thumbnail || null, download: file.url };
  }
  if (!h.largeImageURL) return null;
  return { id: String(h.id), kind, width: h.imageWidth ?? null, height: h.imageHeight ?? null, seconds: null, tags: String(h.tags ?? ""), author: String(h.user ?? ""), pageUrl: String(h.pageURL ?? ""), preview: h.webformatURL || h.previewURL || null, download: h.largeImageURL };
}

const cacheFile = (dir, kind, q) => path.join(dir, `${kind}-${crypto.createHash("sha1").update(q.toLowerCase()).digest("hex").slice(0, 16)}.json`);

// A search: landscape, safe search, cached for a day per kind and words.
export async function search({ apiKey, q, kind = "image", cacheDir, fetchImpl = fetch, now = Date.now() }) {
  const query = String(q ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
  if (!query) throw new Error("Write what the picture should show.");
  if (kind !== "image" && kind !== "video") throw new Error("Pick photos or videos.");
  const cached = cacheDir ? cacheFile(cacheDir, kind, query) : null;
  if (cached && fs.existsSync(cached)) {
    const c = JSON.parse(fs.readFileSync(cached, "utf8"));
    if (now - c.at < CACHE_MS) return { hits: c.hits, cached: true };
  }
  if (!apiKey) throw new Error("No Pixabay key yet. Add a free key in Settings, Identity, Footage.");
  const params = new URLSearchParams({ key: apiKey, q: query, safesearch: "true", per_page: "18", order: "popular" });
  if (kind === "image") params.set("image_type", "photo"), params.set("orientation", "horizontal"), params.set("min_width", "1280");
  const url = `${API}${kind === "video" ? "videos/" : ""}?${params}`;
  let res;
  try {
    res = await fetchImpl(url, { signal: AbortSignal.timeout(30000) });
  } catch (e) {
    // the key travels in the address, so an address in a message is masked too
    throw new Error(`Could not reach Pixabay: ${redact(String(e.message), apiKey).replace(/key=[^&\s]+/g, "key=[hidden]")}`);
  }
  if (res.status === 429) throw new Error("Pixabay asks to slow down. Wait a minute and search again.");
  if (res.status === 400 || res.status === 401 || res.status === 403) throw new Error("Pixabay did not accept the key. Check it in Settings, Identity, Footage.");
  if (!res.ok) throw new Error(`Pixabay answered with HTTP ${res.status}. Try again later.`);
  const body = await res.json();
  const hits = (body.hits ?? []).map((h) => shapeHit(kind, h)).filter(Boolean);
  if (cached) {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cached, JSON.stringify({ at: now, q: query, kind, hits }));
  }
  return { hits, cached: false };
}

// A hit from the cache by id: what the UI sends back is only the id, the
// download address always comes from Pixabay's own answer.
export function cachedHit(cacheDir, kind, q, id) {
  const file = cacheFile(cacheDir, kind, String(q ?? "").replace(/\s+/g, " ").trim().slice(0, 100));
  if (!fs.existsSync(file)) throw new Error("Search again: the result is no longer in the list.");
  const hit = JSON.parse(fs.readFileSync(file, "utf8")).hits.find((h) => h.id === String(id));
  if (!hit) throw new Error("Search again: the result is no longer in the list.");
  return hit;
}

// A preview picture in the app's folder (the UI loads no remote address).
export async function cachePreview({ url, dir, fetchImpl = fetch }) {
  if (!isPixabayUrl(url)) throw new Error("Not a Pixabay address.");
  const ext = (/\.(jpe?g|png|webp)(\?|$)/i.exec(url)?.[1] ?? "jpg").toLowerCase();
  const file = path.join(dir, `${crypto.createHash("sha1").update(url).digest("hex").slice(0, 20)}.${ext}`);
  if (fs.existsSync(file)) return file;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Could not load the preview (HTTP ${res.status}).`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

export async function download({ hit, out, fetchImpl = fetch }) {
  if (!isPixabayUrl(hit.download)) throw new Error("Not a Pixabay address.");
  const res = await fetchImpl(hit.download, { signal: AbortSignal.timeout(300000) });
  if (!res.ok) throw new Error(`Could not download from Pixabay (HTTP ${res.status}).`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  return out;
}
