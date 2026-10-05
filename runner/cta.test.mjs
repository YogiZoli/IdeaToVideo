// cta.test.mjs: the CTA wizard's comment calls (docs/wizards/cta.md): the
// keyword list, the Identity's cta.json, the script, the scene table, the
// button colour and the voice.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { KEYWORDS, TEMPERATURES, DEFAULT_SLOTS, PLACES_FOR_COUNT, SLOT_IDS, keywordInfo } from "./cta/catalog.mjs";
import { normalizeProfile, saveProfile, loadProfile, ctaPlan, videoPlan, defaultProfile } from "./cta/profile.mjs";
import { buildData, checkScript, commentCallIssues, renderMarkdown } from "./gates/script/index.mjs";
import { callSentences, checkScenes, libraryCatalog } from "./gates/scenes/index.mjs";
import { callColor } from "./gates/build/assemble.mjs";
import { contrast } from "./brand/card.mjs";
import { speakable } from "./gates/voice/narration.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "itv-cta-"));

// The comment-reply tool's own list (its keyword catalog, 2026-10-05). Change
// it only when that list changes: a keyword it does not know never gets a reply.
test("the 15 keywords, their temperatures and what the viewer gets, exactly as the reply tool has them", () => {
  assert.deepEqual(KEYWORDS.map((k) => `${k.keyword} ${k.temperature} ${k.gets}`), [
    "GUIDE cold a free guide",
    "CHECKLIST cold a checklist",
    "TEMPLATE cold a template",
    "PDF cold a free PDF",
    "START cold where to start",
    "TRAINING warm a free training",
    "WORKSHOP warm a workshop seat",
    "WEBINAR warm a webinar seat",
    "COURSE warm course details",
    "SURVEY warm a short survey",
    "TRIGGER hot a link to buy now",
    "CALL hot a call with you",
    "BUY hot a link to buy",
    "APPLY hot an application",
    "ACTION hot the next step",
  ]);
  assert.deepEqual(Object.keys(TEMPERATURES), ["cold", "warm", "hot"]);
  assert.deepEqual(DEFAULT_SLOTS, { start: "GUIDE", middle: "COURSE", end: "TRIGGER" }, "the method: cold, warm, hot (Zoltan, 2026-10-05)");
  assert.deepEqual(PLACES_FOR_COUNT, { 0: [], 1: ["end"], 2: ["start", "end"], 3: ["start", "middle", "end"] }, "fewer calls drop the middle first");
  assert.equal(keywordInfo(" guide ").keyword, "GUIDE");
  assert.equal(keywordInfo("DOWNLOAD"), null, "retired from the list");
});

test("cta.json: any keyword in any place, repeats allowed, unknown keywords refused, offers cleaned", () => {
  const p = normalizeProfile({ slots: { start: "guide", middle: null, end: "GUIDE" }, offers: { guide: "  the 7 step   checklist ", COURSE: "" } });
  assert.deepEqual(p.slots, { start: "GUIDE", middle: null, end: "GUIDE" });
  assert.deepEqual(p.offers, { GUIDE: "the 7 step checklist" });
  assert.throws(() => normalizeProfile({ slots: { start: "FREE" } }), /Unknown keyword at start: FREE/);
  assert.throws(() => normalizeProfile({ slots: { start: "GUIDE" }, offers: { LINK: "x" } }), /Unknown keyword in the offers/);
  assert.throws(() => normalizeProfile({ slots: { start: "GUIDE", later: "CALL" } }), /not valid/);
  const plan = ctaPlan(p);
  assert.deepEqual(plan.map((c) => `${c.slot} ${c.keyword} ${c.temperature} ${c.offer ?? c.gets}`), ["start GUIDE cold the 7 step checklist", "end GUIDE cold the 7 step checklist"]);
  assert.deepEqual(ctaPlan(null).map((c) => c.keyword), ["GUIDE", "COURSE", "TRIGGER"], "no file: the default");
  assert.deepEqual(ctaPlan(normalizeProfile({ slots: { start: null, middle: null, end: null } })), [], "0 calls");

  const dir = tmp();
  assert.equal(loadProfile(dir), null);
  const saved = saveProfile(dir, { slots: { start: null, middle: "WEBINAR", end: "CALL" } });
  assert.ok(saved.updatedAt);
  assert.deepEqual(loadProfile(dir).slots, { start: null, middle: "WEBINAR", end: "CALL" });
  assert.deepEqual(videoPlan({ identityDir: dir }).map((c) => c.keyword), ["WEBINAR", "CALL"]);
  assert.deepEqual(videoPlan({ identityDir: dir, own: { slots: { end: "BUY" } } }).map((c) => c.keyword), ["BUY"], "the video's own choice wins");
  fs.rmSync(dir, { recursive: true, force: true });
});

const goodScript = () => ({
  title: "Own your audience",
  open: { problem: "Your followers are rented.", promise: "You will learn three steps to own them.", cta: "Comment GUIDE below and I'll send you the free checklist.", credibility: null },
  sections: [
    { name: "Rented", narration: "This guide shows why followers are rented.", callout: null, highestValue: false },
    { name: "Owned", narration: "An email list is owned.", callout: null, highestValue: true },
  ],
  ownershipCta: "If you want to go deeper, comment COURSE and I'll send you the course details.",
  own: { recap: "Own the connection.", cta: "Comment TRIGGER now and get the link to start today.", nextVideo: null },
});
const calls = ctaPlan(null);

test("script: the comment calls replace the link CTA, each in its own place, the keyword only there", () => {
  const data = buildData({ topic: "t", channel: { ctaText: "Get the checklist", landingUrl: "https://x.example" }, commentCalls: calls });
  assert.equal(data.cta, null, "the link is in the description, never in the narration (K10)");
  assert.deepEqual(data.commentCalls.map((c) => `${c.place} ${c.keyword} ${c.gets}`), ["start GUIDE a free guide", "middle COURSE course details", "end TRIGGER a link to buy now"]);
  assert.equal(buildData({ topic: "t", channel: { ctaText: "x", landingUrl: "https://x.example" } }).cta, null, "no calls: no call at all");
  assert.equal(buildData({ topic: "t", commentCalls: [{ ...calls[0], offer: "my checklist" }] }).commentCalls[0].offer, "my checklist");

  assert.deepEqual(checkScript(goodScript(), data), []);
  const lower = goodScript();
  lower.own.cta = "Comment trigger now.";
  assert.match(commentCallIssues(lower, data.commentCalls).join(), /own.cta must contain the keyword TRIGGER exactly, in capital letters/);
  const extra = goodScript();
  extra.sections[0].narration = "Comment GUIDE twice.";
  assert.match(commentCallIssues(extra, data.commentCalls).join(), /sections\[0\].narration: the keyword GUIDE belongs only in its comment call/);
  const onlyEnd = data.commentCalls.filter((c) => c.place === "end");
  assert.match(commentCallIssues(goodScript(), onlyEnd).join(), /open.cta must be null.*ownershipCta must be null/);
  const noCalls = goodScript();
  noCalls.ownershipCta = null;
  noCalls.own.cta = null;
  assert.match(checkScript(noCalls, { cta: null }).join(), /open.cta must be null/);

  const md = renderMarkdown(goodScript());
  const at = (t) => md.indexOf(t);
  assert.ok(at("Comment GUIDE") > at("You will learn three steps") && at("Comment GUIDE") < at("## 1. Rented"), "the start call right after the promise");
  assert.ok(at("comment COURSE") > at("An email list is owned.") && at("comment COURSE") < at("## OWN"), "the middle call after the highest-value section");
});

const sentences = [
  { id: "S1", start: 0, end: 3, dur: 3, text: "Your followers are rented." },
  { id: "S2", start: 3.2, end: 6, dur: 2.8, text: "You will learn three steps to own them." },
  { id: "S3", start: 6.2, end: 7.6, dur: 1.4, text: "Comment Guide below and I'll send you the free checklist." },
  { id: "S4", start: 7.8, end: 12, dur: 4.2, text: "This guide shows why followers are rented, and an email list is owned." },
];

test("scenes: a comment call gets its own cta-close scene, its button is the keyword, short is fine", () => {
  const script = { ...goodScript(), commentCalls: [{ slot: "start", keyword: "GUIDE", temperature: "cold" }] };
  const found = callSentences(script, sentences);
  assert.deepEqual([...found], [["S3", { slot: "start", keyword: "GUIDE", temperature: "cold" }]], "the sentence that says it, not the one that mentions a guide");
  const ok = {
    scenes: [
      { from: "S1", to: "S2", component: "titlecard-lockup", vars: { wordmark: "Own them" } },
      { from: "S3", component: "cta-close", vars: { action_line: "Comment GUIDE below", button_label: "Start now" } },
      { from: "S4", component: "per-word-rise", vars: { text: "Followers are rented" } },
    ],
  };
  const r = checkScenes(ok, { sentences, total: 12.5, calls: found });
  assert.deepEqual(r.issues, [], "1.4 s is allowed for a call");
  assert.equal(ok.scenes[1].vars.button_label, "GUIDE", "the button always says the keyword");
  const joined = { scenes: [ok.scenes[0], { from: "S3", to: "S4", component: "per-word-rise", vars: { text: "Comment GUIDE" } }] };
  assert.match(checkScenes(joined, { sentences, total: 12.5, calls: found }).issues.join(), /S3 is a comment call \(GUIDE\): give it a scene of its own/);
  const lower = structuredClone(ok);
  lower.scenes[1].vars.action_line = "Comment guide";
  assert.match(checkScenes(lower, { sentences, total: 12.5, calls: found }).issues.join(), /action_line must contain GUIDE/);
  assert.ok(!libraryCatalog().some((c) => c.name === "logo-brand-close"), "retired: never planned (K12)");
});

test("the call button wears its temperature, readable on light and dark looks", () => {
  for (const bg of ["#fffdf5", "#ffffff", "#0b0c0e", "#1e293b"]) {
    for (const temperature of Object.keys(TEMPERATURES)) {
      assert.ok(contrast(callColor({ temperature }, { bg }), bg) >= 4.5, `${temperature} on ${bg}`);
    }
  }
  assert.equal(callColor({ temperature: "cold" }, { bg: "#ffffff" }), "#2e6fe0", "unchanged where it already reads");
});

test("the voice says the keywords as words, PDF as letters", () => {
  assert.equal(speakable("Comment GUIDE below. Comment PDF, or TRIGGER. GUIDES stay."), "Comment Guide below. Comment PDF, or Trigger. GUIDES stay.");
});

function run(cmd, req) {
  const r = spawnSync(process.execPath, [path.join(here, "main.mjs"), cmd], { input: JSON.stringify(req), encoding: "utf8" });
  return r.stdout.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).at(-1);
}

test("main.mjs: cta-state, cta-check and cta-save through the protocol", () => {
  const dir = tmp();
  const st = run("cta-state", { identityDir: dir }).data;
  assert.equal(st.profile, null);
  assert.deepEqual(st.start.slots, defaultProfile().slots);
  assert.equal(st.options.keywords.length, 15);
  assert.deepEqual(Object.keys(st.options.slots), SLOT_IDS);
  assert.match(run("cta-check", { profile: { slots: { start: "FREE" } } }).message, /Unknown keyword/);
  const saved = run("cta-save", { identityDir: dir, profile: { slots: { start: "PDF", middle: null, end: "APPLY" }, offers: { APPLY: "a coaching spot" } } }).data.profile;
  assert.equal(saved.slots.start, "PDF");
  assert.equal(run("cta-state", { identityDir: dir }).data.profile.offers.APPLY, "a coaching spot");
  assert.match(run("cta-save", { profile: saved }).message, /No Identity/);
  fs.writeFileSync(path.join(dir, "cta.json"), "{ broken");
  assert.match(run("cta-state", { identityDir: dir }).message, /The CTA profile cannot be used/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("publish.json and comments.txt: facts for the publishing tool, valid against itv-publish/1", async () => {
  const { writeExtras } = await import("./gates/render/export.mjs");
  const { validate, loadSchema } = await import("./schema/validate.mjs");
  const dir = tmp();
  const script = { ...goodScript(), commentCalls: [{ slot: "start", keyword: "GUIDE", temperature: "cold", gets: "a free guide", offer: "the free checklist" }], publishing: { searchKeyword: "own your audience", landingUrl: "https://x.example/start", nextVideo: null, playlist: null } };
  fs.writeFileSync(path.join(dir, "script.json"), JSON.stringify(script));
  fs.writeFileSync(path.join(dir, "sentences.json"), JSON.stringify(sentences));
  fs.writeFileSync(path.join(dir, "words.json"), JSON.stringify(sentences.flatMap((s) => s.text.split(" ").map((w, i, a) => ({ text: w, start: s.start + (s.dur * i) / a.length, end: s.start + (s.dur * (i + 1)) / a.length })))));
  fs.writeFileSync(path.join(dir, "script.md"), "# T\n\n## OPEN\n\nYour followers are rented. You will learn three steps to own them. Comment GUIDE below and I'll send you the free checklist.\n\n## 1. Rented\n\nThis guide shows why followers are rented, and an email list is owned.\n");
  fs.mkdirSync(path.join(dir, "out"));
  const video = path.join(dir, "out", "video-1.mp4");
  const r = writeExtras(dir, video, { language: "en", total: 12.5, project: { title: "Own your audience" } });
  const pub = JSON.parse(fs.readFileSync(r.publishFile, "utf8"));
  assert.deepEqual(validate(pub, loadSchema("itv-publish")), []);
  assert.equal(pub.video.title, "Own your audience");
  assert.equal(pub.landingUrl, "https://x.example/start");
  assert.deepEqual(pub.commentCalls, [{ slot: "start", keyword: "GUIDE", temperature: "cold", gets: "the free checklist", start: 6.2, end: 7.6 }]);
  assert.equal(pub.script[0].heading, "OPEN");
  assert.equal(pub.sentences.length, 4);
  assert.match(r.comments, /GUIDE {2}\(Cold, at 0:06\) {2}viewer gets: the free checklist/);
  assert.match(fs.readFileSync(r.commentsFile, "utf8"), /Landing page: https:\/\/x.example\/start/);
  fs.rmSync(dir, { recursive: true, force: true });
});
