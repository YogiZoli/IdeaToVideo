// brand/preview.mjs: the Brand wizard's real preview (docs/wizards/brand.md 7).
// A built-in sample video, no key and no AI: five scenes themed with the card,
// built by the same assembler as a ONE Video and photographed by the same
// contact-sheet step as gate 4 (one still per scene, landed). Lint and check
// are skipped, the sample is fixed and covered by the tests. The Motion
// wizard will reuse this sample.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { assemble } from "../gates/build/assemble.mjs";
import { contactSheet } from "../gates/review/index.mjs";
import { ffmpegPaths, dataDir } from "../tools.mjs";
import { cardTheme, cardFamilies, normalizeCard } from "./card.mjs";
import { categories, familyNames } from "./fonts.mjs";

export const SCENE_SECONDS = 4;

// One short line per content language, with its special letters, so the
// preview shows the fonts with the accents the videos will need.
export const SAMPLE_LINE = {
  en: "Clear ideas win attention",
  hu: "Őszinte ötletek győznek, ügyesen",
  de: "Größere Ideen überzeugen schön",
  es: "Las ideas claras ganan atención",
  fr: "Les idées claires gagnent, déjà",
  it: "Le idee chiare vincono così",
  pt: "Ideias claras ganham atenção",
  nl: "Heldere ideeën winnen aandacht",
  pl: "Jasne pomysły zdobywają uwagę",
  ro: "Ideile clare câștigă atenția",
};

export function sampleScenes(card, language = "en") {
  const n = card.nameplate ?? {};
  const name = (n.name || card.name || "Your brand").slice(0, 40);
  return [
    { from: "S1", component: "titlecard-lockup", vars: { wordmark: name.toUpperCase(), label: (n.title || "Your videos, your look").toUpperCase(), kicker: "PREVIEW" } },
    { from: "S2", component: "per-word-rise", vars: { text: SAMPLE_LINE[language] ?? SAMPLE_LINE.en } },
    { from: "S3", component: "count-up", vars: { end: 42, suffix: "%" } },
    { from: "S4", component: "grid-card-assemble", vars: { items: "Write,Record,Publish" } },
    { from: "S5", component: "logo-brand-close", vars: { wordmark: name, tagline: n.title || "Thanks for watching", url: n.url || "" } },
  ];
}

export function sampleSentences(count = 5) {
  return Array.from({ length: count }, (_, i) => ({ id: `S${i + 1}`, start: i * SCENE_SECONDS, end: (i + 1) * SCENE_SECONDS - 0.2, dur: SCENE_SECONDS - 0.2, words: 3, text: "Preview." }));
}

export const previewDir = (env = process.env) => path.join(dataDir(env), "brand-preview");

export async function brandPreview({ card, language = "en", env = process.env, work = previewDir(env), onProgress = () => {} }) {
  const clean = normalizeCard(card, { families: familyNames() });
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(path.join(work, "audio"), { recursive: true });
  const scenes = sampleScenes(clean, language);
  const sentences = sampleSentences(scenes.length);
  const total = scenes.length * SCENE_SECONDS;
  fs.writeFileSync(path.join(work, "sentences.json"), JSON.stringify(sentences, null, 2));
  fs.writeFileSync(path.join(work, "scenes.json"), JSON.stringify({ scenes }, null, 2));
  const ff = ffmpegPaths(env)?.ffmpeg;
  if (!ff) throw new Error("The bundled ffmpeg is missing. Reinstall the app.");
  const r = spawnSync(ff, ["-y", "-v", "error", "-f", "lavfi", "-i", `anullsrc=r=44100:cl=stereo`, "-t", String(total), "-b:a", "64k", path.join(work, "audio", "vo_bgm.mp3")], { windowsHide: true });
  if (r.status !== 0) throw new Error(`Could not make the preview's silent audio: ${String(r.stderr).slice(-300)}`);
  onProgress({ step: "build" });
  const look = { theme: cardTheme(clean, categories()), families: cardFamilies(clean), light: clean.appearance === "light" };
  await assemble(work, { env, total, language, title: "Brand preview", look });
  const sheet = await contactSheet(work, { env, onProgress });
  return { stills: sheet.stills, sheet: sheet.sheet };
}
