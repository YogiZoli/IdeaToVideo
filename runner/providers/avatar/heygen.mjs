// avatar/heygen.mjs: the HeyGen v3 API with the user's own key (DECISIONS 47).
// The avatar says the video's own narration: a stretch of the approved voice
// is uploaded as an asset and lip-synced onto the chosen look ("Audio to
// Video", POST /v3/videos with audio_asset_id). Nothing is read twice and the
// voice stays the same all through the video.
//
// Docs (2026-09-30): developers.heygen.com, pages audio-to-video, assets,
// docs/avatar-looks, user-profile, reference/get-video, docs/error-codes.

import fs from "node:fs";
import path from "node:path";
import { redact } from "../llm.mjs";

const API = "https://api.heygen.com";

// Public figures, for the estimate only (2026: about 0.0167 to 0.0667 USD per
// second, by engine). The real balance comes from the account (balance()).
export const USD_PER_SECOND = { low: 0.0167, high: 0.0667 };
export const estimateUsd = (seconds) => ({ low: Math.round(seconds * USD_PER_SECOND.low * 100) / 100, high: Math.round(seconds * USD_PER_SECOND.high * 100) / 100 });

export function friendly(status, body) {
  let code = "";
  let message = "";
  try {
    const e = JSON.parse(body)?.error ?? {};
    code = e.code ?? "";
    message = e.message ?? "";
  } catch {
    // not JSON
  }
  if (status === 401 || status === 403) return "HeyGen rejected the API key. Check it in Settings.";
  if (status === 402) return "Your HeyGen API balance is too low for this. Top it up at app.heygen.com (API, not the web plan), then try again.";
  if (status === 429) return `HeyGen said: ${message || "too many requests or a usage limit"}${code ? ` (${code})` : ""}. Wait a little and try again.`;
  if (status >= 500) return `HeyGen is having problems right now (HTTP ${status}). Try again in a few minutes.`;
  return `HeyGen refused the request (HTTP ${status}${code ? `, ${code}` : ""}): ${message.slice(0, 200)}`;
}

async function call(apiKey, pathname, { method = "GET", body, fetchImpl = fetch, timeoutMs = 60000, raw = false } = {}) {
  if (!apiKey) throw new Error("No HeyGen API key. Add it in Settings.");
  let res;
  try {
    res = await fetchImpl(`${API}${pathname}`, {
      method,
      headers: { "x-api-key": apiKey, ...(body && !(body instanceof FormData) ? { "content-type": "application/json" } : {}) },
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new Error(`Could not reach HeyGen: ${redact(e.message, apiKey)}`);
  }
  const text = redact(await res.text().catch(() => ""), apiKey);
  if (!res.ok) throw new Error(friendly(res.status, text));
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("HeyGen answered with something that is not JSON.");
  }
  return raw ? json : json.data;
}

// Every page of a list endpoint (cursor pagination, at most `pages` pages).
async function all(apiKey, pathname, fetchImpl, pages = 5) {
  const out = [];
  let token = "";
  for (let page = 0; page < pages; page++) {
    const sep = pathname.includes("?") ? "&" : "?";
    const r = await call(apiKey, `${pathname}${token ? `${sep}token=${encodeURIComponent(token)}` : ""}`, { fetchImpl, raw: true });
    out.push(...(r?.data ?? []));
    if (!r?.has_more || !r.next_token) break;
    token = r.next_token;
  }
  return out;
}

const shapeLook = (l) => ({
  id: l.id,
  name: l.name,
  type: l.avatar_type,
  gender: l.gender ?? null,
  image: l.preview_image_url ?? null,
  video: l.preview_video_url ?? null,
  engines: l.supported_api_engines ?? [],
  status: l.status ?? null,
});

const GROUP_STATUS = {
  processing: "still training at HeyGen",
  pending_consent: "waiting for your consent at HeyGen",
  failed: "training failed at HeyGen",
};

// What the user can pick, the way HeyGen organises it: their own avatars
// (characters), each with its looks; then a page of HeyGen's stock looks. An
// own avatar that is not ready yet is listed with the reason, so the user
// sees why it cannot be chosen.
export async function listAvatars({ apiKey, fetchImpl, stockLimit = 30 }) {
  const groups = await all(apiKey, "/v3/avatars?ownership=private&limit=50", fetchImpl);
  const own = [];
  for (const g of groups) {
    const ready = !g.status || g.status === "completed";
    const looks = ready ? (await all(apiKey, `/v3/avatars/looks?group_id=${encodeURIComponent(g.id)}&limit=50`, fetchImpl)).map(shapeLook) : [];
    own.push({
      id: g.id,
      name: g.name,
      image: g.preview_image_url ?? null,
      status: g.status ?? "completed",
      note: ready ? (looks.length ? null : "no looks yet") : (GROUP_STATUS[g.status] ?? g.status),
      looks: looks.filter((l) => !l.status || l.status === "completed"),
    });
  }
  const stock = ((await call(apiKey, `/v3/avatars/looks?ownership=public&limit=${stockLimit}`, { fetchImpl, raw: true }))?.data ?? []).map(shapeLook);
  return { own, stock };
}

// The account's remaining money or credits, as HeyGen reports it.
export async function balance({ apiKey, fetchImpl }) {
  const d = await call(apiKey, "/v3/users/me", { fetchImpl });
  if (d?.billing_type === "wallet") return { kind: "wallet", remaining: d.wallet?.remaining_balance ?? null, currency: d.wallet?.currency ?? "usd" };
  if (d?.billing_type === "subscription") return { kind: "subscription", remaining: d.subscription?.credits?.premium_credits?.remaining ?? null, currency: "credits", plan: d.subscription?.plan ?? null };
  return { kind: d?.billing_type ?? "unknown", remaining: null, currency: null };
}

export async function uploadAudio({ apiKey, file, fetchImpl }) {
  const form = new FormData();
  form.append("file", new Blob([fs.readFileSync(file)], { type: "audio/mpeg" }), path.basename(file));
  const d = await call(apiKey, "/v3/assets", { method: "POST", body: form, fetchImpl, timeoutMs: 120000 });
  if (!d?.asset_id) throw new Error("HeyGen did not return an asset id for the audio.");
  return d.asset_id;
}

export async function createVideo({ apiKey, avatarId, audioAssetId, background, title, fetchImpl }) {
  const d = await call(apiKey, "/v3/videos", {
    method: "POST",
    fetchImpl,
    body: {
      type: "avatar",
      avatar_id: avatarId,
      audio_asset_id: audioAssetId,
      background: { type: "color", value: background },
      aspect_ratio: "16:9",
      resolution: "1080p",
      fit: "cover",
      title,
    },
  });
  if (!d?.video_id) throw new Error("HeyGen did not return a video id.");
  return d.video_id;
}

export async function getVideo({ apiKey, id, fetchImpl }) {
  return call(apiKey, `/v3/videos/${encodeURIComponent(id)}`, { fetchImpl });
}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Polls until the video is ready, then downloads it to `out`.
export async function waitAndDownload({ apiKey, id, out, fetchImpl = fetch, sleep = defaultSleep, everyMs = 10000, timeoutMs = 30 * 60000, onStatus = () => {} }) {
  const t0 = Date.now();
  for (;;) {
    const v = await getVideo({ apiKey, id, fetchImpl });
    onStatus(v?.status);
    if (v?.status === "completed" && v.video_url) {
      const res = await fetchImpl(v.video_url, { signal: AbortSignal.timeout(300000) });
      if (!res.ok) throw new Error(`Could not download the avatar clip (HTTP ${res.status}).`);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
      return { file: out, seconds: v.duration ?? null };
    }
    if (v?.status === "failed") throw new Error(`HeyGen could not make the avatar clip: ${v.failure_message || v.failure_code || "no reason given"}.`);
    if (Date.now() - t0 > timeoutMs) throw new Error("HeyGen is taking longer than 30 minutes. The clip may still arrive in your HeyGen account; try again later.");
    await sleep(everyMs);
  }
}

// Preview images and videos, cached in the app's folder (the UI never loads a
// remote address). Only HeyGen's own hosts.
export function isHeygenUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && /(^|\.)heygen\.(ai|com|io)$/.test(u.hostname);
  } catch {
    return false;
  }
}

export async function cachePreview({ url, dir, fetchImpl = fetch }) {
  if (!isHeygenUrl(url)) throw new Error("Not a HeyGen preview address.");
  const ext = (/\.(jpe?g|png|webp|mp4|webm)(\?|$)/i.exec(url)?.[1] ?? "bin").toLowerCase();
  const name = Buffer.from(url.split("?")[0]).toString("base64url").slice(-80) + "." + ext;
  const file = path.join(dir, name);
  if (fs.existsSync(file)) return file;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`Could not load the preview (HTTP ${res.status}).`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}
