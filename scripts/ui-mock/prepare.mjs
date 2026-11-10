#!/usr/bin/env node
// prepare.mjs: the app's UI in a normal browser, without Tauri, for finding
// UI bugs (how the Settings crash was found, 2026-10-01). Copies the built UI
// (app/build, from `npm run build` in app/) into <dir> and puts mock.js in
// front of it: a stand-in for the Tauri core that logs every call in
// window.__calls and answers a fixed project. Then serve <dir> and open it:
//   node scripts/ui-mock/prepare.mjs <dir>
//   python -m http.server 5199 --directory <dir>
// In the browser: window.__calls shows exactly what the UI sent to Rust.
// Edit mock.js to shape the project (gates, keys, config) you need.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { contrastReport, cardForPreset } from "../../runner/brand/card.mjs";
import { galleryCards, STYLE_NOTE } from "../../runner/brand/gallery.mjs";
import { cardFromTokens } from "../../runner/brand/tokens.mjs";
import { familyNames } from "../../runner/brand/fonts.mjs";
import { fontsIndex } from "../../runner/brand/fonts.mjs";
import { libraryDir } from "../../runner/gates/build/assemble.mjs";
import { previewDir } from "../../runner/brand/preview.mjs";
import { recommendMood, profileFromMood, wizardOptions } from "../../runner/motion/profile.mjs";
import { defaultProfile as ctaDefault, catalogForUi } from "../../runner/cta/profile.mjs";
import { TEMPERATURES, SLOTS, PLACES_FOR_COUNT } from "../../runner/cta/catalog.mjs";
import { callColor } from "../../runner/gates/build/assemble.mjs";
import { cardTheme } from "../../runner/brand/card.mjs";
import { previewCourse } from "../../runner/course/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2];
if (!out) {
  console.error("Usage: node scripts/ui-mock/prepare.mjs <dir>");
  process.exit(2);
}
// ITV_MOCK_EDITOR=1: the Editor's window instead (app/build-editor, `npm run build:editor`, DECISIONS 184)
const build = path.join(here, "..", "..", "app", process.env.ITV_MOCK_EDITOR ? "build-editor" : "build");
if (!fs.existsSync(path.join(build, "index.html"))) {
  console.error("No app/build yet: run `npm run build` in app/ first.");
  process.exit(1);
}
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(build, out, { recursive: true });
// Course import (DECISIONS 121): the real preview of the example file.
fs.writeFileSync(path.join(out, "course-preview.json"), JSON.stringify(previewCourse({ projectsDir: out, file: path.join(here, "..", "..", "runner", "fixtures", "example-course-content-structure.json") })));
fs.copyFileSync(path.join(here, "mock.js"), path.join(out, "mock.js"));
// The YouTube Brand Channel Wizard: the real questions, kit and card (a pure file), in the browser.
fs.copyFileSync(path.join(here, "..", "..", "runner", "channelwizard", "kit.mjs"), path.join(out, "channel-wizard-kit.mjs"));
const index = path.join(out, "index.html");
fs.writeFileSync(index, fs.readFileSync(index, "utf8").replace("<head>", `<head><script src="/mock.js?v=${Date.now()}"></script>`));
// The Brand wizard's data, as the runner gives it, with the fonts served
// from /fonts (mock.js answers brand-state with this file). Stills of the
// last real preview, if there is one, as /preview/<n>.png.
const card = cardForPreset("blue-professional");
const fonts = fontsIndex().families.map((f) => ({ id: f.id, family: f.family, category: f.category, files: f.files.map((x) => ({ file: `${f.id}/${x.file}`, weight: x.weight, unicodeRange: x.unicodeRange })) }));
fs.cpSync(path.join(libraryDir(), "fonts"), path.join(out, "fonts"), { recursive: true });
const presets = galleryCards().map(({ id, label, group, card: c }) => ({ id, label, group, card: c }));
fs.writeFileSync(path.join(out, "brand-state.json"), JSON.stringify({ card, own: false, presets, styleNote: STYLE_NOTE, fonts, contrast: contrastReport(card), fontsDir: "/fonts", brandDir: null }));
// "Import tokens.css" answers with this card (a shadcn-style dark tokens file)
const imported = cardFromTokens(":root { --background: 240 10% 3.9%; --foreground: 0 0% 98%; --card: 240 10% 6%; --muted-foreground: 240 5% 64.9%; --primary: 263 70% 60%; --radius: 0.75rem; --font-display: 'Söhne', sans-serif; }", { families: familyNames(), name: "tokens", source: { kind: "import" } });
fs.writeFileSync(path.join(out, "brand-import.json"), JSON.stringify({ card: imported.card, fonts: imported.notes, contrast: contrastReport(imported.card) }));
const shots = path.join(previewDir({ ...process.env, ITV_DATA_DIR: process.env.ITV_DATA_DIR ?? path.join(process.env.LOCALAPPDATA ?? "", "app.ideatovideo.desktop") }), "review", "snapshots");
fs.mkdirSync(path.join(out, "preview"), { recursive: true });
if (fs.existsSync(shots)) fs.readdirSync(shots).filter((f) => f.endsWith(".png")).sort().forEach((f, i) => fs.copyFileSync(path.join(shots, f), path.join(out, "preview", `${i + 1}.png`)));
// The Motion wizard's data, and the last real Motion preview video, if any.
const recommended = recommendMood(card);
{
  // The CTA wizard's data (runner/main.mjs cta-state), on the mock's card.
  const theme = cardTheme(card);
  const look = { bg: theme.bg, fg: theme.fg, font: theme["font-display"], buttons: Object.fromEntries(Object.keys(TEMPERATURES).map((t) => [t, callColor({ temperature: t }, theme)])) };
  fs.writeFileSync(path.join(out, "cta-state.json"), JSON.stringify({ profile: null, start: ctaDefault(), options: { keywords: catalogForUi(), temperatures: TEMPERATURES, slots: SLOTS, placesForCount: PLACES_FOR_COUNT }, look, last: null, segments: [{ id: "a1b2c3d4e5", keyword: "GUIDE", name: "GUIDE with my avatar", file: "a1b2c3d4e5.mp4", seconds: 9.4, source: "heygen", createdAt: "2026-10-05T10:00:00Z", lastUsedAt: null }] }));
}
fs.writeFileSync(path.join(out, "motion-state.json"), JSON.stringify({ profile: null, recommended, start: profileFromMood(recommended.mood), light: card.appearance === "light", options: wizardOptions() }));
// The Scenes wizard and the scene packs (DECISIONS 107, 110): the runner's
// own answers for a throwaway Identity with the neutral pack imported, when
// the pack file is on this computer.
{
  const { spawnSync } = await import("node:child_process");
  const os = await import("node:os");
  const ident = fs.mkdtempSync(path.join(os.tmpdir(), "itv-mock-ident-"));
  const pack = "C:/Users/gdp/ITV-packs/neutral-explainer-archetypes.itvpack";
  if (fs.existsSync(pack)) (await import("../../runner/packs/index.mjs")).importPack(ident, pack);
  const ask = (command) => {
    const r = spawnSync(process.execPath, [path.join(here, "..", "..", "runner", "main.mjs"), command], { input: JSON.stringify({ identityDir: ident }), encoding: "utf8" });
    const line = r.stdout.trim().split(/\r?\n/).map((l) => { try { return JSON.parse(l); } catch { return null; } }).find((e) => e?.event === "result");
    return line?.data ?? null;
  };
  fs.writeFileSync(path.join(out, "scenes-state.json"), JSON.stringify(ask("scenes-state")));
  fs.writeFileSync(path.join(out, "packs-list.json"), JSON.stringify(ask("packs-list")));
}
const dataDir = process.env.ITV_DATA_DIR ?? path.join(process.env.LOCALAPPDATA ?? "", "app.ideatovideo.desktop");
const motionOut = path.join(dataDir, "motion-preview", "out");
if (fs.existsSync(motionOut)) {
  const last = fs.readdirSync(motionOut).filter((f) => f.endsWith(".mp4")).sort().pop();
  if (last) fs.copyFileSync(path.join(motionOut, last), path.join(out, "preview", "motion.mp4"));
}
console.log(`ui-mock ready in ${out}`);
