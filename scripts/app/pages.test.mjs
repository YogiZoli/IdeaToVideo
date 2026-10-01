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
