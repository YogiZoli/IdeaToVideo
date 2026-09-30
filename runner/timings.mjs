// timings.mjs: how long each long step takes on this computer, so the UI can
// show an honest progress bar and time left (Zoltan, 2026-09-30: "progress %,
// how far in time to finish, even 'finishing now' matters, be accurate").
//
// Each step has a size unit (a minute of script, a sentence, a scene); the
// runner records seconds per unit after every run in <data>/timings.json and
// estimates the next run from the median of the last five. Before the first
// run the defaults below apply: measured on 2026-09-30 (Gemini 3.5 Flash,
// ElevenLabs, a 4-core laptop).

import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./tools.mjs";

export const DEFAULTS = {
  script: { perUnit: 9, min: 8 }, // per minute of script (1 min: 9 s)
  voice: { perUnit: 1.6, min: 5 }, // per sentence (11 sentences: 17 s)
  scenes: { perUnit: 2.6, min: 8 }, // per sentence (11 sentences: 28 s)
  refill: { perUnit: 6, min: 4 }, // per call
  build: { perUnit: 3.3, min: 20 }, // per scene (11 scenes: 36 s)
  music: { perUnit: 0.5, min: 20 }, // per second of music
  remix: { perUnit: 8, min: 6 }, // per music change (download on first use, mix)
  avatar: { perUnit: 15, min: 90 }, // per second of avatar clips (HeyGen renders)
  render: { perUnit: 1.5, min: 20 }, // per second of video (71 s: 102 s)
};
const KEEP = 5;

const file = (env) => path.join(dataDir(env), "timings.json");

function load(env) {
  try {
    return JSON.parse(fs.readFileSync(file(env), "utf8"));
  } catch {
    return {};
  }
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

// Expected seconds for a step of `units` size.
export function expectSeconds(step, units, { env = process.env } = {}) {
  const d = DEFAULTS[step];
  if (!d) throw new Error(`No timing for ${step}`);
  const seen = load(env)[step];
  const perUnit = Array.isArray(seen) && seen.length ? median(seen) : d.perUnit;
  return Math.round(Math.max(d.min, perUnit * Math.max(1, units)));
}

// After a successful run: remember seconds per unit (last KEEP runs).
export function recordTiming(step, seconds, units, { env = process.env } = {}) {
  if (!DEFAULTS[step] || !(seconds > 0) || !(units > 0)) return;
  const all = load(env);
  all[step] = [...(all[step] ?? []), Math.round((seconds / units) * 1000) / 1000].slice(-KEEP);
  try {
    fs.mkdirSync(path.dirname(file(env)), { recursive: true });
    fs.writeFileSync(file(env), JSON.stringify(all, null, 2) + "\n");
  } catch {
    // an estimate is a nice-to-have; never fail a step over it
  }
}

// Runs fn, tells the UI up front how long it should take, records the time.
export async function timed(step, units, emit, fn, { env = process.env } = {}) {
  const expect = expectSeconds(step, units, { env });
  emit({ event: "progress", step: "estimate", timing: step, expectSeconds: expect });
  const t0 = Date.now();
  const r = await fn();
  recordTiming(step, (Date.now() - t0) / 1000, units, { env });
  return r;
}
