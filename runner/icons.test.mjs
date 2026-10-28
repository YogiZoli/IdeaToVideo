// icons.test.mjs: the icon sets for the whiteboard scene (DECISIONS 105).
import "./fixtures/test-catalog.mjs"; // the scene catalog fixture, before any scene module
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { svgToPaths, parsePath, transformPath } from "./icons/svg.mjs";
import { findIcon, pickIcons, withSketch, isBrand, loadFamily, queryWords } from "./icons/index.mjs";
import { libraryDir, loadComponent } from "./gates/build/assemble.mjs";

const haveIcons = fs.existsSync(path.join(libraryDir(), "icons", "lucide.json"));

test("svg elements become path data; unstroked frames are left out", () => {
  const svg = `<svg><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="11" cy="11" r="2" /><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><polyline points="4 4, 8 8 12 4"/></svg>`;
  const d = svgToPaths(svg);
  assert.equal(d.length, 4);
  assert.match(d[0], /^M9 11A2 2 0 1 0 13 11/);
  assert.match(d[1], /^M4 3H20A2 2 0 0 1 22 5/);
  assert.equal(d[2], "M8 21L16 21");
  assert.equal(d[3], "M4 4L8 8L12 4");
});

test("path data is parsed with packed arc flags and moved into the sketch box", () => {
  assert.deepEqual(parsePath("a1 1 0 011 1"), [["a", [1, 1, 0, 0, 1, 1, 1]]]);
  assert.equal(transformPath("M1 2L3 4z", { scale: 10, dx: 100, dy: 50 }), "M110 70L130 90z");
  assert.equal(transformPath("m2.3 2.3 7.286 7.286", { scale: 10, dx: 100, dy: 0 }), "M123 23l72.86 72.86", "a leading relative m is absolute");
  assert.equal(transformPath("M0 0h2v3a1 1 0 0 1 1 1", { scale: 2, dx: 5, dy: 5 }), "M5 5h4v6a2 2 0 0 1 2 2");
});

test("search words: no stop words, plurals folded", () => {
  assert.deepEqual(queryWords("The rocket launches"), ["rocket", "launche"]);
  assert.deepEqual(queryWords("Piggy banks"), ["piggy", "bank"]);
});

test("logos are never drawn", () => {
  assert.ok(isBrand("tabler", "brand-youtube"));
  assert.ok(isBrand("lucide", "github"));
  assert.ok(!isBrand("lucide", "zoom-in"));
});

test("icons: the best fit, never twice in a video, recent ones only when nothing else fits", { skip: !haveIcons && "icon sets not fetched" }, () => {
  assert.equal(findIcon("rocket").name, "rocket");
  assert.equal(findIcon("lightbulb idea").name, "lightbulb");
  assert.ok(!/brand|youtube/.test(findIcon("youtube video").name));
  const picks = pickIcons([1, 2, 3].map(() => ({ component: "whiteboard-ink", icon: "lightbulb" })));
  assert.equal(new Set(picks.map((p) => `${p.family}/${p.name}`)).size, 3);
  assert.ok(picks.every((p) => !/-off$/.test(p.name)), "never the opposite (lightbulb-off)");
  const fresh = pickIcons([{ component: "whiteboard-ink", icon: "rocket" }], { recent: ["lucide/rocket"] })[0];
  assert.notEqual(`${fresh.family}/${fresh.name}`, "lucide/rocket");
  const fallback = pickIcons([{ component: "whiteboard-ink", from: "S1", vars: { caption: "" } }], { sentences: [{ id: "S1", text: "Open your calendar every morning." }] })[0];
  assert.match(fallback.name, /^calendar/, "without the planner's words: what the voice says");
  assert.ok(loadFamily("tabler").icons["arrow-right"]);
});

test("the whiteboard copy draws the icon in its strokes slot", { skip: !haveIcons && "icon sets not fetched" }, () => {
  const html = loadComponent("whiteboard-ink").html;
  const out = withSketch(html, findIcon("rocket"));
  assert.match(out, /data-slot="strokes" data-sketch="custom" hidden><path d="M/);
  assert.match(out, /data-ink="accent"/);
  assert.throws(() => withSketch("<div></div>", findIcon("rocket")), /changed upstream/);
});
