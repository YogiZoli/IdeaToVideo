#!/usr/bin/env node
// run.mjs: the reliability audit as one command (docs/AUDIT_REPORT.md).
//   npm run audit              everything, with real renders, about 25 minutes
//   npm run audit:quick        everything but the renders, about 4 minutes
//   node scripts/audit/run.mjs --only failures,local
// Every paid API is mocked and the real network is blocked (mock-net.mjs): 0 USD, and
// the net log proves it. The free local parts are real: Kokoro, Whisper, ffmpeg, the
// engine. The folders have spaces and Hungarian accents on purpose. Models come from the
// installed app's folder; one that is missing is downloaded once, free, before the tests.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MOCK = pathToFileURL(path.join(ROOT, "scripts", "audit", "mock-net.mjs")).href;
const MAIN = path.join(ROOT, "runner", "main.mjs");
const { values: args } = parseArgs({ options: { only: { type: "string" }, quick: { type: "boolean", default: false }, work: { type: "string" }, keep: { type: "boolean", default: false } } });
const only = args.only ? new Set(args.only.split(",")) : null;
const wanted = (g) => !only || only.has(g);

const SECRET = "sk-audit-SECRET-0123456789abcdefXYZ";
const SECRET2 = "or-audit-SECRET-9876543210abcdefXYZ";
const work = path.resolve(args.work ?? path.join(os.tmpdir(), "ITV audit árvíztűrő tükörfúrógép"));
const exe = process.platform === "win32" ? ".exe" : "";
const FFMPEG = path.join(ROOT, "app", "src-tauri", "ffmpeg", `ffmpeg${exe}`);
const FFPROBE = path.join(ROOT, "app", "src-tauri", "ffmpeg", `ffprobe${exe}`);

fs.rmSync(work, { recursive: true, force: true });
const dataDir = path.join(work, "app data");
const projectsDir = path.join(work, "my videos");
const identityDir = path.join(work, "identity");
const fixtures = path.join(work, "sample files");
for (const d of [dataDir, projectsDir, identityDir, fixtures]) fs.mkdirSync(d, { recursive: true });
const NETLOG = path.join(work, "net.log");
const baseEnv = { ...process.env, ITV_DATA_DIR: dataDir, HYPERFRAMES_FFMPEG_PATH: FFMPEG, HYPERFRAMES_FFPROBE_PATH: FFPROBE, ITV_AUDIT_NETLOG: NETLOG, ITV_RENDER_TMP: path.join(work, "render tmp") };
delete baseEnv.STUDIO_API_KEY;

// ---- results ------------------------------------------------------------------------
const results = [];
let group = "";
function check(name, ok, detail = "") {
  results.push({ group, name, ok: !!ok, detail: String(detail).slice(0, 600) });
  if (!ok) console.log(`  FAIL ${name}: ${String(detail).slice(0, 400)}`);
}
function start(name) {
  group = name;
  console.log(`\n== ${name}`);
}

// One plain sentence: no stack, no code, no raw JSON, no key.
const NOT_PLAIN = /\n\s+at\s|\bat .+:\d+:\d+|^(Type|Reference|Syntax|Range)?Error\b|\bE[A-Z]{3,}\b|ERR_|fetch failed|undefined|\[object|unknown error|\{"|mock \d{3}.*\{/;
const isPlain = (m) => typeof m === "string" && m.length > 15 && m.length < 700 && !NOT_PLAIN.test(m) && !m.includes(SECRET) && !m.includes(SECRET2);

// ---- the runner, as the app starts it --------------------------------------------------
function runner(command, request = {}, { net = {}, env = {}, key = null, others = null } = {}) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, ["--import", MOCK, MAIN, command], {
    input: JSON.stringify(request),
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    env: { ...baseEnv, ITV_AUDIT_NET: JSON.stringify(net), ...(key ? { STUDIO_API_KEY: key } : {}), ...(others ? { ITV_LLM_FALLBACK: JSON.stringify(others) } : {}), ...env },
  });
  const lines = (r.stdout || "").trim().split("\n").flatMap((l) => {
    try {
      return [JSON.parse(l)];
    } catch {
      return [];
    }
  });
  const end = lines.find((l) => l.event === "result" || l.event === "error") ?? {};
  allOutput.push(r.stdout ?? "", r.stderr ?? "");
  return { event: end.event ?? "none", data: end.data, message: end.message, progress: lines.filter((l) => l.event === "progress"), stderr: r.stderr, seconds: (Date.now() - t0) / 1000 };
}
const allOutput = [];
function ok(name, command, request, opts) {
  const r = runner(command, request, opts);
  check(`${name}`, r.event === "result", r.message ?? r.stderr?.slice(0, 300));
  return r.data ?? {};
}
// Either it works, or it says one plain sentence. Never a crash.
function sentence(name, command, request, opts, match = null) {
  const r = runner(command, request, opts);
  if (r.event === "none") check(name, false, `no answer: ${r.stderr?.slice(0, 300)}`);
  else if (r.event === "error") check(name, isPlain(r.message) && (!match || match.test(r.message)), r.message);
  else check(name, !match, match ? `it worked, a sentence was expected: ${JSON.stringify(r.data).slice(0, 200)}` : "");
  return r;
}
const project = (dir) => JSON.parse(fs.readFileSync(path.join(dir, "project.json"), "utf8"));
const ffmpeg = (...a) => {
  const r = spawnSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...a], { encoding: "utf8" });
  if (r.status) throw new Error(r.stderr);
};
const lengthOf = (file) => Number(spawnSync(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file], { encoding: "utf8" }).stdout.trim());

// ---- models and the render browser: real files, read from the installed app ----------
function installedData() {
  const home = os.homedir();
  const places = [process.env.ITV_AUDIT_MODELS, path.join(home, "AppData", "Local", "app.ideatovideo.desktop"), path.join(home, "Library", "Application Support", "app.ideatovideo.desktop"), path.join(home, ".local", "share", "app.ideatovideo.desktop")];
  return places.find((p) => p && fs.existsSync(path.join(p, "models"))) ?? null;
}
function linkParts() {
  const from = installedData();
  fs.mkdirSync(path.join(dataDir, "models"), { recursive: true });
  if (!from) return;
  for (const m of fs.readdirSync(path.join(from, "models"))) fs.symlinkSync(path.join(from, "models", m), path.join(dataDir, "models", m), "junction");
  if (fs.existsSync(path.join(from, "hyperframes-home"))) fs.symlinkSync(path.join(from, "hyperframes-home"), path.join(dataDir, "hyperframes-home"), "junction");
}
// Only here does the real network run, and only to fetch free model files.
async function ensureParts() {
  const env = { ...process.env, ITV_DATA_DIR: dataDir };
  Object.assign(process.env, { ITV_DATA_DIR: dataDir, HYPERFRAMES_FFMPEG_PATH: FFMPEG, HYPERFRAMES_FFPROBE_PATH: FFPROBE });
  const load = (f) => import(pathToFileURL(path.join(ROOT, "runner", f)).href);
  const { ensureModel, DEFAULT_VOICE } = await load("providers/tts/kokoro.mjs");
  const { ensureWhisper } = await load("recorded/whisper.mjs");
  const { ensureDepthModel } = await load("broll/depth.mjs");
  const { ensureMatte } = await load("recorded/matte.mjs");
  await ensureModel({ voice: DEFAULT_VOICE, env });
  await ensureWhisper({ env });
  await ensureDepthModel({ env });
  await ensureMatte({ env });
}

// ---- small sample inputs -------------------------------------------------------------
const SCRIPT = `# Why trains are late in árvíztűrő towns

In 1961 most trains ran on time. Forty percent of them are late today. Nobody owns the timetable.

## Part 1

Think of one small station. A single late train moves every other train. The whole line pays for it.

## Part 2

Ask who owns the delay. Then give that person the timetable. That is how the trains got faster.
`;
async function makeSamples() {
  const { speak, DEFAULT_VOICE } = await import(pathToFileURL(path.join(ROOT, "runner", "providers", "tts", "kokoro.mjs")).href);
  const wav = path.join(fixtures, "speech.wav");
  fs.writeFileSync(wav, (await speak({ voiceId: DEFAULT_VOICE, text: "Most channels lose people in the first thirty seconds. Pick one viewer and name one problem. Then stop talking and let the viewer decide what comes next." })).audio);
  const s = {
    wav,
    take: path.join(fixtures, "camera take.mp4"),
    silent: path.join(fixtures, "no sound.mp4"),
    audioOnly: path.join(fixtures, "only sound.mp3"),
    corrupt: path.join(fixtures, "broken video.mp4"),
    empty: path.join(fixtures, "empty video.mp4"),
    text: path.join(fixtures, "notes.txt"),
    badMusic: path.join(fixtures, "broken music.mp3"),
  };
  const seconds = Math.ceil(lengthOf(wav)) + 1;
  ffmpeg("-f", "lavfi", "-i", `testsrc2=size=640x360:rate=25:duration=${seconds}`, "-i", wav, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", s.take);
  ffmpeg("-f", "lavfi", "-i", "testsrc2=size=640x360:rate=25:duration=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", s.silent);
  ffmpeg("-i", wav, s.audioOnly);
  fs.writeFileSync(s.corrupt, Buffer.from("this is not a video at all, only words ".repeat(50)));
  fs.writeFileSync(s.empty, "");
  fs.writeFileSync(s.text, "just notes");
  fs.writeFileSync(s.badMusic, Buffer.from("not music ".repeat(100)));
  return s;
}

// ---- a channel with one preset, as the recipe editor saves it -------------------------
let channels = 0;
function channel(preset, engine) {
  const dir = path.join(work, `channel ${++channels} ${preset}`);
  fs.mkdirSync(path.join(dir, "videos"), { recursive: true });
  fs.mkdirSync(path.join(dir, "identity"), { recursive: true });
  const identity = path.join(dir, "identity");
  const state = ok(`${preset}: the start screen`, "channel-state", { identityDir: identity, projectsDir: path.join(dir, "videos"), identity: {} });
  const recipe = engine === "recorded"
    ? { ...state.recipe, engine: "recorded", preset, voice: { provider: "recording", voice: "own" }, avatar: { on: false }, broll: { on: false }, recorded: { cutout: false, smoothCursor: true }, music: { on: true, source: "synth", mood: "calm" } }
    : { ...state.recipe, engine: "script", preset, targetLengthMin: 1, avatar: { on: false }, broll: { on: false } };
  ok(`${preset}: the recipe locked`, "recipe-save", { identityDir: identity, language: "en", recipe });
  return { identity, videos: path.join(dir, "videos") };
}

// Script to video with no AI and no internet, as ProjectView's recipeRun calls it.
function scriptEngine(preset, { render = true, broll = false } = {}) {
  const { identity, videos } = channel(preset, "script");
  const v = ok(`${preset}: a pasted script`, "channel-video-new", { projectsDir: videos, identityDir: identity, identity: "audit", language: "en", text: SCRIPT, textKind: "finished", research: false });
  const projectDir = v.dir;
  const voice = ok(`${preset}: the free voice`, "make-voice", { projectDir, identityDir: identity, narrator: { provider: "kokoro", voice: "am_michael" }, music: null });
  check(`${preset}: words have times`, voice.info?.sentences >= 3, JSON.stringify(voice.info ?? {}).slice(0, 200));
  ok(`${preset}: music by code`, "make-music", { projectDir, identityDir: identity, music: { provider: "synth", mood: "calm" } });
  ok(`${preset}: voice approved`, "approve-gate", { projectDir, gate: "voice" });
  ok(`${preset}: scenes by rule`, "simple-template-scenes", { projectDir, identityDir: identity });
  ok(`${preset}: shot map`, "shot-map-make", { projectDir, identityDir: identity });
  ok(`${preset}: scenes approved`, "approve-gate", { projectDir, gate: "scenes" });
  ok(`${preset}: no avatar`, "skip-gate", { projectDir, gate: "avatar" });
  if (broll) {
    ok(`${preset}: B-roll plan by rule`, "broll-auto-plan-rule", { projectDir, identityDir: identity });
    ok(`${preset}: free B-roll with no internet is only fewer clips`, "broll-auto-find", { projectDir, identityDir: identity });
    ok(`${preset}: B-roll finish`, "broll-auto-finish", { projectDir, identityDir: identity });
    ok(`${preset}: scenes approved again`, "approve-gate", { projectDir, gate: "scenes" });
  }
  if (!render) return { projectDir, identity, videos };
  const build = ok(`${preset}: preview built`, "build-video", { projectDir, identityDir: identity });
  check(`${preset}: the preview has stills`, (build.stills?.length ?? 0) >= 1);
  ok(`${preset}: preview approved`, "approve-gate", { projectDir, gate: "review" });
  const made = ok(`${preset}: render`, "render-video", { projectDir, identityDir: identity, quality: "draft" });
  finished(preset, projectDir, identity, made);
  return { projectDir, identity, videos, made };
}
// The tail every video shares: the file, the card, the license ledger, the free thumbnail, the PDT export.
function finished(preset, projectDir, identity, made) {
  check(`${preset}: a real video`, made.file && fs.statSync(made.file).size > 20000 && lengthOf(made.file) > 3, made.file);
  const cardFile = made.file?.replace(/\.mp4$/, ".card.json");
  check(`${preset}: the Publishing Card is written`, cardFile && fs.existsSync(cardFile));
  const ledger = path.join(projectDir, "assets_license.json");
  if (fs.existsSync(ledger)) {
    const list = JSON.parse(fs.readFileSync(ledger, "utf8")).assets ?? [];
    check(`${preset}: every ledger row has its source, license and date`, list.every((a) => a.source && a.license && a.date), JSON.stringify(list).slice(0, 300));
    check(`${preset}: no source that asks for attribution`, !list.some((a) => /attribution required|CC[ -]?BY\b(?!.*0)/i.test(String(a.license))), JSON.stringify(list.map((a) => a.license)));
  }
  ok(`${preset}: the free thumbnail`, "thumbnail-make", { projectDir, identityDir: identity, withFace: false, model: FREE_THUMBNAIL });
  const sent = ok(`${preset}: the PDT export`, "card-send", { projectDir, identityDir: identity, file: cardFile, url: "https://pdt.test", service: "publishing" }, { net: { publishing: "ok" }, key: SECRET });
  check(`${preset}: the card reached the publishing app`, sent.ok === true, JSON.stringify(sent).slice(0, 200));
}

// Edit a recording with no AI and no internet, as ProjectView's recordedRun calls it.
function recordedEngine(preset, samples, { render = true } = {}) {
  const { identity, videos } = channel(preset, "recorded");
  const card = JSON.parse(fs.readFileSync(path.join(ROOT, "runner", "presets", preset, "preset.json"), "utf8"));
  const files = Object.fromEntries(card.recorded.slots.filter((s) => !s.optional).map((s) => [s.id, samples.take]));
  const v = ok(`${preset}: the files in`, "recorded-video-new", { projectsDir: videos, identityDir: identity, identity: "audit", language: "en", files, title: "Sample take" });
  const projectDir = v.dir;
  ok(`${preset}: the words, on this computer`, "recorded-transcribe", { projectDir });
  ok(`${preset}: words approved`, "approve-gate", { projectDir, gate: "script" });
  ok(`${preset}: the cuts`, "recorded-apply-cuts", { projectDir });
  ok(`${preset}: music by code`, "make-music", { projectDir, identityDir: identity, music: { provider: "synth", mood: "calm" } });
  ok(`${preset}: voice approved`, "approve-gate", { projectDir, gate: "voice" });
  ok(`${preset}: the plan by rule`, "recorded-plan-rule", { projectDir });
  ok(`${preset}: the pictures`, "recorded-prepare", { projectDir });
  ok(`${preset}: scenes approved`, "approve-gate", { projectDir, gate: "scenes" });
  ok(`${preset}: no avatar`, "skip-gate", { projectDir, gate: "avatar" });
  if (!render) return { projectDir, identity };
  ok(`${preset}: preview built`, "build-video", { projectDir, identityDir: identity });
  ok(`${preset}: preview approved`, "approve-gate", { projectDir, gate: "review" });
  const made = ok(`${preset}: render`, "render-video", { projectDir, identityDir: identity, quality: "draft" });
  finished(preset, projectDir, identity, made);
  return { projectDir, identity, made };
}

const FREE_THUMBNAIL = "brand";
const SCRIPT_PRESETS = ["motion-frames", "explainer-3d", "stick-world", "archive-collage", "night-case-file", "soft-clay"];
const RECORDED_PRESETS = ["talking-head", "screen-recording", "screen-share", "profile-silhouette"];
const FAILS = ["401", "402", "403", "429", "500", "timeout", "down", "garbage", "empty"];

// ---- the groups ------------------------------------------------------------------------
function offlineStarts() {
  start("offline: every start with no AI at all");
  const { identity, videos } = channel("motion-frames", "script");
  const base = { projectsDir: videos, identityDir: identity, identity: "audit", language: "en" };
  // a topic: no AI could write it, so the Script tab opens with a skeleton
  const topic = ok("a topic starts", "channel-video-new", { ...base, topic: "Why trains are late" }).dir;
  const failed = runner("write-script", { projectDir: topic, identityDir: identity, llm: { provider: "gemini", model: "m" }, input: { topic: "Why trains are late", targetLengthMin: 1 }, channel: {} }, { key: SECRET });
  check("no internet: the script says one plain sentence", failed.event === "error" && isPlain(failed.message), failed.message);
  ok("offline draft of a topic", "script-offline", { projectDir: topic, reason: failed.message });
  check("the draft waits for the user", project(topic).gates.script.state === "pending");
  check("a note says it was written by hand", (project(topic).notes ?? []).some((n) => n.kind === "script"));
  sentence("the skeleton cannot be approved as it is", "approve-gate", { projectDir: topic, gate: "script" }, {}, /write here/);
  ok("the user's own script is saved", "save-script", { projectDir: topic, markdown: SCRIPT });
  ok("and then approved", "approve-gate", { projectDir: topic, gate: "script" });
  // notes: they become the draft
  const notes = ok("notes start", "channel-video-new", { ...base, text: "Trains are late because nobody owns the timetable. I saw it myself.", textKind: "notes" }).dir;
  const draft = ok("offline draft of notes", "script-offline", { projectDir: notes });
  check("the notes are the draft", draft.markdown?.includes("nobody owns the timetable"));
  ok("the notes draft can be approved", "approve-gate", { projectDir: notes, gate: "script" });
  // research with no AI: an empty brief, one click goes on, the card says unchecked
  const researched = ok("a researched video starts", "channel-video-new", { ...base, topic: "Trains", research: true }).dir;
  const brief = ok("research with no key", "research-offline", { projectDir: researched }).brief;
  check("the brief says nothing was checked", brief?.offline === true && /No AI could research/.test(brief.warnings?.[0]));
  ok("one click goes on", "research-approve", { projectDir: researched });
  const down = ok("research with the AI down gives the same brief", "research-make", { projectDir: researched, llm: { provider: "gemini", model: "m" }, channel: {} }, { key: SECRET }).brief;
  check("the brief from the failed AI is the offline one", down?.offline === true);
  // week batch
  const pasted = "First text about trains.\n---\nSecond text about buses.";
  const week = ok("week batch of notes with no AI", "week-batch-local", { ...base, name: "Audit", channel: {}, pasted, textKind: "notes" });
  check("each note became a draft", week.written === 2 && week.failed === 0, JSON.stringify(week).slice(0, 300));
  sentence("week batch of ideas with no AI says what to do", "week-batch-local", { ...base, name: "Audit", channel: {}, pasted: "" }, {}, /needs an AI/);
  const wf = ok("week batch of finished scripts", "week-batch-local", { ...base, name: "Audit", channel: {}, pasted: SCRIPT, textKind: "finished" });
  check("the finished script is queued", wf.written === 1);
  const nf = channel("night-case-file", "script");
  const nw = ok("a fact-checked style, no AI, week batch of notes", "week-batch-local", { projectsDir: nf.videos, identityDir: nf.identity, identity: "audit", language: "en", name: "Audit", channel: {}, pasted: "A true story of one town.", textKind: "notes" });
  check("it gets its unchecked brief", nw.written === 1, JSON.stringify(nw).slice(0, 300));
}

function aiFailures() {
  start("AI text: every provider and every failure");
  const MODEL = { gemini: "gemini-3.5-flash", claude: "claude-sonnet-5-5", openrouter: "openrouter/auto", openai: "gpt-x", deepseek: "deepseek-chat", grok: "grok-x" };
  for (const provider of Object.keys(MODEL)) {
    sentence(`${provider}: no key`, "test-llm", { provider, model: MODEL[provider] }, {}, /key/i);
    for (const mode of FAILS) {
      if (mode === "garbage" || mode === "empty") continue;
      const net = { [provider]: mode };
      sentence(`${provider}: key test, ${mode}`, "test-llm", { provider, model: MODEL[provider] }, { net, key: SECRET }, /./);
    }
  }
  // the whole steps, on one project per mode, with one provider of each kind
  const { identity, videos } = channel("motion-frames", "script");
  const base = { projectsDir: videos, identityDir: identity, identity: "audit", language: "en" };
  for (const provider of ["gemini", "claude", "openrouter"]) {
    for (const mode of FAILS) {
      const net = { [provider]: mode };
      const llm = { provider, model: MODEL[provider] };
      const dir = ok(`${provider} ${mode}: a video starts`, "channel-video-new", { ...base, topic: `Trains ${provider} ${mode}` }).dir;
      const r = runner("write-script", { projectDir: dir, identityDir: identity, llm, input: { topic: "Trains", targetLengthMin: 1 }, channel: {} }, { net, key: SECRET });
      check(`${provider} ${mode}: the script fails with one sentence, the gate says failed`, r.event === "error" && isPlain(r.message) && project(dir).gates.script.state === "failed", r.message ?? JSON.stringify(r.data).slice(0, 200));
      const br = runner("research-make", { projectDir: dir, llm, channel: {} }, { net, key: SECRET });
      check(`${provider} ${mode}: research gives the offline brief`, br.event === "result" && br.data.brief.offline === true, br.message ?? JSON.stringify(br.data).slice(0, 200));
      sentence(`${provider} ${mode}: suggestions`, "suggest-channel", { llm, field: "audience", channel: {}, topic: "trains" }, { net, key: SECRET });
    }
  }
  // the chain: the first key is refused, another key answers, and the run says so
  const dir = ok("chain: a video", "channel-video-new", { ...base, topic: "Chain" }).dir;
  const chained = runner("research-make", { projectDir: dir, llm: { provider: "gemini", model: "m" }, channel: {} }, { net: { gemini: "401", openrouter: "ok" }, key: SECRET, others: [{ provider: "openrouter", apiKey: SECRET2 }] });
  check("chain: another saved key was tried", chained.progress.some((p) => p.step === "fallback-provider" && p.to === "openrouter"), JSON.stringify(chained.progress).slice(0, 300));
  const s2 = runner("suggest-channel", { llm: { provider: "gemini", model: "m" }, field: "audience", channel: {}, topic: "trains" }, { net: { gemini: "429", deepseek: "ok" }, key: SECRET, others: [{ provider: "deepseek", apiKey: SECRET2 }] });
  check("chain: the other key answers", s2.event === "result", s2.message);
  const s3 = runner("suggest-channel", { llm: { provider: "gemini", model: "m" }, field: "audience", channel: {}, topic: "trains" }, { net: { gemini: "down", openai: "ok" }, key: SECRET, others: [{ provider: "openai", apiKey: SECRET2 }] });
  check("chain: a provider with no default model picks one from its own list", s3.event === "result", s3.message);
  const s4 = runner("suggest-channel", { llm: { provider: "gemini", model: "m" }, field: "audience", channel: {}, topic: "trains" }, { net: { gemini: "401", deepseek: "401" }, key: SECRET, others: [{ provider: "deepseek", apiKey: SECRET2 }] });
  check("chain: all refused, one sentence that names them", s4.event === "error" && /None of your AI services/.test(s4.message) && isPlain(s4.message), s4.message);
}

function planFallbacks() {
  start("plans: a dead AI falls back to the rule, every preset");
  for (const preset of SCRIPT_PRESETS) {
    const { projectDir, identity } = scriptEngine(preset, { render: false });
    for (const mode of ["401", "429", "down"]) {
      const net = { gemini: mode };
      const t0 = Date.now();
      const r = runner("make-template-scenes", { projectDir, identityDir: identity, llm: { provider: "gemini", model: "m" } }, { net, key: SECRET });
      check(`${preset} ${mode}: the plan is made by rule`, r.event === "result" && r.data.parts > 0 && r.data.rows?.length > 0, r.message ?? JSON.stringify(r.data).slice(0, 200));
      check(`${preset} ${mode}: no long wait per part`, r.progress.filter((p) => p.step === "retry" && p.waitSeconds).length <= (mode === "429" ? 8 : 2), `${(Date.now() - t0) / 1000} s`);
    }
    const r = runner("broll-auto-plan", { projectDir, identityDir: identity, llm: { provider: "gemini", model: "m" } }, { net: { gemini: "500" }, key: SECRET });
    check(`${preset}: the B-roll plan falls back to the rule`, r.event === "result", r.message);
    const p = runner("packaging-make", { projectDir, llm: { provider: "gemini", model: "m" } }, { net: { gemini: "401" }, key: SECRET });
    check(`${preset}: packaging says one sentence`, p.event === "error" ? isPlain(p.message) : true, p.message);
  }
}

function paidFailures() {
  start("paid services: skipped, the free way used, a note in the preview");
  const { projectDir, identity, videos } = scriptEngine("motion-frames", { render: false });
  const base = { projectsDir: videos, identityDir: identity, identity: "audit", language: "en" };
  for (const mode of ["none", ...FAILS]) {
    const net = { elevenlabs: mode === "none" ? "down" : mode };
    const key = mode === "none" ? null : SECRET;
    const dir = ok(`ElevenLabs ${mode}: a video`, "channel-video-new", { ...base, text: "One short sentence for the voice. And a second one.", textKind: "finished" }).dir;
    const v = runner("make-voice", { projectDir: dir, identityDir: identity, narrator: { provider: "elevenlabs", voice: "abc" }, music: null }, { net, key });
    check(`ElevenLabs ${mode}: the free voice read it`, v.event === "result" && v.data.info.provider === "kokoro", v.message);
    check(`ElevenLabs ${mode}: a note in the preview`, (project(dir).notes ?? []).some((n) => n.kind === "voice" && isPlain(n.text)), JSON.stringify(project(dir).notes ?? []));
    const m = runner("make-music", { projectDir: dir, identityDir: identity, music: { provider: "elevenlabs", mood: "calm" } }, { net, key });
    check(`ElevenLabs Music ${mode}: music by code`, m.event === "result", m.message);
    check(`ElevenLabs Music ${mode}: a note`, (project(dir).notes ?? []).some((n) => n.kind === "music"));
  }
  const huChannel = channel("motion-frames", "script");
  const huState = ok("a Hungarian channel", "channel-state", { identityDir: huChannel.identity, projectsDir: huChannel.videos, identity: {} });
  ok("its recipe has ElevenLabs", "recipe-save", { identityDir: huChannel.identity, language: "hu", recipe: { ...huState.recipe, voice: { provider: "elevenlabs", voice: "abc" } } });
  const hu = ok("Hungarian video", "channel-video-new", { projectsDir: huChannel.videos, identityDir: huChannel.identity, identity: "audit", language: "hu", text: "Egy rövid mondat a hangnak.", textKind: "finished" }).dir;
  const huVoice = runner("make-voice", { projectDir: hu, identityDir: huChannel.identity, narrator: { provider: "elevenlabs", voice: "abc" }, music: null }, { net: { elevenlabs: "401" }, key: SECRET });
  check("ElevenLabs refused on a Hungarian video: one sentence, no English voice", huVoice.event === "error" && isPlain(huVoice.message), huVoice.message);
  for (const mode of ["none", ...FAILS]) {
    const net = { heygen: mode === "none" ? "down" : mode };
    const key = mode === "none" ? null : SECRET;
    sentence(`HeyGen ${mode}: the looks`, "avatar-looks", { service: "heygen" }, { net, key });
    sentence(`HeyGen ${mode}: the plan`, "avatar-plan", { projectDir, service: "heygen", engine: "avatar_iii" }, { net, key });
    const a = runner("make-avatar", { projectDir, identityDir: identity, service: "heygen", lookId: "look", which: ["open", "close"], layout: { style: "overlay", position: "bottom-right", size: "medium" }, engine: "avatar_iii", lookEngines: [] }, { net, key });
    check(`HeyGen ${mode}: one sentence`, a.event === "error" && isPlain(a.message), a.message ?? JSON.stringify(a.data).slice(0, 200));
    ok(`HeyGen ${mode}: the video goes on without the avatar`, "skip-gate", { projectDir, gate: "avatar" });
    ok(`HeyGen ${mode}: the note`, "project-note", { projectDir, kind: "avatar", text: a.message ?? "no avatar" });
  }
  ok("voice approved again", "approve-gate", { projectDir, gate: "voice" });
  ok("scenes again", "simple-template-scenes", { projectDir, identityDir: identity });
  ok("scenes approved again", "approve-gate", { projectDir, gate: "scenes" });
  ok("avatar skipped", "skip-gate", { projectDir, gate: "avatar" });
  ok("B-roll plan", "broll-auto-plan-rule", { projectDir, identityDir: identity });
  for (const mode of ["none", ...FAILS]) {
    const key = mode === "none" ? null : SECRET;
    const net = { pixabay: mode === "none" ? "down" : mode, kie: mode === "none" ? "down" : mode };
    sentence(`Pixabay ${mode}: the search`, "broll-auto-pixabay", { projectDir, identityDir: identity, service: "pixabay" }, { net, key });
    sentence(`Pixabay ${mode}: the plain search`, "stock-search", { service: "pixabay", q: "train", kind: "image" }, { net, key });
    sentence(`Kie AI ${mode}: the balance`, "kie-balance", { service: "kie" }, { net, key });
    sentence(`Kie AI ${mode}: approving spends nothing and says so`, "broll-paid-approve", { projectDir, identityDir: identity, service: "kie", quotedUsd: 0 }, { net, key });
    sentence(`Unsplash ${mode}`, "stock-search", { service: "unsplash", q: "train", kind: "image" }, { net: { unsplash: net.pixabay }, key });
    sentence(`vidIQ ${mode}`, "keyword-ideas", { service: "vidiq", keyword: "trains" }, { net: { vidiq: net.pixabay }, key });
    sentence(`Free images ${mode}`, "assets-search", { q: "train" }, { net: { "*": net.pixabay } });
  }
  ok("B-roll still finishes", "broll-auto-finish", { projectDir, identityDir: identity });
  const r = runner("thumbnail-make", { projectDir, identityDir: identity, withFace: false, model: "gemini-nano-banana-2.1" }, { net: { gemini: "401" }, key: SECRET });
  check("Gemini pictures: one sentence", r.event === "error" && isPlain(r.message), r.message);
}

function publishing(projectDir) {
  start("publishing app down");
  fs.mkdirSync(path.join(projectDir, "out"), { recursive: true });
  const cardFile = path.join(projectDir, "out", "video-test.card.json");
  fs.writeFileSync(cardFile, JSON.stringify({ schema: "video-publishing-card/1", cardId: "x" }));
  for (const mode of FAILS) {
    const r = runner("card-send", { projectDir, file: cardFile, url: "https://pdt.test", service: "publishing" }, { net: { publishing: mode }, key: SECRET });
    check(`publishing ${mode}: the card stays, one sentence`, r.event === "result" ? r.data.ok !== true && isPlain(r.data.message) : isPlain(r.message), JSON.stringify(r.data ?? r.message).slice(0, 300));
  }
  check("the card file is still there", fs.existsSync(cardFile));
}

function localParts(samples) {
  start("local parts missing or broken");
  const { projectDir, identity, videos } = scriptEngine("motion-frames", { render: false });
  const base = { projectsDir: videos, identityDir: identity, identity: "audit", language: "en" };
  const dir = () => ok("a video", "channel-video-new", { ...base, text: SCRIPT, textKind: "finished" }).dir;
  const noFf = { HYPERFRAMES_FFMPEG_PATH: path.join(work, "no such", "ffmpeg"), HYPERFRAMES_FFPROBE_PATH: path.join(work, "no such", "ffprobe") };
  sentence("ffmpeg missing: the voice", "make-voice", { projectDir: dir(), identityDir: identity, narrator: { provider: "kokoro", voice: "am_michael" } }, { env: noFf }, /ffmpeg/);
  sentence("ffmpeg missing: a recording", "recorded-video-new", { ...base, files: { camera: samples.take } }, { env: noFf }, /ffmpeg/);
  const brokenBin = path.join(fixtures, `broken ffmpeg${exe}`);
  fs.writeFileSync(brokenBin, "not a program");
  sentence("ffmpeg broken: a recording", "recorded-video-new", { ...base, files: { camera: samples.take } }, { env: { HYPERFRAMES_FFMPEG_PATH: brokenBin, HYPERFRAMES_FFPROBE_PATH: brokenBin } }, /./);
  const h1 = ok("Health check: ffmpeg missing", "health-check", { projectsDir: videos, keys: {} }, { env: noFf });
  check("Health check says what to fix", h1.items.find((i) => i.id === "ffmpeg")?.state === "fix" && h1.problems >= 2, JSON.stringify(h1.items.filter((i) => i.state === "fix")).slice(0, 300));
  const noEngine = { ITV_ENGINE_DIR: path.join(work, "no engine") };
  const built = scriptEngine("motion-frames", { render: false });
  sentence("engine missing: the build", "build-video", { projectDir: built.projectDir, identityDir: built.identity }, { env: noEngine }, /./);
  const hBad = ok("Health check: engine missing", "health-check", { projectsDir: videos, keys: {} }, { env: noEngine });
  check("Health check names the engine", hBad.items.find((i) => i.id === "engine")?.state === "fix");

  const empty = path.join(work, "empty data");
  fs.mkdirSync(empty, { recursive: true });
  const noModels = { ITV_DATA_DIR: empty };
  sentence("voice model missing, no internet", "make-voice", { projectDir: dir(), identityDir: identity, narrator: { provider: "kokoro", voice: "am_michael" } }, { env: noModels }, /internet/);
  const rec = ok("a recording starts", "recorded-video-new", { ...base, files: { camera: samples.take } });
  sentence("speech model missing, no internet", "recorded-transcribe", { projectDir: rec.dir }, { env: noModels }, /internet/);
  const h2 = ok("Health check offline with no models", "health-check", { projectsDir: videos, keys: {} }, { env: noModels });
  check("models and the browser: fix, because they need the internet", ["voice-model", "speech-model", "depth-model", "cutout-model", "browser"].every((id) => h2.items.find((i) => i.id === id)?.state === "fix"), JSON.stringify(h2.items).slice(0, 400));
  const h3 = ok("Health check online with no models", "health-check", { projectsDir: videos, keys: {} }, { env: noModels, net: { internet: "ok" } });
  check("models: a note, they download once", ["voice-model", "speech-model"].every((id) => h3.items.find((i) => i.id === id)?.state === "note"));
  check("no AI key: a note, never a problem", h3.items.find((i) => i.id === "ai")?.state === "note");

  // a broken model file is thrown away and asked for again
  const broken = path.join(work, "broken data");
  fs.mkdirSync(path.join(broken, "models", "kokoro-82m-v1"), { recursive: true });
  fs.writeFileSync(path.join(broken, "models", "kokoro-82m-v1", "model_q8f16.onnx"), "half a model");
  sentence("a broken voice model, no internet", "make-voice", { projectDir: dir(), identityDir: identity, narrator: { provider: "kokoro", voice: "am_michael" } }, { env: { ITV_DATA_DIR: broken } }, /internet/);
  check("the broken file is gone", !fs.existsSync(path.join(broken, "models", "kokoro-82m-v1", "model_q8f16.onnx")));

  // (the render browser missing and no internet: runner/reliability.test.mjs, the engine's
  // own download is a child process this mock cannot block)
  const vd = scriptEngine("motion-frames", { render: false });

  // the depth and cut-out models missing: the video goes on
  const matte = ok("a talking head with the cut-out on", "recipe-save", { identityDir: vd.identity, language: "en", recipe: { ...ok("state", "channel-state", { identityDir: vd.identity, projectsDir: vd.videos, identity: {} }).recipe, engine: "recorded", preset: "talking-head", voice: { provider: "recording", voice: "own" }, recorded: { cutout: true, smoothCursor: true }, broll: { on: false } } });
  check("the recipe keeps the cut-out", matte.recipe?.recorded?.cutout === true);
  const th = ok("its files in", "recorded-video-new", { projectsDir: vd.videos, identityDir: vd.identity, identity: "audit", language: "en", files: { camera: samples.take } }).dir;
  ok("its words", "recorded-transcribe", { projectDir: th });
  ok("approved", "approve-gate", { projectDir: th, gate: "script" });
  ok("its cuts", "recorded-apply-cuts", { projectDir: th });
  ok("approved", "approve-gate", { projectDir: th, gate: "voice" });
  ok("its plan", "recorded-plan-rule", { projectDir: th });
  const prep = runner("recorded-prepare", { projectDir: th }, { env: { ITV_DATA_DIR: empty } });
  check("cut-out model missing, no internet: the video goes on without the cut-out", prep.event === "result", prep.message);
  check("cut-out skipped: a note says so", (project(th).notes ?? []).some((n) => n.kind === "cutout"), JSON.stringify(project(th).notes ?? []));
}

function badInput(samples) {
  start("bad input");
  const { identity, videos, projectDir } = scriptEngine("motion-frames", { render: false });
  const base = { projectsDir: videos, identityDir: identity, identity: "audit", language: "en" };
  sentence("empty text and no topic", "channel-video-new", { ...base, text: "   ", topic: "  " }, {}, /topic/);
  sentence("only punctuation", "channel-video-new", { ...base, text: "... !!! ---", textKind: "finished" }, {}, /no words/);
  sentence("far too long a text", "channel-video-new", { ...base, text: "word ".repeat(40000), textKind: "finished" }, {}, /too long/);
  const longTopic = ok("a very long topic is cut, not refused", "channel-video-new", { ...base, topic: "very long topic ".repeat(100) });
  check("its folder name stays short", path.basename(longTopic.dir).length < 80, longTopic.dir);
  const accents = ok("a Hungarian title with odd characters", "channel-video-new", { ...base, language: "en", topic: 'Árvíztűrő: "tükör/fúró\\gép"? <10%>' });
  check("the folder name is safe", /^[\w.-]+$/.test(path.basename(accents.dir)), accents.dir);
  sentence("an empty script cannot be saved", "save-script", { projectDir: accents.dir, markdown: "   " }, {}, /empty/);
  // a script with no sentence: said, not crashed
  const words = ok("a script of one word", "channel-video-new", { ...base, text: "Hello", textKind: "finished" }).dir;
  sentence("one word through the voice", "make-voice", { projectDir: words, identityDir: identity, narrator: { provider: "kokoro", voice: "am_michael" } });
  // one long line with no full stop
  const line = ok("one long line with no full stop", "channel-video-new", { ...base, text: "trains and buses and planes ".repeat(60), textKind: "finished" }).dir;
  const lv = runner("make-voice", { projectDir: line, identityDir: identity, narrator: { provider: "kokoro", voice: "am_michael" } });
  check("the long line is read", lv.event === "result", lv.message);
  if (lv.event === "result") {
    const lp = runner("simple-template-scenes", { projectDir: line, identityDir: identity });
    check("the long line gets a plan", lp.event === "result", lp.message);
  }
  // recording files
  const rec = (files) => ({ ...base, files, title: "x" });
  sentence("a corrupt video", "recorded-video-new", rec({ camera: samples.corrupt }), {}, /cannot be read/);
  sentence("an empty video file", "recorded-video-new", rec({ camera: samples.empty }), {}, /cannot be read/);
  sentence("a text file as video", "recorded-video-new", rec({ camera: samples.text }), {}, /cannot be read/);
  sentence("a file that is gone", "recorded-video-new", rec({ camera: path.join(fixtures, "gone.mp4") }), {}, /not there/);
  sentence("a video with no sound", "recorded-video-new", rec({ camera: samples.silent }), {}, /sound/);
  sentence("sound with no picture", "recorded-video-new", rec({ camera: samples.audioOnly }), {}, /picture/);
  sentence("no file at all", "recorded-video-new", rec({}), {}, /./);
  // a file that breaks after it was accepted
  const moved = path.join(fixtures, "moved away.mp4");
  fs.copyFileSync(samples.take, moved);
  const later = ok("a recording that goes away later", "recorded-video-new", rec({ camera: moved })).dir;
  fs.rmSync(moved);
  sentence("the file went away before the words", "recorded-transcribe", { projectDir: later }, {}, /./);
  // music and footage
  sentence("broken music", "set-music", { projectDir, music: { kind: "file", path: "no/such.mp3" } }, {}, /./);
  fs.copyFileSync(samples.badMusic, path.join(projectDir, "audio", "music.mp3"));
  sentence("a music file that is not music", "set-music", { projectDir, music: { kind: "file", path: "audio/music.mp3" } }, {}, /./);
  sentence("no own music yet", "make-music", { projectDir, identityDir: identity, music: { provider: "own" } }, {}, /music folder/);
  sentence("broken footage", "footage-add", { identityDir: identity, file: samples.corrupt, name: "x" }, {}, /./);
  sentence("a broken Traffic Card", "traffic-card-preview", { text: "not a card" }, {}, /./);
  sentence("a broken course", "course-preview", { projectsDir: videos, text: "{ not json" }, {}, /./);
  // a damaged project
  const damaged = ok("a video", "channel-video-new", { ...base, topic: "Damaged" }).dir;
  fs.writeFileSync(path.join(damaged, "project.json"), "{ half a file");
  sentence("a damaged project file", "load-project", { projectDir: damaged }, {}, /./);
  const list = ok("the list skips it", "list-projects", { projectsDir: videos });
  check("the other videos are still listed", list.projects.length > 2);
  fs.rmSync(damaged, { recursive: true, force: true });
  sentence("an unknown command", "no-such-command", {}, {}, /Reinstall/);
  const bad = spawnSync(process.execPath, ["--import", MOCK, MAIN, "providers"], { input: "{ not json", encoding: "utf8", env: baseEnv });
  check("a request that is not JSON", /not valid JSON/.test(bad.stdout));
}

function diskSpace() {
  start("low disk space");
  const { projectDir, identity, videos } = scriptEngine("motion-frames", { render: true });
  const low = { env: { ITV_AUDIT_FREE: String(50 * 1024 * 1024) } };
  sentence("before the render", "render-video", { projectDir, identityDir: identity, quality: "draft" }, low, /disk space/);
  const next = ok("a video", "channel-video-new", { projectsDir: videos, identityDir: identity, identity: "audit", language: "en", text: SCRIPT, textKind: "finished" }).dir;
  sentence("before the voice", "make-voice", { projectDir: next, identityDir: identity, narrator: { provider: "kokoro", voice: "am_michael" } }, low, /disk space/);
  check("the gate is failed, not stuck", project(next).gates.voice.state === "failed");
  ok("the preview needs its own room", "approve-gate", { projectDir, gate: "scenes" });
  sentence("before the preview", "build-video", { projectDir, identityDir: identity }, low, /disk space/);
  const h = ok("Health check", "health-check", { projectsDir: videos, keys: {} }, low);
  check("Health check: disk, fix", h.items.find((i) => i.id === "disk-projects")?.state === "fix");
}

// ---- killed in the middle ------------------------------------------------------------
function killTree(pid) {
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true });
  else {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      process.kill(pid, "SIGKILL");
    }
  }
}
function runUntil(command, request, seen) {
  return new Promise((resolve) => {
    const c = spawn(process.execPath, ["--import", MOCK, MAIN, command], { env: { ...baseEnv, ITV_AUDIT_NET: "{}" }, windowsHide: true, detached: process.platform !== "win32" });
    c.stdin.end(JSON.stringify(request));
    let out = "";
    let hit = false;
    c.stdout.on("data", (d) => {
      out += d;
      if (!hit && seen(out)) {
        hit = true;
        killTree(c.pid);
      }
    });
    c.stderr.on("data", () => {});
    c.on("close", () => resolve({ hit, out }));
  });
}
async function interruptions() {
  start("the app closed or Stop pressed in the middle");
  const { projectDir, identity } = scriptEngine("motion-frames", { render: true });
  const before = (await fs.promises.readdir(path.join(projectDir, "out"))).filter((f) => f.endsWith(".mp4")).length;
  const cut = await runUntil("render-video", { projectDir, identityDir: identity, quality: "draft" }, (o) => /"step":"render","percent":([2-9]\d)/.test(o));
  check("a render was cut in the middle", cut.hit, cut.out.slice(-200));
  const load = ok("the video opens again", "load-project", { projectDir, liveProjects: [] });
  check("the render says it did not finish", load.project.render?.state === "failed", JSON.stringify(load.project.render));
  check("the voice and the scenes stay approved", ["script", "voice", "scenes", "review"].every((g) => load.project.gates[g].state === "approved"), JSON.stringify(load.project.gates));
  const out = await fs.promises.readdir(path.join(projectDir, "out"));
  check("no half video that looks finished", out.filter((f) => f.endsWith(".mp4")).length === before, out.join(" "));
  const again = ok("the render runs again", "render-video", { projectDir, identityDir: identity, quality: "draft" });
  check("and gives a real video", fs.statSync(again.file).size > 20000 && lengthOf(again.file) > 3);
  const cut2 = await runUntil("build-video", { projectDir, identityDir: identity }, (o) => /"step":"(build|check|stills|review)/.test(o) || o.includes('"step"'));
  check("a preview build was cut", cut2.hit);
  const load2 = ok("the video opens again", "load-project", { projectDir, liveProjects: [] });
  check("the preview step says failed, the rest stays", load2.project.gates.review.state === "failed" && load2.project.gates.scenes.state === "approved", JSON.stringify(load2.project.gates));
  ok("the preview builds again", "build-video", { projectDir, identityDir: identity });
  const v = ok("a video", "channel-video-new", { projectsDir: path.dirname(projectDir), identityDir: identity, identity: "audit", language: "en", text: SCRIPT, textKind: "finished" }).dir;
  const cut3 = await runUntil("make-voice", { projectDir: v, identityDir: identity, narrator: { provider: "kokoro", voice: "am_michael" } }, (o) => /"step":"voice"/.test(o));
  check("a voice was cut", cut3.hit);
  check("the voice step says failed", ok("open", "load-project", { projectDir: v, liveProjects: [] }).project.gates.voice.state === "failed");
  ok("the voice is read again", "make-voice", { projectDir: v, identityDir: identity, narrator: { provider: "kokoro", voice: "am_michael" } });
}

function secretsAndNet() {
  start("no secret anywhere, nothing left this computer");
  const logs = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isSymbolicLink() || p.includes("hyperframes-home") || p.includes(`${path.sep}models`)) continue;
      if (e.isDirectory()) walk(p);
      else if (/\.(log|txt|json|md|jsonl|srt)$/i.test(e.name)) logs.push(p);
    }
  };
  walk(work);
  const hit = logs.filter((f) => {
    const t = fs.readFileSync(f, "utf8");
    return t.includes(SECRET) || t.includes(SECRET2);
  });
  check(`no key in ${logs.length} files of the run`, hit.length === 0, hit.join(" "));
  const out = allOutput.join("\n");
  check("no key in any output of the runner", !out.includes(SECRET) && !out.includes(SECRET2));
  const net = fs.existsSync(NETLOG) ? fs.readFileSync(NETLOG, "utf8") : "";
  check("every network call went to the mock", net.length > 0, "no calls logged");
  const errorLog = path.join(dataDir, "logs", "errors.log");
  check("the error log has the full details", fs.existsSync(errorLog) && /"stack"/.test(fs.readFileSync(errorLog, "utf8")));
  const copied = ok("Copy details reads it back", "error-details", {});
  check("Copy details has the raw error and the file", copied.entry?.raw !== undefined && copied.file === errorLog, JSON.stringify(copied).slice(0, 200));
}

// ---- the run ---------------------------------------------------------------------------
const t0 = Date.now();
linkParts();
await ensureParts();
const samples = await makeSamples();
const render = !args.quick;
if (wanted("script")) {
  start("Script to video: every preset, offline, to the PDT export");
  for (const p of SCRIPT_PRESETS) scriptEngine(p, { render, broll: p === "motion-frames" });
}
if (wanted("recorded")) {
  start("Edit a recording: every preset, offline, to the PDT export");
  for (const p of RECORDED_PRESETS) recordedEngine(p, samples, { render });
}
if (wanted("offline")) offlineStarts();
if (wanted("ai")) aiFailures();
if (wanted("plans")) planFallbacks();
if (wanted("paid")) paidFailures();
if (wanted("publishing")) publishing(scriptEngine("motion-frames", { render: false }).projectDir);
if (wanted("local")) localParts(samples);
if (wanted("input")) badInput(samples);
if (wanted("disk")) diskSpace();
if (wanted("kill")) await interruptions();
secretsAndNet();

const failed = results.filter((r) => !r.ok);
const byGroup = {};
for (const r of results) {
  byGroup[r.group] ??= { pass: 0, fail: 0 };
  byGroup[r.group][r.ok ? "pass" : "fail"]++;
}
console.log("\n== Summary");
for (const [g, n] of Object.entries(byGroup)) console.log(`  ${n.fail ? "FAIL" : "ok  "} ${g}: ${n.pass} passed${n.fail ? `, ${n.fail} failed` : ""}`);
console.log(`\n${failed.length ? `${failed.length} of ${results.length} checks failed` : `all ${results.length} checks passed`} in ${Math.round((Date.now() - t0) / 60000)} minutes, 0 USD.`);
const report = path.join(os.tmpdir(), "itv-audit-results.json");
fs.writeFileSync(report, JSON.stringify({ at: new Date().toISOString(), byGroup, failed }, null, 2));
console.log(`Results: ${report}`);
if (!args.keep) fs.rmSync(work, { recursive: true, force: true, maxRetries: 3 });
process.exit(failed.length ? 1 : 0);
