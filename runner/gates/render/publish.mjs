// gates/render/publish.mjs: the Video Publishing Card of a rendered video
// (DECISIONS 77, 114). Everything the app knows exactly and a publishing app
// cannot get back from YouTube without guessing: chapter times from the
// voice, the script as written, the comment calls with their times, the
// landing page link, where the end screen starts; and the packaging chosen
// at gate 1 (title, summary, tags; DECISIONS 86).
//
//   out/video-<stamp>.card.json      the card (schema video-publishing-card/1)
//   out/video-<stamp>.comments.txt   the comment calls, for people
//
// The schema (runner/schema/video-publishing-card.schema.json) is the
// shared language with the publishing app: the file of "Export card" and
// the body of "Send to Publishing". The card is checked against it before
// it is written. cardId is made once per project (project.json) and kept,
// so sending again updates the same card. It only ever grows; a breaking
// change gets a new version.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { narrationFromMarkdown } from "../voice/narration.mjs";
import { callSentences } from "../scenes/index.mjs";
import { TEMPERATURES } from "../../cta/catalog.mjs";
import { validate, loadSchema } from "../../schema/validate.mjs";
import { loadProject, saveProject } from "../../project.mjs";
import { loadPackaging } from "./youtube.mjs";

export const CARD_SCHEMA = "video-publishing-card/1";
const r3 = (x) => Math.round(x * 1000) / 1000;

const readJson = (projectDir, f) => {
  const p = path.join(projectDir, f);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
};

// The project's card id: made once, kept in project.json.
export function cardIdOf(projectDir) {
  const p = loadProject(projectDir);
  if (p.cardId) return p.cardId;
  const cardId = crypto.randomUUID();
  saveProject(projectDir, { ...p, cardId });
  return cardId;
}

// chapters: [{ start, title }] from export.mjs chapters().
export function buildCard(projectDir, videoFile, { language = "en", total, chapters = [], chaptersText = "", appVersion = null, project = {}, syntheticMedia = false } = {}) {
  const script = readJson(projectDir, "script.json");
  const sentences = readJson(projectDir, "sentences.json") ?? [];
  const mdFile = path.join(projectDir, "script.md");
  const md = fs.existsSync(mdFile) ? fs.readFileSync(mdFile, "utf8") : "";
  const base = path.basename(videoFile).replace(/\.mp4$/i, "");
  const found = callSentences(script, sentences);
  const byId = new Map(sentences.map((s) => [s.id, s]));
  const calls = (script?.commentCalls ?? []).map((c) => {
    const id = [...found].find(([, v]) => v.slot === c.slot)?.[0];
    const s = id ? byId.get(id) : null;
    return {
      slot: c.slot,
      keyword: c.keyword,
      temperature: c.temperature,
      gets: c.offer || c.gets || null,
      via: "narrator",
      start: s ? s.start : null,
      end: s ? s.end : null,
    };
  });
  // The places a segment filled, where the voice gate put them.
  const voice = readJson(projectDir, path.join("audio", "voice.json")) ?? {};
  for (const g of voice.inserts ?? []) {
    const sc = (script?.segmentCalls ?? []).find((x) => x.slot === g.slot);
    calls.push({ slot: g.slot, keyword: g.keyword, temperature: g.temperature, gets: sc?.gets ?? null, via: "segment", start: g.start, end: g.end, said: g.text ?? null });
  }
  calls.sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
  const pub = script?.publishing ?? {};
  const pack = loadPackaging(projectDir);
  return {
    schema: CARD_SCHEMA,
    cardId: cardIdOf(projectDir),
    videoId: null,
    createdAt: new Date().toISOString(),
    app: { name: "IdeaToVideo", version: appVersion },
    video: { file: `${base}.mp4`, seconds: r3(total ?? sentences.at(-1)?.end ?? 0), language, title: project.title || script?.title || null, workingTitle: script?.title ?? null },
    searchKeyword: pub.searchKeyword ?? null,
    landingUrl: pub.landingUrl ?? null,
    next: { video: pub.nextVideo ?? null, playlist: pub.playlist ?? null },
    chapters: chapters.map((c) => ({ start: r3(c.start), title: c.title })),
    chaptersText,
    captions: { file: `${base}.srt`, language },
    // The script as written: exact words, the source for any translation.
    script: narrationFromMarkdown(md).map((b) => ({ heading: b.heading, text: b.text })),
    // The recorded sentences with their times (measured on the voice).
    sentences: sentences.map((s) => ({ start: s.start, end: s.end, text: s.text })),
    commentCalls: calls,
    // Where YouTube's end screen goes: the silent tail after the last call.
    endScreen: voice.endScreen ? { ...voice.endScreen, startSec: voice.endScreen.start } : null,
    packaging: pack ? { titles: pack.titles, title: pack.title, summary: pack.summary, tags: pack.tags } : null,
    // A generated clip (AI B-roll) is in the video: YouTube Studio's
    // "altered or synthetic content" question is to be answered yes when a
    // clip looks real (a person, a place, an event).
    syntheticMedia: !!syntheticMedia,
  };
}

// The comment calls for people: what to reply to, and when it is said.
export function commentsText(publish) {
  const clock = (s) => (s === null ? "?" : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`);
  if (!publish.commentCalls.length) return "This video asks for no comment keywords.\n";
  const lines = ["Comment keywords in this video", ""];
  for (const c of publish.commentCalls) {
    lines.push(`${c.keyword}  (${TEMPERATURES[c.temperature]?.label ?? c.temperature}, at ${clock(c.start)})  viewer gets: ${c.gets ?? ""}`);
  }
  lines.push("", "Reply to each keyword comment with the matching link.");
  if (publish.landingUrl) lines.push(`Landing page: ${publish.landingUrl}`);
  return lines.join("\n") + "\n";
}

export function checkCard(card) {
  const errors = validate(card, loadSchema("video-publishing-card"));
  if (errors.length) throw new Error(`The publishing card is not valid: ${errors.slice(0, 4).join("; ")}`);
  return card;
}

export function writeCard(projectDir, videoFile, opts) {
  const base = videoFile.replace(/\.mp4$/i, "");
  const card = checkCard(buildCard(projectDir, videoFile, opts));
  fs.writeFileSync(`${base}.card.json`, JSON.stringify(card, null, 2) + "\n");
  const comments = commentsText(card);
  fs.writeFileSync(`${base}.comments.txt`, comments);
  return { cardFile: `${base}.card.json`, commentsFile: `${base}.comments.txt`, comments, calls: card.commentCalls };
}
