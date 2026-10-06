// cta/catalog.mjs: the comment keywords (Comment Routing, docs/wizards/cta.md).
// A viewer comments one keyword under the video; its lead temperature says
// what they are ready for, and whoever answers the comment sends the matching
// link. The app never answers comments and never holds a link: it only puts
// the keyword into the narration and on screen.
//
// The 15 keywords, their temperatures and what the viewer gets are exactly
// the list of the comment-reply tool the method is built for, so one video's
// keywords work there unchanged. A test pins the list; it changes only when
// that list changes (Zoltan, 2026-10-05). No own keywords and no translations
// until that tool has them.

export const TEMPERATURES = {
  cold: { label: "Cold", meaning: "wants a free resource", dot: "#2E6FE0", surface: "#E7EFFC", text: "#1D4F9C" },
  warm: { label: "Warm", meaning: "wants to learn more", dot: "#E5A400", surface: "#FBF2DD", text: "#6B4E00" },
  hot: { label: "Hot", meaning: "ready to buy", dot: "#D92D20", surface: "#FDECEA", text: "#A5161B" },
};

export const KEYWORDS = [
  { keyword: "GUIDE", temperature: "cold", gets: "a free guide" },
  { keyword: "CHECKLIST", temperature: "cold", gets: "a checklist" },
  { keyword: "TEMPLATE", temperature: "cold", gets: "a template" },
  { keyword: "PDF", temperature: "cold", gets: "a free PDF" },
  { keyword: "START", temperature: "cold", gets: "where to start" },
  { keyword: "TRAINING", temperature: "warm", gets: "a free training" },
  { keyword: "WORKSHOP", temperature: "warm", gets: "a workshop seat" },
  { keyword: "WEBINAR", temperature: "warm", gets: "a webinar seat" },
  { keyword: "COURSE", temperature: "warm", gets: "course details" },
  { keyword: "SURVEY", temperature: "warm", gets: "a short survey" },
  { keyword: "TRIGGER", temperature: "hot", gets: "a link to buy now" },
  { keyword: "CALL", temperature: "hot", gets: "a call with you" },
  { keyword: "BUY", temperature: "hot", gets: "a link to buy" },
  { keyword: "APPLY", temperature: "hot", gets: "an application" },
  { keyword: "ACTION", temperature: "hot", gets: "the next step" },
];

// Where a comment call can sit, tied to the script, never to a percentage:
// start = in the opening, right after the promise of the video (the viewer
// knows why to stay); middle = right after the section with the highest
// value; end = in the closing, before the YouTube end screen.
export const SLOTS = {
  start: { label: "Start", hint: "After the promise of the video, in the first minute." },
  middle: { label: "Middle", hint: "Right after the most valuable section." },
  end: { label: "End", hint: "In the closing, before the end screen." },
};
export const SLOT_IDS = Object.keys(SLOTS);

// The method: one video, three keywords, from cold to hot (Zoltan,
// 2026-10-05, K3). Fewer calls drop the middle first; one call sits at the
// end unless the user picks another place.
export const DEFAULT_SLOTS = { start: "GUIDE", middle: "COURSE", end: "TRIGGER" };
export const PLACES_FOR_COUNT = { 0: [], 1: ["end"], 2: ["start", "end"], 3: ["start", "middle", "end"] };

export const keywordInfo = (keyword) => KEYWORDS.find((k) => k.keyword === String(keyword ?? "").trim().toUpperCase()) ?? null;
export const temperatureOf = (keyword) => keywordInfo(keyword)?.temperature ?? null;
