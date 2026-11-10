// Settings sub-pages: every onboarding step (except the Planner import, which
// has no fields yet) is on exactly one page, so nothing is lost or doubled.
// The App's pages hold only the App's AI step; every other step belongs to an
// Identity (docs/identity.md 2). The top menu (DECISIONS 119).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { SETTINGS_PAGES, SUB_PAGES, MENUS, firstPage, menuOf, menusFor, pagesFor } from "../../app/src/lib/pages.ts";
import { IMPORTS, EXPORTS, transfersFor } from "../../app/src/lib/transferList.ts";
import { ofApp } from "../../app/src/lib/split.ts";

test("every step is on exactly one Settings page", () => {
  const src = fs.readFileSync(new URL("../../app/src/lib/steps.ts", import.meta.url), "utf8");
  const ids = [...src.matchAll(/\{ id: "(\w+)", title:/g)].map((m) => m[1]).filter((id) => id !== "import");
  assert.ok(ids.length >= 12);
  const onPages = SETTINGS_PAGES.flatMap((p) => p.steps);
  assert.deepEqual([...onPages].sort(), [...ids].sort());
  assert.equal(new Set(SETTINGS_PAGES.map((p) => p.id)).size, SETTINGS_PAGES.length);
});

test("the App's pages hold only the App's AI step", () => {
  const appSteps = SETTINGS_PAGES.filter((p) => p.scope === "app").flatMap((p) => p.steps);
  assert.deepEqual(appSteps, ["ai"]);
  assert.ok(SETTINGS_PAGES.some((p) => p.scope === "identity" && p.steps.includes("name")));
});

test("the top menu (DECISIONS 119, 168, 172, 175, 184): seven menus, at most seven pages each, every old page kept", () => {
  assert.deepEqual(MENUS.map((m) => m.title), ["Home", "ONE Video", "Identity", "Wizards", "Playlist", "Publishing", "Settings"]);
  assert.ok(!MENUS.some((m) => m.id === "edit"), "Video Recording Editing is RecCut now");
  for (const m of ["playlist", "publishing", "wizards", "identity", "settings"]) {
    const n = SETTINGS_PAGES.filter((p) => p.menu === m).length;
    assert.ok(n >= 1 && n <= 7, `${m}: ${n} pages`);
  }
  assert.deepEqual(SETTINGS_PAGES.filter((p) => p.menu === "playlist").map((p) => p.title), ["Keyword Research", "Playlist Planner", "Create Playlist File"]);
  assert.deepEqual(SETTINGS_PAGES.filter((p) => p.menu === "publishing").map((p) => p.title), ["Thumbnail", "PDT Connection"]);
  assert.deepEqual(SETTINGS_PAGES.filter((p) => p.menu === "wizards").map((p) => p.title), ["YouTube Brand Channel Wizard", "CTA", "Design", "Motion", "Scenes"]);
  assert.deepEqual(SETTINGS_PAGES.filter((p) => p.menu === "identity").map((p) => p.title), ["YouTube Channel & Audience", "Audio Voice", "AI Avatar", "Footage", "Dictionary", "Manage Identity"]);
  assert.deepEqual(SETTINGS_PAGES.filter((p) => p.menu === "settings").map((p) => p.title), ["Health check", "Connections", "Import & Export", "Folders", "Backup", "Account Plan", "Legal"]);
  for (const id of ["folders", "backup", "plan", "legal", "identity", "channel", "look", "motion", "cta", "scenes", "footage", "dictionary", "voice", "avatar", "research", "connections", "transfer", "planner", "courses", "thumbnail", "pdt"]) {
    assert.ok(SETTINGS_PAGES.some((p) => p.id === id), id);
  }
  assert.equal(firstPage("wizards"), "brandchannel");
  assert.equal(firstPage("settings"), "health");
  assert.equal(menuOf("connections"), "settings");
  assert.equal(menuOf("planner"), "playlist");
});

test("a big page has its parts as sub links (DECISIONS 168), and a link to another page goes to one that exists", () => {
  assert.deepEqual(SUB_PAGES.connections.map((s) => s.title), ["AI Apps", "AI Services", "Which AI for which job", "Remove all keys"]);
  assert.deepEqual(SUB_PAGES.footage.map((s) => s.title), ["Your footage", "AI B-roll", "Stock photos and videos", "Free images"]);
  for (const subs of Object.values(SUB_PAGES)) for (const s of subs) if (s.page) assert.ok(SETTINGS_PAGES.some((p) => p.id === s.page), s.page);
});

test("a video from a script starts on Home; a recording in RecCut (DECISIONS 172, 184)", () => {
  const page = fs.readFileSync(new URL("../../app/src/routes/+page.svelte", import.meta.url), "utf8");
  assert.match(page, /only="script"/);
  assert.doesNotMatch(page, /only="recorded"/);
  assert.match(page, /To edit a recording, open RecCut\./);
  assert.match(page, /<NewRecording/);
  const studio = fs.readFileSync(new URL("../../app/src/lib/channels/ChannelStudio.svelte", import.meta.url), "utf8");
  assert.doesNotMatch(studio, /aria-label="Direction"/);
});

test("Home's order, and the recording page has only the recording (DECISIONS 175)", () => {
  const page = fs.readFileSync(new URL("../../app/src/routes/+page.svelte", import.meta.url), "utf8");
  const [today, latest, studio] = ["<TodayVideo", "<Home ", 'only="script"'].map((x) => page.indexOf(x));
  assert.ok(today >= 0 && today < latest && latest < studio, "Today's video, the latest videos, then the Identity and the rest");
  const home = fs.readFileSync(new URL("../../app/src/lib/Home.svelte", import.meta.url), "utf8");
  assert.doesNotMatch(home, /<ChannelsBoard/);
  const health = fs.readFileSync(new URL("../../app/src/lib/HealthCheck.svelte", import.meta.url), "utf8");
  assert.match(health, /<VideoNeeds/, "what a video needs lives on the Health check");
  const s = fs.readFileSync(new URL("../../app/src/lib/channels/ChannelStudio.svelte", import.meta.url), "utf8");
  assert.doesNotMatch(s, /<h2>Identity<\/h2>/, "Home has no Identity section (DECISIONS 179)");
  assert.ok(s.lastIndexOf('{#if direction === "script"}', s.indexOf("The recipe of")) > 0);
  const menu = fs.readFileSync(new URL("../../app/src/lib/IdentityMenu.svelte", import.meta.url), "utf8");
  assert.equal(menu.match(/role="menuitem"/g).length, 1, "the switch only lists the Identities");
  const settings = fs.readFileSync(new URL("../../app/src/lib/Settings.svelte", import.meta.url), "utf8");
  for (const h of ["Add Identity", "Duplicate", "Export and import", "Delete"]) assert.ok(settings.includes(`<h2>${h}</h2>`), h);
  assert.match(settings, /<IdentityTransfer/);
});

test("Import & Export lists everything, and every Open goes to a page that exists (DECISIONS 175)", () => {
  assert.ok(IMPORTS.length >= 10 && EXPORTS.length >= 10);
  for (const r of [...IMPORTS, ...EXPORTS]) {
    assert.ok(r.what && r.files && r.where, r.what);
    if (r.page) assert.ok(SETTINGS_PAGES.some((p) => p.id === r.page), r.page);
  }
  assert.equal(new Set(IMPORTS.map((r) => r.what)).size, IMPORTS.length);
  assert.equal(new Set(EXPORTS.map((r) => r.what)).size, EXPORTS.length);
});

test("nothing asks the user to turn on Advanced any more (DECISIONS 168)", () => {
  const page = fs.readFileSync(new URL("../../app/src/routes/+page.svelte", import.meta.url), "utf8");
  assert.doesNotMatch(page, /Advanced/);
  assert.doesNotMatch(page, /type="checkbox"/);
  const bar = fs.readFileSync(new URL("../../app/src/lib/Advanced.svelte", import.meta.url), "utf8");
  assert.match(bar, /label = "More"/);
});

test("setup's preset list is the shipped one (library/presets.map.json)", async () => {
  // catalog.ts imports without extensions (Vite style), so read its text
  const src = fs.readFileSync(new URL("../../app/src/lib/catalog.ts", import.meta.url), "utf8");
  const block = src.slice(src.indexOf("export const PRESETS"), src.indexOf("];", src.indexOf("export const PRESETS")));
  const PRESETS = [...block.matchAll(/\{ id: "([a-z-]+)", label: "([^"]+)" \}/g)].map((m) => ({ id: m[1], label: m[2] }));
  const map = JSON.parse(fs.readFileSync(new URL("../../library/presets.map.json", import.meta.url), "utf8"));
  const shipped = Object.keys(map).filter((k) => !k.startsWith("$"));
  assert.deepEqual(PRESETS.map((p) => p.id), shipped);
  for (const p of PRESETS) assert.equal(p.label, map[p.id].label);
});

test("RecCut's menu is short, and its own Import & Export lists the recording (DECISIONS 184)", () => {
  assert.deepEqual(menusFor(true).map((m) => m.title), ["Home", "Identity", "Publishing", "Settings"]);
  const pages = pagesFor(true);
  const of = (m) => pages.filter((p) => p.menu === m).map((p) => p.title);
  assert.deepEqual(of("identity"), ["Footage", "Thumbnail photos"]);
  assert.deepEqual(of("publishing"), ["Thumbnail", "PDT Connection"]);
  assert.deepEqual(of("settings"), ["Connections", "Health check", "Backup", "Import & Export", "Legal"]);
  const ed = transfersFor(true);
  assert.ok(ed.imports.some((r) => r.what === "A recording to edit"));
  assert.ok(ed.exports.some((r) => /cleaned voice/.test(r.what)));
  assert.ok(!transfersFor(false).imports.some((r) => r.what === "A recording to edit"), "the recording row left IdeaToVideo");
  for (const r of [...ed.imports, ...ed.exports]) if (r.page) assert.ok(pages.some((p) => p.id === r.page), r.page);
  assert.ok(pagesFor(false).some((p) => p.id === "footage"), "Footage stays in IdeaToVideo");
});

test("each app lists only its own videos (DECISIONS 184)", () => {
  const rec = { recipe: { engine: "recorded" } };
  const script = { recipe: { engine: "script" } };
  const old = { recipe: null };
  assert.deepEqual([rec, script, old].filter(ofApp(true)), [rec]);
  assert.deepEqual([rec, script, old].filter(ofApp(false)), [script, old]);
});
