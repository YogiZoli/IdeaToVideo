// channels/recipe.mjs: a channel's one locked recipe (docs/BUILD_PLAN.md,
// DECISIONS 132). A channel is an Identity (brand, audience, keys, folder) plus
// <identity>/recipe.json: engine, style preset, voice, avatar on or off, music
// on or off, B-roll on or off, target length. Every video of the channel is made with it; the
// start screen shows it and asks nothing else. Each video keeps a copy in its
// project.json, so changing the recipe later never changes a video under way.
//
// `start` is what the start screen begins with (docs/BUILD_PLAN.md phase 3): how a
// pasted text is marked, and research on or off; the engine is the direction it
// begins with. `directions` keeps the other direction's choices, so a channel can
// make either kind of video without its recipe being asked again.

import fs from "node:fs";
import path from "node:path";
import { DEFAULT_PRESET, loadPreset } from "../presets/index.mjs";
import { DEFAULT_VOICE, VOICES } from "../providers/tts/kokoro.mjs";
import { DEFAULT_MOOD, MOODS } from "../providers/music/synth.mjs";
import { cleanFormat, cleanShortSeconds, withFormat } from "../shorts/index.mjs";

export const RECIPE_FILE = "recipe.json";
export const RECIPE_SCHEMA = "channel-recipe/1";
export const VOICE_KINDS = { gemini: "Gemini (free with your Gemini key, no card; speaks Khmer)", googlecloud: "Google Cloud (free up to a monthly amount, needs a card)", kokoro: "Free voice on this computer (Kokoro, English only)", elevenlabs: "My ElevenLabs voice", azure: "Azure (Khmer and the languages Google lacks)" };
export const MUSIC_SOURCES = { synth: "Made by code, free", own: "My own files" };
export const ENGINES_READY = ["script", "recorded"];
export const DEFAULT_RECORDED_PRESET = "talking-head";
export const MUSIC_DIR = "music";
const MUSIC_EXT = /\.(mp3|wav|m4a|aac|ogg|flac)$/i;

export const musicDir = (identityDir) => path.join(identityDir, MUSIC_DIR);
export const ownMusic = (identityDir) => {
  try {
    return fs.readdirSync(musicDir(identityDir)).filter((f) => MUSIC_EXT.test(f)).sort();
  } catch {
    return [];
  }
};

/** The recipe of a channel that has none yet, from what its Identity already says. */
export const START_TEXT = ["notes", "finished"];
export const cleanStart = (s) => ({ text: START_TEXT.includes(s?.text) ? s.text : "notes", research: s?.research === true });
const recordedSide = (r) => ({ preset: r?.preset ?? DEFAULT_RECORDED_PRESET, recorded: { cutout: r?.recorded?.cutout === true, smoothCursor: r?.recorded?.smoothCursor !== false } });

export function defaultRecipe(identity = {}) {
  const voice = identity.narrator?.provider === "elevenlabs" && identity.narrator?.voice ? { provider: "elevenlabs", voice: identity.narrator.voice } : { provider: "kokoro", voice: DEFAULT_VOICE };
  return {
    schema: RECIPE_SCHEMA,
    engine: "script",
    preset: DEFAULT_PRESET,
    voice,
    avatar: { on: Boolean(identity.avatar?.enabled && identity.avatar?.lookId), lookId: identity.avatar?.lookId ?? null },
    music: { on: true, source: "synth", mood: DEFAULT_MOOD },
    broll: { on: true },
    targetLengthMin: Number(identity.defaults?.targetLengthMin) || 8,
    format: "long",
    start: cleanStart(),
  };
}

/** A recipe checked and cleaned. Throws a sentence the user can act on. */
export function normalizeRecipe(r, { language = "en" } = {}) {
  if (!r || typeof r !== "object") throw new Error("The recipe is empty.");
  if (!ENGINES_READY.includes(r.engine)) throw new Error(`The ${r.engine} engine is not built yet. Choose Script.`);
  const preset = loadPreset(r.preset);
  if (preset.engine !== r.engine) throw new Error(`${preset.label} belongs to the ${preset.engine} engine.`);
  // A recording has its own voice and its own length: only the look and the music are asked.
  if (r.engine === "recorded") {
    const source = MUSIC_SOURCES[r.music?.source] ? r.music.source : "synth";
    return {
      schema: RECIPE_SCHEMA,
      engine: "recorded",
      preset: preset.id,
      voice: { provider: "recording", voice: "own" },
      avatar: { on: false, lookId: null, engine: "avatar_iii", layout: "overlay" },
      music: { on: Boolean(r.music?.on), source, mood: MOODS[r.music?.mood] ? r.music.mood : DEFAULT_MOOD },
      broll: { on: r.broll?.on === true },
      recorded: { cutout: r.recorded?.cutout === true, smoothCursor: r.recorded?.smoothCursor !== false },
      targetLengthMin: Number(r.targetLengthMin) > 0 ? Number(r.targetLengthMin) : 8,
      start: cleanStart(r.start),
      directions: { script: scriptSideOf(r), recorded: recordedSide({ preset: preset.id, recorded: r.recorded }) },
    };
  }
  const provider = r.voice?.provider;
  if (!VOICE_KINDS[provider]) throw new Error("Choose a voice: Gemini, Google Cloud, the free voice, ElevenLabs or Azure.");
  if (provider === "kokoro" && !String(language).toLowerCase().startsWith("en")) throw new Error("The free voice reads English only. For this channel's language choose Gemini (free), Google Cloud, Azure or your ElevenLabs voice.");
  const voice = provider === "kokoro" ? (VOICES[r.voice.voice] ? r.voice.voice : DEFAULT_VOICE) : String(r.voice.voice ?? "").trim();
  if (!voice) throw new Error(`Choose which ${provider === "elevenlabs" ? "ElevenLabs" : provider === "googlecloud" ? "Google Cloud" : provider === "gemini" ? "Gemini" : "Azure"} voice this channel uses.`);
  const on = Boolean(r.avatar?.on);
  const lookId = r.avatar?.lookId ? String(r.avatar.lookId) : null;
  if (on && !lookId) throw new Error("Choose the avatar look, or turn the avatar off.");
  // a Short's length is in seconds (15 to 90), a long video's in minutes (DECISIONS 188)
  const format = cleanFormat(r.format);
  const shortSeconds = cleanShortSeconds(r.shortSeconds);
  const target = format === "short" ? withFormat({}, { format, shortSeconds }).targetLengthMin : Number(r.targetLengthMin);
  if (format !== "short" && (!Number.isFinite(target) || target < 1 || target > 30)) throw new Error("The target length is 1 to 30 minutes.");
  const source = MUSIC_SOURCES[r.music?.source] ? r.music.source : "synth";
  return {
    schema: RECIPE_SCHEMA,
    engine: r.engine,
    preset: preset.id,
    voice: { provider, voice, ...(r.voice.name ? { name: String(r.voice.name).slice(0, 120) } : {}) },
    // the rule: avatar_iii only, transparent, composited 1:1
    avatar: { on, lookId, ...(r.avatar?.name ? { name: String(r.avatar.name).slice(0, 120) } : {}), engine: "avatar_iii", layout: "overlay" },
    music: { on: Boolean(r.music?.on), source, mood: MOODS[r.music?.mood] ? r.music.mood : DEFAULT_MOOD },
    // a recipe locked before the B-roll engine keeps what it had: no B-roll
    broll: { on: r.broll?.on === true },
    targetLengthMin: target,
    format,
    ...(format === "short" ? { shortSeconds } : {}),
    freeOnly: r.freeOnly === true,
    start: cleanStart(r.start),
    directions: { script: { preset: preset.id, voice: { provider, voice, ...(r.voice.name ? { name: String(r.voice.name).slice(0, 120) } : {}) }, avatar: { on, lookId, ...(r.avatar?.name ? { name: String(r.avatar.name).slice(0, 120) } : {}) }, targetLengthMin: target }, recorded: recordedSide(r.directions?.recorded) },
  };
}

// The script side of a recipe locked as Recorded: what it says itself when the
// editor just switched over, else what it kept. Null: never set.
function scriptSideOf(r) {
  if (r.voice?.provider && r.voice.provider !== "recording" && r.voice.voice) return { preset: r.directions?.script?.preset ?? DEFAULT_PRESET, voice: r.voice, avatar: { on: Boolean(r.avatar?.on), lookId: r.avatar?.lookId ?? null, ...(r.avatar?.name ? { name: r.avatar.name } : {}) }, targetLengthMin: Number(r.targetLengthMin) > 0 ? Number(r.targetLengthMin) : 8 };
  return r.directions?.script ?? null;
}

/**
 * The channel's recipe for one direction of this video. The start screen's first
 * choice can differ from the recipe's own engine; nothing is saved by it.
 */
export function recipeFor(recipe, direction, { language } = {}) {
  const r = recipe ?? defaultRecipe({});
  if (direction !== "script" && direction !== "recorded") throw new Error("Choose Script to video or Edit a recording.");
  if (r.engine === direction) return normalizeRecipe(r, { language });
  if (direction === "recorded") {
    const side = recordedSide(r.directions?.recorded);
    const scriptSide = scriptSideOf(r);
    return normalizeRecipe({ ...r, engine: "recorded", preset: side.preset, recorded: side.recorded, voice: { provider: "recording", voice: "own" }, directions: { ...r.directions, script: scriptSide } }, { language });
  }
  const side = r.directions?.script;
  if (!side) throw new Error("This channel has no voice for a script video yet. Press Change on its recipe, choose Script to video, and lock it once.");
  return normalizeRecipe({ ...r, engine: "script", ...side, directions: { ...r.directions, recorded: recordedSide({ preset: r.preset, recorded: r.recorded }) } }, { language });
}

const fileOf = (identityDir) => path.join(identityDir, RECIPE_FILE);

export function loadRecipe(identityDir) {
  try {
    return JSON.parse(fs.readFileSync(fileOf(identityDir), "utf8"));
  } catch {
    return null;
  }
}

export function saveRecipe(identityDir, recipe, { language } = {}) {
  if (!identityDir) throw new Error("No channel to save the recipe for.");
  const clean = { ...normalizeRecipe(recipe, { language }), updatedAt: new Date().toISOString() };
  fs.mkdirSync(identityDir, { recursive: true });
  fs.writeFileSync(fileOf(identityDir), JSON.stringify(clean, null, 2) + "\n");
  fs.mkdirSync(musicDir(identityDir), { recursive: true });
  return clean;
}

/**
 * A pasted script as the markdown the voice gate reads: its own "## " headings
 * if it has them, else one part per paragraph group of about 120 words (one
 * reading per part keeps a long script safe). Pure, the tests call it.
 */
export function scriptMarkdown(text, title = "") {
  const clean = String(text ?? "").replace(/\r\n/g, "\n").trim();
  if (!clean) throw new Error("The script is empty.");
  const head = /^#\s+(.+)$/m.exec(clean)?.[1]?.trim();
  const name = head || String(title).trim() || clean.split(/\s+/).slice(0, 8).join(" ").replace(/[.,:;!?]+$/, "");
  const body = clean.replace(/^#\s+.+$/m, "").trim();
  if (/^##\s+/m.test(body)) return { title: name, markdown: `# ${name}\n\n${body}\n` };
  const parts = [];
  let cur = [];
  let words = 0;
  for (const para of body.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean)) {
    cur.push(para);
    words += para.split(" ").length;
    if (words >= 120) {
      parts.push(cur);
      cur = [];
      words = 0;
    }
  }
  if (cur.length) parts.push(cur);
  return { title: name, markdown: `# ${name}\n\n${parts.map((p, i) => `## Part ${i + 1}\n\n${p.join("\n\n")}`).join("\n\n")}\n` };
}
