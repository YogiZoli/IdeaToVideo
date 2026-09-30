// narration.mjs: what gets read aloud. The source is script.md (the approved
// text; Custom edits only change script.md, so script.json may be stale).
//
// One block per "## " section (OPEN, 1. ..., OWN). Each block is one TTS call;
// the voice gate puts a short pause (about 0.6 s) before each section, so
// the viewer can follow a process. Not spoken: the "# " title line,
// headings, and [CALLOUT: ...] notes (those are on-screen text, not narration).

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

export const wordCount = (blocks) => blocks.reduce((n, b) => n + b.text.split(/\s+/).filter(Boolean).length, 0);
