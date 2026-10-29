// thumbnail/compose.mjs: the finished thumbnail (DECISIONS 131). The AI
// picture fills the frame; the words sit on a panel in the Identity's
// background colour, in its display font, the accent word in its first
// colour. The colours are pushed to a safe contrast against the panel (the
// Brand wizard's rule, brand/card.mjs fixContrast), so the words read at
// phone size whatever the picture shows. The frame is a one-frame HyperFrames
// composition, photographed by the engine's own snapshot, like the contact
// sheet: no renderer of our own. ffmpeg makes it a 1280x720 JPEG under 1 MB,
// so the Video Publishing Card stays under the publishing app's 2 MB.

import fs from "node:fs";
import path from "node:path";
import { runHyperframes, resolveBrowser, engineDir } from "../tools.mjs";
import { ffmpeg } from "../gates/review/index.mjs";
import { libraryDir } from "../gates/build/assemble.mjs";
import { fontFaces, categories } from "../brand/fonts.mjs";
import { loadCard, contrast, fixContrast } from "../brand/card.mjs";
import { cleanWords } from "./ideas.mjs";

export const WIDTH = 1280;
export const HEIGHT = 720;
export const MAX_JPEG_BYTES = 1024 * 1024;
export const TEXT_MIN = 7; // the words against the panel
export const ACCENT_MIN = 4.5; // the accent word against the panel

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fontStack = (family, cat) => `'${family}', ${cat === "serif" ? "Georgia, serif" : "Inter, Arial, sans-serif"}`;

// The colours of the words: the card's own, pushed to the minimum contrast.
export function wordColors(card) {
  const panel = card.colors.background;
  const text = fixContrast(card.colors.text, panel, TEXT_MIN);
  const accent = fixContrast(card.colors.primary, panel, ACCENT_MIN);
  return { panel, text, accent, bar: card.colors.primary, textRatio: contrast(text, panel), accentRatio: contrast(accent, panel) };
}

// The page: picture, panel, words (one word per line, the size fitted to
// the panel once the fonts are in).
export function thumbnailHtml({ words, accent = -1, colors, family, category, fontCss = "", picture = "picture.jpg", language = "en" }) {
  const list = cleanWords(words).split(" ").filter(Boolean);
  const lines = list.map((w, i) => `<span class="w${i === accent ? " a" : ""}">${esc(w)}</span>`).join("\n          ");
  return `<!doctype html>
<html lang="${esc(language)}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${WIDTH}, height=${HEIGHT}" />
    <title>Thumbnail</title>
    <style>
${fontCss}
      html, body { margin: 0; background: ${colors.panel}; }
      #main { position: relative; width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
      #pic { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
      #panel { position: absolute; left: 0; top: 0; bottom: 0; width: 590px; background: linear-gradient(90deg, ${colors.panel} 0, ${colors.panel} 520px, ${colors.panel}00 590px); }
      #bar { position: absolute; left: 0; top: 0; bottom: 0; width: 16px; background: ${colors.bar}; }
      #words { position: absolute; left: 56px; top: 50%; transform: translateY(-50%); width: 460px; max-height: 620px; display: flex; flex-direction: column; font-family: ${fontStack(family, category)}; font-weight: 900; line-height: 0.98; text-transform: uppercase; letter-spacing: -0.01em; color: ${colors.text}; }
      #words .a { color: ${colors.accent}; }
    </style>
    <script src="gsap.min.js"></script>
  </head>
  <body>
    <div id="main" data-composition-id="main" data-start="0" data-duration="1" data-width="${WIDTH}" data-height="${HEIGHT}" data-fps="30">
      <img id="pic" src="${esc(picture)}" alt="" />
      <div id="panel"></div>
      <div id="bar"></div>
      <div id="words">
          ${lines}
      </div>
    </div>
    <script>
      function fit() {
        var box = document.getElementById("words");
        var size = 190;
        box.style.fontSize = size + "px";
        while (size > 40 && (box.scrollWidth > 460 || box.scrollHeight > 620)) {
          size -= 4;
          box.style.fontSize = size + "px";
        }
      }
      fit();
      if (document.fonts) document.fonts.ready.then(fit);
      window.__timelines = window.__timelines || {};
      window.__timelines["main"] = gsap.timeline({ paused: true });
    </script>
  </body>
</html>
`;
}

// Picture + words -> out (JPEG). Returns { file, bytes, textRatio, accentRatio }.
export async function compose({ identityDir, picture, words, accent, out, language = "en", env = process.env, work }) {
  const { card } = loadCard(identityDir);
  const colors = wordColors(card);
  const family = card.fonts.display.family;
  const dir = work ?? path.join(path.dirname(out), ".compose");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const fonts = fontFaces([family], { dir: libraryDir(env) });
  for (const f of fonts.files) {
    fs.mkdirSync(path.dirname(path.join(dir, f.to)), { recursive: true });
    fs.copyFileSync(f.from, path.join(dir, f.to));
  }
  const gsap = path.join(engineDir(env), "node_modules", "gsap", "dist", "gsap.min.js");
  if (fs.existsSync(gsap)) fs.copyFileSync(gsap, path.join(dir, "gsap.min.js"));
  fs.copyFileSync(picture, path.join(dir, "picture.jpg"));
  fs.writeFileSync(path.join(dir, "index.html"), thumbnailHtml({ words, accent, colors, family, category: categories()[family], fontCss: fonts.css, language }));
  const browser = resolveBrowser(env);
  if (!browser) throw new Error("The render browser is not downloaded yet. Use Download now on the Projects page.");
  const shots = path.join(dir, "shots");
  const r = await runHyperframes(["snapshot", "-o", shots, "--at", "0.5", "--no-end", "--describe", "false"], { env, cwd: dir, browser: browser.path });
  if (r.code !== 0) throw new Error(`The thumbnail picture could not be made: ${r.tail.split("\n").slice(-4).join(" ")}`);
  const png = fs.existsSync(shots) ? fs.readdirSync(shots).find((f) => f.endsWith(".png")) : null;
  if (!png) throw new Error("The thumbnail snapshot made no picture.");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  // JPEG quality 2 (best) to 8, the first one under 1 MB
  for (let q = 2; q <= 8; q++) {
    await ffmpeg(["-i", path.join(shots, png), "-vf", `scale=${WIDTH}:${HEIGHT}`, "-q:v", String(q), "-frames:v", "1", out], env);
    if (fs.statSync(out).size <= MAX_JPEG_BYTES) break;
  }
  const bytes = fs.statSync(out).size;
  fs.rmSync(dir, { recursive: true, force: true });
  if (bytes > MAX_JPEG_BYTES) throw new Error("The thumbnail stayed larger than 1 MB. Try another variant.");
  return { file: out, bytes, textRatio: colors.textRatio, accentRatio: colors.accentRatio };
}
