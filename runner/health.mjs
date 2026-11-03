// health.mjs: the Health check (docs/AUDIT_REPORT.md): keys, models, ffmpeg, the render
// engine, disk space and the internet. Each item says OK, or what it means and what to
// do. Run on its screen and silently at startup, so it spends nothing and starts no
// download. A model that is not here yet is fine while the internet can bring it.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { dataDir, engineInfo, hyperframesBin, resolveBrowser, managedBrowser } from "./tools.mjs";
import { freeBytes } from "./disk.mjs";
import { modelDir, MODEL_FILES } from "./providers/tts/kokoro.mjs";
import { whisperDir, WHISPER_FILES } from "./recorded/whisper.mjs";
import { depthModelFile } from "./broll/depth.mjs";
import { matteFile } from "./recorded/matte.mjs";
import { libraryDir } from "./gates/build/assemble.mjs";

const GB = 1024 ** 3;
const LOW_DISK = 5 * GB;
const STOP_DISK = GB;
const PROBE = "https://www.gstatic.com/generate_204";

export const AI_KEYS = { gemini: "Gemini", claude: "Claude", openrouter: "OpenRouter", openai: "ChatGPT (OpenAI)", deepseek: "DeepSeek", grok: "Grok" };
const PAID_KEYS = {
  elevenlabs: { label: "ElevenLabs", without: "Your own voice is not available; the free voice reads English videos." },
  heygen: { label: "HeyGen", without: "Videos are made without an avatar." },
  kie: { label: "Kie AI", without: "Paid clips are off; free B-roll sources are used." },
  pixabay: { label: "Pixabay", without: "Pixabay is skipped; the public domain sources are used." },
};

const ok = (id, label, detail = "") => ({ id, label, state: "ok", detail });
const note = (id, label, fix) => ({ id, label, state: "note", fix });
const bad = (id, label, fix) => ({ id, label, state: "fix", fix });

function runs(bin, args = ["-version"]) {
  try {
    const r = spawnSync(bin, args, { windowsHide: true, timeout: 15000, stdio: ["ignore", "pipe", "pipe"] });
    return r.status === 0;
  } catch {
    return false;
  }
}

function checkFfmpeg(env) {
  const out = [];
  for (const [id, name, value] of [["ffmpeg", "ffmpeg", env.HYPERFRAMES_FFMPEG_PATH], ["ffprobe", "ffprobe", env.HYPERFRAMES_FFPROBE_PATH]]) {
    if (!value || !fs.existsSync(value)) out.push(bad(id, name, `${name} is missing, so no video can be made. Reinstall the app.`));
    else if (!runs(value)) out.push(bad(id, name, `${name} is there but does not start. Reinstall the app; check that your antivirus has not blocked it.`));
    else out.push(ok(id, name));
  }
  return out;
}

function checkEngine(env) {
  const info = engineInfo(env);
  if (!info || !fs.existsSync(hyperframesBin(env))) return [bad("engine", "Video engine", "The video engine is missing, so nothing can be rendered. Reinstall the app.")];
  return [ok("engine", "Video engine", `HyperFrames ${info.hyperframes}`)];
}

function checkBrowser(env, online) {
  if (managedBrowser(env)) return ok("browser", "Render browser");
  if (online === false) return bad("browser", "Render browser", "The render browser is not downloaded yet, and it needs the internet (about 280 MB). Connect to the internet and open this screen again.");
  const any = resolveBrowser(env);
  return note("browser", "Render browser", `It downloads once before the first render (about 280 MB)${any ? "; until then previews use your Google Chrome" : ""}.`);
}

function checkModel(id, label, here, online, why) {
  if (here) return ok(id, label);
  if (online === false) return bad(id, label, `${why} It needs the internet once to download. Connect to the internet and it downloads by itself.`);
  return note(id, label, `${why} It downloads once, the first time it is needed.`);
}

function checkLibrary() {
  try {
    const fonts = path.join(libraryDir(), "fonts");
    const count = fs.existsSync(fonts) ? fs.readdirSync(fonts).length : 0;
    if (!count) return bad("fonts", "Fonts and scene library", "The fonts are missing, so videos cannot be built. Reinstall the app.");
    return ok("fonts", "Fonts and scene library");
  } catch {
    return bad("fonts", "Fonts and scene library", "The fonts are missing, so videos cannot be built. Reinstall the app.");
  }
}

function checkDisk(id, label, dir) {
  const free = dir ? freeBytes(dir) : null;
  if (free === null) return note(id, label, "The free space could not be read.");
  const text = `${(free / GB).toFixed(1)} GB free`;
  if (free < STOP_DISK) return bad(id, label, `Only ${text}, too little for a render. Free up some space.`);
  if (free < LOW_DISK) return note(id, label, `Only ${text}. A long video may not fit, so free up some space.`);
  return ok(id, label, text);
}

async function checkInternet(fetchImpl, timeoutMs) {
  try {
    await fetchImpl(PROBE, { method: "HEAD", signal: AbortSignal.timeout(timeoutMs) });
    return true;
  } catch {
    return false;
  }
}

function checkKeys(keys) {
  if (!keys) return [];
  const have = Object.keys(AI_KEYS).filter((k) => keys[k]);
  const items = [have.length ? ok("ai", "AI text", `${have.map((k) => AI_KEYS[k]).join(", ")}`) : note("ai", "AI text", "No AI key is set. You write or paste scripts by hand, and everything else runs on this computer. Add a free Gemini key in Settings, Connections to have scripts written for you.")];
  for (const [id, { label, without }] of Object.entries(PAID_KEYS)) items.push(keys[id] ? ok(id, label, "key saved") : note(id, label, `No key. ${without}`));
  return items;
}

/** Every item of the check. `keys`: which keys are saved (the core knows, never their values). */
export async function healthCheck({ projectsDir = null, keys = null, internet = true, env = process.env, fetchImpl = fetch, timeoutMs = 6000 } = {}) {
  const online = internet ? await checkInternet(fetchImpl, timeoutMs) : null;
  const items = [
    ...checkKeys(keys),
    ...checkFfmpeg(env),
    ...checkEngine(env),
    checkBrowser(env, online),
    checkLibrary(),
    checkModel("voice-model", "Free voice", Object.keys(MODEL_FILES).every((f) => fs.existsSync(path.join(modelDir(env), f))), online, "The free voice runs on this computer."),
    checkModel("speech-model", "Speech model", Object.keys(WHISPER_FILES).every((f) => fs.existsSync(path.join(whisperDir(env), f))), online, "Recordings are turned into words on this computer."),
    checkModel("depth-model", "Depth model", fs.existsSync(depthModelFile(env)), online, "Stills get their 2.5D move on this computer."),
    checkModel("cutout-model", "Person cut-out model", fs.existsSync(matteFile(env)), online, "The cut-out and the silhouette run on this computer."),
    checkDisk("disk-projects", "Disk space, your videos", projectsDir),
    checkDisk("disk-temp", "Disk space, render files", env.ITV_RENDER_TMP || os.tmpdir()),
    checkDisk("disk-data", "Disk space, app data", dataDir(env)),
    online === null ? note("internet", "Internet", "Not checked.") : online ? ok("internet", "Internet") : note("internet", "Internet", "No connection. Everything on this computer still works: pasted scripts, the free voice if it is downloaded, the render. AI and online footage wait."),
  ];
  return { at: new Date().toISOString(), online, items, problems: items.filter((i) => i.state === "fix").length };
}
