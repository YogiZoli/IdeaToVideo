// thumbnail/index.mjs: the Thumbnail step of a ONE Video, after Your video
// (DECISIONS 131).
//
//   <identity>/photos/            the profile photos, at most 3 (the core
//                                 copies them in; lib.rs import_photo)
//   <project>/thumbnail/
//     thumbnail.json              { schema, withFace, model, variants, chosen, spentUsd, history }
//     v<n>-picture.jpg            the AI picture of variant n (no text)
//     v<n>.jpg                    the finished variant (words on it)
//     chosen.jpg                  the one picked, for the card
//     older/<stamp>/              variants replaced by Regenerate; never deleted
//
// Make: one Gemini text call writes the words and picture ideas (ideas.mjs),
// one Gemini image call per variant draws the picture (gemini-image.mjs),
// and the app puts the words on it (compose.mjs). The price is shown before
// (estimate). "Edit words" only composes again: free. Picking one puts it in
// the Video Publishing Card (card.mjs).

import fs from "node:fs";
import path from "node:path";
import { loadProject, writeJson, appendLog } from "../project.mjs";
import { loadPackaging } from "../gates/render/youtube.mjs";
import { narrationFromMarkdown } from "../gates/voice/narration.mjs";
import { ffmpeg } from "../gates/review/index.mjs";
import { loadCard } from "../brand/card.mjs";
import { usdText } from "../providers/prices.mjs";
import { checkCard } from "../gates/render/publish.mjs";
import { modelOf, modelChoices, DEFAULT_MODEL } from "./models.mjs";
import { writeIdeas, testIdeas, estimateIdeas, wordsIssue, cleanWords, countWords, MAX_WORDS } from "./ideas.mjs";
import { makePicture } from "./gemini-image.mjs";
import { compose, WIDTH, HEIGHT } from "./compose.mjs";
import { thumbnailBlock, STATE, CHOSEN } from "./card.mjs";

export const SCHEMA = "thumbnail/1";
export const VARIANTS = 3;
export const MAX_PHOTOS = 3;
const PHOTO_EXTS = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
// Input tokens of one picture call: the text, and each reference photo at
// the model's largest image size (an estimate that errs high).
const PROMPT_TOKENS = 400;
const PHOTO_TOKENS = 1300;

const dirOf = (projectDir) => path.join(projectDir, "thumbnail");
const rel = (projectDir, f) => path.relative(projectDir, f).split(path.sep).join("/");
const abs = (projectDir, r) => path.join(projectDir, ...String(r).split("/"));
const r2 = (x) => Math.round(x * 10000) / 10000;

// ---- photos -----------------------------------------------------------------------------

export const photosDir = (identityDir) => path.join(identityDir, "photos");

export function photosOf(identityDir) {
  if (!identityDir) return [];
  const dir = photosDir(identityDir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => PHOTO_EXTS[path.extname(f).toLowerCase()] && fs.statSync(path.join(dir, f)).isFile())
    .sort()
    .slice(0, MAX_PHOTOS)
    .map((f) => ({ name: f, file: path.join(dir, f), mime: PHOTO_EXTS[path.extname(f).toLowerCase()] }));
}

// ---- state ------------------------------------------------------------------------------

export function loadState(projectDir) {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(projectDir, STATE), "utf8"));
    if (s.schema === SCHEMA) return s;
  } catch {
    // none yet
  }
  return { schema: SCHEMA, withFace: false, model: DEFAULT_MODEL, variants: [], chosen: null, spentUsd: 0, history: [] };
}

function saveState(projectDir, s) {
  fs.mkdirSync(dirOf(projectDir), { recursive: true });
  writeJson(path.join(projectDir, STATE), s);
  return s;
}

// What the UI shows: the state with full paths, the photos and the choices.
export function stateView({ projectDir, identityDir }) {
  const s = loadState(projectDir);
  const v = (x) => ({ ...x, file: x.file ? abs(projectDir, x.file) : null, pictureFile: x.pictureFile ? abs(projectDir, x.pictureFile) : null });
  return {
    ...s,
    variants: s.variants.map(v),
    chosenFile: s.chosen && fs.existsSync(path.join(projectDir, CHOSEN)) ? path.join(projectDir, CHOSEN) : null,
    photos: photosOf(identityDir).map((p) => ({ name: p.name, file: p.file })),
    models: modelChoices(),
    title: titleOf(projectDir),
    hasVideo: !!latestVideo(projectDir),
    maxWords: MAX_WORDS,
  };
}

// ---- inputs -----------------------------------------------------------------------------

export function titleOf(projectDir) {
  const pack = loadPackaging(projectDir);
  return pack?.title || loadProject(projectDir).title || "";
}

function hookOf(projectDir) {
  const f = path.join(projectDir, "script.md");
  if (!fs.existsSync(f)) return "";
  const first = narrationFromMarkdown(fs.readFileSync(f, "utf8"))[0]?.text ?? "";
  return first.split(/(?<=[.?!])\s+/).slice(0, 2).join(" ");
}

function audienceOf(identityDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(identityDir, "identity.json"), "utf8")).channel?.audience ?? "";
  } catch {
    return "";
  }
}

export function latestVideo(projectDir) {
  const out = path.join(projectDir, "out");
  if (!fs.existsSync(out)) return null;
  const mp4 = fs.readdirSync(out).filter((f) => /^video-.*\.mp4$/.test(f)).sort().pop();
  return mp4 ? path.join(out, mp4) : null;
}

// The text for the image model. The words are not in it: the picture has no
// text, the app sets the words in the Identity's font.
export function picturePrompt({ idea, colors, withFace, photoCount = 0 }) {
  const lines = [
    "A YouTube thumbnail background picture, 16:9, bold and simple, high contrast, sharp focus, bright light on the subject.",
    `What it shows: ${idea.picture}`,
    "Composition: keep the left 45% of the frame calm and plain (a text panel will cover it). Put the main subject in the right half, large and close.",
    `Colour mood: work with these brand colours: ${colors.background} and ${colors.primary}${colors.secondary && colors.secondary !== colors.primary ? ` and ${colors.secondary}` : ""}.`,
    "Absolutely no text, letters, numbers, captions, logos, watermarks or user interface in the picture.",
  ];
  if (withFace) {
    lines.push(
      `The person in the ${photoCount > 1 ? `${photoCount} reference photos` : "reference photo"} is the creator of the channel. Show exactly this person: the same face, hair, skin tone and age. Head and shoulders in the right half, looking into the camera, with a clear, natural expression that fits the idea. Do not change the face.`,
    );
  } else {
    lines.push("No person's face looking at the camera.");
  }
  return lines.join("\n");
}

// ---- price ------------------------------------------------------------------------------

export function estimate({ projectDir, identityDir, withFace = false, model = DEFAULT_MODEL, slots = null }) {
  const m = modelOf(model);
  const n = (slots ?? [1, 2, 3]).length;
  if (m.test) return { usd: 0, low: 0, high: 0, guess: false, images: n, test: true, text: "free (test pictures)" };
  const photos = withFace ? photosOf(identityDir).length : 0;
  const ideas = estimateIdeas({ title: titleOf(projectDir), hook: hookOf(projectDir), audience: audienceOf(identityDir), language: loadProject(projectDir).language, count: n });
  const images = n * (m.usdPerImage + ((PROMPT_TOKENS + photos * PHOTO_TOKENS) * m.inPerMillion) / 1e6);
  const e = { usd: Math.round((ideas.usd + images) * 100) / 100, low: Math.round((ideas.low + images) * 100) / 100, high: Math.round((ideas.high + images * 1.1) * 100) / 100, guess: false, images: n, model: m.id };
  return { ...e, text: usdText(e) };
}

// ---- make -------------------------------------------------------------------------------

// The test maker's picture: ffmpeg's test pattern, plainly not a real one.
async function testPicture(out, env) {
  await ffmpeg(["-f", "lavfi", "-i", "testsrc2=size=1376x768:rate=1", "-frames:v", "1", out], env);
}

function stamp(now = new Date()) {
  return now.toISOString().replace(/[:.]/g, "-");
}

// Variants of `slots` that exist go to older/<stamp>/ before new ones come.
function keepOld(projectDir, s, slots) {
  const old = s.variants.filter((v) => slots.includes(v.slot));
  if (!old.length) return;
  const to = path.join(dirOf(projectDir), "older", stamp());
  fs.mkdirSync(to, { recursive: true });
  for (const v of old) {
    for (const f of [v.file, v.pictureFile]) {
      if (f && fs.existsSync(abs(projectDir, f))) fs.renameSync(abs(projectDir, f), path.join(to, path.basename(f)));
    }
  }
  fs.writeFileSync(path.join(to, "variants.json"), JSON.stringify(old, null, 2) + "\n");
}

export async function make({ projectDir, identityDir, apiKey, withFace = false, model = DEFAULT_MODEL, slots = null, env = process.env, fetchImpl = fetch, sleep, onProgress = () => {} }) {
  const m = modelOf(model);
  const want = (slots ?? [1, 2, 3]).filter((n) => Number.isInteger(n) && n >= 1 && n <= VARIANTS);
  if (!want.length) throw new Error("No variant to make.");
  if (!latestVideo(projectDir)) throw new Error("Render the video first.");
  const photos = withFace ? photosOf(identityDir) : [];
  if (withFace && !photos.length) throw new Error("Add a profile photo first (Settings, Identity, Thumbnail photos), or switch to No face.");
  const title = titleOf(projectDir);
  if (!title) throw new Error("The video has no YouTube title yet. Choose one on the Script tab.");
  const language = loadProject(projectDir).language ?? "en";
  const { card } = loadCard(identityDir);
  const hook = hookOf(projectDir);
  const audience = audienceOf(identityDir);

  onProgress({ step: "ideas" });
  const ideas = m.test ? testIdeas({ title, count: want.length }) : await writeIdeas({ apiKey, fetchImpl, title, hook, audience, language, count: want.length, onProgress });

  let s = loadState(projectDir);
  keepOld(projectDir, s, want);
  s = { ...s, withFace, model: m.id, variants: s.variants.filter((v) => !want.includes(v.slot)) };
  saveState(projectDir, s);
  const refs = photos.map((p) => ({ mime: p.mime, data: fs.readFileSync(p.file).toString("base64") }));
  const perImage = m.test ? 0 : r2(m.usdPerImage + ((PROMPT_TOKENS + refs.length * PHOTO_TOKENS) * m.inPerMillion) / 1e6);
  const errors = [];
  let spent = m.test ? 0 : estimateIdeas({ title, hook, audience, language, count: want.length }).usd; // the ideas call
  for (const [i, slot] of want.entries()) {
    const idea = ideas[i];
    onProgress({ step: "picture", n: i + 1, of: want.length });
    const pictureFile = path.join(dirOf(projectDir), `v${slot}-picture.jpg`);
    try {
      if (m.test) await testPicture(pictureFile, env);
      else {
        const prompt = picturePrompt({ idea, colors: card.colors, withFace, photoCount: refs.length });
        fs.writeFileSync(pictureFile, await makePicture({ apiKey, fetchImpl, model: m.id, prompt, refs, sleep, onRetry: (r) => onProgress({ step: "retry", ...r }) }));
        spent = r2(spent + perImage);
      }
      onProgress({ step: "compose", n: i + 1, of: want.length });
      const file = path.join(dirOf(projectDir), `v${slot}.jpg`);
      const c = await compose({ identityDir, picture: pictureFile, words: idea.words, accent: idea.accent, out: file, language, env });
      s.variants.push({ slot, words: idea.words, accent: idea.accent, picture: idea.picture, pictureFile: rel(projectDir, pictureFile), file: rel(projectDir, file), bytes: c.bytes, textRatio: c.textRatio, accentRatio: c.accentRatio, withFace, model: m.id, test: !!m.test, at: new Date().toISOString() });
    } catch (e) {
      errors.push({ slot, message: String(e.message) });
    }
    s.variants.sort((a, b) => a.slot - b.slot);
    saveState(projectDir, s);
  }
  s = { ...s, spentUsd: r2((s.spentUsd ?? 0) + spent), history: [...(s.history ?? []), { at: new Date().toISOString(), model: m.id, withFace, slots: want, usd: spent, failed: errors.map((e) => e.slot) }] };
  saveState(projectDir, s);
  appendLog(projectDir, `thumbnail: ${want.length - errors.length} of ${want.length} made with ${m.id}${withFace ? ", with face" : ""}, about $${spent.toFixed(2)}${errors.length ? `; failed: ${errors.map((e) => `${e.slot} (${e.message})`).join("; ")}` : ""}`);
  if (errors.length === want.length) throw new Error(errors[0].message);
  return { ...stateView({ projectDir, identityDir }), errors, spent };
}

// "Edit words": the same picture, new words. Free.
export async function setWords({ projectDir, identityDir, slot, words, accent = null, env = process.env }) {
  const issue = wordsIssue(words);
  if (issue) throw new Error(`The words do not fit: ${issue}.`);
  const s = loadState(projectDir);
  const v = s.variants.find((x) => x.slot === slot);
  if (!v) throw new Error("That variant does not exist.");
  const w = cleanWords(words);
  const n = countWords(w);
  const a = Number.isInteger(accent) && accent >= 0 && accent < n ? accent : Math.min(v.accent ?? n - 1, n - 1);
  const c = await compose({ identityDir, picture: abs(projectDir, v.pictureFile), words: w, accent: a, out: abs(projectDir, v.file), language: loadProject(projectDir).language ?? "en", env });
  Object.assign(v, { words: w, accent: a, bytes: c.bytes, textRatio: c.textRatio, accentRatio: c.accentRatio, at: new Date().toISOString() });
  saveState(projectDir, s);
  appendLog(projectDir, `thumbnail: words of variant ${slot} now "${w}"`);
  return stateView({ projectDir, identityDir });
}

// ---- pick -------------------------------------------------------------------------------

// The card of the latest render, with the chosen thumbnail in it (same
// cardId, so Send to Publishing updates the same card).
export function updateCard(projectDir) {
  const video = latestVideo(projectDir);
  if (!video) return null;
  const cardFile = video.replace(/\.mp4$/i, ".card.json");
  if (!fs.existsSync(cardFile)) return null;
  const card = JSON.parse(fs.readFileSync(cardFile, "utf8"));
  const block = thumbnailBlock(projectDir, video);
  if (block) card.thumbnail = block;
  else delete card.thumbnail;
  fs.writeFileSync(cardFile, JSON.stringify(checkCard(card), null, 2) + "\n");
  return cardFile;
}

export function pick({ projectDir, identityDir, slot }) {
  const s = loadState(projectDir);
  const v = s.variants.find((x) => x.slot === slot);
  if (!v || !fs.existsSync(abs(projectDir, v.file))) throw new Error("That variant does not exist.");
  fs.copyFileSync(abs(projectDir, v.file), path.join(projectDir, CHOSEN));
  s.chosen = { slot, words: v.words, withFace: !!v.withFace, test: !!v.test, width: WIDTH, height: HEIGHT, at: new Date().toISOString() };
  saveState(projectDir, s);
  const cardFile = updateCard(projectDir);
  appendLog(projectDir, `thumbnail: variant ${slot} chosen ("${v.words}")${cardFile ? ", in the publishing card" : ""}`);
  return { ...stateView({ projectDir, identityDir }), cardFile };
}
