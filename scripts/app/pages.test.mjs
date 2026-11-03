// Settings sub-pages: every onboarding step (except the Planner import, which
// has no fields yet) is on exactly one page, so nothing is lost or doubled.
// The App's pages hold only the App's AI step; every other step belongs to an
// Identity (docs/identity.md 2). The top menu (DECISIONS 119).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { SETTINGS_PAGES, MENUS, firstPage, menuOf } from "../../app/src/lib/pages.ts";

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

test("the top menu (DECISIONS 119): five menus, at most seven pages each, every old page kept", () => {
  assert.deepEqual(MENUS.map((m) => m.title), ["Home", "Videos", "Wizards", "Identity", "Settings"]);
  for (const m of ["wizards", "identity", "settings"]) {
    const n = SETTINGS_PAGES.filter((p) => p.menu === m).length;
    assert.ok(n >= 1 && n <= 7, `${m}: ${n} pages`);
  }
  assert.deepEqual(SETTINGS_PAGES.filter((p) => p.menu === "wizards").map((p) => p.title), ["CTA", "Brand", "Motion", "Scenes", "Playlist Planner"]);
  assert.deepEqual(SETTINGS_PAGES.filter((p) => p.menu === "identity").map((p) => p.title), ["YouTube Channel & Audience", "Voice & Avatar", "Footage", "Dictionary", "Resources", "Manage Identity"]);
  assert.deepEqual(SETTINGS_PAGES.filter((p) => p.menu === "settings").map((p) => p.title), ["General", "Connections", "Import & Export", "Folders", "Backup", "Plan", "Health check"]);
  // the pages before: app-ai, identity-ai and publishing are now Connections
  for (const id of ["folders", "backup", "plan", "general", "identity", "channel", "look", "motion", "cta", "scenes", "footage", "dictionary", "voice", "research", "connections", "transfer"]) {
    assert.ok(SETTINGS_PAGES.some((p) => p.id === id), id);
  }
  assert.equal(firstPage("wizards"), "cta");
  assert.equal(menuOf("connections"), "settings");
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
