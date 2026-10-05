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
import { testKey, PROVIDERS, onLlmEvent } from "./providers/llm.mjs";
import { testServiceKey } from "./providers/keys.mjs";
import { validate, loadSchema } from "./schema/validate.mjs";
import { createProject, loadProject, saveProject, recoverInterrupted, setGate, readBrief, appendLog, writeJson, writeAtomic } from "./project.mjs";
import { writeScript } from "./gates/script/index.mjs";
import { suggestChannel } from "./gates/channel/index.mjs";
import { toolsStatus, ensureBrowser, dataDir } from "./tools.mjs";
import { downloadPreview } from "./providers/tts/elevenlabs.mjs";
import { sentenceTable } from "./timing/sentences.mjs";
import { lintAndCheck } from "./gates/build/index.mjs";
import { renderVideo } from "./gates/render/index.mjs";
import { makeVoice, makeMusic, musicPath, voiceSample, setMusic, VOICE_PROVIDERS } from "./gates/voice/index.mjs";
import * as heygen from "./providers/avatar/heygen.mjs";
import { keywordIdeas } from "./providers/research/vidiq.mjs";
import { avatarPlan, makeAvatar, removeAvatar, setLayout } from "./gates/avatar/index.mjs";
import { costEstimateUsd, DEFAULT_PROMPT as MUSIC_PROMPT } from "./providers/music/elevenlabs.mjs";
import { makeScenes, saveScenes, refillScene, sceneRows } from "./gates/scenes/index.mjs";
import { buildAndReview, stillsOf } from "./gates/review/index.mjs";
import { writeExtras } from "./gates/render/export.mjs";
import { isLightLook, libraryDir, baseTheme, callColor } from "./gates/build/assemble.mjs";
import { loadCard, saveCard, cardTheme, cardFamilies, contrastReport, normalizeCard } from "./brand/card.mjs";
import { fontsIndex, familyNames, categories } from "./brand/fonts.mjs";
import { brandPreview, previewDir } from "./brand/preview.mjs";
import { loadProfile, saveProfile, normalizeProfile, profileFromMood, recommendMood, wizardOptions } from "./motion/profile.mjs";
import { motionPreview, motionPreviewDir } from "./motion/preview.mjs";
import { loadProfile as loadCta, saveProfile as saveCta, normalizeProfile as normalizeCta, defaultProfile as defaultCta, videoPlan, catalogForUi, endScreenOf, loadLast, saveLast } from "./cta/profile.mjs";
import { segmentVoice, segmentVideo } from "./cta/make.mjs";
import { loadSegments, addSegment, removeSegment, markUsed, segmentsDir, incomingName, SEGMENT_MAX_SECONDS, SEGMENTS_PER_KEYWORD } from "./cta/segments.mjs";
import { TEMPERATURES, SLOTS, PLACES_FOR_COUNT } from "./cta/catalog.mjs";
import { galleryCards, STYLE_NOTE } from "./brand/gallery.mjs";
import { cardFromTokens } from "./brand/tokens.mjs";
import { loadDictionary, saveDictionary, dictionaryData, checkAll } from "./gates/script/dictionary.mjs";
import { spokenFields } from "./gates/script/index.mjs";
import { timed } from "./timings.mjs";
import { backupProject, backupAll, estimate as backupEstimate, listBackups, restoreProject, readRecord as backupRecord, setLevel as setBackupLevel } from "./backup.mjs";

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

const emit = (o) => process.stdout.write(JSON.stringify(o) + "\n");
// LLM retries and model switches become progress lines (the app logs them).
onLlmEvent((e) => emit({ event: "progress", ...e }));
const key = () => process.env.STUDIO_API_KEY || "";

// The look of a build, from the Identity's Brand Identity Card. The Rust core
// sets identityDir (the ONE Video's own Identity) on every request; without
// it (tests, pilots) a preset name in `look` still works.
function lookOf({ identityDir, look }) {
  if (!identityDir) return look;
  const { card } = loadCard(identityDir);
  return { theme: cardTheme(card, categories()), families: cardFamilies(card), light: card.appearance === "light", name: card.nameplate?.name || null, motion: motionOf(identityDir) };
}

// The Identity's Motion profile, or null (motion/profile.mjs). A broken file
// stops the build with a sentence, it is never silently ignored.
function motionOf(identityDir) {
  try {
    return loadProfile(identityDir);
  } catch (e) {
    throw new Error(`The Motion profile cannot be used: ${e.message} Open Settings, Identity, Motion to fix it.`);
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
    return { slot: c.slot, keyword: c.keyword, temperature: c.temperature, gets: c.offer || c.gets, segmentId: c.segment.id, name: c.segment.name, file, seconds: c.segment.seconds };
  });
  const endScreen = identityDir ? endScreenOf(identityDir, own) : 0;
  if (identityDir) {
    markUsed(identityDir, segmentCalls.map((c) => c.segmentId));
    const base = own ?? loadCta(identityDir) ?? defaultCta();
    saveLast(identityDir, { ...base, segmentIds: Object.fromEntries(segmentCalls.map((c) => [c.slot, c.segmentId])), endScreen });
  }
  return { segmentCalls, endScreen };
}
function loadCtaChecked(identityDir) {
  try {
    return identityDir ? loadCta(identityDir) : null;
  } catch (e) {
    throw new Error(`The CTA profile cannot be used: ${e.message} Open Settings, Identity, CTA to fix it.`);
  }
}
const offOf = (look) => (typeof look === "object" ? look?.motion?.scenes?.off ?? [] : []);

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

// The project, with gates left "running" by a closed app marked failed (saved).
function recovered(projectDir) {
  const project = loadProject(projectDir);
  const next = recoverInterrupted(project);
  if (next !== project) {
    saveProject(projectDir, next);
    appendLog(projectDir, "a step was interrupted (the app was closed), marked failed");
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
  try {
    calls = JSON.parse(fs.readFileSync(`${base}.publish.json`, "utf8")).commentCalls;
  } catch {
    // rendered before the publishing data existed
  }
  return {
    file,
    chapters,
    srt: fs.existsSync(`${base}.srt`) ? `${base}.srt` : null,
    publishFile: fs.existsSync(`${base}.publish.json`) ? `${base}.publish.json` : null,
    comments: fs.existsSync(`${base}.comments.txt`) ? fs.readFileSync(`${base}.comments.txt`, "utf8") : null,
    calls,
  };
}

const commands = {
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
  "suggest-channel": async ({ llm, field, channel, topic }) =>
    suggestChannel({ llm: { provider: llm.provider, model: llm.model, apiKey: key() }, field, channel, topic }),

  "create-project": async ({ projectsDir, title, language, brief, autopilot, identity }) => {
    const { id, dir } = createProject({ projectsDir, title, language, brief, autopilot, identity });
    return { id, dir };
  },

  "list-projects": async ({ projectsDir }) => {
    if (!projectsDir || !fs.existsSync(projectsDir)) return { projects: [] };
    const projects = [];
    for (const name of fs.readdirSync(projectsDir)) {
      const dir = path.join(projectsDir, name);
      try {
        const p = recovered(dir);
        projects.push({ id: p.id, title: p.title, status: p.status, dir, createdAt: p.createdAt, gates: p.gates });
      } catch {
        // not a project folder, or a broken one: skip it
      }
    }
    projects.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return { projects };
  },

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
  "segments-list": async ({ identityDir }) => ({ segments: loadSegments(identityDir), dir: segmentsDir(identityDir), maxSeconds: SEGMENT_MAX_SECONDS, perKeyword: SEGMENTS_PER_KEYWORD }),
  "segment-add": async ({ identityDir, file, keyword, name }) => ({ segment: await addSegment({ identityDir, file, keyword, name, source: "upload" }) }),
  "segment-remove": async ({ identityDir, id }) => removeSegment(identityDir, id),
  // A segment made in the app: the narrator reads the sentence (its key),
  // then HeyGen makes the avatar video on it (the HeyGen key).
  "segment-voice": async ({ identityDir, narrator, text, language }) => segmentVoice({ identityDir, narrator, apiKey: key(), text, language }),
  "segment-make": async ({ identityDir, lookId, audio, keyword, name }) => ({
    segment: await segmentVideo({ identityDir, apiKey: key(), lookId, audio, keyword, name, background: ctaLook(identityDir).bg, onProgress: (p) => emit({ event: "progress", ...p }) }),
  }),

  "dictionary-load": async ({ identityDir }) => ({ dictionary: loadDictionary(identityDir) }),

  "dictionary-save": async ({ identityDir, dictionary }) => {
    if (!identityDir) throw new Error("No Identity to save the dictionary in.");
    return { dictionary: saveDictionary(identityDir, dictionary) };
  },

  "dictionary-check": async ({ projectDir, identityDir }) => ({ findings: dictionaryFindings(projectDir, identityDir) }),

  "load-project": async ({ projectDir }) => {
    const project = recovered(projectDir);
    const md = path.join(projectDir, "script.md");
    return { project, brief: readBrief(projectDir), scriptMarkdown: fs.existsSync(md) ? fs.readFileSync(md, "utf8") : null, calls: scriptCalls(projectDir), latestVideo: latestVideo(projectDir), stills: stillsOf(projectDir), voiceInfo: readVoiceInfo(projectDir) };
  },

  // Gate 1. Writes script.json + script.md and leaves the gate pending (or
  // approved in autopilot).
  "write-script": async ({ projectDir, identityDir, llm, input = {}, channel = {} }) => {
    const dict = loadDictionary(identityDir);
    let project = setGate(loadProject(projectDir), "script", { state: "running", mode: "recommended" });
    saveProject(projectDir, project);
    appendLog(projectDir, `script: writing with ${llm.provider}/${llm.model || "default model"}`);
    try {
      const plan = ctaOf(identityDir, input.cta);
      const res = await timed("script", Number(input.targetLengthMin) || 8, emit, () =>
        writeScript({
          llm: { provider: llm.provider, model: llm.model, apiKey: key() },
          input: { ...input, brief: readBrief(projectDir) ?? undefined, channel, language: project.language, dictionary: dictionaryData(dict), commentCalls: plan.filter((c) => c.mode === "narrator") },
          onProgress: (p) => emit({ event: "progress", ...p }),
        }),
      );
      Object.assign(res.script, takeSegments(projectDir, identityDir, plan, input.cta));
      for (const c of plan) if (c.note) appendLog(projectDir, `script: ${c.note}`);
      writeJson(path.join(projectDir, "script.json"), res.script);
      writeAtomic(path.join(projectDir, "script.md"), res.markdown);
      project = setGate(loadProject(projectDir), "script", { state: project.autopilot ? "approved" : "pending", mode: "recommended" });
      if (res.script.title && !project.title) project.title = res.script.title;
      saveProject(projectDir, project);
      const findings = checkAll(dict, spokenFields(res.script).map(([where, text]) => [`script ${where}`, text]));
      appendLog(projectDir, `script: done, ${res.words} words${findings.length ? `, ${findings.length} dictionary findings` : ""}`);
      return { markdown: res.markdown, words: res.words, gate: project.gates.script, status: project.status, dictionary: findings };
    } catch (e) {
      const failed = setGate(loadProject(projectDir), "script", { state: "failed", error: String(e.message).slice(0, 2000) });
      saveProject(projectDir, failed);
      appendLog(projectDir, `script: failed, ${e.message}`);
      throw e;
    }
  },

  // Gate 1, optional (DECISIONS 42, 64): keyword ideas from vidIQ for the
  // topic, with the user's vidIQ key. The chosen one goes into the script.
  "keyword-ideas": async ({ keyword, country }) => keywordIdeas({ apiKey: key(), keyword, country }),

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
  "make-voice": async ({ projectDir, narrator, music }) => {
    let project = setGate(loadProject(projectDir), "voice", { state: "running", mode: "recommended" });
    saveProject(projectDir, project);
    appendLog(projectDir, `voice: ${narrator?.provider}/${narrator?.voice ?? "?"}${music ? `, music ${music}` : ""}`);
    try {
      const info = await timed("voice", sentenceCount(projectDir), emit, () =>
        makeVoice({
          projectDir,
          narrator,
          apiKey: key(),
          music: musicPath(projectDir, music),
          language: project.language,
          onProgress: (p) => emit({ event: "progress", ...p }),
        }),
      );
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
      appendLog(projectDir, `voice: done, ${info.seconds}s, ${info.finalLufs} LUFS, ${table.sentences} sentences`);
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
    const info = await timed("remix", 1, emit, () => setMusic({ projectDir, music, onProgress: (p) => emit({ event: "progress", ...p }) }));
    let project = setGate(loadProject(projectDir), "voice", { state: loadProject(projectDir).autopilot ? "approved" : "pending", mode: "custom" });
    if (project.gates.review && project.gates.review.state !== "todo") project = setGate(project, "review", { state: "todo" });
    saveProject(projectDir, project);
    appendLog(projectDir, `music: mixed, final ${info.finalLufs} LUFS${info.musicGainDb !== undefined && info.musicGainDb !== null ? `, music ${info.musicGainDb} dB` : ""}`);
    return { info, gate: project.gates.voice, status: project.status };
  },

  // Gate 2, music made for this video. The key is the ElevenLabs one.
  "music-estimate": async ({ seconds }) => ({ usd: costEstimateUsd(Number(seconds) || 0), prompt: MUSIC_PROMPT }),

  "make-music": async ({ projectDir, music }) => {
    appendLog(projectDir, "music: ElevenLabs Music");
    const info = await timed("music", 60, emit, () => makeMusic({ projectDir, apiKey: key(), prompt: music?.prompt, onProgress: (p) => emit({ event: "progress", ...p }) }));
    const project = setGate(loadProject(projectDir), "voice", { state: loadProject(projectDir).autopilot ? "approved" : "pending", mode: "recommended" });
    saveProject(projectDir, project);
    appendLog(projectDir, `music: done, final ${info.finalLufs} LUFS, music ${info.musicGainDb} dB`);
    return { info, gate: project.gates.voice, status: project.status };
  },

  // Gate 3: the scene table. The AI plans it from the sentence table and the
  // library; the user swaps rows (refill-scene) or edits text (save-scenes).
  "make-scenes": async ({ projectDir, llm, look }) => {
    const name = typeof look === "object" ? look?.name ?? null : null;
    let project = setGate(loadProject(projectDir), "scenes", { state: "running", mode: "recommended" });
    saveProject(projectDir, project);
    appendLog(projectDir, `scenes: planning with ${llm.provider}/${llm.model || "default model"}`);
    try {
      const r = await timed("scenes", jsonCount(projectDir, "sentences.json"), emit, () =>
        makeScenes({
          llm: { provider: llm.provider, model: llm.model, apiKey: key() },
          projectDir,
          language: project.language,
          name,
          themeIsLight: isLightLook(look),
          off: offOf(look),
          onProgress: (p) => emit({ event: "progress", ...p }),
        }),
      );
      project = setGate(loadProject(projectDir), "scenes", { state: project.autopilot ? "approved" : "pending", mode: "recommended" });
      saveProject(projectDir, project);
      appendLog(projectDir, `scenes: done, ${r.scenes} scenes${r.gaps.length ? `, gaps: ${r.gaps.map((g) => `${g.at} ${g.need}`).join("; ")}` : ""}`);
      return { ...r, ...(await sceneRows(projectDir, { off: offOf(look) })), gate: project.gates.scenes, status: project.status };
    } catch (e) {
      saveProject(projectDir, setGate(loadProject(projectDir), "scenes", { state: "failed", error: String(e.message).slice(0, 2000) }));
      appendLog(projectDir, `scenes: failed, ${e.message}`);
      throw e;
    }
  },

  "scene-table": async ({ projectDir, look }) => sceneRows(projectDir, { off: offOf(look) }),

  "save-scenes": async ({ projectDir, scenes, look }) => {
    const r = await saveScenes({ projectDir, scenes });
    const project = edited(projectDir, "scenes");
    saveProject(projectDir, project);
    appendLog(projectDir, "scenes: edited by hand");
    return { ...r, ...(await sceneRows(projectDir, { off: offOf(look) })), gate: project.gates.scenes, status: project.status };
  },

  "refill-scene": async ({ projectDir, llm, index, component, look }) => {
    const project = loadProject(projectDir);
    appendLog(projectDir, `scenes: swapping scene ${index + 1} to ${component} with ${llm.provider}/${llm.model || "default model"}`);
    try {
      await timed("refill", 1, emit, () => refillScene({ llm: { provider: llm.provider, model: llm.model, apiKey: key() }, projectDir, index, component, language: project.language, name: typeof look === "object" ? look?.name ?? null : null, themeIsLight: isLightLook(look), off: offOf(look) }));
    } catch (e) {
      // The table stays as it was; only the log learns about the failed swap.
      appendLog(projectDir, `scenes: swap of scene ${index + 1} failed, ${e.message}`);
      throw e;
    }
    const next = edited(projectDir, "scenes");
    saveProject(projectDir, next);
    appendLog(projectDir, `scenes: scene ${index + 1} swapped to ${component}`);
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

  "avatar-plan": async ({ projectDir }) => {
    const plan = await avatarPlan(projectDir);
    let account = null;
    try {
      account = await heygen.balance({ apiKey: key() });
    } catch (e) {
      account = { error: String(e.message) };
    }
    const seconds = plan.segments.reduce((n, s) => n + s.duration, 0);
    return { ...plan, estimate: heygen.estimateUsd(seconds), account };
  },

  "make-avatar": async ({ projectDir, lookId, which, look, layout }) => {
    let project = setGate(loadProject(projectDir), "avatar", { state: "running", mode: "custom" });
    saveProject(projectDir, project);
    appendLog(projectDir, `avatar: ${lookId}, ${(which ?? []).join("+")}`);
    try {
      const plan = await avatarPlan(projectDir);
      const seconds = plan.segments.filter((s) => (which ?? []).includes(s.name)).reduce((n, s) => n + s.duration, 0);
      const r = await timed("avatar", seconds, emit, () => makeAvatar({ projectDir, apiKey: key(), lookId, which, look, layout, onProgress: (p) => emit({ event: "progress", ...p }) }));
      project = loadProject(projectDir);
      if (project.gates.review && project.gates.review.state !== "todo") project = setGate(project, "review", { state: "todo" });
      project = setGate(project, "avatar", { state: "pending", mode: "custom" });
      saveProject(projectDir, project);
      appendLog(projectDir, `avatar: done, ${r.segments.map((s) => `${s.name} ${s.duration}s`).join(", ")}`);
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
  "build-video": async ({ projectDir, look }) => {
    let project = loadProject(projectDir);
    if (project.gates.scenes?.state !== "approved") throw new Error("Approve the scene table first.");
    project = setGate(project, "review", { state: "running", mode: "recommended" });
    saveProject(projectDir, project);
    appendLog(projectDir, "review: build, check, contact sheet");
    try {
      const r = await timed("build", jsonCount(projectDir, "scenes.json", "scenes"), emit, () => buildAndReview(projectDir, { language: project.language, title: project.title, look, onProgress: (p) => emit({ event: "progress", ...p }) }));
      project = setGate(loadProject(projectDir), "review", { state: project.autopilot ? "approved" : "pending", mode: "recommended" });
      saveProject(projectDir, project);
      appendLog(projectDir, `review: done, ${r.scenes} scenes, ${r.seconds}s`);
      if (r.transitions?.some((t) => t !== "cut")) appendLog(projectDir, `review: Motion profile, scene changes ${r.transitions.join(" ")}`);
      for (const n of r.notes ?? []) appendLog(projectDir, `review: ${n}`);
      return { ...r, gate: project.gates.review, status: project.status };
    } catch (e) {
      saveProject(projectDir, setGate(loadProject(projectDir), "review", { state: "failed", error: String(e.message).slice(0, 2000) }));
      appendLog(projectDir, `review: failed, ${e.message}`);
      throw e;
    }
  },

  // The render, once, locally, after the contact sheet is approved.
  "render-video": async ({ projectDir, quality }) => {
    if (loadProject(projectDir).gates.review?.state !== "approved") throw new Error("Approve the contact sheet first.");
    appendLog(projectDir, "render: start");
    const r = await timed("render", videoSeconds(projectDir), emit, () => renderVideo(projectDir, { quality: quality === "draft" || quality === "high" ? quality : "standard", onProgress: (p) => emit({ event: "progress", ...p }) }));
    appendLog(projectDir, `render: done, ${r.file}, ${r.seconds}s video in ${r.renderSeconds}s`);
    // Captions and chapters next to the video. A problem here never loses the
    // render: the video is there, the note says what is missing.
    try {
      const extras = writeExtras(projectDir, r.file, { language: loadProject(projectDir).language, total: r.seconds, project: loadProject(projectDir) });
      appendLog(projectDir, `render: captions and chapters written${extras.chaptersNote ? `, ${extras.chaptersNote}` : ""}`);
      return { ...r, ...extras };
    } catch (e) {
      appendLog(projectDir, `render: captions and chapters failed, ${e.message}`);
      return { ...r, extrasError: String(e.message) };
    }
  },

  "approve-gate": async ({ projectDir, gate }) => {
    const current = loadProject(projectDir);
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
const LOOK_COMMANDS = new Set(["make-scenes", "refill-scene", "make-avatar", "build-video", "scene-table", "save-scenes"]);

async function readStdin() {
  if (process.stdin.isTTY) return "";
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const name = process.argv[2];
  const cmd = commands[name];
  if (!cmd) {
    emit({ event: "error", message: `Unknown command: ${name}. Known: ${Object.keys(commands).join(", ")}` });
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
  try {
    if (req.identityDir && LOOK_COMMANDS.has(name)) req.look = lookOf(req);
    emit({ event: "result", data: await cmd(req) });
    return 0;
  } catch (e) {
    emit({ event: "error", message: String(e.message) });
    return 1;
  }
}

process.exitCode = await main();
