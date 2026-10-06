// generate/standin.mjs: the test generator ("Test clips (free, placeholder)").
// No service, no key, no cost: ffmpeg's own test pattern at the size HeyGen
// would deliver, so the whole B-roll flow (plan, estimate, make, library,
// build, render) can be tried before there is money on the HeyGen account.
// The pattern makes it plain that these are not real clips.

import fs from "node:fs";
import path from "node:path";
import { ffmpegRun } from "../audio.mjs";

const SIZE = {
  "16:9": { "480p": "832x480", "768p": "1344x768", "1080p": "1920x1080" },
  "9:16": { "480p": "480x832", "768p": "768x1344", "1080p": "1080x1920" },
};

let counter = 0;

// An "order": nothing to wait for, the id carries what to make.
export async function order({ prompt, seconds, quality = "768p", aspect = "16:9" }) {
  if (!String(prompt ?? "").trim()) throw new Error("The clip has no picture description.");
  return `test-${Date.now().toString(36)}-${++counter}-${Math.round(seconds)}-${quality}-${aspect.replace(":", "x")}`;
}

export async function fetchClip({ id, out, onStatus = () => {}, env = process.env }) {
  const m = /-(\d+)-(480p|768p|1080p)-(\d+)x(\d+)$/.exec(id);
  if (!m) throw new Error("Not a test clip.");
  const [, seconds, quality, a, b] = m;
  const size = SIZE[`${a}:${b}`]?.[quality] ?? SIZE["16:9"]["768p"];
  onStatus("processing");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await ffmpegRun(["-f", "lavfi", "-i", `testsrc2=size=${size}:rate=24:duration=${seconds}`, "-f", "lavfi", "-i", `anullsrc=r=32000:cl=stereo`, "-t", seconds, "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", out], env);
  onStatus("completed");
  return { file: out, seconds: Number(seconds) };
}
