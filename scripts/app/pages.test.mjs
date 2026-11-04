// Settings sub-pages: every onboarding step (except the Planner import, which
// has no fields yet) is on exactly one page, so nothing is lost or doubled.
// The App's pages hold only the App's AI step; every other step belongs to an
// Identity (docs/identity.md 2). The top menu (DECISIONS 119).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { SETTINGS_PAGES, SUB_PAGES, MENUS, firstPage, menuOf } from "../../app/src/lib/pages.ts";

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

test("the top menu (DECISIONS 119, 168, 172): eight menus, at most seven pages each, every old page kept", () => {
  assert.deepEqual(MENUS.map((m) => m.title), ["Home", "Videos", "Video Recording Editing", "Playlist", "Publishing", "Wizards", "Identity", "Settings"]);
  for (const m of ["playlist", "publishing", "wizards", "identity", "settings"]) {
    const n = SETTINGS_PAGES.filter((p) => p.menu === m).length;
    assert.ok(n >= 1 && n <= 7, `${m}: ${n} pages`);
  }
  assert.deepEqual(SETTINGS_PAGES.filter((p) => p.menu === "playlist").map((p) => p.title), ["Playlist Planner", "Keyword Research", "Course or Playlist File"]);
  assert.deepEqual(SETTINGS_PAGES.filter((p) => p.menu === "publishing").map((p) => p.title), ["Thumbnail", "PDT Connection"]);
  assert.deepEqual(SETTINGS_PAGES.filter((p) => p.menu === "wizards").map((p) => p.title), ["YouTube Brand Channel Wizard", "CTA", "Design", "Motion", "Scenes"]);
  assert.deepEqual(SETTINGS_PAGES.filter((p) => p.menu === "identity").map((p) => p.title), ["YouTube Channel & Audience", "Audio Voice", "AI Avatar", "Thumbnail", "Footage", "Dictionary", "Manage Identity"]);
  assert.deepEqual(SETTINGS_PAGES.filter((p) => p.menu === "settings").map((p) => p.title), ["Health check", "Connections", "Import & Export", "Folders", "Backup", "Account Plan", "Legal"]);
  for (const id of ["folders", "backup", "plan", "legal", "identity", "channel", "look", "motion", "cta", "scenes", "footage", "dictionary", "voice", "avatar", "photos", "research", "connections", "transfer", "planner", "courses", "thumbnail", "pdt"]) {
    assert.ok(SETTINGS_PAGES.some((p) => p.id === id), id);
  }
  assert.equal(firstPage("wizards"), "brandchannel");
  assert.equal(firstPage("settings"), "health");
  assert.equal(menuOf("connections"), "settings");
  assert.equal(menuOf("planner"), "playlist");
});

test("a big page has its parts as sub links (DECISIONS 168), and a link to another page goes to one that exists", () => {
  assert.deepEqual(SUB_PAGES.connections.map((s) => s.title), ["AI", "AI providers", "Services", "Publishing", "Remove all keys"]);
  assert.deepEqual(SUB_PAGES.footage.map((s) => s.title), ["Your footage", "AI B-roll", "Stock photos and videos", "Free images"]);
  assert.equal(SUB_PAGES.connections.find((s) => s.id === "publishing").page, "pdt");
  for (const subs of Object.values(SUB_PAGES)) for (const s of subs) if (s.page) assert.ok(SETTINGS_PAGES.some((p) => p.id === s.page), s.page);
});

test("a video from a script starts on Home, from a recording on Edit: no switch between them (DECISIONS 172)", () => {
  const page = fs.readFileSync(new URL("../../app/src/routes/+page.svelte", import.meta.url), "utf8");
  assert.match(page, /only="script"/);
  assert.match(page, /only="recorded"/);
  const studio = fs.readFileSync(new URL("../../app/src/lib/channels/ChannelStudio.svelte", import.meta.url), "utf8");
  assert.doesNotMatch(studio, /aria-label="Direction"/);
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
