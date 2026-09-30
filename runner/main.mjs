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
import { sentenceTable } from "./pipeline.mjs";
import { makeVoice, makeMusic, musicPath, voiceSample, VOICE_PROVIDERS } from "./gates/voice/index.mjs";
import { costEstimateUsd } from "./providers/music/elevenlabs.mjs";

const emit = (o) => process.stdout.write(JSON.stringify(o) + "\n");
const key = () => process.env.STUDIO_API_KEY || "";

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
    return { project, brief: readBrief(projectDir), scriptMarkdown: fs.existsSync(md) ? fs.readFileSync(md, "utf8") : null };
  },

  // Gate 1. Writes script.json + script.md and leaves the gate pending (or
  // approved in autopilot).
  "write-script": async ({ projectDir, llm, input = {}, channel = {} }) => {
    let project = setGate(loadProject(projectDir), "script", { state: "running", mode: "recommended" });
    saveProject(projectDir, project);
    appendLog(projectDir, `script: writing with ${llm.provider}/${llm.model || "default model"}`);
    try {
      const res = await writeScript({
        llm: { provider: llm.provider, model: llm.model, apiKey: key() },
        input: { ...input, brief: readBrief(projectDir) ?? undefined, channel, language: project.language },
        onProgress: (p) => emit({ event: "progress", ...p }),
      });
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
    const project = setGate(loadProject(projectDir), "script", { state: "pending", mode: "custom" });
    saveProject(projectDir, project);
    appendLog(projectDir, "script: edited by hand");
    return { gate: project.gates.script, status: project.status };
  },

  // What the render chain has: canon, ffmpeg, browser. Downloads nothing.
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

  // Gate 2: narration + music, one artifact (AUDIO.md).
  "make-voice": async ({ projectDir, narrator, music }) => {
    let project = setGate(loadProject(projectDir), "voice", { state: "running", mode: "recommended" });
    saveProject(projectDir, project);
    appendLog(projectDir, `voice: ${narrator?.provider}/${narrator?.voice ?? "?"}${music ? `, music ${music}` : ""}`);
    try {
      const info = await makeVoice({
        projectDir,
        narrator,
        apiKey: key(),
        music: musicPath(projectDir, music),
        language: project.language,
        onProgress: (p) => emit({ event: "progress", ...p }),
      });
      // step 3, the sentence table: a measurement of this audio, no gate
      emit({ event: "progress", step: "sentences" });
      const table = await sentenceTable(projectDir);
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

  // Gate 2, music made for this video. The key is the ElevenLabs one.
  "music-estimate": async ({ seconds }) => ({ usd: costEstimateUsd(Number(seconds) || 0) }),

  "make-music": async ({ projectDir, music }) => {
    appendLog(projectDir, "music: ElevenLabs Music");
    const info = await makeMusic({ projectDir, apiKey: key(), prompt: music?.prompt, onProgress: (p) => emit({ event: "progress", ...p }) });
    const project = setGate(loadProject(projectDir), "voice", { state: loadProject(projectDir).autopilot ? "approved" : "pending", mode: "recommended" });
    saveProject(projectDir, project);
    appendLog(projectDir, `music: done, final ${info.finalLufs} LUFS, music ${info.musicGainDb} dB`);
    return { info, gate: project.gates.voice, status: project.status };
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
