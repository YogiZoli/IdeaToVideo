// recorded/compose.mjs: the composition of a cut recording (docs/BUILD_PLAN.md
// phase 2). We write the page, HyperFrames makes the frames, like every other video
// in the app. The recording plays inside the composition; zooms, layouts, words and
// the rest are one paused GSAP timeline on top of it. There is no sound effect in
// here anywhere: the only audio is the recording's own voice with the recipe's music.

import fs from "node:fs";
import path from "node:path";

export const WIDTH = 1920;
export const HEIGHT = 1080;
const r3 = (x) => Math.round(x * 1000) / 1000;
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The screen placed in the frame: as large as fits, in the middle. Pure. */
export function fitBox(width, height, boxWidth = WIDTH, boxHeight = HEIGHT) {
  const scale = Math.min(boxWidth / width, boxHeight / height);
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  return { x: Math.round((boxWidth - w) / 2), y: Math.round((boxHeight - h) / 2), w, h };
}

/** Where the two pictures of a screen share sit in each layout. Pure. */
export const LAYOUT_BOXES = {
  "full-face": { cam: { left: 0, top: 0, width: WIDTH, height: HEIGHT, radius: 0 }, screen: { left: 0, top: 0, width: WIDTH, height: HEIGHT, radius: 0 } },
  split: { cam: { left: 1264, top: 170, width: 616, height: 740, radius: 24 }, screen: { left: 40, top: 170, width: 1184, height: 740, radius: 24 } },
  "big-screen": { cam: { left: 1540, top: 756, width: 340, height: 284, radius: 24 }, screen: { left: 0, top: 0, width: WIDTH, height: HEIGHT, radius: 0 } },
};

/**
 * A full-frame picture moved into a box with transforms only, as the engine wants:
 * the camera fills its box and is cropped, the screen fits inside it whole. Pure.
 */
export function placeInBox(box, fill) {
  const scale = fill ? Math.max(box.width / WIDTH, box.height / HEIGHT) : Math.min(box.width / WIDTH, box.height / HEIGHT);
  const insetX = fill ? (WIDTH - box.width / scale) / 2 : 0;
  const insetY = fill ? (HEIGHT - box.height / scale) / 2 : 0;
  const x = fill ? box.left - insetX * scale : box.left + (box.width - WIDTH * scale) / 2;
  const y = fill ? box.top - insetY * scale : box.top + (box.height - HEIGHT * scale) / 2;
  return { x: r3(x), y: r3(y), scale: Math.round(scale * 100000) / 100000, clipPath: `inset(${r3(insetY)}px ${r3(insetX)}px ${r3(insetY)}px ${r3(insetX)}px round ${r3(box.radius / scale)}px)` };
}

/** A big word's size: the fewer letters, the bigger. Pure. */
export function wordSize(text) {
  const n = String(text).length;
  if (n <= 6) return 300;
  if (n <= 9) return 240;
  if (n <= 14) return 170;
  if (n <= 22) return 120;
  return 92;
}

const videoTag = (id, src, total, style, extra = "") =>
  `    <video id="${id}" src="${src}" muted data-volume="0" data-start="0" data-duration="${total}" data-track-index="${extra || 1}" style="position:absolute;${style}"></video>`;

const CURSOR_SVG = `<svg id="cursor" width="44" height="60" viewBox="0 0 22 30" style="position:absolute;left:0;top:0;z-index:3;transform-origin:0 0;filter:drop-shadow(0 3px 5px rgba(0,0,0,0.45))"><path d="M2 1 L2 23 L7.6 17.9 L11.2 26.6 L15 25 L11.4 16.5 L19 16.2 Z" fill="#ffffff" stroke="#111318" stroke-width="1.6" stroke-linejoin="round"/></svg>`;

/** The page. Pure, the tests read it. */
export function recordedHtml({ plan, preset, total, language = "en", fontCss = "", pictures = {}, shots = [], footage = [], cutouts = [], motion = null, title = "Video" }) {
  const t = preset.tokens;
  const c = t.colors;
  const rec = preset.recorded;
  const parts = [];
  const lines = [];

  // ---- the pictures ---------------------------------------------------------------
  if (rec.silhouette) {
    parts.push(`    <div id="stage" class="clip" data-start="0" data-duration="${total}" data-track-index="0" style="position:absolute;inset:0;background:${esc(plan.beats[0]?.color ?? c.background)};z-index:0"></div>`);
    parts.push(videoTag("figure", pictures.figure, total, `left:0;top:0;width:${WIDTH}px;height:${HEIGHT}px;z-index:1`));
    plan.beats.slice(1).forEach((b) => lines.push(`tl.set("#stage", { backgroundColor: ${JSON.stringify(b.color)} }, ${r3(b.start)});`));
  } else if (rec.layouts) {
    const first = LAYOUT_BOXES[plan.layouts[0]?.mode ?? "full-face"];
    const full = `left:0;top:0;width:${WIDTH}px;height:${HEIGHT}px;transform-origin:0 0`;
    parts.push(`    <div id="stage" class="clip" data-start="0" data-duration="${total}" data-track-index="0" style="position:absolute;inset:0;background:${esc(c.background)};z-index:0"></div>`);
    parts.push(videoTag("screen", pictures.screen, total, `${full};object-fit:contain;z-index:1`));
    parts.push(videoTag("cam", pictures.camera, total, `${full};object-fit:cover;object-position:50% 30%;z-index:2`, 3));
    lines.push(`tl.set("#screen", ${JSON.stringify(placeInBox(first.screen, false))}, 0);`, `tl.set("#cam", ${JSON.stringify(placeInBox(first.cam, true))}, 0);`);
    plan.layouts.slice(1).forEach((l) => {
      const b = LAYOUT_BOXES[l.mode];
      const at = r3(Math.max(0, l.start - 0.2));
      lines.push(`tl.to("#screen", ${JSON.stringify({ ...placeInBox(b.screen, false), duration: 0.42, ease: "power2.inOut" })}, ${at});`);
      lines.push(`tl.to("#cam", ${JSON.stringify({ ...placeInBox(b.cam, true), duration: 0.42, ease: "power2.inOut" })}, ${at});`);
    });
  } else if (rec.main === "screen") {
    const box = fitBox(motion?.size?.width ?? WIDTH, motion?.size?.height ?? HEIGHT);
    parts.push(`    <div id="stage" class="clip" data-start="0" data-duration="${total}" data-track-index="0" style="position:absolute;inset:0;background:${esc(c.background)};z-index:0"></div>`);
    parts.push(videoTag("screen", pictures.screen, total, `left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px;object-fit:contain;transform-origin:0 0;z-index:1`));
    if (motion?.cursor && motion?.painted) parts.push(`    ${CURSOR_SVG}`);
    if (pictures.camera) parts.push(videoTag("bubble", pictures.camera, total, "right:40px;bottom:40px;width:300px;height:300px;border-radius:50%;object-fit:cover;object-position:50% 30%;box-shadow:0 0 0 5px " + esc(c.primary) + ",0 12px 40px rgba(0,0,0,0.4);z-index:6", 3));
    if (motion?.view) {
      lines.push(
        `var VIEW = ${JSON.stringify(motion.view)};`,
        `var CUR = ${JSON.stringify(motion.cursor && motion.painted ? motion.cursor : null)};`,
        `var BOX = ${JSON.stringify(box)};`,
        `var FPS = ${motion.fps};`,
        "var clock = { t: 0 };",
        "var screenEl = document.getElementById('screen');",
        "var cursorEl = document.getElementById('cursor');",
        "function at(list, t, k) { var f = t * FPS; var i = Math.min(list.length - 1, Math.floor(f)); var j = Math.min(list.length - 1, i + 1); return list[i][k] + (list[j][k] - list[i][k]) * (f - i); }",
        "function drawView() {",
        "  var t = clock.t; var s = at(VIEW, t, 2); var cx = BOX.x + at(VIEW, t, 0) * BOX.w; var cy = BOX.y + at(VIEW, t, 1) * BOX.h;",
        `  var tx = ${WIDTH} / 2 - cx * s; var ty = ${HEIGHT} / 2 - cy * s;`,
        "  tx = Math.min(0, Math.max(" + WIDTH + " * (1 - s), tx)); ty = Math.min(0, Math.max(" + HEIGHT + " * (1 - s), ty));",
        "  if (s === 1) { tx = 0; ty = 0; }",
        "  screenEl.style.transform = 'translate(' + (tx + BOX.x * (s - 1)) + 'px,' + (ty + BOX.y * (s - 1)) + 'px) scale(' + s + ')';",
        "  if (CUR && cursorEl) { var mx = BOX.x + at(CUR, t, 0) * BOX.w; var my = BOX.y + at(CUR, t, 1) * BOX.h; cursorEl.style.transform = 'translate(' + (mx * s + tx) + 'px,' + (my * s + ty) + 'px) scale(' + (0.7 + 0.3 * s) + ')'; }",
        "}",
        `tl.to(clock, { t: ${total}, duration: ${total}, ease: "none", onUpdate: drawView }, 0);`,
        "window.addEventListener('load', drawView);",
      );
    }
  } else {
    parts.push(videoTag("cam", pictures.camera, total, `left:0;top:0;width:${WIDTH}px;height:${HEIGHT}px;object-fit:cover;object-position:50% 30%;z-index:1`));
  }

  // ---- big words, on the word they are said on --------------------------------------
  for (const b of plan.bigWords ?? []) {
    const seconds = r3(b.end - b.start);
    const over = footage.some((f) => b.start < f.end && b.end > f.start);
    const z = b.behind && !over && cutouts.some((x) => x.id === b.id) ? 2 : 5;
    parts.push(`    <div id="${b.id}" class="clip bigword" data-start="${r3(b.start)}" data-duration="${seconds}" data-track-index="10" style="font-size:${wordSize(b.text)}px;z-index:${z}">${esc(b.text)}</div>`);
    lines.push(`tl.fromTo("#${b.id}", { opacity: 0, scale: 0.88 }, { opacity: 1, scale: 1, duration: 0.2, ease: "power3.out" }, ${r3(b.start)});`);
    lines.push(`tl.to("#${b.id}", { opacity: 0, duration: 0.14, ease: "power1.in" }, ${r3(Math.max(b.start + 0.25, b.end - 0.14))});`);
  }
  for (const x of cutouts) parts.push(`    <video id="cut-${x.id}" src="${x.file}" muted data-volume="0" data-start="${r3(x.start)}" data-duration="${r3(x.seconds)}" data-track-index="11" style="position:absolute;left:0;top:0;width:${WIDTH}px;height:${HEIGHT}px;z-index:3"></video>`);

  // ---- B-roll, from the Phase 1b engine ----------------------------------------------
  footage.forEach((f, k) => {
    const seconds = r3(f.end - f.start);
    parts.push(`    <video id="footage-${k + 1}" src="${f.file}" muted data-volume="0" data-start="${r3(f.start)}" data-duration="${seconds}" data-track-index="6" style="position:absolute;left:0;top:0;width:${WIDTH}px;height:${HEIGHT}px;object-fit:cover;z-index:4"></video>`);
  });

  // ---- chapter titles ----------------------------------------------------------------
  if (rec.chapterTitles) {
    plan.chapters.forEach((ch, i) => {
      if (i === 0 && total < 30) return;
      const seconds = Math.min(3.6, Math.max(1.5, total - ch.start));
      const start = r3(ch.start);
      parts.push(`    <div id="chapter-${i + 1}" class="clip chapter" data-start="${start}" data-duration="${r3(seconds)}" data-track-index="12"><span class="num">${i + 1}</span><span class="name">${esc(ch.title)}</span></div>`);
      lines.push(`tl.fromTo("#chapter-${i + 1}", { opacity: 0, x: -40 }, { opacity: 1, x: 0, duration: 0.35, ease: "power3.out" }, ${r3(start + 0.05)});`);
      lines.push(`tl.to("#chapter-${i + 1}", { opacity: 0, x: -24, duration: 0.25, ease: "power2.in" }, ${r3(start + seconds - 0.27)});`);
    });
  }

  // ---- one marker per shot: the Preview takes a still of each -------------------------
  shots.forEach((s, i) => parts.push(`    <div id="scene-${i + 1}" class="clip shot" data-start="${r3(s.start)}" data-duration="${r3(s.duration)}" data-track-index="20"></div>`));

  return `<!doctype html>
<html lang="${esc(language)}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${WIDTH}, height=${HEIGHT}" />
    <title>${esc(title)}</title>
    <style>
${fontCss}
      html, body { margin: 0; background: ${esc(c.background)}; }
      #main { position: relative; width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
      .shot { position: absolute; left: 0; top: 0; width: 1px; height: 1px; }
      .bigword { position: absolute; left: 60px; right: 60px; top: 150px; text-align: center; font-family: '${esc(t.fonts.display)}', sans-serif; line-height: 1; letter-spacing: -0.01em; text-transform: uppercase; color: ${esc(c.primary)}; -webkit-text-stroke: 10px ${esc(c.background)}; paint-order: stroke fill; text-shadow: 0 6px 34px rgba(0,0,0,0.45); opacity: 0; }
      .chapter { position: absolute; left: 56px; bottom: 56px; display: flex; align-items: center; gap: 18px; padding: 16px 28px 16px 18px; border-radius: 14px; background: ${esc(c.background)}; color: ${esc(c.text)}; font-family: '${esc(t.fonts.body)}', sans-serif; font-size: 40px; font-weight: 700; opacity: 0; z-index: 7; }
      .chapter .num { display: inline-flex; align-items: center; justify-content: center; width: 60px; height: 60px; border-radius: 10px; background: ${esc(c.primary)}; color: ${esc(c.background)}; font-family: '${esc(t.fonts.display)}', sans-serif; font-size: 34px; }
    </style>
    <script src="gsap.min.js"></script>
  </head>
  <body>
    <div id="main" data-composition-id="main" data-start="0" data-duration="${total}" data-width="${WIDTH}" data-height="${HEIGHT}" data-fps="30">
${parts.join("\n")}
    <audio id="main-audio" src="vo_bgm.mp3" data-start="0" data-duration="${total}" data-track-index="2"></audio>
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      var tl = gsap.timeline({ paused: true });
      window.__timelines["main"] = tl;
${lines.map((l) => `      ${l}`).join("\n")}
      tl.set({}, {}, ${total});
    </script>
  </body>
</html>
`;
}

/** A file into the build folder without copying gigabytes: a hard link if it can be. */
export function linkInto(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.rmSync(to, { force: true });
  try {
    fs.linkSync(from, to);
  } catch {
    fs.copyFileSync(from, to);
  }
}
