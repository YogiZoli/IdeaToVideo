// recorded/bubble.mjs: the face bubble of a screen video in RecCut (DECISIONS 184).
//
// "What did you record?" picks a kind. Every kind is one of the existing Recorded
// presets plus, for a screen, where its face bubble comes from:
//
//   camera   a second file, the camera: the app draws the bubble (as before)
//   box      one combined file that already has the bubble in it: the user marks the
//            bubble once on a still, the app lifts that box out of the original and pins
//            it on top at the same place, so a zoom never cuts or moves the face
//   avatar   no face filmed: the Identity's HeyGen avatar (engine avatar_iii only), made
//            from this video's own cut voice, or a clip already made in HeyGen, or a lip
//            sync clip made in any outside tool from the voice the Editor exports
//
// input.json carries it as `bubble`, from schema recorded-input/2. An older input
// (recorded-input/1, every recording made before RecCut) is read as it was:
// `migrateInput` gives it the kind its preset and files mean, and changes nothing else.

import fs from "node:fs";
import path from "node:path";
import { ffmpegRun } from "../audio.mjs";
import { addNote, appendLog, loadProject, saveProject, setGate, writeJson } from "../project.mjs";
import { logAsset } from "../assets/license.mjs";
import { ensureRoom, roomForFiles } from "../disk.mjs";
import * as heygen from "../providers/avatar/heygen.mjs";

export const INPUT_SCHEMA = "recorded-input/2";
const r4 = (x) => Math.round(x * 10000) / 10000;
const work = (projectDir, ...rest) => path.join(projectDir, "recorded", ...rest);

/** The choices of "What did you record?", in Zoltan's order. */
export const KINDS = [
  { id: "screen", preset: "screen-recording", label: "Screen only", hint: "One screen file. The view zooms to your clicks and the cursor moves smoothly." },
  { id: "screen-bubble", preset: "screen-recording", label: "Screen with my face in a bubble", hint: "Two files, screen and camera, or one file that already has the bubble in it." },
  { id: "talking-head", preset: "talking-head", label: "Talking head", hint: "One camera file: you talking to the camera." },
  { id: "screen-share", preset: "screen-share", label: "Screen and camera, switching", hint: "Two files. The picture switches between you and the screen." },
  { id: "profile-silhouette", preset: "profile-silhouette", label: "Profile silhouette", hint: "Filmed from the side. The background goes, a silhouette stays." },
  { id: "screen-avatar", preset: "screen-recording", label: "Screen with an AI avatar bubble", hint: "One screen file. The face in the bubble is your Identity's avatar. Off unless you choose it." },
];
export const kindOf = (id) => KINDS.find((k) => k.id === id) ?? null;

/** Where a recorder usually puts the face: the bottom left corner, about a square. */
export const DEFAULT_BOX = { x: 0.02, y: 0.62, w: 0.18, h: 0.32 };

/** A box the user dragged, held inside the frame and not too small. Null: not usable. Pure. */
export function cleanBox(b) {
  if (!b || ![b.x, b.y, b.w, b.h].every((v) => Number.isFinite(Number(v)))) return null;
  let { x, y, w, h } = { x: Number(b.x), y: Number(b.y), w: Number(b.w), h: Number(b.h) };
  if (w < 0) [x, w] = [x + w, -w];
  if (h < 0) [y, h] = [y + h, -h];
  x = Math.max(0, Math.min(1, x));
  y = Math.max(0, Math.min(1, y));
  w = Math.min(w, 1 - x);
  h = Math.min(h, 1 - y);
  if (w < 0.03 || h < 0.03) return null;
  return { x: r4(x), y: r4(y), w: r4(w), h: r4(h) };
}

/**
 * The bubble a new video starts with, from the kind and what the user gave. Pure.
 * kind screen-bubble + camera file: drawn bubble. + one file: the marked box, or
 * skipped. kind screen-avatar: the avatar, still to be made (nothing is spent here).
 */
export function bubbleFor(kind, files = {}, mark = null) {
  if (kind === "screen-bubble") {
    if (files.camera) return { mode: "camera" };
    const box = mark?.skip ? null : cleanBox(mark?.box);
    return box ? { mode: "box", box } : { mode: "box", box: null, skipped: true };
  }
  if (kind === "screen-avatar") {
    const source = ["heygen", "clip", "outside"].includes(mark?.source) ? mark.source : "heygen";
    return { mode: "avatar", source, state: "todo" };
  }
  return null;
}

/** The files a kind needs, as a sentence, or null. Pure; the screens say the same. */
export function kindProblem(kind, files = {}) {
  const has = (s) => !!files[s];
  switch (kind) {
    case "screen":
    case "screen-avatar":
      return has("screen") ? null : "Choose the screen file.";
    case "screen-bubble":
      return has("screen") ? null : "Choose the screen file, or the one file with the bubble in it.";
    case "talking-head":
      return has("camera") ? null : "Choose the camera file.";
    case "screen-share":
      return has("camera") && has("screen") ? null : "Choose the camera file and the screen file.";
    case "profile-silhouette":
      return has("camera") ? null : "Choose the side-angle take.";
    default:
      return "Choose what you recorded.";
  }
}

/** The kind an older recording means, from its preset and files. Pure. */
export function kindFromOld(input) {
  const files = input?.files ?? {};
  switch (input?.preset) {
    case "screen-recording":
      return files.camera ? "screen-bubble" : "screen";
    case "screen-share":
    case "talking-head":
    case "profile-silhouette":
      return input.preset;
    default:
      return null;
  }
}

/**
 * Any input.json, old or new, read as schema 2. An old one keeps every field and
 * gains `kind` and `bubble` as they were meant; `migratedFrom` marks it. Pure.
 */
export function migrateInput(input) {
  if (!input) return input;
  if (input.schema === INPUT_SCHEMA) return input;
  const kind = kindFromOld(input);
  return { ...input, schema: INPUT_SCHEMA, kind, bubble: kind === "screen-bubble" ? { mode: "camera" } : null, migratedFrom: input.schema ?? "recorded-input/1" };
}

/** Does this video zoom? A combined file whose bubble was not marked does not. Pure. */
export function zoomAllowed(input) {
  return !(input?.bubble?.mode === "box" && !input.bubble.box);
}
export const NO_ZOOM_NOTE = "Zoom is off for this video: the face bubble in your recording was not marked, and zooming the screen would cut or move your face. Mark the bubble to have the zoom.";

/**
 * The lifted bubble in the frame: the same pixels as in the fitted screen, at the
 * same place, never moved by the zoom. `fit` is where the screen sits in the
 * frame (compose.fitBox). Pure; compose.mjs and the tests read it.
 */
export function liftBox(box, fit) {
  const left = fit.x + box.x * fit.w;
  const top = fit.y + box.y * fit.h;
  const width = box.w * fit.w;
  const height = box.h * fit.h;
  const round = (v) => Math.round(v * 100) / 100;
  // the copy of the whole screen, clipped to the box: the face is never scaled
  const inset = { top: round(box.y * fit.h), right: round((1 - box.x - box.w) * fit.w), bottom: round((1 - box.y - box.h) * fit.h), left: round(box.x * fit.w) };
  return { left: round(left), top: round(top), width: round(width), height: round(height), clip: `inset(${inset.top}px ${inset.right}px ${inset.bottom}px ${inset.left}px round ${round(Math.min(width, height) / 2)}px)` };
}

/** The HeyGen avatar bubble's price before anything is spent: avatar_iii only. Pure. */
export function avatarCost(seconds) {
  const { low, high } = heygen.estimateUsd(seconds, "avatar_iii");
  // the screens show the high end: the price is never more than it said
  return { engine: "avatar_iii", seconds: Math.round(seconds), low, high, usd: high };
}

const readInput = (projectDir) => JSON.parse(fs.readFileSync(work(projectDir, "input.json"), "utf8"));
const saveInput = (projectDir, input) => writeJson(work(projectDir, "input.json"), input);

/** The box marked later (or again), on a video already started. The pictures are prepared again. */
export function setBubbleBox({ projectDir, box, skip = false }) {
  const input = migrateInput(readInput(projectDir));
  if (input.bubble?.mode !== "box") throw new Error("This video has no bubble to mark.");
  const clean = skip ? null : cleanBox(box);
  if (!skip && !clean) throw new Error("The marked box is too small. Drag a box around the whole face bubble.");
  saveInput(projectDir, { ...input, bubble: clean ? { mode: "box", box: clean } : { mode: "box", box: null, skipped: true } });
  // the pictures are prepared again, and an approved preview or render no longer counts
  let project = loadProject(projectDir);
  if (project.gates.scenes?.state === "approved" || project.gates.scenes?.state === "pending") project = setGate(project, "scenes", { state: "todo" });
  if (project.gates.review && project.gates.review.state !== "todo") project = setGate(project, "review", { state: "todo" });
  saveProject(projectDir, project);
  appendLog(projectDir, clean ? `recorded: bubble marked ${JSON.stringify(clean)}` : "recorded: bubble not marked, no zoom");
  return { bubble: readInput(projectDir).bubble };
}

/** One still of a file, for marking the bubble: a PNG at `out`. */
export async function stillOf({ file, out, at = 0.5, env = process.env }) {
  if (!fs.existsSync(file)) throw new Error(`This file is not there any more: ${file}. Choose it again.`);
  const dir = path.dirname(out);
  fs.mkdirSync(dir, { recursive: true });
  // only the newest few stills are kept: each marking makes one
  try {
    const old = fs.readdirSync(dir).filter((f) => f.startsWith("still-")).sort().slice(0, -10);
    for (const f of old) fs.rmSync(path.join(dir, f), { force: true });
  } catch {
    // a still that cannot be removed only takes a little room
  }
  const part = `${out}.part.png`;
  // a very short file has no frame at 0.5 s: then the first frame
  for (const t of [at, 0]) {
    fs.rmSync(part, { force: true });
    try {
      await ffmpegRun(["-ss", String(t), "-i", file, "-frames:v", "1", "-vf", "scale='min(1280,iw)':-2", part], env);
    } catch (e) {
      if (t === 0) throw new Error(`The first frame of this file could not be read, so the bubble cannot be marked on it: ${path.basename(file)}. Choose the file again, or skip marking.`);
      continue;
    }
    if (fs.existsSync(part) && fs.statSync(part).size > 0) break;
  }
  if (!fs.existsSync(part) || !fs.statSync(part).size) throw new Error(`This file has no picture to mark the bubble on: ${path.basename(file)}.`);
  fs.renameSync(part, out);
  return { file: out };
}

/** The cut voice of the video as one file, for a lip sync clip in any outside tool. */
export function exportVoice({ projectDir, out }) {
  const vo = path.join(projectDir, "audio", "vo.mp3");
  if (!fs.existsSync(vo)) throw new Error("The voice is ready after the cuts. Let the video run to the cuts first.");
  const part = `${out}.part`;
  fs.copyFileSync(vo, part);
  fs.renameSync(part, out);
  appendLog(projectDir, `recorded: the cut voice exported for an outside lip sync, ${out}`);
  return { file: out };
}

/** How long the cut video is: the clip in the bubble has to match it. */
const keptOf = (projectDir) => {
  try {
    return JSON.parse(fs.readFileSync(work(projectDir, "pictures.json"), "utf8")).kept ?? null;
  } catch {
    return null;
  }
};

const bubbleFile = (projectDir, ext) => work(projectDir, `bubble.${ext}`);

/**
 * A clip into the bubble: one made in an outside tool from the exported voice, or one
 * already made in HeyGen. Copied in (never moved), logged in assets_license.json.
 */
export async function importBubbleClip({ projectDir, file, source = "outside", tool = "", probe, env = process.env }) {
  if (!fs.existsSync(file)) throw new Error(`This file is not there any more: ${file}. Choose it again.`);
  const input = migrateInput(readInput(projectDir));
  if (input.bubble?.mode !== "avatar") throw new Error("This video has no avatar bubble.");
  const ext = path.extname(file).toLowerCase() === ".webm" ? "webm" : "mp4";
  ensureRoom(projectDir, roomForFiles([file], 1.2), "the bubble clip");
  const out = bubbleFile(projectDir, ext);
  const part = `${out}.part`;
  fs.copyFileSync(file, part);
  for (const e of ["mp4", "webm"]) fs.rmSync(bubbleFile(projectDir, e), { force: true });
  fs.renameSync(part, out);
  const kept = keptOf(projectDir);
  const seconds = probe ? (await probe(out, env))?.seconds ?? null : null;
  const today = new Date().toISOString().slice(0, 10);
  logAsset(projectDir, source === "heygen"
    ? { file: `recorded/bubble.${ext}`, title: "Avatar bubble", source: "heygen", license: "heygen-terms", author: "HeyGen (own account)", model: "HeyGen avatar, a clip already made in HeyGen", prompt: "the video's own voice, lip synced", costUsd: 0, date: today }
    : { file: `recorded/bubble.${ext}`, title: "Avatar bubble", source: "outside", license: "own-generation-outside", author: "own generation", model: String(tool).trim() || "outside tool", prompt: "lip sync of this video's own cut voice, exported by RecCut", costUsd: 0, date: today });
  saveInput(projectDir, { ...input, bubble: { ...input.bubble, source, state: "made", file: `recorded/bubble.${ext}`, seconds } });
  if (kept && seconds && Math.abs(seconds - kept) > 0.5) addNote(projectDir, "bubble", `The bubble clip is ${seconds.toFixed(1)} s and the video ${kept.toFixed(1)} s, so they drift apart. Make the clip from the voice the Editor exported, after the cuts.`);
  invalidateReview(projectDir);
  appendLog(projectDir, `recorded: bubble clip from ${source}, ${seconds ?? "?"} s`);
  return { bubble: readInput(projectDir).bubble };
}

function invalidateReview(projectDir) {
  const project = loadProject(projectDir);
  if (project.gates.review && project.gates.review.state !== "todo") saveProject(projectDir, setGate(project, "review", { state: "todo" }));
}

/**
 * The paid way: the Identity's HeyGen avatar speaks this video's cut voice. Runs only
 * with `approved: true`, which the Editor sends after the user pressed the button that
 * shows the price; a paid POST is never repeated. Any failure: the video goes on as
 * Screen only, with a note on the Preview.
 */
export async function makeAvatarBubble({ projectDir, apiKey, lookId, approved = false, api = heygen, onProgress = () => {} }) {
  if (approved !== true) throw new Error("The avatar bubble costs money at HeyGen, so it is only made after you approve its price.");
  const input = migrateInput(readInput(projectDir));
  if (input.bubble?.mode !== "avatar") throw new Error("This video has no avatar bubble.");
  const vo = path.join(projectDir, "audio", "vo.mp3");
  if (!fs.existsSync(vo)) throw new Error("The voice is ready after the cuts. Let the video run to the cuts first.");
  const kept = keptOf(projectDir) ?? 0;
  const cost = avatarCost(kept);
  try {
    if (!apiKey) throw new Error("There is no HeyGen key. Add it on Settings, Connections.");
    if (!lookId) throw new Error("This Identity has no HeyGen avatar yet. Choose one on Identity, AI Avatar in IdeaToVideo.");
    // a download cut off earlier (Stop, the app closed) left a half file: it goes first
    fs.rmSync(`${bubbleFile(projectDir, "webm")}.part`, { force: true });
    onProgress({ step: "bubble-upload" });
    const asset = await api.uploadAudio({ apiKey, file: vo });
    onProgress({ step: "bubble-make" });
    const id = await api.createVideo({ apiKey, avatarId: lookId, audioAssetId: asset, title: "RecCut bubble", format: "webm", engine: "avatar_iii" });
    const out = bubbleFile(projectDir, "webm");
    const part = `${out}.part`;
    await api.waitAndDownload({ apiKey, id, out: part, onStatus: (s) => onProgress({ step: "bubble-wait", status: s }) });
    fs.rmSync(bubbleFile(projectDir, "mp4"), { force: true });
    fs.renameSync(part, out);
    logAsset(projectDir, { file: "recorded/bubble.webm", title: "Avatar bubble", source: "heygen", license: "heygen-terms", author: "HeyGen (own account)", model: "HeyGen avatar_iii", prompt: "the video's own cut voice, lip synced", costUsd: cost.usd, date: new Date().toISOString().slice(0, 10) });
    saveInput(projectDir, { ...input, bubble: { ...input.bubble, source: "heygen", state: "made", file: "recorded/bubble.webm", heygenId: id, costUsd: cost.usd } });
    invalidateReview(projectDir);
    appendLog(projectDir, `recorded: avatar bubble made at HeyGen, avatar_iii, about ${cost.usd} USD`);
    return { made: true, cost, bubble: readInput(projectDir).bubble };
  } catch (e) {
    saveInput(projectDir, { ...input, bubble: { ...input.bubble, state: "failed" } });
    addNote(projectDir, "bubble", `The avatar bubble was not made, so this video is Screen only: ${String(e?.message ?? e).slice(0, 300)}`);
    invalidateReview(projectDir);
    appendLog(projectDir, `recorded: avatar bubble failed, ${e?.message}`);
    return { made: false, cost, error: String(e?.message ?? e) };
  }
}

/** What the composition puts in the bubble, from input.json. Pure. */
export function bubbleMount(input) {
  const b = migrateInput(input)?.bubble;
  if (!b) return null;
  if (b.mode === "box" && b.box) return { kind: "lift", box: b.box };
  if (b.mode === "avatar" && b.state === "made" && b.file) return { kind: "clip", file: b.file };
  return null;
}
