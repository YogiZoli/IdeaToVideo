// recorded/index.mjs: the Recorded engine's steps (docs/BUILD_PLAN.md phase 2). A
// recording goes through the same gates as a script, so everything after them is
// untouched: Preview, render, Publishing Card, Thumbnail and the publishing app.
//
//   script  the recording's words (recorded/transcript.json), and the cut list
//   voice   the cuts applied: words.json, sentences.json, audio/vo.mp3, the pictures
//   scenes  the plan: chapters, big words, layouts, beats; script.md for the card
//   avatar  skipped, always
//   review  the composition, checked, with its stills
//
// recorded/ holds what belongs to this engine:
//   input.json       the files and how they line up
//   transcript.json  the words on the sound's clock, with the check
//   cuts.json        what comes out, and what the user put back
//   plan.json        what happens on screen
//   camera.mp4, screen.mp4, figure.webm, cutout/   the pictures, cut

import fs from "node:fs";
import path from "node:path";
import { createProject, loadProject, saveProject, setGate, appendLog, writeJson, writeAtomic } from "../project.mjs";
import { loadPreset } from "../presets/index.mjs";
import { narrationFromMarkdown } from "../gates/voice/narration.mjs";
import { sentenceTable } from "../timing/sentences.mjs";
import { mix, duration } from "../audio.mjs";
import { footagePlan, cutPiece, libraryDir } from "../gates/build/assemble.mjs";
import { prepareBuild, lintAndCheck, COVERED_FILE } from "../gates/build/index.mjs";
import { contactSheet } from "../gates/review/index.mjs";
import { fontFaces } from "../brand/fonts.mjs";
import { markPieces } from "../footage/library.mjs";
import { probeMedia, transcribeFile, maskToJson, maskFromJson, loadTranscript, transcriptFile, readSamples } from "./transcribe.mjs";
import { checkWords, envelope, voicedMask, makeMarks, keepsOf, keptSeconds, finalWords, FPS } from "./cuts.mjs";
import { cutPicture, cutSound, soundLag } from "./edit.mjs";
import { planRecording, scriptFromPlan, shotRows } from "./shots.mjs";
import { recordedHtml, linkInto, WIDTH, HEIGHT } from "./compose.mjs";
import { trackFile, analyzeTrack, paintOutCursor, TRACK_FPS } from "./cursor.mjs";
import { personMasks, cutoutClip, silhouetteClip, releaseMatte } from "./matte.mjs";

export const INPUT_FILE = "input.json";
export const SLOTS = ["camera", "screen", "combined", "front"];
const r3 = (x) => Math.round(x * 1000) / 1000;
const work = (projectDir, ...rest) => path.join(projectDir, "recorded", ...rest);
const readJson = (file, fallback = null) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
};

/** Which files this preset needs, as a sentence, or null when they are enough. Pure. */
export function filesProblem(preset, files = {}) {
  const has = (s) => !!files[s];
  switch (preset.id) {
    case "talking-head":
      return has("camera") || has("combined") ? null : "Choose the camera file, or one combined file.";
    case "screen-recording":
      return has("screen") || has("combined") ? null : "Choose the screen file, or one combined file.";
    case "screen-share":
      if (has("combined")) return "Screen Share switches between two pictures, so it needs a camera file and a screen file. For one combined file choose Talking Head or Screen Recording in the recipe.";
      return has("camera") && has("screen") ? null : "Screen Share needs a camera file and a screen file.";
    case "profile-silhouette":
      return has("camera") ? null : "Choose the side-angle take.";
    default:
      return `${preset.label} is not a preset of the Recorded engine.`;
  }
}

/** Which file gives the voice: the front take, else the camera, else the main file. Pure. */
export function voiceSource(files, probes) {
  for (const s of ["front", "camera", "combined", "screen"]) if (files[s] && probes[s]?.hasAudio) return s;
  return null;
}

/** The main picture's role, and what stands in for it when one combined file came. Pure. */
export function pictureRoles(preset, files) {
  const roles = {};
  if (preset.id === "screen-recording") {
    roles.screen = files.screen ? "screen" : "combined";
    if (files.camera) roles.camera = "camera";
  } else if (preset.id === "screen-share") {
    roles.camera = "camera";
    roles.screen = "screen";
  } else {
    roles.camera = files.camera ? "camera" : "combined";
  }
  return roles;
}

const titleOf = (file) => path.basename(String(file)).replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "Recording";

/** A new video of a recording: files checked, the recipe copied in. No work yet. */
export async function newRecordedVideo({ projectsDir, identity, language = "en", recipe, files, title = "", env = process.env }) {
  const preset = loadPreset(recipe.preset);
  const clean = Object.fromEntries(SLOTS.filter((s) => files?.[s]).map((s) => [s, String(files[s])]));
  const problem = filesProblem(preset, clean);
  if (problem) throw new Error(problem);
  const probes = {};
  for (const [slot, file] of Object.entries(clean)) {
    if (!fs.existsSync(file)) throw new Error(`This file is not there any more: ${file}`);
    probes[slot] = await probeMedia(file, env);
  }
  for (const [slot, role] of Object.entries(pictureRoles(preset, clean))) if (!probes[role]?.hasVideo) throw new Error(`The ${slot} file has no picture: ${clean[role]}`);
  const voice = voiceSource(clean, probes);
  if (!voice) throw new Error("None of these files has sound, and the edit works from what is said.");
  const name = String(title).trim() || titleOf(clean.camera ?? clean.screen ?? clean.combined);
  const { dir, id } = createProject({ projectsDir, title: name, language, identity, recipe });
  fs.mkdirSync(work(dir), { recursive: true });
  writeJson(work(dir, INPUT_FILE), { schema: "recorded-input/1", preset: preset.id, files: clean, probes, voice, offsets: {}, notes: [] });
  appendLog(dir, `recorded: ${preset.id}, ${Object.keys(clean).join(" + ")}, the voice from ${voice}`);
  return { id, dir };
}

export const loadInput = (projectDir) => {
  const v = readJson(work(projectDir, INPUT_FILE));
  if (!v) throw new Error("This video has no recording. Start it again from the channel screen.");
  return v;
};
export const loadCuts = (projectDir) => readJson(work(projectDir, "cuts.json"));
export const loadPlan = (projectDir) => readJson(work(projectDir, "plan.json"));

// ---- step 1: the words ------------------------------------------------------------------

/**
 * How every picture lines up with the sound the words were made from: a positive
 * offset means the same moment comes later in that picture. A file's own sound
 * lines it up; a file without sound starts together with the voice.
 */
export async function lineUp(input, { env = process.env, read = readSamples, onProgress = () => {} } = {}) {
  const offsets = {};
  const notes = [];
  const voice = input.files[input.voice];
  const voiceEnv = envelope(await read(voice, env));
  for (const [slot, file] of Object.entries(input.files)) {
    const late = input.probes[slot]?.audioLate ?? 0;
    if (slot === input.voice) {
      offsets[slot] = r3(late);
      continue;
    }
    if (!input.probes[slot]?.hasAudio) {
      offsets[slot] = 0;
      notes.push(`The ${slot} file has no sound, so it is taken to start together with the voice.`);
      continue;
    }
    onProgress({ step: "line-up", file: slot });
    const { lag, sure } = soundLag(voiceEnv, envelope(await read(file, env)));
    offsets[slot] = sure ? r3(lag + late) : 0;
    notes.push(sure ? `The ${slot} file was lined up by its sound (${r3(lag)} s).` : `The ${slot} file's sound does not match the voice (two separate takes?), so both start together.`);
  }
  return { offsets, notes };
}

/** Transcribes, checks, marks what comes out. The gate waits for approval. */
export async function recordTranscript({ projectDir, env = process.env, signal, onProgress = () => {}, transcribe = transcribeFile }) {
  const project = loadProject(projectDir);
  const input = loadInput(projectDir);
  saveProject(projectDir, setGate(project, "script", { state: "running", mode: "custom" }));
  try {
    const { offsets, notes } = await lineUp(input, { env, onProgress });
    writeJson(work(projectDir, INPUT_FILE), { ...input, offsets, notes });
    const t = await transcribe({ file: input.files[input.voice], language: project.language, env, signal, onProgress });
    if (!t.words.length) throw new Error("No speech was found in this recording. The edit works from what is said, so it needs a file with a voice on it.");
    const careful = !t.check.ok;
    writeJson(transcriptFile(projectDir), { schema: "recorded-transcript/1", source: input.voice, seconds: r3(t.seconds), words: t.words, check: t.check, chunks: t.chunks, mask: maskToJson(t.mask), language: project.language });
    const marks = makeMarks(t.words, t.mask, { language: project.language, careful });
    writeJson(work(projectDir, "cuts.json"), { schema: "recorded-cuts/1", marks, off: [], keepPauses: false, careful });
    writeAtomic(path.join(projectDir, "script.md"), `# ${project.title}\n\n## Recording\n\n${t.words.map((w) => w.text).join(" ")}\n`);
    saveProject(projectDir, setGate(loadProject(projectDir), "script", { state: "pending", mode: "custom" }));
    appendLog(projectDir, `recorded: ${t.words.length} words, ${t.seconds.toFixed(1)} s, ${marks.length} marks; check ${JSON.stringify(t.check)}`);
    return cutSummary(projectDir);
  } catch (e) {
    saveProject(projectDir, setGate(loadProject(projectDir), "script", { state: "failed", error: String(e.message).slice(0, 2000) }));
    throw e;
  }
}

/** What the Recording tab shows of the cuts. */
export function cutSummary(projectDir) {
  const t = loadTranscript(projectDir);
  const c = loadCuts(projectDir);
  if (!t || !c) return null;
  const keeps = keepsOf(t.words, c.marks, { off: c.off, seconds: t.seconds, keepPauses: c.keepPauses });
  const kept = keptSeconds(keeps);
  const counts = { filler: 0, sound: 0, take: 0 };
  for (const m of c.marks) if (!c.off.includes(m.id)) counts[m.kind] = (counts[m.kind] ?? 0) + 1;
  return { before: r3(t.seconds), after: r3(kept), removed: r3(t.seconds - kept), counts, check: t.check, careful: !!c.careful, marks: c.marks.map((m) => ({ id: m.id, kind: m.kind, start: m.start, end: m.end, text: m.text, on: !c.off.includes(m.id) })), keepPauses: !!c.keepPauses, words: t.words.length };
}

/** Puts a cut back, or takes it out again. The next steps run again from the cuts. */
export function setCut({ projectDir, id, on, keepPauses }) {
  const c = loadCuts(projectDir);
  if (!c) throw new Error("There is no cut list yet.");
  if (id) {
    if (!c.marks.some((m) => m.id === id)) throw new Error("That cut is not in the list any more.");
    c.off = on ? c.off.filter((x) => x !== id) : [...new Set([...c.off, id])];
  }
  if (keepPauses !== undefined) c.keepPauses = !!keepPauses;
  writeJson(work(projectDir, "cuts.json"), c);
  saveProject(projectDir, setGate(loadProject(projectDir), "voice", { state: "todo" }));
  return cutSummary(projectDir);
}

// ---- step 2: the cuts, applied --------------------------------------------------------------

/** Cuts every picture and the sound at the same frames, writes the words the tail reads. */
export async function applyCuts({ projectDir, music = null, env = process.env, signal, onProgress = () => {} }) {
  const project = loadProject(projectDir);
  const input = loadInput(projectDir);
  const t = loadTranscript(projectDir);
  const c = loadCuts(projectDir);
  if (!t || !c) throw new Error("Transcribe the recording first.");
  const preset = loadPreset(input.preset);
  saveProject(projectDir, setGate(project, "voice", { state: "running", mode: "custom" }));
  try {
    const keeps = keepsOf(t.words, c.marks, { off: c.off, seconds: t.seconds, keepPauses: c.keepPauses });
    if (!keeps.length) throw new Error("Nothing is left of this recording after the cuts.");
    const kept = keptSeconds(keeps);
    const roles = pictureRoles(preset, input.files);
    const out = {};
    const list = Object.entries(roles);
    for (let i = 0; i < list.length; i++) {
      const [role, slot] = list[i];
      const file = work(projectDir, `${role}.mp4`);
      await cutPicture({
        file: input.files[slot],
        out: file,
        keeps,
        offset: input.offsets?.[slot] ?? 0,
        sourceSeconds: input.probes?.[slot]?.seconds ?? 0,
        maxWidth: role === "screen" ? 2560 : 1920,
        env,
        signal,
        onPercent: (percent) => onProgress({ step: "recorded-cut", role, percent: Math.round(((i + percent / 100) / list.length) * 100) }),
      });
      const pr = await probeMedia(file, env);
      out[role] = { file: `recorded/${role}.mp4`, width: pr.width, height: pr.height, seconds: r3(pr.seconds) };
    }
    onProgress({ step: "recorded-sound" });
    const audioDir = path.join(projectDir, "audio");
    fs.mkdirSync(audioDir, { recursive: true });
    const vo = path.join(audioDir, "vo.mp3");
    await cutSound({ file: input.files[input.voice], out: vo, keeps, env });
    onProgress({ step: "mixing" });
    const m = await mix({ vo, bgm: music, out: path.join(audioDir, "vo_bgm.mp3"), env });
    // The words on the new clock, and the check again, on the cut sound itself.
    const words = finalWords(t.words, c.marks, keeps, { off: c.off });
    fs.writeFileSync(path.join(audioDir, "stt.json"), JSON.stringify({ words }, null, 2) + "\n");
    sentenceTable(projectDir);
    const cutSamples = await readSamples(vo, env);
    const seconds = cutSamples.length / 16000;
    const after = checkWords(words, voicedMask(envelope(cutSamples)), seconds);
    writeJson(path.join(audioDir, "voice.json"), { provider: "recording", voice: input.voice, blocks: 1, words: words.length, music: null, ...m, inserts: [], endScreen: null });
    writeJson(work(projectDir, "pictures.json"), { keeps, kept: r3(kept), pictures: out, after });
    saveProject(projectDir, setGate(loadProject(projectDir), "voice", { state: "pending", mode: "custom" }));
    appendLog(projectDir, `recorded: cut from ${t.seconds.toFixed(1)} s to ${kept.toFixed(1)} s, ${keeps.length} stretches; check after ${JSON.stringify(after)}`);
    return { kept: r3(kept), stretches: keeps.length, after, pictures: out };
  } catch (e) {
    saveProject(projectDir, setGate(loadProject(projectDir), "voice", { state: "failed", error: String(e.message).slice(0, 2000) }));
    throw e;
  }
}

// ---- step 3: what happens on screen ----------------------------------------------------------

export async function planVideo({ projectDir, llm = null, env = process.env, onProgress = () => {} }) {
  const project = loadProject(projectDir);
  const input = loadInput(projectDir);
  const preset = loadPreset(input.preset);
  const sentences = readJson(path.join(projectDir, "sentences.json"));
  const words = readJson(path.join(projectDir, "words.json"));
  const pictures = readJson(work(projectDir, "pictures.json"));
  if (!sentences?.length || !pictures) throw new Error("Apply the cuts first.");
  saveProject(projectDir, setGate(project, "scenes", { state: "running", mode: "custom" }));
  try {
    const total = pictures.kept;
    const plan = await planRecording({ llm, sentences, words, total, title: project.title, preset, language: project.language, cutout: project.recipe?.recorded?.cutout === true, onProgress });
    writeJson(work(projectDir, "plan.json"), plan);
    writeAtomic(path.join(projectDir, "script.md"), scriptFromPlan(plan, sentences, words));
    // the table the B-roll engine, the Preview and the Publishing Card read
    writeJson(path.join(projectDir, "scenes.json"), { schema: 1, scenes: shotRows(sentences) });
    saveProject(projectDir, { ...setGate(loadProject(projectDir), "scenes", { state: "pending", mode: "custom" }), title: plan.title || project.title });
    appendLog(projectDir, `recorded: planned by ${plan.plannedBy}: ${plan.chapters.length} chapters, ${plan.bigWords.length} big words, ${plan.layouts.length} layouts, ${plan.beats.length} beats`);
    return plan;
  } catch (e) {
    saveProject(projectDir, setGate(loadProject(projectDir), "scenes", { state: "failed", error: String(e.message).slice(0, 2000) }));
    throw e;
  }
}

/** The user's changes to chapters and big words. The Preview is built again. */
export function savePlan({ projectDir, chapters, bigWords }) {
  const plan = loadPlan(projectDir);
  if (!plan) throw new Error("There is no plan yet.");
  const sentences = readJson(path.join(projectDir, "sentences.json")) ?? [];
  const words = readJson(path.join(projectDir, "words.json")) ?? [];
  if (Array.isArray(chapters)) plan.chapters = plan.chapters.map((c) => ({ ...c, title: String(chapters.find((x) => x.sentence === c.sentence)?.title ?? c.title).trim() || c.title }));
  if (Array.isArray(bigWords)) plan.bigWords = plan.bigWords.filter((b) => bigWords.includes(b.id));
  writeJson(work(projectDir, "plan.json"), plan);
  writeAtomic(path.join(projectDir, "script.md"), scriptFromPlan(plan, sentences, words));
  const project = loadProject(projectDir);
  if (project.gates.review?.state !== "todo") saveProject(projectDir, setGate(project, "review", { state: "todo" }));
  return plan;
}

// ---- step 4: what a picture needs before it can be mounted --------------------------------------

/** The cursor followed and painted out; the person cut out. Slow, so it has its own step. */
export async function preparePictures({ projectDir, env = process.env, signal, onProgress = () => {} }) {
  const project = loadProject(projectDir);
  const input = loadInput(projectDir);
  const preset = loadPreset(input.preset);
  const plan = loadPlan(projectDir);
  const pictures = readJson(work(projectDir, "pictures.json"));
  if (!plan || !pictures) throw new Error("Plan the video first.");
  const total = pictures.kept;
  const rec = preset.recorded;
  const done = { notes: [] };
  if (rec.zoom) {
    const screen = pictures.pictures.screen;
    const file = path.join(projectDir, screen.file);
    onProgress({ step: "recorded-cursor", percent: 0 });
    const track = await trackFile({ file, width: screen.width, height: screen.height, seconds: total, env, signal, onPercent: (percent) => onProgress({ step: "recorded-cursor", percent }) });
    const motion = analyzeTrack(track, total);
    let painted = false;
    if (motion.paintable && project.recipe?.recorded?.smoothCursor !== false) {
      const clean = work(projectDir, "screen-clean.mp4");
      await paintOutCursor({ file, out: clean, width: screen.width, height: screen.height, trackWidth: track.width, boxes: motion.boxes, seconds: total, env, signal, onPercent: (percent) => onProgress({ step: "recorded-paint", percent }) });
      painted = true;
    } else if (!motion.usable) {
      done.notes.push("The cursor could not be followed in this recording, so it stays as it was filmed and the view does not zoom.");
    } else if (!motion.paintable) {
      done.notes.push("Other things move on this screen too, so the cursor stays as it was filmed. The view still zooms to the clicks.");
    }
    const { boxes, ...keep } = motion;
    writeJson(work(projectDir, "motion.json"), { ...keep, painted, fps: TRACK_FPS });
    appendLog(projectDir, `recorded: cursor coverage ${motion.coverage}, sure ${motion.sureShare}, ${motion.clicks} clicks, ${motion.stops} stops, ${motion.zooms.length} zooms, painted ${painted}`);
  }
  if (rec.silhouette) {
    const cam = pictures.pictures.camera;
    const mask = work(projectDir, "figure-mask.mp4");
    onProgress({ step: "recorded-matte", percent: 0 });
    await personMasks({ file: path.join(projectDir, cam.file), out: mask, width: cam.width, height: cam.height, seconds: total, env, signal, onProgress, onPercent: (percent) => onProgress({ step: "recorded-matte", percent }) });
    onProgress({ step: "recorded-figure", percent: 0 });
    await silhouetteClip({ mask, out: work(projectDir, "figure.webm"), seconds: total, figure: preset.tokens.colors.primary, rim: preset.tokens.colors.secondary, env, signal, onPercent: (percent) => onProgress({ step: "recorded-figure", percent }) });
    fs.rmSync(mask, { force: true });
  }
  const behind = (plan.bigWords ?? []).filter((b) => b.behind);
  if (behind.length && pictures.pictures.camera) {
    const cam = pictures.pictures.camera;
    const dir = work(projectDir, "cutout");
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    for (let i = 0; i < behind.length; i++) {
      const b = behind[i];
      const seconds = r3(b.end - b.start);
      onProgress({ step: "recorded-cutout", n: i + 1, of: behind.length, percent: Math.round((i / behind.length) * 100) });
      const mask = path.join(dir, `${b.id}-mask.mp4`);
      await personMasks({ file: path.join(projectDir, cam.file), out: mask, width: cam.width, height: cam.height, from: b.start, seconds, env, signal, onProgress });
      await cutoutClip({ file: path.join(projectDir, cam.file), mask, out: path.join(dir, `${b.id}.webm`), from: b.start, seconds, env, signal });
      fs.rmSync(mask, { force: true });
    }
    appendLog(projectDir, `recorded: ${behind.length} person cut-outs`);
  }
  await releaseMatte();
  for (const n of done.notes) appendLog(projectDir, `recorded: ${n}`);
  return done;
}

// ---- step 5: the composition ---------------------------------------------------------------------

/** Writes build/, checks it, and takes the stills. The Preview tab shows them as for any video. */
export async function buildRecorded(projectDir, { env = process.env, language, title, look, onProgress = () => {} } = {}) {
  onProgress({ step: "build" });
  const input = loadInput(projectDir);
  const preset = loadPreset(input.preset);
  const plan = loadPlan(projectDir);
  const pictures = readJson(work(projectDir, "pictures.json"));
  if (!plan || !pictures) throw new Error("Plan the video first.");
  const { out } = prepareBuild(projectDir, { env });
  const total = r3(pictures.kept);
  const motionFile = readJson(work(projectDir, "motion.json"));
  const motion = motionFile ? { ...motionFile, size: { width: pictures.pictures.screen.width, height: pictures.pictures.screen.height } } : null;
  const mounted = {};
  const place = (from, to) => {
    linkInto(path.join(projectDir, from), path.join(out, to));
    return to;
  };
  if (preset.recorded.silhouette) {
    if (!fs.existsSync(work(projectDir, "figure.webm"))) throw new Error("The silhouette is not made yet. Press Make the video again.");
    mounted.figure = place("recorded/figure.webm", "pictures/figure.webm");
  } else {
    if (pictures.pictures.camera) mounted.camera = place(pictures.pictures.camera.file, "pictures/camera.mp4");
    if (pictures.pictures.screen) mounted.screen = motion?.painted ? place("recorded/screen-clean.mp4", "pictures/screen.mp4") : place(pictures.pictures.screen.file, "pictures/screen.mp4");
  }
  const fonts = fontFaces([...new Set([preset.tokens.fonts.display, preset.tokens.fonts.body])], { dir: libraryDir(env) });
  for (const f of fonts.files) {
    fs.mkdirSync(path.dirname(path.join(out, f.to)), { recursive: true });
    fs.copyFileSync(f.from, path.join(out, f.to));
  }
  const cutouts = (plan.bigWords ?? []).filter((b) => b.behind && fs.existsSync(work(projectDir, "cutout", `${b.id}.webm`))).map((b) => ({ id: b.id, start: b.start, seconds: r3(b.end - b.start), file: place(`recorded/cutout/${b.id}.webm`, `pictures/cut-${b.id}.webm`) }));
  // B-roll: the same plan, table and library as every other video
  const sentences = readJson(path.join(projectDir, "sentences.json"));
  const table = readJson(path.join(projectDir, "scenes.json"), { scenes: [] });
  const footage = footagePlan(table, sentences, look?.footage, path.basename(projectDir));
  for (const [k, f] of footage.entries()) {
    fs.mkdirSync(path.join(out, "footage"), { recursive: true });
    f.file = `footage/f-${k + 1}.mp4`;
    await cutPiece(f, path.join(out, f.file), { width: WIDTH, height: HEIGHT, env });
  }
  if (footage.length && look?.footage?.dir) markPieces(path.dirname(look.footage.dir), path.basename(projectDir), footage.map((f) => ({ clip: f.clip, start: f.from, end: f.to })));
  // one still per shot of about 8 s, at most 60 on the sheet
  const ids = new Map(sentences.map((s, i) => [s.id, i]));
  const every = Math.ceil(table.scenes.length / 60);
  const shots = table.scenes.filter((_, i) => i % every === 0).map((sc, i, list) => {
    const start = i === 0 ? 0 : sentences[ids.get(sc.from)].start;
    const next = list[i + 1];
    return { start, duration: r3((next ? sentences[ids.get(next.from)].start : total) - start) };
  });
  // The check cannot judge text over a moving recording; the words carry their own outline.
  fs.writeFileSync(path.join(out, COVERED_FILE), JSON.stringify([{ at: 0, seconds: total }], null, 2) + "\n");
  fs.writeFileSync(path.join(out, "index.html"), recordedHtml({ plan, preset, total, language: language ?? "en", title: title ?? plan.title, fontCss: fonts.css, pictures: mounted, shots, footage, cutouts, motion }));
  await lintAndCheck(projectDir, { env, onProgress });
  const sheet = await contactSheet(projectDir, { env, onProgress });
  return { scenes: shots.length, seconds: total, notes: [], transitions: [], icons: [], ...sheet };
}

/** Everything the Recording tab shows. */
export function recordedState(projectDir) {
  const input = readJson(work(projectDir, INPUT_FILE));
  if (!input) return { input: null };
  const motion = readJson(work(projectDir, "motion.json"));
  const pictures = readJson(work(projectDir, "pictures.json"));
  const { view, cursor, ...motionInfo } = motion ?? {};
  return { input, preset: input.preset, cuts: cutSummary(projectDir), plan: loadPlan(projectDir), after: pictures?.after ?? null, kept: pictures?.kept ?? null, motion: motion ? motionInfo : null };
}

export { narrationFromMarkdown, duration, FPS, maskFromJson };
