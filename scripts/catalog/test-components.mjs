#!/usr/bin/env node
// test-components.mjs: every registry component through the app's own build
// path, with two test topics (DECISIONS 130). Each component becomes a
// one-scene video per topic, built by the app's assembler (the Identity look
// of that topic, no Motion profile), then:
//   lint     hyperframes lint
//   check    hyperframes check --json at the landed moment (lint, runtime,
//            layout, contrast), as the app's build gate judges a scene
//   stills   three frames: just in, the middle, just before the end
//   render   a draft render of the scene
// The two topics have two different looks (light and dark), so the stills
// show whether a component follows the Identity's Brand, and two different
// subjects, so they show whether it follows what is said.
//
// Out: <work>/results.json (one record per component and topic) and
// <work>/sheets/<topic>-<n>.png, contact sheets of 8 components each (a row
// per component: the three stills), with <work>/sheets/<topic>-<n>.txt
// naming the rows. scripts/catalog/build-catalog.mjs reads results.json.
//
// Usage: node scripts/catalog/test-components.mjs --work <dir> [--only a,b] [--jobs 4] [--no-render]
// Needs: fetch-sidecars, fetch-engine, fetch-library and the render browser.

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { assemble, loadComponent, libraryDir } from "../../runner/gates/build/assemble.mjs";
import { readCheckReport, savedCheckReport } from "../../runner/gates/build/index.mjs";
import { runHyperframes, resolveBrowser } from "../../runner/tools.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// The two test topics. Each has one look (a Brand preset) and the words a
// component may show: a title, a short phrase, a line, a sentence, one word,
// six list items, a number, a quote, a before and after, a call.
export const TOPICS = {
  groceries: {
    look: "coral",
    sentence: "Shoppers who plan their meals spend thirty percent less every week.",
    title: "Smart grocery shopping",
    short: "Plan your meals",
    line: "A list saves you money",
    word: "Budget",
    kicker: "WEEK ONE",
    items: ["Plan meals", "Write a list", "Compare prices", "Buy seasonal", "Cook twice", "Track spending"],
    number: 30,
    unit: "%",
    quote: "A list is the cheapest tool in your kitchen",
    person: "Maria Lopez",
    brand: "Kitchen Budget",
    before: "Impulse buys",
    after: "Planned meals",
    question: "Why does your bill keep growing?",
    cta: "Comment LIST below",
    icon: "shopping cart",
  },
  sleep: {
    look: "broadside",
    sentence: "Screens at night push your sleep back by about one hour.",
    title: "Sleep better tonight",
    short: "Same time daily",
    line: "Light keeps your brain awake",
    word: "Routine",
    kicker: "NIGHT ONE",
    items: ["Dim the lights", "No screens", "Cool room", "Same bedtime", "Less caffeine", "Morning sun"],
    number: 7,
    unit: "hours",
    quote: "Sleep is the first habit to fix",
    person: "Dr. Sam Reed",
    brand: "Rest Lab",
    before: "Late scrolling",
    after: "Lights out",
    question: "Why are you tired all day?",
    cta: "Comment SLEEP below",
    icon: "bed",
  },
};

const words = (s) => String(s ?? "").trim().split(/\s+/).filter(Boolean).length;
const clamp = (x, v) => Math.max(v.min ?? -Infinity, Math.min(v.max ?? Infinity, x));
const NOT_TEXT = /url|src|href|image|img|video|poster|logo_?src|avatar|icon|colou?r|font|ease|cues|exit|svg|path|emoji|seed|direction|align|tone|size|speed|style|texture|preset|variant|mode|theme|shape|kind|^type$|profile|charset|glyph/;

// The topic's words for one variable, or undefined to keep its default.
// Only content goes in: style, timing and media variables keep theirs.
export function fillVar(v, T) {
  const id = v.id.toLowerCase();
  const d = String(v.description ?? "").toLowerCase();
  const def = v.default;
  if (v.role && v.role !== "content") return undefined;
  if (v.type === "number") {
    if (/^(start|from|min)/.test(id)) return v.min !== undefined && v.min > 0 ? undefined : 0;
    if (/(end|^to$|value|target|count|number|percent|score|stat|amount|total|progress)/.test(id)) return clamp(T.number, v);
    return undefined;
  }
  if (v.type !== "string" || NOT_TEXT.test(id) || /(one of|file name|name of the|texture|asset)/.test(d)) return undefined;
  const sep = typeof def === "string" && def.includes("|") ? "|" : ",";
  if (/comma|separated|one per|list of|pipe/.test(d) || (typeof def === "string" && def.split(sep).length > 2)) {
    const n = typeof def === "string" ? def.split(sep).filter((x) => x.trim()).length : 4;
    return T.items.slice(0, Math.max(2, Math.min(6, n || 4))).join(sep);
  }
  if (/prefix/.test(id)) return undefined;
  if (/suffix|unit/.test(id)) return typeof def === "string" && def.trim() ? T.unit : undefined;
  if (/quote|testimonial/.test(id)) return T.quote;
  if (/wordmark|brand|company|product|logo/.test(id)) return T.brand;
  if (/author|person|^name$|handle|byline|speaker/.test(id)) return T.person;
  if (/button|cta|action/.test(id)) return T.cta;
  if (/question/.test(id)) return T.question;
  if (/before|old|wrong|left|^from/.test(id)) return T.before;
  if (/after|new|right|^to_/.test(id)) return T.after;
  if (/kicker|eyebrow|label|tag|chip|badge|category/.test(id)) return T.kicker;
  const n = words(def);
  if (n <= 1) return T.word;
  if (n <= 3) return T.short;
  if (n <= 7) return T.line;
  return T.sentence;
}

export function testVars(item, T) {
  const vars = {};
  for (const v of item.variables ?? []) {
    if (["exit", "cues", "accent"].includes(v.id)) continue;
    const x = fillVar(v, T);
    if (x !== undefined) vars[v.id] = x;
  }
  return vars;
}

// The scene length: the component's own length, at least 5 s, at most 8 s.
export function sceneSeconds(html) {
  const m = /<div[^>]*\bid="root"[^>]*\bdata-duration="([\d.]+)"/.exec(html) ?? /data-composition-duration="([\d.]+)"/.exec(html) ?? /data-composition-id="[^"]+"[^>]*\bdata-duration="([\d.]+)"/.exec(html);
  return Math.min(8, Math.max(5, Number(m?.[1] ?? 5)));
}

function ffmpeg(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(env.HYPERFRAMES_FFMPEG_PATH, ["-hide_banner", "-loglevel", "error", "-y", ...args], { windowsHide: true });
    let err = "";
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err.slice(-300)))));
  });
}

const tail = (t, n = 4) => String(t ?? "").split("\n").filter(Boolean).slice(-n).join(" | ").slice(0, 600);

// One component, one topic: a project folder, the build, and every test.
export async function testOne(name, topicId, { work, env, browser, render = true }) {
  const T = TOPICS[topicId];
  const dir = path.join(work, "projects", `${topicId}-${name}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, "audio"), { recursive: true });
  const rec = { component: name, topic: topicId, look: T.look, vars: null, seconds: null, build: null, lint: null, check: null, stills: [], render: null };
  const t0 = Date.now();
  try {
    const comp = loadComponent(name, { env });
    const seconds = sceneSeconds(comp.html);
    rec.seconds = seconds;
    rec.vars = testVars(comp.item, T);
    const ws = T.sentence.split(/\s+/);
    const sentences = [{ id: "S1", start: 0.2, end: seconds - 0.3, dur: seconds - 0.5, words: ws.length, text: T.sentence }];
    fs.writeFileSync(path.join(dir, "sentences.json"), JSON.stringify(sentences));
    fs.writeFileSync(path.join(dir, "words.json"), JSON.stringify(ws.map((w, i) => ({ text: w, start: 0.2 + ((seconds - 0.8) * i) / ws.length, end: 0.2 + ((seconds - 0.8) * (i + 1)) / ws.length }))));
    fs.writeFileSync(path.join(dir, "scenes.json"), JSON.stringify({ scenes: [{ component: name, from: "S1", vars: rec.vars, ...(name === "whiteboard-ink" ? { icon: T.icon } : {}) }] }));
    await ffmpeg(["-f", "lavfi", "-i", `anullsrc=r=44100:cl=stereo`, "-t", String(seconds), "-b:a", "64k", path.join(dir, "audio", "vo_bgm.mp3")], env);
    await assemble(dir, { env, total: seconds, language: "en", title: T.title, look: T.look, motion: null });
    rec.build = { ok: true };
  } catch (e) {
    rec.build = { ok: false, error: e.message.slice(0, 600) };
    rec.ms = Date.now() - t0;
    return rec;
  }
  const out = path.join(dir, "build");
  const lint = await runHyperframes(["lint", "--json"], { env, cwd: out, browser });
  const lintReport = readCheckReport(lint.stdout ?? "");
  rec.lint = { code: lint.code, errors: (lintReport?.findings ?? []).filter((f) => f.severity === "error").map((f) => `${f.code}: ${f.message}`.slice(0, 300)), warnings: (lintReport?.findings ?? []).filter((f) => f.severity === "warning").length, tail: lint.code ? tail(lint.tail) : undefined };
  const started = Date.now();
  // judged once the scene has landed, as the app's build gate does
  // (gates/build lintAndCheck, landedTimes: 0.2 s before the end)
  const check = await runHyperframes(["check", "--json", "--at", String(Math.round((rec.seconds - 0.2) * 100) / 100)], { env, cwd: out, browser });
  const report = readCheckReport(check.stdout ?? "") ?? savedCheckReport(out, started);
  const errors = [];
  for (const section of ["lint", "runtime", "layout", "motion", "contrast"]) {
    for (const f of report?.[section]?.findings ?? []) if (f.severity === "error") errors.push(`${section} ${f.code ?? ""}: ${f.message ?? ""}`.slice(0, 300));
  }
  rec.check = { code: check.code, readable: Boolean(report), errors, tail: report ? undefined : tail(check.tail) };
  const s = rec.seconds;
  const at = [0.8, Math.round((s / 2) * 100) / 100, Math.round((s - 0.25) * 100) / 100];
  const shots = path.join(dir, "stills");
  const snap = await runHyperframes(["snapshot", "-o", shots, "--at", at.join(","), "--no-end", "--describe", "false"], { env, cwd: out, browser });
  rec.stills = fs.existsSync(shots) ? fs.readdirSync(shots).filter((f) => f.endsWith(".png")).sort((a, b) => a.localeCompare(b, "en", { numeric: true })).map((f) => path.join(shots, f)) : [];
  if (snap.code !== 0) rec.stillsError = tail(snap.tail);
  if (render) {
    const file = path.join(dir, "render.mp4");
    const r = await runHyperframes(["render", "-o", file, "--quality", "draft", "--fps", "15", "--workers", "1"], { env, cwd: out, browser });
    rec.render = { ok: r.code === 0 && fs.existsSync(file), code: r.code, bytes: fs.existsSync(file) ? fs.statSync(file).size : 0, tail: r.code ? tail(r.tail) : undefined };
  }
  rec.ms = Date.now() - t0;
  return rec;
}

// Contact sheets: 8 components a sheet, a row of three stills each.
export async function sheets(records, { work, env }) {
  const dir = path.join(work, "sheets");
  fs.mkdirSync(dir, { recursive: true });
  for (const topic of Object.keys(TOPICS)) {
    const rows = records.filter((r) => r.topic === topic).sort((a, b) => a.component.localeCompare(b.component));
    for (let k = 0; k * 8 < rows.length; k++) {
      const part = rows.slice(k * 8, k * 8 + 8);
      const list = [];
      for (const r of part) {
        const three = r.stills.length === 3 ? r.stills : [0, 1, 2].map((i) => r.stills[i] ?? null);
        for (const f of three) list.push(f ?? path.join(work, "blank.png"));
      }
      const listFile = path.join(dir, `${topic}-${k + 1}.list`);
      fs.writeFileSync(listFile, list.map((f) => `file '${f.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n") + "\n");
      await ffmpeg(["-f", "concat", "-safe", "0", "-i", listFile, "-vf", `scale=400:-1,tile=3x${part.length}:padding=4:margin=4:color=0x808080`, "-frames:v", "1", path.join(dir, `${topic}-${k + 1}.png`)], env);
      fs.writeFileSync(path.join(dir, `${topic}-${k + 1}.txt`), part.map((r, i) => `${i + 1}. ${r.component}`).join("\n") + "\n");
      for (const r of part) r.sheet = `${topic}-${k + 1}.png row ${part.indexOf(r) + 1}`;
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values: args } = parseArgs({ options: { work: { type: "string" }, only: { type: "string" }, jobs: { type: "string", default: "4" }, "no-render": { type: "boolean" }, "sheets-only": { type: "boolean" } } });
  if (!args.work) {
    console.error("Usage: node scripts/catalog/test-components.mjs --work <dir> [--only a,b] [--jobs 4] [--no-render]");
    process.exit(2);
  }
  const env = { ...process.env };
  const exe = process.platform === "win32" ? ".exe" : "";
  env.HYPERFRAMES_FFMPEG_PATH ??= path.join(ROOT, "app", "src-tauri", "ffmpeg", `ffmpeg${exe}`);
  env.HYPERFRAMES_FFPROBE_PATH ??= path.join(ROOT, "app", "src-tauri", "ffmpeg", `ffprobe${exe}`);
  const browser = resolveBrowser(env);
  if (!browser) {
    console.error("No render browser. Use the app's Download now first.");
    process.exit(1);
  }
  const work = path.resolve(args.work);
  fs.mkdirSync(work, { recursive: true });
  const resultsFile = path.join(work, "results.json");
  const done = fs.existsSync(resultsFile) ? JSON.parse(fs.readFileSync(resultsFile, "utf8")) : [];
  const all = JSON.parse(fs.readFileSync(path.join(libraryDir(env), "LIBRARY.json"), "utf8")).components;
  const names = args.only ? args.only.split(",") : all;
  if (!fs.existsSync(path.join(work, "blank.png"))) await ffmpeg(["-f", "lavfi", "-i", "color=c=0x404040:s=1920x1080", "-frames:v", "1", path.join(work, "blank.png")], env);
  const jobs = [];
  for (const name of names) for (const topic of Object.keys(TOPICS)) jobs.push([name, topic]);
  const records = done.filter((r) => !jobs.some(([n, t]) => n === r.component && t === r.topic));
  if (!args["sheets-only"]) {
    let next = 0;
    const save = () => fs.writeFileSync(resultsFile, JSON.stringify(records, null, 1));
    const worker = async () => {
      while (next < jobs.length) {
        const [name, topic] = jobs[next++];
        const r = await testOne(name, topic, { work, env, browser: browser.path, render: !args["no-render"] });
        records.push(r);
        save();
        const bad = [!r.build?.ok && "build", r.lint?.code && "lint", r.check?.errors?.length && "check", r.stills.length < 3 && "stills", r.render && !r.render.ok && "render"].filter(Boolean);
        console.log(`${next}/${jobs.length} ${name} ${topic}: ${bad.length ? bad.join(",") : "ok"} (${Math.round((r.ms ?? 0) / 1000)} s)`);
      }
    };
    await Promise.all(Array.from({ length: Number(args.jobs) }, worker));
  }
  await sheets(records, { work, env });
  fs.writeFileSync(resultsFile, JSON.stringify(records, null, 1));
  console.log(`results: ${resultsFile}`);
}
