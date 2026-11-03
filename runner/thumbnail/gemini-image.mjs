// thumbnail/gemini-image.mjs: one picture from a Gemini image model ("Nano
// Banana") with the user's own Gemini key, through the same Interactions
// endpoint as the free Narrator Voice (providers/tts/gemini.mjs). The
// reference photos, when the face is on, go in as image blocks next to the
// text. The answer is a JPEG, 16:9, 1K.

import { readJson } from "../net.mjs";
import { redact } from "../providers/llm.mjs";
import { BusyError, patiently, busyStatus } from "../providers/retry.mjs";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

export function requestBody({ model, prompt, refs = [] }) {
  return {
    model,
    input: [{ type: "text", text: prompt }, ...refs.map((r) => ({ type: "image", mime_type: r.mime, data: r.data }))],
    response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: "16:9", image_size: "1K" },
  };
}

// The picture's base64 in an answer: the convenience field, else the last
// image block of the model's output.
export function imageOf(j) {
  if (j?.output_image?.data) return j.output_image.data;
  const img = (j?.steps ?? [])
    .filter((s) => s.type === "model_output")
    .flatMap((s) => s.content ?? [])
    .filter((c) => c.type === "image" && c.data)
    .pop();
  return img?.data ?? null;
}

async function once({ apiKey, fetchImpl, body }) {
  let res;
  try {
    res = await fetchImpl(ENDPOINT, { method: "POST", headers: { "x-goog-api-key": apiKey, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(180000) });
  } catch (e) {
    throw new BusyError(`Could not reach Gemini: ${redact(e.message, apiKey)}`);
  }
  if (!res.ok) {
    const t = redact(await res.text().catch(() => ""), apiKey);
    let msg = "";
    try {
      msg = String(JSON.parse(t).error?.message ?? "").slice(0, 200);
    } catch {
      msg = "";
    }
    const why = msg ? ` (${msg})` : "";
    if (res.status === 401 || res.status === 403) throw new Error(`Gemini rejected the API key for pictures${why}. Picture models need billing turned on for the key in Google AI Studio. Check the key in Settings.`);
    if (res.status === 429) throw new BusyError(`Gemini's picture quota or rate limit is reached${why}. Picture models have no free quota: turn on billing for the key in Google AI Studio, or try again later.`, { status: 429 });
    if (res.status === 404) throw new Error(`Gemini does not know this picture model${why}.`);
    if (busyStatus(res.status)) throw new BusyError(`Gemini answered with HTTP ${res.status}${why}. The app kept trying for about three minutes. Try again later.`, { status: res.status });
    throw new Error(`Gemini answered with HTTP ${res.status}${why}.`);
  }
  const data = imageOf(await readJson(res, "Gemini"));
  if (!data) throw new Error("Gemini made no picture. It may have refused the description or the photo. Try again, or try with no face.");
  return Buffer.from(data, "base64");
}

// { prompt, refs: [{ mime, data(base64) }] } -> JPEG bytes
export async function makePicture({ apiKey, fetchImpl = fetch, model, prompt, refs = [], onRetry, sleep }) {
  if (!apiKey) throw new Error("No Gemini API key set. Add it in Settings, AI key or Connections.");
  const body = requestBody({ model, prompt, refs });
  return patiently(() => once({ apiKey, fetchImpl, body }), { label: "Gemini", onRetry, sleep });
}
