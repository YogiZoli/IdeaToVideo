// align.mjs: word timings in the shape sentences.mjs reads
//   { words: [ { text, start, end, type: "word" } ] }
// from a TTS provider's per-character alignment (ElevenLabs "with-timestamps").

// characters[i] spoken from starts[i] to ends[i] seconds. A word is a run of
// non-space characters; offset shifts it to its place in the joined audio.
export function wordsFromCharacters({ characters, character_start_times_seconds: starts, character_end_times_seconds: ends }, offset = 0) {
  const words = [];
  let cur = null;
  const r3 = (x) => Math.round(x * 1000) / 1000;
  for (let i = 0; i < (characters?.length ?? 0); i++) {
    const ch = characters[i];
    if (/\s/.test(ch)) {
      if (cur) words.push(cur);
      cur = null;
      continue;
    }
    if (!cur) cur = { text: "", start: r3(offset + Number(starts[i])), end: 0, type: "word" };
    cur.text += ch;
    cur.end = r3(offset + Number(ends[i]));
  }
  if (cur) words.push(cur);
  return words;
}
