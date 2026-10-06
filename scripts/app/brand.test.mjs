// The wizard's colour arithmetic (app/src/lib/brand.ts) equals the runner's
// (runner/brand/card.mjs), so what the wizard says about contrast is what the
// saved card gets.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as ui from "../../app/src/lib/brand.ts";
import * as runner from "../../runner/brand/card.mjs";

const COLORS = ["#fdfae7", "#1e2bfa", "#111111", "#f8b4b4", "#2e4a2a", "#e89cb1", "#ffffff", "#000000", "#8a8178", "#ede8e0"];

test("contrast, mix and Fix are the same in the wizard and the runner", () => {
  for (const a of COLORS) {
    for (const b of COLORS) {
      assert.equal(ui.contrast(a, b), runner.contrast(a, b), `${a} ${b}`);
      assert.equal(ui.mix(a, b, 0.2), runner.mix(a, b, 0.2));
      for (const min of [3, 4.5]) assert.equal(ui.fixContrast(a, b, min), runner.fixContrast(a, b, min));
    }
  }
  assert.deepEqual(ui.CONTRAST_RULES.map((r) => [r.id, r.min]), runner.CONTRAST_RULES.map((r) => [r.id, r.min]));
  assert.deepEqual(ui.CORNERS, runner.CORNERS);
});

test("three main colours give a full card palette, as the runner derives it", () => {
  const d = ui.deriveFrom({ background: "#FDFAE7", primary: "#1E2BFA" });
  const r = runner.deriveColors({ background: "#fdfae7", primary: "#1e2bfa", secondary: "#1e2bfa", tertiary: "#1e2bfa", text: "#111111", muted: ui.mix("#111111", "#fdfae7", 0.6) });
  assert.deepEqual(d, r);
  assert.equal(d.surface, "#f4f2e8");
  assert.equal(ui.deriveFrom({ background: "#101010", primary: "#ff8800" }).text, "#f4f5f7");
});

test("colours from a logo: the main clear colours, no white, black or transparent", () => {
  const px = [];
  const put = (rgba, n) => {
    for (let i = 0; i < n; i++) px.push(...rgba);
  };
  put([255, 255, 255, 255], 500); // white background
  put([0, 0, 0, 0], 300); // transparent
  put([30, 43, 250, 255], 200); // cobalt
  put([232, 93, 78, 255], 80); // coral
  put([32, 45, 248, 255], 50); // almost the same cobalt
  const p = ui.paletteFromPixels(px);
  assert.equal(p.length, 2);
  assert.ok(ui.contrast(p[0], "#1e2bfa") < 1.2, "cobalt first");
});

test("font faces for the wizard point at the shipped files, one-weight fonts at every weight", () => {
  const css = ui.fontFaceCss(
    [
      { id: "inter", family: "Inter", category: "sans-serif", files: [{ file: "inter/latin-wght-normal.woff2", weight: "100 900", unicodeRange: "U+0000-00FF" }] },
      { id: "bebas-neue", family: "Bebas Neue", category: "display", files: [{ file: "bebas-neue/latin-400-normal.woff2", weight: "400", unicodeRange: "U+0000-00FF" }] },
    ],
    "C:\\lib\\fonts",
    (p) => `asset://${p}`,
  );
  assert.match(css, /font-family: 'ITV Inter'; font-weight: 100 900;[^}]*asset:\/\/C:\\lib\\fonts\\inter\\latin-wght-normal\.woff2/);
  assert.match(css, /'ITV Bebas Neue'; font-weight: 100 900/);
  assert.deepEqual(Object.keys(ui.SAMPLE_LINE).sort(), ["de", "en", "es", "fr", "hu", "it", "nl", "pl", "pt", "ro"]);
});
