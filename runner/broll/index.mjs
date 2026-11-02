// broll/index.mjs: AI B-roll for one ONE Video (docs/ai-broll.md, DECISIONS
// 94, 95, 98). The Scenes tab's "Make B-roll clips":
//
//   1. plan      the AI picks a few stretches of narration that name something
//                visible and writes a picture description for each (or takes a
//                clip from the Identity's AI B-roll library, free)
//   2. estimate  what the new clips cost, against the video's limit (capUsd)
//   3. make      orders the clips with the user's key, waits, downloads them
//                into the ONE Video (broll/clips/) and the Identity's footage
//                library ("generated"), and lays them under their sentences in
//                the scene table (scenes.json footage, like the user's own
//                footage, DECISIONS 82); the HyperFrames render does the rest
//
//   <project>/broll/broll.json    the plan, the state of every clip, the money
//   <project>/broll/pending.json  orders placed and not downloaded yet: a run
//                                 that failed, was stopped or slept picks them
//                                 up instead of ordering again (DECISIONS 91)
//
// The app never spends above the limit by itself: an order over it is
// refused unless the user said yes to that amount (allowOverCap).

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { chat, extractJson } from "../providers/llm.mjs";
import { patiently } from "../providers/retry.mjs";
import { sceneRows, writeTable, callSentences } from "../gates/scenes/index.mjs";
import { loadLibrary, footageDir, addClip, incomingFootage } from "../footage/library.mjs";
import { generatorOf, orderSeconds, usdFor, aspectOf } from "../generate/index.mjs";
import { promptRefusal } from "../generate/kie.mjs";
import { loadSettings } from "./settings.mjs";
import { appendLog } from "../project.mjs";

export const BROLL_SCHEMA = "itv-broll/1";
const REPAIRS = 2;
const PROMPT_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "prompt.md");
const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;

export const brollDir = (projectDir) => path.join(projectDir, "broll");
const planFile = (projectDir) => path.join(brollDir(projectDir), "broll.json");
const pendingFile = (projectDir) => path.join(brollDir(projectDir), "pending.json");

const readJson = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
};
function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2) + "\n");
  fs.renameSync(`${file}.tmp`, file);
}

export const voBytes = (projectDir) => {
  try {
    return fs.statSync(path.join(projectDir, "audio", "vo.mp3")).size;
  } catch {
    return null;
  }
};

export function loadPlan(projectDir) {
  const plan = readJson(planFile(projectDir), null);
  if (!plan?.items) return null;
  return { ...plan, stale: plan.voBytes !== voBytes(projectDir) };
}
export const savePlan = (projectDir, plan) => {
  const { stale, ...clean } = plan;
  writeJsonAtomic(planFile(projectDir), clean);
};

// The footage time of a stretch: from its first sentence to the start of the
// sentence after its last one, at most 0.6 s after the last word (the same
// rule the build uses, assemble.mjs footagePlan).
export function stretchOf(sentences, from, to) {
  const ids = sentences.map((s) => s.id);
  const a = ids.indexOf(from);
  const b = ids.indexOf(to ?? from);
  if (a < 0 || b < a) return null;
  const end = Math.min(sentences[b + 1]?.start ?? Infinity, sentences[b].end + 0.6);
  return { start: sentences[a].start, seconds: r3(end - sentences[a].start), said: sentences.slice(a, b + 1).map((s) => s.text).join(" ") };
}

// The Identity's generated clips the planner may take again (free). Test
// clips only while the test generator is on.
export const libraryForPlanner = (lib, { test = false, aspect = "16:9" } = {}) =>
  (lib?.clips ?? [])
    .filter((c) => c.source === "generated" && c.description && (test || !c.generated?.test) && (c.generated?.aspect ?? "16:9") === aspect)
    .map((c) => ({ id: c.id, about: c.description, seconds: c.seconds }));

// The scenes a clip may go in: not the first or the last (the title and the
// close, where the avatar usually speaks), not a comment call, not one with
// the user's own footage already.
export function eligibleScenes(rows, { brollClips = new Set() } = {}) {
  return rows.filter((r, i) => i > 0 && i < rows.length - 1 && !r.call && r.component !== "cta-close" && (!r.footage || brollClips.has(r.footage)) && r.start !== null);
}

export const maxClips = (sceneCount) => Math.floor(sceneCount / 3);

// The AI's answer, checked. Returns the issues (empty: good).
export function planIssues(answer, { rows, eligible, sentences, max, library = [], minSeconds = 2, maxSeconds = 15, needsPrompt = () => true }) {
  if (!answer || !Array.isArray(answer.clips)) return ["answer with { \"clips\": [...] }"];
  const issues = [];
  const allowed = new Map(eligible.map((r) => [r.index + 1, r]));
  const known = new Set(library.map((c) => c.id));
  const ids = sentences.map((s) => s.id);
  if (answer.clips.length > max) issues.push(`at most ${max} clips`);
  const scenes = [];
  const usedLib = new Set();
  answer.clips.forEach((c, n) => {
    const at = `clip ${n + 1}`;
    const row = allowed.get(Number(c?.scene));
    if (!row) return issues.push(`${at}: scene ${c?.scene} is not in DATA scenes`);
    const from = ids.indexOf(c.from);
    const to = ids.indexOf(c.to ?? c.from);
    if (from < ids.indexOf(row.from) || to > ids.indexOf(row.to) || to < from) return issues.push(`${at}: from and to must be sentence ids of scene ${row.index + 1}, in order`);
    const s = stretchOf(sentences, c.from, c.to ?? c.from);
    if (s.seconds < minSeconds || s.seconds > maxSeconds) issues.push(`${at}: covers ${s.seconds} s of narration, it must be ${minSeconds} to ${maxSeconds} s`);
    if (scenes.includes(row.index)) issues.push(`${at}: scene ${row.index + 1} already has a clip`);
    if (scenes.some((x) => Math.abs(x - row.index) < 2)) issues.push(`${at}: scene ${row.index + 1} is next to a scene with a clip`);
    scenes.push(row.index);
    if (c.library) {
      if (!known.has(c.library)) issues.push(`${at}: unknown library clip ${c.library}`);
      else if (usedLib.has(c.library)) issues.push(`${at}: library clip ${c.library} is used twice`);
      usedLib.add(c.library);
    } else if (needsPrompt(c)) {
      const p = String(c.prompt ?? "").trim();
      const words = p.split(/\s+/).filter(Boolean).length;
      if (words < 15 || words > 160) issues.push(`${at}: the prompt must have 30 to 120 words (it has ${words})`);
    }
  });
  if (!rows.length) issues.push("there is no scene table");
  return issues;
}

function brandOf(identity = {}) {
  const c = identity.card?.colors ?? {};
  return { appearance: identity.card?.appearance ?? null, colors: { background: c.background ?? null, primary: c.primary ?? null, secondary: c.secondary ?? null }, mood: identity.mood ?? null };
}

// 1. The plan. llm = { provider, apiKey, model, effort, fetchImpl?, sleep? }.
// `identity`: { card, mood } for the look of the clips; `library`: the
// Identity's footage library (footage/library.mjs loadLibrary).
export async function planBroll({ llm, projectDir, settings, identity = {}, library = null, language = "en", onProgress = () => {} }) {
  const sentences = readJson(path.join(projectDir, "sentences.json"), null);
  if (!sentences?.length) throw new Error("There is no sentence table yet. Make the voice first.");
  const { rows } = await sceneRows(projectDir);
  if (!rows.length) throw new Error("There is no scene table yet. Plan the scenes first.");
  if (rows.some((r) => r.start === null)) throw new Error("The scene table was made for an earlier voice. Plan the scenes again first.");
  const table = readJson(path.join(projectDir, "scenes.json"), {});
  const before = loadPlan(projectDir);
  const brollClips = new Set((before?.items ?? []).map((i) => i.clip).filter(Boolean));
  const eligible = eligibleScenes(rows, { brollClips });
  const max = maxClips(rows.length);
  const g = generatorOf(settings.generator);
  const aspect = aspectOf(table);
  const lib = libraryForPlanner(library, { test: !!g.test, aspect });
  const plan = { schema: BROLL_SCHEMA, voBytes: voBytes(projectDir), aspect, spentUsd: before?.spentUsd ?? 0, items: [], at: new Date().toISOString() };
  if (!eligible.length || !max) {
    savePlan(projectDir, plan);
    return { plan: loadPlan(projectDir), note: "This video has no scene a clip could go in (the first and the last scene, the comment calls and your own footage stay as they are)." };
  }
  const data = {
    language,
    format: aspect === "9:16" ? "9:16 portrait" : "16:9 landscape",
    brand: brandOf(identity),
    max,
    scenes: eligible.map((r) => {
      const ids = sentences.map((s) => s.id);
      return { scene: r.index + 1, shows: r.label, sentences: sentences.slice(ids.indexOf(r.from), ids.indexOf(r.to) + 1).map((s) => ({ id: s.id, text: s.text, seconds: r2(s.end - s.start) })) };
    }),
    library: lib,
  };
  const messages = [
    { role: "system", content: fs.readFileSync(PROMPT_FILE, "utf8") },
    { role: "user", content: `DATA:\n${JSON.stringify(data, null, 1)}` },
  ];
  const check = (a) => planIssues(a, { rows, eligible, sentences, max, library: lib });
  onProgress({ step: "planning", provider: llm.provider });
  let text = await chat({ ...llm, messages, json: true, temperature: 0.5, onProgress });
  let answer = null;
  let issues;
  const read = () => {
    try {
      answer = extractJson(text);
      issues = check(answer);
    } catch (e) {
      issues = [`the answer was not valid JSON (${e.message})`];
    }
  };
  read();
  for (let n = 1; n <= REPAIRS && issues.length; n++) {
    onProgress({ step: "repairing", round: n, of: REPAIRS, issues: issues.slice(0, 10) });
    messages.push({ role: "assistant", content: text }, { role: "user", content: `Fix these problems and answer with the corrected JSON object only:\n- ${issues.slice(0, 20).join("\n- ")}` });
    text = await chat({ ...llm, messages, json: true, temperature: 0.2, onProgress });
    read();
  }
  if (issues.length) throw new Error(`The B-roll plan did not pass the checks after ${REPAIRS} repairs: ${issues.slice(0, 4).join("; ")}. Press the button again.`);
  plan.items = answer.clips.map((c, n) => {
    const s = stretchOf(sentences, c.from, c.to ?? c.from);
    const fromLib = c.library ? library.clips.find((x) => x.id === c.library) : null;
    return {
      id: `b${n + 1}`,
      scene: Number(c.scene) - 1,
      from: c.from,
      to: c.to ?? c.from,
      said: s.said,
      start: s.start,
      seconds: s.seconds,
      order: orderSeconds(s.seconds, settings.generator),
      prompt: fromLib ? fromLib.description : String(c.prompt).replace(/\s+/g, " ").trim(),
      library: fromLib ? fromLib.id : null,
      use: true,
      state: "planned",
      attempt: 0,
    };
  });
  savePlan(projectDir, plan);
  return { plan: loadPlan(projectDir) };
}

// What a run would order: chosen, not made yet, not from the library.
// In the B-roll engine's plan (plan.auto) only an AI row the user approved.
const toOrder = (plan, ids = null) => plan.items.filter((i) => i.use && !i.library && i.state !== "done" && (!plan.auto || (i.source === "ai" && i.approved)) && (!ids || ids.includes(i.id)));

// 2. The estimate, against the video's limit.
export function estimateBroll({ projectDir, settings, ids = null }) {
  const plan = loadPlan(projectDir);
  if (!plan) return { items: 0, fromLibrary: 0, seconds: 0, usd: 0, capUsd: settings.capUsd, spentUsd: 0, leftUsd: settings.capUsd, overCap: false };
  const pending = readJson(pendingFile(projectDir), {});
  const g = generatorOf(settings.generator);
  const items = toOrder(plan, ids);
  // an order placed already is paid: it costs nothing more
  const fresh = items.filter((i) => !pending[orderKey(projectDir, i, settings, plan.aspect)]);
  const seconds = fresh.reduce((t, i) => t + i.order, 0);
  const usd = g.usdPerClip !== undefined ? r2(fresh.length * usdFor(0, settings)) : usdFor(seconds, settings);
  const spent = plan.spentUsd ?? 0;
  return {
    generator: settings.generator,
    generatorLabel: g.label,
    test: !!g.test,
    quality: settings.quality,
    items: items.length,
    pending: items.length - fresh.length,
    fromLibrary: plan.items.filter((i) => i.use && i.library && i.state !== "done").length,
    seconds,
    usd,
    capUsd: settings.capUsd,
    spentUsd: r2(spent),
    leftUsd: r2(Math.max(0, settings.capUsd - spent)),
    overCap: usd > 0 && spent + usd > settings.capUsd + 0.001,
  };
}

// A user's change to one row: its picture description, or the tick.
export function updateItem(projectDir, id, { prompt, use } = {}) {
  const plan = loadPlan(projectDir);
  const item = plan?.items.find((i) => i.id === id);
  if (!item) throw new Error("There is no such B-roll clip.");
  if (typeof prompt === "string") {
    const p = prompt.replace(/\s+/g, " ").trim().slice(0, 2000);
    if (!p) throw new Error("The picture description is empty.");
    const why = plan.auto ? promptRefusal(p) : null;
    if (why) throw new Error(why);
    if (p !== item.prompt) {
      item.prompt = p;
      // a library clip with new words is a new clip
      item.library = null;
    }
  }
  if (typeof use === "boolean") item.use = use;
  savePlan(projectDir, plan);
  if (typeof use === "boolean") attach(projectDir);
  return loadPlan(projectDir);
}

// "Make again": a new order for a clip already made (a new price).
export function againItem(projectDir, id, { prompt } = {}) {
  const plan = loadPlan(projectDir);
  const item = plan?.items.find((i) => i.id === id);
  if (!item) throw new Error("There is no such B-roll clip.");
  if (typeof prompt === "string" && prompt.trim()) item.prompt = prompt.replace(/\s+/g, " ").trim().slice(0, 2000);
  Object.assign(item, { state: "planned", clip: null, library: null, use: true, error: null, attempt: (item.attempt ?? 0) + 1 });
  savePlan(projectDir, plan);
  attach(projectDir);
  return loadPlan(projectDir);
}

// "Remove": the clip leaves this video; it stays in the library.
export function removeItem(projectDir, id) {
  const plan = loadPlan(projectDir);
  const item = plan?.items.find((i) => i.id === id);
  if (!item) throw new Error("There is no such B-roll clip.");
  item.use = false;
  savePlan(projectDir, plan);
  attach(projectDir);
  return loadPlan(projectDir);
}

// Lays the made, chosen clips under their sentences in scenes.json (footage),
// replacing any other footage over the same sentences. Clips of this plan
// that are not chosen any more leave the table. Returns how many are in.
export function attach(projectDir) {
  const plan = loadPlan(projectDir);
  const tableFile = path.join(projectDir, "scenes.json");
  if (!plan || plan.stale || !fs.existsSync(tableFile)) return 0;
  const table = readJson(tableFile, null);
  const sentences = readJson(path.join(projectDir, "sentences.json"), []);
  if (!table?.scenes) return 0;
  const ids = sentences.map((s) => s.id);
  let script = null;
  try {
    script = JSON.parse(fs.readFileSync(path.join(projectDir, "script.json"), "utf8"));
  } catch {
    // no script.json: no comment calls to keep clear of
  }
  const calls = callSentences(script, sentences);
  const mine = new Set(plan.items.map((i) => i.clip).filter(Boolean));
  const span = (f) => [ids.indexOf(f.from), ids.indexOf(f.to ?? f.from)];
  const wanted = plan.items
    .filter((i) => i.use && i.state === "done" && i.clip)
    .filter((i) => {
      const [a, b] = span(i);
      if (a < 0 || b < a) return false;
      for (let k = a; k <= b; k++) if (calls.has(ids[k])) return false;
      return true;
    })
    .map((i) => ({ from: i.from, ...(i.to !== i.from ? { to: i.to } : {}), clip: i.clip, ...(Number.isFinite(i.at) ? { at: i.at } : {}), ...(Number.isFinite(i.until) ? { until: i.until } : {}) }));
  const hits = (f) => wanted.some((w) => {
    const [a, b] = span(w);
    const [c, d] = span(f);
    return c <= b && d >= a;
  });
  const others = (table.footage ?? []).filter((f) => !mine.has(f.clip) && !hits(f));
  const footage = [...others, ...wanted].sort((x, y) => ids.indexOf(x.from) - ids.indexOf(y.from));
  const next = { ...table };
  if (footage.length) next.footage = footage;
  else delete next.footage;
  if (JSON.stringify(next.footage ?? []) !== JSON.stringify(table.footage ?? [])) writeTable(projectDir, next);
  return wanted.length;
}

// The idempotency key of one order: the same clip asked for again (a retry,
// a run picked up after a failure) is the same order at HeyGen.
const orderKey = (projectDir, item, settings, aspect) =>
  createHash("sha256").update(JSON.stringify({ p: path.basename(projectDir), id: item.id, a: item.attempt ?? 0, prompt: item.prompt, s: item.order, q: settings.quality, g: settings.generator, aspect })).digest("hex").slice(0, 40);

// 3. Make the clips. `ids`: only these rows (Make again), else every chosen
// row not made yet. Returns { plan, made, failed, fromLibrary, placed, kept }.
//
// pending.json is keyed by the order's key (orderKey), not by the row: an
// order placed for an earlier plan (planned again while HeyGen worked, or a
// new voice) is never lost. Such an order is picked up on the next run and
// kept in the library, free, even when no row of the new plan wants it.
export async function makeBroll({ projectDir, identityDir, apiKey, settings, ids = null, allowOverCap = false, fetchImpl = fetch, sleep, parallax = null, env = process.env, onProgress = () => {}, onSpend = () => {} }) {
  const plan = loadPlan(projectDir);
  if (!plan) throw new Error("There is no B-roll plan yet. Click Make B-roll clips.");
  const g = generatorOf(settings.generator);
  const service = g.service ?? "HeyGen";
  if (g.key && !apiKey) throw new Error(`No ${service} API key. Add it in Settings.`);
  const project = path.basename(projectDir);
  const pending = readJson(pendingFile(projectDir), {});
  const savePending = () => (Object.keys(pending).length ? writeJsonAtomic(pendingFile(projectDir), pending) : fs.rmSync(pendingFile(projectDir), { force: true }));
  const keyOf = (item) => orderKey(projectDir, item, settings, plan.aspect);

  // Downloads one order into the ONE Video and the Identity's library.
  const bring = async (key, info, n, of, item = null) => {
    const gen = generatorOf(info.generator);
    const out = path.join(brollDir(projectDir), "clips", `${info.itemId}-${info.attempt ?? 0}.mp4`);
    await gen.module.fetchClip({ apiKey, id: info.id, out, seconds: info.seconds, n: info.scene ?? 0, fetchImpl, ...(sleep ? { sleep } : {}), ...(parallax ? { parallax } : {}), env, onStatus: (status) => onProgress({ step: "broll-clip", status, n, of, scene: (info.scene ?? 0) + 1, ...(info.reused ? { reused: true } : {}) }) });
    const incoming = incomingFootage(".mp4");
    fs.mkdirSync(footageDir(identityDir), { recursive: true });
    fs.copyFileSync(out, path.join(footageDir(identityDir), incoming));
    const clip = await addClip({
      identityDir,
      file: incoming,
      name: `${gen.test ? "Test clip" : "AI clip"}: ${String(info.said ?? "").slice(0, 60)}`,
      description: String(info.prompt ?? "").slice(0, 400),
      source: "generated",
      extra: { generated: { generator: info.generator, label: gen.label, ...(gen.modelName ? { model: gen.modelName } : {}), ...(gen.derived ? { derived: gen.derived } : {}), quality: info.quality, aspect: info.aspect, prompt: info.prompt, seconds: info.seconds, usd: info.usd ?? 0, videoId: info.id, project, ...(gen.test ? { test: true } : {}), at: new Date().toISOString() } },
      env,
    });
    if (item) Object.assign(item, { state: "done", clip: clip.id, file: path.relative(projectDir, out).split(path.sep).join("/"), usd: info.usd ?? 0, error: null });
    delete pending[key];
    savePending();
    return clip;
  };
  // HeyGen gave up on an order: the next run orders it again.
  const gaveUp = (e) => /could not make the B-roll clip/i.test(e.message);
  // Kie AI does not charge a failed clip: its price goes back on the month.
  const refund = (info) => {
    if (info?.generator && generatorOf(info.generator).engineOnly) onSpend(-(info.usd ?? 0), info);
  };

  // Orders of an earlier plan that no row wants now: into the library.
  const wanted = new Set(plan.stale ? [] : toOrder(plan).map(keyOf));
  let kept = 0;
  for (const [key, info] of Object.entries(pending).filter(([k]) => !wanted.has(k))) {
    try {
      await bring(key, { ...info, reused: true }, 1, 1);
      kept++;
    } catch (e) {
      if (!gaveUp(e)) throw e;
      refund(info);
      delete pending[key];
      savePending();
    }
  }
  if (kept) appendLog(projectDir, `broll: ${kept} clip${kept === 1 ? "" : "s"} ordered for an earlier plan kept in the library`);
  if (plan.stale) throw new Error(`The B-roll plan was made for an earlier voice. Plan it again.${kept ? ` ${kept} clip${kept === 1 ? "" : "s"} ordered before ${kept === 1 ? "is" : "are"} in your library now, free to use.` : ""}`);

  const est = estimateBroll({ projectDir, settings, ids });
  if (est.overCap && !allowOverCap) {
    const e = new Error(`These clips cost about ${est.usd.toFixed(2)} USD; this video's B-roll limit is ${settings.capUsd.toFixed(2)} USD and ${est.spentUsd.toFixed(2)} USD is spent. Confirm the higher amount, raise the limit in Identity, Footage, or choose fewer clips.`);
    e.code = "OVER_CAP";
    throw e;
  }
  const retry = { label: service, onRetry: (x) => onProgress({ step: "retry", ...x }), ...(sleep ? { sleep } : {}) };

  // Library clips: free, in at once.
  let fromLibrary = 0;
  const lib = loadLibrary(identityDir);
  for (const item of plan.items.filter((i) => i.use && i.library && i.state !== "done" && (!ids || ids.includes(i.id)))) {
    if (!lib.clips.some((c) => c.id === item.library)) {
      Object.assign(item, { library: null, state: "planned" });
      continue;
    }
    Object.assign(item, { state: "done", clip: item.library, usd: 0, error: null });
    fromLibrary++;
  }
  savePlan(projectDir, plan);

  // Orders: an order placed before for exactly this clip is picked up.
  const jobs = [];
  const items = toOrder(plan, ids);
  for (const [n, item] of items.entries()) {
    const key = keyOf(item);
    if (pending[key]?.id) {
      jobs.push({ item, key, reused: true });
      continue;
    }
    onProgress({ step: "broll-order", n: n + 1, of: items.length, scene: item.scene + 1 });
    const image = item.still ? path.join(projectDir, item.still) : null;
    const id = await patiently(() => g.module.order({ apiKey, prompt: item.prompt, seconds: item.order, quality: settings.quality, aspect: plan.aspect, key, image, fetchImpl }), retry);
    const usd = usdFor(item.order, settings);
    onSpend(usd, { itemId: item.id, generator: settings.generator, id });
    pending[key] = { id, itemId: item.id, attempt: item.attempt ?? 0, scene: item.scene, said: item.said, prompt: item.prompt, seconds: item.order, generator: settings.generator, quality: settings.quality, aspect: plan.aspect, usd, at: new Date().toISOString() };
    savePending();
    Object.assign(item, { state: "ordered", videoId: id, error: null });
    plan.spentUsd = r2((plan.spentUsd ?? 0) + usd);
    savePlan(projectDir, plan);
    jobs.push({ item, key });
  }

  const made = [];
  const failed = [];
  for (const [n, { item, key, reused }] of jobs.entries()) {
    try {
      await bring(key, { ...pending[key], reused }, n + 1, jobs.length, item);
    } catch (e) {
      if (!gaveUp(e)) throw e;
      refund(pending[key]);
      delete pending[key];
      savePending();
      Object.assign(item, { state: "failed", error: e.message });
      savePlan(projectDir, plan);
      failed.push({ id: item.id, error: e.message });
      continue;
    }
    savePlan(projectDir, plan);
    made.push(item.id);
  }
  const placed = attach(projectDir);
  appendLog(projectDir, `broll: ${made.length} made, ${fromLibrary} from the library, ${failed.length} failed, ${placed} in the scene table, spent about ${(plan.spentUsd ?? 0).toFixed(2)} USD${g.test ? " (test clips)" : ""}`);
  if (!made.length && !fromLibrary && !kept && failed.length) throw new Error(failed[0].error);
  return { plan: loadPlan(projectDir), made: made.length, fromLibrary, failed, placed, kept };
}

// Did this video use a generated clip? (YouTube's "altered or synthetic
// content" question, the publish.json syntheticMedia flag.)
export function usesGenerated(projectDir, identityDir) {
  const table = readJson(path.join(projectDir, "scenes.json"), {});
  if (!table.footage?.length || !identityDir) return false;
  const generated = new Set(loadLibrary(identityDir).clips.filter((c) => c.source === "generated" || c.source === "flow").map((c) => c.id));
  return table.footage.some((f) => generated.has(f.clip));
}

export { loadSettings };
