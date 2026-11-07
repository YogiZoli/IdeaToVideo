// planner/index.mjs: the Playlist Planner (DECISIONS 127), the YT Evergreen
// Flywheel built in for the app's own user. It plans ONE evergreen playlist
// for an Identity and writes it as a Course Content Structure 1.0, the file
// the course import already reads (course/index.mjs). That file is the
// contract: a later standalone Flywheel app can write the same file and
// replace this wizard, and nothing else changes.
//
//   1. seeds      from the Traffic Card's keywords, or the typed topic (free)
//   2. research   vidIQ keyword research, one call per seed (vidIQ credits)
//   3. plan       the AI picks one video per strong keyword, 8 to 16, and
//                 says why this number (AI tokens)
//   4. the user edits and approves the table
//   5. outline    the AI writes hook, teach, do and review per video,
//                 10 to 20 minutes each (AI tokens)
//   6. the file   built here, in code, then handed to the course import
//
// Every paid call is its own runner command, so the UI asks before each one.
// Nothing here makes a ONE Video: the import does that, after "Create".

import fs from "node:fs";
import path from "node:path";
import { chat, extractJson } from "../providers/llm.mjs";
import { VidiqSession, countryCode } from "../providers/research/vidiq.mjs";

export const MIN_VIDEOS = 8;
export const MAX_VIDEOS = 16;
export const MIN_MINUTES = 10;
export const MAX_MINUTES = 20;
export const MAX_SEEDS = 20;

const str = (v, max = 1000) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const norm = (k) => str(k, 200).toLowerCase();

export function slugOf(text) {
  const s = String(text ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return s || "playlist";
}

// The seed keywords: the searches typed in the wizard, the card's best (by score), its playlists' target
// keywords, else the typed topic. At most 20, the user can edit them.
export function seedsFrom({ card = null, topic = "" } = {}) {
  const out = [];
  const add = (k) => {
    const t = str(k, 150);
    if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
  };
  if (card) {
    // the searches the user typed in the wizard first: none of them is ever dropped (DECISIONS 183)
    for (const k of card.keywords ?? []) if (/^your words$/i.test(k.seed ?? "")) add(k.keyword);
    for (const p of card.playlists ?? []) if (!/^start here$/i.test(p.title)) add(p.keyword);
    for (const k of [...(card.keywords ?? [])].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))) add(k.keyword);
  }
  add(topic);
  return out.slice(0, MAX_SEEDS);
}

// vidIQ: the credits left now, for the question before the research (free).
export async function vidiqBalance({ apiKey, fetchImpl }) {
  const s = await new VidiqSession({ apiKey, fetchImpl }).open();
  const b = await s.tool("vidiq_balance");
  return { credits: typeof b?.totalCredits === "number" ? b.totalCredits : null };
}

const kw = (k) => ({
  keyword: str(k?.keyword, 200),
  // "<750" from vidIQ's Markdown answer is read as { value: 750, below: true }
  volume: typeof k?.estimatedMonthlySearch === "number" ? Math.round(k.estimatedMonthlySearch) : typeof k?.estimatedMonthlySearch?.value === "number" ? Math.round(k.estimatedMonthlySearch.value) : typeof k?.volume === "number" ? Math.round(k.volume) : null,
  competition: typeof k?.competition === "number" ? Math.round(k.competition) : null,
  score: typeof k?.overall === "number" ? Math.round(k.overall) : null,
});

// One vidIQ keyword research per seed, in one session. The rows of every
// seed together, each keyword once, best score first. The credits before
// and after, so the user sees what it took.
export async function research({ apiKey, seeds, country = null, fetchImpl, onProgress = () => {} }) {
  const list = (seeds ?? []).map((s) => str(s, 150)).filter(Boolean).slice(0, MAX_SEEDS);
  if (!list.length) throw new Error("Add at least one seed keyword.");
  const s = await new VidiqSession({ apiKey, fetchImpl }).open();
  const before = await s.tool("vidiq_balance").catch(() => null);
  const rows = new Map();
  const failed = [];
  for (let i = 0; i < list.length; i++) {
    onProgress({ step: "research", done: i, of: list.length, seed: list[i] });
    try {
      const code = countryCode(country);
      const d = await s.tool("vidiq_keyword_research", { keyword: list[i], mode: "research", ...(code ? { country: code } : {}) });
      for (const raw of [d?.seedKeyword, ...(d?.relatedKeywords ?? [])]) {
        const r = kw(raw);
        if (r.keyword && !rows.has(norm(r.keyword))) rows.set(norm(r.keyword), { ...r, seed: list[i] });
      }
    } catch (e) {
      failed.push(`${list[i]}: ${e.message}`);
    }
  }
  const after = await s.tool("vidiq_balance").catch(() => null);
  const keywords = [...rows.values()].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 120);
  if (!keywords.length) throw new Error(`vidIQ found no keyword data for these seeds.${failed.length ? ` ${failed[0]}` : ""}`);
  const left = (b) => (typeof b?.totalCredits === "number" ? b.totalCredits : null);
  const [b0, b1] = [left(before), left(after)];
  return { keywords, failed, creditsBefore: b0, creditsAfter: b1, creditsUsed: b0 !== null && b1 !== null ? Math.max(0, b0 - b1) : null };
}

// The last research of an Identity, kept in its folder: Keyword Research writes it, the
// Playlist Planner reads it, and it stays there after the app closes (DECISIONS 175).
export const RESEARCH_FILE = "keyword-research.json";
export function saveResearch(identityDir, { seeds = [], keywords = [], failed = [], creditsUsed = null } = {}, at = new Date().toISOString()) {
  if (!identityDir) return null;
  const saved = { seeds, keywords, failed, creditsUsed, at };
  const file = path.join(identityDir, RESEARCH_FILE);
  fs.mkdirSync(identityDir, { recursive: true });
  fs.writeFileSync(`${file}.part`, `${JSON.stringify(saved, null, 2)}\n`);
  fs.renameSync(`${file}.part`, file);
  return saved;
}
export function loadResearch(identityDir) {
  if (!identityDir) return null;
  try {
    const r = JSON.parse(fs.readFileSync(path.join(identityDir, RESEARCH_FILE), "utf8"));
    return Array.isArray(r?.keywords) && r.keywords.length ? { seeds: Array.isArray(r.seeds) ? r.seeds : [], keywords: r.keywords, failed: Array.isArray(r.failed) ? r.failed : [], creditsUsed: r.creditsUsed ?? null, at: r.at ?? null } : null;
  } catch {
    // none yet, or a damaged file: the research is simply run again
    return null;
  }
}

// What the AI knows about the channel: from the card or the typed answers.
export function contextOf({ card = null, answers = {}, channel = {}, language = "en" }) {
  return {
    language,
    audience: str(answers.audience, 2000) || str(card?.audience, 2000) || str(channel.audience, 2000),
    promise: str(answers.promise, 1000) || str(card?.result, 1000),
    topic: str(answers.topic, 500) || str(card?.topic, 500),
    frustration: str(card?.frustration, 1000),
    proof: str(card?.proof, 1000),
    profile: str(channel.profile, 2000),
    playlistIdeas: (card?.playlists ?? []).map((p) => ({ title: p.title, keyword: p.keyword, description: p.description })).slice(0, 8),
  };
}

const PLAN_SYSTEM = `You plan ONE evergreen YouTube playlist for a channel, from real vidIQ keyword data.
Rules:
- One video per strong keyword. Use only keywords from KEYWORDS, spelled exactly as given.
- The number of videos comes from the data: usually ${MIN_VIDEOS} to ${MAX_VIDEOS}. Never fewer than ${MIN_VIDEOS} or more than ${MAX_VIDEOS}.
- Prefer keywords with real search volume and low or medium competition. Skip near duplicates.
- Order the videos so each one leads to the next: basics first.
- Each video is 10 to 20 minutes, accurate, evergreen, simple English (or the given language).
- Titles: clear, honest, under 70 characters, the keyword in them where it reads naturally.
- "why": two or three plain sentences: why this number of videos, from the data.
Answer with one JSON object only:
{"playlist": {"title": "...", "promise": "ONE SENTENCE"}, "why": "...", "videos": [{"keyword": "...", "title": "..."}]}`;

export function planIssues(answer, keywords) {
  const issues = [];
  const known = new Set(keywords.map((k) => norm(k.keyword)));
  const v = Array.isArray(answer?.videos) ? answer.videos : null;
  if (!str(answer?.playlist?.title)) issues.push("playlist.title is missing");
  if (!v) return [...issues, "videos is missing"];
  if (v.length < MIN_VIDEOS || v.length > MAX_VIDEOS) issues.push(`there are ${v.length} videos, it must be ${MIN_VIDEOS} to ${MAX_VIDEOS}`);
  const seen = new Set();
  v.forEach((x, i) => {
    if (!str(x?.title)) issues.push(`video ${i + 1} has no title`);
    const k = norm(x?.keyword);
    if (!known.has(k)) issues.push(`video ${i + 1}: "${str(x?.keyword, 80)}" is not one of the KEYWORDS`);
    if (seen.has(k)) issues.push(`video ${i + 1}: the keyword "${str(x?.keyword, 80)}" is used twice`);
    seen.add(k);
  });
  return issues;
}

// The AI's plan as table rows, with vidIQ's numbers for each keyword.
export function planRows(answer, keywords) {
  const by = new Map(keywords.map((k) => [norm(k.keyword), k]));
  return answer.videos.slice(0, MAX_VIDEOS).map((x, i) => {
    const k = by.get(norm(x.keyword)) ?? {};
    return { position: i + 1, title: str(x.title, 100), keyword: k.keyword ?? str(x.keyword, 200), volume: k.volume ?? null, competition: k.competition ?? null };
  });
}

async function askJson({ llm, system, data, issuesOf, onProgress, temperature = 0.4 }) {
  const messages = [
    { role: "system", content: system },
    { role: "user", content: `DATA\n${JSON.stringify(data, null, 1)}\nEND DATA\n\nAnswer with the JSON object only.` },
  ];
  let answer = null;
  let issues = [];
  for (let round = 0; round < 2; round++) {
    const text = await chat({ ...llm, messages, json: true, temperature, onProgress });
    try {
      answer = extractJson(text);
      issues = issuesOf(answer);
    } catch (e) {
      issues = [`the answer was not valid JSON (${e.message})`];
    }
    if (!issues.length) return answer;
    messages.push({ role: "assistant", content: text }, { role: "user", content: `Fix these problems and answer with the whole JSON object again:\n- ${issues.slice(0, 12).join("\n- ")}` });
  }
  throw new Error(`The AI's plan still had problems after one repair: ${issues.slice(0, 3).join("; ")}. Try again, or pick another model.`);
}

export async function planPlaylist({ llm, context, keywords, onProgress }) {
  if (!keywords?.length) throw new Error("Run the keyword research first.");
  const data = { channel: context, KEYWORDS: keywords.slice(0, 120).map((k) => ({ keyword: k.keyword, volume: k.volume, competition: k.competition, score: k.score })) };
  const answer = await askJson({ llm, system: PLAN_SYSTEM, data, issuesOf: (a) => planIssues(a, keywords), onProgress });
  return { title: str(answer.playlist.title, 200), promise: str(answer.playlist.promise, 500) || context.promise, why: str(answer.why, 1500), rows: planRows(answer, keywords) };
}

// The table the user approved: positions 1..N in the shown order, every row
// with a title and a keyword, 1 to 16 rows (the user may go below 8).
export function checkRows(rows) {
  const list = (Array.isArray(rows) ? rows : []).map((r) => ({ title: str(r?.title, 100), keyword: str(r?.keyword, 200), volume: Number.isFinite(r?.volume) ? r.volume : null, competition: Number.isFinite(r?.competition) ? r.competition : null }));
  if (!list.length) throw new Error("The plan has no videos.");
  if (list.length > MAX_VIDEOS) throw new Error(`The plan has ${list.length} videos; at most ${MAX_VIDEOS}.`);
  list.forEach((r, i) => {
    if (!r.title) throw new Error(`Video ${i + 1} has no title.`);
    if (!r.keyword) throw new Error(`Video ${i + 1} has no keyword.`);
  });
  return list.map((r, i) => ({ ...r, position: i + 1 }));
}

const OUTLINE_SYSTEM = `You outline the videos of one evergreen YouTube playlist. One entry per video in VIDEOS, same order, same titles.
Each video is ${MIN_MINUTES} to ${MAX_MINUTES} minutes in total: teach.minutes + do.minutes + review.minutes.
- hook: the first two sentences the viewer hears. Concrete, no hype.
- teach.points: 3 to 6 short points that are accurate and evergreen.
- do.exercise: one action the viewer does right after watching.
- review.check: one recap line.
- youtube_title: at most 100 characters, the keyword in it where it reads naturally.
Simple words, in the given language. Answer with one JSON object only:
{"videos": [{"title": "...", "hook": "...", "teach": {"minutes": 12, "points": ["..."]}, "do": {"minutes": 3, "exercise": "..."}, "review": {"minutes": 1, "check": "..."}, "youtube_title": "..."}]}`;

const minutes = (v) => (v?.teach?.minutes ?? 0) + (v?.do?.minutes ?? 0) + (v?.review?.minutes ?? 0);

export function outlineIssues(answer, rows) {
  const v = Array.isArray(answer?.videos) ? answer.videos : null;
  if (!v) return ["videos is missing"];
  const issues = [];
  if (v.length !== rows.length) issues.push(`there are ${v.length} videos, there must be ${rows.length}`);
  v.slice(0, rows.length).forEach((x, i) => {
    if (!str(x?.hook)) issues.push(`video ${i + 1} has no hook`);
    const pts = Array.isArray(x?.teach?.points) ? x.teach.points.filter((p) => str(p)) : [];
    if (pts.length < 3) issues.push(`video ${i + 1} has ${pts.length} teach points, it needs 3 to 6`);
    if (!str(x?.do?.exercise)) issues.push(`video ${i + 1} has no do.exercise`);
    const m = minutes(x);
    if (!(m >= MIN_MINUTES && m <= MAX_MINUTES)) issues.push(`video ${i + 1} is ${m} minutes, it must be ${MIN_MINUTES} to ${MAX_MINUTES}`);
  });
  return issues;
}

export async function outlineVideos({ llm, context, rows, onProgress }) {
  const list = checkRows(rows);
  const data = { channel: context, VIDEOS: list.map((r) => ({ position: r.position, title: r.title, keyword: r.keyword })) };
  const answer = await askJson({ llm, system: OUTLINE_SYSTEM, data, issuesOf: (a) => outlineIssues(a, list), onProgress, temperature: 0.5 });
  return { outline: answer.videos.slice(0, list.length) };
}

const pos = (n) => (Number.isInteger(n) && n > 0 ? n : 1);

// The Course Content Structure 1.0, in the shape the course import reads
// (and the doc 27 prompt asks for). Built here, never by the AI.
export function buildStructure({ title, promise, audience, rows, outline, now = new Date() }) {
  const list = checkRows(rows);
  const name = str(title, 200);
  if (!name) throw new Error("Give the playlist a name.");
  return {
    type: "course-content-structure",
    schema_version: "1.0",
    generated_at: now.toISOString(),
    source: "ideatovideo-playlist-planner",
    course: { title: name, slug: slugOf(name), bold_promise: str(promise, 1000), ideal_client: str(audience, 2000), lesson_count: list.length },
    lessons: list.map((r, i) => {
      const o = outline?.[i] ?? {};
      return {
        id: `v${r.position}`,
        playlist_position: r.position,
        title: r.title,
        keyword: r.keyword,
        hook: str(o.hook, 1000),
        teach: { minutes: pos(o.teach?.minutes), points: (Array.isArray(o.teach?.points) ? o.teach.points : []).map((p) => str(p)).filter(Boolean).slice(0, 6) },
        do: { minutes: pos(o.do?.minutes), exercise: str(o.do?.exercise, 2000) },
        review: { minutes: pos(o.review?.minutes), check: str(o.review?.check, 2000) },
        // no closing line in the file: the script gate says the previous and
        // the next video from the order at script time (course/bridge.mjs)
        cta: "",
        youtube: { title: str(o.youtube_title, 100) || r.title },
      };
    }),
  };
}
