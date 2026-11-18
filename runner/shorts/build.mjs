// shorts/build.mjs: the build of a Short (9:16, DECISIONS 188). The same inputs as a long video's
// build (the approved scenes.json, sentences.json, words.json, the mix) and the same page
// (assemble.mjs indexHtml), with vertical screens (vertical.mjs) instead of the 16:9 scene
// components, and the captions always on, in the middle third. assemble() hands a Short here.

import fs from "node:fs";
import path from "node:path";
import { prepareBuild } from "../gates/build/index.mjs";
import { sceneTimes, readWords, baseTheme, resolveLook, indexHtml, segmentClips, libraryDir, footagePlan, cutPiece, themeCss, DEFAULT_LOOK } from "../gates/build/assemble.mjs";
import { avatarClips } from "../gates/avatar/index.mjs";
import { duration } from "../audio.mjs";
import { fontFaces } from "../brand/fonts.mjs";
import { findIcon } from "../icons/index.mjs";
import { markPieces } from "../footage/library.mjs";
import { FORMATS } from "./index.mjs";
import { contentOf, keyWords, screenHtml, captionsHtml, skinOf } from "./vertical.mjs";
import { captionWords } from "../language/captions.mjs";
import { scriptFallbackCss, fontFor, videoLanguages } from "../language/index.mjs";

const r3 = (x) => Math.round(x * 1000) / 1000;
const readJson = (f, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {
    return fallback;
  }
};
const norm = (s) => String(s ?? "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/**
 * The screens of a Short: one per scene, and one more for every further sentence of a scene, so a
 * screen never holds more than one idea. Pure; the tests call it.
 */
export function screensOf(scenes, sentences, times) {
  const index = new Map(sentences.map((s, i) => [s.id, i]));
  const out = [];
  scenes.forEach((sc, n) => {
    const a = index.get(sc.from);
    const b = index.get(sc.to ?? sc.from);
    const t = times[n];
    const end = t.start + t.duration;
    const said = sentences.slice(a, b + 1);
    // a shot that starts inside a sentence, or a scene of one sentence: one screen
    const split = !Number.isFinite(sc.at) && said.length > 1;
    const starts = split ? said.map((s, k) => (k === 0 ? t.start : s.start)) : [t.start];
    starts.forEach((start, k) => {
      const until = k + 1 < starts.length ? starts[k + 1] : end;
      if (until - start < 0.4 && k > 0) return; // too short to read: the screen before stays
      const text = split ? said[k].text : said.map((s) => s.text).join(" ");
      const content = k === 0 ? contentOf(sc, text) : { layout: "lines", line1: keyWords(text), icon: null };
      out.push({ scene: n, start: r3(start), seconds: r3(until - start), said: text, content });
    });
    // a dropped short tail: the last screen lasts to the scene's end
    const last = out[out.length - 1];
    if (last && last.scene === n) last.seconds = r3(end - last.start);
  });
  return out;
}

// When the voice says each list row's first word, in seconds from the screen's start.
function rowCues(items, words, start, end) {
  const said = words.filter((w) => w.start >= start - 0.05 && w.start < end);
  let from = 0;
  return items.map((it) => {
    const first = norm(String(it).split(/\s+/)[0]);
    for (let k = from; k < said.length; k++) {
      const w = norm(said[k].text);
      if (first && (w === first || (w.length >= 3 && first.startsWith(w.slice(0, 4))))) {
        from = k + 1;
        return Math.max(0.15, r3(said[k].start - start));
      }
    }
    return NaN;
  });
}

export async function assembleVertical(projectDir, { env = process.env, total, language, title, look: wanted = DEFAULT_LOOK } = {}) {
  const look = resolveLook(wanted);
  const project = readJson(path.join(projectDir, "project.json"), {});
  const table = readJson(path.join(projectDir, "scenes.json"), null);
  const sentences = readJson(path.join(projectDir, "sentences.json"), null);
  if (!table) throw new Error("There is no scene table yet (scenes.json).");
  if (!sentences) throw new Error("There is no sentence table yet (sentences.json).");
  const scenes = table.scenes ?? [];
  if (!scenes.length) throw new Error("The scene table is empty.");
  const { width, height } = FORMATS.short;
  themeCss(table.theme, baseTheme(look)); // a bad theme fails before build/ is touched
  if (total === undefined) total = await duration(path.join(projectDir, "audio", "vo_bgm.mp3"), env);
  total = r3(total);
  const times = sceneTimes(scenes, sentences, total);
  const skin = skinOf(project.recipe?.preset);
  const words = readWords(projectDir);
  const screens = screensOf(scenes, sentences, times);

  // an icon per screen, from what it names, never the same one twice in a row
  const avoid = new Set();
  const notes = [];
  const icons = screens.map((s) => {
    const want = s.content.icon;
    for (const [q, minScore] of [[want, 0], [s.content.text ?? s.content.line1 ?? s.content.line, 10], [s.said, 12]]) {
      if (!q) continue;
      const hit = findIcon(q, { avoid, minScore, env });
      if (hit) {
        avoid.add(`${hit.family}/${hit.name}`);
        if (avoid.size > 6) avoid.delete(avoid.values().next().value);
        return hit;
      }
    }
    return null;
  });

  const avatars = avatarClips(projectDir);
  const segments = segmentClips(projectDir);
  const { out } = prepareBuild(projectDir, { env });
  const comp = path.join(out, "compositions", "components");
  fs.mkdirSync(comp, { recursive: true });
  const mounts = screens.map((s, k) => {
    const id = `vscreen-${k + 1}`;
    const src = `compositions/components/${id}.html`;
    const cues = s.content.layout === "list" ? rowCues(s.content.items, words, s.start, s.start + s.seconds) : [];
    fs.writeFileSync(path.join(out, src), screenHtml({ id, seconds: s.seconds, skin, content: s.content, icon: icons[k], n: k + 1, cues }));
    return { id: `scene-${k + 1}`, compositionId: id, src, start: s.start, duration: s.seconds, vars: {}, style: "" };
  });

  // the captions: the voice's own words, or the translated captions on the voice's sentence times (DECISIONS 189)
  const cap = captionWords(projectDir, { words, sentences });
  let captions = null;
  if (cap.words.length) {
    const src = "compositions/components/vcaptions.html";
    fs.writeFileSync(path.join(out, src), captionsHtml({ words: cap.words, total, k: skin.k }));
    captions = { compositionId: "vcaptions", src };
    if (cap.note) notes.push(cap.note);
  }

  // the look's fonts (and the caption language's), local
  const langs = videoLanguages(project);
  const families = [...new Set([...(look.families ?? []), ...(cap.families ?? []), fontFor(langs.voice), fontFor(langs.screen)].filter(Boolean))];
  const fonts = fontFaces(families, { dir: libraryDir(env) });
  for (const f of fonts.files) {
    fs.mkdirSync(path.dirname(path.join(out, f.to)), { recursive: true });
    fs.copyFileSync(f.from, path.join(out, f.to));
  }
  for (const a of avatars) {
    fs.mkdirSync(path.join(out, "avatar"), { recursive: true });
    fs.copyFileSync(path.join(projectDir, a.file), path.join(out, a.file));
  }
  for (const g of segments) {
    fs.mkdirSync(path.join(out, "segments"), { recursive: true });
    fs.copyFileSync(path.join(projectDir, g.file), path.join(out, g.file));
  }
  // B-roll and own footage: over its screens, cut to 9:16 from the middle
  const footage = footagePlan(table, sentences, look.footage, path.basename(projectDir));
  for (const [k, f] of footage.entries()) {
    fs.mkdirSync(path.join(out, "footage"), { recursive: true });
    f.file = `footage/f-${k + 1}.mp4`;
    await cutPiece(f, path.join(out, f.file), { width, height, env });
  }
  if (footage.length) markPieces(path.dirname(look.footage.dir), path.basename(projectDir), footage.map((f) => ({ clip: f.clip, start: f.from, end: f.to })));
  fs.writeFileSync(path.join(out, "caption-overrides.json"), "[]\n");
  const fontCss = [fonts.css, cap.fontCss].filter(Boolean).join("\n");
  fs.writeFileSync(path.join(out, "index.html"), indexHtml({ width, height, total, theme: table.theme, look, mounts, avatars, segments, footage: footage.map((f, k) => ({ ...f, n: k + 1 })), footageMode: "scene", language, title, fontCss, motion: null, captions }));
  return { out, scenes: mounts.length, seconds: total, notes, transitions: [], icons: icons.filter(Boolean).map((i) => `${i.family}/${i.name}`), format: "short" };
}
