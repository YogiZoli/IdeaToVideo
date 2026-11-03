// generate/kie-image.mjs: a hero moment's cheaper paid tier (docs/BUILD_PLAN.md
// phase 3). One AI picture through Kie AI, then moved in 2.5D on this computer
// (broll/parallax.mjs), so the camera move costs nothing. Z-Image: the cheapest on
// Kie AI's list that says it takes 16:9 (kie.ai/z-image, 2026-11-02: 0.8 credits,
// about 0.004 USD a picture, PNG; a failed task is not charged). Its pixel size is
// not published; the parallax scales it to 1080p.
//
// Docs (2026-11-02): docs.kie.ai/market/z-image/z-image.
//   POST /api/v1/jobs/createTask { model: "z-image", input: { prompt (max 1000),
//     aspect_ratio "1:1" | "4:3" | "3:4" | "16:9" | "9:16", nsfw_checker } }

import { retrying } from "../net.mjs";
import fs from "node:fs";
import path from "node:path";
import { call, promptRefusal, waitForResult, API } from "./kie.mjs";
import { BusyError } from "../providers/retry.mjs";

export const MODEL = "z-image";

export function imageBody({ prompt, aspect = "16:9" }) {
  const why = promptRefusal(prompt);
  if (why) throw new Error(why);
  return { model: MODEL, input: { prompt: String(prompt).replace(/\s+/g, " ").trim().slice(0, 1000), aspect_ratio: aspect, nsfw_checker: true } };
}

export async function order({ apiKey, prompt, aspect, fetchImpl }) {
  const r = await call(`${API}/jobs/createTask`, { apiKey, method: "POST", fetchImpl, body: imageBody({ prompt, aspect }) });
  const id = r?.data?.taskId;
  if (!id) throw new Error("Kie AI did not return a task id.");
  return id;
}

// Waits for the picture, downloads it, and makes the clip on this computer. A
// render that fails here is not lost: the order is kept, the next run picks it up.
export async function fetchClip({ apiKey, id, out, seconds = 5, n = 0, fetchImpl = fetch, sleep, onStatus, env = process.env, parallax = null }) {
  const url = await waitForResult({ apiKey, id, fetchImpl, ...(sleep ? { sleep } : {}), ...(onStatus ? { onStatus } : {}) });
  const res = await retrying(fetchImpl)(url, { timeout: 300000 });
  if (!res.ok) throw new BusyError(`Could not download the picture (HTTP ${res.status}).`, { status: res.status });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const image = `${out}.png`;
  fs.writeFileSync(image, Buffer.from(await res.arrayBuffer()));
  try {
    const { parallaxClip, moveFor } = await import("../broll/parallax.mjs");
    await (parallax ?? parallaxClip)({ image, out, seconds, move: moveFor(n), env });
  } finally {
    fs.rmSync(image, { force: true });
  }
  return { file: out };
}
