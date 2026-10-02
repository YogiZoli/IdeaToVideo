// Settings sub-pages: every onboarding step (except the Planner import, which
// has no fields yet) is on exactly one page, so nothing is lost or doubled.
// The App group holds only the App's AI step; every other step belongs to an
// Identity (docs/identity.md 2).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { SETTINGS_PAGES } from "../../app/src/lib/pages.ts";

test("every step is on exactly one Settings page", () => {
  const src = fs.readFileSync(new URL("../../app/src/lib/steps.ts", import.meta.url), "utf8");
  const ids = [...src.matchAll(/\{ id: "(\w+)", title:/g)].map((m) => m[1]).filter((id) => id !== "import");
  assert.ok(ids.length >= 12);
  const onPages = SETTINGS_PAGES.flatMap((p) => p.steps);
  assert.deepEqual([...onPages].sort(), [...ids].sort());
  assert.equal(new Set(SETTINGS_PAGES.map((p) => p.id)).size, SETTINGS_PAGES.length);
});

test("the App group holds only the App's AI step", () => {
  const appSteps = SETTINGS_PAGES.filter((p) => p.group === "app").flatMap((p) => p.steps);
  assert.deepEqual(appSteps, ["ai"]);
  assert.ok(SETTINGS_PAGES.some((p) => p.group === "identity" && p.steps.includes("name")));
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
