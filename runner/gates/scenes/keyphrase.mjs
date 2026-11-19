// keyphrase.mjs: the words a scene shows when a sentence is longer than the scene can hold
// (FIX_PLAN 2026-11-19, item 5, DECISIONS 191). A line is never cut in the middle of a phrase
// ("Finally we show it to the"): a short sentence stays whole, else its first clause when that
// is short enough, else its key words in their own order, without the little words.

const STOP = new Set(
  "a an the and or but so of to in on at for with from by is are was were be been being it its this that these those there here we you i he she they them his her our your their my me us as than then just very really also about into onto over first next finally after before now today will would can could should do does did has have had not no yes all some any each every more most less which who whom what when where while if because".split(" "),
);
// a line never ends on one of these: it needs the next word
const HANGING = /^(a|an|the|and|or|but|of|to|in|on|at|for|with|from|by|is|are|was|were|be|that|this|its|your|my|when|while|if|than|as|into|onto|through|az|egy|és|de|hogy)$/i;

const TURNS = new Set("and but so because then which while when although though or".split(" "));

const wordsOf = (t) => String(t ?? "").replace(/[^\p{L}\p{M}\p{N}'’ %$.,:-]+/gu, " ").split(/\s+/).map((w) => w.replace(/^[.,:-]+|[.,:-]+$/g, "")).filter(Boolean);

export function keyPhrase(text, max = 6) {
  const words = wordsOf(text);
  if (words.length <= max) return words.join(" ");
  const clause = wordsOf(String(text).split(/[,;:]/)[0]);
  if (clause.length >= 2 && clause.length <= max && !HANGING.test(clause.at(-1))) return clause.join(" ");
  // the words up to where the sentence turns ("and", "but", "because"...): a whole phrase
  const turn = words.findIndex((w, i) => i >= 2 && TURNS.has(w.toLowerCase()));
  if (turn >= 2 && turn <= max && !HANGING.test(words[turn - 1])) return words.slice(0, turn).join(" ");
  // a question reads as one unit: its opening, up to a word that does not need the next
  if (/\?\s*$/.test(String(text))) {
    const q = words.slice(0, max);
    while (q.length > 1 && HANGING.test(q.at(-1))) q.pop();
    return q.join(" ");
  }
  const key = words.filter((w) => !STOP.has(w.toLowerCase()));
  const out = (key.length >= 2 ? key : words).slice(0, max);
  while (out.length > 1 && HANGING.test(out.at(-1))) out.pop();
  return out.join(" ");
}

/** The word of a line that carries it: the longest that is not a little word (never "before" or "about"). */
export function keyWord(words) {
  const list = (Array.isArray(words) ? words : wordsOf(words)).filter(Boolean);
  const real = list.filter((w) => !STOP.has(String(w).toLowerCase()));
  return (real.length ? real : list).reduce((best, w) => (w.length > best.length ? w : best), "");
}
