// generate/index.mjs: the clip generators for AI B-roll (docs/ai-broll.md,
// DECISIONS 94, 95, 98). The runner calls the service with the user's own
// key and downloads the finished MP4; the HyperFrames render puts it in the
// video like the user's own footage. No server, no middleman.
//
// One generator for real work: HeyGen Video 1, with the HeyGen key the avatar
// already uses. "test" makes free placeholder clips on this computer, so the
// whole flow can be tried before there is money on the account; its clips
// are marked as tests everywhere and never used for a real video by itself.

import * as heygenVideo from "./heygen-video.mjs";
import * as standin from "./standin.mjs";
import * as kie from "./kie.mjs";

// The user's choice in Identity, Footage, AI B-roll (Zoltan,
// 2026-10-06): 480p, 768p (the default) and 1080p. HeyGen Video 1 has no
// 1080p: "1080p" orders its 2k clip (three times the 768p price, 16:9 or
// 9:16 only), and the render scales it to the video's 1920x1080.
export const QUALITIES = {
  "480p": { label: "480p", note: "cheapest, soft on a 1080p video" },
  "768p": { label: "768p", note: "the default" },
  "1080p": { label: "1080p", note: "sharp, three times the 768p price" },
};
export const DEFAULT_QUALITY = "768p";

// Prices in USD per second of clip. HeyGen's API docs give no per-second
// figure (only that 2k costs three times 768p); these are the regular prices
// from the launch (2026-10): 0.02 at 480p, 0.03 at 768p. October runs at half
// price, so the estimate is high then, never low. The account's balance is
// asked from HeyGen itself (GET /v3/users/me).
export const GENERATORS = {
  "heygen-video-1": {
    label: "HeyGen Video 1",
    key: "heygen",
    module: heygenVideo,
    usdPerSecond: { "480p": 0.02, "768p": 0.03, "1080p": 0.09 },
    minSeconds: 5,
    maxSeconds: 15,
  },
  test: {
    label: "Test clips (free, placeholder)",
    key: null,
    module: standin,
    usdPerSecond: { "480p": 0, "768p": 0, "1080p": 0 },
    minSeconds: 5,
    maxSeconds: 15,
    test: true,
  },
  // Paid hero clips of the B-roll engine (broll/engine.mjs), approved on the
  // Preview tab, never from the Scenes tab's panel. Kie AI's price list,
  // 2026-11-02: 2, 4.5 and 10 credits a second, 1 credit is about 0.005 USD.
  "kie-seedance-v1-lite": {
    label: "Seedance 1.0 Lite (Kie AI)",
    modelName: "bytedance/seedance-v1-lite",
    key: "kie",
    service: "Kie AI",
    module: kie,
    usdPerSecond: { "480p": 0.01, "720p": 0.0225, "1080p": 0.05 },
    qualities: ["480p", "720p", "1080p"],
    defaultQuality: "720p",
    minSeconds: 5,
    maxSeconds: 5,
    engineOnly: true,
  },
};
export const PAID_GENERATOR = "kie-seedance-v1-lite";
export const DEFAULT_GENERATOR = "heygen-video-1";

export function generatorOf(id) {
  const g = GENERATORS[id];
  if (!g) throw new Error(`Unknown clip generator: ${id}.`);
  return g;
}

// The length to order for a stretch of narration of `seconds`: whole
// seconds, at least the generator's minimum (HeyGen bills 5 s even for 3).
export const orderSeconds = (seconds, generator = DEFAULT_GENERATOR) => {
  const g = generatorOf(generator);
  return Math.min(g.maxSeconds, Math.max(g.minSeconds, Math.ceil(Number(seconds) - 0.05)));
};

// Whole cents, rounded up: an estimate is high, never low.
export const usdFor = (seconds, { generator = DEFAULT_GENERATOR, quality = DEFAULT_QUALITY } = {}) => Math.ceil(seconds * (generatorOf(generator).usdPerSecond[quality] ?? 0) * 100 - 1e-9) / 100 + 0;

// 16:9 or 9:16, from the video's own frame.
export const aspectOf = ({ width = 1920, height = 1080 } = {}) => (height > width ? "9:16" : "16:9");

// The settings of the choices, for the UI.
export const choices = () => ({
  generators: Object.entries(GENERATORS).filter(([, g]) => !g.engineOnly).map(([id, g]) => ({ id, label: g.label, test: !!g.test, usdPerSecond: g.usdPerSecond })),
  qualities: Object.entries(QUALITIES).map(([id, q]) => ({ id, ...q })),
});
