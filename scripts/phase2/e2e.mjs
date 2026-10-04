#!/usr/bin/env node
// e2e.mjs: the phase 2 end-to-end test (plan step 19). A fixed short project
// goes from an approved voice through gates 3 and 4 to a rendered MP4, with
// the real runner commands the app calls (runner/main.mjs as a child process,
// the bundled engine, ffmpeg and render browser). No key is needed: the
// narration is a quiet tone with a fixed sentence table, and the scene table
// comes from a stand-in LLM that answers a fixed plan, which the real checks
// then judge. Exit code 0 only if every step passed.
//
// Usage: node scripts/phase2/e2e.mjs --work <dir>   (or: npm run e2e -- --work <dir>)
// Needs: scripts/fetch-sidecars.mjs, fetch-engine.mjs, fetch-library.mjs, and
// the render browser (the app's Download now, or browser-ensure).

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createProject, loadProject, saveProject, setGate } from "../../runner/project.mjs";
import { makeScenes } from "../../runner/gates/scenes/index.mjs";
import { callColor } from "../../runner/gates/build/assemble.mjs";
import { cardForPreset, cardTheme } from "../../runner/brand/card.mjs";
import { resolveBrowser, hfHome } from "../../runner/tools.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { values: args } = parseArgs({ options: { work: { type: "string" } } });
if (!args.work) {
  console.error("Usage: node scripts/phase2/e2e.mjs --work <dir>");
  process.exit(2);
}

const env = { ...process.env };
const exe = process.platform === "win32" ? ".exe" : "";
env.HYPERFRAMES_FFMPEG_PATH ??= path.join(ROOT, "app", "src-tauri", "ffmpeg", `ffmpeg${exe}`);
env.HYPERFRAMES_FFPROBE_PATH ??= path.join(ROOT, "app", "src-tauri", "ffmpeg", `ffprobe${exe}`);

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`);
  if (!ok) finish();
}
function finish() {
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `\ne2e: ${failed} step(s) failed` : `\ne2e: all ${results.length} steps passed`);
  process.exit(failed ? 1 : 0);
}

// The runner exactly as the app calls it: one command, one JSON request.
function runner(command, request) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(ROOT, "runner", "main.mjs"), command], { input: JSON.stringify(request), encoding: "utf8", env, maxBuffer: 64 * 1024 * 1024 });
  const last = JSON.parse((r.stdout || "").trim().split("\n").at(-1) || "{}");
  return { ...last, seconds: Math.round((Date.now() - t0) / 100) / 10 };
}

const TEXT = [
  "Most videos lose people in the first seconds.",
  "Start with the one problem your viewer has.",
  "Then show three steps.",
  "Write, record, and publish.",
  "Keep one idea on the screen at a time.",
  "Start your first video today.",
];

if (!resolveBrowser(env)) {
  console.error("No render browser. Use the app's Download now first.");
  process.exit(1);
}

console.log("e2e: phase 2, gates 3 and 4 to a rendered video");
const work = path.resolve(args.work);
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
// Two Identities, each with its own ONE Videos folder (docs/identity.md 3):
// the video is made in the first one, the second one stays empty.
const mine = path.join(work, "My Identity");
const other = path.join(work, "VoxFlow");
fs.mkdirSync(mine, { recursive: true });
fs.mkdirSync(other, { recursive: true });
const { dir } = createProject({ projectsDir: mine, title: "End to end", identity: "my-identity" });
{
  const listed = (folder) => runner("list-projects", { projectsDir: folder }).data?.projects ?? [];
  const a = listed(mine);
  const b = listed(other);
  check("ONE Video in its Identity's folder", a.length === 1 && path.dirname(a[0].dir) === mine && b.length === 0, `${a.length} in My Identity, ${b.length} in VoxFlow`);
  check("ONE Video knows its Identity", loadProject(dir).identity === "my-identity");
}

// An approved script and voice, as gates 1 and 2 would leave them.
const sentences = [];
const words = [];
let t = 0.2;
for (const text of TEXT) {
  const ws = text.split(/\s+/);
  const dur = Math.round((0.9 + ws.length * 0.33) * 1000) / 1000;
  const s = { id: `S${sentences.length + 1}`, start: Math.round(t * 1000) / 1000, end: Math.round((t + dur) * 1000) / 1000, dur, words: ws.length, text };
  sentences.push(s);
  ws.forEach((w, i) => words.push({ text: w, start: Math.round((s.start + (dur * i) / ws.length) * 1000) / 1000, end: Math.round((s.start + (dur * (i + 1)) / ws.length) * 1000) / 1000 }));
  t = s.end + 0.4;
}
const TOTAL = Math.round((t + 0.5) * 1000) / 1000;
fs.writeFileSync(path.join(dir, "sentences.json"), JSON.stringify(sentences, null, 2));
fs.writeFileSync(path.join(dir, "words.json"), JSON.stringify(words, null, 2));
fs.writeFileSync(path.join(dir, "script.md"), `# End to end\n\n## OPEN\n\n${TEXT.slice(0, 2).join(" ")}\n\n## 1. Steps\n\n${TEXT.slice(2, 5).join(" ")}\n\n## OWN\n\n${TEXT[5]}\n`);
fs.mkdirSync(path.join(dir, "audio"));
for (const f of ["vo.mp3", "vo_bgm.mp3"]) {
  const r = spawnSync(env.HYPERFRAMES_FFMPEG_PATH, ["-y", "-v", "error", "-f", "lavfi", "-i", `sine=frequency=220:duration=${TOTAL}`, "-af", "volume=0.05", "-ar", "44100", "-ac", "2", "-b:a", "128k", path.join(dir, "audio", f)]);
  if (r.status !== 0) check("audio fixture", false, String(r.stderr));
}
// The script's comment call (docs/wizards/cta.md): the last sentence asks for
// START, a cold keyword at the end (any keyword may sit in any place).
fs.writeFileSync(path.join(dir, "script.json"), JSON.stringify({ title: "End to end", open: { problem: TEXT[0], promise: TEXT[1], cta: null }, sections: [], ownershipCta: null, own: { recap: TEXT[4], cta: TEXT[5] }, commentCalls: [{ slot: "end", keyword: "START", temperature: "cold" }] }));
let p = loadProject(dir);
for (const g of ["script", "voice"]) p = setGate(p, g, { state: "approved", mode: "recommended" });
saveProject(dir, p);
check("project with approved script and voice", true, `${sentences.length} sentences, ${TOTAL} s`);

// Gate 3 with a stand-in LLM. The plan's first answer breaks two rules, so the
// repair call is exercised too.
const bad = { scenes: [{ from: "S1", to: "S6", component: "headline-slam", vars: { text: "Most videos lose people in seconds" } }] };
const good = {
  scenes: [
    { from: "S1", to: "S2", component: "titlecard-calm", vars: { kicker: "THE PROBLEM", headline: "Viewers leave early" } },
    { from: "S3", component: "per-word-rise", vars: { text: "Three steps" } },
    { from: "S4", component: "grid-card-assemble", vars: { items: "Write,Record,Publish" } },
    { from: "S5", component: "marker-highlight", vars: { text: "One idea at a time", emphasis_word: "One" } },
    { from: "S6", component: "cta-close", vars: { action_line: "START your first video", button_label: "Start now" } },
  ],
  gaps: [],
};
let llmCalls = 0;
const fetchImpl = async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ choices: [{ message: { content: JSON.stringify(llmCalls++ === 0 ? bad : good) } }] }) });
const planned = await makeScenes({ llm: { provider: "gemini", apiKey: "stand-in", fetchImpl, sleep: async () => {} }, projectDir: dir, env });
check("gate 3: scene table planned, one repair", planned.scenes === 5 && llmCalls === 2, `${planned.scenes} scenes, ${llmCalls} LLM calls`);
{
  const last = JSON.parse(fs.readFileSync(path.join(dir, "scenes.json"), "utf8")).scenes.at(-1);
  check("CTA: the comment call scene shows its keyword", last.call?.keyword === "START" && last.vars.button_label === "START", JSON.stringify(last.call));
}
check("gate 3: approved", runner("approve-gate", { projectDir: dir, gate: "scenes" }).event === "result");

// Gate 4: build, lint + check, stills.
// The Identity's own look (docs/wizards/brand.md): a Brand Identity Card in
// its folder, a font that is not Inter, and no font fetched from the web
// (HyperFrames caches every font it downloads; the cache must not grow).
const identityDir = path.join(work, "identities", "my-identity");
fs.mkdirSync(identityDir, { recursive: true });
{
  const state = runner("brand-state", { identityDir }).data;
  const card = { ...state.presets.find((p) => p.id === "coral").card, nameplate: { name: "Kovács Ödön", title: "Üzletépítő", url: "odon.example" } };
  check("brand: the card is saved in the Identity's folder", runner("brand-save", { identityDir, card }).event === "result" && fs.existsSync(path.join(identityDir, "brand", "brand-identity-card.json")) && fs.existsSync(path.join(identityDir, "brand", "FRAME.md")));
  const preview = runner("brand-preview", { card, language: "hu" });
  check("brand: the real preview, five stills", preview.event === "result" && preview.data.stills.length === 5 && preview.data.stills.every((s) => fs.existsSync(s.file)), preview.event === "result" ? `${preview.seconds} s` : preview.message);
  // an open-design style through the same chain (its brand font replaced by a free one)
  const od = state.presets.find((p) => p.id === "od-stripe");
  const odPreview = od ? runner("brand-preview", { card: od.card, language: "en" }) : { event: "error", message: "no od-stripe in the gallery" };
  check("brand: an open-design style (Stripe style) previews", state.presets.length === 163 && odPreview.event === "result" && odPreview.data.stills.length === 5, odPreview.event === "result" ? `${odPreview.seconds} s, ${od.card.fonts.display.family}` : odPreview.message);
}
const fontCache = path.join(hfHome(env), ".cache", "hyperframes", "fonts");
const cached = () => (fs.existsSync(fontCache) ? fs.readdirSync(fontCache, { recursive: true }).sort().join("|") : "");
const cacheBefore = cached();
const built = runner("build-video", { projectDir: dir, identityDir, look: "blue-professional" });
{
  const html = fs.existsSync(path.join(dir, "build", "index.html")) ? fs.readFileSync(path.join(dir, "build", "index.html"), "utf8") : "";
  check("brand: the build uses the card (Bebas Neue, local file)", /@font-face \{ font-family: 'Bebas Neue'/.test(html) && /--itv-bg: #f5f0e8/.test(html) && fs.existsSync(path.join(dir, "build", "fonts", "bebas-neue")));
}
{
  const html = fs.existsSync(path.join(dir, "build", "index.html")) ? fs.readFileSync(path.join(dir, "build", "index.html"), "utf8") : "";
  const cold = callColor({ temperature: "cold" }, cardTheme(cardForPreset("coral")));
  check("CTA: the call button wears its temperature (cold)", html.includes(`--brand: ${cold}`), cold);
}
check("gate 4: build, lint and check", built.event === "result", built.event === "result" ? `${built.data.scenes} scenes in ${built.seconds} s` : built.message);
check("gate 4: one still per scene", built.data.stills?.length === 5 && built.data.stills.every((s) => fs.existsSync(s.file)), `${built.data.stills?.length} stills`);
check("gate 4: approved", runner("approve-gate", { projectDir: dir, gate: "review" }).event === "result");

// The render, with captions and chapters next to it.
const rendered = runner("render-video", { projectDir: dir, quality: "draft" });
check("render", rendered.event === "result" && fs.existsSync(rendered.data?.file ?? ""), rendered.event === "result" ? `${rendered.data.seconds} s of video in ${rendered.seconds} s` : rendered.message);
check("render: length matches the voice", Math.abs(rendered.data.seconds - TOTAL) < 0.25, `${rendered.data.seconds} s vs ${TOTAL} s`);
check("captions (.srt) next to the video", fs.existsSync(rendered.data.srt ?? "") && fs.readFileSync(rendered.data.srt, "utf8").includes("Start your first video today."));
check("brand: no font was downloaded for the build, the stills or the render", cached() === cacheBefore);
check("YouTube chapters next to the video", rendered.data.chapters?.startsWith("0:00 Intro") === true, (rendered.data.chapters ?? "").replace(/\n/g, " / "));
check("the project remembers the video", runner("load-project", { projectDir: dir }).data?.latestVideo?.file === rendered.data.file);

// Backup at level 4 and a restore after the ONE Video is gone (docs/backup.md).
{
  const backupRoot = path.join(work, "My Drive", "IdeaToVideo_Backup");
  const b = runner("backup-project", { projectDir: dir, backupRoot, identityFolder: "My Identity", level: 4 });
  check("backup: every file at level 4", b.event === "result" && fs.readdirSync(b.data.dir).some((n) => n.endsWith("_video.mp4")), b.event === "result" ? `${b.data.copied} files in ${b.data.path}` : b.message);
  const again = runner("backup-project", { projectDir: dir, backupRoot, identityFolder: "My Identity", level: 4 });
  check("backup: a second run copies nothing", again.data?.copied === 0, `${again.data?.copied} files`);
  const original = fs.readFileSync(rendered.data.file);
  fs.renameSync(dir, `${dir}-gone`);
  const listed = runner("list-backups", { backupRoot, identityFolder: "My Identity", projectsDir: mine }).data?.backups ?? [];
  const restored = runner("restore-project", { backupRoot, path: listed[0]?.path, projectsDir: mine });
  const video = restored.event === "result" ? runner("load-project", { projectDir: restored.data.dir }).data?.latestVideo?.file : null;
  check("restore: the ONE Video comes back with the same video", !!video && Buffer.compare(fs.readFileSync(video), original) === 0, restored.event === "result" ? restored.data.dir : restored.message);
}

// The Motion wizard (docs/wizards/motion.md): a profile in the Identity's
// folder, its real preview, and the same ONE Video built and rendered with it
// (the original project folder, kept beside the restored one).
{
  const mdir = `${dir}-gone`;
  const state = runner("motion-state", { identityDir });
  check("motion: no profile yet, a recommendation and every choice", state.event === "result" && state.data.profile === null && state.data.options.moods.length === 11, state.event === "result" ? `recommended ${state.data.recommended.mood}` : state.message);
  const profile = {
    ...state.data.start,
    transition: { mood: "premium", primary: "blur-crossfade", accent: "cross-warp-morph", energy: "calm", where: "every" },
    background: { type: "grain-field", vars: {} },
    camera: { move: "push" },
    scenes: { off: ["headline-slam"], style: { "marker-highlight": { style: "underline" } } },
  };
  const saved = runner("motion-save", { identityDir, profile });
  check("motion: the profile is saved in the Identity's folder", saved.event === "result" && fs.existsSync(path.join(identityDir, "motion.json")), saved.message ?? "");
  const preview = runner("motion-preview", { identityDir, profile, language: "hu" });
  check("motion: the real preview, an 18 s video", preview.event === "result" && fs.existsSync(preview.data.file) && Math.abs(preview.data.seconds - 18) < 0.25 && preview.data.transitions.includes("cross-warp-morph"), preview.event === "result" ? `${preview.data.renderSeconds} s render, ${preview.data.transitions.join(" ")}` : preview.message);
  const built2 = runner("build-video", { projectDir: mdir, identityDir });
  const html = fs.existsSync(path.join(mdir, "build", "index.html")) ? fs.readFileSync(path.join(mdir, "build", "index.html"), "utf8") : "";
  check("motion: the build uses the profile, lint and check pass", built2.event === "result" && /HyperShader\.init/.test(html) && /data-composition-id="grain-field"/.test(html) && /id="cam-1"/.test(html) && /"style":"underline"/.test(html) && fs.existsSync(path.join(mdir, "build", "transitions.json")), built2.event === "result" ? `${built2.seconds} s` : built2.message);
  runner("approve-gate", { projectDir: mdir, gate: "review" }); // a new build asks for the contact sheet again
  const r2 = runner("render-video", { projectDir: mdir, quality: "draft" });
  check("motion: render, the length still matches the voice", r2.event === "result" && Math.abs(r2.data.seconds - TOTAL) < 0.25, r2.event === "result" ? `${r2.data.seconds} s of video in ${r2.seconds} s` : r2.message);
  const table = runner("scene-table", { projectDir: mdir, identityDir });
  check("motion: a turned-off scene type is not offered as a swap", table.event === "result" && table.data.rows.every((r) => r.alternatives.every((a) => a.component !== "headline-slam")));
}
finish();
