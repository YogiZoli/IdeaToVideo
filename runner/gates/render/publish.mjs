// gates/render/publish.mjs: the publishing data of a rendered video (Zoltan,
// 2026-10-05, DECISIONS 77). Everything the app knows exactly and a
// publishing tool cannot get back from YouTube without guessing: chapter
// times from the voice, the script as written, the comment calls with their
// times, the landing page link. Facts only: titles, descriptions and tags
// belong to the publishing tool, never to this app.
//
//   out/video-<stamp>.publish.json   for the publishing tool (schema itv-publish/1)
//   out/video-<stamp>.comments.txt   the comment calls, for people
//
// The schema (runner/schema/itv-publish.schema.json) is the shared language
// between IdeaToVideo and the publishing tool: a file today, the body of an
// API call later. It only ever grows; a breaking change gets a new version.

import fs from "node:fs";
import path from "node:path";
import { narrationFromMarkdown } from "../voice/narration.mjs";
import { callSentences } from "../scenes/index.mjs";
import { TEMPERATURES } from "../../cta/catalog.mjs";

export const PUBLISH_SCHEMA = "itv-publish/1";
const r3 = (x) => Math.round(x * 1000) / 1000;

const readJson = (projectDir, f) => {
  const p = path.join(projectDir, f);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
};

// chapters: [{ start, title }] from export.mjs chapters().
export function buildPublish(projectDir, videoFile, { language = "en", total, chapters = [], chaptersText = "", appVersion = null, project = {} } = {}) {
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
      start: s ? s.start : null,
      end: s ? s.end : null,
    };
  });
  const pub = script?.publishing ?? {};
  return {
    schema: PUBLISH_SCHEMA,
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

export function writePublish(projectDir, videoFile, opts) {
  const base = videoFile.replace(/\.mp4$/i, "");
  const publish = buildPublish(projectDir, videoFile, opts);
  fs.writeFileSync(`${base}.publish.json`, JSON.stringify(publish, null, 2) + "\n");
  const comments = commentsText(publish);
  fs.writeFileSync(`${base}.comments.txt`, comments);
  return { publishFile: `${base}.publish.json`, commentsFile: `${base}.comments.txt`, comments, calls: publish.commentCalls };
}
