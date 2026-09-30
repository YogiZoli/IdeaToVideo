import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkVars, sceneTimes, themeCss, mountTheme, assemble, THEME_KEYS } from "./gates/build/assemble.mjs";

const ITEM = {
  name: "count-up",
  variables: [
    { id: "end", type: "number", default: 100 },
    { id: "cols", type: "number", min: 0, max: 4 },
    { id: "suffix", type: "string", default: "%" },
    { id: "glow", type: "boolean", default: false },
    { id: "accent", type: "enum", options: [{ value: "green" }, { value: "blue" }, { value: "violet" }] },
  ],
};

test("variables are checked against registry-item.json", () => {
  assert.deepEqual(checkVars(ITEM, { end: 42, suffix: " s", glow: true, accent: "blue" }), []);
  assert.deepEqual(checkVars(ITEM, {}), [], "missing ones keep their default");
  const errs = checkVars(ITEM, { end: "42", cols: 9, glow: "yes", accent: "red", size: 3 });
  assert.equal(errs.length, 5);
  assert.match(errs.join(" "), /end: must be a number/);
  assert.match(errs.join(" "), /cols: must be at most 4/);
  assert.match(errs.join(" "), /glow: must be true or false/);
  assert.match(errs.join(" "), /accent: must be one of green, blue, violet/);
  assert.match(errs.join(" "), /no variable called size/);
});

const S = [
  { id: "S1", start: 0.2, end: 2 },
  { id: "S2", start: 2.4, end: 4 },
  { id: "S3", start: 4.3, end: 6 },
];

test("scene times come from the sentences, back to back, to the end of the audio", () => {
  assert.deepEqual(sceneTimes([{ from: "S1" }, { from: "S2", to: "S3" }], S, 7), [
    { start: 0, duration: 2.4 },
    { start: 2.4, duration: 4.6 },
  ]);
});

test("every sentence has exactly one scene, in order", () => {
  assert.throws(() => sceneTimes([{ from: "S1" }, { from: "S3" }], S, 7), /Scene 2 starts at S3, but the next sentence is S2/);
  assert.throws(() => sceneTimes([{ from: "S1" }, { from: "S2" }], S, 7), /S3 and after have no scene/);
  assert.throws(() => sceneTimes([{ from: "S1", to: "S9" }], S, 7), /no sentence S9/);
  assert.throws(() => sceneTimes([{ from: "S2", to: "S1" }], S, 7), /S1 comes before S2/);
});

test("theme: every token is always set, bad values are refused", () => {
  const css = themeCss({ bg: "#fff" });
  for (const k of THEME_KEYS) assert.match(css, new RegExp(`--${k}: var\\(--itv-${k}\\);`));
  assert.match(css, /--itv-bg: #fff;/);
  assert.throws(() => themeCss({ bg: "red; } body { display: none" }), /not a usable CSS value/);
  assert.throws(() => themeCss({ bg: "</style><script>" }), /not a usable CSS value/);
  assert.throws(() => themeCss({ colour: "#fff" }), /Unknown theme value/);
});

test("accent never becomes a CSS variable; the mount points --brand at the chosen colour", () => {
  const blue = mountTheme({ text: "Hi", accent: "blue" });
  assert.deepEqual(blue.vars, { text: "Hi" });
  assert.match(blue.style, /--brand: var\(--itv-accent\)/);
  assert.match(blue.style, /--accent: var\(--itv-accent\)/);
  assert.match(mountTheme({}).style, /--brand: var\(--itv-brand\)/);
  assert.match(mountTheme({ accent: "violet" }).style, /--brand: var\(--itv-accent-2\)/);
  assert.throws(() => mountTheme({ bg: "#000" }), /would overwrite the theme's --bg/);
});

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "itv-asm-"));
  const lib = path.join(dir, "library", "components", "count-up");
  fs.mkdirSync(lib, { recursive: true });
  fs.writeFileSync(path.join(lib, "registry-item.json"), JSON.stringify({ ...ITEM, files: [{ path: "count-up.html", target: "compositions/components/count-up.html" }] }));
  fs.writeFileSync(path.join(lib, "count-up.html"), "<template>count</template>");
  const eng = path.join(dir, "engine", "node_modules", "gsap", "dist");
  fs.mkdirSync(eng, { recursive: true });
  fs.writeFileSync(path.join(eng, "gsap.min.js"), "gsap");
  const proj = path.join(dir, "project");
  fs.mkdirSync(path.join(proj, "audio"), { recursive: true });
  fs.writeFileSync(path.join(proj, "audio", "vo_bgm.mp3"), "mp3");
  fs.writeFileSync(path.join(proj, "sentences.json"), JSON.stringify(S));
  const env = { ITV_LIBRARY_DIR: path.join(dir, "library"), ITV_ENGINE_DIR: path.join(dir, "engine") };
  return { dir, proj, env };
}

test("assemble writes the root composition and the components it uses", async () => {
  const { dir, proj, env } = fixture();
  const scenes = [
    { component: "count-up", from: "S1", to: "S2", vars: { end: 8, suffix: " s" } },
    { component: "count-up", from: "S3", vars: { end: 3, accent: "violet" } },
  ];
  fs.writeFileSync(path.join(proj, "scenes.json"), JSON.stringify({ theme: { bg: "#101010" }, scenes }));
  const r = await assemble(proj, { env, total: 7, title: "A <b> test" });
  assert.deepEqual({ scenes: r.scenes, seconds: r.seconds }, { scenes: 2, seconds: 7 });
  const html = fs.readFileSync(path.join(r.out, "index.html"), "utf8");
  assert.match(html, /data-composition-id="main" data-start="0" data-duration="7"/);
  assert.match(html, /id="scene-1" class="clip" data-composition-id="count-up" data-composition-src="compositions\/components\/count-up.html" data-start="0" data-duration="4.3"/);
  assert.match(html, /id="scene-2"[^>]*data-start="4.3" data-duration="2.7"[^>]*data-variable-values='\{"end":3\}'/);
  assert.match(html, /--itv-bg: #101010;/);
  assert.match(html, /<title>A &lt;b> test<\/title>/);
  assert.match(html, /<audio id="main-audio" src="vo_bgm.mp3"/);
  assert.equal(fs.readFileSync(path.join(r.out, "compositions", "components", "count-up.html"), "utf8"), "<template>count</template>");
  assert.equal(fs.readFileSync(path.join(r.out, "gsap.min.js"), "utf8"), "gsap");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("assemble checks everything before it touches build/", async () => {
  const { dir, proj, env } = fixture();
  fs.mkdirSync(path.join(proj, "build"));
  fs.writeFileSync(path.join(proj, "build", "index.html"), "previous");
  const write = (scenes) => fs.writeFileSync(path.join(proj, "scenes.json"), JSON.stringify({ scenes }));
  write([{ component: "count-up", from: "S1", to: "S3", vars: { end: "x" } }]);
  await assert.rejects(assemble(proj, { env, total: 7 }), /end: must be a number/);
  write([{ component: "no-such", from: "S1", to: "S3" }]);
  await assert.rejects(assemble(proj, { env, total: 7 }), /no component called no-such/);
  write([{ component: "../count-up", from: "S1", to: "S3" }]);
  await assert.rejects(assemble(proj, { env, total: 7 }), /Not a component name/);
  write([{ component: "count-up", from: "S1" }]);
  await assert.rejects(assemble(proj, { env, total: 7 }), /S2 and after have no scene/);
  assert.equal(fs.readFileSync(path.join(proj, "build", "index.html"), "utf8"), "previous");
  fs.rmSync(dir, { recursive: true, force: true });
});
