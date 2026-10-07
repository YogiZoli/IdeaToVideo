// spoken.mjs: the spoken word highlighted in a scene's own text (Zoltan,
// 2026-10-06: "instead of shaking, the word the voice says is the marked one,
// like a transcription"). DECISIONS 106.
//
// In the build copy of a text scene, every on-screen word the narration says
// changes colour while it is said: to the brand colour, or to the text colour
// when it already is the brand colour. The tweens go on the scene's own GSAP
// timeline (seek-safe, the scene's 0 is its start), right before the
// component seeks it to 0. headline-slam's three-frame impact shake is
// turned off with it. The registry files are untouched.

const r3 = (x) => Math.round(x * 1000) / 1000;
const norm = (w) => String(w).toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]/gu, "");

// Which components, which text variable, which word elements.
export const SPOKEN = {
  "headline-slam": { from: "text", selector: ".hs-word" },
  "per-word-rise": { from: "text", selector: ".pwr-unit:not(.pwr-space)", unless: (vars) => vars?.split === "char" },
};

// When each on-screen word is said, relative to the scene's start:
// [{ i, a, b }], in screen order; a word the voice does not say is skipped.
export function spokenTimes(sc, words, start, end) {
  const spec = SPOKEN[sc.component];
  if (!spec || spec.unless?.(sc.vars) || typeof sc.vars?.[spec.from] !== "string") return [];
  const shown = sc.vars[spec.from].trim().split(/\s+/).filter(Boolean);
  const said = words.filter((w) => w.start >= start - 0.05 && w.start < end);
  const out = [];
  let from = 0;
  shown.forEach((text, i) => {
    const want = norm(text);
    if (want.length < 2) return;
    const stem = want.slice(0, Math.max(3, Math.min(want.length, 5)));
    for (let k = from; k < said.length; k++) {
      const w = norm(said[k].text);
      if (w === want || (w.length >= 3 && w.startsWith(stem))) {
        from = k + 1;
        out.push({ i, a: Math.max(0.05, r3(said[k].start - start)), b: Math.max(0.2, r3(said[k].end - start)) });
        return;
      }
    }
  });
  return out;
}

const SHAKE = [/\{\s*x:\s*"0\.55cqw",\s*y:\s*"-0\.3cqh",/, /x:\s*"-0\.38cqw",(\s*)y:\s*"0\.2cqh",/];

// The build copy with the highlight (and without the shake). `times` from
// spokenTimes; an empty list leaves the copy as it is.
export function withSpoken(html, component, times) {
  const spec = SPOKEN[component];
  if (!spec) return html;
  let out = html;
  if (component === "headline-slam") {
    if (!SHAKE.every((rx) => rx.test(out))) throw new Error("headline-slam changed upstream: its shake was not found. Update runner/gates/build/spoken.mjs.");
    out = out.replace(SHAKE[0], "{ x: 0, y: 0,").replace(SHAKE[1], "x: 0,$1y: 0,");
  }
  if (!times.length) return out;
  const anchor = "            tl.seek(0);";
  if (!out.includes(anchor)) throw new Error(`${component} changed upstream: no tl.seek(0) to add the spoken word before. Update runner/gates/build/spoken.mjs.`);
  const code = [
    "            // IdeaToVideo: the spoken word in colour while it is said (spoken.mjs)",
    "            (function () {",
    `              var said = ${JSON.stringify(times)};`,
    `              var els = root.querySelectorAll(${JSON.stringify(spec.selector)});`,
    "              var cs = getComputedStyle(root);",
    "              var brand = (cs.getPropertyValue('--brand') || '').trim();",
    "              var fg = (cs.getPropertyValue('--fg') || '').trim();",
    "              var probe = document.createElement('span');",
    "              probe.style.color = brand; root.appendChild(probe);",
    "              var brandRgb = getComputedStyle(probe).color; probe.remove();",
    "              said.forEach(function (s) {",
    "                var el = els[s.i];",
    "                if (!el || !brand) return;",
    "                var was = getComputedStyle(el).color;",
    "                var hi = was === brandRgb ? (fg || '#000') : brand;",
    "                tl.to(el, { color: hi, duration: 0.12, ease: 'none' }, s.a);",
    "                tl.to(el, { color: was, duration: 0.25, ease: 'none' }, Math.max(s.a + 0.12, s.b));",
    "              });",
    "            })();",
  ].join("\n");
  return out.replace(anchor, `${code}\n${anchor}`);
}
