// narration.mjs: what gets read aloud. The source is script.md (the approved
// text; Custom edits only change script.md, so script.json may be stale).
//
// One block per "## " section (OPEN, 1. ..., OWN). Each block is one TTS call;
// the voice gate puts a short pause (about 0.6 s) before each section, so
// the viewer can follow a process. Not spoken: the "# " title line,
// headings, and [CALLOUT: ...] notes (those are on-screen text, not narration).

import { KEYWORDS } from "../../cta/catalog.mjs";

export function narrationFromMarkdown(md) {
  const blocks = [];
  let cur = null;
  for (const raw of String(md).replace(/^﻿/, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (/^#\s/.test(line)) continue; // the video title
    const h = /^##\s+(.*)$/.exec(line);
    if (h) {
      cur = { heading: h[1].trim(), paragraphs: [] };
      blocks.push(cur);
      continue;
    }
    if (!line || /^\[CALLOUT:.*\]$/i.test(line)) continue;
    if (!cur) {
      cur = { heading: "", paragraphs: [] };
      blocks.push(cur);
    }
    cur.paragraphs.push(line);
  }
  return blocks.filter((b) => b.paragraphs.length).map((b) => ({ heading: b.heading, text: b.paragraphs.join(" ") }));
}

// The comment keywords stand in capitals in the script and on screen, but a
// voice may spell a word in capitals letter by letter. It gets them as plain
// words ("GUIDE" -> "Guide"); PDF is said as letters anyway.
const SPOKEN_AS_WORD = KEYWORDS.map((k) => k.keyword).filter((k) => k !== "PDF");
const CAPS = new RegExp(`(?<!\\p{L})(${SPOKEN_AS_WORD.join("|")})(?!\\p{L})`, "gu");
export const speakable = (text) => String(text).replace(CAPS, (w) => w[0] + w.slice(1).toLowerCase());

export const wordCount = (blocks) => blocks.reduce((n, b) => n + b.text.split(/\s+/).filter(Boolean).length, 0);
