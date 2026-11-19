// gates/scenes/simple.mjs: a scene table without AI (Zoltan, 2026-10-05:
// "when Gemini is overloaded or out of tokens I cannot go on"). The Default
// mode of gate 3: plain rules, the same checks as the AI's plan, so the video
// can always be made. Simpler than the Recommended plan: a title, then key
// lines that rotate between three text scenes, every comment call in its own
// call-to-action scene. Every on-screen text is taken from the words of its
// own sentences, so the picture still shows what the voice says.

import { COMPONENTS, paceOf } from "./roles.mjs";
import { MAX_WORDS } from "./index.mjs";
import { keyPhrase } from "./keyphrase.mjs";

// How long a scene grows (target) and never grows past (longest): the
// Identity's pace, roles.mjs PACES.

const wordsOf = (t) => String(t).replace(/[^\p{L}\p{M}\p{N}'’ -]+/gu, " ").split(/\s+/).filter(Boolean);
const lengthOf = (s) => s.dur ?? s.end - s.start;

// The longest word is usually the one that carries the meaning.
const longestIndex = (ws) => ws.reduce((best, w, i) => (w.length > ws[best].length ? i : best), 0);

// The words of a scene's first sentence, at most `max`.
function phrase(sentences, max) {
  // the key words, never half a phrase (keyphrase.mjs, DECISIONS 191)
  return keyPhrase(sentences[0].text, max) || sentences[0].text.slice(0, 40);
}

// The 2 to 4 words of a call sentence around its keyword, the keyword in
// capitals (the same rule the AI's plan follows).
export function callLine(text, keyword) {
  const ws = wordsOf(text);
  const at = ws.findIndex((w) => w.toLowerCase() === keyword.toLowerCase());
  if (at < 0) return keyword.toUpperCase();
  return [...ws.slice(Math.max(0, at - 2), at), keyword.toUpperCase()].join(" ");
}

const ROTATION = ["per-word-rise", "marker-highlight", "headline-slam"];

function textScene(component, sentences) {
  if (component === "headline-slam") {
    const ws = wordsOf(phrase(sentences, COMPONENTS["headline-slam"].words.text));
    return { text: ws.join(" "), accent_word_index: longestIndex(ws) };
  }
  if (component === "marker-highlight") {
    const text = phrase(sentences, MAX_WORDS);
    const ws = wordsOf(text);
    return { text, emphasis_word: ws[longestIndex(ws)] };
  }
  return { text: phrase(sentences, MAX_WORDS) };
}

/**
 * The plan, in the shape the AI answers with ({ scenes }).
 * sentences: sentences.json; sections: the script section of each sentence;
 * calls: Map(sentence id -> { keyword }); off: components the Motion profile
 * turned off; themeIsLight: headline-slam then has no shadow.
 */
export function simplePlan({ sentences, sections = [], title = "", calls = new Map(), off = [], themeIsLight = false, pace }) {
  const { target: TARGET, longest: LONGEST } = paceOf(pace);
  // 1. groups of sentences: a call alone, a new section starts a new group
  const groups = [];
  let cur = null;
  sentences.forEach((s, i) => {
    const call = calls.has(s.id);
    const newSection = i > 0 && sections[i] && sections[i] !== sections[i - 1];
    const full = cur && (cur.seconds >= TARGET || cur.seconds + lengthOf(s) > LONGEST);
    if (!cur || call || cur.call || newSection || full) {
      cur = { items: [], seconds: 0, call };
      groups.push(cur);
    }
    cur.items.push(s);
    cur.seconds += lengthOf(s);
  });

  // 2. one component per group, never the same twice in a row
  // only what the catalog has on (DECISIONS 130)
  const usable = ROTATION.filter((c) => !off.includes(c) && COMPONENTS[c]);
  const rotation = usable.length ? usable : ["per-word-rise"];
  let turn = 0;
  const scenes = groups.map((g, i) => {
    const from = g.items[0].id;
    const to = g.items[g.items.length - 1].id;
    const span = to !== from ? { to } : {};
    if (g.call) {
      const { keyword } = calls.get(from);
      return { from, ...span, component: "cta-close", vars: { action_line: callLine(g.items[0].text, keyword), button_label: keyword } };
    }
    if (i === 0 && !off.includes("titlecard-calm") && COMPONENTS["titlecard-calm"]) {
      const headline = wordsOf(title).slice(0, MAX_WORDS).join(" ") || phrase(g.items, MAX_WORDS);
      return { from, ...span, component: "titlecard-calm", vars: { headline, kicker: "" } };
    }
    return { from, ...span, component: "", items: g.items };
  });
  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i];
    if (sc.component) continue;
    let c = rotation[turn++ % rotation.length];
    if (rotation.length > 1 && scenes[i - 1]?.component === c) c = rotation[turn++ % rotation.length];
    const vars = textScene(c, sc.items);
    if (c === "headline-slam" && themeIsLight) vars.shadow = false;
    scenes[i] = { from: sc.from, ...(sc.to ? { to: sc.to } : {}), component: c, vars };
  }
  return { scenes, gaps: [] };
}
