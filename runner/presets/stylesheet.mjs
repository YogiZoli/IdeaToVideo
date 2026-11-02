// presets/stylesheet.mjs: a preset's style sheet PNG, rendered by code from its
// JSON tokens (docs/BUILD_PLAN.md). A one-frame HyperFrames composition,
// photographed by the engine's own snapshot like the thumbnail and the contact
// sheet: no renderer of our own. A preset whose tokens say "from": "brand"
// takes the channel's Brand colours and fonts.

import fs from "node:fs";
import path from "node:path";
import { runHyperframes, resolveBrowser, engineDir } from "../tools.mjs";
import { libraryDir } from "../gates/build/assemble.mjs";
import { fontFaces } from "../brand/fonts.mjs";
import { loadCard } from "../brand/card.mjs";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const RADIUS = { none: 0, small: 6, medium: 14, large: 28 };

/** The tokens the sheet shows: the preset's, or the channel's Brand. */
export function tokensFor(preset, identityDir) {
  if (preset.tokens.from !== "brand" || !identityDir) return preset.tokens;
  const { card } = loadCard(identityDir);
  return {
    ...preset.tokens,
    colors: { background: card.colors.background, text: card.colors.text, muted: card.colors.muted, primary: card.colors.primary, secondary: card.colors.secondary },
    fonts: { display: card.fonts.display.family, body: card.fonts.body.family },
    shape: { corners: card.shape.corners, cards: card.shape.cards },
  };
}

export function stylesheetHtml({ preset, tokens, fontCss = "" }) {
  const c = tokens.colors;
  const radius = RADIUS[tokens.shape?.corners] ?? 14;
  const swatches = Object.entries(c)
    .map(([k, v]) => `<div class="sw"><div class="chip" style="background:${esc(v)}"></div><b>${esc(k)}</b><span>${esc(v)}</span></div>`)
    .join("");
  const templates = preset.templates.map((t) => `<li>${esc(t.label)}</li>`).join("");
  const rules = Object.entries(preset.shotRules)
    .map(([k, v]) => `<div class="rule"><b>${esc(k)}</b><span>${esc(v)}</span></div>`)
    .join("");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <title>${esc(preset.label)} style sheet</title>
    <style>
${fontCss}
      html, body { margin: 0; background: ${esc(c.background)}; }
      #sheet { position: relative; width: 1920px; height: 1080px; overflow: hidden; background: ${esc(c.background)}; color: ${esc(c.text)}; font-family: '${esc(tokens.fonts.body)}', Inter, Arial, sans-serif; }
      .in { position: absolute; inset: 64px 80px; display: grid; grid-template-columns: 1.1fr 1fr; gap: 56px; }
      h1 { margin: 0; font: 800 96px/1 '${esc(tokens.fonts.display)}', Inter, Arial, sans-serif; letter-spacing: -0.02em; }
      h1 em { font-style: normal; color: ${esc(c.primary)}; }
      p.lead { margin: 18px 0 40px; font-size: 28px; line-height: 1.35; color: ${esc(c.muted)}; max-width: 880px; }
      h2 { margin: 0 0 16px; font: 700 22px/1.2 '${esc(tokens.fonts.body)}', Inter, Arial, sans-serif; text-transform: uppercase; letter-spacing: 0.1em; color: ${esc(c.muted)}; }
      .swatches { display: flex; gap: 18px; margin-bottom: 40px; }
      .sw { display: grid; gap: 6px; font-size: 20px; }
      .sw span { color: ${esc(c.muted)}; font-size: 18px; }
      .chip { width: 138px; height: 92px; border-radius: ${radius}px; border: 2px solid ${esc(c.muted)}; }
      .type { font: 700 60px/1.1 '${esc(tokens.fonts.display)}', Inter, Arial, sans-serif; margin-bottom: 10px; }
      .body { font-size: 30px; line-height: 1.4; }
      ul { margin: 0 0 36px; padding: 0; list-style: none; display: grid; grid-template-columns: 1fr 1fr; gap: 10px 20px; font-size: 25px; }
      li { padding: 12px 18px; border-radius: ${radius}px; border: 2px solid ${esc(c.primary)}; }
      .rule { display: grid; grid-template-columns: 170px 1fr; gap: 14px; font-size: 21px; line-height: 1.3; margin-bottom: 12px; }
      .rule span { color: ${esc(c.muted)}; }
    </style>
  </head>
  <body>
    <div id="sheet" data-composition-id="main" data-start="0" data-duration="1" data-width="1920" data-height="1080" data-fps="30">
      <div class="in">
        <div>
          <h1>${esc(preset.label)}<em>.</em></h1>
          <p class="lead">${esc(preset.description)}</p>
          <h2>Colors</h2>
          <div class="swatches">${swatches}</div>
          <h2>Type</h2>
          <div class="type">${esc(tokens.fonts.display)} display</div>
          <div class="body">${esc(tokens.fonts.body)} body text, for what the voice leaves out.</div>
        </div>
        <div>
          <h2>Scene templates</h2>
          <ul>${templates}</ul>
          <h2>Shot rules</h2>
          ${rules}
        </div>
      </div>
    </div>
    <script src="gsap.min.js"></script>
    <script>
      window.__timelines = window.__timelines || {};
      window.__timelines["main"] = gsap.timeline({ paused: true });
    </script>
  </body>
</html>
`;
}

/** Writes <dir>/stylesheet.png and returns its path. */
export async function renderStylesheet({ preset, identityDir = null, dir, env = process.env }) {
  const tokens = tokensFor(preset, identityDir);
  const work = path.join(dir, "_work");
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  const fonts = fontFaces([...new Set([tokens.fonts.display, tokens.fonts.body])], { dir: libraryDir(env) });
  for (const f of fonts.files) {
    fs.mkdirSync(path.dirname(path.join(work, f.to)), { recursive: true });
    fs.copyFileSync(f.from, path.join(work, f.to));
  }
  const gsap = path.join(engineDir(env), "node_modules", "gsap", "dist", "gsap.min.js");
  if (fs.existsSync(gsap)) fs.copyFileSync(gsap, path.join(work, "gsap.min.js"));
  fs.writeFileSync(path.join(work, "index.html"), stylesheetHtml({ preset, tokens, fontCss: fonts.css }));
  const browser = resolveBrowser(env);
  if (!browser) throw new Error("The render browser is not downloaded yet. Use Download now on the Projects page.");
  const shots = path.join(work, "shots");
  const r = await runHyperframes(["snapshot", "-o", shots, "--at", "0.5", "--no-end", "--describe", "false"], { env, cwd: work, browser: browser.path });
  const png = fs.existsSync(shots) ? fs.readdirSync(shots).find((f) => /\.png$/i.test(f)) : null;
  if (r.code !== 0 || !png) throw new Error(`The style sheet could not be photographed: ${String(r.tail ?? "").split("\n").slice(-3).join(" ")}`);
  const out = path.join(dir, "stylesheet.png");
  fs.copyFileSync(path.join(shots, png), out);
  // only the picture stays: this folder travels with the Identity's export
  fs.rmSync(work, { recursive: true, force: true });
  return out;
}
