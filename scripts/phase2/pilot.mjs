#!/usr/bin/env node
// pilot.mjs: the registry pilot (phase 2, step 7). One fixed ~60 s video, every
// library component once, in two themes. For each
// theme: assemble, lint, check, snapshots at scene midpoints, a contact sheet
// (ffmpeg), and a render. Prints what each step took and how it ended.
//
// The narration is a quiet tone with a hand-made sentence table, so no key and
// no TTS are needed: this measures the assembler and the engine, not a voice.
//
// Usage: node scripts/phase2/pilot.mjs --work <dir> [--no-render] [--theme dark|light]
// Needs the built engine, library and ffmpeg (scripts/fetch-*.mjs) and the
// render browser (tools-status / browser-ensure).

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assemble } from "../../runner/gates/build/assemble.mjs";
import { lintAndCheck } from "../../runner/gates/build/index.mjs";
import { renderVideo } from "../../runner/gates/render/index.mjs";
import { resolveBrowser, ffmpegPaths } from "../../runner/tools.mjs";
import { contactSheet } from "../../runner/gates/review/index.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { values: args } = parseArgs({
  options: {
    work: { type: "string" },
    render: { type: "boolean", default: true },
    "no-render": { type: "boolean", default: false },
    theme: { type: "string" },
  },
});
if (!args.work) {
  console.error("Usage: node scripts/phase2/pilot.mjs --work <dir> [--no-render] [--theme dark|light]");
  process.exit(2);
}

const env = { ...process.env };
const ff = path.join(ROOT, "app", "src-tauri", "ffmpeg");
const exe = process.platform === "win32" ? ".exe" : "";
env.HYPERFRAMES_FFMPEG_PATH ??= path.join(ff, `ffmpeg${exe}`);
env.HYPERFRAMES_FFPROBE_PATH ??= path.join(ff, `ffprobe${exe}`);

// One sentence per scene, every library component once. Times as a voice gate
// would measure them.
const LINES = [
  ["titlecard-lockup", "Here is a new way to make videos.", { kicker: "NEW", wordmark: "IDEA TO VIDEO", label: "FROM A THOUGHT TO A FILM" }],
  ["titlecard-calm", "First, a simple principle.", { kicker: "CHAPTER ONE", headline: "Say one thing at a time" }],
  ["per-word-rise", "Every scene follows the voice.", { text: "FOLLOW THE VOICE" }],
  ["kinetic-type-swap", "It can be faster, simpler, and yours.", { prefix: "Make it", options: "faster,simpler,yours" }],
  ["headline-slam", "Stop waiting for the perfect moment.", { text: "Start today", accent_word_index: 1, accent: "blue" }],
  ["vox-annotate", "The story matters more than the tools.", { text: "Tell the story, not the tools", keyword: "story", note: "what people remember", style: "circle" }],
  ["marker-highlight", "Clarity beats cleverness every time.", { text: "Clarity beats cleverness", emphasis_word: "Clarity", style: "underline" }],
  ["count-up", "Most viewers decide in the first eight seconds.", { start: 0, end: 8, suffix: " s" }],
  ["chart-story", "Retention climbs when the picture matches the words.", { type: "bars", data: "31, 44, 58, 72", labels: "Week 1, Week 2, Week 3, Week 4", emphasize: 4, unit: "%" }],
  ["conic-progress-ring", "Three out of four finish the video.", { progress: 75, label: "75%" }],
  ["grid-card-assemble", "Write, record, build, and publish.", { items: "Write,Record,Build,Publish" }],
  ["constellation-hub", "Everything connects to one idea.", { hub_label: "Your idea", nodes: "Script,Voice,Scenes,Video" }],
  ["whiteboard-ink", "Sketch the idea before you build it.", { sketch: "bulb", caption: "Sketch it first" }],
  ["cta-close", "Start your first video today.", { action_line: "Start your first video", button_label: "Open the app" }],
  ["logo-brand-close", "See you in the next one.", { wordmark: "IDEA TO VIDEO", tagline: "From a thought to a film", url: "example.com" }],
];
const GAP = 0.35;
const sentences = [];
let t = 0.2;
for (const [, text] of LINES) {
  const dur = Math.round((0.9 + text.split(/\s+/).length * 0.33) * 1000) / 1000;
  const start = Math.round(t * 1000) / 1000;
  const end = Math.round((t + dur) * 1000) / 1000;
  sentences.push({ id: `S${sentences.length + 1}`, start, end, dur, words: text.split(/\s+/).length, text });
  t = end + GAP;
}
const TOTAL = Math.round((t + 0.6) * 1000) / 1000;

const THEMES = {
  dark: { bg: "#0f1115", fg: "#f4f5f7", muted: "#9aa3b2", surface: "#171b23", border: "#343b48", brand: "#5ee6a8", accent: "#6aa9ff", "accent-2": "#c7a6ff", "font-display": "'Segoe UI', Inter, system-ui, sans-serif" },
  light: { bg: "#f6f3ec", fg: "#1b1d22", muted: "#5d6470", surface: "#ffffff", border: "#d9d3c7", brand: "#0a7d55", accent: "#1f5fbf", "accent-2": "#7a3fb8", "font-display": "Georgia, 'Times New Roman', serif" },
};

const timed = async (label, fn) => {
  const t0 = Date.now();
  try {
    const r = await fn();
    console.log(`  ${label}: ok, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    return r;
  } catch (e) {
    console.log(`  ${label}: FAILED after ${((Date.now() - t0) / 1000).toFixed(1)} s: ${e.message}`);
    return null;
  }
};

function ffmpeg(argv) {
  const r = spawnSync(ffmpegPaths(env)?.ffmpeg ?? env.HYPERFRAMES_FFMPEG_PATH, ["-hide_banner", "-loglevel", "error", "-y", ...argv], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr || `ffmpeg exited ${r.status}`);
}

const browser = resolveBrowser(env);
if (!browser) {
  console.error("No render browser. Run the app's Download now first.");
  process.exit(1);
}
console.log(`browser: ${browser.source}, ${sentences.length} sentences, ${TOTAL} s`);

for (const name of args.theme ? [args.theme] : Object.keys(THEMES)) {
  console.log(`theme ${name}`);
  const dir = path.join(path.resolve(args.work), `pilot-${name}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, "audio"), { recursive: true });
  ffmpeg(["-f", "lavfi", "-i", `sine=frequency=220:duration=${TOTAL}`, "-af", "volume=0.05", "-ar", "48000", "-ac", "2", "-b:a", "128k", path.join(dir, "audio", "vo_bgm.mp3")]);
  fs.writeFileSync(path.join(dir, "sentences.json"), JSON.stringify(sentences, null, 2) + "\n");
  // Words spread evenly over each sentence, and a script with three sections,
  // for the captions and the chapter list the render writes.
  const words = sentences.flatMap((s) =>
    s.text.split(/\s+/).map((text, i, all) => ({ text, start: Math.round((s.start + (s.dur * i) / all.length) * 1000) / 1000, end: Math.round((s.start + (s.dur * (i + 1)) / all.length) * 1000) / 1000 })),
  );
  fs.writeFileSync(path.join(dir, "words.json"), JSON.stringify(words, null, 2) + "\n");
  const third = Math.ceil(LINES.length / 3);
  const part = (a, b) => LINES.slice(a, b).map(([, t]) => t).join(" ");
  fs.writeFileSync(path.join(dir, "script.md"), `# Pilot\n\n## OPEN\n\n${part(0, third)}\n\n## 1. The library\n\n${part(third, 2 * third)}\n\n## OWN\n\n${part(2 * third)}\n`);
  const scenes =LINES.map(([component, , vars], i) => ({ component, from: `S${i + 1}`, vars }));
  fs.writeFileSync(path.join(dir, "scenes.json"), JSON.stringify({ theme: THEMES[name], scenes }, null, 2) + "\n");

  const built = await timed("assemble", () => assemble(dir, { env, total: TOTAL, title: `Pilot ${name}` }));
  if (!built) continue;
  await timed("lint + check", () => lintAndCheck(dir, { env }));

  await timed("snapshots + contact sheet", () => contactSheet(dir, { env }));
  if (args.render && !args["no-render"]) {
    const r = await timed("render", () => renderVideo(dir, { env }));
    if (r) console.log(`  video: ${r.file}, ${r.seconds} s, rendered in ${r.renderSeconds} s`);
  }
}
