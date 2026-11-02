// broll/settings.mjs: the Identity's AI B-roll settings (Settings, Identity,
// Footage, AI B-roll; DECISIONS 95, 98). <identity>/broll.json
//
//   enabled    off by default (it costs money); off, the Scenes tab shows
//              no B-roll step at all
//   generator  "heygen-video-1", or "test" (free placeholder clips)
//   quality    "480p" | "768p" | "1080p" (1080p = HeyGen's 2k, 3x the price)
//   capUsd     the most one ONE Video may spend on B-roll: 1 to 10 USD in
//              steps of 0.50, 1 by default. Above it the app always asks.
//   paid       the B-roll engine's paid clips (docs/BUILD_PLAN.md phase 1b), the
//              channel's own switch: on (off by default), quality, the most per
//              video and per month. These two are hard limits, nothing is
//              spent above them and nothing without a yes on the Preview tab.

import fs from "node:fs";
import path from "node:path";
import { GENERATORS, QUALITIES, DEFAULT_GENERATOR, DEFAULT_QUALITY, PAID_GENERATOR } from "../generate/index.mjs";

export const BROLL_SETTINGS_SCHEMA = "itv-broll-settings/1";
export const BROLL_FILE = "broll.json";
export const CAP = { min: 1, max: 10, step: 0.5, default: 1 };

export const PAID_LIMITS = { perVideo: { min: 0, max: 100, default: 1 }, perMonth: { min: 0, max: 1000, default: 5 } };
const limitOf = (v, { min, max, default: d }) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 100) / 100)) : d;
};
export function normalizePaid(input = {}) {
  const g = GENERATORS[PAID_GENERATOR];
  return {
    on: input?.on === true,
    model: PAID_GENERATOR,
    quality: g.qualities.includes(input?.quality) ? input.quality : g.defaultQuality,
    maxPerVideoUsd: input?.maxPerVideoUsd === undefined ? PAID_LIMITS.perVideo.default : limitOf(input.maxPerVideoUsd, PAID_LIMITS.perVideo),
    maxPerMonthUsd: input?.maxPerMonthUsd === undefined ? PAID_LIMITS.perMonth.default : limitOf(input.maxPerMonthUsd, PAID_LIMITS.perMonth),
  };
}

export const defaultSettings = () => ({ schema: BROLL_SETTINGS_SCHEMA, enabled: false, generator: DEFAULT_GENERATOR, quality: DEFAULT_QUALITY, capUsd: CAP.default, paid: normalizePaid() });

export const capOf = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return CAP.default;
  return Math.min(CAP.max, Math.max(CAP.min, Math.round(n / CAP.step) * CAP.step));
};

export function normalizeSettings(input = {}) {
  const d = defaultSettings();
  return {
    schema: BROLL_SETTINGS_SCHEMA,
    enabled: input?.enabled === true,
    generator: GENERATORS[input?.generator] && !GENERATORS[input.generator].engineOnly ? input.generator : d.generator,
    quality: QUALITIES[input?.quality] ? input.quality : d.quality,
    capUsd: input?.capUsd === undefined ? d.capUsd : capOf(input.capUsd),
    paid: normalizePaid(input?.paid),
  };
}

const file = (identityDir) => path.join(identityDir, BROLL_FILE);

export function loadSettings(identityDir) {
  if (!identityDir || !fs.existsSync(file(identityDir))) return defaultSettings();
  try {
    return normalizeSettings(JSON.parse(fs.readFileSync(file(identityDir), "utf8")));
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(identityDir, input) {
  if (!identityDir) throw new Error("No Identity to save the AI B-roll settings in.");
  // the Footage page sends its own fields only: the paid switch stays as it is
  const s = normalizeSettings({ paid: loadSettings(identityDir).paid, ...input });
  fs.mkdirSync(identityDir, { recursive: true });
  fs.writeFileSync(`${file(identityDir)}.tmp`, JSON.stringify(s, null, 2) + "\n");
  fs.renameSync(`${file(identityDir)}.tmp`, file(identityDir));
  return s;
}
