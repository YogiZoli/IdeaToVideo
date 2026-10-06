// motion/preview.mjs: the Motion wizard's real preview (docs/wizards/motion.md 7).
// The Brand preview's sample video (brand/preview.mjs) with a sixth scene (a
// marked word, so the emphasis style shows), the Identity's card, the profile
// being edited (not saved yet), 3 s per scene and a second script section from
// scene 4 on, so the accent transition shows. Built by the same assembler as a
// ONE Video, rendered at draft quality into dataDir/motion-preview/. No key,
// no AI.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { assemble } from "../gates/build/assemble.mjs";
import { renderVideo } from "../gates/render/index.mjs";
import { ffmpegPaths, dataDir } from "../tools.mjs";
import { cardTheme, cardFamilies, normalizeCard } from "../brand/card.mjs";
import { categories, familyNames } from "../brand/fonts.mjs";
import { sampleScenes, SAMPLE_LINE } from "../brand/preview.mjs";
import { normalizeProfile } from "./profile.mjs";

export const SCENE_SECONDS = 3;
export const SECTION_STARTS = new Set([3]);

export function motionSampleScenes(card, language = "en") {
  const base = sampleScenes(card, language);
  const words = (SAMPLE_LINE[language] ?? SAMPLE_LINE.en).split(/\s+/);
  const mark = { from: "S4", component: "marker-highlight", vars: { text: words.slice(0, 3).join(" "), emphasis_word: words[1] ?? words[0] } };
  // titlecard, line, number, marked word, list, closing
  return [base[0], base[1], base[2], mark, base[3], base[4]].map((sc, i) => ({ ...sc, from: `S${i + 1}` }));
}

export const motionPreviewDir = (env = process.env) => path.join(dataDir(env), "motion-preview");

export async function motionPreview({ card, profile, language = "en", env = process.env, work = motionPreviewDir(env), onProgress = () => {}, signal } = {}) {
  const clean = normalizeCard(card, { families: familyNames() });
  const motion = normalizeProfile(profile);
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(path.join(work, "audio"), { recursive: true });
  const scenes = motionSampleScenes(clean, language);
  const total = scenes.length * SCENE_SECONDS;
  const sentences = scenes.map((_, i) => ({ id: `S${i + 1}`, start: i * SCENE_SECONDS, end: (i + 1) * SCENE_SECONDS - 0.2, dur: SCENE_SECONDS - 0.2, words: 3, text: "Preview." }));
  fs.writeFileSync(path.join(work, "sentences.json"), JSON.stringify(sentences, null, 2));
  fs.writeFileSync(path.join(work, "scenes.json"), JSON.stringify({ scenes }, null, 2));
  const ff = ffmpegPaths(env)?.ffmpeg;
  if (!ff) throw new Error("The bundled ffmpeg is missing. Reinstall the app.");
  const r = spawnSync(ff, ["-y", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", String(total), "-b:a", "64k", path.join(work, "audio", "vo_bgm.mp3")], { windowsHide: true });
  if (r.status !== 0) throw new Error(`Could not make the preview's silent audio: ${String(r.stderr).slice(-300)}`);
  onProgress({ step: "build" });
  const look = { theme: cardTheme(clean, categories()), families: cardFamilies(clean), light: clean.appearance === "light" };
  const built = await assemble(work, { env, total, language, title: "Motion preview", look, motion, sectionStarts: SECTION_STARTS });
  const video = await renderVideo(work, { env, quality: "draft", signal, onProgress });
  return { file: video.file, seconds: video.seconds, renderSeconds: video.renderSeconds, notes: built.notes, transitions: built.transitions.map((t) => t.type) };
}
