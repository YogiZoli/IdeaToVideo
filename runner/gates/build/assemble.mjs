// gates/build/assemble.mjs: the app's own assembler (DECISIONS 48, 49). Writes
// the project's build/ from the approved scene table and the sentence table:
//
//   build/index.html                              the root composition
//   build/compositions/components/scene-<n>-<name>.html   each scene's component, fitted
//     (lint treats compositions/components/ as mounted components: no own size)
//   build/vo_bgm.mp3, build/gsap.min.js           from prepareBuild
//
// In: scenes.json
//   {
//     "width": 1920, "height": 1080,                     optional, 1920x1080
//     "theme": { "bg", "fg", "brand", "accent", ... }     THEME_KEYS, optional
//     "scenes": [ { "component": "count-up", "from": "S3", "to": "S4",
//                   "vars": { "end": 42 } } ]
//   }
//     sentences.json   (timing/sentences.mjs)
//
// Timing is never typed: a scene starts where its first sentence starts (the
// first scene at 0) and lasts until the next scene starts; the last one until
// the end of the audio. The scenes cover every sentence, in order, so the
// picture always follows what the voice says.
//
// Each scene is one sub-composition mount (class="clip", data-composition-src,
// data-variable-values). Variables are checked against the component's
// registry-item.json before anything is written. The theme becomes the
// components' own CSS variables on :root (all of them, DEFAULT_THEME fills in).
//
// A component is authored for one length (its root and its clip carry the same
// data-duration). A mount longer than that shows nothing once the inner clip
// ends, so every scene gets its own copy with that length set to the scene's
// (fitDuration). The components' envelopes are made for this: fixed in and out,
// an elastic hold, read from the root's data-duration.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareBuild, buildDir } from "./index.mjs";
import { duration } from "../../audio.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

// The installed app has resources/library next to resources/runner; the
// repo has it under app/src-tauri (scripts/fetch-library.mjs).
export function libraryDir(env = process.env) {
  if (env.ITV_LIBRARY_DIR) return env.ITV_LIBRARY_DIR;
  const bundled = path.join(here, "..", "..", "..", "library");
  if (fs.existsSync(path.join(bundled, "LIBRARY.json"))) return bundled;
  return path.join(here, "..", "..", "..", "app", "src-tauri", "library");
}

export function loadComponent(name, { env = process.env } = {}) {
  if (!/^[a-z0-9-]+$/.test(String(name))) throw new Error(`Not a component name: ${name}`);
  const dir = path.join(libraryDir(env), "components", name);
  const itemFile = path.join(dir, "registry-item.json");
  if (!fs.existsSync(itemFile)) throw new Error(`The library has no component called ${name}.`);
  const item = JSON.parse(fs.readFileSync(itemFile, "utf8"));
  const file = item.files?.find((f) => f.path === `${name}.html`);
  if (!file) throw new Error(`${name}: registry-item.json names no ${name}.html.`);
  return { name, item, html: fs.readFileSync(path.join(dir, file.path), "utf8"), target: file.target };
}

// The component with its authored length replaced by `seconds`: the
// data-composition-duration on <html>, and every data-duration equal to it
// (the template root and the clip). Anything else would be a component with
// more than one timed part, which the fit cannot stretch safely.
export function fitDuration(html, name, seconds) {
  const m = /data-composition-duration="([\d.]+)"/.exec(html);
  if (!m) throw new Error(`${name}: no data-composition-duration, so its length cannot be fitted.`);
  const authored = m[1];
  const others = [...html.matchAll(/data-duration="([\d.]+)"/g)].filter((x) => x[1] !== authored);
  if (others.length) throw new Error(`${name}: has timed parts of other lengths (${others.map((x) => x[1]).join(", ")}), so its length cannot be fitted.`);
  const s = String(seconds);
  return html.replace(/data-composition-duration="[\d.]+"/, `data-composition-duration="${s}"`).replaceAll(`data-duration="${authored}"`, `data-duration="${s}"`);
}

// Problems with one scene's variables, as readable sentences. Missing
// variables are fine: the component's declared default applies.
export function checkVars(item, vars = {}) {
  const errors = [];
  if (!vars || typeof vars !== "object" || Array.isArray(vars)) return [`${item.name}: vars must be an object.`];
  const decl = new Map((item.variables ?? []).map((v) => [v.id, v]));
  for (const [id, value] of Object.entries(vars)) {
    const v = decl.get(id);
    if (!v) {
      errors.push(`${item.name}: no variable called ${id} (known: ${[...decl.keys()].join(", ")}).`);
      continue;
    }
    const bad = (why) => errors.push(`${item.name}.${id}: ${why}`);
    switch (v.type) {
      case "number":
        if (typeof value !== "number" || !Number.isFinite(value)) bad("must be a number.");
        else if (v.min !== undefined && value < v.min) bad(`must be at least ${v.min}.`);
        else if (v.max !== undefined && value > v.max) bad(`must be at most ${v.max}.`);
        break;
      case "boolean":
        if (typeof value !== "boolean") bad("must be true or false.");
        break;
      case "enum": {
        const ok = (v.options ?? []).map((o) => o.value);
        if (!ok.includes(value)) bad(`must be one of ${ok.join(", ")}.`);
        break;
      }
      default:
        if (typeof value !== "string") bad("must be text.");
    }
  }
  return errors;
}

// Start and length of every scene, from the sentences they cover.
export function sceneTimes(scenes, sentences, total) {
  const index = new Map(sentences.map((s, i) => [s.id, i]));
  const errors = [];
  let expect = 0;
  const spans = scenes.map((sc, n) => {
    const from = index.get(sc.from);
    const to = index.get(sc.to ?? sc.from);
    const label = `Scene ${n + 1}`;
    if (from === undefined) errors.push(`${label}: there is no sentence ${sc.from}.`);
    else if (to === undefined) errors.push(`${label}: there is no sentence ${sc.to}.`);
    else if (to < from) errors.push(`${label}: ${sc.to} comes before ${sc.from}.`);
    else if (from !== expect) errors.push(`${label} starts at ${sc.from}, but the next sentence is ${sentences[expect]?.id ?? "none (all are covered)"}.`);
    if (to !== undefined) expect = to + 1;
    return { from, to };
  });
  if (!errors.length && expect !== sentences.length) errors.push(`The scenes end at ${sentences[expect - 1].id}; ${sentences[expect].id} and after have no scene.`);
  if (errors.length) throw new Error(errors.join(" "));
  const r3 = (x) => Math.round(x * 1000) / 1000;
  const starts = spans.map((s, n) => (n === 0 ? 0 : sentences[s.from].start));
  return starts.map((start, n) => {
    const end = n + 1 < starts.length ? starts[n + 1] : total;
    return { start: r3(start), duration: r3(end - start) };
  });
}

// The CSS variables the registry components read (their own contract).
export const THEME_KEYS = ["bg", "fg", "muted", "surface", "border", "brand", "accent", "accent-2", "radius", "font-display", "font-body", "font-mono"];

export const DEFAULT_THEME = {
  bg: "#0f1115",
  fg: "#f4f5f7",
  muted: "#9aa3b2",
  surface: "#171b23",
  border: "#343b48",
  brand: "#5ee6a8",
  accent: "#6aa9ff",
  "accent-2": "#c7a6ff",
  radius: "1.8cqmin",
  "font-display": "Inter, system-ui, sans-serif",
  "font-body": "Inter, system-ui, sans-serif",
  "font-mono": "ui-monospace, Consolas, monospace",
};

// The runtime writes every variable of a mounted component as a CSS property
// on the mount (id "accent" -> --accent): the per-instance value always, and
// the declared default wherever that property is still empty, which it is
// while the mount is being set up. Either way the theme's --accent would
// become the word "green" or "blue". So:
//   - the theme lives on :root under private names (--itv-*), and every mount
//     sets all public tokens inline from them; a property that is already set
//     inline is never overwritten by a default;
//   - the accent choice never goes in as a variable: the component keeps its
//     default (green = --brand) and the mount points --brand at the chosen
//     theme colour.
const ACCENT_TOKEN = { green: "brand", blue: "accent", violet: "accent-2" };

export function mountTheme(vars = {}) {
  const { accent, ...rest } = vars;
  for (const id of Object.keys(rest)) {
    if (THEME_KEYS.includes(id)) throw new Error(`Variable ${id} would overwrite the theme's --${id}.`);
  }
  if (accent !== undefined && !(accent in ACCENT_TOKEN)) throw new Error(`Unknown accent: ${accent}.`);
  const style = THEME_KEYS.map((k) => `--${k}: var(--itv-${k === "brand" && accent ? ACCENT_TOKEN[accent] : k})`).join("; ");
  return { vars: rest, style };
}

// The theme as CSS variables. Values are CSS values (colours, lengths, font
// stacks); anything that could close the rule or the style element is refused.
export function themeCss(theme = {}) {
  const lines = [];
  for (const k of Object.keys(theme)) {
    if (!THEME_KEYS.includes(k)) throw new Error(`Unknown theme value: ${k} (known: ${THEME_KEYS.join(", ")}).`);
  }
  for (const [k, v] of Object.entries({ ...DEFAULT_THEME, ...theme })) {
    if (typeof v !== "string" || !v.trim() || /[;{}<>\\]/.test(v)) throw new Error(`Theme ${k}: not a usable CSS value.`);
    lines.push(`  --itv-${k}: ${v.trim()};`, `  --${k}: var(--itv-${k});`);
  }
  return `:root {\n${lines.join("\n")}\n}`;
}

const attr = (s) => String(s).replace(/&/g, "&amp;").replace(/'/g, "&#39;").replace(/</g, "&lt;");
const text = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

export function indexHtml({ width, height, total, theme, mounts, language = "en", title = "Video" }) {
  const hosts = mounts
    .map(
      (m) =>
        `    <div id="${m.id}" class="clip" data-composition-id="${m.compositionId}" data-composition-src="${m.src}"` +
        ` data-start="${m.start}" data-duration="${m.duration}" data-track-index="1" data-width="${width}" data-height="${height}"` +
        ` data-variable-values='${attr(JSON.stringify(m.vars ?? {}))}' style="${m.style}"></div>`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="${attr(language)}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${width}, height=${height}" />
    <title>${text(title)}</title>
    <style>
${themeCss(theme)
  .split("\n")
  .map((l) => "      " + l)
  .join("\n")}
      html,
      body {
        margin: 0;
        background: var(--bg, #000);
      }
      #main {
        position: relative;
        width: ${width}px;
        height: ${height}px;
        overflow: hidden;
      }
      #main-bg {
        position: absolute;
        inset: 0;
        background: var(--bg, #000);
      }
    </style>
    <script src="gsap.min.js"></script>
  </head>
  <body>
    <div id="main" data-composition-id="main" data-start="0" data-duration="${total}" data-width="${width}" data-height="${height}" data-fps="30">
    <div id="main-bg" class="clip" data-start="0" data-duration="${total}" data-track-index="0"></div>
${hosts}
    <audio id="main-audio" src="vo_bgm.mp3" data-start="0" data-duration="${total}" data-track-index="2"></audio>
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      window.__timelines["main"] = gsap.timeline({ paused: true });
    </script>
  </body>
</html>
`;
}

// Reads scenes.json + sentences.json, checks everything, then writes build/.
// `total` (seconds) is the audio length; measured from the mix when not given.
export async function assemble(projectDir, { env = process.env, total, language, title } = {}) {
  const read = (f, what) => {
    const p = path.join(projectDir, f);
    if (!fs.existsSync(p)) throw new Error(`There is no ${what} yet (${f}).`);
    return JSON.parse(fs.readFileSync(p, "utf8"));
  };
  const table = read("scenes.json", "scene table");
  const sentences = read("sentences.json", "sentence table");
  const scenes = table.scenes ?? [];
  if (!scenes.length) throw new Error("The scene table is empty.");
  const width = table.width ?? 1920;
  const height = table.height ?? 1080;

  const components = new Map();
  const errors = [];
  for (const sc of scenes) {
    if (!components.has(sc.component)) components.set(sc.component, loadComponent(sc.component, { env }));
    const found = checkVars(components.get(sc.component).item, sc.vars);
    if (!found.length) {
      try {
        mountTheme(sc.vars);
      } catch (e) {
        found.push(`${sc.component}: ${e.message}`);
      }
    }
    errors.push(...found);
  }
  if (errors.length) throw new Error(errors.join(" "));
  themeCss(table.theme); // refuse a bad theme before touching build/

  if (total === undefined) total = await duration(path.join(projectDir, "audio", "vo_bgm.mp3"), env);
  total = Math.round(total * 1000) / 1000;
  const times = sceneTimes(scenes, sentences, total);

  const fitted = scenes.map((sc, n) => fitDuration(components.get(sc.component).html, sc.component, times[n].duration));

  const { out } = prepareBuild(projectDir, { env });
  fs.mkdirSync(path.join(out, "compositions", "components"), { recursive: true });
  const mounts = scenes.map((sc, n) => {
    const src = `compositions/components/scene-${n + 1}-${sc.component}.html`;
    fs.writeFileSync(path.join(out, src), fitted[n]);
    return { id: `scene-${n + 1}`, compositionId: sc.component, src, ...mountTheme(sc.vars), ...times[n] };
  });
  fs.writeFileSync(path.join(out, "index.html"), indexHtml({ width, height, total, theme: table.theme, mounts, language, title }));
  return { out, scenes: mounts.length, seconds: total };
}

export { buildDir };
