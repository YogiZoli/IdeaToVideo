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
import { testKey, PROVIDERS } from "./providers/llm.mjs";
import { testServiceKey } from "./providers/keys.mjs";
import { validate, loadSchema } from "./schema/validate.mjs";
import { createProject, loadProject, saveProject, setGate, readBrief, appendLog, writeJson, writeAtomic } from "./project.mjs";
import { writeScript } from "./gates/script/index.mjs";
import { suggestChannel } from "./gates/channel/index.mjs";
import { toolsStatus, ensureBrowser, dataDir } from "./tools.mjs";
import { downloadPreview } from "./providers/tts/elevenlabs.mjs";
import { sentenceTable } from "./timing/sentences.mjs";
import { lintAndCheck } from "./gates/build/index.mjs";
import { renderVideo } from "./gates/render/index.mjs";
import { makeVoice, makeMusic, musicPath, voiceSample, setMusic, VOICE_PROVIDERS } from "./gates/voice/index.mjs";
import { freeLibrary, ensureFreeTrack } from "./providers/music/free.mjs";
import * as heygen from "./providers/avatar/heygen.mjs";
import { avatarPlan, makeAvatar, removeAvatar } from "./gates/avatar/index.mjs";
import { costEstimateUsd, DEFAULT_PROMPT as MUSIC_PROMPT } from "./providers/music/elevenlabs.mjs";
import { makeScenes, saveScenes, refillScene, sceneRows } from "./gates/scenes/index.mjs";
import { buildAndReview, stillsOf } from "./gates/review/index.mjs";
import { writeExtras } from "./gates/render/export.mjs";
import { isLightLook } from "./gates/build/assemble.mjs";
import { timed } from "./timings.mjs";

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
const key = () => process.env.STUDIO_API_KEY || "";

// A Custom edit changes the gate's output, so every later gate starts again
// (SPEC 6: running a gate again invalidates the later ones).
function edited(projectDir, gate) {
  const project = setGate(setGate(loadProject(projectDir), gate, { state: "running" }), gate, { state: "pending", mode: "custom" });
  saveProject(projectDir, project);
  return project;
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
  return { file, chapters, srt: fs.existsSync(`${base}.srt`) ? `${base}.srt` : null };
}

const commands = {
  providers: async () => ({ providers: Object.entries(PROVIDERS).map(([id, p]) => ({ id, label: p.label, model: p.model })) }),

  "validate-config": async ({ config }) => ({ errors: validate(config, loadSchema("config")) }),

  "validate-brief": async ({ brief }) => ({ errors: validate(brief, loadSchema("brief-card")) }),

  "test-llm": async ({ provider, model }) => testKey({ provider, model, apiKey: key() }),

  "test-service": async ({ service }) => testServiceKey({ service, apiKey: key() }),

  // Onboarding "Use recommended" for Audience and Brand Voice.
  "suggest-channel": async ({ llm, field, channel, topic }) =>
    suggestChannel({ llm: { provider: llm.provider, model: llm.model, apiKey: key() }, field, channel, topic }),

  "create-project": async ({ projectsDir, title, language, brief, autopilot }) => {
    const { id, dir } = createProject({ projectsDir, title, language, brief, autopilot });
    return { id, dir };
  },

  "list-projects": async ({ projectsDir }) => {
    if (!projectsDir || !fs.existsSync(projectsDir)) return { projects: [] };
    const projects = [];
    for (const name of fs.readdirSync(projectsDir)) {
      const dir = path.join(projectsDir, name);
      try {
        const p = loadProject(dir);
        projects.push({ id: p.id, title: p.title, status: p.status, dir, createdAt: p.createdAt, gates: p.gates });
      } catch {
        // not a project folder, or a broken one: skip it
      }
    }
    projects.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return { projects };
  },

  "load-project": async ({ projectDir }) => {
    const project = loadProject(projectDir);
    const md = path.join(projectDir, "script.md");
    return { project, brief: readBrief(projectDir), scriptMarkdown: fs.existsSync(md) ? fs.readFileSync(md, "utf8") : null, latestVideo: latestVideo(projectDir), stills: stillsOf(projectDir), voiceInfo: readVoiceInfo(projectDir) };
  },

  // Gate 1. Writes script.json + script.md and leaves the gate pending (or
  // approved in autopilot).
  "write-script": async ({ projectDir, llm, input = {}, channel = {} }) => {
    let project = setGate(loadProject(projectDir), "script", { state: "running", mode: "recommended" });
    saveProject(projectDir, project);
    appendLog(projectDir, `script: writing with ${llm.provider}/${llm.model || "default model"}`);
    try {
      const res = await timed("script", Number(input.targetLengthMin) || 8, emit, () =>
        writeScript({
          llm: { provider: llm.provider, model: llm.model, apiKey: key() },
          input: { ...input, brief: readBrief(projectDir) ?? undefined, channel, language: project.language },
          onProgress: (p) => emit({ event: "progress", ...p }),
        }),
      );
      writeJson(path.join(projectDir, "script.json"), res.script);
      writeAtomic(path.join(projectDir, "script.md"), res.markdown);
      project = setGate(loadProject(projectDir), "script", { state: project.autopilot ? "approved" : "pending", mode: "recommended" });
      if (res.script.title && !project.title) project.title = res.script.title;
      saveProject(projectDir, project);
      appendLog(projectDir, `script: done, ${res.words} words`);
      return { markdown: res.markdown, words: res.words, gate: project.gates.script, status: project.status };
    } catch (e) {
      const failed = setGate(loadProject(projectDir), "script", { state: "failed", error: String(e.message).slice(0, 2000) });
      saveProject(projectDir, failed);
      appendLog(projectDir, `script: failed, ${e.message}`);
      throw e;
    }
  },

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

  // Gate 2, free music (DECISIONS 60): the list, and one track downloaded for
  // listening before choosing it.
  "free-music": async () => ({ tracks: freeLibrary() }),
  "free-music-preview": async ({ id }) => ({ file: await ensureFreeTrack(id) }),

  // Gate 2, a different music under the same narration (no new reading). The
  // scene table stays valid (the timing is the voice's); only the build and
  // the approval of the voice start again.
  "set-music": async ({ projectDir, music }) => {
    appendLog(projectDir, `music: ${music?.kind === "free" ? music.id : music?.kind}`);
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
    let project = setGate(loadProject(projectDir), "scenes", { state: "running", mode: "recommended" });
    saveProject(projectDir, project);
    appendLog(projectDir, `scenes: planning with ${llm.provider}/${llm.model || "default model"}`);
    try {
      const r = await timed("scenes", jsonCount(projectDir, "sentences.json"), emit, () =>
        makeScenes({
          llm: { provider: llm.provider, model: llm.model, apiKey: key() },
          projectDir,
          language: project.language,
          themeIsLight: isLightLook(look),
          onProgress: (p) => emit({ event: "progress", ...p }),
        }),
      );
      project = setGate(loadProject(projectDir), "scenes", { state: project.autopilot ? "approved" : "pending", mode: "recommended" });
      saveProject(projectDir, project);
      appendLog(projectDir, `scenes: done, ${r.scenes} scenes${r.gaps.length ? `, gaps: ${r.gaps.map((g) => `${g.at} ${g.need}`).join("; ")}` : ""}`);
      return { ...r, ...(await sceneRows(projectDir)), gate: project.gates.scenes, status: project.status };
    } catch (e) {
      saveProject(projectDir, setGate(loadProject(projectDir), "scenes", { state: "failed", error: String(e.message).slice(0, 2000) }));
      appendLog(projectDir, `scenes: failed, ${e.message}`);
      throw e;
    }
  },

  "scene-table": async ({ projectDir }) => sceneRows(projectDir),

  "save-scenes": async ({ projectDir, scenes }) => {
    const r = await saveScenes({ projectDir, scenes });
    const project = edited(projectDir, "scenes");
    saveProject(projectDir, project);
    appendLog(projectDir, "scenes: edited by hand");
    return { ...r, ...(await sceneRows(projectDir)), gate: project.gates.scenes, status: project.status };
  },

  "refill-scene": async ({ projectDir, llm, index, component, look }) => {
    const project = loadProject(projectDir);
    await timed("refill", 1, emit, () => refillScene({ llm: { provider: llm.provider, model: llm.model, apiKey: key() }, projectDir, index, component, language: project.language, themeIsLight: isLightLook(look) }));
    const next = edited(projectDir, "scenes");
    saveProject(projectDir, next);
    appendLog(projectDir, `scenes: scene ${index + 1} swapped to ${component}`);
    return { ...(await sceneRows(projectDir)), gate: next.gates.scenes, status: next.status };
  },

  // Gate 5, optional: an avatar says the opening and the closing (DECISIONS
  // 61). The HeyGen key comes by "service". Previews are cached locally.
  "avatar-looks": async () => {
    const { own, stock } = await heygen.listAvatars({ apiKey: key() });
    const dir = path.join(dataDir(), "avatar-previews");
    // previews cached locally; a missing one never hides the avatar
    const local = async (url) => {
      try {
        return url ? await heygen.cachePreview({ url, dir }) : null;
      } catch {
        return null;
      }
    };
    for (const g of own) {
      g.image = await local(g.image);
      for (const l of g.looks) l.image = await local(l.image);
    }
    for (const l of stock) l.image = await local(l.image);
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

  "make-avatar": async ({ projectDir, lookId, which, look }) => {
    let project = setGate(loadProject(projectDir), "avatar", { state: "running", mode: "custom" });
    saveProject(projectDir, project);
    appendLog(projectDir, `avatar: ${lookId}, ${(which ?? []).join("+")}`);
    try {
      const plan = await avatarPlan(projectDir);
      const seconds = plan.segments.filter((s) => (which ?? []).includes(s.name)).reduce((n, s) => n + s.duration, 0);
      const r = await timed("avatar", seconds, emit, () => makeAvatar({ projectDir, apiKey: key(), lookId, which, look, onProgress: (p) => emit({ event: "progress", ...p }) }));
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
      const extras = writeExtras(projectDir, r.file, { language: loadProject(projectDir).language, total: r.seconds });
      appendLog(projectDir, `render: captions and chapters written${extras.chaptersNote ? `, ${extras.chaptersNote}` : ""}`);
      return { ...r, ...extras };
    } catch (e) {
      appendLog(projectDir, `render: captions and chapters failed, ${e.message}`);
      return { ...r, extrasError: String(e.message) };
    }
  },

  "approve-gate": async ({ projectDir, gate }) => {
    const current = loadProject(projectDir);
    const mode = current.gates[gate]?.mode;
    const project = setGate(current, gate, { state: "approved", mode });
    saveProject(projectDir, project);
    appendLog(projectDir, `${gate}: approved`);
    return { gate: project.gates[gate], status: project.status };
  },
};

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
    emit({ event: "result", data: await cmd(req) });
    return 0;
  } catch (e) {
    emit({ event: "error", message: String(e.message) });
    return 1;
  }
}

process.exitCode = await main();
