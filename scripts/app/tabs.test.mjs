// The ONE Video tabs and the progress numbers (DECISIONS 85).
import test from "node:test";
import assert from "node:assert/strict";
import { tabStates, firstOpen, nextAfter, TABS } from "../../app/src/lib/tabs.ts";
import { fresh, apply, measure } from "../../app/src/lib/progressInfo.ts";

const gates = (states) => Object.fromEntries(Object.entries(states).map(([k, v]) => [k, { state: v }]));

test("a new video: Script is Now, the avatar is Optional, the rest Next", () => {
  const s = tabStates(gates({}), false, true);
  assert.deepEqual(s, { script: "now", voice: "next", scenes: "next", avatar: "optional", preview: "next", video: "next" });
  assert.equal(firstOpen(gates({}), false, true), "script");
});

test("with a HeyGen key the avatar is the step after the scenes; without one it is skipped", () => {
  const g = gates({ script: "approved", voice: "approved", scenes: "approved" });
  assert.equal(tabStates(g, false, true).avatar, "now");
  assert.equal(firstOpen(g, false, true), "avatar");
  assert.equal(tabStates(g, false, false).avatar, "optional");
  assert.equal(firstOpen(g, false, false), "preview");
  assert.equal(nextAfter("scenes", true), "avatar");
  assert.equal(nextAfter("scenes", false), "preview");
  assert.equal(tabStates(gates({ script: "approved", voice: "approved", scenes: "approved", avatar: "skipped" }), false, true).avatar, "done");
});

test("a failed step says Failed; a finished video opens on Your video", () => {
  assert.equal(tabStates(gates({ script: "approved", voice: "approved", scenes: "failed" }), false, true).scenes, "failed");
  const all = gates({ script: "approved", voice: "approved", scenes: "approved", avatar: "approved", review: "approved" });
  assert.equal(firstOpen(all, true, true), "video");
  assert.equal(tabStates(all, true, true).video, "done");
  assert.equal(nextAfter("preview", true), "video");
  assert.equal(nextAfter("video", true), "video");
  assert.deepEqual(TABS.map((t) => t.n), [1, 2, 3, 4, 5, 6]);
});

test("the render bar follows the frames and does not promise the end after the setup", () => {
  const t = fresh("render-video", "C:/P/x");
  apply(t, { step: "estimate", expectSeconds: 400 });
  const t0 = t.started;
  apply(t, { step: "render", percent: 3 });
  // two seconds of setup must not read as "finishing now"
  let m = measure(t, t0 + 2000);
  assert.ok(m.left > 300, `left ${m.left}`);
  t.realFrom = { at: t0, value: 3 };
  apply(t, { step: "render", percent: 49 });
  m = measure(t, t0 + 200000);
  assert.equal(m.percent, 49);
  assert.ok(m.left > 150 && m.left < 250, `left ${m.left}`);
});

test("a repaired or retried AI call makes the estimate longer", () => {
  const t = fresh("make-scenes", null);
  apply(t, { step: "estimate", expectSeconds: 100 });
  apply(t, { step: "repairing" });
  assert.equal(t.expect, 180);
  apply(t, { step: "retry" });
  assert.equal(t.expect, 188);
  apply(t, { step: "planning" });
  assert.equal(t.phase, "The AI is planning the scenes");
  apply(t, { step: "waiting", message: "Waits for the render" });
  assert.equal(t.waiting, "Waits for the render");
});
