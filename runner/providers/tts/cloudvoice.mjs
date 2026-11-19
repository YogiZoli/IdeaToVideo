// cloudvoice.mjs: what the Google Cloud and the Azure voice share (DECISIONS 194). Both return audio
// without word timings, so, as for the Gemini voice, each sentence is one call, the pieces are
// joined with a short gap, and the words inside a sentence are placed by their letters: every
// sentence starts and ends exactly where it is said. A busy service is tried again (patiently);
// a request it refuses is said in one sentence. The key only goes into the request header.

import { parseWav, writeWav, splitSentences, wordsByCharacters, GAP_SECONDS } from "./gemini.mjs";
import { patiently } from "../retry.mjs";

const seconds = (w) => w.pcm.length / (w.rate * w.channels * (w.bits / 8));

/** `once(sentence)` -> WAV bytes; returns { audio, words, ext } for the whole text. */
export async function bySentence({ text, once, label, onSentence = () => {}, onRetry, sleep }) {
  const sentences = splitSentences(text);
  const pieces = [];
  const words = [];
  let t = 0;
  let fmt = null;
  for (let i = 0; i < sentences.length; i++) {
    onSentence(i + 1, sentences.length);
    const w = parseWav(await patiently(() => once(sentences[i]), { label, onRetry, sleep }));
    if (!fmt) fmt = { channels: w.channels, rate: w.rate, bits: w.bits };
    if (w.rate !== fmt.rate || w.channels !== fmt.channels || w.bits !== fmt.bits) throw new Error(`${label} changed the audio format mid-way.`);
    if (i > 0) {
      pieces.push(Buffer.alloc(Math.round(GAP_SECONDS * fmt.rate) * fmt.channels * (fmt.bits / 8)));
      t += GAP_SECONDS;
    }
    const d = seconds(w);
    words.push(...wordsByCharacters(sentences[i], t, t + d));
    pieces.push(w.pcm);
    t += d;
  }
  if (!fmt) throw new Error("The script has no text to read aloud.");
  return { audio: writeWav({ ...fmt, pcm: Buffer.concat(pieces) }), words, ext: "wav" };
}
