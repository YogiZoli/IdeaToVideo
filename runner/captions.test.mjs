// captions.test.mjs: burned-in caption styles (DECISIONS 106).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { CAPTION_STYLES, captionGroups, arraySpan, adaptCaption, recolorCaption, captionDir, loadCaption } from "./captions/index.mjs";

const words = "Motion graphics is graphic design that moves. It explains, fast.".split(" ").map((text, i) => ({ text, start: 1 + i * 0.4, end: 1.3 + i * 0.4 }));
const have = fs.existsSync(path.join(captionDir(), "caption-pill-karaoke", "caption-pill-karaoke.html"));

test("groups: at most four words, a new group after a sentence mark", () => {
  assert.deepEqual(captionGroups(words), [[0, 3], [4, 6], [7, 8], [9, 9]]);
});

test("array literals are found whole, strings and comments skipped", () => {
  const src = 'var A = 1; var WORDS = [ { text: "a]" }, // ]\n [1, [2]] ]; var B = 2;';
  const s = arraySpan(src, "WORDS");
  assert.equal(src.slice(s.start, s.end), '[ { text: "a]" }, // ]\n [1, [2]] ]');
  assert.equal(arraySpan(src, "NONE"), null);
});

test("a style gets the video's words, groups, length and font, and no remote font", () => {
  const html = '<link href="https://fonts.googleapis.com/css2?family=Poppins" rel="stylesheet" /><div id="r" data-composition-id="x" data-duration="8"></div><style>.w { font-family: "Poppins", Arial; }</style><script>var DURATION = 8; var FONT_FAMILY = "Poppins"; var TRANSCRIPT = [{ text: "demo", start: 0, end: 1 }]; var RAW_GROUPS = [[0, 0]];</script></body>';
  const out = adaptCaption("caption-test", html, { words, total: 42.5, family: "Archivo Black" });
  assert.match(out, /data-duration="42.5"/);
  assert.match(out, /var DURATION = 42.5/);
  assert.match(out, /"text":"Motion"/);
  assert.match(out, /RAW_GROUPS = \[\[0,3\],\[4,6\]/);
  assert.match(out, /font-family: "Archivo Black"/);
  assert.match(out, /FONT_FAMILY = "Archivo Black"/);
  assert.doesNotMatch(out, /googleapis/);
  assert.match(out, /data-layout-allow-overlap/);
  assert.throws(() => adaptCaption("caption-test", "<div></div>", { words, total: 1 }), /transcript was not found/);
});

test("editorial and parallax blocks: the last word of a group is its emphasis", () => {
  const ed = adaptCaption("e", 'var W = []; var BLOCKS = [{ line1: [[0, "n"]], line2: null }];', { words, total: 9 });
  assert.match(ed, /\{"line1":\[\[0,"n"\],\[1,"n"\]\],"line2":\[\[2,"n"\],\[3,"e"\]\]\}/);
  const px = adaptCaption("p", "var W = []; var BLOCKS = [{ behind: null, front: [[0]] }];", { words, total: 9 });
  assert.match(px, /\{"behind":\[\[3\]\],"front":\[\[0\],\[1\],\[2\]\]\}/);
});

test("colours: the karaoke pill and the dim words read on the brand; white turns to text colour on a light look", () => {
  const theme = { fg: "#111111", muted: "#6b6b6b", surface: "#f4f2e8", bg: "#fdfae7", brand: "#1e2bfa", accent: "#1e2bfa", "accent-2": "#1e2bfa" };
  const pill = recolorCaption('var COLOR_INACTIVE = "#A6A6A6"; var COLOR_ACTIVE = "#1C1E1D"; .p { background: #e7e5e7; } .w { color: #a6a6a6; }', theme, true);
  assert.match(pill, /COLOR_INACTIVE = "#6b6b6b"/);
  assert.match(pill, /COLOR_ACTIVE = "#111111"/);
  assert.match(pill, /background: #f4f2e8/);
  assert.equal(recolorCaption(".w { color: #ffffff; }", theme, true), ".w { color: #111111; }");
  assert.equal(recolorCaption(".w { color: #ffffff; }", theme, false), ".w { color: #ffffff; }", "white stays on a dark look");
  assert.match(recolorCaption('var ACCENT_COLORS = ["#FF76FF", "#FF0002"]; .m { color: #00ff41; }', theme, false), /ACCENT_COLORS = \["#1e2bfa","#1e2bfa","#1e2bfa"\]; \.m \{ color: #1e2bfa; \}/);
});

test("every shipped style adapts without error", { skip: !have && "caption styles not fetched" }, () => {
  for (const name of Object.keys(CAPTION_STYLES)) {
    const out = adaptCaption(name, loadCaption(name), { words, total: 12, family: "Inter", theme: { fg: "#111", muted: "#555", brand: "#123", surface: "#eee" }, light: true });
    assert.doesNotMatch(out, /googleapis|cdn\.jsdelivr/, name);
    assert.match(out, /data-duration="12"/, name);
  }
});
