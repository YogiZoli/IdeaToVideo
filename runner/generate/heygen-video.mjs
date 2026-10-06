// generate/heygen-video.mjs: HeyGen Video 1, HeyGen's own video model, with
// the user's HeyGen key (the same one the avatar uses).
//
// Docs (2026-10-06): developers.heygen.com, docs/models/heygen-video and
// reference/create-heygen-video.
//   POST /v3/models/videos  { model: "heygen-video-1", mode: "text_to_video",
//     prompt, duration 5..15, resolution "480p" | "768p" | "2k",
//     aspect_ratio "16:9" | "9:16" | ... }  -> 202 { data: { video_id } }
//   GET  /v3/models/videos/{id} -> { status pending | processing | completed
//     | failed | cancelled, video_url, duration, width, height }
// The output is an H.264 MP4 at 24 fps with generated sound; the app keeps
// it muted (the narrator speaks). Paid API keys only. An Idempotency-Key
// header makes HeyGen answer a repeated order (24 hours) with the first one,
// so a retry after a lost answer never pays twice.

import { call, waitAndDownload } from "../providers/avatar/heygen.mjs";

const RESOLUTION = { "480p": "480p", "768p": "768p", "1080p": "2k" };

export function orderBody({ prompt, seconds, quality = "768p", aspect = "16:9" }) {
  const resolution = RESOLUTION[quality];
  if (!resolution) throw new Error(`Unknown quality: ${quality}.`);
  if (resolution === "2k" && !["16:9", "9:16"].includes(aspect)) throw new Error("1080p works only for 16:9 and 9:16 videos.");
  const text = String(prompt ?? "").trim();
  if (!text) throw new Error("The clip has no picture description.");
  return { model: "heygen-video-1", mode: "text_to_video", prompt: text.slice(0, 16000), duration: Math.min(15, Math.max(5, Math.round(seconds))), resolution, aspect_ratio: aspect };
}

// Places the order; returns HeyGen's video id. `key`: the idempotency key
// (the same order asked again gives the same id).
export async function order({ apiKey, prompt, seconds, quality, aspect, key, fetchImpl }) {
  const d = await call(apiKey, "/v3/models/videos", { method: "POST", fetchImpl, body: orderBody({ prompt, seconds, quality, aspect }), headers: key ? { "Idempotency-Key": key } : {} });
  if (!d?.video_id) throw new Error("HeyGen did not return a video id.");
  return d.video_id;
}

export const getClip = ({ apiKey, id, fetchImpl }) => call(apiKey, `/v3/models/videos/${encodeURIComponent(id)}`, { fetchImpl });

// Waits for the clip and downloads it to `out` (a connection lost meanwhile
// only means "ask again", the order is not given up).
export const fetchClip = ({ apiKey, id, out, fetchImpl, sleep, onStatus }) =>
  waitAndDownload({ apiKey, id, out, fetchImpl, ...(sleep ? { sleep } : {}), onStatus, poll: getClip, what: "B-roll clip", everyMs: 8000 });
