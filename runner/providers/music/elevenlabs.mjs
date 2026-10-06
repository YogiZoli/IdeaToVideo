// music/elevenlabs.mjs: background music from ElevenLabs Music with the user's
// own key (the user pays, about 0.15 USD per minute; commercial use on paid
// plans). Instrumental only: the music sits under a narration.

import { redact } from "../llm.mjs";

const ENDPOINT = "https://api.elevenlabs.io/v1/music";
export const MIN_SECONDS = 3;
export const MAX_SECONDS = 600; // longer videos loop the track (audio.mjs mix)
export const DEFAULT_PROMPT = "Calm, warm instrumental background music for a teaching video. Soft piano and gentle pads, steady tempo around 90 BPM, no vocals, no drops, unobtrusive under a voice.";
export const USD_PER_MINUTE = 0.15;

export const musicSeconds = (videoSeconds) => Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, Math.ceil(videoSeconds + 2)));
export const costEstimateUsd = (videoSeconds) => Math.round((musicSeconds(videoSeconds) / 60) * USD_PER_MINUTE * 100) / 100;

export async function compose({ apiKey, fetchImpl = fetch, prompt = DEFAULT_PROMPT, seconds }) {
  if (!apiKey) throw new Error("No API key set for ElevenLabs. Add it in Settings to make music.");
  let res;
  try {
    res = await fetchImpl(`${ENDPOINT}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({ prompt, music_length_ms: Math.round(musicSeconds(seconds) * 1000), force_instrumental: true }),
      signal: AbortSignal.timeout(600000),
    });
  } catch (e) {
    throw new Error(`Could not reach ElevenLabs: ${redact(e.message, apiKey)}`);
  }
  if (!res.ok) {
    const t = redact(await res.text().catch(() => ""), apiKey);
    let reason = "";
    try {
      const d = JSON.parse(t).detail;
      reason = [d?.status, d?.message].filter((x) => typeof x === "string" && x).join(": ").slice(0, 200);
    } catch {
      reason = "";
    }
    const why = reason ? ` (${reason})` : "";
    if (res.status === 401 || res.status === 403) throw new Error(`ElevenLabs rejected the API key or the plan has no music${why}.`);
    if (res.status === 429) throw new Error(`ElevenLabs quota or rate limit reached${why}.`);
    throw new Error(`ElevenLabs Music answered with HTTP ${res.status}${why}. Try again later.`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1000) throw new Error("ElevenLabs Music returned no audio.");
  return buf;
}
