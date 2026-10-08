// segments.test.mjs: the CTA wizard's reusable segments (DECISIONS 78): the
// library, the plan (narrator or segment, never both), the voice with the
// segment's sound and the end-screen tail, and the build mounting the clip.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { addSegment, loadSegments, segmentFor, removeSegment, segmentsDir, SEGMENT_MAX_SECONDS, SEGMENT_TEXT_MAX } from "./cta/segments.mjs";
import { ctaPlan, normalizeProfile } from "./cta/profile.mjs";
import { makeVoice, insertAfter, VOICE_PROVIDERS } from "./gates/voice/index.mjs";
import { segmentClips, segmentVideo } from "./gates/build/assemble.mjs";
import { checkScenes } from "./gates/scenes/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const ffdir = path.join(here, "..", "app", "src-tauri", "ffmpeg");
const exe = process.platform === "win32" ? ".exe" : "";
const env = { ...process.env, HYPERFRAMES_FFMPEG_PATH: path.join(ffdir, "ffmpeg" + exe), HYPERFRAMES_FFPROBE_PATH: path.join(ffdir, "ffprobe" + exe) };
const haveFf = fs.existsSync(env.HYPERFRAMES_FFMPEG_PATH);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "itv-seg-"));

// A small test clip with sound: colour bars and a tone.
function clip(file, seconds, sound = true) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const args = ["-y", "-v", "error", "-f", "lavfi", "-i", `testsrc=size=320x180:rate=15:duration=${seconds}`];
  if (sound) args.push("-f", "lavfi", "-i", `sine=frequency=330:duration=${seconds}`);
  args.push("-c:v", "libx264", "-pix_fmt", "yuv420p", ...(sound ? ["-c:a", "aac", "-shortest"] : []), file);
  const r = spawnSync(env.HYPERFRAMES_FFMPEG_PATH, args);
  assert.equal(r.status, 0, String(r.stderr));
  return file;
}

test("the library: a keyword per segment, at most 30 s, at most one per keyword, a new clip replaces the old", { skip: !haveFf && "bundled ffmpeg not fetched" }, async () => {
  const dir = tmp();
  const seg = segmentsDir(dir);
  const add = async (name, seconds, keyword = "GUIDE") => {
    clip(path.join(seg, name), seconds);
    return addSegment({ identityDir: dir, file: name, keyword, name: "", env });
  };
  const a = await add("incoming-1.mp4", 2);
  assert.equal(a.keyword, "GUIDE");
  assert.equal(a.name, "GUIDE");
  await assert.rejects(add("incoming-2.mp4", SEGMENT_MAX_SECONDS + 2), /at most 30 s/);
  assert.equal(fs.existsSync(path.join(seg, "incoming-2.mp4")), false, "a refused clip is deleted");
  await assert.rejects(add("incoming-3.mp4", 1, "FREE"), /Pick the keyword/);
  assert.equal(loadSegments(dir)[0].id, a.id, "a refused clip leaves the old one in place");
  const b = await add("incoming-4.mp4", 1);
  assert.deepEqual(loadSegments(dir).map((s) => s.id), [b.id], "the second GUIDE clip replaces the first");
  assert.equal(fs.existsSync(path.join(seg, a.file)), false, "the replaced clip's file is gone");
  const c = await add("incoming-5.mp4", 1, "TRIGGER");
  assert.equal(segmentFor(loadSegments(dir), "GUIDE").id, b.id);
  assert.equal(segmentFor(loadSegments(dir), "TRIGGER").id, c.id);
  assert.equal(segmentFor(loadSegments(dir), "COURSE"), null, "no segment: the narrator says it");
  removeSegment(dir, b.id);
  assert.deepEqual(loadSegments(dir).map((s) => s.keyword), ["TRIGGER"]);
  assert.equal(fs.readdirSync(seg).filter((f) => f.endsWith(".mp4")).length, 1, "no file is left behind");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("the plan: a place is said by the narrator or played by a segment, never both", () => {
  const segs = [{ id: "s1", keyword: "GUIDE", name: "Guide clip", file: "s1.mp4", seconds: 8, createdAt: "2026-10-05", lastUsedAt: null }];
  const p = normalizeProfile({ slots: { start: "GUIDE", middle: "COURSE", end: "TRIGGER" }, modes: { start: "segment", end: "segment" } });
  const plan = ctaPlan(p, segs);
  assert.deepEqual(plan.map((c) => `${c.slot} ${c.keyword} ${c.mode}`), ["start GUIDE segment", "middle COURSE narrator", "end TRIGGER narrator"]);
  assert.equal(plan[0].segment.id, "s1");
  assert.match(plan[2].note, /No segment for TRIGGER yet, so the narrator says it/);
  assert.equal(p.endScreen, 20, "YouTube end screen: 20 s by default (DECISIONS 53)");
});

test("Generate with HeyGen (DECISIONS 119): the clip plays once it exists, the narrator says it until then", () => {
  const p = normalizeProfile({ slots: { start: "GUIDE", middle: null, end: null }, modes: { start: "heygen" }, modesV: 2 });
  assert.equal(p.modes.start, "heygen", "the choice is kept");
  const before = ctaPlan(p, []);
  assert.equal(before[0].mode, "narrator");
  assert.match(before[0].note, /No HeyGen clip for GUIDE yet/);
  const segs = [{ id: "h1", keyword: "GUIDE", name: "GUIDE", file: "h1.mp4", seconds: 5, source: "heygen", createdAt: "2026-10-08", lastUsedAt: null }];
  assert.equal(ctaPlan(p, segs)[0].mode, "segment");
});

test("one video's own choice (DECISIONS 120): upload, previous HeyGen clip, or none", () => {
  const segs = [
    { id: "u1", keyword: "GUIDE", name: "GUIDE", file: "u1.mp4", seconds: 9, source: "upload", createdAt: "2026-10-08", lastUsedAt: null },
    { id: "h1", keyword: "COURSE", name: "COURSE", file: "h1.mp4", seconds: 6, source: "heygen", createdAt: "2026-10-08", lastUsedAt: null },
  ];
  const plan = (mode) => ctaPlan(normalizeProfile({ slots: { start: "GUIDE", middle: "COURSE", end: null }, modes: { start: mode, middle: mode }, modesV: 2 }), segs).map((c) => c.mode).join(" ");
  assert.equal(plan("upload"), "segment narrator", "only the uploaded clip plays");
  assert.equal(plan("previous"), "narrator segment", "only the earlier HeyGen clip plays");
  assert.equal(plan("narrator"), "narrator narrator", "no avatar");
  assert.equal(plan("heygen-new"), "segment segment", "the new clip is made before the script and then plays");
});

test("where a segment goes: after OPEN, after the highest-value section, after OWN", () => {
  const blocks = [{ heading: "OPEN" }, { heading: "1. A" }, { heading: "2. B" }, { heading: "3. C" }, { heading: "OWN" }];
  assert.deepEqual(insertAfter(blocks, { sections: [{}, { highestValue: true }, {}] }), { start: 0, middle: 2, end: 4 });
  assert.deepEqual(insertAfter([{ heading: "x" }, { heading: "y" }, { heading: "z" }], null), { start: 0, middle: 1, end: 2 }, "a hand-edited script still works");
});

test("the voice: the segment's sound between the sections, silence for the end screen, words shifted", { skip: !haveFf && "bundled ffmpeg not fetched" }, async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, "script.md"), "# T\n\n## OPEN\n\nHello there.\n\n## 1. Rented\n\nFollowers are rented.\n\n## OWN\n\nOwn them.\n");
  clip(path.join(dir, "segments", "middle.mp4"), 3);
  fs.writeFileSync(path.join(dir, "script.json"), JSON.stringify({ sections: [{ name: "Rented", highestValue: true }], segmentCalls: [{ slot: "middle", keyword: "COURSE", temperature: "warm", file: "segments/middle.mp4", seconds: 3 }], endScreen: 5 }));
  const tone = path.join(dir, "tone.mp3");
  assert.equal(spawnSync(env.HYPERFRAMES_FFMPEG_PATH, ["-y", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=220:duration=1.5", "-c:a", "libmp3lame", tone]).status, 0);
  VOICE_PROVIDERS.stand_in = { speak: async ({ text }) => ({ audio: fs.readFileSync(tone), ext: "mp3", words: [{ text: text.split(" ")[0], start: 0.1, end: 0.6 }] }) };
  try {
    const info = await makeVoice({ projectDir: dir, narrator: { provider: "stand_in", voice: "x" }, apiKey: "k", env });
    assert.equal(info.inserts.length, 1);
    const g = info.inserts[0];
    assert.equal(g.slot, "middle");
    assert.ok(Math.abs(g.seconds - 3) < 0.15, `segment ${g.seconds} s`);
    assert.ok(Math.abs(g.start - (1.5 + 0.6 + 1.5 + 0.6)) < 0.2, `after the second block: ${g.start}`);
    assert.equal(info.endScreen.seconds, 5);
    assert.ok(Math.abs(info.seconds - (info.endScreen.start + 5)) < 0.2, `ends with the tail: ${info.seconds}`);
    const words = JSON.parse(fs.readFileSync(path.join(dir, "audio", "stt.json"), "utf8")).words;
    assert.ok(words[2].start > g.end, "the words after the segment come after it");
    const clips = segmentClips(dir);
    assert.deepEqual(clips.map((c) => c.slot), ["middle"]);
    assert.match(segmentVideo(clips[0]), /src="segments\/middle.mp4" muted data-volume="0".*data-track-index="5"/);
  } finally {
    delete VOICE_PROVIDERS.stand_in;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("scene lengths do not count a segment or the end screen", () => {
  const sentences = [
    { id: "S1", start: 0, end: 4, dur: 4, text: "One." },
    { id: "S2", start: 4.4, end: 6, dur: 1.6, text: "Two." },
    { id: "S3", start: 24, end: 27, dur: 3, text: "Three." },
  ];
  const scenes = {
    scenes: [
      { from: "S1", component: "titlecard-lockup", vars: { wordmark: "One" } },
      { from: "S2", component: "per-word-rise", vars: { text: "Two" } },
      { from: "S3", component: "headline-slam", vars: { text: "Three" } },
    ],
  };
  const gaps = [{ start: 6.6, end: 23.4 }, { start: 27.6, end: 47.6 }];
  assert.deepEqual(checkScenes(structuredClone(scenes), { sentences, total: 47.6, gaps }).issues, []);
  const joined = { scenes: [scenes.scenes[0], { from: "S2", to: "S3", component: "per-word-rise", vars: { text: "Two" } }] };
  assert.deepEqual(checkScenes(joined, { sentences, total: 47.6, gaps }).issues, [], "S2 to S3 is 6.4 s of its own, the segment between them does not count");
});

test("a clip's whole 30 s text fits: at least 1000 characters are kept, the HeyGen id is remembered", { skip: !haveFf && "bundled ffmpeg not fetched" }, async () => {
  const dir = tmp();
  const long = "Comment GUIDE below and I will send you the free guide, because this is the whole thing in one go. ".repeat(10).trim();
  assert.ok(long.length > 900 && long.length <= SEGMENT_TEXT_MAX);
  clip(path.join(segmentsDir(dir), "incoming-1.mp4"), 2);
  const s = await addSegment({ identityDir: dir, file: "incoming-1.mp4", keyword: "GUIDE", name: "", text: long, source: "heygen-import", heygenId: "vid-123", env });
  assert.equal(s.text, long);
  assert.equal(loadSegments(dir)[0].heygenId, "vid-123");
  assert.equal(SEGMENT_TEXT_MAX >= 1000, true);
  fs.rmSync(dir, { recursive: true, force: true });
});
