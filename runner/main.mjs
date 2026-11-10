#!/usr/bin/env node
// main.mjs: the Node sidecar's entry point. The Rust core runs
//   node runner/main.mjs <command>
// writes one JSON request to stdin, and reads JSON lines from stdout:
//   {"event":"progress", ...}   zero or more
//   {"event":"result","data":{...}}   or   {"event":"error","message":"..."}
// The API key, when a command needs one, comes in the STUDIO_API_KEY env var,
// set by the Rust core from the OS keychain. It is never echoed, logged or
// written to a file.

import fs from "node:fs";
import path from "node:path";
import { testKey, PROVIDERS, onLlmEvent, setOtherKeys, LlmError } from "./providers/llm.mjs";
import { testServiceKey } from "./providers/keys.mjs";
import { validate, loadSchema } from "./schema/validate.mjs";
import { createProject, loadProject, saveProject, recoverInterrupted, setGate, readBrief, appendLog, addNote, writeJson, writeAtomic } from "./project.mjs";
import { writeScript } from "./gates/script/index.mjs";
import { suggestChannel } from "./gates/channel/index.mjs";
import { toolsStatus, ensureBrowser, dataDir } from "./tools.mjs";
import { downloadPreview } from "./providers/tts/elevenlabs.mjs";
import { sentenceTable } from "./timing/sentences.mjs";
import { lintAndCheck } from "./gates/build/index.mjs";
import { renderVideo } from "./gates/render/index.mjs";
import { makeVoice, makeMusic, musicPath, voiceSample, setMusic, VOICE_PROVIDERS } from "./gates/voice/index.mjs";
import * as heygen from "./providers/avatar/heygen.mjs";
import { keywordIdeas, deepResearch } from "./providers/research/vidiq.mjs";
import { avatarPlan, makeAvatar, removeAvatar, setLayout } from "./gates/avatar/index.mjs";
import { costEstimateUsd, DEFAULT_PROMPT as MUSIC_PROMPT } from "./providers/music/elevenlabs.mjs";
import { makeScenes, saveScenes, refillScene, sceneRows, simpleScenes, estimateScenes, estimateFill } from "./gates/scenes/index.mjs";
import { estimateUsd, usdText } from "./providers/prices.mjs";
import { buildAndReview, stillsOf, contactSheet } from "./gates/review/index.mjs";
import { visualCheck, estimateVisual, readReport as visualReport } from "./gates/review/visual.mjs";
import { assemble } from "./gates/build/assemble.mjs";
import { writeExtras } from "./gates/render/export.mjs";
import { sendCard } from "./publishing.mjs";
import { youtubeTexts, makePackaging, savePackaging, loadPackaging } from "./gates/render/youtube.mjs";
import { isLightLook, libraryDir, baseTheme, callColor } from "./gates/build/assemble.mjs";
import { loadCard, saveCard, cardTheme, cardFamilies, contrastReport, normalizeCard } from "./brand/card.mjs";
import { fontsIndex, familyNames, categories } from "./brand/fonts.mjs";
import { brandPreview, previewDir } from "./brand/preview.mjs";
import { loadProfile, saveProfile, normalizeProfile, profileFromMood, recommendMood, wizardOptions } from "./motion/profile.mjs";
import { motionPreview, motionPreviewDir } from "./motion/preview.mjs";
import { loadProfile as loadCta, saveProfile as saveCta, normalizeProfile as normalizeCta, defaultProfile as defaultCta, videoPlan, catalogForUi, endScreenOf, loadLast, saveLast } from "./cta/profile.mjs";
import { segmentVoice, segmentVideo } from "./cta/make.mjs";
import * as pixabay from "./stock/pixabay.mjs";
import * as unsplash from "./stock/unsplash.mjs";
import { addStock, suggestQueries } from "./stock/index.mjs";
import { FAMILIES as ICON_FAMILIES, loadFamily as loadIconFamily } from "./icons/index.mjs";
import { ROLES as SCENE_ROLES, COMPONENTS as SCENE_COMPONENTS } from "./gates/scenes/roles.mjs";
import { entryOf } from "./gates/scenes/catalog.mjs";
import { loadScenes as loadScenesProfile, saveScenes as saveScenesProfile, MIX_PRESETS, KINDS, KIND_LABELS, PICTURE_SOURCES } from "./scenes-profile.mjs";
import { listPacks, importPack, exportPack, removePack, writeState as writePackState, registerPacks } from "./packs/index.mjs";
import { loadLibrary, footageDir, addClip, updateClip, removeClip, setMode as setFootageMode, MODES as FOOTAGE_MODES, MAX_CLIP_SECONDS } from "./footage/library.mjs";
import { describeClip } from "./footage/describe.mjs";
import { loadSegments, addSegment, removeSegment, markUsed, segmentsDir, incomingName, SEGMENT_MAX_SECONDS, SEGMENT_TEXT_MAX } from "./cta/segments.mjs";
import { TEMPERATURES, SLOTS, PLACES_FOR_COUNT } from "./cta/catalog.mjs";
import { galleryCards, STYLE_NOTE } from "./brand/gallery.mjs";
import { cardFromTokens } from "./brand/tokens.mjs";
import { loadDictionary, saveDictionary, dictionaryData, checkAll } from "./gates/script/dictionary.mjs";
import { spokenFields } from "./gates/script/index.mjs";
import { timed } from "./timings.mjs";
import * as recorded from "./recorded/index.mjs";
import * as bubble from "./recorded/bubble.mjs";
import { friendlyMessage } from "./friendly.mjs";
import { logError, lastError } from "./errorlog.mjs";
import { ensureRoom, ensureRenderRoom, ROOM_FOR_BUILD, ROOM_FOR_VOICE } from "./disk.mjs";
import { healthCheck } from "./health.mjs";
import { planAuto, findFree, findPixabay, finishFind, setPaidWanted, reviewState as brollReview, approvePaid } from "./broll/engine.mjs";
import { balance as kieBalance } from "./generate/kie.mjs";
import { planBroll, estimateBroll, makeBroll, updateItem as updateBroll, againItem as againBroll, removeItem as removeBroll, attach as attachBroll, loadPlan as loadBrollPlan, usesGenerated } from "./broll/index.mjs";
import { loadSettings as loadBrollSettings, saveSettings as saveBrollSettings, CAP as BROLL_CAP, PAID_LIMITS } from "./broll/settings.mjs";
import { choices as brollChoices, generatorOf, PAID_GENERATOR, usdFor } from "./generate/index.mjs";
import { previewCourse, importCourse, listCourses, exportCourse, readSeed } from "./course/index.mjs";
import { channelBoard, setUpload, markSent } from "./course/board.mjs";
import { bridgeLines } from "./course/bridge.mjs";
import { previewCard as previewTrafficCard, saveCard as saveTrafficCard, loadCard as loadTrafficCard } from "./planner/traffic-card.mjs";
import { wizardState, saveDraft as saveWizardDraft, wizardKit, wizardSave, wizardExport } from "./channelwizard/index.mjs";
import { nightCandidates, loadShift, saveShift, clearShift, prepareForNight } from "./channels/night.mjs";
import { seedsFrom, contextOf, vidiqBalance, research as plannerResearch, saveResearch, loadResearch, planPlaylist, outlineVideos, buildStructure } from "./planner/index.mjs";
import * as thumbnail from "./thumbnail/index.mjs";
import { listPresets, loadPreset, presetCard, presetLook } from "./presets/index.mjs";
import { renderStylesheet, tokensFor } from "./presets/stylesheet.mjs";
import { makeTemplateScenes } from "./gates/scenes/templates.mjs";
import { defaultRecipe, loadRecipe, saveRecipe, normalizeRecipe, recipeFor, cleanStart, ownMusic, musicDir, VOICE_KINDS, MUSIC_SOURCES } from "./channels/recipe.mjs";
import { newScriptVideo, notesOf, splitPasted, offlineDraft, WRITE_HERE } from "./channels/start.mjs";
import { makeBrief, loadBrief, saveBrief, approveBrief, cleanEdit, briefForScript, offlineBrief } from "./research/index.mjs";
import { makeShotMap, shotMapView, writeShotMap, setFlow, addFlowClip } from "./shots/index.mjs";
import { runWeekBatch, listQueue, WEEK } from "./channels/batch.mjs";
import { MOODS } from "./providers/music/synth.mjs";
import { ensureModel, modelDir, MODEL_BYTES, MODEL_FILES, DEFAULT_VOICE } from "./providers/tts/kokoro.mjs";
import { searchAll, addFreeImage, cachePreview as cacheFreePreview } from "./assets/sources.mjs";
import { readLedger, logAsset, logTableFootage } from "./assets/license.mjs";
import { backupProject, backupAll, estimate as backupEstimate, listBackups, restoreProject, readRecord as backupRecord, setLevel as setBackupLevel } from "./backup.mjs";

// A service that did not do the job (no key, a refused key, no credit, down, no
// connection), not a script or a file the free tool would fail on too.
const serviceFailed = (e) => !/script|sentence|nothing to read|no narration|ffmpeg|disk/i.test(String(e?.message));

// Rough size of the narration, before the voice exists: sentences in script.md.
function sentenceCount(projectDir) {
  const md = path.join(projectDir, "script.md");
  if (!fs.existsSync(md)) return 10;
  const text = fs.readFileSync(md, "utf8").replace(/^#.*$/gm, "");
  return Math.max(1, (text.match(/[.?!](\s|$)/g) ?? []).length);
}
// The video's length from the sentence table (the render measures it later).
function videoSeconds(projectDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(projectDir, "sentences.json"), "utf8")).at(-1)?.end ?? 60;
  } catch {
    return 60;
  }
}
const jsonCount = (projectDir, f, key) => {
  try {
    const v = JSON.parse(fs.readFileSync(path.join(projectDir, f), "utf8"));
    return (key ? v[key] : v).length || 1;
  } catch {
    return 10;
  }
};

let answered = false;
const emit = (o) => {
  if (o.event === "result" || o.event === "error") answered = true;
  process.stdout.write(JSON.stringify(o) + "\n");
};

// A step that changes no gate, logged in the ONE Video's log.txt when it fails.
async function logged(projectDir, what, fn) {
  try {
    return await fn();
  } catch (e) {
    appendLog(projectDir, `${what} failed, ${e.message}`);
    throw e;
  }
}

// Signs of life (Zoltan, 2026-10-06: the user always knows the state). Every
// 20 s an "alive" line, so the core's watchdog (runner.rs) knows this process
// still works even while it waits minutes for a service; and a jump of the
// clock means the computer slept (the lid was closed): the app says so
// instead of leaving it to a guess.
function heartbeat() {
  let last = Date.now();
  let ticks = 0;
  const t = setInterval(() => {
    const now = Date.now();
    const gap = now - last;
    last = now;
    if (gap > 60000) emit({ event: "progress", step: "slept", seconds: Math.round(gap / 1000) });
    if (++ticks % 4 === 0) emit({ event: "progress", step: "alive" });
  }, 5000);
  t.unref();
}
// LLM retries and model switches become progress lines (the app logs them). Another
// key doing the work is also a note on the video, written when the command ends.
const aiNotes = [];
onLlmEvent((e) => {
  if (e.step === "ai-used") aiNotes.push(`${e.firstLabel} did not answer, so ${e.label} did this step.`);
  emit({ event: "progress", ...e });
});
// The keys leave the environment at once: a child process (ffmpeg, the render) has no use for them.
const apiKey = process.env.STUDIO_API_KEY || "";
delete process.env.STUDIO_API_KEY;
const secrets = [apiKey];
try {
  const others = JSON.parse(process.env.ITV_LLM_FALLBACK || "[]");
  setOtherKeys(others);
  secrets.push(...others.map((k) => k.apiKey));
} catch {
  setOtherKeys([]);
}
delete process.env.ITV_LLM_FALLBACK;
const key = () => apiKey;

// The look of a build, from the Identity's Brand Identity Card. The Rust core
// sets identityDir (the ONE Video's own Identity) on every request; without
// it (tests, pilots) a preset name in `look` still works.
function lookOf({ identityDir, look, projectDir }) {
  if (!identityDir) return look;
  const { card } = loadCard(identityDir);
  const motion = motionOf(identityDir);
  const brand = { theme: cardTheme(card, categories()), families: cardFamilies(card), light: card.appearance === "light", name: card.nameplate?.name || null, motion, scenes: loadScenesProfile(identityDir, { motionOff: motion?.scenes?.off ?? [] }).profile, footage: { dir: footageDir(identityDir), ...loadLibrary(identityDir) } };
  // the video's own copy of the recipe says which preset it is made with
  let presetId = null;
  try {
    presetId = projectDir ? loadProject(projectDir).recipe?.preset ?? null : null;
  } catch {
    presetId = null;
  }
  return presetId ? presetLook(loadPreset(presetId), brand) : brand;
}

// The icons the Identity's other videos draw (<identity>/icons-used.json, one
// list per ONE Video, the last 12 videos): a new video prefers others, so
// two videos never look alike (icons/index.mjs, DECISIONS 105). A rebuild of
// the same video keeps its own icons.
const ICONS_USED = "icons-used.json";
function iconsUsed(identityDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(identityDir, ICONS_USED), "utf8"));
  } catch {
    return {};
  }
}
const recentIcons = (identityDir, videoId) => Object.entries(iconsUsed(identityDir)).filter(([id]) => id !== videoId).flatMap(([, v]) => v.icons ?? []);
function rememberIcons(identityDir, videoId, icons) {
  if (!identityDir) return;
  const all = { ...iconsUsed(identityDir), [videoId]: { icons, at: new Date().toISOString() } };
  const keep = Object.entries(all).sort((a, b) => String(b[1].at).localeCompare(String(a[1].at))).slice(0, 12);
  fs.writeFileSync(path.join(identityDir, ICONS_USED), JSON.stringify(Object.fromEntries(keep), null, 2) + "\n");
}

// The Identity's Motion profile, or null (motion/profile.mjs). A broken file
// stops the build with a sentence, it is never silently ignored.
function motionOf(identityDir) {
  try {
    return loadProfile(identityDir);
  } catch (e) {
    throw new Error(`The Motion profile cannot be used: ${e.message} Open Wizards, Motion to fix it.`);
  }
}
// The comment calls of a ONE Video: its own choice at gate 1 (`own`), else
// the Identity's CTA profile, else the method's default (cta/profile.mjs).
function ctaOf(identityDir, own) {
  if (own) return videoPlan({ identityDir, own });
  loadCtaChecked(identityDir);
  return videoPlan({ identityDir });
}
function ctaLook(identityDir) {
  const theme = identityDir ? cardTheme(loadCard(identityDir).card, categories()) : baseTheme("blue-professional");
  return { bg: theme.bg, fg: theme.fg, font: theme["font-display"], buttons: Object.fromEntries(Object.keys(TEMPERATURES).map((t) => [t, callColor({ temperature: t }, theme)])) };
}
// The segments a script uses, copied into the ONE Video (segments/<place>.<ext>)
// so the project stands on its own (backups, another computer). Marks them
// used, and remembers this video's calls as "previously selected".
function takeSegments(projectDir, identityDir, plan, own) {
  const dir = path.join(projectDir, "segments");
  fs.rmSync(dir, { recursive: true, force: true });
  const segmentCalls = plan.filter((c) => c.mode === "segment").map((c) => {
    fs.mkdirSync(dir, { recursive: true });
    const file = `segments/${c.slot}${path.extname(c.segment.file)}`;
    fs.copyFileSync(path.join(segmentsDir(identityDir), c.segment.file), path.join(projectDir, file));
    return { slot: c.slot, keyword: c.keyword, temperature: c.temperature, gets: c.offer || c.gets, segmentId: c.segment.id, name: c.segment.name, file, seconds: c.segment.seconds, text: c.segment.text ?? null };
  });
  const endScreen = identityDir ? endScreenOf(identityDir, own) : 0;
  if (identityDir) {
    markUsed(identityDir, segmentCalls.map((c) => c.segmentId));
    const base = own ?? loadCta(identityDir) ?? defaultCta();
    saveLast(identityDir, { ...base, endScreen });
  }
  return { segmentCalls, endScreen };
}
// The Identity's memory of its last voice and avatar (Zoltan, 2026-10-05):
// every brand keeps its own, so gate 2 and gate 5 start from what this brand
// used before, not from a list. <identity>/last-used.json
const lastUsedFile = (identityDir) => path.join(identityDir, "last-used.json");
function lastUsed(identityDir) {
  try {
    return identityDir ? JSON.parse(fs.readFileSync(lastUsedFile(identityDir), "utf8")) : {};
  } catch {
    return {};
  }
}
function rememberUsed(identityDir, part) {
  if (!identityDir) return;
  const at = new Date().toISOString();
  const next = { ...lastUsed(identityDir), ...Object.fromEntries(Object.entries(part).map(([k, v]) => [k, { ...v, at }])) };
  fs.mkdirSync(identityDir, { recursive: true });
  fs.writeFileSync(lastUsedFile(identityDir), JSON.stringify(next, null, 2) + "\n");
}
function loadCtaChecked(identityDir) {
  try {
    return identityDir ? loadCta(identityDir) : null;
  } catch (e) {
    throw new Error(`The CTA profile cannot be used: ${e.message} Open Wizards, CTA to fix it.`);
  }
}
// scene types turned off: the Scenes profile, and an old Motion profile's list
const offOf = (look) => (typeof look === "object" ? [...new Set([...(look?.motion?.scenes?.off ?? []), ...(look?.scenes?.off ?? [])])] : []);
// How often the picture changes (the Motion profile, roles.mjs PACES).
const paceOfLook = (look) => (typeof look === "object" ? look?.motion?.pace ?? undefined : undefined);

// Dictionary findings for a ONE Video: the script's spoken text and every
// text of the scene table (DECISIONS 68). Never blocks, the gates show them.
function dictionaryFindings(projectDir, identityDir) {
  const dict = loadDictionary(identityDir);
  const pieces = [];
  const sj = path.join(projectDir, "script.json");
  if (fs.existsSync(sj)) pieces.push(...spokenFields(JSON.parse(fs.readFileSync(sj, "utf8"))).map(([where, text]) => [`script ${where}`, text]));
  const sc = path.join(projectDir, "scenes.json");
  if (fs.existsSync(sc)) {
    (JSON.parse(fs.readFileSync(sc, "utf8")).scenes ?? []).forEach((scene, i) => {
      for (const [k, v] of Object.entries(scene.vars ?? {})) if (typeof v === "string") pieces.push([`scene ${i + 1} ${k}`, v]);
    });
  }
  return checkAll(dict, pieces);
}

// A Custom edit changes the gate's output, so every later gate starts again
// (SPEC 6: running a gate again invalidates the later ones).
function edited(projectDir, gate) {
  const project = setGate(setGate(loadProject(projectDir), gate, { state: "running" }), gate, { state: "pending", mode: "custom" });
  saveProject(projectDir, project);
  return project;
}

// The scene table's footage changed (AI B-roll): a preview built before is
// stale. The approvals of the scenes and the avatar stay: the timing is the
// same.
function previewStale(projectDir) {
  const project = loadProject(projectDir);
  if (project.gates.review && project.gates.review.state !== "todo") saveProject(projectDir, setGate(project, "review", { state: "todo" }));
}
// After a new scene plan, the B-roll clips already made go back under their
// sentences (they are paid for); a plan for an earlier voice stays out.
function brollBack(projectDir) {
  try {
    const n = attachBroll(projectDir);
    if (n) appendLog(projectDir, `broll: ${n} clips laid under their sentences again`);
  } catch (e) {
    appendLog(projectDir, `broll: could not lay the clips again, ${e.message}`);
  }
}
// What the Scenes tab shows of AI B-roll: the Identity's settings, this
// video's plan and the price of what is left to make.
function brollState(projectDir, identityDir) {
  const settings = loadBrollSettings(identityDir);
  const plan = loadBrollPlan(projectDir);
  const lib = identityDir ? loadLibrary(identityDir) : { clips: [] };
  const clips = Object.fromEntries((plan?.items ?? []).filter((i) => i.clip).map((i) => [i.id, lib.clips.find((c) => c.id === i.clip) ?? null]));
  return { settings, plan, estimate: estimateBroll({ projectDir, settings }), clips, footageDir: identityDir ? footageDir(identityDir) : null, ...brollChoices() };
}
function moodOf(identityDir) {
  try {
    return loadProfile(identityDir)?.transition?.mood ?? null;
  } catch {
    return null;
  }
}

// The project, with gates left "running" by a closed app or a stopped step
// marked failed (saved). `live`: the ONE Videos a step really runs in now,
// from the app's core (jobs.rs); without it the process id decides.
function recovered(projectDir, live = null) {
  const project = loadProject(projectDir);
  const next = recoverInterrupted(project, undefined, { dir: projectDir, live });
  if (next !== project) {
    saveProject(projectDir, next);
    appendLog(projectDir, "a step stopped before it finished (Stop, no answer, or the app was closed), marked failed");
  }
  return next;
}

// The comment calls the current script was written with (null: no script,
// or one written before the CTA wizard).
function scriptCalls(projectDir) {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(projectDir, "script.json"), "utf8"));
    if (!s.commentCalls && !s.segmentCalls) return null;
    const order = ["start", "middle", "end"];
    return [...(s.commentCalls ?? []), ...(s.segmentCalls ?? []).map((c) => ({ slot: c.slot, keyword: c.keyword, temperature: c.temperature, segment: true }))].sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot));
  } catch {
    return null;
  }
}

function readVoiceInfo(projectDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(projectDir, "audio", "voice.json"), "utf8"));
  } catch {
    return null;
  }
}

// The newest render of a project, with its captions and chapters, so the UI
// shows it again after a restart or an Autopilot run.

function latestVideo(projectDir) {
  const out = path.join(projectDir, "out");
  if (!fs.existsSync(out)) return null;
  const mp4 = fs.readdirSync(out).filter((f) => /^video-.*\.mp4$/.test(f)).sort().pop();
  if (!mp4) return null;
  const file = path.join(out, mp4);
  const base = file.replace(/\.mp4$/, "");
  const chapters = fs.existsSync(`${base}.chapters.txt`) ? fs.readFileSync(`${base}.chapters.txt`, "utf8").trim() : null;
  let calls = null;
  let syntheticMedia = false;
  try {
    const pub = JSON.parse(fs.readFileSync(`${base}.card.json`, "utf8"));
    calls = pub.commentCalls;
    syntheticMedia = pub.syntheticMedia === true;
  } catch {
    // rendered before the publishing data existed
  }
  return {
    file,
    chapters,
    srt: fs.existsSync(`${base}.srt`) ? `${base}.srt` : null,
    cardFile: fs.existsSync(`${base}.card.json`) ? `${base}.card.json` : null,
    comments: fs.existsSync(`${base}.comments.txt`) ? fs.readFileSync(`${base}.comments.txt`, "utf8") : null,
    calls,
    syntheticMedia,
    youtube: youtubeTexts(projectDir, file),
  };
}

// Gate 1: the script of one ONE Video. The Script tab, the channel screen and
// the Week batch all come through here. Writes script.json + script.md and
// leaves the gate pending (or approved in autopilot).
async function writeScriptGate({ projectDir, identityDir, llm, input = {}, channel = {} }) {
  const dict = loadDictionary(identityDir);
  let project = setGate(loadProject(projectDir), "script", { state: "running", mode: "recommended" });
  saveProject(projectDir, project);
  appendLog(projectDir, `script: writing with ${llm.provider}/${llm.model || "default model"}`);
  try {
    const plan = ctaOf(identityDir, input.cta);
    const res = await timed("script", Number(input.targetLengthMin) || 8, emit, () =>
      writeScript({
        llm: { provider: llm.provider, model: llm.model, effort: llm.effort ?? null, apiKey: key() },
        input: { ...input, keyword: input.keyword ?? project.keyword ?? undefined, brief: readBrief(projectDir) ?? undefined, seed: readSeed(projectDir), bridge: bridgeLines(path.dirname(projectDir), project.series), channel, language: project.language, dictionary: dictionaryData(dict), commentCalls: plan.filter((c) => c.mode === "narrator"), notes: notesOf(projectDir), research: briefForScript(loadBrief(projectDir)), styleNote: project.recipe?.preset ? loadPreset(project.recipe.preset).scriptNote : null },
        onProgress: (p) => emit({ event: "progress", ...p }),
      }),
    );
    Object.assign(res.script, takeSegments(projectDir, identityDir, plan, input.cta));
    for (const c of plan) if (c.note) appendLog(projectDir, `script: ${c.note}`);
    writeJson(path.join(projectDir, "script.json"), res.script);
    writeAtomic(path.join(projectDir, "script.md"), res.markdown);
    // The packaging (title ideas, summary, tags) right with the script
    // (DECISIONS 86). A problem here never loses the script.
    try {
      const pack = await makePackaging({ llm: { provider: llm.provider, model: llm.model, effort: llm.effort ?? null, apiKey: key() }, projectDir, language: project.language });
      appendLog(projectDir, `packaging: ${pack.titles.length} title ideas${pack.chosen ? ", the chosen title kept" : ""}`);
    } catch (e) {
      appendLog(projectDir, `packaging: failed, ${e.message}`);
    }
    project = setGate(loadProject(projectDir), "script", { state: project.autopilot ? "approved" : "pending", mode: "recommended" });
    const packTitle = loadPackaging(projectDir)?.title;
    if (packTitle) project.title = packTitle;
    else if (res.script.title && !project.title) project.title = res.script.title;
    saveProject(projectDir, project);
    const findings = checkAll(dict, spokenFields(res.script).map(([where, text]) => [`script ${where}`, text]));
    if (res.humanize !== "off") appendLog(projectDir, `script: natural voice ${res.humanize}${res.humanizeNote ? `, ${res.humanizeNote}` : ""}`);
    appendLog(projectDir, `script: done, ${res.words} words${findings.length ? `, ${findings.length} dictionary findings` : ""}`);
    return { markdown: res.markdown, words: res.words, gate: project.gates.script, status: project.status, dictionary: findings, humanize: res.humanize, humanizeNote: res.humanizeNote };
  } catch (e) {
    const failed = setGate(loadProject(projectDir), "script", { state: "failed", error: String(e.message).slice(0, 2000) });
    saveProject(projectDir, failed);
    appendLog(projectDir, `script: failed, ${e.message}`);
    throw e;
  }
}

// A week batch in any mode. Pasted texts skip the AI's ideas. What each video gets
// next depends on what it started from: a finished script needs nothing here, notes
// and a topic get their script, and with research on each gets its brief and waits.
async function weekBatch({ projectsDir, identityDir, identity, llm = null, channel = {}, name = "", theme = "", language = "en", count = WEEK, pasted = "", textKind = "notes", research = false }) {
  const recipe = recipeFor(loadRecipe(identityDir) ?? defaultRecipe({}), "script", { language });
  const texts = splitPasted(pasted);
  const preset = loadPreset(recipe.preset);
  // no AI: pasted texts still make their videos by hand; only ideas out of nothing need one
  if (!llm && !texts.length) throw new Error("A week of ideas needs an AI. Add a key in Settings, Connections, or paste your texts with a line of --- between them.");
  research = research || preset.factChecked === true;
  const avoid = fs.existsSync(projectsDir) ? fs.readdirSync(projectsDir).flatMap((n) => { try { return [loadProject(path.join(projectsDir, n)).title]; } catch { return []; } }) : [];
  const firstWords = (t) => t.replace(/\s+/g, " ").trim().split(" ").slice(0, 8).join(" ").replace(/[.,:;!?]+$/, "");
  return runWeekBatch({
    llm: llm ? { provider: llm.provider, model: llm.model, effort: llm.effort ?? null, apiKey: key() } : null,
    channel,
    name,
    theme: [theme, loadPreset(recipe.preset).ideaNote].filter(Boolean).join(" "),
    language,
    count,
    avoid,
    given: texts.length ? texts.map((text) => ({ title: firstWords(text), text })) : null,
    onProgress: (p) => emit({ event: "progress", ...p }),
    create: ({ title, idea, queue }) => newScriptVideo({ projectsDir, identity, language, recipe, topic: idea.text ? "" : title, text: idea.text ?? "", textKind, research, queue, title }),
    write: async ({ dir, idea }) => {
      if (research) {
        if (llm) await commands["research-make"]({ projectDir: dir, llm, channel });
        else await commands["research-offline"]({ projectDir: dir });
        return;
      }
      if (idea.text && textKind === "finished") return;
      if (!llm) {
        await commands["script-offline"]({ projectDir: dir, reason: "no AI key is set" });
        return;
      }
      try {
        await writeScriptGate({ projectDir: dir, identityDir, llm, channel, input: { topic: idea.angle ? `${idea.title}. ${idea.angle}` : idea.title, targetLengthMin: recipe.targetLengthMin } });
      } catch (e) {
        if (!e?.offline) throw e;
        await commands["script-offline"]({ projectDir: dir, reason: e.message });
      }
    },
  });
}

// The channel recipe's scene plan: the same steps and checks as gate 3's other
// plans, the same table. The price is on the channel screen, not asked per step.
async function templateScenes({ projectDir, identityDir, look, llm }) {
  const project = loadProject(projectDir);
  const preset = loadPreset(project.recipe?.preset ?? (identityDir ? loadRecipe(identityDir)?.preset : null) ?? "motion-frames");
  saveProject(projectDir, setGate(project, "scenes", { state: "running", mode: llm ? "recommended" : "default" }));
  appendLog(projectDir, `scenes: ${preset.label} templates ${llm ? `with ${llm.provider}/${llm.model || "default model"}` : "by rule, no AI"}`);
  try {
    const r = await timed("scenes", jsonCount(projectDir, "sentences.json"), emit, () =>
      makeTemplateScenes({ llm, projectDir, preset, language: project.language, title: project.title, off: offOf(look), identityDir: identityDir ?? null, videoId: path.basename(projectDir), onProgress: (p) => emit({ event: "progress", ...p }) }),
    );
    brollBack(projectDir);
    const next = setGate(loadProject(projectDir), "scenes", { state: "pending", mode: llm ? "recommended" : "default" });
    saveProject(projectDir, next);
    appendLog(projectDir, `scenes: done, ${r.scenes} scenes from ${r.parts} part${r.parts === 1 ? "" : "s"}, ${r.byRule} by rule${r.warnings.length ? `; ${r.warnings.slice(0, 3).join(" ")}` : ""}`);
    return { ...r, ...(await sceneRows(projectDir, { off: offOf(look) })), gate: next.gates.scenes, status: next.status };
  } catch (e) {
    saveProject(projectDir, setGate(loadProject(projectDir), "scenes", { state: "failed", error: String(e.message).slice(0, 2000) }));
    appendLog(projectDir, `scenes: failed, ${e.message}`);
    throw e;
  }
}

const commands = {
  // Send to Publishing (publishing.mjs, DECISIONS 115): the card of a
  // rendered video to the user's publishing app, with its token.
  "card-send": async ({ projectDir, file, url }) => {
    const card = path.resolve(String(file ?? ""));
    if (!card.startsWith(path.resolve(projectDir)) || !/\.card\.json$/i.test(card)) throw new Error("That is not a card of this project.");
    const r = await sendCard({ url, token: key(), cardFile: card });
    appendLog(projectDir, r.ok ? `publishing: card ${r.updated ? "updated" : "sent"}` : `publishing: not sent (${r.status ?? "no answer"}), ${r.message}`);
    if (r.ok) {
      try {
        markSent(projectDir, r.cardId);
      } catch (e) {
        appendLog(projectDir, `publishing: sent, but not noted in project.json (${e.message})`);
      }
    }
    return r;
  },

  // The Channels board on Home (course/board.mjs, DECISIONS 127): one
  // Identity's playlists, called once per Identity.
  "channel-board": async ({ projectsDir }) => channelBoard(projectsDir),
  // The Uploaded tick with the YouTube link. The upload itself stays manual.
  "set-upload": async ({ projectDir, url, at = null, clear = false }) => {
    const r = setUpload(projectDir, { url, at, clear });
    return { ...r, calls: scriptCalls(projectDir) };
  },
  // The Evergreen Traffic Card of the Identity (planner/traffic-card.mjs).
  "traffic-card-preview": async ({ file, text, channel = {}, name = "" }) => previewTrafficCard({ file, text, channel, name }),
  "traffic-card-save": async ({ identityDir, file, text }) => saveTrafficCard(identityDir, { file, text }),
  "traffic-card-load": async ({ identityDir }) => ({ card: loadTrafficCard(identityDir) }),
  // The Playlist Planner (planner/index.mjs, DECISIONS 127). Each paid step
  // is its own command, so the UI asks before each one.
  "planner-start": async ({ identityDir, answers = {}, channel = {}, language = "en" }) => {
    const card = loadTrafficCard(identityDir);
    return { card, seeds: seedsFrom({ card, topic: answers.topic }), context: contextOf({ card, answers, channel, language }), research: loadResearch(identityDir) };
  },
  "planner-balance": async () => vidiqBalance({ apiKey: key() }),
  "planner-research": async ({ identityDir, seeds, country = null }) => {
    const r = await plannerResearch({ apiKey: key(), seeds, country, onProgress: (p) => emit({ event: "progress", ...p }) });
    return { ...r, saved: saveResearch(identityDir, { seeds, keywords: r.keywords, failed: r.failed, creditsUsed: r.creditsUsed }) };
  },
  "planner-plan": async ({ llm, context, keywords }) =>
    planPlaylist({ llm: { provider: llm.provider, model: llm.model, effort: llm.effort ?? null, apiKey: key() }, context, keywords, onProgress: (p) => emit({ event: "progress", ...p }) }),
  "planner-outline": async ({ llm, context, rows }) =>
    outlineVideos({ llm: { provider: llm.provider, model: llm.model, effort: llm.effort ?? null, apiKey: key() }, context, rows, onProgress: (p) => emit({ event: "progress", ...p }) }),
  // The Course Content Structure as text, for the course import (free).
  "planner-build": async ({ title, promise, audience, rows, outline }) => ({ text: JSON.stringify(buildStructure({ title, promise, audience, rows, outline }), null, 2) + "\n" }),
  "upload-info": async ({ projectDir }) => ({ upload: loadProject(projectDir).upload ?? null, calls: scriptCalls(projectDir) }),
  providers: async () => ({ providers: Object.entries(PROVIDERS).map(([id, p]) => ({ id, label: p.label, model: p.model })) }),

  // The App settings (config.json) and/or one Identity (identity.json),
  // checked before every save and every Identity import.
  "validate-config": async ({ config, identity }) => ({
    errors: [
      ...(config !== undefined ? validate(config, loadSchema("config")) : []),
      ...(identity !== undefined ? validate(identity, loadSchema("identity")).map((e) => e.replace(/^\$/, "identity")) : []),
    ],
  }),

  "validate-brief": async ({ brief }) => ({ errors: validate(brief, loadSchema("brief-card")) }),

  // Backups (backup.mjs). The core puts backupRoot, projectsRoot and folders
  // into the request from the App settings; the UI cannot choose them.
  "backup-project": async ({ projectDir, backupRoot, identityFolder, level }) =>
    backupProject({ projectDir, backupRoot, identityFolder, level, onProgress: (p) => emit({ event: "progress", ...p }) }),
  "backup-all": async ({ backupRoot, projectsRoot, folders, level }) =>
    backupAll({ backupRoot, projectsRoot, folders, level, onProgress: (p) => emit({ event: "progress", ...p }) }),
  "backup-estimate": async ({ projectsRoot, folders }) => backupEstimate({ projectsRoot, folders }),
  "list-backups": async ({ backupRoot, identityFolder, projectsDir }) => ({ backups: listBackups({ backupRoot, identityFolder, projectsDir }) }),
  "restore-project": async ({ backupRoot, path: rel, projectsDir }) => restoreProject({ backupRoot, path: rel, projectsDir }),
  "backup-status": async ({ projectDir }) => backupRecord(projectDir),
  "set-backup-level": async ({ projectDir, level }) => setBackupLevel(projectDir, level ?? null),

  "test-llm": async ({ provider, model }) => testKey({ provider, model, apiKey: key() }),

  "test-service": async ({ service }) => testServiceKey({ service, apiKey: key() }),

  // Onboarding "Use recommended" for Audience and Brand Voice.
  "suggest-channel": async ({ llm, field, channel, topic, words, answers }) =>
    suggestChannel({ llm: { provider: llm.provider, model: llm.model, effort: llm.effort ?? null, apiKey: key() }, field, channel, topic, words, answers }),

  // The YouTube Brand Channel Wizard (channelwizard/index.mjs). No AI, no network.
  "channel-wizard-state": async ({ identityDir }) => wizardState(identityDir),
  "channel-wizard-draft": async ({ identityDir, ...draft }) => { saveWizardDraft(identityDir, draft); return { saved: true }; },
  "channel-wizard-kit": async ({ identityDir, ...input }) => wizardKit(identityDir, input),
  "channel-wizard-save": async ({ identityDir, ...input }) => wizardSave(identityDir, input),
  "channel-wizard-export": async ({ identityDir, ...input }) => wizardExport(identityDir, input),

  "create-project": async ({ projectsDir, title, language, brief, autopilot, identity }) => {
    const { id, dir } = createProject({ projectsDir, title, language, brief, autopilot, identity });
    return { id, dir };
  },

  "list-projects": async ({ projectsDir, liveProjects = null }) => {
    if (!projectsDir || !fs.existsSync(projectsDir)) return { projects: [] };
    const projects = [];
    for (const name of fs.readdirSync(projectsDir)) {
      const dir = path.join(projectsDir, name);
      try {
        const p = recovered(dir, liveProjects);
        projects.push({ id: p.id, title: p.title, status: p.status, dir, createdAt: p.createdAt, gates: p.gates, render: p.render ?? null, autopilotRun: !!p.autopilotRun, series: p.series ?? null, queue: p.queue ?? null, recipe: p.recipe ?? null });
      } catch {
        // not a project folder, or a broken one: skip it
      }
    }
    projects.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return { projects };
  },

  // ---- Course import (course/index.mjs, DECISIONS 121) ----------------------------
  // A Course Content Structure, as a file or as pasted text: the preview
  // first, then one prepared ONE Video per lesson. Nothing here calls a
  // service or starts a step.
  "course-preview": async ({ projectsDir, file, text }) => previewCourse({ projectsDir, file, text }),
  "course-import": async ({ projectsDir, file, text, identity, language }) => importCourse({ projectsDir, file, text, identity, language }),
  "course-list": async ({ projectsDir }) => listCourses(projectsDir),
  "course-export": async ({ projectsDir, slug, file }) => exportCourse({ projectsDir, slug, file }),

  // ---- Brand wizard (docs/wizards/brand.md) ----------------------------------------
  // Everything the wizard shows: the Identity's card (own or from its preset),
  // the gallery, the fonts, the contrast check.
  "brand-state": async ({ identityDir, preset }) => {
    const { card, own } = loadCard(identityDir, { preset });
    const fonts = fontsIndex().families.map((f) => ({ id: f.id, family: f.family, category: f.category, files: f.files.map((x) => ({ file: `${f.id}/${x.file}`, weight: x.weight, unicodeRange: x.unicodeRange })) }));
    const presets = galleryCards().map(({ id, label, group, card: c }) => ({ id, label, group, card: c }));
    return { card, own, presets, styleNote: STYLE_NOTE, fonts, contrast: contrastReport(card), fontsDir: path.join(libraryDir(), "fonts"), brandDir: identityDir ? path.join(identityDir, "brand") : null };
  },

  // "Import tokens.css" (the wizard's Start screen): a design system's
  // tokens (Claude Design, open-design, shadcn...) as a card to edit, not
  // saved yet. The text comes from the Rust core (read_design_file).
  "brand-import": async ({ text, fileName = "tokens.css" }) => {
    const { card, notes } = cardFromTokens(text, { families: familyNames(), name: String(fileName).replace(/\.[a-z]+$/i, "").slice(0, 60) || "Imported", source: { kind: "import" } });
    return { card: normalizeCard(card, { families: familyNames() }), fonts: notes, contrast: contrastReport(card) };
  },

  // The contrast check of a card the wizard is still editing (nothing saved).
  "brand-check": async ({ card }) => {
    const clean = normalizeCard(card, { families: familyNames() });
    return { card: clean, contrast: contrastReport(clean) };
  },

  "brand-save": async ({ identityDir, card }) => {
    if (!identityDir) throw new Error("No Identity to save the look in.");
    const saved = saveCard(identityDir, card, { families: familyNames() });
    return { card: saved, own: true, contrast: contrastReport(saved) };
  },

  // The real preview: the built-in sample video with this card, five stills.
  "brand-preview": async ({ card, language = "en" }) => {
    const r = await timed("brand-preview", 5, emit, () => brandPreview({ card, language, onProgress: (p) => emit({ event: "progress", ...p }) }));
    return { ...r, dir: previewDir() };
  },

  // The Motion wizard (docs/wizards/motion.md): the saved profile (or null),
  // the recommendation from the Brand, and every choice.
  "motion-state": async ({ identityDir }) => {
    const { card } = loadCard(identityDir);
    const recommended = recommendMood(card);
    const profile = identityDir ? loadProfile(identityDir) : null;
    return { profile, recommended, start: profileFromMood(recommended.mood, { energy: recommended.energy }), light: card.appearance === "light", options: wizardOptions() };
  },

  // A mood's whole profile (the Start screen's cards), or a profile being
  // edited checked (nothing saved).
  "motion-check": async ({ profile, mood, energy }) => ({ profile: mood ? profileFromMood(mood, { energy }) : normalizeProfile(profile) }),

  "motion-save": async ({ identityDir, profile }) => {
    if (!identityDir) throw new Error("No Identity to save the Motion profile in.");
    return { profile: saveProfile(identityDir, profile) };
  },

  // The real preview: the sample video with the card and this profile, rendered.
  "motion-preview": async ({ identityDir, profile, language = "en" }) => {
    const { card } = loadCard(identityDir);
    const r = await timed("motion-preview", 6, emit, () => motionPreview({ card, profile, language, onProgress: (p) => emit({ event: "progress", ...p }) }));
    return { ...r, dir: motionPreviewDir() };
  },

  // The CTA wizard (docs/wizards/cta.md): the saved profile (or null, then
  // `start` is the method's default), the 15 keywords and the places.
  // `look`: the Identity's video colours and the call buttons on them, for
  // the wizard's still preview (no render).
  "cta-state": async ({ identityDir }) => ({
    profile: loadCtaChecked(identityDir),
    start: defaultCta(),
    options: { keywords: catalogForUi(), temperatures: TEMPERATURES, slots: SLOTS, placesForCount: PLACES_FOR_COUNT },
    look: ctaLook(identityDir),
    last: identityDir ? loadLast(identityDir) : null,
    segments: identityDir ? loadSegments(identityDir) : [],
  }),
  "cta-save": async ({ identityDir, profile }) => {
    if (!identityDir) throw new Error("No Identity to save the CTA profile for.");
    return { profile: saveCta(identityDir, profile) };
  },
  "cta-check": async ({ profile }) => ({ profile: normalizeCta(profile) }),

  // The Identity's segments (cta/segments.mjs). An upload is copied into
  // <identity>/segments by the Rust core (import_segment) first; this checks
  // and registers it.
  // The Identity's own footage (footage/library.mjs, DECISIONS 82). An upload
  // is copied into <identity>/footage by the Rust core (import_footage) first.
  "footage-list": async ({ identityDir }) => ({ ...loadLibrary(identityDir), dir: footageDir(identityDir), modes: FOOTAGE_MODES, maxSeconds: MAX_CLIP_SECONDS }),
  "footage-add": async ({ identityDir, file, name, description }) => ({ clip: await addClip({ identityDir, file, name, description }) }),
  "footage-update": async ({ identityDir, id, name, description }) => ({ clip: updateClip(identityDir, id, { name, description }) }),
  "footage-remove": async ({ identityDir, id }) => removeClip(identityDir, id),
  "footage-mode": async ({ identityDir, mode }) => setFootageMode(identityDir, mode),
  "footage-describe": async ({ identityDir, id, llm }) => ({ clip: await describeClip({ identityDir, id, llm: { provider: llm.provider, model: llm.model, effort: llm.effort ?? null, apiKey: key() } }) }),

  // AI B-roll (broll/, generate/, docs/ai-broll.md). The settings are the
  // Identity's (Identity, Footage); the plan is the ONE Video's.
  "broll-settings": async ({ identityDir }) => {
    const g = generatorOf(PAID_GENERATOR);
    return { settings: loadBrollSettings(identityDir), cap: BROLL_CAP, ...brollChoices(), paidChoice: { model: PAID_GENERATOR, label: g.label, limits: PAID_LIMITS, qualities: g.qualities.map((id) => ({ id, clipUsd: usdFor(g.minSeconds, { generator: PAID_GENERATOR, quality: id }), seconds: g.minSeconds })) } };
  },
  "broll-settings-save": async ({ identityDir, settings }) => ({ settings: saveBrollSettings(identityDir, settings) }),
  "broll-state": async ({ projectDir, identityDir }) => brollState(projectDir, identityDir),
  "broll-plan": async ({ projectDir, identityDir, llm }) => {
    const settings = loadBrollSettings(identityDir);
    if (!settings.enabled) throw new Error("AI B-roll is off. Turn it on in Identity, Footage.");
    appendLog(projectDir, `broll: planning with ${llm.provider}/${llm.model || "default model"}`);
    const identity = identityDir ? { card: loadCard(identityDir).card, mood: moodOf(identityDir) } : {};
    const r = await logged(projectDir, "broll: planning", () =>
      timed("broll-plan", 1, emit, () => planBroll({ llm: { provider: llm.provider, model: llm.model, effort: llm.effort ?? null, apiKey: key() }, projectDir, settings, identity, library: identityDir ? loadLibrary(identityDir) : null, language: loadProject(projectDir).language, onProgress: (p) => emit({ event: "progress", ...p }) })),
    );
    appendLog(projectDir, `broll: planned ${r.plan.items.length} clips${r.note ? `, ${r.note}` : ""}`);
    return { ...brollState(projectDir, identityDir), note: r.note ?? null };
  },
  "broll-estimate": async ({ projectDir, identityDir, ids = null }) => ({ estimate: estimateBroll({ projectDir, settings: loadBrollSettings(identityDir), ids }) }),
  // The HeyGen account's balance, next to the estimate (like the avatar's).
  "broll-balance": async () => ({ account: await heygen.balance({ apiKey: key() }) }),
  "broll-make": async ({ projectDir, identityDir, ids = null, allowOverCap = false }) => {
    const settings = loadBrollSettings(identityDir);
    if (!settings.enabled) throw new Error("AI B-roll is off. Turn it on in Identity, Footage.");
    const est = estimateBroll({ projectDir, settings, ids });
    appendLog(projectDir, `broll: making ${est.items} clips with ${settings.generator} ${settings.quality}, about ${est.usd.toFixed(2)} USD${allowOverCap ? ", over the limit with the user's yes" : ""}`);
    const r = await logged(projectDir, "broll: making", () =>
      timed("broll-make", Math.max(1, est.items), emit, () => makeBroll({ projectDir, identityDir, apiKey: key(), settings, ids, allowOverCap, onProgress: (p) => emit({ event: "progress", ...p }) })),
    );
    previewStale(projectDir);
    return { ...brollState(projectDir, identityDir), made: r.made, fromLibrary: r.fromLibrary, failed: r.failed };
  },
  "broll-update": async ({ projectDir, identityDir, id, prompt, use }) => {
    updateBroll(projectDir, id, { prompt, use });
    if (typeof use === "boolean") previewStale(projectDir);
    return brollState(projectDir, identityDir);
  },
  "broll-again": async ({ projectDir, identityDir, id, prompt }) => {
    againBroll(projectDir, id, { prompt });
    previewStale(projectDir);
    appendLog(projectDir, `broll: ${id} to be made again`);
    return brollState(projectDir, identityDir);
  },
  "broll-remove": async ({ projectDir, identityDir, id }) => {
    removeBroll(projectDir, id);
    previewStale(projectDir);
    appendLog(projectDir, `broll: ${id} removed from the video (kept in the library)`);
    return brollState(projectDir, identityDir);
  },

  // The B-roll engine (broll/engine.mjs, docs/BUILD_PLAN.md phase 1b): a plan,
  // the free sources in their order, Pixabay, then what waits for a yes. One
  // key per command, so each source is its own command; ProjectView runs them.
  "broll-auto-state": async ({ projectDir, identityDir }) => brollReview({ projectDir, identityDir, settings: loadBrollSettings(identityDir) }),
  "broll-auto-plan": async ({ projectDir, identityDir, llm }) => {
    const r = await logged(projectDir, "broll engine: planning", () => planAuto({ llm: { provider: llm.provider, model: llm.model, effort: llm.effort ?? null, apiKey: key() }, projectDir, language: loadProject(projectDir).language, onProgress: (p) => emit({ event: "progress", ...p }) }));
    appendLog(projectDir, `broll engine: ${r.plan.items.length} stretches, planned by ${r.plan.plannedBy}`);
    return brollReview({ projectDir, identityDir, settings: loadBrollSettings(identityDir) });
  },
  "broll-auto-plan-rule": async ({ projectDir, identityDir }) => {
    const r = await planAuto({ projectDir, language: loadProject(projectDir).language });
    appendLog(projectDir, `broll engine: ${r.plan.items.length} stretches, planned by rule`);
    return brollReview({ projectDir, identityDir, settings: loadBrollSettings(identityDir) });
  },
  "broll-auto-find": async ({ projectDir, identityDir }) => {
    const r = await logged(projectDir, "broll engine: free sources, words only", () => findFree({ projectDir, identityDir, onProgress: (p) => emit({ event: "progress", ...p }) }));
    appendLog(projectDir, `broll engine: free sources found ${r.found}, ${r.open} open`);
    return { found: r.found, open: r.open };
  },
  "broll-auto-find-checked": async ({ projectDir, identityDir, llm }) => {
    const r = await logged(projectDir, "broll engine: free sources, the AI looks at the frames", () => findFree({ projectDir, identityDir, llm: { provider: llm.provider, model: llm.model, effort: llm.effort ?? null, apiKey: key() }, onProgress: (p) => emit({ event: "progress", ...p }) }));
    appendLog(projectDir, `broll engine: free sources found ${r.found}, ${r.open} open`);
    return { found: r.found, open: r.open };
  },
  "broll-auto-pixabay": async ({ projectDir, identityDir }) => {
    const r = await logged(projectDir, "broll engine: Pixabay", () => findPixabay({ projectDir, identityDir, apiKey: key(), onProgress: (p) => emit({ event: "progress", ...p }) }));
    appendLog(projectDir, `broll engine: Pixabay found ${r.found}, ${r.open} open`);
    return { found: r.found, open: r.open };
  },
  "broll-auto-finish": async ({ projectDir, identityDir }) => {
    const settings = loadBrollSettings(identityDir);
    const r = finishFind({ projectDir, identityDir, settings });
    appendLog(projectDir, `broll engine: ${r.placed} clips in the scene table, ${r.plan.items.filter((i) => i.paidWanted).length} paid clips waiting for a yes`);
    previewStale(projectDir);
    return brollReview({ projectDir, identityDir, settings });
  },
  "broll-paid-toggle": async ({ projectDir, identityDir, id, on, tier = null }) => {
    setPaidWanted({ projectDir, id, on, tier });
    return brollReview({ projectDir, identityDir, settings: loadBrollSettings(identityDir) });
  },
  "broll-prompt-save": async ({ projectDir, identityDir, id, prompt }) => {
    updateBroll(projectDir, id, { prompt });
    return brollReview({ projectDir, identityDir, settings: loadBrollSettings(identityDir) });
  },
  "broll-auto-remove": async ({ projectDir, identityDir, id }) => {
    removeBroll(projectDir, id);
    previewStale(projectDir);
    appendLog(projectDir, `broll engine: ${id} removed from the video (kept in the library)`);
    const table = JSON.parse(fs.readFileSync(path.join(projectDir, "scenes.json"), "utf8"));
    logTableFootage({ projectDir, table, clips: loadLibrary(identityDir).clips ?? [] });
    return brollReview({ projectDir, identityDir, settings: loadBrollSettings(identityDir) });
  },
  // The only command of the engine that spends money. The UI sends the total it
  // showed; engine.mjs refuses any other total, and anything over a limit.
  "broll-paid-approve": async ({ projectDir, identityDir, quotedUsd }) => {
    const settings = loadBrollSettings(identityDir);
    appendLog(projectDir, `broll engine: paid clips approved at ${Number(quotedUsd).toFixed(2)} USD with ${settings.paid.model} ${settings.paid.quality}`);
    const r = await logged(projectDir, "broll engine: paid clips", () => timed("broll-make", 1, emit, () => approvePaid({ projectDir, identityDir, apiKey: key(), settings, quotedUsd, onProgress: (p) => emit({ event: "progress", ...p }) })));
    previewStale(projectDir);
    // what failed goes back to its free picture (approvePaid), and the Preview says so
    if (r.failed?.length) addNote(projectDir, "paid", `${r.failed.length} paid clip${r.failed.length === 1 ? "" : "s"} did not work, so the free picture stays there: ${friendlyMessage(r.failed[0].error)}`);
    return { ...brollReview({ projectDir, identityDir, settings }), made: r.made, failed: r.failed };
  },
  "kie-balance": async () => ({ account: await kieBalance({ apiKey: key() }) }),

  // "Previously used": the voice and the avatar look this Identity used last.
  "last-used": async ({ identityDir }) => ({ used: lastUsed(identityDir) }),
  "segments-list": async ({ identityDir }) => ({ segments: loadSegments(identityDir), dir: segmentsDir(identityDir), maxSeconds: SEGMENT_MAX_SECONDS, maxText: SEGMENT_TEXT_MAX }),
  "segment-add": async ({ identityDir, file, keyword, name, text }) => ({ segment: await addSegment({ identityDir, file, keyword, name, text, source: "upload" }) }),
  "segment-remove": async ({ identityDir, id }) => removeSegment(identityDir, id),
  // A segment made in the app: the narrator reads the sentence (its key),
  // then HeyGen makes the avatar video on it (the HeyGen key).
  "segment-voice": async ({ identityDir, narrator, text, language }) => segmentVoice({ identityDir, narrator, apiKey: key(), text, language }),
  "segment-make": async ({ identityDir, lookId, audio, keyword, name, text, engine, lookEngines }) => ({
    segment: await segmentVideo({ identityDir, apiKey: key(), lookId, audio, keyword, name, text, engine, lookEngines, background: ctaLook(identityDir).bg, onProgress: (p) => emit({ event: "progress", ...p }) }),
  }),

  // A clip made in HeyGen itself (the web app or an earlier run) becomes a
  // segment: the account's finished videos, then the chosen one downloaded
  // (reads only, no cost; DECISIONS 101). Pictures are cached locally like
  // the avatar previews.
  "segment-import-list": async ({ identityDir, title }) => {
    const videos = await heygen.listVideos({ apiKey: key(), title: String(title ?? "").trim().slice(0, 100) || undefined });
    const have = new Set(loadSegments(identityDir).map((s) => s.heygenId).filter(Boolean));
    const dir = path.join(dataDir(), "avatar-previews");
    const queue = [...videos];
    const worker = async () => {
      for (let v = queue.shift(); v; v = queue.shift()) {
        try {
          v.image = v.image ? await heygen.cachePreview({ url: v.image, dir }) : null;
        } catch {
          v.image = null;
        }
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    return { videos: videos.map(({ url, ...v }) => ({ ...v, tooLong: v.seconds != null && v.seconds > SEGMENT_MAX_SECONDS, imported: have.has(v.id) })), maxSeconds: SEGMENT_MAX_SECONDS };
  },
  "segment-import": async ({ identityDir, id, keyword, name, text }) => {
    const dir = segmentsDir(identityDir);
    const file = incomingName(".mp4");
    const got = await heygen.downloadVideo({ apiKey: key(), id, out: path.join(dir, file) });
    return { segment: await addSegment({ identityDir, file, keyword, name: name || got.title, text, source: "heygen-import", heygenId: id }) };
  },

  // The Scenes wizard (scenes-profile.mjs, DECISIONS 110): the profile and
  // every choice, with what this Identity has (footage, packs).
  "scenes-state": async ({ identityDir }) => {
    const motion = identityDir ? motionOf(identityDir) : null;
    const { profile, saved } = loadScenesProfile(identityDir, { motionOff: motion?.scenes?.off ?? [] });
    let footage = 0;
    try {
      footage = (loadLibrary(identityDir).clips ?? []).filter((c) => c.source !== "generated").length;
    } catch {
      footage = 0;
    }
    const SAMPLE = ["lightbulb", "rocket", "calendar", "mail", "target", "users", "chart-bar", "clock", "heart", "message-circle"];
    const icons = ICON_FAMILIES.map((id) => {
      const fam = loadIconFamily(id);
      const sample = fam ? SAMPLE.map((n) => fam.icons[n] ?? Object.entries(fam.icons).find(([k]) => k.startsWith(n))?.[1]).filter(Boolean).slice(0, 8).map((i) => i.d) : [];
      return { id, label: fam?.label ?? id, license: fam?.license ?? "", count: fam ? Object.keys(fam.icons).length : 0, sample };
    });
    const roles = Object.entries(SCENE_ROLES)
      .filter(([r]) => r !== "closing")
      .map(([r, meta]) => ({ role: r, label: meta.label, hint: meta.hint, components: Object.entries(SCENE_COMPONENTS).filter(([, c]) => c.role === r && !c.retired).map(([name, c]) => ({ name, label: c.label, description: entryOf(name)?.shows ?? "" })) }))
      .filter((r) => r.components.length);
    return {
      profile,
      saved,
      options: {
        presets: Object.entries(MIX_PRESETS).map(([id, p]) => ({ id, ...p })),
        kinds: KINDS.map((k) => ({ id: k, label: KIND_LABELS[k] })),
        roles,
        icons,
        sources: Object.entries(PICTURE_SOURCES).map(([id, s]) => ({ id, label: s.label, hint: s.hint, kinds: s.kinds, later: Boolean(s.later) })),
        footage,
        pace: motion?.pace ?? "balanced",
      },
    };
  },
  "scenes-save": async ({ identityDir, profile }) => {
    if (!identityDir) throw new Error("No Identity to save the Scenes profile in.");
    return { profile: saveScenesProfile(identityDir, profile) };
  },

  // Stock photos and videos from Pixabay and Unsplash (stock/, DECISIONS 111,
  // 117): search words from the script, a search, and the one the user picks
  // into the footage library. Pixabay previews are copied locally (cached a
  // day, as Pixabay asks); Unsplash previews stay on Unsplash's own address
  // (hotlinked, as its guidelines ask), with the photographer's credit.
  "stock-suggest": async ({ projectDir }) => {
    const project = loadProject(projectDir);
    const md = fs.existsSync(path.join(projectDir, "script.md")) ? fs.readFileSync(path.join(projectDir, "script.md"), "utf8") : "";
    return { queries: suggestQueries({ title: project.title ?? "", markdown: md }) };
  },
  "stock-search": async ({ q, kind = "image", service = "pixabay" }) => {
    if (service === "unsplash") {
      const r = await unsplash.search({ apiKey: key(), q, kind, cacheDir: path.join(dataDir(), "stock-cache") });
      return { cached: r.cached, hits: r.hits.map((h) => ({ id: h.id, kind: h.kind, width: h.width, height: h.height, seconds: null, tags: h.tags, author: h.author, authorUrl: h.authorUrl, pageUrl: h.pageUrl, preview: unsplash.isUnsplashImageUrl(h.preview) ? h.preview : null })) };
    }
    const r = await pixabay.search({ apiKey: key(), q, kind, cacheDir: path.join(dataDir(), "stock-cache") });
    const dir = path.join(dataDir(), "stock-previews");
    const hits = [];
    for (const h of r.hits) {
      let preview = null;
      try {
        preview = h.preview ? await pixabay.cachePreview({ url: h.preview, dir }) : null;
      } catch {
        preview = null;
      }
      hits.push({ id: h.id, kind: h.kind, width: h.width, height: h.height, seconds: h.seconds, tags: h.tags, author: h.author, preview });
    }
    return { hits, cached: r.cached };
  },
  "stock-add": async ({ identityDir, q, kind = "image", id, service = "pixabay" }) => {
    if (!identityDir) throw new Error("No Identity to add the footage to.");
    const mod = service === "unsplash" ? unsplash : pixabay;
    const hit = mod.cachedHit(path.join(dataDir(), "stock-cache"), kind, q, id);
    return addStock({ identityDir, hit, query: q, service, apiKey: key() });
  },

  // Block packs (packs/, DECISIONS 107), per Identity.
  "packs-list": async ({ identityDir }) => ({
    packs: listPacks(identityDir).map((p) => ({ id: p.id, name: p.name, author: p.author ?? "", version: p.version ?? "", description: p.description ?? "", look: p.look, on: p.on, followBrand: p.followBrand, off: p.off, blocks: p.blocks.map((b) => ({ id: b.id, label: b.label, role: b.role, what: b.what ?? "", needs: b.needs ?? [], realOnly: Boolean(b.realOnly) })) })),
  }),
  "pack-import": async ({ identityDir, file }) => {
    if (!identityDir) throw new Error("No Identity to import the pack into.");
    return importPack(identityDir, file);
  },
  "pack-export": async ({ identityDir, id, file }) => exportPack(identityDir, id, file),
  "pack-remove": async ({ identityDir, id }) => removePack(identityDir, id),
  "pack-state": async ({ identityDir, id, state }) => ({ state: writePackState(identityDir, id, state ?? {}) }),

  "dictionary-load": async ({ identityDir }) => ({ dictionary: loadDictionary(identityDir) }),

  "dictionary-save": async ({ identityDir, dictionary }) => {
    if (!identityDir) throw new Error("No Identity to save the dictionary in.");
    return { dictionary: saveDictionary(identityDir, dictionary) };
  },

  "dictionary-check": async ({ projectDir, identityDir }) => ({ findings: dictionaryFindings(projectDir, identityDir) }),

  "load-project": async ({ projectDir, liveProjects = null }) => {
    const project = recovered(projectDir, liveProjects);
    const md = path.join(projectDir, "script.md");
    return { project, brief: readBrief(projectDir), scriptMarkdown: fs.existsSync(md) ? fs.readFileSync(md, "utf8") : null, calls: scriptCalls(projectDir), latestVideo: latestVideo(projectDir), stills: stillsOf(projectDir), voiceInfo: readVoiceInfo(projectDir), thumbnailChosen: !!thumbnail.loadState(projectDir).chosen, researchState: loadBrief(projectDir)?.state ?? null };
  },

  // Gate 1. Writes script.json + script.md and leaves the gate pending (or
  // approved in autopilot).
  "write-script": writeScriptGate,

  // Gate 1, optional (DECISIONS 42, 64): keyword ideas from vidIQ for the
  // topic, with the user's vidIQ key. The chosen one goes into the script.
  "keyword-ideas": async ({ keyword, country }) => keywordIdeas({ apiKey: key(), keyword, country }),
  // The wizard's Keywords screen: every typed search, plus matching terms and questions (DECISIONS 183).
  "wizard-keywords": async ({ searches = [], topic = "", country = null, rising = false }) =>
    deepResearch({ apiKey: key(), searches, topic, country, rising, onProgress: (p) => emit({ event: "progress", ...p }) }),

  // Custom: the user edited the script by hand.
  "save-script": async ({ projectDir, markdown }) => {
    if (typeof markdown !== "string" || markdown.trim() === "") throw new Error("The script is empty.");
    writeAtomic(path.join(projectDir, "script.md"), markdown.endsWith("\n") ? markdown : markdown + "\n");
    const project = edited(projectDir, "script");
    saveProject(projectDir, project);
    appendLog(projectDir, "script: edited by hand");
    return { gate: project.gates.script, status: project.status };
  },

  // What the render chain has: engine, ffmpeg, browser. Downloads nothing.
  "tools-status": async () => toolsStatus(),

  // First launch: the pinned render browser into the app's own folder.
  "browser-ensure": async () => ensureBrowser({ onProgress: (p) => emit({ event: "progress", ...p }) }),

  // Gate 2: the voices of the user's account, for the picker (with previews).
  "list-voices": async ({ narrator }) => {
    const p = VOICE_PROVIDERS[narrator?.provider];
    if (!p?.listVoices) throw new Error(`No voice list for ${narrator?.provider}.`);
    return { voices: await p.listVoices({ apiKey: key() }) };
  },

  // A voice sample, cached in the app's folder so the UI can play it.
  "voice-preview": async ({ url }) => ({ file: await downloadPreview({ url, dir: path.join(dataDir(), "voice-previews") }) }),

  // A voice without a ready-made preview (Gemini): one short sentence, cached.
  "voice-sample": async ({ narrator, language }) => ({ file: await voiceSample({ narrator, apiKey: key(), language, dir: path.join(dataDir(), "voice-previews") }) }),

  // Gate 2: narration + music, approved as one artifact.
  "make-voice": async ({ projectDir, identityDir, narrator, music }) => {
    let project = setGate(loadProject(projectDir), "voice", { state: "running", mode: "recommended" });
    saveProject(projectDir, project);
    appendLog(projectDir, `voice: ${narrator?.provider}/${narrator?.voice ?? "?"}${music ? `, music ${music}` : ""}`);
    try {
      ensureRoom(projectDir, ROOM_FOR_VOICE, "the narration");
      const read = (who) =>
        timed("voice", sentenceCount(projectDir), emit, () =>
          makeVoice({
            projectDir,
            narrator: who,
            apiKey: key(),
            music: musicPath(projectDir, music),
            language: project.language,
            onProgress: (p) => emit({ event: "progress", ...p }),
          }),
        );
      let info;
      try {
        info = await read(narrator);
      } catch (e) {
        // a paid voice that fails or has no budget: the free voice reads it, and the
        // Preview says so. It reads English only (DECISIONS 133): another language stops here.
        if (narrator?.provider === "kokoro" || !String(project.language).toLowerCase().startsWith("en") || !serviceFailed(e)) throw e;
        appendLog(projectDir, `voice: ${narrator?.provider} failed, ${e.message}; the free voice reads it`);
        addNote(projectDir, "voice", `The free voice on this computer read the narration, because ${narrator?.provider === "gemini" ? "Gemini" : "ElevenLabs"} did not work: ${friendlyMessage(e)}`);
        emit({ event: "progress", step: "retry", message: "The paid voice did not work, so the free voice is reading it." });
        narrator = { provider: "kokoro", voice: DEFAULT_VOICE };
        info = await read(narrator);
      }
      // step 3, the sentence table: a measurement of this audio, no gate
      emit({ event: "progress", step: "sentences" });
      const table = sentenceTable(projectDir);
      info.sentences = table.sentences;
      // A new voice means new sentences: an older scene table no longer fits
      // (it caused "there is no sentence S12", 2026-10-01). It goes; gate 3
      // plans again.
      const oldTable = path.join(projectDir, "scenes.json");
      if (fs.existsSync(oldTable)) {
        fs.rmSync(oldTable, { force: true });
        appendLog(projectDir, "scenes: the old scene table was for the earlier voice, removed");
      }
      project = setGate(loadProject(projectDir), "voice", { state: project.autopilot ? "approved" : "pending", mode: "recommended" });
      saveProject(projectDir, project);
      appendLog(projectDir, `voice: done, ${info.seconds}s, ${info.finalLufs} LUFS, ${table.sentences} sentences${info.reused ? `, ${info.reused} parts kept from the run before` : ""}`);
      rememberUsed(identityDir, { voice: { provider: narrator?.provider, voice: narrator?.voice, name: narrator?.name ?? null, model: narrator?.model ?? null } });
      return { info, gate: project.gates.voice, status: project.status };
    } catch (e) {
      saveProject(projectDir, setGate(loadProject(projectDir), "voice", { state: "failed", error: String(e.message).slice(0, 2000) }));
      appendLog(projectDir, `voice: failed, ${e.message}`);
      throw e;
    }
  },

  // Gate 2, a different music under the same narration (no new reading). The
  // scene table stays valid (the timing is the voice's); only the build and
  // the approval of the voice start again.
  "set-music": async ({ projectDir, music }) => {
    appendLog(projectDir, `music: ${music?.kind}`);
    const info = await logged(projectDir, "music: mixing", () => timed("remix", 1, emit, () => setMusic({ projectDir, music, onProgress: (p) => emit({ event: "progress", ...p }) })));
    let project = setGate(loadProject(projectDir), "voice", { state: loadProject(projectDir).autopilot ? "approved" : "pending", mode: "custom" });
    if (project.gates.review && project.gates.review.state !== "todo") project = setGate(project, "review", { state: "todo" });
    saveProject(projectDir, project);
    appendLog(projectDir, `music: mixed, final ${info.finalLufs} LUFS${info.musicGainDb !== undefined && info.musicGainDb !== null ? `, music ${info.musicGainDb} dB` : ""}`);
    return { info, gate: project.gates.voice, status: project.status };
  },

  // Gate 2, music made for this video. The key is the ElevenLabs one.
  "music-estimate": async ({ seconds }) => ({ usd: costEstimateUsd(Number(seconds) || 0), prompt: MUSIC_PROMPT }),

  "make-music": async ({ projectDir, identityDir, music }) => {
    // made by code, or the channel's own file: free, and the same mix as ever
    if (music?.provider === "synth" || music?.provider === "own") {
      let choice = { kind: "synth", mood: music.mood };
      if (music.provider === "own") {
        const files = identityDir ? ownMusic(identityDir) : [];
        if (!files.length) throw new Error(`The channel's music folder has no files yet. Put your music in ${musicDir(identityDir)}, or choose the music made by code.`);
        // the next file each video, so a channel does not repeat one track
        const pick = files[fs.readdirSync(path.dirname(projectDir)).length % files.length];
        const rel = `audio/music${path.extname(pick).toLowerCase()}`;
        fs.copyFileSync(path.join(musicDir(identityDir), pick), path.join(projectDir, rel));
        choice = { kind: "file", path: rel };
      }
      appendLog(projectDir, `music: ${choice.kind === "synth" ? "made by code" : "the channel's own file"}`);
      const info = await logged(projectDir, "music", () => timed("remix", 1, emit, () => setMusic({ projectDir, music: choice, onProgress: (p) => emit({ event: "progress", ...p }) })));
      const project = setGate(loadProject(projectDir), "voice", { state: "pending", mode: "recommended" });
      saveProject(projectDir, project);
      return { info, gate: project.gates.voice, status: project.status };
    }
    appendLog(projectDir, "music: ElevenLabs Music");
    let info;
    try {
      info = await timed("music-length", Math.max(30, videoSeconds(projectDir)), emit, () => makeMusic({ projectDir, apiKey: key(), prompt: music?.prompt, onProgress: (p) => emit({ event: "progress", ...p }) }));
    } catch (e) {
      if (!serviceFailed(e)) throw e;
      // music made by code stands in, free, and the Preview says so
      appendLog(projectDir, `music: ElevenLabs Music failed, ${e.message}; music made by code instead`);
      addNote(projectDir, "music", `The music was made on this computer, because ElevenLabs Music did not work: ${friendlyMessage(e)}`);
      info = await logged(projectDir, "music", () => timed("remix", 1, emit, () => setMusic({ projectDir, music: { kind: "synth", mood: music?.mood }, onProgress: (p) => emit({ event: "progress", ...p }) })));
    }
    const project = setGate(loadProject(projectDir), "voice", { state: loadProject(projectDir).autopilot ? "approved" : "pending", mode: "recommended" });
    saveProject(projectDir, project);
    appendLog(projectDir, `music: done, final ${info.finalLufs} LUFS, music ${info.musicGainDb} dB`);
    return { info, gate: project.gates.voice, status: project.status };
  },

  // Gate 3: the scene table. The AI plans it from the sentence table and the
  // library; the user swaps rows (refill-scene) or edits text (save-scenes).
  // What planning costs, before it runs (DECISIONS 130): both steps, from
  // the catalog and the sentence table. And one scene's swap.
  "scenes-estimate": async ({ projectDir, llm, look }) => {
    const e = estimateScenes({ projectDir, llm, off: offOf(look) });
    return { estimate: e, text: usdText(e) };
  },
  "refill-estimate": async ({ llm, component, scenes = 1 }) => {
    const e = component ? estimateFill({ llm, component, scenes }) : estimateUsd({ provider: llm.provider, model: llm.model, effort: llm.effort, tokensIn: 60000, tokensOut: 600 });
    return { estimate: e, text: usdText(e) };
  },

  "make-scenes": async ({ projectDir, identityDir, llm, look }) => {
    const name = typeof look === "object" ? look?.name ?? null : null;
    let project = setGate(loadProject(projectDir), "scenes", { state: "running", mode: "recommended" });
    saveProject(projectDir, project);
    appendLog(projectDir, `scenes: planning with ${llm.provider}/${llm.model || "default model"}`);
    try {
      const r = await timed("scenes", jsonCount(projectDir, "sentences.json"), emit, () =>
        makeScenes({
          llm: { provider: llm.provider, model: llm.model, effort: llm.effort ?? null, apiKey: key() },
          projectDir,
          language: project.language,
          name,
          themeIsLight: isLightLook(look),
          off: offOf(look),
          pace: paceOfLook(look),
          mix: typeof look === "object" ? look?.scenes?.mix ?? null : null,
          footage: typeof look === "object" ? look?.footage ?? null : null,
          identityDir: identityDir ?? null,
          videoId: path.basename(projectDir),
          onProgress: (p) => emit({ event: "progress", ...p }),
        }),
      );
      brollBack(projectDir);
      project = setGate(loadProject(projectDir), "scenes", { state: project.autopilot ? "approved" : "pending", mode: "recommended" });
      saveProject(projectDir, project);
      appendLog(projectDir, `scenes: done, ${r.scenes} scenes in two steps (catalog, then ${r.parts} part${r.parts === 1 ? "" : "s"} with the candidates' code)${r.gaps.length ? `, gaps: ${r.gaps.map((g) => `${g.at} ${g.need}`).join("; ")}` : ""}`);
      return { ...r, ...(await sceneRows(projectDir, { off: offOf(look) })), gate: project.gates.scenes, status: project.status };
    } catch (e) {
      saveProject(projectDir, setGate(loadProject(projectDir), "scenes", { state: "failed", error: String(e.message).slice(0, 2000) }));
      appendLog(projectDir, `scenes: failed, ${e.message}`);
      throw e;
    }
  },

  // Default mode of gate 3: the plan without AI (gates/scenes/simple.mjs),
  // for when the AI is out of tokens or overloaded (Zoltan, 2026-10-05).
  "simple-scenes": async ({ projectDir, look }) => {
    let project = setGate(loadProject(projectDir), "scenes", { state: "running", mode: "default" });
    saveProject(projectDir, project);
    appendLog(projectDir, "scenes: simple plan without AI");
    try {
      const r = await simpleScenes({ projectDir, title: project.title, themeIsLight: isLightLook(look), off: offOf(look), pace: paceOfLook(look) });
      brollBack(projectDir);
      project = setGate(loadProject(projectDir), "scenes", { state: "pending", mode: "default" });
      saveProject(projectDir, project);
      appendLog(projectDir, `scenes: simple plan done, ${r.scenes} scenes`);
      return { ...r, ...(await sceneRows(projectDir, { off: offOf(look) })), gate: project.gates.scenes, status: project.status };
    } catch (e) {
      saveProject(projectDir, setGate(loadProject(projectDir), "scenes", { state: "failed", error: String(e.message).slice(0, 2000) }));
      appendLog(projectDir, `scenes: simple plan failed, ${e.message}`);
      throw e;
    }
  },

  "scene-table": async ({ projectDir, look }) => sceneRows(projectDir, { off: offOf(look) }),

  "save-scenes": async ({ projectDir, scenes, look }) => {
    const r = await saveScenes({ projectDir, scenes, pace: paceOfLook(look) });
    const project = edited(projectDir, "scenes");
    saveProject(projectDir, project);
    appendLog(projectDir, "scenes: edited by hand");
    return { ...r, ...(await sceneRows(projectDir, { off: offOf(look) })), gate: project.gates.scenes, status: project.status };
  },

  // `request`: the user's own words for this scene (the Preview's "Ask for a
  // change"); then the AI may pick any scene type, `component` is optional.
  "refill-scene": async ({ projectDir, llm, index, component, request, look }) => {
    const project = loadProject(projectDir);
    appendLog(projectDir, `scenes: ${request ? "change asked for" : "swapping"} scene ${index + 1}${component ? ` to ${component}` : ""} with ${llm.provider}/${llm.model || "default model"}`);
    try {
      await timed("refill", 1, emit, () => refillScene({ llm: { provider: llm.provider, model: llm.model, effort: llm.effort ?? null, apiKey: key() }, projectDir, index, component, request, language: project.language, name: typeof look === "object" ? look?.name ?? null : null, themeIsLight: isLightLook(look), off: offOf(look) }));
    } catch (e) {
      // The table stays as it was; only the log learns about the failed swap.
      appendLog(projectDir, `scenes: swap of scene ${index + 1} failed, ${e.message}`);
      throw e;
    }
    const next = edited(projectDir, "scenes");
    saveProject(projectDir, next);
    appendLog(projectDir, `scenes: scene ${index + 1} ${request ? "changed" : `swapped to ${component}`}`);
    return { ...(await sceneRows(projectDir, { off: offOf(look) })), gate: next.gates.scenes, status: next.status };
  },

  // Gate 5, optional: an avatar says the opening and the closing (DECISIONS
  // 61). The HeyGen key comes by "service". Previews are cached locally.
  "avatar-looks": async ({ previews = true } = {}) => {
    const { own, stock } = await heygen.listAvatars({ apiKey: key() });
    if (!previews) return { own, stock }; // Settings: names only, fast
    const dir = path.join(dataDir(), "avatar-previews");
    // Previews cached locally (the UI loads no remote address), 8 at a time,
    // with progress; a missing one never hides the avatar. Cached ones are
    // instant the next time.
    const items = [...own, ...own.flatMap((g) => g.looks), ...stock].filter((x) => x.image);
    let done = 0;
    emit({ event: "progress", step: "previews", done, of: items.length });
    const queue = [...items];
    const worker = async () => {
      for (let x = queue.shift(); x; x = queue.shift()) {
        try {
          x.image = await heygen.cachePreview({ url: x.image, dir });
        } catch {
          x.image = null;
        }
        emit({ event: "progress", step: "previews", done: ++done, of: items.length });
      }
    };
    await Promise.all(Array.from({ length: 8 }, worker));
    return { own, stock };
  },

  "avatar-preview": async ({ url }) => ({ file: await heygen.cachePreview({ url, dir: path.join(dataDir(), "avatar-previews") }) }),

  "avatar-plan": async ({ projectDir, engine }) => {
    const plan = await avatarPlan(projectDir);
    let account = null;
    try {
      account = await heygen.balance({ apiKey: key() });
    } catch (e) {
      account = { error: String(e.message) };
    }
    const seconds = plan.segments.reduce((n, s) => n + s.duration, 0);
    return {
      ...plan,
      estimate: heygen.estimateUsd(seconds, engine),
      estimates: Object.fromEntries(heygen.ENGINES.map((e) => [e, { ...heygen.estimateUsd(seconds, e), guess: !!heygen.USD_PER_SECOND_BY_ENGINE[e].guess }])),
      account,
    };
  },

  "make-avatar": async ({ projectDir, identityDir, lookId, lookName, which, look, layout, engine, lookEngines }) => {
    let project = setGate(loadProject(projectDir), "avatar", { state: "running", mode: "custom" });
    saveProject(projectDir, project);
    appendLog(projectDir, `avatar: ${lookId}, ${(which ?? []).join("+")}, engine ${heygen.chooseEngine(engine, lookEngines).engine}`);
    try {
      const plan = await avatarPlan(projectDir);
      const seconds = plan.segments.filter((s) => (which ?? []).includes(s.name)).reduce((n, s) => n + s.duration, 0);
      const r = await timed("avatar", seconds, emit, () => makeAvatar({ projectDir, apiKey: key(), lookId, which, look, layout, engine, lookEngines, onProgress: (p) => emit({ event: "progress", ...p }) }));
      project = loadProject(projectDir);
      if (project.gates.review && project.gates.review.state !== "todo") project = setGate(project, "review", { state: "todo" });
      project = setGate(project, "avatar", { state: "pending", mode: "custom" });
      saveProject(projectDir, project);
      appendLog(projectDir, `avatar: done, ${r.segments.map((s) => `${s.name} ${s.duration}s`).join(", ")}`);
      rememberUsed(identityDir, { avatar: { lookId, name: lookName ?? null, layout: r.layout, engine: r.engine } });
      return { avatar: r, gate: project.gates.avatar, status: project.status };
    } catch (e) {
      saveProject(projectDir, setGate(loadProject(projectDir), "avatar", { state: "failed", error: String(e.message).slice(0, 2000) }));
      appendLog(projectDir, `avatar: failed, ${e.message}`);
      throw e;
    }
  },

  // A new place, size or style for the clips already made (no HeyGen cost).
  "avatar-layout": async ({ projectDir, layout }) => {
    const avatar = setLayout(projectDir, layout);
    let project = loadProject(projectDir);
    if (project.gates.review && project.gates.review.state !== "todo") project = setGate(project, "review", { state: "todo" });
    saveProject(projectDir, project);
    appendLog(projectDir, `avatar: layout ${avatar.layout.style}, ${avatar.layout.position}, ${avatar.layout.size}`);
    return { avatar };
  },

  "remove-avatar": async ({ projectDir }) => {
    removeAvatar(projectDir);
    let project = setGate(loadProject(projectDir), "avatar", { state: "skipped" });
    if (project.gates.review && project.gates.review.state !== "todo") project = setGate(project, "review", { state: "todo" });
    saveProject(projectDir, project);
    appendLog(projectDir, "avatar: removed");
    return { gate: project.gates.avatar, status: project.status };
  },

  // Lint and check the project's build/ (0 errors is the condition). The
  // assembler that writes build/ from the scene table comes with the registry
  // pilot (DECISIONS 48).
  "check-video": async ({ projectDir }) => {
    appendLog(projectDir, "check: start");
    try {
      const r = await lintAndCheck(projectDir, { onProgress: (p) => emit({ event: "progress", ...p }) });
      appendLog(projectDir, "check: lint and check passed");
      return r;
    } catch (e) {
      appendLog(projectDir, `check: failed, ${e.message}`);
      throw e;
    }
  },

  // Gate 4: build the video from the approved scene table, lint + check, and
  // the contact sheet (review/contact.png) to approve before the render.
  // The visual check's price, before it runs (DECISIONS 130).
  "visual-estimate": async ({ projectDir, llm }) => {
    const e = estimateVisual({ projectDir, llm });
    return { estimate: e, text: usdText(e) };
  },
  "visual-report": async ({ projectDir }) => ({ report: visualReport(projectDir) }),

  // The visual check (gates/review/visual.mjs), right after build-video when
  // the user said yes to it and its price: the AI looks at every scene and
  // swaps the ones that do not fit or do not read well, rebuilds, checks
  // those again, and the contact sheet is made again.
  "visual-check": async ({ projectDir, llm, look }) => {
    const project = loadProject(projectDir);
    if (!fs.existsSync(path.join(projectDir, "build", "index.html"))) throw new Error("Build the preview first.");
    const onProgress = (p) => emit({ event: "progress", ...p });
    const ai = { provider: llm.provider, model: llm.model, effort: llm.effort ?? null, apiKey: key() };
    appendLog(projectDir, `review: visual check with ${ai.provider}/${ai.model || "default model"}`);
    const report = await visualCheck({
      projectDir,
      llm: ai,
      language: project.language,
      name: typeof look === "object" ? look?.name ?? null : null,
      themeIsLight: isLightLook(look),
      rebuild: async () => {
        await assemble(projectDir, { language: project.language, title: project.title, look });
        await lintAndCheck(projectDir, { onProgress });
      },
      onProgress,
    });
    const sheet = report.swaps.length ? await contactSheet(projectDir, { onProgress }) : { stills: stillsOf(projectDir) };
    appendLog(projectDir, `review: visual check, ${report.passed} of ${report.checked} scenes fit and read well (${report.passedFirst} at first look), ${report.swaps.length} swapped${report.stillFailing.length ? `, still weak: ${report.stillFailing.map((x) => `scene ${x.scene} (${x.problem})`).join("; ")}` : ""}`);
    return { report, ...sheet };
  },

  "build-video": async ({ projectDir, identityDir, look }) => {
    let project = loadProject(projectDir);
    if (identityDir && typeof look === "object") look = { ...look, iconsRecent: recentIcons(identityDir, path.basename(projectDir)) };
    if (project.gates.scenes?.state !== "approved") throw new Error("Approve the scene table first.");
    ensureRoom(projectDir, ROOM_FOR_BUILD, "the preview");
    project = setGate(project, "review", { state: "running", mode: "recommended" });
    saveProject(projectDir, project);
    appendLog(projectDir, "review: build, check, contact sheet");
    try {
      // a channel video: every outside picture has a clear license, and is logged
      if (project.recipe && identityDir) logTableFootage({ projectDir, table: JSON.parse(fs.readFileSync(path.join(projectDir, "scenes.json"), "utf8")), clips: loadLibrary(identityDir).clips ?? [] });
      // what a preset bundles from outside is in every video made with it
      if (project.recipe?.preset) for (const asset of loadPreset(project.recipe.preset).assets ?? []) logAsset(projectDir, asset);
      const make = project.recipe?.engine === "recorded" ? recorded.buildRecorded : buildAndReview;
      const r = await timed("build", jsonCount(projectDir, "scenes.json", "scenes"), emit, () => make(projectDir, { language: project.language, title: project.title, look, onProgress: (p) => emit({ event: "progress", ...p }) }));
      project = setGate(loadProject(projectDir), "review", { state: project.autopilot ? "approved" : "pending", mode: "recommended" });
      saveProject(projectDir, project);
      appendLog(projectDir, `review: done, ${r.scenes} scenes, ${r.seconds}s`);
      // the map as it stands now, kept with the video
      if (project.recipe && project.recipe.engine !== "recorded") await writeShotMap({ projectDir }).catch((e) => appendLog(projectDir, `shot map: not saved, ${e.message}`));
      if (r.icons?.length) {
        appendLog(projectDir, `review: icons ${r.icons.join(" ")}`);
        rememberIcons(identityDir, path.basename(projectDir), r.icons);
      }
      if (r.transitions?.some((t) => t !== "cut")) appendLog(projectDir, `review: Motion profile, scene changes ${r.transitions.join(" ")}`);
      for (const n of r.notes ?? []) appendLog(projectDir, `review: ${n}`);
      return { ...r, gate: project.gates.review, status: project.status };
    } catch (e) {
      saveProject(projectDir, setGate(loadProject(projectDir), "review", { state: "failed", error: String(e.message).slice(0, 2000) }));
      appendLog(projectDir, `review: failed, ${e.message}`);
      throw e;
    }
  },

  // The render, once, locally, after the contact sheet is approved. Its
  // state goes into project.json (running, done, failed), so a render that
  // failed or was cut off is still seen after a restart.
  "render-video": async ({ projectDir, identityDir, quality }) => {
    if (loadProject(projectDir).gates.review?.state !== "approved") throw new Error("Approve the preview first.");
    const q = quality === "draft" || quality === "high" ? quality : "standard";
    ensureRenderRoom(projectDir, videoSeconds(projectDir));
    const mark = (render) => saveProject(projectDir, { ...loadProject(projectDir), render: { ...render, at: new Date().toISOString() } });
    mark({ state: "running", pid: process.pid, quality: q });
    appendLog(projectDir, `render: start (${q})`);
    let r;
    try {
      r = await timed("render", videoSeconds(projectDir), emit, () => renderVideo(projectDir, { quality: q, onProgress: (p) => emit({ event: "progress", ...p }) }));
    } catch (e) {
      mark({ state: "failed", quality: q, error: String(e.message).slice(0, 2000) });
      appendLog(projectDir, `render: failed, ${e.message}`);
      throw e;
    }
    mark({ state: "done", quality: q, file: r.file });
    appendLog(projectDir, `render: done, ${r.file}, ${r.seconds}s video in ${r.renderSeconds}s`);
    // Captions and chapters next to the video. A problem here never loses the
    // render: the video is there, the note says what is missing.
    try {
      const extras = writeExtras(projectDir, r.file, { language: loadProject(projectDir).language, total: r.seconds, project: loadProject(projectDir), syntheticMedia: usesGenerated(projectDir, identityDir) });
      appendLog(projectDir, `render: captions and chapters written${extras.chaptersNote ? `, ${extras.chaptersNote}` : ""}`);
      return { ...r, ...extras };
    } catch (e) {
      appendLog(projectDir, `render: captions and chapters failed, ${e.message}`);
      return { ...r, extrasError: String(e.message) };
    }
  },

  // "Finish on Autopilot" under way (on) or over (off): the UI goes on with
  // it when the ONE Video is opened again after an interruption.
  "autopilot-mark": async ({ projectDir, on }) => {
    const next = { ...loadProject(projectDir) };
    if (on) next.autopilotRun = { at: new Date().toISOString() };
    else delete next.autopilotRun;
    saveProject(projectDir, next);
    appendLog(projectDir, on ? "autopilot: on" : "autopilot: off");
    return { autopilotRun: !!on };
  },

  // The optional avatar step, left out on purpose ("Continue without an
  // avatar"). Only the avatar can be skipped: every other gate makes
  // something a later one needs.
  "skip-gate": async ({ projectDir, gate }) => {
    if (gate !== "avatar") throw new Error(`The ${gate} step cannot be skipped.`);
    let project = setGate(loadProject(projectDir), gate, { state: "skipped" });
    // the preview comes after the avatar: one built with the avatar is stale
    if (project.gates.review && project.gates.review.state !== "todo") project = setGate(project, "review", { state: "todo" });
    saveProject(projectDir, project);
    appendLog(projectDir, `${gate}: skipped`);
    return { gate: project.gates[gate], status: project.status };
  },

  // The packaging (DECISIONS 86): made at gate 1 with the script, again on
  // request; the user's choice of title, summary and tags.
  "packaging-state": async ({ projectDir }) => ({ packaging: loadPackaging(projectDir) }),
  "packaging-make": async ({ projectDir, llm }) => {
    if (!fs.existsSync(path.join(projectDir, "script.md"))) throw new Error("Write the script first.");
    appendLog(projectDir, `packaging: with ${llm.provider}/${llm.model || "default model"}`);
    const packaging = await makePackaging({ llm: { provider: llm.provider, model: llm.model, effort: llm.effort ?? null, apiKey: key(), onProgress: (p) => emit({ event: "progress", ...p }) }, projectDir, language: loadProject(projectDir).language });
    return { packaging };
  },
  "packaging-save": async ({ projectDir, title, summary, tags }) => {
    const packaging = savePackaging(projectDir, { title, summary, tags });
    saveProject(projectDir, { ...loadProject(projectDir), title: packaging.title });
    appendLog(projectDir, `packaging: chosen, "${packaging.title}"`);
    return { packaging };
  },

  // The Thumbnail step after Your video (thumbnail/, DECISIONS 131): the
  // price first, then 3 variants with the Gemini key; words edited for free;
  // the one picked goes into the publishing card.
  "thumbnail-photos": async ({ identityDir }) => ({ photos: thumbnail.photosOf(identityDir).map((p) => ({ name: p.name, file: p.file })), max: thumbnail.MAX_PHOTOS }),
  "thumbnail-state": async ({ projectDir, identityDir }) => thumbnail.stateView({ projectDir, identityDir }),
  "thumbnail-estimate": async ({ projectDir, identityDir, withFace = false, model, slots = null }) => ({ estimate: thumbnail.estimate({ projectDir, identityDir, withFace, model, slots }) }),
  "thumbnail-make": async ({ projectDir, identityDir, withFace = false, model, slots = null }) =>
    logged(projectDir, "thumbnail", () => thumbnail.make({ projectDir, identityDir, apiKey: key(), withFace, model, slots, onProgress: (p) => emit({ event: "progress", ...p }) })),
  "thumbnail-words": async ({ projectDir, identityDir, slot, words, accent = null }) => logged(projectDir, "thumbnail words", () => thumbnail.setWords({ projectDir, identityDir, slot, words, accent })),
  "thumbnail-pick": async ({ projectDir, identityDir, slot }) => thumbnail.pick({ projectDir, identityDir, slot }),

  // ---- Channels: the locked recipe and the one screen (channels/, DECISIONS 132) ----
  // Everything the start screen shows for the active channel. The recipe is a
  // suggestion until it is saved once (`saved`).
  "channel-state": async ({ identityDir, identity = {}, projectsDir }) => {
    const stored = identityDir ? loadRecipe(identityDir) : null;
    return {
      // a recipe locked before the start screen's defaults gets them here
      recipe: stored ? { ...stored, start: cleanStart(stored.start) } : defaultRecipe(identity),
      saved: !!stored,
      presets: listPresets().map(presetCard),
      voiceKinds: VOICE_KINDS,
      musicSources: MUSIC_SOURCES,
      moods: Object.keys(MOODS),
      ownMusic: identityDir ? ownMusic(identityDir) : [],
      musicDir: identityDir ? musicDir(identityDir) : null,
      freeVoices: await VOICE_PROVIDERS.kokoro.listVoices(),
      queue: listQueue(projectsDir),
      week: WEEK,
    };
  },
  "recipe-save": async ({ identityDir, recipe, language }) => ({ recipe: saveRecipe(identityDir, recipe, { language }) }),

  // The style sheet PNG of a preset, rendered from its tokens.
  "preset-stylesheet": async ({ identityDir, preset }) => {
    const p = loadPreset(preset);
    const dir = path.join(identityDir ?? dataDir(), "stylesheets", p.id);
    return { file: await renderStylesheet({ preset: p, identityDir, dir }), tokens: tokensFor(p, identityDir) };
  },

  // A new video of a channel: its recipe copied into it, its idea or its own
  // script in. With a script the Script step is done; with an idea it comes
  // next. The UI's run (ProjectView) does the rest.
  // The Night shift (channels/night.mjs, DECISIONS 182)
  "night-candidates": async ({ projectsDir }) => nightCandidates(projectsDir),
  "night-load": async ({ projectsDir }) => ({ shift: loadShift(projectsDir) }),
  "night-save": async ({ projectsDir, shift }) => ({ shift: saveShift(projectsDir, shift) }),
  "night-clear": async ({ projectsDir }) => clearShift(projectsDir),
  "night-prepare": async ({ projectDir, identityDir }) => prepareForNight(projectDir, identityDir),
  "channel-video-new": async ({ projectsDir, identityDir, identity, language = "en", topic = "", text = "", textKind = "notes", research = false, title = "" }) => {
    const recipe = recipeFor(loadRecipe(identityDir) ?? defaultRecipe({}), "script", { language });
    // a style whose scripts are fact-checked has research on, whatever was asked (DECISIONS 159)
    const { id, dir } = newScriptVideo({ projectsDir, identity, language, recipe, topic, text, textKind, research: research || loadPreset(recipe.preset).factChecked === true, title });
    return { id, dir };
  },

  // The research brief (research/index.mjs): shown and editable before the script.
  "research-make": async ({ projectDir, llm, channel = {} }) => logged(projectDir, "research", async () => {
    const project = loadProject(projectDir);
    const mdFile = path.join(projectDir, "script.md");
    const text = notesOf(projectDir) ?? (project.start?.kind === "finished" && fs.existsSync(mdFile) ? fs.readFileSync(mdFile, "utf8") : "");
    appendLog(projectDir, `research: with ${llm.provider}/${llm.model || "default model"}`);
    let made;
    try {
      made = await timed("research", 1, emit, () => makeBrief({ llm: { provider: llm.provider, model: llm.model, effort: llm.effort ?? null, apiKey: key() }, topic: project.start?.topic ?? project.title, text, language: project.language, channel }));
    } catch (e) {
      if (!(e instanceof LlmError)) throw e;
      appendLog(projectDir, `research: no AI answered, ${e.message}`);
      addNote(projectDir, "research", "Nothing in this video was researched or fact-checked, because no AI could answer.");
      made = offlineBrief({ topic: project.start?.topic ?? project.title, language: project.language, reason: friendlyMessage(e) });
    }
    const brief = saveBrief(projectDir, made);
    appendLog(projectDir, `research: ${brief.grounded ? "searched the web" : "no web search"}, ${brief.sources.length} sources`);
    return { brief };
  }),
  // No AI key at all: the same empty brief, without asking anyone.
  "research-offline": async ({ projectDir }) => {
    const project = loadProject(projectDir);
    addNote(projectDir, "research", "Nothing in this video was researched or fact-checked, because no AI key is set.");
    return { brief: saveBrief(projectDir, offlineBrief({ topic: project.start?.topic ?? project.title, language: project.language, reason: "no AI key is set" })) };
  },
  // Offline mode: no AI could write the script, so the Script tab opens with a draft.
  "script-offline": async ({ projectDir, reason = "" }) => {
    const r = offlineDraft(projectDir);
    addNote(projectDir, "script", "You wrote this script by hand, because no AI could answer.");
    if (reason) appendLog(projectDir, `script: offline because ${reason}`);
    return r;
  },
  // A note on the video from the run itself (a skipped avatar, a skipped source).
  "project-note": async ({ projectDir, kind, text }) => {
    addNote(projectDir, String(kind), friendlyMessage(text));
    return {};
  },
  // Copy details and the Health check screen.
  "error-details": async () => lastError(),
  "health-check": async ({ projectsDir, keys = null, internet = true }) => healthCheck({ projectsDir, keys, internet }),
  // The search keyword chosen on the Research tab: the script uses it.
  "video-keyword": async ({ projectDir, keyword = null }) => {
    const text = String(keyword ?? "").trim().slice(0, 200);
    const project = loadProject(projectDir);
    if (text) project.keyword = text;
    else delete project.keyword;
    saveProject(projectDir, project);
    return { keyword: text || null };
  },
  "research-state": async ({ projectDir }) => ({ brief: loadBrief(projectDir) }),
  "research-save": async ({ projectDir, brief }) => {
    const before = loadBrief(projectDir);
    if (!before) throw new Error("There is no research brief yet.");
    return { brief: saveBrief(projectDir, cleanEdit(before, brief)) };
  },
  "research-approve": async ({ projectDir }) => {
    appendLog(projectDir, "research: brief approved");
    return { brief: approveBrief(projectDir) };
  },

  // The Shot map (shots/index.mjs): no AI, no key.
  "shot-map-make": async ({ projectDir, identityDir, look }) => logged(projectDir, "shot map", async () => {
    const project = loadProject(projectDir);
    const view = await makeShotMap({ projectDir, identityDir: identityDir ?? null, preset: loadPreset(project.recipe?.preset ?? "motion-frames"), off: offOf(look), title: project.title });
    appendLog(projectDir, `shot map: ${view.summary?.shots ?? 0} shots${view.warning ? `; ${view.warning}` : ""}`);
    return view;
  }),
  "shot-map-state": async ({ projectDir }) => shotMapView({ projectDir }),
  "shot-flow-set": async ({ projectDir, identityDir, id, on, prompt }) => {
    const view = await setFlow({ projectDir, identityDir, id, on, prompt });
    previewStale(projectDir);
    return view;
  },
  "shot-flow-clip": async ({ projectDir, identityDir, id, file }) => logged(projectDir, "google flow clip", async () => {
    const view = await addFlowClip({ projectDir, identityDir, id, file });
    previewStale(projectDir);
    appendLog(projectDir, "shot map: a Google Flow clip laid under its shot");
    return view;
  }),

  // The scene table from the preset's templates (gates/scenes/templates.mjs).
  // `simple-` is the same without the AI: planned by rule.
  "make-template-scenes": async ({ projectDir, identityDir, llm, look }) => templateScenes({ projectDir, identityDir, look, llm: { provider: llm.provider, model: llm.model, effort: llm.effort ?? null, apiKey: key() } }),
  "simple-template-scenes": async ({ projectDir, identityDir, look }) => templateScenes({ projectDir, identityDir, look, llm: null }),

  // Week batch: 7 ideas, 7 scripts, in one run, queued (channels/batch.mjs).
  // Every mode (phase 3): pasted texts give one video each. With research on, each
  // stops at its brief: the brief comes before the script, also in a batch.
  "week-batch": (req) => weekBatch(req),
  "week-batch-local": (req) => weekBatch({ ...req, llm: null }),
  "queue-list": async ({ projectsDir }) => ({ queue: listQueue(projectsDir) }),

  // ---- The Recorded engine (recorded/, docs/BUILD_PLAN.md phase 2) ----
  "recorded-video-new": async ({ projectsDir, identityDir, identity, language = "en", files, title = "", kind = null, mark = null, broll = null }) => {
    const recipe = recipeFor(loadRecipe(identityDir) ?? defaultRecipe({}), "recorded", { language });
    return recorded.newRecordedVideo({ projectsDir, identity, language, recipe, files, title, kind, mark, broll });
  },
  // RecCut's face bubble (recorded/bubble.mjs, DECISIONS 184)
  "recorded-kinds": async () => ({ kinds: bubble.KINDS, defaultBox: bubble.DEFAULT_BOX }),
  "recorded-still": async ({ file }) => bubble.stillOf({ file, out: path.join(dataDir(), "stills", `still-${Date.now()}.png`) }),
  "recorded-bubble-box": async ({ projectDir, box, skip }) => bubble.setBubbleBox({ projectDir, box, skip }),
  "recorded-voice-export": async ({ projectDir, out }) => bubble.exportVoice({ projectDir, out }),
  "recorded-bubble-clip": async ({ projectDir, file, source, tool }) => bubble.importBubbleClip({ projectDir, file, source, tool, probe: recorded.probeMedia }),
  "recorded-bubble-cost": async ({ projectDir }) => {
    const p = JSON.parse(fs.readFileSync(path.join(projectDir, "recorded", "pictures.json"), "utf8"));
    return bubble.avatarCost(p.kept ?? 0);
  },
  "recorded-avatar-bubble": async ({ projectDir, lookId, approved }) => logged(projectDir, "avatar bubble", () => bubble.makeAvatarBubble({ projectDir, apiKey: key(), lookId, approved, onProgress: (p) => emit({ event: "progress", ...p }) })),
  "recorded-state": async ({ projectDir }) => recorded.recordedState(projectDir),
  "recorded-transcribe": async ({ projectDir }) => logged(projectDir, "recorded transcribe", () => recorded.recordTranscript({ projectDir, onProgress: (p) => emit({ event: "progress", ...p }) })),
  "recorded-cut-set": async ({ projectDir, id, on, keepPauses }) => recorded.setCut({ projectDir, id, on, keepPauses }),
  "recorded-apply-cuts": async ({ projectDir }) => logged(projectDir, "recorded cuts", () => recorded.applyCuts({ projectDir, onProgress: (p) => emit({ event: "progress", ...p }) })),
  "recorded-plan": async ({ projectDir, llm }) => logged(projectDir, "recorded plan", () => recorded.planVideo({ projectDir, llm: { provider: llm.provider, model: llm.model, effort: llm.effort ?? null, apiKey: key() }, onProgress: (p) => emit({ event: "progress", ...p }) })),
  "recorded-plan-rule": async ({ projectDir }) => logged(projectDir, "recorded plan", () => recorded.planVideo({ projectDir, llm: null, onProgress: (p) => emit({ event: "progress", ...p }) })),
  "recorded-plan-save": async ({ projectDir, chapters, bigWords }) => ({ plan: recorded.savePlan({ projectDir, chapters, bigWords }) }),
  "recorded-prepare": async ({ projectDir }) => logged(projectDir, "recorded pictures", () => recorded.preparePictures({ projectDir, onProgress: (p) => emit({ event: "progress", ...p }) })),

  // The free voice's model: on this computer yet, and fetching it (once).
  "voice-model-status": async () => ({ ready: Object.keys(MODEL_FILES).every((f) => fs.existsSync(path.join(modelDir(), f))), bytes: MODEL_BYTES }),
  "voice-model-ensure": async ({ voice = DEFAULT_VOICE }) => ({ dir: await ensureModel({ voice, onProgress: (p) => emit({ event: "progress", ...p }) }) }),

  // The free images: CC0 and public domain only (assets/, DECISIONS 135).
  "assets-search": async ({ q }) => {
    const r = await searchAll({ q });
    const dir = path.join(dataDir(), "stock-previews");
    const hits = await Promise.all(r.hits.map(async (h) => {
      let local = null;
      try {
        local = h.preview ? await cacheFreePreview({ url: h.preview, dir }) : null;
      } catch {
        local = null;
      }
      return { ...h, local };
    }));
    return { hits: hits.filter((h) => h.local), failed: r.failed };
  },
  "assets-add": async ({ identityDir, hit, about = "" }) => {
    if (!identityDir) throw new Error("No Identity to add the image to.");
    return addFreeImage({ identityDir, hit, about });
  },
  "assets-ledger": async ({ projectDir }) => readLedger(projectDir),

  "approve-gate": async ({ projectDir, gate }) => {
    const current = loadProject(projectDir);
    if (gate === "script") {
      const md = path.join(projectDir, "script.md");
      if (fs.existsSync(md) && fs.readFileSync(md, "utf8").includes(WRITE_HERE)) throw new Error(`The script still has ${WRITE_HERE} in it. Write those parts on the Script tab, save, and go on.`);
    }
    // A scene table is approved only if it fits the current voice.
    if (gate === "scenes") {
      const { rows } = await sceneRows(projectDir);
      if (!rows.length) throw new Error("There is no scene table yet. Click Plan scenes.");
      if (rows.some((r) => r.start === null)) throw new Error("This scene table was made for an earlier voice. Click Plan again.");
    }
    const mode = current.gates[gate]?.mode;
    const project = setGate(current, gate, { state: "approved", mode });
    saveProject(projectDir, project);
    appendLog(projectDir, `${gate}: approved`);
    return { gate: project.gates[gate], status: project.status };
  },
};

// The commands that theme something or plan scenes: they get the Identity's
// card as `look`, with its Motion profile (`look.motion`).
const LOOK_COMMANDS = new Set(["shot-map-make", "make-template-scenes", "simple-template-scenes", "make-scenes", "scenes-estimate", "visual-check", "simple-scenes", "refill-scene", "make-avatar", "build-video", "scene-table", "save-scenes"]);

async function readStdin() {
  if (process.stdin.isTTY) return "";
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

// Anything thrown outside the command's own await: a sentence for the user,
// the details on stderr (the core puts them in the app's log).
function lastResort(e) {
  process.stderr.write(`${secrets.reduce((s, k) => (k ? s.split(k).join("[key]") : s), String(e?.stack ?? e))}\n`);
  if (!answered) {
    const message = friendlyMessage(e);
    logError({ command: process.argv[2], message, error: e, secrets });
    emit({ event: "error", message });
  }
  process.exit(1);
}

async function main() {
  const name = process.argv[2];
  const cmd = commands[name];
  if (!cmd) {
    process.stderr.write(`Unknown command: ${name}
`);
    emit({ event: "error", message: "The app asked for a step this version does not have. Reinstall the app; nothing is lost." });
    return 2;
  }
  let req = {};
  const raw = (await readStdin()).trim();
  if (raw) {
    try {
      req = JSON.parse(raw);
    } catch {
      emit({ event: "error", message: "The request is not valid JSON." });
      return 2;
    }
  }
  heartbeat();
  try {
    if (req.identityDir) {
      // the Identity's block packs: the build finds them, the planner and the
      // scene table's checks know their blocks (packs/, DECISIONS 107)
      process.env.ITV_IDENTITY_DIR = req.identityDir;
      let hasFootage = false;
      try {
        hasFootage = (loadLibrary(req.identityDir).clips ?? []).some((c) => c.source !== "generated");
      } catch {
        hasFootage = false;
      }
      await registerPacks(req.identityDir, { hasFootage });
    } else await registerPacks(null);
    if (req.identityDir && LOOK_COMMANDS.has(name)) req.look = lookOf(req);
    const data = await cmd(req);
    if (req.projectDir) for (const text of new Set(aiNotes)) addNote(req.projectDir, "ai", text);
    emit({ event: "result", data });
    return 0;
  } catch (e) {
    if (e?.stack) process.stderr.write(`${secrets.reduce((s, k) => (k ? s.split(k).join("[key]") : s), e.stack)}\n`);
    const message = friendlyMessage(e);
    logError({ command: name, message, error: e, secrets });
    emit({ event: "error", message });
    return 1;
  }
}

process.on("uncaughtException", lastResort);
process.on("unhandledRejection", lastResort);
process.exitCode = await main();
