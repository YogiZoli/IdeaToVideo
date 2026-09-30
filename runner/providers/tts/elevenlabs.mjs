// elevenlabs.mjs: Narrator Voice through the user's own ElevenLabs key (the user
// pays; the free ElevenLabs plan has no commercial rights, the UI says so).
//   listVoices   the voices in the user's account, with a preview URL
//   speak        one block of text -> mp3 bytes + word timings
// The key only ever goes into the request header, never into a message.

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { redact } from "../llm.mjs";
import { wordsFromCharacters } from "./align.mjs";

const BASE = "https://api.elevenlabs.io";
export const DEFAULT_MODEL = "eleven_multilingual_v2";
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
    throw new Error(`Could not reach ElevenLabs: ${redact(e.message, apiKey)}`);
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
  if (res.status === 429) throw new Error(`ElevenLabs quota or rate limit reached${why}. Wait, or check your ElevenLabs plan.`);
  throw new Error(`ElevenLabs answered with HTTP ${res.status}${why}. Try again later.`);
}

export async function listVoices({ apiKey, fetchImpl }) {
  const j = await call("/v1/voices", { apiKey, fetchImpl });
  return (j.voices ?? []).map((v) => ({
    id: v.voice_id,
    name: v.name,
    category: v.category ?? null,
    gender: v.labels?.gender ?? null,
    accent: v.labels?.accent ?? null,
    description: v.labels?.description ?? v.description ?? null,
    previewUrl: v.preview_url ?? null,
    languages: (v.verified_languages ?? []).map((l) => l.language).filter(Boolean),
  }));
}

// previous/next text keep the intonation continuous across blocks.
export async function speak({ apiKey, fetchImpl, voiceId, text, previousText, nextText, model = DEFAULT_MODEL, settings = DEFAULT_SETTINGS, languageCode }) {
  if (!voiceId) throw new Error("No ElevenLabs voice chosen. Pick one in Settings.");
  const body = { text, model_id: model, voice_settings: settings };
  if (previousText) body.previous_text = previousText;
  if (nextText) body.next_text = nextText;
  if (languageCode) body.language_code = languageCode;
  const j = await call(`/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`, { apiKey, fetchImpl, method: "POST", body });
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
    res = await fetchImpl(url, { signal: AbortSignal.timeout(30000) });
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
