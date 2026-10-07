// spoken.test.mjs: the spoken word highlighted in a scene's own text (DECISIONS 106).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spokenTimes, withSpoken } from "./gates/build/spoken.mjs";
import { loadComponent, libraryDir } from "./gates/build/assemble.mjs";
import fs from "node:fs";
import path from "node:path";

const words = [
  { text: "Start", start: 10.2, end: 10.6 },
  { text: "your", start: 10.6, end: 10.8 },
  { text: "first", start: 10.8, end: 11.1 },
  { text: "video", start: 11.1, end: 11.5 },
  { text: "today.", start: 11.5, end: 12.0 },
];
const have = fs.existsSync(path.join(libraryDir(), "components", "headline-slam", "headline-slam.html"));

test("each on-screen word the voice says gets its time in the scene; unsaid words are skipped", () => {
  const t = spokenTimes({ component: "headline-slam", vars: { text: "Start today" } }, words, 10, 13);
  assert.deepEqual(t, [{ i: 0, a: 0.2, b: 0.6 }, { i: 1, a: 1.5, b: 2 }]);
  assert.deepEqual(spokenTimes({ component: "headline-slam", vars: { text: "Begin now" } }, words, 10, 13), []);
  assert.deepEqual(spokenTimes({ component: "per-word-rise", vars: { text: "Start", split: "char" } }, words, 10, 13), [], "letters are not words");
  assert.deepEqual(spokenTimes({ component: "count-up", vars: {} }, words, 10, 13), []);
});

test("headline-slam: the shake is gone, the words change colour on its own timeline", { skip: !have && "library not fetched" }, () => {
  const html = loadComponent("headline-slam").html;
  const out = withSpoken(html, "headline-slam", [{ i: 0, a: 0.2, b: 0.6 }]);
  assert.doesNotMatch(out, /0\.55cqw|-0\.38cqw/);
  assert.match(out, /var said = \[\{"i":0,"a":0\.2,"b":0\.6\}\];[\s\S]*tl\.seek\(0\);/);
  assert.equal(withSpoken(html, "count-up", [{ i: 0, a: 0, b: 1 }]), html);
  assert.throws(() => withSpoken("<div></div>", "headline-slam", []), /changed upstream/);
});
