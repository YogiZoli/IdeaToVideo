// planner/traffic-card.mjs: the Evergreen Traffic Card (DECISIONS 127), the
// .md the Brand Channel Wizard (yt-band-channel-wizard, buildMarkdown) hands
// out at its end. A reader only: the card is kept with the Identity as it
// came, and only what fits a field the app already has is offered for it.
// Everything else in the card is ignored here; the Playlist Planner reads
// its keywords, playlists and video list.
//
//   <identity>/traffic-card.md    the card, byte for byte
//
// The card's shape (front matter, then fixed headings):
//   ---  card: youtube-evergreen-organic-traffic-card, version: 1  ---
//   ## Channel / ### Profile      "- Audience: ...", "- Result: ...", ...
//   ### Name options              "- <name>"
//   ## Pillars, ## Playlists, ## Keywords, ... ## Video List   one table each
// The research tables are the AI's answer pasted back, so their columns are
// found by name, never by place.

import fs from "node:fs";
import path from "node:path";
import { writeAtomic } from "../project.mjs";

export const CARD_TYPE = "youtube-evergreen-organic-traffic-card";
export const CARD_FILE = "traffic-card.md";
export const MAX_BYTES = 512 * 1024;

const AGAIN = "Download the .md card at the end of the Brand Channel Wizard and try again.";

// The languages the wizard offers, as the app's language codes. Anything else
// leaves the content language as it is.
const LANGS = { english: "en", hungarian: "hu", magyar: "hu", german: "de", deutsch: "de", spanish: "es", "español": "es", french: "fr", "français": "fr", italian: "it", portuguese: "pt", dutch: "nl", polish: "pl", romanian: "ro" };

const cut = (s, max) => String(s ?? "").trim().slice(0, max);

// "## Heading" -> its lines, for the H2 and H3 levels.
export function sections(md, level) {
  const mark = "#".repeat(level) + " ";
  const out = new Map();
  let name = null;
  for (const line of md.split(/\r?\n/)) {
    if (line.startsWith(mark)) {
      name = line.slice(mark.length).trim().toLowerCase();
      if (!out.has(name)) out.set(name, []);
    } else if (/^#{1,6} /.test(line) && line.match(/^#+/)[0].length <= level) {
      name = null;
    } else if (name) out.get(name).push(line);
  }
  return out;
}

// The first markdown table in these lines: [{ header: cell }].
export function readTable(lines) {
  const rows = [];
  let head = null;
  for (const raw of lines ?? []) {
    const line = raw.trim();
    if (!line.startsWith("|")) {
      if (head && rows.length) break;
      continue;
    }
    const cells = line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    if (!head) head = cells.map((c) => c.toLowerCase());
    else if (cells.every((c) => /^:?-{2,}:?$/.test(c) || c === "")) continue;
    else rows.push(Object.fromEntries(head.map((h, i) => [h, cells[i] ?? ""])));
  }
  return rows;
}

// A column found by any of these words in its header.
const col = (row, ...words) => {
  const k = Object.keys(row).find((h) => words.some((w) => h.includes(w)));
  return k ? row[k] : "";
};
const num = (v) => {
  const t = String(v ?? "").replace(/[, ]/g, "").toLowerCase();
  const m = /^~?(\d+(?:\.\d+)?)(k|m)?/.exec(t);
  if (!m) return null;
  return Math.round(Number(m[1]) * (m[2] === "k" ? 1e3 : m[2] === "m" ? 1e6 : 1));
};
const bullets = (lines) => (lines ?? []).map((l) => /^\s*-\s+(.*)$/.exec(l)?.[1]?.trim()).filter(Boolean);

export function parseTrafficCard(text) {
  const raw = String(text ?? "").replace(/^﻿/, "");
  if (!raw.trim()) throw new Error(`There is nothing to read: the text is empty. ${AGAIN}`);
  if (Buffer.byteLength(raw) > MAX_BYTES) throw new Error("This is too large to be a Traffic Card (more than 512 KB).");
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  const card = front ? /^card:\s*(.+)$/m.exec(front[1])?.[1]?.trim() : null;
  if (card !== CARD_TYPE) throw new Error(`This is not an Evergreen Traffic Card${card ? ` (it says "${card.slice(0, 60)}")` : ""}. ${AGAIN}`);
  const version = Number(/^version:\s*(\d+)/m.exec(front[1])?.[1] ?? 0);
  if (version !== 1) throw new Error(`This Traffic Card is version ${version || "unknown"}. This app reads version 1 only. ${AGAIN}`);

  const h3 = sections(raw, 3);
  const h2 = sections(raw, 2);
  const profile = {};
  for (const b of bullets(h3.get("profile"))) {
    const m = /^([^:]+):\s*(.*)$/.exec(b);
    if (m) profile[m[1].trim().toLowerCase()] = m[2].trim();
  }
  const keywords = readTable(h2.get("keywords"))
    .map((r) => ({ keyword: cut(col(r, "keyword"), 200), volume: num(col(r, "volume", "search")), competition: cut(col(r, "competition"), 40), score: num(col(r, "score")) }))
    .filter((k) => k.keyword);
  const playlists = readTable(h2.get("playlists"))
    .map((r) => ({ title: cut(col(r, "playlist"), 200), pillar: cut(col(r, "pillar"), 200), keyword: cut(col(r, "keyword"), 200), description: cut(col(r, "description"), 500) }))
    .filter((p) => p.title);
  const videos = readTable(h2.get("video list"))
    .map((r) => ({ title: cut(col(r, "title"), 200), keyword: cut(col(r, "keyword"), 200), playlist: cut(col(r, "playlist"), 200), volume: num(col(r, "volume")), competition: cut(col(r, "competition"), 40) }))
    .filter((v) => v.title);
  const language = LANGS[String(profile.language ?? "").toLowerCase()] ?? null;
  return {
    generated: /^generated:\s*(.+)$/m.exec(front[1])?.[1]?.trim() ?? null,
    audience: cut(profile.audience, 4000),
    result: cut(profile.result, 1000),
    topic: cut(profile.topic, 500),
    frustration: cut(profile.frustration, 1000),
    proof: cut(profile.proof, 1000),
    language,
    nameOptions: bullets(h3.get("name options")).map((n) => cut(n, 100)).slice(0, 10),
    keywords,
    playlists,
    videos,
  };
}

// The profile text an Identity keeps (channel.profile): what the channel is
// about and what it promises, in the card's own words.
export function profileText(c) {
  return [c.topic && `Topic: ${c.topic}.`, c.result && `Promise: ${c.result}.`, c.frustration && `Their frustration: ${c.frustration}.`, c.proof && `Why listen: ${c.proof}.`]
    .filter(Boolean)
    .join(" ")
    .replace(/\.\./g, ".")
    .slice(0, 4000);
}

// What the card offers for the Identity's fields that exist: each with the
// value now and the card's value. Only fields the card has a value for.
// The channel name is the Identity's name: the card's first name option.
export function cardFields(c, channel = {}, name = "") {
  const out = [];
  const add = (field, label, now, value) => value && value !== (now ?? "") && out.push({ field, label, now: now ?? "", value });
  add("name", "Channel name", name, c.nameOptions[0]);
  add("audience", "Audience", channel.audience, c.audience);
  add("profile", "Topic and promise", channel.profile, profileText(c));
  add("contentLanguage", "Content language", channel.contentLanguage, c.language);
  return out;
}

export const cardPath = (identityDir) => path.join(identityDir, CARD_FILE);

export function readInput({ file, text }) {
  if (file) {
    if (!/\.md$/i.test(file)) throw new Error("Choose the Traffic Card file: its name ends in .md.");
    if (fs.statSync(file).size > MAX_BYTES) throw new Error("This is too large to be a Traffic Card (more than 512 KB).");
    return fs.readFileSync(file, "utf8");
  }
  return String(text ?? "");
}

export function previewCard({ file, text, channel = {}, name = "" }) {
  const card = parseTrafficCard(readInput({ file, text }));
  return { card, fields: cardFields(card, channel, name) };
}

// Keeps the card with the Identity (a new one replaces the old).
export function saveCard(identityDir, { file, text }) {
  if (!identityDir) throw new Error("No Identity to keep the Traffic Card with.");
  const md = readInput({ file, text });
  const card = parseTrafficCard(md);
  writeAtomic(cardPath(identityDir), md);
  return { card };
}

// The card this Identity keeps, or null.
export function loadCard(identityDir) {
  const p = identityDir ? cardPath(identityDir) : null;
  if (!p || !fs.existsSync(p)) return null;
  try {
    return parseTrafficCard(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}
