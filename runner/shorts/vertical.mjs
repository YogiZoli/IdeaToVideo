// shorts/vertical.mjs: the 9:16 layout of every style preset (FIX_PLAN 2026-11-19, item 2,
// DECISIONS 188). Own code, clean room. The 16:9 scenes are drawn on a fixed 1920x1080 stage, so a
// Short does not squeeze them: each scene of the approved table becomes its own vertical screen,
// drawn here from what the scene says (the template's params, or its words), in the preset's skin:
// its colours and fonts (the build's theme), its ground and its motif (a glass card, a turning
// cube, the stick figure, torn paper, a case file, clay).
//
// One idea per screen: a scene that spans several sentences shows one screen per sentence. Bigger
// text, words that pop in one by one, an icon from the bundled sets drawn stroke by stroke, gentle
// motion everywhere (a slow push, floating shapes). Nothing important in the lower 20 percent or
// the right 12 percent (shorts/index.mjs SAFE). The captions sit in the middle third, the word
// being said in the brand colour.
//
// Every screen is a self-contained HyperFrames sub-composition: one paused GSAP timeline, no
// random numbers, no clock, so a seek anywhere draws the same frame.

import { FORMATS, safeBox, middleThird } from "./index.mjs";

const W = FORMATS.short.width;
const H = FORMATS.short.height;
const BOX = safeBox(FORMATS.short);
const MID = middleThird(FORMATS.short);
// where things go, inside the safe box
export const ZONES = {
  visual: { top: 190, bottom: 640 },
  phrase: { top: 670, bottom: 960 },
  captions: { top: 1000, bottom: MID.bottom - 20 },
};

const r3 = (x) => Math.round(x * 1000) / 1000;
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---- the preset skins -------------------------------------------------------------------

// k: the display face's average advance per letter in em (fits a line without measuring it).
export const SKINS = {
  "motion-frames": { k: 0.56, ground: "orbs", motif: "glass", caps: false },
  "explainer-3d": { k: 0.55, ground: "iso", motif: "cube", caps: false },
  "stick-world": { k: 0.58, ground: "paper", motif: "stick", caps: false },
  "archive-collage": { k: 0.7, ground: "aged", motif: "torn", caps: true },
  "night-case-file": { k: 0.44, ground: "night", motif: "file", caps: true },
  "soft-clay": { k: 0.56, ground: "clay", motif: "blob", caps: false },
};
export const DEFAULT_SKIN = "motion-frames";
export const skinOf = (preset) => ({ id: SKINS[preset] ? preset : DEFAULT_SKIN, ...(SKINS[preset] ?? SKINS[DEFAULT_SKIN]) });

// ---- what a scene says ------------------------------------------------------------------

const STOP = new Set("a an the and or but so of to in on at for with from by is are was were be been it its this that these those there here we you i he she they them his her our your their my me us as than then just very really also about into over".split(" "));

/** A sentence as its key words, never cut in the middle: whole when short, else its words that carry meaning. */
export function keyWords(sentence, max = 7) {
  const words = String(sentence ?? "").replace(/[.,!?;:"“”]+/g, " ").split(/\s+/).filter(Boolean);
  if (words.length <= max) return words.join(" ");
  // the first clause, when it is short enough
  const clause = String(sentence).split(/[,;:]/)[0].trim().split(/\s+/).filter(Boolean);
  if (clause.length >= 3 && clause.length <= max) return clause.join(" ").replace(/[.!?]+$/, "");
  const kept = words.filter((w) => !STOP.has(w.toLowerCase()));
  return (kept.length ? kept : words).slice(0, max).join(" ");
}

const str = (v) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const firstOf = (o, ...ids) => ids.map((id) => str(o[id])).find(Boolean) ?? "";

/**
 * The layout and words of one scene, from its template's params (or its component's vars).
 * `said`: what the voice says in it. Returns { layout, ... } for drawScreen.
 */
export function contentOf(sc, said) {
  const p = { ...(sc.vars ?? {}), ...(sc.params ?? {}) };
  const t = String(sc.template ?? "");
  // "none" is a preset's neutral object: it names no thing to draw
  const named = (id) => (str(p[id]) && str(p[id]).toLowerCase() !== "none" ? str(p[id]) : "");
  const icon = ["object", "fromObject", "leftObject", "smallObject", "object1", "icon"].map(named).find(Boolean) || null;
  const items = ["step1", "step2", "step3", "step4", "item1", "item2", "item3", "item4", "outer", "middle", "inner"].map((id) => str(p[id])).filter(Boolean);
  if (sc.component === "cta-close" || t === "cta") return { layout: "cta", line: firstOf(p, "action_line", "line") || keyWords(said), button: firstOf(p, "button_label") || null, icon: "message" };
  if (typeof p.value === "number" || (str(p.value) && Number.isFinite(Number(p.value)))) {
    const value = Number(p.value);
    if (t === "percent") return { layout: "percent", value, line: keyWords(said, 6), icon };
    return { layout: "number", value, before: str(p.before), after: str(p.after), line: firstOf(p, "line") || keyWords(said, 6), year: t === "year", icon };
  }
  if (items.length >= 2) return { layout: "list", items: items.slice(0, 4), icon };
  if (str(p.left) && str(p.right)) return { layout: "versus", top: str(p.left), bottom: str(p.right), tag: str(p.word) || "vs", icon };
  if (str(p.start) && str(p.good)) return { layout: "versus", top: str(p.good), bottom: str(p.bad) || str(p.start), tag: "or", icon };
  if (str(p.small) && str(p.big)) return { layout: "versus", top: str(p.small), bottom: str(p.big), tag: "vs", icon };
  if (firstOf(p, "from", "fromLabel", "fromPlace") && firstOf(p, "to", "toLabel", "toPlace")) return { layout: "flow", from: firstOf(p, "from", "fromLabel", "fromPlace"), to: firstOf(p, "to", "toLabel", "toPlace"), icon };
  if (str(p.question)) return { layout: "question", text: str(p.question), icon: icon || "help-circle" };
  if (str(p.word)) return { layout: "word", text: str(p.word), icon };
  if (str(p.said)) return { layout: "bubble", text: str(p.said), kind: "talk", icon };
  if (t === "thought" && str(p.line)) return { layout: "bubble", text: str(p.line), kind: "thought", icon };
  if (str(p.line) && str(p.mark)) return { layout: "lines", line1: str(p.line), mark: str(p.mark), icon };
  if (str(p.line1)) return { layout: "lines", line1: str(p.line1), line2: str(p.line2), icon };
  if (str(p.headline)) return { layout: "title", text: str(p.headline), kicker: str(p.kicker), icon, walk: t === "chapter" };
  const any = firstOf(p, "line", "text", "caption", "label", "headline", "wordmark");
  return { layout: "lines", line1: any || keyWords(said), icon, walk: t === "walk" };
}

// ---- fitting the words ------------------------------------------------------------------

/** The biggest size from `sizes` at which the words fit `maxLines` lines of `width` px. */
export function fitText(text, { width = BOX.width, k = 0.56, sizes = [150, 136, 124, 112, 100, 90, 80, 72, 64, 56], maxLines = 3, height = Infinity } = {}) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const len = (w) => [...w].length;
  for (const size of sizes) {
    const per = Math.floor(width / (size * k));
    if (words.some((w) => len(w) > per)) continue;
    let lines = 1;
    let used = 0;
    for (const w of words) {
      if (used && used + 1 + len(w) > per) {
        lines++;
        used = len(w);
      } else used += (used ? 1 : 0) + len(w);
    }
    if (lines <= maxLines && lines * size * 1.1 <= height) return { size, lines };
  }
  return { size: sizes[sizes.length - 1], lines: maxLines };
}

// ---- the parts of a screen ----------------------------------------------------------------

const iconSvg = (icon, { size, cls = "vs-icon", stroke = "var(--brand)" }) =>
  icon?.d?.length
    ? `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${icon.d.map((d) => `<path pathLength="1" d="${esc(d)}"/>`).join("")}</svg>`
    : "";

// The words of a line as spans that pop in one by one; `mark`: the word in the brand colour.
function wordSpans(text, { mark = "", cls = "vs-w" } = {}) {
  const m = mark.toLowerCase();
  return String(text)
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `<span class="${cls}${m && w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "") === m.replace(/[^\p{L}\p{N}]/gu, "") ? " vs-mark" : ""}">${esc(w)}</span>`)
    .join(" ");
}

function phraseHtml(text, skin, { mark = "", top = ZONES.phrase.top, maxLines = 3, sizes } = {}) {
  const shown = skin.caps ? String(text).toUpperCase() : String(text);
  const { size } = fitText(shown, { k: skin.k, maxLines, height: ZONES.phrase.bottom - top, ...(sizes ? { sizes } : {}) });
  return `<div class="vs-phrase" style="top:${top}px;font-size:${size}px">${wordSpans(shown, { mark: skin.caps ? mark.toUpperCase() : mark })}</div>`;
}

// The stick figure (stick-world's character): drawn by code, its pose by the layout.
function stickFigure(pose) {
  return `<svg class="vs-stick" data-pose="${pose}" width="300" height="420" viewBox="0 0 300 420" fill="none" stroke="var(--fg)" stroke-width="12" stroke-linecap="round" stroke-linejoin="round">
  <g class="vs-stick-body">
    <circle cx="150" cy="70" r="40" fill="var(--bg)"/>
    <line x1="150" y1="110" x2="150" y2="260"/>
    <g class="vs-arm-l"><line x1="150" y1="150" x2="90" y2="215"/></g>
    <g class="vs-arm-r"><line x1="150" y1="150" x2="210" y2="215"/></g>
    <g class="vs-leg-l"><line x1="150" y1="260" x2="108" y2="380"/></g>
    <g class="vs-leg-r"><line x1="150" y1="260" x2="192" y2="380"/></g>
  </g>
</svg>`;
}

// The visual of a screen in its skin's motif: the icon, the number, the figure.
function motifHtml(skin, c, icon, n) {
  const ic = iconSvg(icon, { size: 230 });
  const top = ZONES.visual.top;
  const h = ZONES.visual.bottom - ZONES.visual.top;
  const center = BOX.left + BOX.width / 2;
  if (skin.motif === "stick") {
    const pose = c.layout === "question" ? "shrug" : c.layout === "word" || c.layout === "number" || c.layout === "percent" ? "jump" : c.walk || c.layout === "flow" || c.layout === "list" ? "walk" : c.layout === "bubble" ? "think" : "wave";
    const sign = icon?.d?.length ? `<div class="vs-sign" style="left:${center + 40}px;top:${top + 60}px">${iconSvg(icon, { size: 170 })}</div>` : "";
    return `<div class="vs-motif vs-figure" style="left:${center - (sign ? 300 : 150)}px;top:${top}px">${stickFigure(pose)}</div>${sign}<div class="vs-floor" style="top:${top + 420}px"></div>`;
  }
  if (!ic) return "";
  const size = Math.min(h, 400);
  const box = `left:${center - size / 2}px;top:${top + (h - size) / 2}px;width:${size}px;height:${size}px`;
  if (skin.motif === "cube")
    return `<div class="vs-motif vs-cube-wrap" style="${box}"><div class="vs-cube"><div class="vs-face vs-f1">${ic}</div><div class="vs-face vs-f2"></div><div class="vs-face vs-f3"></div></div></div>`;
  if (skin.motif === "torn") return `<div class="vs-motif vs-torn" style="${box};transform:rotate(${n % 2 ? 3 : -3}deg)"><div class="vs-tape"></div>${ic}</div>`;
  if (skin.motif === "file") return `<div class="vs-motif vs-file" style="${box}"><div class="vs-tab">FILE ${String(n).padStart(2, "0")}</div>${ic}</div>`;
  if (skin.motif === "blob") return `<div class="vs-motif vs-blob" style="${box}">${ic}</div>`;
  return `<div class="vs-motif vs-glass" style="${box}">${ic}</div>`;
}

// What the screen says, in its layout.
function bodyHtml(skin, c, icon, n) {
  const center = BOX.left + BOX.width / 2;
  switch (c.layout) {
    case "number":
    case "percent": {
      const end = Number(c.value);
      const digits = String(Math.round(Math.abs(end))).length + (c.layout === "percent" ? 1 : 0);
      const size = Math.min(360, Math.floor(BOX.width / (Math.max(2, digits) * 0.62)));
      const ring = c.layout === "percent" ? `<svg class="vs-ring" width="520" height="520" viewBox="0 0 100 100" style="left:${center - 260}px;top:${ZONES.visual.top - 40}px"><circle cx="50" cy="50" r="44" fill="none" stroke="var(--border)" stroke-width="5"/><circle class="vs-ring-on" cx="50" cy="50" r="44" fill="none" stroke="var(--brand)" stroke-width="5" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100" transform="rotate(-90 50 50)" data-to="${Math.max(0, Math.min(100, end))}"/></svg>` : "";
      const label = [c.before, c.after].filter(Boolean).join(" ");
      return `${ring}<div class="vs-number" data-end="${end}" data-year="${c.year ? 1 : 0}" data-pct="${c.layout === "percent" ? 1 : 0}" style="top:${ZONES.visual.top + (c.layout === "percent" ? 90 : 40)}px;font-size:${size}px">0</div>${label ? `<div class="vs-kicker" style="top:${ZONES.visual.top + 20}px">${esc(label)}</div>` : ""}${phraseHtml(c.line, skin, { maxLines: 2, sizes: [96, 88, 80, 72, 64] })}`;
    }
    case "list": {
      const rows = c.items.map((it, k) => `<div class="vs-row" style="top:${ZONES.visual.top + k * 182}px"><span class="vs-num">${k + 1}</span><span class="vs-item">${esc(skin.caps ? it.toUpperCase() : it)}</span></div>`).join("");
      return rows;
    }
    case "versus": {
      const card = (text, k) => {
        const { size } = fitText(skin.caps ? text.toUpperCase() : text, { width: BOX.width - 80, k: skin.k, maxLines: 2, sizes: [96, 86, 76, 68, 60, 52] });
        return `<div class="vs-card vs-card-${k}" style="top:${k ? 560 : 200}px;font-size:${size}px">${esc(skin.caps ? text.toUpperCase() : text)}</div>`;
      };
      return `${card(c.top, 0)}<div class="vs-tag" style="top:${468}px;left:${center - 60}px">${esc(c.tag)}</div>${card(c.bottom, 1)}`;
    }
    case "flow": {
      const one = (text, top) => {
        const { size } = fitText(skin.caps ? text.toUpperCase() : text, { width: BOX.width - 80, k: skin.k, maxLines: 2, sizes: [96, 86, 76, 68, 60] });
        return `<div class="vs-card" style="top:${top}px;font-size:${size}px">${esc(skin.caps ? text.toUpperCase() : text)}</div>`;
      };
      return `${one(c.from, 190)}<svg class="vs-arrow" width="120" height="200" viewBox="0 0 120 200" style="left:${center - 60}px;top:${400}px" fill="none" stroke="var(--brand)" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"><path pathLength="1" d="M60 10 V170 M20 130 L60 172 L100 130"/></svg>${one(c.to, 620)}`;
    }
    case "bubble": {
      const { size } = fitText(c.text, { width: BOX.width - 120, k: skin.k, maxLines: 4, height: 270, sizes: [84, 76, 68, 60, 54, 48] });
      return `<div class="vs-bubble vs-${c.kind}" style="top:${ZONES.phrase.top - 40}px;font-size:${size}px">${wordSpans(c.text)}</div>${motifHtml(skin, c, icon, n)}`;
    }
    case "question":
      return `${motifHtml(skin, c, icon, n)}${phraseHtml(c.text.replace(/\?*$/, "?"), skin, { maxLines: 3 })}`;
    case "word":
      return `${motifHtml(skin, c, icon, n)}${phraseHtml(c.text, skin, { maxLines: 2, mark: c.text.split(/\s+/)[0], sizes: [220, 200, 180, 160, 140, 124, 110, 96] })}`;
    case "cta":
      return `${motifHtml(skin, c, icon, n)}${phraseHtml(c.line, skin, { maxLines: 3, sizes: [104, 94, 84, 76, 68, 60] })}${c.button ? `<div class="vs-button" style="top:${ZONES.phrase.bottom + 10}px">${esc(c.button)}</div>` : ""}`;
    case "title":
      return `${motifHtml(skin, c, icon, n)}${c.kicker ? `<div class="vs-kicker" style="top:${ZONES.phrase.top - 70}px">${esc(c.kicker)}</div>` : ""}${phraseHtml(c.text, skin, { maxLines: 3 })}`;
    default: {
      const line = [c.line1, c.line2].filter(Boolean).join(" ");
      return `${motifHtml(skin, c, icon, n)}${phraseHtml(line, skin, { maxLines: 3, mark: c.mark || (c.line2 ? c.line2.split(/\s+/).slice(-1)[0] : "") })}`;
    }
  }
}

function groundHtml(skin) {
  switch (skin.ground) {
    case "orbs":
      return `<div class="vs-ground vs-g-orbs"><div class="vs-orb vs-o1"></div><div class="vs-orb vs-o2"></div><div class="vs-dots"></div></div>`;
    case "iso":
      return `<div class="vs-ground vs-g-iso"><div class="vs-floorgrid"></div><div class="vs-orb vs-o1"></div></div>`;
    case "paper":
      return `<div class="vs-ground vs-g-paper"><svg class="vs-hills" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" stroke="color-mix(in srgb,var(--fg) 14%,transparent)" stroke-width="5" stroke-linecap="round"><path d="M-20 1700 C 200 1620 380 1640 560 1700 S 900 1760 1100 1680"/><circle cx="880" cy="170" r="46"/></svg></div>`;
    case "aged":
      return `<div class="vs-ground vs-g-aged"><svg class="vs-maplines" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" stroke="var(--border)" stroke-width="2" opacity="0.55"><path d="M-40 300 C 240 220 420 420 700 330 S 1000 260 1140 360"/><path d="M-40 1500 C 200 1400 480 1620 760 1500 S 1020 1420 1140 1520"/><path d="M120 -40 C 200 400 60 800 180 1200 S 120 1700 220 1980"/></svg><div class="vs-specks"></div></div>`;
    case "night":
      return `<div class="vs-ground vs-g-night"><svg class="vs-grain" width="${W}" height="${H}"><filter id="vsgrain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7"/></filter><rect width="100%" height="100%" filter="url(#vsgrain)" opacity="0.13"/></svg><div class="vs-sweep"></div><div class="vs-vignette"></div></div>`;
    case "clay":
      return `<div class="vs-ground vs-g-clay"><div class="vs-clayball vs-b1"></div><div class="vs-clayball vs-b2"></div><div class="vs-clayball vs-b3"></div></div>`;
    default:
      return `<div class="vs-ground"></div>`;
  }
}

// One CSS for every screen of a build (the same rules in every copy).
export const SCREEN_CSS = `
.vs-root{position:absolute;inset:0;width:${W}px;height:${H}px;overflow:hidden;background:var(--bg);color:var(--fg);font-family:var(--font-body),system-ui,sans-serif}
.vs-stage{position:absolute;inset:0;transform-origin:50% 40%}
.vs-ground{position:absolute;inset:0;overflow:hidden}
.vs-content{position:absolute;inset:0}
.vs-phrase{position:absolute;left:${BOX.left}px;width:${BOX.width}px;text-align:center;font-family:var(--font-display),system-ui,sans-serif;font-weight:800;line-height:1.06;letter-spacing:-0.01em;color:var(--fg)}
.vs-w{display:inline-block;opacity:0}
.vs-mark{color:var(--brand);position:relative}
.vs-kicker{position:absolute;left:${BOX.left}px;width:${BOX.width}px;text-align:center;font-size:40px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:var(--muted);opacity:0}
.vs-number{position:absolute;left:${BOX.left}px;width:${BOX.width}px;text-align:center;font-family:var(--font-display),system-ui,sans-serif;font-weight:900;line-height:1;color:var(--brand);letter-spacing:-0.03em;opacity:0}
.vs-ring{position:absolute}
.vs-motif{position:absolute;display:grid;place-items:center;opacity:0}
.vs-icon path{stroke-dasharray:1;stroke-dashoffset:1}
.vs-row{position:absolute;left:${BOX.left}px;width:${BOX.width}px;height:150px;display:flex;align-items:center;gap:28px;padding:0 34px;border-radius:28px;background:var(--surface);border:3px solid var(--border);opacity:0;box-sizing:border-box}
.vs-num{flex:none;width:92px;height:92px;border-radius:50%;display:grid;place-items:center;background:var(--brand);color:var(--bg);font-family:var(--font-display),system-ui,sans-serif;font-weight:900;font-size:54px}
.vs-item{font-family:var(--font-display),system-ui,sans-serif;font-weight:800;font-size:58px;line-height:1.05;color:var(--fg)}
.vs-card{position:absolute;left:${BOX.left}px;width:${BOX.width}px;min-height:240px;display:grid;place-items:center;text-align:center;padding:30px 40px;box-sizing:border-box;border-radius:32px;background:var(--surface);border:4px solid var(--border);font-family:var(--font-display),system-ui,sans-serif;font-weight:800;line-height:1.05;opacity:0}
.vs-card-1{border-color:var(--brand)}
.vs-tag{position:absolute;width:120px;height:120px;border-radius:50%;display:grid;place-items:center;background:var(--brand);color:var(--bg);font-family:var(--font-display),system-ui,sans-serif;font-weight:900;font-size:44px;text-transform:uppercase;opacity:0;z-index:2}
.vs-arrow path{stroke-dasharray:1;stroke-dashoffset:1}
.vs-bubble{position:absolute;left:${BOX.left + 30}px;width:${BOX.width - 60}px;padding:40px 44px;box-sizing:border-box;border-radius:56px;background:var(--surface);border:6px solid var(--fg);text-align:center;font-family:var(--font-display),system-ui,sans-serif;font-weight:700;line-height:1.12;opacity:0}
.vs-thought{border-style:dashed}
.vs-button{position:absolute;left:${BOX.left + BOX.width / 2 - 260}px;width:520px;height:120px;border-radius:60px;display:grid;place-items:center;background:var(--brand);color:var(--bg);font-family:var(--font-display),system-ui,sans-serif;font-weight:900;font-size:56px;opacity:0}
.vs-stick{display:block}
.vs-figure{display:block}
.vs-sign{position:absolute;width:230px;height:230px;display:grid;place-items:center;background:var(--surface);border:6px solid var(--fg);border-radius:24px;opacity:0}
.vs-floor{position:absolute;left:${BOX.left}px;width:${BOX.width}px;height:6px;border-radius:3px;background:var(--fg);opacity:0.85}
.vs-glass{border-radius:64px;background:color-mix(in srgb,var(--surface) 70%,transparent);border:3px solid color-mix(in srgb,var(--brand) 45%,transparent);box-shadow:0 30px 80px rgba(0,0,0,0.35)}
.vs-cube-wrap{perspective:1400px}
.vs-cube{position:relative;width:100%;height:100%;transform-style:preserve-3d;transform:rotateX(-18deg) rotateY(28deg)}
.vs-face{position:absolute;inset:0;display:grid;place-items:center;border-radius:28px;background:var(--surface);border:4px solid var(--border);box-sizing:border-box}
.vs-f1{transform:translateZ(150px)}
.vs-f2{transform:rotateY(90deg) translateZ(150px);background:color-mix(in srgb,var(--brand) 22%,var(--surface))}
.vs-f3{transform:rotateX(90deg) translateZ(150px);background:color-mix(in srgb,var(--accent) 20%,var(--surface))}
.vs-torn{background:var(--surface);box-shadow:0 18px 40px rgba(0,0,0,0.28);clip-path:polygon(0 3%,8% 0,22% 2%,40% 0,58% 3%,76% 0,92% 2%,100% 0,98% 22%,100% 46%,97% 70%,100% 100%,80% 97%,60% 100%,38% 97%,18% 100%,0 97%,3% 72%,0 48%,2% 24%)}
.vs-tape{position:absolute;top:-6px;left:35%;width:30%;height:52px;background:color-mix(in srgb,var(--brand) 55%,transparent);transform:rotate(-4deg)}
.vs-file{background:var(--surface);border:3px solid var(--border);box-shadow:0 0 0 2px rgba(0,0,0,0.4),0 30px 60px rgba(0,0,0,0.5)}
.vs-tab{position:absolute;top:-58px;left:0;padding:10px 26px;background:var(--brand);color:var(--bg);font-family:var(--font-body),monospace;font-weight:700;font-size:34px;letter-spacing:0.14em}
.vs-blob{border-radius:46% 54% 52% 48% / 55% 45% 55% 45%;background:radial-gradient(circle at 34% 30%,color-mix(in srgb,var(--brand) 80%,white),var(--brand) 55%,color-mix(in srgb,var(--brand) 70%,black));box-shadow:inset -24px -30px 60px rgba(0,0,0,0.35),inset 18px 20px 40px rgba(255,255,255,0.18),0 40px 70px rgba(0,0,0,0.45)}
.vs-blob .vs-icon{filter:drop-shadow(0 4px 0 rgba(0,0,0,0.25))}
.vs-g-orbs .vs-orb,.vs-g-iso .vs-orb{position:absolute;border-radius:50%;filter:blur(60px);opacity:0.55}
.vs-o1{width:700px;height:700px;left:-260px;top:-160px;background:var(--brand)}
.vs-o2{width:620px;height:620px;right:-240px;top:1180px;background:var(--accent)}
.vs-dots{position:absolute;inset:0;background-image:radial-gradient(color-mix(in srgb,var(--fg) 16%,transparent) 2px,transparent 2.5px);background-size:54px 54px;opacity:0.5}
.vs-g-iso .vs-o1{opacity:0.25}
.vs-floorgrid{position:absolute;left:-600px;right:-600px;top:1080px;height:1400px;background-image:linear-gradient(var(--border) 3px,transparent 3px),linear-gradient(90deg,var(--border) 3px,transparent 3px);background-size:120px 120px;transform:perspective(900px) rotateX(64deg);transform-origin:50% 0}
.vs-g-paper{background:var(--bg)}
.vs-cloud{position:absolute;height:90px;border-radius:45px;border:6px solid color-mix(in srgb,var(--fg) 30%,transparent)}
.vs-c1{width:260px;left:60px;top:110px}
.vs-c2{width:200px;left:640px;top:1220px}
.vs-g-aged{background:radial-gradient(ellipse at 50% 40%,var(--surface),var(--bg) 75%)}
.vs-specks{position:absolute;inset:0;background-image:radial-gradient(color-mix(in srgb,var(--fg) 22%,transparent) 1.4px,transparent 1.8px),radial-gradient(color-mix(in srgb,var(--fg) 12%,transparent) 1px,transparent 1.5px);background-size:37px 41px,23px 29px;background-position:0 0,11px 17px;opacity:0.6}
.vs-g-night{background:radial-gradient(ellipse at 50% 30%,var(--surface),var(--bg) 70%)}
.vs-grain{position:absolute;inset:0}
.vs-sweep{position:absolute;left:-400px;top:0;width:300px;height:${H}px;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--brand) 10%,transparent),transparent);transform:skewX(-12deg)}
.vs-vignette{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 45%,transparent 45%,rgba(0,0,0,0.65))}
.vs-g-clay{background:radial-gradient(ellipse at 50% 35%,var(--surface),var(--bg) 72%)}
.vs-clayball{position:absolute;border-radius:50%;background:radial-gradient(circle at 35% 30%,color-mix(in srgb,var(--accent) 75%,white),var(--accent) 50%,color-mix(in srgb,var(--accent) 60%,black));box-shadow:inset -20px -26px 50px rgba(0,0,0,0.35),0 30px 50px rgba(0,0,0,0.4);opacity:0.55}
.vs-b1{width:260px;height:260px;left:-60px;top:140px}
.vs-b2{width:180px;height:180px;left:860px;top:1100px;background:radial-gradient(circle at 35% 30%,color-mix(in srgb,var(--brand) 75%,white),var(--brand) 50%,color-mix(in srgb,var(--brand) 60%,black))}
.vs-b3{width:120px;height:120px;left:120px;top:1640px}
`;

// The timeline of one screen (runs in the page): words pop in, the icon draws, the ground floats.
const SCREEN_JS = `
(function () {
  var root = document.getElementById("root");
  var D = parseFloat(root.getAttribute("data-duration")) || 3;
  var q = function (s) { return root.querySelectorAll(s); };
  var tl = gsap.timeline({ paused: true });
  var IN = Math.min(0.9, D * 0.35);
  // the camera: a slow push, the whole screen
  tl.fromTo(q(".vs-stage"), { scale: 1 }, { scale: 1.045, duration: D, ease: "none" }, 0);
  // floating shapes (finite repeats: seek-safe)
  var float = function (sel, dy, dx, period, at) {
    var els = q(sel);
    if (!els.length) return;
    var n = Math.max(1, Math.ceil(D / period));
    tl.to(els, { y: dy, x: dx || 0, duration: period / 2, ease: "sine.inOut", yoyo: true, repeat: n * 2 - 1 }, at || 0);
  };
  float(".vs-o1", 60, 30, 6); float(".vs-o2", -50, -20, 7); float(".vs-hills", 0, -30, 9); float(".vs-clayball", -36, 10, 5.5);
  float(".vs-motif", -14, 0, 3.2, IN);
  if (q(".vs-floorgrid").length) tl.fromTo(q(".vs-floorgrid"), { backgroundPositionY: "0px" }, { backgroundPositionY: (120 * Math.ceil(D)) + "px", duration: D, ease: "none" }, 0);
  if (q(".vs-sweep").length) tl.fromTo(q(".vs-sweep"), { x: 0 }, { x: 1900, duration: Math.max(2, D), ease: "none" }, 0);
  if (q(".vs-maplines path").length) tl.fromTo(q(".vs-maplines"), { x: 0 }, { x: -40, duration: D, ease: "none" }, 0);
  // in
  var t = 0.08;
  tl.fromTo(q(".vs-motif"), { opacity: 0, y: 40, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: "back.out(1.6)" }, t);
  tl.fromTo(q(".vs-sign"), { opacity: 0, scale: 0.6, rotation: -8 }, { opacity: 1, scale: 1, rotation: 0, duration: 0.45, ease: "back.out(2)" }, t + 0.25);
  tl.to(q(".vs-icon path"), { strokeDashoffset: 0, duration: Math.min(1.1, D * 0.4), ease: "power2.out", stagger: 0.08 }, t + 0.2);
  tl.to(q(".vs-arrow path"), { strokeDashoffset: 0, duration: 0.6, ease: "power2.out" }, t + 0.45);
  tl.fromTo(q(".vs-kicker"), { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" }, t + 0.1);
  var words = q(".vs-w");
  var step = words.length > 1 ? Math.min(0.16, (IN + 0.4) / words.length) : 0;
  tl.fromTo(words, { opacity: 0, y: 34, scale: 0.86 }, { opacity: 1, y: 0, scale: 1, duration: 0.34, ease: "back.out(2.2)", stagger: step }, t + 0.18);
  tl.fromTo(q(".vs-mark"), { color: "var(--fg)" }, { color: "var(--brand)", duration: 0.25 }, t + 0.3 + step * words.length);
  tl.fromTo(q(".vs-card, .vs-bubble"), { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 0.45, ease: "back.out(1.5)", stagger: 0.3 }, t);
  tl.fromTo(q(".vs-tag"), { opacity: 0, scale: 0 }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2.5)" }, t + 0.3);
  tl.fromTo(q(".vs-button"), { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2)" }, t + 0.5);
  // list rows when the voice says them (data-at), else one by one
  q(".vs-row").forEach(function (row, k) {
    var at = parseFloat(row.getAttribute("data-at"));
    tl.fromTo(row, { opacity: 0, x: -60 }, { opacity: 1, x: 0, duration: 0.4, ease: "back.out(1.6)" }, isFinite(at) ? at : t + k * Math.min(0.5, (D * 0.6) / 4));
  });
  // a number counts up
  q(".vs-number").forEach(function (el) {
    var end = parseFloat(el.getAttribute("data-end")) || 0;
    var year = el.getAttribute("data-year") === "1";
    var pct = el.getAttribute("data-pct") === "1";
    var o = { v: year ? Math.round(end * 0.97) : 0 };
    var show = function () { var v = Math.abs(end) < 10 && end % 1 ? o.v.toFixed(1) : Math.round(o.v); el.textContent = (year ? String(v) : Number(v).toLocaleString("en-US")) + (pct ? "%" : ""); };
    tl.fromTo(el, { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(1.8)" }, t);
    tl.to(o, { v: end, duration: Math.min(1.4, D * 0.5), ease: "power2.out", onUpdate: show, onStart: show }, t + 0.1);
  });
  q(".vs-ring-on").forEach(function (c) { tl.to(c, { strokeDashoffset: 100 - parseFloat(c.getAttribute("data-to")), duration: Math.min(1.4, D * 0.5), ease: "power2.out" }, t + 0.1); });
  // the stick figure's pose
  var fig = q(".vs-stick")[0];
  if (fig) {
    var pose = fig.getAttribute("data-pose");
    var arm = function (sel, a, b, period) { var n = Math.max(1, Math.ceil((D - 0.4) / period)); tl.fromTo(root.querySelector(sel), { rotation: a }, { rotation: b, svgOrigin: "150 150", duration: period / 2, ease: "sine.inOut", yoyo: true, repeat: n * 2 - 1 }, 0.3); };
    if (pose === "wave") arm(".vs-arm-r", -40, -150, 0.8);
    if (pose === "shrug") { tl.to(root.querySelector(".vs-arm-l"), { rotation: 70, svgOrigin: "150 150", duration: 0.4 }, 0.3); tl.to(root.querySelector(".vs-arm-r"), { rotation: -70, svgOrigin: "150 150", duration: 0.4 }, 0.3); }
    if (pose === "think") tl.to(root.querySelector(".vs-arm-r"), { rotation: -120, svgOrigin: "150 150", duration: 0.4 }, 0.3);
    if (pose === "jump") { var nj = Math.max(1, Math.floor((D - 0.4) / 0.9)); tl.to(root.querySelector(".vs-stick-body"), { y: -70, duration: 0.3, ease: "power2.out", yoyo: true, repeat: nj * 2 - 1, repeatDelay: 0.15 }, 0.3); tl.to(root.querySelector(".vs-arm-l"), { rotation: 110, svgOrigin: "150 150", duration: 0.3 }, 0.3); tl.to(root.querySelector(".vs-arm-r"), { rotation: -110, svgOrigin: "150 150", duration: 0.3 }, 0.3); }
    if (pose === "walk") { arm(".vs-leg-l", -22, 22, 0.7); arm(".vs-leg-r", 22, -22, 0.7); arm(".vs-arm-l", 20, -20, 0.7); arm(".vs-arm-r", -20, 20, 0.7); tl.fromTo(q(".vs-figure"), { x: -90 }, { x: 60, duration: D, ease: "none" }, 0); }
  }
  // a hard cut to the next screen: nothing fades out (a frame before the cut shows the whole screen)
  window.__timelines = window.__timelines || {};
  window.__timelines["__ID__"] = tl;
})();
`;

/**
 * One vertical screen as a sub-composition. `id`: its composition id (unique in the build);
 * `content`: contentOf(...); `icon`: findIcon's result or null; `cues`: seconds of list rows.
 */
export function screenHtml({ id, seconds, skin, content, icon = null, n = 1, cues = [] }) {
  const d = r3(Math.max(0.3, seconds));
  let body = bodyHtml(skin, content, icon, n);
  if (cues.length) {
    let k = 0;
    body = body.replace(/<div class="vs-row" /g, (m) => {
      const at = cues[k++];
      return Number.isFinite(at) ? `<div class="vs-row" data-at="${r3(at)}" ` : m;
    });
  }
  return `<!doctype html>
<html lang="en" data-composition-id="${id}" data-composition-duration="${d}">
<head><meta charset="UTF-8"/></head>
<body>
<template>
<div id="root" data-composition-id="${id}" data-duration="${d}" data-fps="30">
<style>${SCREEN_CSS}</style>
<div class="vs-root vs-skin-${skin.id} clip" data-start="0" data-duration="${d}" data-track-index="0">
<div class="vs-stage">
${groundHtml(skin)}
<div class="vs-content">
${body}
</div>
</div>
</div>
<script src="gsap.min.js"></script>
<script>${SCREEN_JS.replace("__ID__", id)}</script>
</div>
</template>
</body>
</html>
`;
}

// ---- the captions -------------------------------------------------------------------------

/**
 * The narration's words in short groups for the captions: at most `max` words or 22 letters,
 * a new group after a pause or at a sentence end. Words: [{ text, start, end }].
 */
export function captionChunks(words, { max = 3, letters = 22 } = {}) {
  const out = [];
  let cur = [];
  const len = (g) => g.reduce((a, w) => a + [...w.text].length + 1, 0);
  for (const w of words) {
    const prev = cur[cur.length - 1];
    const gap = prev ? w.start - prev.end : 0;
    if (cur.length && (cur.length >= max || len(cur) + [...w.text].length > letters || gap > 0.35 || /[.!?…។]$/.test(prev.text))) {
      out.push(cur);
      cur = [];
    }
    cur.push(w);
  }
  if (cur.length) out.push(cur);
  return out.map((g, k) => ({ words: g, start: g[0].start, end: Math.min(g[g.length - 1].end + 0.25, out[k + 1]?.[0]?.start ?? Infinity) }));
}

const CAPTION_CSS = `
.vc-root{position:absolute;inset:0;width:${W}px;height:${H}px;pointer-events:none}
.vc-line{position:absolute;left:${BOX.left}px;width:${BOX.width}px;top:${ZONES.captions.top}px;height:${ZONES.captions.bottom - ZONES.captions.top}px;display:flex;flex-wrap:wrap;align-content:center;justify-content:center;gap:6px 0.42em;opacity:0;font-family:var(--font-display),system-ui,sans-serif;font-weight:900;line-height:1.08;text-align:center;color:#fff;paint-order:stroke fill;-webkit-text-stroke:14px rgba(0,0,0,0.82);text-shadow:0 8px 24px rgba(0,0,0,0.45)}
.vc-w{display:inline-block}
`;

/** The captions over a whole Short, in the middle third; the word being said in the brand colour. */
export function captionsHtml({ words, total, k = 0.56, id = "vcaptions" }) {
  const chunks = captionChunks(words);
  const lines = chunks
    .map((c, i) => {
      const text = c.words.map((w) => w.text).join(" ");
      const { size } = fitText(text, { width: BOX.width, k: k + 0.04, maxLines: 2, height: ZONES.captions.bottom - ZONES.captions.top, sizes: [96, 88, 80, 72, 64, 56] });
      return `<div class="vc-line" data-i="${i}" style="font-size:${size}px">${c.words.map((w, j) => `<span class="vc-w" data-s="${r3(w.start)}" data-j="${j}">${esc(w.text)}</span>`).join("")}</div>`;
    })
    .join("\n");
  const times = JSON.stringify(chunks.map((c) => [r3(c.start), r3(c.end)]));
  const d = r3(total);
  return `<!doctype html>
<html lang="en" data-composition-id="${id}" data-composition-duration="${d}">
<head><meta charset="UTF-8"/></head>
<body>
<template>
<div id="root" data-composition-id="${id}" data-duration="${d}" data-fps="30">
<style>${CAPTION_CSS}</style>
<div class="vc-root clip" data-start="0" data-duration="${d}" data-track-index="0">
${lines}
</div>
<script src="gsap.min.js"></script>
<script>
(function () {
  var root = document.getElementById("root");
  var T = ${times};
  var tl = gsap.timeline({ paused: true });
  root.querySelectorAll(".vc-line").forEach(function (line, i) {
    var a = T[i][0], b = T[i][1];
    tl.set(line, { opacity: 1 }, a);
    tl.fromTo(line, { scale: 0.92 }, { scale: 1, duration: 0.12, ease: "back.out(2)" }, a);
    tl.set(line, { opacity: 0 }, Math.max(a + 0.05, b));
    line.querySelectorAll(".vc-w").forEach(function (w) {
      var s = parseFloat(w.getAttribute("data-s"));
      tl.fromTo(w, { color: "#ffffff", scale: 1 }, { color: "var(--brand)", scale: 1.08, duration: 0.08, ease: "power2.out" }, Math.max(a, s));
    });
  });
  window.__timelines = window.__timelines || {};
  window.__timelines["${id}"] = tl;
})();
</script>
</div>
</template>
</body>
</html>
`;
}
