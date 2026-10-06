// feedback.test.mjs: the fixes from Zoltan's test of 2026-10-05
// (feedback/2026-10-05/NOTES.md): empty stills, the CTA line running off the
// frame, list items all at once, the script too short, unused segments.

import { test } from "node:test";
import assert from "node:assert/strict";
import { speechCues, widerFit, trackingFit, CTA_ADVANCE, loadComponent } from "./gates/build/assemble.mjs";
import { withoutCamera, mountsOf } from "./gates/review/index.mjs";
import { lengthIssues } from "./gates/script/index.mjs";
import { ctaPlan, normalizeProfile } from "./cta/profile.mjs";

test("stills: the camera wrappers come off for the snapshots, the scenes and their times stay", () => {
  const html = [
    `    <div id="cam-1" class="itv-cam" style="position:absolute;inset:0;transform-origin:50% 50%">`,
    `      <div id="scene-1" class="clip scene" data-composition-id="per-word-rise" data-composition-src="a.html" data-start="0" data-duration="4.2" data-track-index="1" data-variable-values='{"text":"a > b"}' style="--bg: var(--itv-bg)"></div>`,
    `    </div>`,
    `      tl.fromTo("#cam-1", { x: 0, y: 0 }, { x: 1, duration: 4 }, 0);`,
    `      tl.to("#other", { x: 1 }, 0);`,
  ].join("\n");
  const out = withoutCamera(html);
  assert.ok(!/itv-cam|#cam-/.test(out));
  assert.match(out, /tl\.to\("#other"/);
  assert.deepEqual(mountsOf(out), mountsOf(html));
});

test("cta-close: the line is sized for wide brand faces", () => {
  const { html } = loadComponent("cta-close");
  const out = widerFit(html, "cta-close");
  assert.match(out, new RegExp(`actionCharacters \\* ${CTA_ADVANCE}`));
  assert.equal(widerFit(html, "per-word-rise"), html, "other components untouched");
  assert.throws(() => widerFit("<html></html>", "cta-close"), /changed upstream/);
});

const words = [
  { text: "Write,", start: 10.2, end: 10.5 },
  { text: "record,", start: 10.7, end: 11.1 },
  { text: "and", start: 11.2, end: 11.3 },
  { text: "publish.", start: 11.4, end: 11.9 },
  { text: "Later", start: 20, end: 20.3 },
];

test("speech cues: list items appear when the voice says them", () => {
  assert.equal(speechCues({ component: "grid-card-assemble", vars: { items: "Write,Record,Publish" } }, words, 10, 14), "0.2,0.7,1.4");
  assert.equal(speechCues({ component: "grid-card-assemble", vars: { items: "Write,Edit,Publish" } }, words, 10, 14), "0.2,,1.4", "the grid keeps its cascade for an unsaid item");
  assert.equal(speechCues({ component: "constellation-hub", vars: { nodes: "Write,Edit" } }, words, 10, 14), null, "the hub keeps its spread unless every node is said");
  assert.equal(speechCues({ component: "kinetic-type-swap", vars: { options: "Plan,Record,Publish" } }, words, 10, 14), "0.7,1.4", "the first option shows from the start");
  assert.equal(speechCues({ component: "grid-card-assemble", vars: { items: "Record,Publish" } }, words, 10, 14), "0.2,1.4", "the first card is there from the start, never an empty frame (2026-10-06)");
  assert.equal(speechCues({ component: "per-word-rise", vars: { text: "x" } }, words, 10, 14), null);
  assert.equal(speechCues({ component: "grid-card-assemble", vars: { items: "Later" } }, words, 10, 14), null, "only words inside the scene");
  assert.equal(speechCues({ component: "grid-card-assemble", vars: { items: "Write", cues: "1" } }, words, 10, 14), null, "a set cue stays");
});

test("script length: too short or too long is sent back once", () => {
  const script = (n) => ({ open: { problem: "a ".repeat(n).trim() }, sections: [] });
  assert.match(lengthIssues(script(318), { targetLengthMin: 3 }).join(), /318 spoken words, too short for 3 minutes: write about 450 words/);
  assert.deepEqual(lengthIssues(script(430), { targetLengthMin: 3 }), []);
  assert.match(lengthIssues(script(600), { targetLengthMin: 3 }).join(), /too long/);
});

test("segments: by default a place plays your segment when its keyword has one", () => {
  const segs = [{ id: "s1", keyword: "GUIDE", name: "g", file: "s1.mp4", seconds: 8, createdAt: "2026-10-05", lastUsedAt: null }];
  const plan = ctaPlan(normalizeProfile({ slots: { start: "GUIDE", middle: "WEBINAR", end: null } }), segs);
  assert.deepEqual(plan.map((c) => `${c.keyword} ${c.mode}`), ["GUIDE segment", "WEBINAR narrator"]);
  assert.equal(plan[1].note, undefined, "no note: nothing was asked for");
  assert.equal(ctaPlan(normalizeProfile({ slots: { start: "GUIDE" }, modes: { start: "narrator" }, modesV: 2 }), segs)[0].mode, "narrator", "an explicit narrator stays");
  assert.equal(ctaPlan(normalizeProfile({ slots: { start: "GUIDE" }, modes: { start: "narrator" } }), segs)[0].mode, "segment", "an older save's narrator was only the default: auto");
});

test("a scene under 2 s of its own joins its neighbour instead of failing the table", async () => {
  const { joinShort } = await import("./gates/scenes/index.mjs");
  const sentences = [
    { id: "S1", start: 0, end: 4, dur: 4, text: "One." },
    { id: "S2", start: 4.2, end: 9, dur: 4.8, text: "Two." },
    { id: "S3", start: 9.2, end: 10.9, dur: 1.7, text: "Three." },
  ];
  const a = { scenes: [{ from: "S1", component: "titlecard-lockup" }, { from: "S2", component: "per-word-rise" }, { from: "S3", component: "headline-slam" }] };
  const gaps = [{ start: 11.0, end: 31.2 }];
  assert.deepEqual(joinShort(a, { sentences, total: 31.2, gaps }).scenes.map((s) => `${s.from}-${s.to ?? s.from}`), ["S1-S1", "S2-S3"]);
  const call = new Map([["S2", { keyword: "GUIDE" }]]);
  assert.deepEqual(joinShort(a, { sentences, total: 31.2, gaps, calls: call }).scenes.length, 3, "never into a comment call scene, and no other neighbour");
});

test("tracking: never tighter than -0.01em in the build copy, positive tracking and the registry file untouched (2026-10-06)", () => {
  assert.equal(trackingFit("h1{letter-spacing: -0.5cqw} b{letter-spacing:-0.045em} i{letter-spacing: 0.3em} u{letter-spacing: 0}"), "h1{letter-spacing: -0.01em} b{letter-spacing: -0.01em} i{letter-spacing: 0.3em} u{letter-spacing: 0}");
  const slam = loadComponent("headline-slam").html;
  assert.match(slam, /letter-spacing: -0\.5cqw/, "the registry file keeps its own value");
  assert.doesNotMatch(trackingFit(slam), /letter-spacing:\s*-0\.5cqw/);
});
