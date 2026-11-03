// gates/scenes/when.mjs: the date a sentence says. Pure, and read by both the plan and the build.

const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December|január|február|március|április|május|június|július|augusztus|szeptember|október|november|december";
export const DATE = new RegExp(`\\b(?:(?:${MONTHS})\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?|\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:${MONTHS})(?:,?\\s+\\d{4})?|\\d{4}\\.?\\s+(?:${MONTHS})\\s+\\d{1,2})`, "iu");
export const CLOCK = /\b(\d{1,2})(?::(\d{2}))?\s?([ap])\.?m\b\.?/i;
export const YEAR = /\b(?:in|since|by|until|from|year|around|early|late|after|before|of)\s+(1[0-9]{3}|20[0-9]{2})\b|\b(1[0-9]{3}|20[0-9]{2})(?:-ban|-ben|-ig|-től|-tól|-as|-es)/i;

/** When a sentence says it happened, as it should stand on a stamp: a date, else a time, else a year. */
export function whenIn(text) {
  const said = String(text);
  const date = DATE.exec(said);
  if (date) return { text: date[0].replace(/\s+/g, " ").replace(/,/g, "").trim(), raw: date[0] };
  const clock = CLOCK.exec(said);
  if (clock) return { text: `${clock[1]}${clock[2] ? `:${clock[2]}` : ""} ${clock[3].toUpperCase()}M`, raw: clock[0] };
  const year = YEAR.exec(said);
  return year ? { text: year[1] ?? year[2], raw: year[1] ?? year[2] } : null;
}

/**
 * For each scene, the last date the voice has said by the end of it, or null before the first one.
 * A time of day is not a date, so it never stands on the label. Pure.
 */
export function carriedDates(scenes, sentences) {
  const index = new Map(sentences.map((s, i) => [s.id, i]));
  let last = null;
  return scenes.map((sc) => {
    const from = index.get(sc.from);
    if (from === undefined) return last;
    const to = index.get(sc.to ?? sc.from) ?? from;
    for (const s of sentences.slice(from, to + 1)) {
      const when = whenIn(s.text);
      if (when && !CLOCK.test(when.raw)) last = when.text;
    }
    return last;
  });
}
