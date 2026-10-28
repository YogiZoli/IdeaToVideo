// The Brand wizard's runner side (docs/wizards/brand.md): the Brand Identity
// Card, the presets, the fonts and the dictionary.

import "./fixtures/test-catalog.mjs"; // the scene catalog fixture, before any scene module
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  presetCards, cardForPreset, cardTheme, cardFamilies, contrast, fixContrast, contrastReport, deriveColors, frameColors, frameMd,
  normalizeCard, saveCard, loadCard, mix, CARD_FILE, FRAME_FILE,
} from "./brand/card.mjs";
import { fontsIndex, fontFaces, familyNames } from "./brand/fonts.mjs";
import { codepoints, coverage, LANGUAGE_LETTERS } from "./brand/cmap.mjs";
import { libraryDir, BLUE_PROFESSIONAL } from "./gates/build/assemble.mjs";
import { checkText, normalizeDictionary, dictionaryData, saveDictionary, loadDictionary, EMPTY } from "./gates/script/dictionary.mjs";
import { buildData, buildMessages } from "./gates/script/index.mjs";
import { sampleScenes, SAMPLE_LINE } from "./brand/preview.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "itv-brand-"));

// ---- the card ---------------------------------------------------------------------

test("every shipped preset becomes a valid card; Blue Professional first, as before", () => {
  const all = presetCards({ fresh: true });
  assert.equal(all[0].id, "blue-professional");
  assert.equal(all.length, 11, "11 HyperFrames presets");
  assert.ok(!all.some((p) => p.id === "warm-paper"), "Warm paper is gone (Zoltan, 2026-10-02)");
  const families = familyNames();
  for (const p of all) {
    assert.doesNotThrow(() => normalizeCard(p.card, { families }), p.id);
    for (const k of ["display", "body", "mono"]) assert.ok(families.includes(p.card.fonts[k].family), `${p.id} ${k}: ${p.card.fonts[k].family} is shipped`);
  }
  const t = cardTheme(all[0].card);
  for (const k of ["bg", "fg", "muted", "surface", "border", "brand", "radius"]) assert.equal(t[k], BLUE_PROFESSIONAL[k], k);
  assert.ok(!all.some((p) => ["daisy-days", "bold-poster"].includes(p.id)), "presets whose fonts lack letters are out");
});

test("preset colours come from the FRAME.md by name; derived ones as the preset defines its cards", () => {
  const md = '---\nname: x\ncolors:\n  paper: "#F0EBDE"\n  ink: "#1F2BE0"\n  grid: "rgba(31,43,224,0.10)"\n---\n# x';
  assert.deepEqual(frameColors(md), { paper: "#f0ebde", ink: "#1f2be0" });
  assert.equal(mix("#1e2bfa", "#fdfae7", 0.04), "#f4f2e8");
  assert.equal(mix("#1e2bfa", "#fdfae7", 0.2), "#d0d1eb");
  const d = deriveColors({ background: "#FFFFFF", primary: "#123456" });
  assert.equal(d.text, "#111111");
  assert.equal(d.secondary, "#123456");
  assert.equal(deriveColors({ background: "#101010", primary: "#ff8800" }).text, "#f4f5f7", "light text on a dark background");
});

test("contrast: WCAG ratios, the report, and Fix finds the nearest passing colour", () => {
  assert.equal(contrast("#000000", "#ffffff"), 21);
  assert.equal(contrast("#777777", "#777777"), 1);
  const fixed = fixContrast("#f8b4b4", "#ffffff", 4.5);
  assert.ok(contrast(fixed, "#ffffff") >= 4.5);
  assert.equal(fixContrast("#000000", "#ffffff", 4.5), "#000000", "already fine: unchanged");
  const card = cardForPreset("blue-professional");
  assert.ok(contrastReport(card).every((r) => r.ok));
  card.colors.text = "#eeeeee";
  const bad = contrastReport(card).find((r) => r.id === "text-on-background");
  assert.equal(bad.ok, false);
  assert.ok(contrast(bad.fix, card.colors.background) >= 4.5);
});

test("a card is checked: hex only, shipped fonts only, logos only by their own names", () => {
  const families = familyNames();
  const card = cardForPreset("coral");
  assert.throws(() => normalizeCard({ ...card, fonts: { ...card.fonts, display: { family: "Comic Sans" } } }, { families }), /not one of the app's fonts/);
  assert.throws(() => normalizeCard({ ...card, colors: { ...card.colors, primary: "red; }" } }), /not valid/);
  assert.throws(() => normalizeCard({ ...card, logo: { light: "../../evil.png" } }), /not valid/);
  const ok = normalizeCard({ ...card, colors: { ...card.colors, primary: "#ABCDEF" }, logo: { light: "logo.png", dark: null } }, { families });
  assert.equal(ok.colors.primary, "#abcdef");
  assert.equal(ok.shape.radiusPx, 6);
});

test("an Identity without a card uses its preset; saving writes the card and a generated FRAME.md", () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, "identity.json"), JSON.stringify({ brand: { preset: "coral" } }));
  const before = loadCard(dir);
  assert.equal(before.own, false);
  assert.equal(before.card.source.preset, "coral");
  const card = { ...cardForPreset("cobalt-grid"), nameplate: { name: "Anna", title: "Coach", url: "anna.example" } };
  const saved = saveCard(dir, card, { families: familyNames(), now: new Date("2026-10-02T10:00:00Z") });
  assert.equal(saved.updatedAt, "2026-10-02T10:00:00.000Z");
  const after = loadCard(dir);
  assert.equal(after.own, true);
  assert.deepEqual(after.card, saved);
  const md = fs.readFileSync(path.join(dir, "brand", FRAME_FILE), "utf8");
  assert.match(md, /Generated from brand-identity-card\.json/);
  assert.match(md, /primary: "#1f2be0"/);
  assert.match(md, /display: \{ fontFamily: "Newsreader" \}/);
  assert.equal(frameMd(saved), md);
  assert.ok(fs.existsSync(path.join(dir, "brand", CARD_FILE)));
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---- tokens.css and the open-design gallery ---------------------------------------

test("tokens.css: every colour form, var() and color-mix, translucent colours over the background", async () => {
  const { parseColor, cssVars, cardFromTokens, pickFont } = await import("./brand/tokens.mjs");
  assert.deepEqual(parseColor("#ABC"), { hex: "#aabbcc", alpha: 1 });
  assert.equal(parseColor("rgba(255, 255, 255, 0.08)").alpha, 0.08);
  assert.equal(parseColor("rgb(0 0 0 / 50%)").alpha, 0.5);
  assert.equal(parseColor("hsl(0, 100%, 50%)").hex, "#ff0000");
  assert.equal(parseColor("222.2 84% 4.9%").hex, "#020817", "shadcn's bare HSL");
  assert.equal(parseColor("oklch(1 0 0)").hex, "#ffffff");
  assert.equal(parseColor("var(--x)", { "--x": "#123456" }).hex, "#123456");
  assert.equal(parseColor("color-mix(in oklab, #000000 50%, #ffffff)").hex, "#808080");
  assert.equal(parseColor("nonsense"), null);
  const vars = cssVars("/* :root { --bg: red } */ :root { --bg: #fff; --fg: #111; }\n.dark { --bg: #000; }");
  assert.deepEqual(vars, { "--bg": "#fff", "--fg": "#111" }, "only :root, comments ignored");
  const { card } = cardFromTokens(":root { --bg: #08090a; --fg: #f7f8f8; --surface: #191a1b; --border: rgba(255,255,255,0.08); --accent: #5e6ad2; --radius-md: 8px; --elev-ring: 0 0 0 1px var(--border); }", { families: familyNames() });
  assert.equal(card.colors.border, "#1c1d1e", "8% white over the near-black background");
  assert.equal(card.appearance, "dark");
  assert.equal(card.shape.corners, "small");
  assert.equal(card.shape.cards, "border");
  const shad = cardFromTokens(":root { --background: 0 0% 100%; --foreground: 222.2 84% 4.9%; --card: 0 0% 100%; --muted: 210 40% 96.1%; --muted-foreground: 215.4 16.3% 46.9%; --primary: 222.2 47.4% 11.2%; --accent: 210 40% 96.1%; --radius: 0.5rem; }", { families: familyNames() }).card;
  assert.equal(shad.colors.muted, "#64748b", "shadcn: muted text is --muted-foreground, not the --muted fill");
  assert.equal(shad.colors.primary, "#0f172a", "shadcn: --primary, not the --accent fill");
  // fonts: in stack order, the brand font to its free stand-in
  assert.equal(pickFont('"sohne-var", "Söhne", "SF Pro Display", system-ui, sans-serif', familyNames()).family, "Inter");
  assert.equal(pickFont('"GeistMono", "Roboto Mono", monospace', familyNames(), "monospace").family, "Geist Mono");
  assert.equal(pickFont('"Nike Futura ND", Helvetica, sans-serif', familyNames()).family, "Jost");
  assert.equal(pickFont("Georgia, serif", familyNames(), "serif").family, "Source Serif 4");
  assert.equal(pickFont('"Playfair Display", serif', familyNames()).family, "Playfair Display");
});

test("the open-design gallery: 152 styles, all valid cards with shipped fonts, named as styles", async () => {
  const { openDesignCards, galleryCards, cardForLook } = await import("./brand/gallery.mjs");
  const od = openDesignCards({ fresh: true });
  assert.equal(od.length, 152);
  const families = familyNames();
  for (const s of od) {
    assert.match(s.id, /^od-[a-z0-9-]+$/);
    assert.match(s.label, / style$/);
    assert.doesNotThrow(() => normalizeCard(s.card, { families }), s.id);
  }
  const stripe = od.find((s) => s.id === "od-stripe");
  assert.equal(stripe.label, "Stripe style");
  assert.equal(stripe.card.colors.primary, "#533afd");
  assert.equal(stripe.group, "Fintech & Crypto");
  assert.equal(galleryCards().length, 163);
  assert.equal(cardForLook("od-stripe").colors.primary, "#533afd");
  assert.equal(cardForLook("nope").source.preset, "blue-professional");
  // only tokens and manifests are shipped, never brand prose, logos or fonts
  const root = path.join(libraryDir(), "opendesign");
  const shipped = fs.readdirSync(root, { recursive: true }).filter((f) => fs.statSync(path.join(root, f)).isFile()).map((f) => path.basename(f));
  assert.deepEqual([...new Set(shipped)].sort(), ["LICENSE", "SOURCE.json", "manifest.json", "tokens.css"]);
});

// ---- fonts ------------------------------------------------------------------------

test("every shipped font has every letter of the 10 content languages (read from the files)", () => {
  const index = fontsIndex(libraryDir());
  assert.ok(index.families.length >= 18);
  for (const fam of index.families) {
    const points = new Set();
    for (const f of fam.files) for (const c of codepoints(fs.readFileSync(path.join(libraryDir(), "fonts", fam.id, f.file)))) points.add(c);
    const gaps = Object.entries(coverage(points)).filter(([, g]) => g);
    assert.deepEqual(gaps, [], fam.family);
    assert.ok(fs.existsSync(path.join(libraryDir(), "fonts", fam.id, "LICENSE")), `${fam.family} has its licence`);
  }
  assert.deepEqual(Object.keys(LANGUAGE_LETTERS).sort(), Object.keys(SAMPLE_LINE).sort());
});

test("the cmap reader sees a missing letter (a TTF without ő)", () => {
  // a minimal TrueType with only a format 4 cmap for A-Z
  const cmap = Buffer.alloc(4 + 8 + 16 + 2 * 4 * 2);
  cmap.writeUInt16BE(0, 0);
  cmap.writeUInt16BE(1, 2);
  cmap.writeUInt16BE(3, 4);
  cmap.writeUInt16BE(1, 6);
  cmap.writeUInt32BE(12, 8);
  const st = 12;
  cmap.writeUInt16BE(4, st);
  cmap.writeUInt16BE(4, st + 6); // segCountX2: A-Z and the 0xFFFF end
  const ends = st + 14;
  cmap.writeUInt16BE(0x5a, ends);
  cmap.writeUInt16BE(0xffff, ends + 2);
  cmap.writeUInt16BE(0x41, ends + 6);
  cmap.writeUInt16BE(0xffff, ends + 8);
  cmap.writeInt16BE(-0x40, ends + 10);
  cmap.writeInt16BE(1, ends + 12);
  const head = Buffer.alloc(12 + 16);
  head.writeUInt32BE(0x00010000, 0);
  head.writeUInt16BE(1, 4);
  head.write("cmap", 12, "latin1");
  head.writeUInt32BE(28, 20);
  head.writeUInt32BE(cmap.length, 24);
  const points = codepoints(Buffer.concat([head, cmap]));
  assert.ok(points.has(0x41) && points.has(0x5a) && !points.has(0x151));
  assert.match(coverage(points).hu, /ő/);
});

test("a build gets the card's fonts as local files with @font-face; one-weight fonts never get a fake bold", () => {
  const card = cardForPreset("coral");
  const { css, files } = fontFaces(cardFamilies(card));
  assert.ok(files.every((f) => fs.existsSync(f.from) && f.to.startsWith("fonts/")));
  assert.match(css, /font-family: 'Bebas Neue'; font-style: normal; font-display: block; font-weight: 100 900; src: url\('fonts\/bebas-neue\/latin-400-normal\.woff2'\)/);
  assert.match(css, /font-family: 'Inter';[^}]*font-weight: 100 900;[^}]*latin-wght-normal/, "a variable font declares its axis");
  assert.doesNotMatch(css, /https?:/);
  assert.deepEqual(fontFaces(["Comic Sans"]).files, [], "a family the app does not ship is skipped");
});

test("the assembled build names no font that would be fetched, and links no font from the web", async () => {
  const { assemble } = await import("./gates/build/assemble.mjs");
  const { sampleSentences } = await import("./brand/preview.mjs");
  const dir = tmp();
  const card = cardForPreset("code-editorial");
  fs.writeFileSync(path.join(dir, "sentences.json"), JSON.stringify(sampleSentences(5)));
  fs.writeFileSync(path.join(dir, "scenes.json"), JSON.stringify({ scenes: sampleScenes(card, "hu") }));
  fs.mkdirSync(path.join(dir, "audio"));
  fs.writeFileSync(path.join(dir, "audio", "vo_bgm.mp3"), "");
  const look = { theme: cardTheme(card), families: cardFamilies(card), light: true };
  await assemble(dir, { total: 20, look, language: "hu" });
  const html = fs.readFileSync(path.join(dir, "build", "index.html"), "utf8");
  for (const fam of cardFamilies(card)) assert.match(html, new RegExp(`@font-face \\{ font-family: '${fam}'`), fam);
  const all = [html, ...fs.readdirSync(path.join(dir, "build", "compositions", "components")).map((f) => fs.readFileSync(path.join(dir, "build", "compositions", "components", f), "utf8"))].join("\n");
  assert.doesNotMatch(all, /fonts\.googleapis|fonts\.gstatic/);
  assert.ok(fs.existsSync(path.join(dir, "build", "fonts", "eb-garamond", "latin-ext-wght-normal.woff2")));
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---- dictionary -------------------------------------------------------------------

const DICT = {
  schema: "dictionary/1",
  preferred: [{ term: "Owner", note: "capital O" }, { term: "vidrev" }],
  banned: [{ term: "blasting email", instead: "sending to your list" }, { term: "hustle" }],
  distinct: [{ a: "YouTube Subscriber", b: "Email Subscriber" }],
  positions: [{ against: "hustle culture", kind: "phenomenon", stance: "Calm growth beats grinding." }, { against: "A Person", kind: "person" }],
};

test("dictionary check: banned words and other spellings, with word boundaries, any case and accents", () => {
  const f = checkText(DICT, "Every owner wants more. Owner first. Stop Blasting   Émail now. Vidrev helps. Use Vidrev. The hustlers stay.", "s1");
  assert.deepEqual(
    f.map((x) => [x.kind, x.found]),
    [
      ["banned", "Blasting   Émail"],
      ["spelling", "owner"],
      ["spelling", "Vidrev"],
    ],
  );
  assert.equal(f[0].instead, "sending to your list");
  assert.deepEqual(checkText(DICT, "Hustlers and hustling are other words."), [], "a longer word is not the banned one");
  assert.deepEqual(checkText(EMPTY, "hustle"), []);
});

test("dictionary: cleaned on save, invalid refused, its lists go into the script data, the prompt says how", () => {
  const dir = tmp();
  const saved = saveDictionary(dir, { preferred: [{ term: "  Owner " }, { term: "owner" }, { term: "" }], banned: [{ term: "x", instead: "" }], positions: [{ against: "y", kind: "nonsense" }] });
  assert.deepEqual(saved.preferred, [{ term: "Owner" }], "trimmed, repeats and empty rows dropped");
  assert.deepEqual(saved.banned, [{ term: "x" }]);
  assert.deepEqual(saved.positions, [{ against: "y" }]);
  assert.deepEqual(loadDictionary(dir), { ...EMPTY, ...saved });
  assert.deepEqual(loadDictionary(path.join(dir, "nope")), EMPTY);
  assert.throws(() => normalizeDictionary({ banned: [{ term: "a".repeat(201) }] }), /not valid/);
  const data = buildData({ topic: "t", dictionary: dictionaryData(DICT) });
  assert.deepEqual(data.dictionary.bannedWords[0], { term: "blasting email", insteadSay: "sending to your list" });
  assert.equal(data.dictionary.standsAgainst[1].kind, "person");
  assert.equal(buildData({ topic: "t", dictionary: dictionaryData(EMPTY) }).dictionary, undefined);
  const system = buildMessages(data)[0].content;
  assert.match(system, /## Dictionary/);
  assert.match(system, /"person", speak about\s+them only as opinion/);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---- the runner protocol ----------------------------------------------------------

function run(cmd, req) {
  const r = spawnSync(process.execPath, [path.join(here, "main.mjs"), cmd], { input: JSON.stringify(req), encoding: "utf8" });
  const last = r.stdout.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).at(-1);
  return { status: r.status, last };
}

test("main.mjs: brand-state, brand-save, dictionary-save and -check through the protocol", () => {
  const dir = tmp();
  const state = run("brand-state", { identityDir: dir }).last.data;
  assert.equal(state.own, false);
  assert.equal(state.card.source.preset, "blue-professional");
  assert.equal(state.presets.length, 163, "11 HyperFrames presets and 152 open-design styles");
  assert.equal(state.presets[0].id, "blue-professional");
  assert.match(state.styleNote, /Not affiliated with or endorsed by the brands named/);
  assert.ok(state.fonts.find((f) => f.family === "Inter").files.length >= 2);
  const card = { ...state.presets.find((p) => p.id === "capsule").card, nameplate: { name: "Anna" } };
  const imported = run("brand-import", { text: ":root { --bg: #0b0b0c; --fg: #f2f2f2; --accent: oklch(0.7 0.15 250); --font-display: 'Söhne', sans-serif; }", fileName: "my-tokens.css" }).last.data;
  assert.equal(imported.card.colors.background, "#0b0b0c");
  assert.equal(imported.card.source.kind, "import");
  assert.equal(imported.card.fonts.display.family, "Inter");
  assert.match(run("brand-import", { text: "body { color: red }" }).last.message, /No background colour/);
  const saved = run("brand-save", { identityDir: dir, card }).last.data;
  assert.equal(saved.own, true);
  assert.equal(run("brand-state", { identityDir: dir }).last.data.card.nameplate.name, "Anna");
  assert.match(run("brand-save", { card }).last.message, /No Identity/);
  assert.equal(run("dictionary-save", { identityDir: dir, dictionary: DICT }).last.data.dictionary.banned.length, 2);
  const proj = path.join(dir, "video");
  fs.mkdirSync(proj);
  fs.writeFileSync(path.join(proj, "script.json"), JSON.stringify({ open: { problem: "Stop blasting email." }, sections: [{ narration: "Be an owner." }] }));
  fs.writeFileSync(path.join(proj, "scenes.json"), JSON.stringify({ scenes: [{ component: "per-word-rise", vars: { text: "No more hustle" } }] }));
  const findings = run("dictionary-check", { projectDir: proj, identityDir: dir }).last.data.findings;
  assert.deepEqual(findings.map((f) => `${f.kind} ${f.where}`), ["banned script open.problem", "spelling script sections[0].narration", "banned scene 1 text"]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("cardTheme: a main colour that fails 3:1 is darkened for the video only", () => {
  const card = { ...cardForPreset(presetCards()[0].id) };
  card.colors = { ...card.colors, background: "#fffdf5", primary: "#fe90e8" };
  const t = cardTheme(card);
  assert.ok(contrast(t.brand, "#fffdf5") >= 3, `brand ${t.brand} is readable`);
  assert.equal(card.colors.primary, "#fe90e8", "the card keeps its colour");
  card.colors.primary = "#1d4f9c";
  assert.equal(cardTheme(card).brand, "#1d4f9c", "a passing colour is unchanged");
});

test("every preset's accent colours read on its background, 3:1 (sampler, 2026-10-06)", () => {
  for (const id of ["blue-professional", "biennale-yellow", "blockframe", "broadside", "capsule", "cartesian", "cobalt-grid", "code-editorial", "coral", "creative-mode", "editorial-forest"]) {
    const t = cardTheme(cardForPreset(id));
    for (const k of ["brand", "accent", "accent-2"]) assert.ok(contrast(t[k], t.bg) >= 3, `${id} ${k} ${t[k]} on ${t.bg}`);
  }
});
