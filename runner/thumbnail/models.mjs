// thumbnail/models.mjs: the picture makers of the Thumbnail step (DECISIONS
// 131). Two Gemini image models with the user's own Gemini key, and a free
// test maker, like the B-roll test clips (DECISIONS 98).
//
// Prices from Google's own price page (ai.google.dev/gemini-api/docs/pricing,
// read 2026-10-29), standard tier, a 1K picture. A picture's input (the text
// and, with the face on, the reference photos) is priced per million tokens.

export const MODELS = {
  "gemini-nano-banana-2.1": { label: "Nano Banana 2.1 (standard)", usdPerImage: 0.0336, inPerMillion: 1.5 },
  "gemini-3-pro-image": { label: "Nano Banana Pro (sharper faces and detail, about 4 times the price)", usdPerImage: 0.134, inPerMillion: 2 },
  test: { label: "Test pictures (free, placeholder)", usdPerImage: 0, inPerMillion: 0, test: true },
};
export const DEFAULT_MODEL = "gemini-nano-banana-2.1";

// The words and picture ideas come from a small Gemini text call with the
// same key, so the step needs one key only.
export const IDEAS_MODEL = "gemini-3.5-flash";

export function modelOf(id) {
  const m = MODELS[id ?? DEFAULT_MODEL];
  if (!m) throw new Error(`Unknown picture model: ${id}.`);
  return { id: id ?? DEFAULT_MODEL, ...m };
}

export const modelChoices = () => Object.entries(MODELS).map(([id, m]) => ({ id, label: m.label, usdPerImage: m.usdPerImage, test: !!m.test }));
