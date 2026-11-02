// generate/kie.mjs: AI clips through Kie AI, with the user's own key (docs/
// BUILD_PLAN.md phase 1b). Seedance 1.0 Lite: the cheapest model on Kie AI's
// price list that gives a real 16:9 clip of about 5 seconds (2026-11-02).
//
// Docs (2026-11-02): docs.kie.ai, market/quickstart, market/bytedance/
// v1-lite-text-to-video, v1-lite-image-to-video, market/common/get-task-detail.
//   POST /api/v1/jobs/createTask { model, input: { prompt, aspect_ratio,
//     resolution "480p" | "720p" | "1080p", duration "5" | "10", image_url,
//     enable_safety_checker } } -> { code, msg, data: { taskId } }
//   GET  /api/v1/jobs/recordInfo?taskId= -> { data: { state waiting | queuing |
//     generating | success | fail, resultJson: "{\"resultUrls\":[...]}", failMsg } }
//   GET  /api/v1/chat/credit -> { data: credits }
// The answer is HTTP 200 even for many failures: `code` is what counts. A failed
// task is not charged. The key goes only in the Authorization header.

import fs from "node:fs";
import path from "node:path";
import { redact } from "../providers/llm.mjs";
import { BusyError, busyStatus } from "../providers/retry.mjs";

const API = "https://api.kie.ai/api/v1";
const UPLOAD = "https://kieai.redpandaai.co/api/file-base64-upload";
export const MODEL = { text: "bytedance/v1-lite-text-to-video", image: "bytedance/v1-lite-image-to-video" };
// Kie AI's price list: 1 credit is about 0.005 USD.
export const USD_PER_CREDIT = 0.005;
const POLL_LIMIT_MS = 30 * 60 * 1000;

// ---- what a prompt may never say ----------------------------------------------------

// Nothing in a prompt may name a real person, brand, logo, character or artist.
// A name is told by its capital inside a sentence, however unknown it is. The
// list catches the famous ones written in small letters or first in a sentence.
const NAMES = /\b(disney|pixar|marvel|dreamworks|ghibli|nintendo|pok[eé]mon|lego|barbie|star wars|harry potter|mickey mouse|batman|superman|spider-?man|iron man|darth vader|coca-?cola|pepsi|nike|adidas|mcdonald'?s|starbucks|google|microsoft|facebook|instagram|tiktok|youtube|netflix|amazon|iphone|tesla|samsung|nasa|trump|biden|obama|putin|elon musk|taylor swift|picasso|van gogh|rembrandt|da vinci|banksy|warhol|dali|monet|greg rutkowski)\b/i;
const STYLE_OF = /\b(in the style of|style of|inspired by|by the artist|logo|trademark|™|®|©)\b|[™®©]/i;
const OK_CAPS = new Set(["I", "HD", "4K", "8K", "3D", "2D", "CGI", "DSLR", "POV"]);

/** Why this prompt may not be sent, or null when it may. */
export function promptRefusal(prompt) {
  const text = String(prompt ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "The clip has no picture description.";
  // "no logos, no text" names nothing: the rule is about what it asks for
  const asked = text.replace(/\b(no|without|never|not any)\s+(visible\s+|readable\s+)?(text|letters|logos?|trademarks?|brand names?|brands?|captions?|signs?)(\s*(,|or|and|nor)\s*(text|letters|logos?|trademarks?|brand names?|brands?|captions?|signs?))*/gi, "");
  const name = NAMES.exec(asked)?.[0];
  if (name) return `The prompt names "${name}". Prompts never name a real person, brand, logo, character or artist.`;
  if (STYLE_OF.test(asked)) return "The prompt asks for a logo or for someone's style. Prompts never name a real person, brand, logo, character or artist.";
  for (const sentence of asked.split(/(?<=[.!?:;])\s+/)) {
    const [, ...rest] = sentence.trim().split(" ");
    const proper = rest.map((w) => w.replace(/[^\p{L}\p{N}-]/gu, "")).find((w) => /^\p{Lu}/u.test(w) && !OK_CAPS.has(w));
    if (proper) return `The prompt seems to name "${proper}" (a capital inside a sentence). Prompts never name a real person, brand, logo, character or artist: describe it in plain words.`;
  }
  return null;
}

// ---- the requests ---------------------------------------------------------------------

export function orderBody({ prompt, seconds = 5, quality = "720p", aspect = "16:9", imageUrl = null }) {
  const why = promptRefusal(prompt);
  if (why) throw new Error(why);
  if (!["480p", "720p", "1080p"].includes(quality)) throw new Error(`Unknown quality: ${quality}.`);
  const input = { prompt: String(prompt).replace(/\s+/g, " ").trim().slice(0, 10000), resolution: quality, duration: Number(seconds) > 7 ? "10" : "5", camera_fixed: false, enable_safety_checker: true };
  if (imageUrl) return { model: MODEL.image, input: { ...input, image_url: imageUrl } };
  return { model: MODEL.text, input: { ...input, aspect_ratio: aspect } };
}

// One call. Waiting helps only a busy service; a refused key or no credits does not.
async function call(url, { apiKey, method = "GET", body, fetchImpl = fetch }) {
  let res;
  try {
    res = await fetchImpl(url, { method, headers: { authorization: `Bearer ${apiKey}`, ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(120000) });
  } catch (e) {
    throw new BusyError(`Could not reach Kie AI: ${redact(String(e.message), apiKey)}`);
  }
  const text = await res.text().catch(() => "");
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON: the status below says what it is
  }
  const code = Number(json?.code ?? res.status);
  if (res.ok && code === 200) return json;
  const why = redact(String(json?.msg ?? "").slice(0, 200), apiKey);
  if (code === 401 || res.status === 401 || res.status === 403) throw new Error("Kie AI rejected the API key. Check it in Settings, Connections.");
  if (code === 402) throw new Error("Kie AI says the account has too few credits. Nothing was made. Add credits at kie.ai, then approve again.");
  if (busyStatus(code) || busyStatus(res.status) || code === 455) throw new BusyError(`Kie AI is busy (${why || code}).`, { status: code });
  throw new Error(`Kie AI refused the request (${code}${why ? `: ${why}` : ""}).`);
}

// A still for image to video: Kie AI keeps an upload for 24 hours.
export async function uploadStill({ apiKey, file, fetchImpl }) {
  const data = `data:image/jpeg;base64,${fs.readFileSync(file).toString("base64")}`;
  const r = await call(UPLOAD, { apiKey, method: "POST", fetchImpl, body: { base64Data: data, uploadPath: "ideatovideo", fileName: path.basename(file) } });
  const url = r?.data?.downloadUrl;
  if (!url) throw new Error("Kie AI did not return an address for the still.");
  return url;
}

// Places the order, returns Kie AI's task id. `image`: start from this still.
export async function order({ apiKey, prompt, seconds, quality, aspect, image = null, fetchImpl }) {
  const imageUrl = image && fs.existsSync(image) ? await uploadStill({ apiKey, file: image, fetchImpl }) : null;
  const r = await call(`${API}/jobs/createTask`, { apiKey, method: "POST", fetchImpl, body: orderBody({ prompt, seconds, quality, aspect, imageUrl }) });
  const id = r?.data?.taskId;
  if (!id) throw new Error("Kie AI did not return a task id.");
  return id;
}

export async function getTask({ apiKey, id, fetchImpl }) {
  return (await call(`${API}/jobs/recordInfo?taskId=${encodeURIComponent(id)}`, { apiKey, fetchImpl }))?.data ?? {};
}

export function resultUrl(task) {
  try {
    const u = JSON.parse(task.resultJson ?? "{}").resultUrls?.[0];
    return typeof u === "string" && /^https:\/\//i.test(u) ? u : null;
  } catch {
    return null;
  }
}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Waits for the clip and downloads it to `out`. A lost connection only means
// "ask again"; the order is not given up, and it costs nothing more.
export async function fetchClip({ apiKey, id, out, fetchImpl = fetch, sleep = defaultSleep, onStatus = () => {}, limitMs = POLL_LIMIT_MS }) {
  const t0 = Date.now();
  for (;;) {
    let task = null;
    try {
      task = await getTask({ apiKey, id, fetchImpl });
    } catch (e) {
      if (!e.transient) throw e;
    }
    if (task?.state) onStatus(task.state);
    if (task?.state === "fail") throw new Error(`Kie AI could not make the B-roll clip: ${redact(String(task.failMsg ?? "no reason given").slice(0, 200), apiKey)}. A failed clip is not charged.`);
    if (task?.state === "success") {
      const url = resultUrl(task);
      if (!url) throw new Error("Kie AI could not make the B-roll clip: its answer has no video address.");
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(300000) });
      if (!res.ok) throw new BusyError(`Could not download the clip (HTTP ${res.status}).`, { status: res.status });
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
      return { file: out };
    }
    if (Date.now() - t0 > limitMs) throw new BusyError("Kie AI is still working on the clip. Press the button again later: the order is kept and is not paid twice.");
    await sleep(8000);
  }
}

// The account's balance, a free request: also what "Test key" uses.
export async function balance({ apiKey, fetchImpl }) {
  if (!apiKey) throw new Error("No API key set for Kie AI. Add it in Settings.");
  const r = await call(`${API}/chat/credit`, { apiKey, fetchImpl });
  const credits = Number(r?.data);
  return { credits: Number.isFinite(credits) ? credits : null, usd: Number.isFinite(credits) ? Math.round(credits * USD_PER_CREDIT * 100) / 100 : null };
}
