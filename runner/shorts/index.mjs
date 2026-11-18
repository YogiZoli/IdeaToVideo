// shorts/index.mjs: the two formats of a script video (FIX_PLAN 2026-11-19, item 2, DECISIONS 188).
// Long form is 16:9 at 1920x1080, as every video was before. A Short is 9:16 at 1080x1920, 15 to
// 90 seconds. The recipe holds the channel's format; a video can change it on its start screen, and
// its project.json keeps it in its copy of the recipe (recipe.format, recipe.shortSeconds), so every
// gate asks formatOf(project) and nothing else.

export const FORMATS = {
  long: { id: "long", label: "Long form 16:9", width: 1920, height: 1080 },
  short: { id: "short", label: "Short 9:16", width: 1080, height: 1920 },
};
export const DEFAULT_FORMAT = "long";
export const SHORT_SECONDS = [15, 30, 45, 60, 90];
export const DEFAULT_SHORT_SECONDS = 60;

// The platforms draw their buttons and the title over the lower 20 percent and the right
// 12 percent of a Short: nothing important goes there (the layout and the captions keep out).
export const SAFE = { bottom: 0.2, right: 0.12, top: 0.07, left: 0.065 };

export const cleanFormat = (f) => (FORMATS[f] ? f : DEFAULT_FORMAT);
export const cleanShortSeconds = (s) => {
  const n = Number(s);
  return SHORT_SECONDS.includes(n) ? n : DEFAULT_SHORT_SECONDS;
};

/** The format of a project (its copy of the recipe), or of a recipe itself. */
export function formatOf(projectOrRecipe) {
  const r = projectOrRecipe?.recipe ?? projectOrRecipe;
  return cleanFormat(r?.format);
}
export const isShort = (projectOrRecipe) => formatOf(projectOrRecipe) === "short";
export const sizeOf = (format) => {
  const f = FORMATS[cleanFormat(format)];
  return { width: f.width, height: f.height };
};

/** The safe box of a frame, in pixels: where a Short's words and pictures may go. */
export function safeBox({ width, height } = FORMATS.short) {
  const left = Math.round(width * SAFE.left);
  const top = Math.round(height * SAFE.top);
  const right = Math.round(width * (1 - SAFE.right));
  const bottom = Math.round(height * (1 - SAFE.bottom));
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

/** The middle third of the frame, where a Short's captions sit. */
export const middleThird = ({ height } = FORMATS.short) => ({ top: Math.round(height / 3), bottom: Math.round((height * 2) / 3) });

/**
 * A recipe with this video's format: `format` and `shortSeconds` from the start screen win over
 * the recipe's own. A Short's length is in seconds; its targetLengthMin follows from them, so the
 * script gate's word count works the same for both formats.
 */
export function withFormat(recipe, { format, shortSeconds } = {}) {
  const f = cleanFormat(format ?? recipe?.format);
  if (f !== "short") return { ...recipe, format: "long" };
  const s = cleanShortSeconds(shortSeconds ?? recipe?.shortSeconds);
  return { ...recipe, format: "short", shortSeconds: s, targetLengthMin: Math.round((s / 60) * 1000) / 1000 };
}

/** "Short 9:16, 60 seconds" or "Long form 16:9, 8 minutes", for the recipe and the video. */
export function formatLine(recipe) {
  if (formatOf(recipe) === "short") return `${FORMATS.short.label}, ${cleanShortSeconds(recipe.shortSeconds)} seconds`;
  const m = Number(recipe?.targetLengthMin) || 8;
  return `${FORMATS.long.label}, ${m} minute${m === 1 ? "" : "s"}`;
}
