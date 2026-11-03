// elevenlabs.mjs: Narrator Voice through the user's own ElevenLabs key (the user
// pays; the free ElevenLabs plan has no commercial rights, the UI says so).
//   listVoices   the voices in the user's account, with a preview URL
//   speak        one block of text -> mp3 bytes + word timings
// The key only ever goes into the request header, never into a message.

import { retrying } from "../../net.mjs";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { redact } from "../llm.mjs";
import { wordsFromCharacters } from "./align.mjs";
import { BusyError, patiently, busyStatus } from "../retry.mjs";

const BASE = "https://api.elevenlabs.io";
// Eleven v4 is the default since 2026-10-06: Zoltan listened to both and v4
// reads clearly better, Hungarian included (his test: a 286 s Hungarian
// voice with v4 and language_code "hu"). Multilingual v2 stays selectable.
export const DEFAULT_MODEL = "eleven_v4";
// Multilingual v2 refuses a language_code ("unsupported_language" for "hu",
// 2026-10-06); it picks the language from the text itself.
const TAKES_LANGUAGE_CODE = (model) => model !== "eleven_multilingual_v2";
// A calm teaching read: speed below 1.0 is easier to follow.
export const DEFAULT_SETTINGS = { stability: 0.62, similarity_boost: 0.8, style: 0, speed: 0.96, use_speaker_boost: true };

async function call(path, { apiKey, fetchImpl = fetch, method = "GET", body, timeoutMs = 120000 }) {
  if (!apiKey) throw new Error("No API key set for ElevenLabs. Add it in Settings.");
  let res;
  try {
    res = await fetchImpl(BASE + path, {
      method,
      headers: { "xi-api-key": apiKey, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new BusyError(`Could not reach ElevenLabs: ${redact(e.message, apiKey)}`);
  }
  if (res.ok) return res.json();
  const text = redact(await res.text().catch(() => ""), apiKey);
  let reason = "";
  try {
    const d = JSON.parse(text).detail;
    reason = [d?.status, d?.message].filter((x) => typeof x === "string" && x).join(": ").slice(0, 200);
  } catch {
    reason = "";
  }
  const why = reason ? ` (${reason})` : "";
  if (res.status === 401 || res.status === 403) throw new Error(`ElevenLabs rejected the API key${why}. Check the key and its permissions.`);
  // 429 is a rate limit (too many at once) or a used-up plan (quota_exceeded):
  // only the first is worth a wait
  if (res.status === 429 && !/quota/i.test(reason)) throw new BusyError(`ElevenLabs rate limit reached${why}. The app waited about three minutes. Try again later.`, { status: 429 });
  if (res.status === 429) throw new Error(`ElevenLabs quota reached${why}. Check your ElevenLabs plan.`);
  if (busyStatus(res.status)) throw new BusyError(`ElevenLabs answered with HTTP ${res.status}${why}. The app kept trying for about three minutes. Try again later; the parts already read are kept.`, { status: res.status });
  if (/unsupported_language/.test(reason)) throw new LanguageError(`ElevenLabs cannot read this language with this voice model${why}. Choose Eleven v4 at Voice model.`);
  // Any other 4xx is a request ElevenLabs will not accept as it is: waiting does not help
  throw new Error(`ElevenLabs did not accept the request (HTTP ${res.status})${why}.`);
}

export class LanguageError extends Error {}

// Every voice in the account, the user's own first (clones, designed and
// professional voices), then ElevenLabs' premade ones. /v2/voices pages
// through all of them; the older /v1/voices showed Zoltan only the premade
// voices, not his own clone (2026-09-30). A voice without a ready preview is
// played with a short sample instead (voice-sample).
const OWN = new Set(["cloned", "generated", "professional"]);

export async function listVoices({ apiKey, fetchImpl }) {
  const all = [];
  let token = "";
  for (let page = 0; page < 10; page++) {
    const j = await call(`/v2/voices?page_size=100&sort=name&sort_direction=asc${token ? `&next_page_token=${encodeURIComponent(token)}` : ""}`, { apiKey, fetchImpl });
    all.push(...(j.voices ?? []));
    if (!j.has_more || !j.next_page_token) break;
    token = j.next_page_token;
  }
  const voices = all.map((v) => ({
    id: v.voice_id,
    name: v.name,
    category: v.category ?? null,
    own: OWN.has(v.category) || v.is_owner === true,
    gender: v.labels?.gender ?? null,
    accent: v.labels?.accent ?? null,
    description: v.labels?.description ?? v.description ?? null,
    previewUrl: v.preview_url ?? null,
    languages: (v.verified_languages ?? []).map((l) => l.language).filter(Boolean),
  }));
  return [...voices.filter((v) => v.own), ...voices.filter((v) => !v.own)];
}

// previous/next text keep the intonation continuous across blocks.
export async function speak({ apiKey, fetchImpl, voiceId, text, previousText, nextText, model = DEFAULT_MODEL, settings = DEFAULT_SETTINGS, languageCode, onRetry, sleep }) {
  if (!voiceId) throw new Error("No ElevenLabs voice chosen. Pick one in Settings.");
  const body = { text, model_id: model, voice_settings: settings };
  if (previousText) body.previous_text = previousText;
  if (nextText) body.next_text = nextText;
  if (languageCode && TAKES_LANGUAGE_CODE(model)) body.language_code = languageCode;
  const url = `/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`;
  let j;
  try {
    j = await patiently(() => call(url, { apiKey, fetchImpl, method: "POST", body }), { label: "ElevenLabs", onRetry, sleep });
  } catch (e) {
    // A model that does not take this language code still reads the text:
    // one more try without the code, the model picks the language itself.
    if (!(e instanceof LanguageError) || !body.language_code) throw e;
    delete body.language_code;
    j = await patiently(() => call(url, { apiKey, fetchImpl, method: "POST", body }), { label: "ElevenLabs", onRetry, sleep });
  }
  if (!j.audio_base64) throw new Error("ElevenLabs returned no audio.");
  const alignment = j.alignment ?? j.normalized_alignment;
  if (!alignment?.characters?.length) throw new Error("ElevenLabs returned no timing data.");
  return { audio: Buffer.from(j.audio_base64, "base64"), words: wordsFromCharacters(alignment) };
}

// Voice previews are public sample files on ElevenLabs' storage. The runner
// downloads one into the app's cache so the UI can play it (the UI itself
// never calls an outside address). Only these hosts are accepted.
export function previewAllowed(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    if (/(^|\.)elevenlabs\.io$/.test(u.hostname)) return true;
    // ElevenLabs' public bucket only, not any Google Cloud Storage file
    return u.hostname === "storage.googleapis.com" && u.pathname.startsWith("/eleven-public-prod/");
  } catch {
    return false;
  }
}

export async function downloadPreview({ url, dir, fetchImpl = fetch }) {
  if (!previewAllowed(url)) throw new Error("That voice sample address is not an ElevenLabs one.");
  const file = path.join(dir, createHash("sha256").update(url).digest("hex").slice(0, 24) + ".mp3");
  if (fs.existsSync(file)) return file;
  let res;
  try {
    res = await retrying(fetchImpl)(url, { timeout: 30000 });
  } catch (e) {
    throw new Error(`Could not reach ElevenLabs: ${e.message}`);
  }
  if (!res.ok) throw new Error(`The voice sample could not be downloaded (HTTP ${res.status}).`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 10 * 1024 * 1024) throw new Error("The voice sample is unexpectedly large.");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, buf);
  return file;
}
