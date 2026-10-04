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
import { prepareBuild, buildDir, TRANSITIONS_FILE } from "./index.mjs";
import { engineDir } from "../../tools.mjs";
import { duration } from "../../audio.mjs";
import { avatarClips } from "../avatar/index.mjs";
import { cardForPreset, cardTheme, cardFamilies } from "../../brand/card.mjs";
import { fontFaces, categories } from "../../brand/fonts.mjs";
import { sentenceSections } from "../scenes/index.mjs";
import { loadRegistry, planTransitions, transitionBuild, SHADER_FILE } from "../../motion/transitions.mjs";
import { backgroundFor, backgroundPieces, cameraLines } from "../../motion/stage.mjs";

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
  // Other files (fonts and the like) go into build/ at their registry target,
  // where the component's HTML expects them.
  const assets = (item.files ?? []).filter((f) => f !== file).map((f) => {
    if (!/^[a-z0-9-]+(\/[a-z0-9-]+)*\.[a-z0-9]+$/i.test(f.target ?? "")) throw new Error(`${name}: bad file target ${f.target}.`);
    return { from: path.join(dir, f.path), target: f.target };
  });
  return { name, item, html: fs.readFileSync(path.join(dir, file.path), "utf8"), target: file.target, assets };
}

// The component with its authored length replaced by `seconds`. Two places:
//   - the attributes: data-composition-duration on <html>, and every
//     data-duration equal to the authored length (the template root and the
//     clip), so the clip stays visible for the whole scene;
//   - the script: every component reads its length from root.dataset.duration,
//     but the runtime strips the mounted root's attributes (id,
//     data-composition-id, data-duration), so the script would fall back to
//     its authored default and leave the scene early (measured: titlecard-calm
//     exits at 3.5 s of a 7.3 s scene). root.dataset.duration becomes the
//     scene length as a string literal, which every one of the reads accepts.
// A component with timed parts of another length, or one that never reads
// root.dataset.duration, cannot be stretched safely, so it is refused.
export function fitDuration(html, name, seconds) {
  const m = /<div[^>]*\bid="root"[^>]*\bdata-duration="([\d.]+)"/.exec(html) ?? /data-composition-duration="([\d.]+)"/.exec(html);
  if (!m) throw new Error(`${name}: no authored length, so it cannot be fitted to the scene.`);
  const authored = m[1];
  const others = [...html.matchAll(/data-duration="([\d.]+)"/g)].filter((x) => x[1] !== authored);
  if (others.length) throw new Error(`${name}: has timed parts of other lengths (${others.map((x) => x[1]).join(", ")}), so its length cannot be fitted.`);
  if (!html.includes("root.dataset.duration")) throw new Error(`${name}: its script does not read root.dataset.duration, so its length cannot be fitted.`);
  const s = String(seconds);
  return html
    .replace(/data-composition-duration="[\d.]+"/, `data-composition-duration="${s}"`)
    .replaceAll(`data-duration="${authored}"`, `data-duration="${s}"`)
    .replaceAll("root.dataset.duration", JSON.stringify(s));
}

// The component with its ground see-through, for a build with a background
// component under the scenes (motion/stage.mjs). HyperFrames scene components
// paint their own full-frame ground in the theme's --bg (on #root or on their
// "-clip" layer); that rule, and only its background, is overridden, so the
// background shows through and everything else stays as authored (text,
// cards and shadows keep using --bg). Returns the selectors it changed.
export function transparentGround(html) {
  const grounds = [];
  for (const m of html.matchAll(/(^|[\s}])(#root|\.[A-Za-z0-9_-]+-clip)\s*\{([^{}]*)\}/g)) {
    if (/(^|[;\s])background\s*:[^;]*var\(--bg\b/.test(m[3]) && !grounds.includes(m[2])) grounds.push(m[2]);
  }
  if (!grounds.length) return { html, grounds };
  const css = `<style data-itv-ground>${grounds.map((g) => `${g} { background: transparent !important; }`).join(" ")}</style>`;
  const root = /<div[^>]*\bid="root"[^>]*>/.exec(html);
  if (!root) return { html, grounds: [] };
  const at = root.index + root[0].length;
  return { html: html.slice(0, at) + css + html.slice(at), grounds };
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

// The video look until the Brand wizard (DECISIONS 59): config.brand.preset,
// which onboarding already sets to "blue-professional". That HyperFrames preset
// (Apache-2.0, FRAME.md at the library's pinned commit, skills/hyperframes-
// creative/frame-presets/blue-professional) mapped onto the components' tokens:
// cream canvas, cobalt as the only accent (so all three accent choices are
// cobalt, as the preset asks), tinted cards without shadow, Space Grotesk for
// display, Inter for body. The preset's card fill and border are 4% and 20%
// cobalt over the canvas; here they are the same colors made opaque, because
// constellation-hub draws its lines behind the cards.
export const BLUE_PROFESSIONAL = {
  bg: "#fdfae7",
  fg: "#111111",
  muted: "#6b6b6b",
  surface: "#f4f2e8",
  border: "#d0d1eb",
  brand: "#1e2bfa",
  accent: "#1e2bfa",
  "accent-2": "#1e2bfa",
  radius: "14px",
  "font-display": "'Space Grotesk', Inter, system-ui, sans-serif",
  "font-body": "Inter, system-ui, sans-serif",
  "font-mono": "ui-monospace, Consolas, monospace",
};

// A look is what the build is themed with. Since the Brand wizard it comes
// resolved from the Identity's Brand Identity Card (main.mjs lookOf):
// { theme, families, light }. A plain name still works: a preset id (its
// card, runner/brand/card.mjs) or "dark", the pilot's theme kept for tests.
export const LOOKS = { "blue-professional": BLUE_PROFESSIONAL, dark: DEFAULT_THEME };
export const DEFAULT_LOOK = "blue-professional";

export function resolveLook(look = DEFAULT_LOOK) {
  if (look && typeof look === "object") return look;
  if (look === "dark") return { theme: DEFAULT_THEME, families: ["Inter"], light: false };
  const card = cardForPreset(look);
  return { theme: cardTheme(card, categories()), families: cardFamilies(card), light: card.appearance === "light" };
}
export const baseTheme = (look) => resolveLook(look).theme;
export const isLightLook = (look) => resolveLook(look).light;

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
export function themeCss(theme = {}, base = DEFAULT_THEME) {
  const lines = [];
  for (const k of Object.keys(theme)) {
    if (!THEME_KEYS.includes(k)) throw new Error(`Unknown theme value: ${k} (known: ${THEME_KEYS.join(", ")}).`);
  }
  for (const [k, v] of Object.entries({ ...base, ...theme })) {
    if (typeof v !== "string" || !v.trim() || /[;{}<>\\]/.test(v)) throw new Error(`Theme ${k}: not a usable CSS value.`);
    lines.push(`  --itv-${k}: ${v.trim()};`, `  --${k}: var(--itv-${k});`);
  }
  return `:root {\n${lines.join("\n")}\n}`;
}

const attr = (s) => String(s).replace(/&/g, "&amp;").replace(/'/g, "&#39;").replace(/</g, "&lt;");
const text = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

// An avatar clip (gate 5) over its scene, muted (the narration already plays
// from vo_bgm.mp3), above the scenes, placed by its layout (avatar/index.mjs):
//   full     the whole frame
//   cutout   the person on a transparent background (WebM alpha), standing on
//            the bottom edge (or hanging from the top), a 3:4 box
//   circle   the face in a circle, a thin theme-color ring
//   card     a 4:5 card with rounded corners and a soft shadow
// Boxes are sized from the frame height; the clip always keeps its own
// proportions (object-fit: cover crops, it never stretches).
const AVATAR_BOX = {
  cutout: { ratio: 3 / 4, h: { small: 0.42, medium: 0.56, large: 0.7 }, edge: 0 },
  circle: { ratio: 1, h: { small: 0.24, medium: 0.32, large: 0.42 }, edge: 0.04 },
  card: { ratio: 4 / 5, h: { small: 0.34, medium: 0.44, large: 0.56 }, edge: 0.04 },
};

export function avatarStyle(layout = {}, width = 1920, height = 1080) {
  const style = layout.style ?? "full";
  if (style === "full" || !AVATAR_BOX[style]) return "position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover;z-index:5";
  const box = AVATAR_BOX[style];
  const h = Math.round(height * (box.h[layout.size] ?? box.h.medium));
  const w = Math.round(h * box.ratio);
  const side = Math.round(width * 0.03);
  const edge = Math.round(height * box.edge);
  const [v, hz] = String(layout.position ?? "bottom-right").split("-");
  const place = `${v === "top" ? "top" : "bottom"}:${edge}px;${hz === "left" ? "left" : "right"}:${side}px`;
  const shape =
    style === "circle"
      ? "border-radius:50%;object-position:50% 30%;box-shadow:0 0 0 6px var(--itv-brand),0 12px 40px rgba(0,0,0,0.25)"
      : style === "card"
        ? "border-radius:24px;object-position:50% 25%;box-shadow:0 16px 48px rgba(0,0,0,0.28)"
        : "object-position:50% 100%";
  return `position:absolute;${place};width:${w}px;height:${h}px;object-fit:cover;${shape};z-index:5`;
}

export const avatarVideo = (a, width = 1920, height = 1080) =>
  `    <video id="avatar-${a.name}" src="${a.file}" muted data-volume="0" data-start="${a.start}" data-duration="${a.duration}" data-track-index="3" style="${avatarStyle(a.layout, width, height)}"></video>`;

// Motion (the Identity's Motion profile, motion/): `motion` is null for a
// build without one, and then the page is exactly what it was before the
// Motion wizard. Otherwise:
//   mounts[].track      scenes alternate between two tracks where they overlap
//   mounts[].camera     a camera wrapper id around the scene
//   backgrounds         background component pieces on track 0 (no #main-bg)
//   lines               GSAP lines for the main timeline (transitions, camera)
//   shader              HyperShader.init config, or null
const hostHtml = (m, width, height, motion) => {
  // The shader package finds the scenes by their class.
  const cls = motion?.shader ? "clip scene" : "clip";
  const host =
    `<div id="${m.id}" class="${cls}" data-composition-id="${m.compositionId}" data-composition-src="${m.src}"` +
    ` data-start="${m.start}" data-duration="${m.duration}" data-track-index="${m.track ?? 1}" data-width="${width}" data-height="${height}"` +
    ` data-variable-values='${attr(JSON.stringify(m.vars ?? {}))}' style="${m.style}"></div>`;
  if (!m.camera) return `    ${host}`;
  return [`    <div id="${m.camera}" class="itv-cam" style="position:absolute;inset:0;transform-origin:50% 50%">`, `      ${host}`, `    </div>`].join(NL);
};
const NL = "\n";

export function indexHtml({ width, height, total, theme, look, mounts, avatars = [], language = "en", title = "Video", fontCss = "", motion = null }) {
  const hosts = mounts.map((m) => hostHtml(m, width, height, motion)).join(NL);
  const ground = motion?.backgrounds?.length
    ? motion.backgrounds
        .map(
          (b) =>
            `    <div id="${b.id}" class="clip" data-composition-id="${b.compositionId}" data-composition-src="${b.src}"` +
            ` data-start="${b.start}" data-duration="${b.duration}" data-track-index="0" data-width="${width}" data-height="${height}"` +
            ` data-variable-values='${attr(JSON.stringify(b.vars ?? {}))}' style="${b.style}"></div>`,
        )
        .join(NL)
    : `    <div id="main-bg" class="clip" data-start="0" data-duration="${total}" data-track-index="0"></div>`;
  const shaderTag = motion?.shader ? `${NL}    <script src="${SHADER_FILE}"></script>` : "";
  const extra = motion
    ? [
        `      var tl = window.__timelines["main"];`,
        ...(motion.lines ?? []).map((l) => "      " + l),
        ...(motion.shader ? [`      HyperShader.init(Object.assign(${JSON.stringify(motion.shader)}, { timeline: tl }));`] : []),
      ].join(NL) + NL
    : "";
  return `<!doctype html>
<html lang="${attr(language)}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${width}, height=${height}" />
    <title>${text(title)}</title>
    <style>
${[fontCss, themeCss(theme, baseTheme(look))]
  .filter(Boolean)
  .join("\n")
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
    <script src="gsap.min.js"></script>${shaderTag}
  </head>
  <body>
    <div id="main" data-composition-id="main" data-start="0" data-duration="${total}" data-width="${width}" data-height="${height}" data-fps="30">
${ground}
${hosts}
${avatars.map((a) => avatarVideo(a, width, height)).join("\n")}
    <audio id="main-audio" src="vo_bgm.mp3" data-start="0" data-duration="${total}" data-track-index="2"></audio>
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      window.__timelines["main"] = gsap.timeline({ paused: true });
${extra}    </script>
  </body>
</html>
`;
}

// The Motion profile's part of a build (motion/): scene changes, camera
// wrappers, background pieces. `sectionStarts`: the scenes that open a new
// script section (the topic changes of HyperFrames' narrative positions).
export function motionPlan(profile, { times, theme, light, width, height, sectionStarts = new Set(), env = process.env }) {
  const dir = libraryDir(env);
  const registry = loadRegistry(dir);
  const ids = times.map((_, n) => `scene-${n + 1}`);
  const plan = planTransitions(times, { transition: profile.transition, registry, sectionStarts });
  const built = transitionBuild(times, plan, { ids, registry, theme, width, height });
  const move = profile.camera?.move ?? "off";
  const cameras = times.map((t, n) => (move === "off" ? null : `cam-${n + 1}`));
  const lines = [...built.lines];
  times.forEach((t, n) => {
    if (cameras[n]) lines.push(...cameraLines(move, { id: cameras[n], start: t.start, duration: t.duration + built.extend[n], index: n }));
  });
  const bg = backgroundFor(profile.background, { light });
  return { plan, extend: built.extend, shader: built.shader, lines, cameras, background: bg, notes: bg.note ? [bg.note] : [] };
}

// Which scenes open a new script section (by their first sentence).
export function sectionStartsOf(projectDir, scenes, sentences) {
  const md = path.join(projectDir, "script.md");
  if (!fs.existsSync(md)) return new Set();
  const sections = sentenceSections(fs.readFileSync(md, "utf8"), sentences);
  const index = new Map(sentences.map((s, i) => [s.id, i]));
  const starts = new Set();
  scenes.forEach((sc, n) => {
    const i = index.get(sc.from);
    if (n > 0 && i > 0 && sections[i] !== sections[i - 1]) starts.add(n);
  });
  return starts;
}

// Reads scenes.json + sentences.json, checks everything, then writes build/.
// `total` (seconds) is the audio length; measured from the mix when not given.
// `motion`: the Identity's Motion profile (motion/profile.mjs), or null; it
// may also come on the look (main.mjs lookOf). `sectionStarts` overrides the
// sections read from script.md (the previews).
export async function assemble(projectDir, { env = process.env, total, language, title, look: wanted = DEFAULT_LOOK, motion, sectionStarts } = {}) {
  const look = resolveLook(wanted);
  const profile = motion !== undefined ? motion : look.motion ?? null;
  const read = (f, what) => {
    const p = path.join(projectDir, f);
    if (!fs.existsSync(p)) throw new Error(`There is no ${what} yet (${f}).`);
    return JSON.parse(fs.readFileSync(p, "utf8"));
  };
  const table = read("scenes.json", "scene table");
  const sentences = read("sentences.json", "sentence table");
  // The profile's style settings win over the scene table's (the user chose
  // them in the Motion wizard).
  const scenes = (table.scenes ?? []).map((sc) => (profile?.scenes?.style?.[sc.component] ? { ...sc, vars: { ...(sc.vars ?? {}), ...profile.scenes.style[sc.component] } } : sc));
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
  themeCss(table.theme, baseTheme(look)); // refuse a bad theme before touching build/

  if (total === undefined) total = await duration(path.join(projectDir, "audio", "vo_bgm.mp3"), env);
  total = Math.round(total * 1000) / 1000;
  const times = sceneTimes(scenes, sentences, total);

  const mp = profile
    ? motionPlan(profile, {
        times,
        theme: { ...baseTheme(look), ...(table.theme ?? {}) },
        light: Boolean(look.light),
        width,
        height,
        sectionStarts: sectionStarts ?? sectionStartsOf(projectDir, scenes, sentences),
        env,
      })
    : null;
  const r3 = (x) => Math.round(x * 1000) / 1000;
  const ext = (n) => (mp ? mp.extend[n] : 0);
  // A scene that holds past its end (its outgoing transition) is fitted to
  // the longer length, so it stays visible under the incoming one.
  const bgPieces = mp?.background.component ? backgroundPieces(total) : [];
  const bgComponent = bgPieces.length ? loadComponent(mp.background.component, { env }) : null;
  // With a background under them, the scenes' own grounds are see-through.
  const fitted = scenes.map((sc, n) => {
    const html = fitDuration(components.get(sc.component).html, sc.component, r3(times[n].duration + ext(n)));
    return bgComponent ? transparentGround(html).html : html;
  });
  const avatars = avatarClips(projectDir); // throws if they belong to an earlier voice

  const { out } = prepareBuild(projectDir, { env });
  fs.mkdirSync(path.join(out, "compositions", "components"), { recursive: true });
  for (const c of components.values()) {
    for (const a of c.assets) {
      fs.mkdirSync(path.dirname(path.join(out, a.target)), { recursive: true });
      fs.copyFileSync(a.from, path.join(out, a.target));
    }
  }
  // Overlapping neighbours never share a track (HyperFrames lint), so with
  // transitions the scenes alternate between tracks 1 and 4.
  const overlap = Boolean(mp && mp.extend.some((x) => x > 0));
  const mounts = scenes.map((sc, n) => {
    const src = `compositions/components/scene-${n + 1}-${sc.component}.html`;
    fs.writeFileSync(path.join(out, src), fitted[n]);
    const m = { id: `scene-${n + 1}`, compositionId: sc.component, src, ...mountTheme(sc.vars), ...times[n] };
    if (mp) {
      m.duration = r3(times[n].duration + ext(n));
      if (overlap) m.track = n % 2 === 0 ? 1 : 4;
      if (mp.cameras[n]) m.camera = mp.cameras[n];
    }
    return m;
  });
  const backgrounds = bgPieces.map((p, k) => {
    const src = `compositions/components/background-${k + 1}-${bgComponent.name}.html`;
    fs.writeFileSync(path.join(out, src), fitDuration(bgComponent.html, bgComponent.name, p.duration));
    return { id: `background-${k + 1}`, compositionId: bgComponent.name, src, ...mountTheme(mp.background.vars), ...p };
  });
  if (mp?.shader) fs.copyFileSync(path.join(engineDir(env), "node_modules", "@hyperframes", "shader-transitions", "dist", "index.global.js"), path.join(out, SHADER_FILE));
  // The look's fonts, local: no font is fetched while rendering.
  const fonts = fontFaces(look.families ?? [], { dir: libraryDir(env) });
  for (const f of fonts.files) {
    fs.mkdirSync(path.dirname(path.join(out, f.to)), { recursive: true });
    fs.copyFileSync(f.from, path.join(out, f.to));
  }
  for (const a of avatars) {
    fs.mkdirSync(path.join(out, "avatar"), { recursive: true });
    fs.copyFileSync(path.join(projectDir, a.file), path.join(out, a.file));
  }
  const motionPart = mp ? { lines: mp.lines, shader: mp.shader, backgrounds } : null;
  if (mp) {
    const windows = mp.plan.map((p, k) => ({ at: times[k + 1].start, seconds: mp.extend[k], type: p.type })).filter((w) => w.seconds > 0);
    fs.writeFileSync(path.join(out, TRANSITIONS_FILE), JSON.stringify(windows, null, 2) + "\n");
  }
  fs.writeFileSync(path.join(out, "index.html"), indexHtml({ width, height, total, theme: table.theme, look, mounts, avatars, language, title, fontCss: fonts.css, motion: motionPart }));
  return { out, scenes: mounts.length, seconds: total, notes: mp?.notes ?? [], transitions: mp?.plan ?? [] };
}

export { buildDir };
