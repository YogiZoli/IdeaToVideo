// icons/index.mjs: the icon sets in the library (scripts/fetch-icons.mjs,
// DECISIONS 105) for the whiteboard scene. The planner names what to draw in
// a few plain words ("pen tool"); the build finds the icon that fits best,
// never the same one twice in a video, and avoids the Identity's recent ones
// so videos differ from each other too (Zoltan, 2026-10-06: "the exact same
// drawing in every video").

import fs from "node:fs";
import path from "node:path";
import { libraryDir } from "../gates/build/assemble.mjs";
import { transformPath } from "./svg.mjs";

// Lucide first: its strokes are the cleanest to draw; Tabler has the most;
// Iconoir fills the gaps.
export const FAMILIES = ["lucide", "tabler", "iconoir"];
const cache = new Map();

export function loadFamily(id, { env = process.env } = {}) {
  const file = path.join(libraryDir(env), "icons", `${id}.json`);
  if (!cache.has(file)) cache.set(file, fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null);
  return cache.get(file);
}

const STOP = new Set(["a", "an", "the", "of", "and", "or", "with", "for", "to", "in", "on", "at", "by", "icon", "symbol", "drawing", "sketch", "simple", "picture", "image", "is", "are", "your", "my", "this", "that", "it", "be", "how", "what", "why", "you", "we", "they", "from", "into", "as", "not", "no", "do", "does", "can", "will", "more", "most", "very", "just", "about"]);
const stem = (w) => (w.length > 4 && w.endsWith("ies") ? `${w.slice(0, -3)}y` : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
export const queryWords = (q) => [...new Set(String(q ?? "").toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s-]/gu, " ").split(/[\s-]+/).filter((w) => w.length > 1 && !STOP.has(w)).map(stem))];

// Logos are trademarks, never drawn: Tabler's brand-* icons and the brand
// marks the other sets carry.
const BRANDS = new Set(["github", "gitlab", "twitter", "facebook", "instagram", "linkedin", "youtube", "twitch", "slack", "figma", "framer", "dribbble", "codepen", "codesandbox", "chrome", "chromium", "pocket", "trello", "apple", "google", "microsoft", "android", "spotify", "tiktok", "whatsapp", "telegram", "discord", "reddit", "pinterest", "snapchat", "npm", "amazon", "paypal", "stripe", "openai", "threads", "bluesky", "mastodon", "vimeo", "dropbox", "notion", "behance", "messenger", "skype", "teams", "wechat", "weibo", "airbnb", "uber", "netflix", "ebay", "etsy", "shopify", "wordpress", "kotlin", "python", "react", "vue", "angular", "svelte", "docker", "firefox", "safari", "opera", "steam", "playstation", "xbox", "nintendo"]);
export const isBrand = (family, name) => name.startsWith("brand-") || name.endsWith("-logo") || BRANDS.has(name);
// A variant that says the opposite ("lightbulb-off") only when asked for.
const NEGATIONS = new Set(["off", "x", "slash", "minus", "cancel", "no", "disabled", "dashed", "exclamation", "question", "error", "broken", "remove", "lock"]);

// How well an icon answers the words: its own name counts most, its tags
// less; simple icons (few strokes) win ties, they draw better.
function score(name, icon, words) {
  const parts = name.split("-").map(stem);
  const tags = new Set(icon.w.map(stem));
  let s = 0;
  let hits = 0;
  for (const w of words) {
    // a longer word is more specific ("calendar" over "open")
    if (parts.includes(w)) (s += 6 + w.length), hits++;
    else if (tags.has(w)) (s += 2 + w.length / 2), hits++;
    else if (w.length >= 4 && parts.some((p) => p.startsWith(w) || w.startsWith(p) && p.length >= 4)) (s += 3), hits++;
  }
  if (!hits) return 0;
  if (parts.join("-") === words.join("-")) s += 20;
  s -= Math.max(0, parts.length - words.length) * 1.5;
  s -= Math.max(0, icon.d.length - 6) * 0.5;
  for (const p of parts) if (NEGATIONS.has(p) && !words.includes(p)) s -= 10;
  return s;
}

// The best icon for the words, or null. `avoid`: "family/name" already used
// in this video (never chosen); `recent`: used in the Identity's last videos
// (chosen only when nothing else fits).
export function findIcon(query, { families = FAMILIES, avoid = new Set(), recent = new Set(), minScore = 0, env = process.env } = {}) {
  const words = queryWords(query);
  if (!words.length) return null;
  let best = null;
  families.forEach((id, rank) => {
    const fam = loadFamily(id, { env });
    if (!fam) return;
    for (const [name, icon] of Object.entries(fam.icons)) {
      const key = `${id}/${name}`;
      if (avoid.has(key) || isBrand(id, name)) continue;
      let s = score(name, icon, words);
      if (s <= 0 || s < minScore) continue;
      s -= rank * 0.5;
      if (recent.has(key)) s -= 8;
      if (!best || s > best.score) best = { family: id, name, score: s, d: icon.d };
    }
  });
  return best;
}

// Where an icon sits in whiteboard-ink's 0 0 1000 560 drawing: the place of
// its own preset sketches, a 360 px square in the middle above the caption.
export const SKETCH_BOX = { scale: 15, dx: 320, dy: 80 };

export function sketchPaths(icon, box = SKETCH_BOX) {
  const ds = icon.d.map((d) => transformPath(d, box));
  // one highlight stroke, as in the presets: the last one, usually the detail
  return ds.map((d, i) => `<path d="${d}"${i === ds.length - 1 && ds.length > 1 ? ' data-ink="accent"' : ""}></path>`).join("");
}

const SLOT = '<g class="wbi-sketch" data-slot="strokes" data-sketch="custom" hidden></g>';
// The build copy of whiteboard-ink with the icon in its strokes slot; the
// registry file is untouched.
export function withSketch(html, icon) {
  if (!html.includes(SLOT)) throw new Error("whiteboard-ink changed upstream: its strokes slot was not found. Update runner/icons/index.mjs.");
  return html.replace(SLOT, `<g class="wbi-sketch" data-slot="strokes" data-sketch="custom" hidden>${sketchPaths(icon)}</g>`);
}

// The icons of a whole video, scene by scene: the planner's words first,
// then the caption, then what the voice says. Returns one pick per scene
// (null for other scenes or when nothing fits).
export function pickIcons(scenes, { sentences = [], recent = [], families = FAMILIES, env = process.env } = {}) {
  const avoid = new Set();
  const rec = new Set(recent);
  const said = (sc) => {
    const ids = sentences.map((s) => s.id);
    const a = ids.indexOf(sc.from);
    const b = ids.indexOf(sc.to ?? sc.from);
    return a < 0 ? "" : sentences.slice(a, b + 1).map((s) => s.text).join(" ");
  };
  return scenes.map((sc) => {
    if (sc.component !== "whiteboard-ink") return null;
    // the planner's words are trusted; a caption or a sentence only when a
    // specific word (six letters or more) names the icon itself
    for (const [q, minScore] of [[sc.icon, 0], [sc.vars?.caption, 12], [said(sc), 12]]) {
      if (!q) continue;
      const hit = findIcon(q, { families, avoid, recent: rec, minScore, env });
      if (hit) {
        avoid.add(`${hit.family}/${hit.name}`);
        return { family: hit.family, name: hit.name, d: hit.d, query: String(q).slice(0, 80) };
      }
    }
    return null;
  });
}
