// gates/render/export.mjs: what goes next to every rendered video (PRD step
// 13): captions as SRT from the measured word times, and the YouTube chapter
// list from the script's sections. Both come from the approved voice, so they
// match the video exactly.
//
//   out/video-<stamp>.srt           upload it in YouTube Studio as subtitles
//   out/video-<stamp>.chapters.txt  paste it into the video description
//   out/video-<stamp>.card.json  and .comments.txt (publish.mjs)

import fs from "node:fs";
import path from "node:path";
import { closesSentence } from "../../timing/sentences.mjs";
import { sentenceSections } from "../scenes/index.mjs";
import { writeCard } from "./publish.mjs";

export const MAX_LINE = 42; // characters per caption line (a common broadcast limit)
export const MAX_CUE_SECONDS = 5;
export const MIN_CHAPTER_SECONDS = 10; // YouTube: every chapter at least 10 s
export const MIN_CHAPTERS = 3; // YouTube: at least 3 chapters, the first at 0:00

const srtTime = (s) => {
  const ms = Math.max(0, Math.round(s * 1000));
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};

// One line per cue: a cue ends at a sentence end, before the line gets longer
// than MAX_LINE, or after MAX_CUE_SECONDS.
export function captionCues(words) {
  const cues = [];
  let cur = [];
  const flush = () => {
    if (cur.length) cues.push({ start: cur[0].start, end: cur[cur.length - 1].end, text: cur.map((w) => w.text).join(" ") });
    cur = [];
  };
  for (const w of words) {
    const text = [...cur, w].map((x) => x.text).join(" ");
    if (cur.length && (text.length > MAX_LINE || w.end - cur[0].start > MAX_CUE_SECONDS)) flush();
    cur.push(w);
    if (closesSentence(w.text)) flush();
  }
  flush();
  return cues;
}

// The words of the CTA segments (what the user wrote the clip says; the
// voice gate placed them, audio/voice.json inserts), spread evenly over the
// clip in lines of at most MAX_LINE characters. Without a text: no caption.
export function segmentCues(projectDir) {
  let inserts = [];
  try {
    inserts = JSON.parse(fs.readFileSync(path.join(projectDir, "audio", "voice.json"), "utf8")).inserts ?? [];
  } catch {
    return [];
  }
  const cues = [];
  for (const g of inserts) {
    if (!g.text) continue;
    const lines = [];
    for (const w of String(g.text).split(/\s+/)) {
      if (lines.length && (lines[lines.length - 1] + " " + w).length <= MAX_LINE) lines[lines.length - 1] += " " + w;
      else lines.push(w);
    }
    const each = (g.end - g.start) / lines.length;
    lines.forEach((text, i) => cues.push({ start: g.start + i * each, end: g.start + (i + 1) * each - 0.05, text }));
  }
  return cues;
}

export function toSrt(cues) {
  return cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join("\n");
}

const clock = (s) => {
  const t = Math.floor(s);
  const h = Math.floor(t / 3600);
  const m = Math.floor(t / 60) % 60;
  const sec = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};

const OPENING = { en: "Intro", hu: "Bevezetés", de: "Einleitung", es: "Introducción", fr: "Introduction" };
const CLOSING = { en: "Summary", hu: "Összegzés", de: "Zusammenfassung", es: "Resumen", fr: "Résumé" };

// "OPEN" / "1. Pricing" / "OWN" -> a chapter title in the content language.
export function chapterTitle(heading, language = "en") {
  const h = String(heading).trim();
  if (/^open$/i.test(h)) return OPENING[language] ?? OPENING.en;
  if (/^own$/i.test(h)) return CLOSING[language] ?? CLOSING.en;
  return h.replace(/^\d+\.\s*/, "");
}

// Chapters start where a section's first sentence starts; the first one at
// 0:00. A chapter shorter than MIN_CHAPTER_SECONDS joins the one before it.
export function chapters(sentences, sections, total, language = "en") {
  const list = [];
  sentences.forEach((s, i) => {
    if (i === 0 || sections[i] !== sections[i - 1]) list.push({ start: i === 0 ? 0 : s.start, title: chapterTitle(sections[i] ?? "", language) });
  });
  const kept = [];
  for (const c of list) {
    const prev = kept[kept.length - 1];
    if (prev && c.start - prev.start < MIN_CHAPTER_SECONDS) continue;
    kept.push(c);
  }
  const last = kept[kept.length - 1];
  if (kept.length > 1 && total - last.start < MIN_CHAPTER_SECONDS) kept.pop();
  const text = kept.map((c) => `${clock(c.start)} ${c.title}`).join("\n");
  const ok = kept.length >= MIN_CHAPTERS;
  return { chapters: kept, text, ok, note: ok ? null : `YouTube shows chapters only with at least ${MIN_CHAPTERS} of ${MIN_CHAPTER_SECONDS} s or more. This video has ${kept.length}.` };
}

// Writes both files next to the video; returns what the UI shows.
export function writeExtras(projectDir, videoFile, { language = "en", total, appVersion = null, project = {}, syntheticMedia = false } = {}) {
  const base = videoFile.replace(/\.mp4$/i, "");
  const words = JSON.parse(fs.readFileSync(path.join(projectDir, "words.json"), "utf8"));
  const sentences = JSON.parse(fs.readFileSync(path.join(projectDir, "sentences.json"), "utf8"));
  const mdFile = path.join(projectDir, "script.md");
  const md = fs.existsSync(mdFile) ? fs.readFileSync(mdFile, "utf8") : "";
  fs.writeFileSync(`${base}.srt`, toSrt([...captionCues(words), ...segmentCues(projectDir)].sort((a, b) => a.start - b.start)));
  const ch = chapters(sentences, sentenceSections(md, sentences), total ?? sentences[sentences.length - 1]?.end ?? 0, language);
  fs.writeFileSync(`${base}.chapters.txt`, ch.text + "\n");
  const pub = writeCard(projectDir, videoFile, { language, total, chapters: ch.chapters, chaptersText: ch.text, appVersion, project, syntheticMedia });
  return { srt: `${base}.srt`, chaptersFile: `${base}.chapters.txt`, chapters: ch.text, chaptersNote: ch.note, syntheticMedia: !!syntheticMedia, ...pub };
}
