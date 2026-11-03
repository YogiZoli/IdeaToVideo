// reliability.test.mjs: the shared rules of the audit (docs/AUDIT_REPORT.md), fast and with
// no network. `npm run audit` runs the same promises through the whole pipeline.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chat, LlmError, pickModel } from "./providers/llm.mjs";
import { friendlyMessage } from "./friendly.mjs";
import { retrying, stallGuard } from "./net.mjs";
import { ensureRoom, freeBytes, roomForRender } from "./disk.mjs";
import { logError, lastError } from "./errorlog.mjs";
import { healthCheck } from "./health.mjs";
import { renderBrowser } from "./tools.mjs";
import { offlineDraft, newScriptVideo, WRITE_HERE, textProblem } from "./channels/start.mjs";
import { defaultRecipe } from "./channels/recipe.mjs";
import { offlineBrief } from "./research/index.mjs";
import { addNote, loadProject, createProject } from "./project.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `itv-rel-${name}-`));
const noWait = async () => {};
const answer = (status, body, headers = {}) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });
const ok = (text) => answer(200, { choices: [{ message: { content: text } }] });

// ---- every network call has a timeout -------------------------------------------------
test("every fetch in the runner has a timeout or a stall guard", () => {
  const files = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === "presets" || e.name === "fixtures") continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".mjs") && !e.name.endsWith(".test.mjs")) files.push(p);
    }
  };
  walk(here);
  const missing = [];
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    // from each call, the text up to its closing line: `signal` or `timeout` must be in it
    for (const m of text.matchAll(/(?:await |return await |\(await )(?:retrying\()?(?:this\.)?fetchImpl\)?\(/g)) {
      const piece = text.slice(m.index, m.index + 450);
      if (!/signal|timeout/.test(piece)) missing.push(`${path.relative(here, f)}: ${piece.split(/\r?\n/)[0].trim().slice(0, 90)}`);
    }
  }
  assert.deepEqual(missing, []);
});

// ---- a free read tries again, a paid call never -----------------------------------------
test("retrying: a GET tries again on a dropped line and on a busy server, then answers", async () => {
  let n = 0;
  const f = async () => {
    n++;
    if (n === 1) throw new TypeError("fetch failed");
    if (n === 2) return answer(503, "busy");
    return answer(200, "fine");
  };
  const res = await retrying(f, { sleep: noWait })("https://x.test", { timeout: 1000 });
  assert.equal(n, 3);
  assert.equal(await res.text(), "fine");
});

test("retrying: limited, and the last answer stands", async () => {
  let n = 0;
  const res = await retrying(async () => (n++, answer(500, "no")), { sleep: noWait })("https://x.test");
  assert.equal(n, 3);
  assert.equal(res.status, 500);
  n = 0;
  await assert.rejects(retrying(async () => { n++; throw new TypeError("fetch failed"); }, { sleep: noWait })("https://x.test"), /fetch failed/);
  assert.equal(n, 3);
});

test("retrying: a POST is never repeated, it could cost money twice", async () => {
  let n = 0;
  const res = await retrying(async () => (n++, answer(500, "no")), { sleep: noWait })("https://x.test", { method: "POST" });
  assert.equal(n, 1);
  assert.equal(res.status, 500);
});

test("retrying: a refusal is not asked again", async () => {
  let n = 0;
  await retrying(async () => (n++, answer(401, "no")), { sleep: noWait })("https://x.test");
  assert.equal(n, 1);
});

test("stallGuard: nothing arriving aborts, something arriving does not", async () => {
  const g = stallGuard(30);
  await new Promise((r) => setTimeout(r, 15));
  g.touch();
  await new Promise((r) => setTimeout(r, 15));
  assert.equal(g.signal.aborted, false);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(g.signal.aborted, true);
  assert.equal(g.signal.reason.name, "TimeoutError");
  g.done();
});

// ---- the AI chain --------------------------------------------------------------------------
const byHost = (table) => {
  const calls = [];
  const f = async (url) => {
    const host = new URL(url).hostname;
    calls.push(host);
    const act = Object.entries(table).find(([k]) => host.includes(k))?.[1];
    if (act === "down") throw new TypeError("fetch failed");
    if (typeof act === "number") return answer(act, { error: { message: "nope" } });
    if (typeof act === "object") return answer(200, act);
    return ok(act ?? "fine");
  };
  f.calls = calls;
  return f;
};

test("chain: a refused key hands over at once to another saved key", async () => {
  const f = byHost({ generativelanguage: 401, deepseek: "from the other key" });
  const slept = [];
  const text = await chat({ provider: "gemini", apiKey: "k1", model: "m", messages: [], fetchImpl: f, sleep: async (ms) => slept.push(ms), fallbacks: [{ provider: "deepseek", apiKey: "k2" }] });
  assert.equal(text, "from the other key");
  assert.deepEqual(slept, [], "nobody waits when another key can answer");
});

test("chain: a provider with no default model takes the newest from its own list", async () => {
  const f = byHost({ generativelanguage: "down", "api.openai": { data: [{ id: "whisper-1", created: 9 }, { id: "gpt-old", created: 1 }, { id: "gpt-new", created: 5 }], choices: [{ message: { content: "from openai" } }] } });
  assert.equal(await pickModel({ provider: "openai", apiKey: "k", fetchImpl: f }), "gpt-new");
  const text = await chat({ provider: "gemini", apiKey: "k1", model: "m", messages: [], fetchImpl: f, sleep: noWait, fallbacks: [{ provider: "openai", apiKey: "k2" }] });
  assert.equal(text, "from openai");
});

test("chain: nobody answers, one sentence that names them, marked offline", async () => {
  const f = byHost({ generativelanguage: 401, deepseek: 401, openrouter: "down" });
  await assert.rejects(chat({ provider: "gemini", apiKey: "secret-one", model: "m", messages: [], fetchImpl: f, sleep: noWait, fallbacks: [{ provider: "deepseek", apiKey: "secret-two" }, { provider: "openrouter", apiKey: "secret-3" }] }), (e) => {
    assert.ok(e instanceof LlmError);
    assert.equal(e.offline, true);
    assert.match(e.message, /None of your AI services answered right now \(Gemini, DeepSeek, OpenRouter\)/);
    assert.ok(!/secret/.test(e.message));
    return true;
  });
});

test("chain: with no other key the error is the provider's own sentence, marked offline", async () => {
  const f = byHost({ generativelanguage: 401 });
  await assert.rejects(chat({ provider: "gemini", apiKey: "k", model: "m", messages: [], fetchImpl: f, sleep: noWait, fallbacks: [] }), (e) => e.offline === true && /rejected the API key/.test(e.message));
});

test("chain: no connection does not wait three minutes", async () => {
  const f = byHost({ generativelanguage: "down" });
  const slept = [];
  await assert.rejects(chat({ provider: "gemini", apiKey: "k", messages: [], fetchImpl: f, sleep: async (ms) => slept.push(ms), fallbacks: [] }));
  assert.equal(slept.reduce((a, b) => a + b, 0) < 30000, true, `waited ${slept}`);
  assert.equal(new Set(f.calls).size, 1);
});

test("chain: a key test never hands over", async () => {
  const f = byHost({ generativelanguage: 401, deepseek: "x" });
  await assert.rejects(chat({ provider: "gemini", apiKey: "k", model: "m", messages: [], fetchImpl: f, sleep: noWait, patient: false, fallbacks: [{ provider: "deepseek", apiKey: "k2" }] }), /rejected the API key/);
});

// ---- plain sentences -------------------------------------------------------------------------
test("friendly: what only a program can read becomes one sentence", () => {
  const cases = [
    [new TypeError("Cannot read properties of undefined (reading 'x')"), /inside the app/],
    [Object.assign(new SyntaxError("Unexpected token < in JSON at position 0")), /inside the app/],
    ["fetch failed", /internet connection may be down/],
    ["Could not reach Gemini: fetch failed", /Could not reach Gemini\. The internet/],
    ["connect ECONNREFUSED 127.0.0.1:443", /internet connection may be down/],
    ["ENOSPC: no space left on device, write", /disk is full/],
    ["EACCES: permission denied, open 'C:/x'", /locked or not allowed/],
    ["EBUSY: resource busy or locked, rename 'a'", /locked or not allowed/],
    ["ENOENT: no such file or directory, open 'C:/x'", /is missing/],
    ["ENAMETOOLONG: name too long", /path is too long/],
    ["The operation was aborted due to timeout", /did not answer in time/],
    ["project.json is not valid: $.gates missing", /damaged/],
    ["The render failed: frame 12 ffmpeg exited 1", /The render stopped/],
    ["ffmpeg failed (1): Invalid data", /Check that the file plays/],
    ["spawn UNKNOWN", /would not start/],
    ["Could not reach Claude: request ended without sending any chunks", /^Could not reach Claude\. The internet/],
    ["The render browser could not be downloaded. Check the internet connection and press the button again; nothing is lost. Details: ERR_X at y.js:1:2", /^The render browser could not be downloaded\. Check the internet connection and press the button again; nothing is lost\.$/],
    ["", /without saying why/],
    [undefined, /without saying why/],
    ["[object Object]", /inside the app/],
    ["Error: boom\n    at x (y.js:1:2)", /inside the app/],
  ];
  for (const [raw, want] of cases) assert.match(friendlyMessage(raw), want, String(raw));
});

test("friendly: our own error types never show their name", () => {
  assert.equal(friendlyMessage(new LlmError("Gemini rejected the API key. Check it in Settings.")), "Gemini rejected the API key. Check it in Settings.");
  class BusyError extends Error {
    constructor(m) {
      super(m);
      this.name = "BusyError";
    }
  }
  assert.equal(friendlyMessage(new BusyError("HeyGen is busy. Try again later.")), "HeyGen is busy. Try again later.");
  assert.match(friendlyMessage(new TypeError("x is not a function")), /inside the app/);
  assert.match(friendlyMessage(new DOMException("timed", "TimeoutError")), /did not answer in time/);
});

test("friendly: our own sentence stays, and a program's words inside it go", () => {
  const own = "The script is empty.";
  assert.equal(friendlyMessage(own), own);
  const m = friendlyMessage("The CTA profile cannot be used: Expected property name in JSON at position 2 Open Wizards, CTA to fix it.");
  assert.match(m, /^The CTA profile cannot be used\./);
  assert.ok(!/JSON at position/.test(m));
  assert.ok(friendlyMessage("x".repeat(3000)).length < 600);
});

test("the error log has what a person needs, never a key", () => {
  const env = { ITV_DATA_DIR: tmp("log") };
  const e = new TypeError("boom sk-abcdefghijklmnopqrstuvwxyz with my-own-secret-key");
  logError({ command: "render-video", message: "A sentence.", error: e, secrets: ["my-own-secret-key"], env });
  const { entry, file } = lastError(env);
  assert.equal(entry.command, "render-video");
  assert.match(entry.stack, /TypeError/);
  assert.ok(!/abcdefghijklmnop|my-own-secret-key/.test(JSON.stringify(entry)), JSON.stringify(entry));
  assert.ok(fs.existsSync(file));
});

// ---- disk space --------------------------------------------------------------------------------
test("disk: enough room says nothing, too little says how much, unknown never stops", () => {
  const dir = tmp("disk");
  assert.ok(freeBytes(path.join(dir, "not", "yet", "there")) > 0);
  ensureRoom(dir, 1, "a test");
  assert.throws(() => ensureRoom(dir, Number.MAX_SAFE_INTEGER, "the finished video"), /not enough free disk space for the finished video/);
  assert.ok(roomForRender(8 * 60) > 1024 ** 3);
});

// ---- offline ------------------------------------------------------------------------------------
test("offline: a topic gets a skeleton that cannot be read aloud, notes become the draft", () => {
  const projectsDir = tmp("off");
  const recipe = defaultRecipe({});
  const topic = newScriptVideo({ projectsDir, identity: "x", recipe, topic: "Trains" });
  const a = offlineDraft(topic.dir);
  assert.ok(a.markdown.includes(WRITE_HERE));
  assert.equal(loadProject(topic.dir).gates.script.state, "pending");
  const notes = newScriptVideo({ projectsDir, identity: "x", recipe, text: "My own words about trains.", textKind: "notes" });
  const b = offlineDraft(notes.dir);
  assert.ok(b.markdown.includes("My own words about trains."));
  assert.ok(!b.markdown.includes(WRITE_HERE));
});

test("offline: bad text is refused in a sentence", () => {
  const projectsDir = tmp("bad");
  const recipe = defaultRecipe({});
  assert.throws(() => newScriptVideo({ projectsDir, recipe, text: "... !!!", textKind: "finished" }), /no words/);
  assert.match(textProblem("x".repeat(100001)), /too long/);
  assert.equal(textProblem("short"), null);
});

test("offline: the brief says nothing was checked", () => {
  const b = offlineBrief({ topic: "Trains", reason: "no key" });
  assert.equal(b.offline, true);
  assert.equal(b.grounded, false);
  assert.deepEqual(b.sources, []);
  assert.match(b.warnings[0], /nothing was checked/);
});

test("a note replaces the old one of its kind, and never fails a step", () => {
  const { dir } = createProject({ projectsDir: tmp("note"), title: "T" });
  addNote(dir, "voice", "first");
  addNote(dir, "music", "other");
  addNote(dir, "voice", "second");
  assert.deepEqual(loadProject(dir).notes.map((n) => n.text), ["other", "second"]);
  addNote(path.join(dir, "gone"), "voice", "no crash");
});

test("render browser missing and no internet: a sentence", async () => {
  const env = { ITV_DATA_DIR: tmp("nobrowser") };
  const run = async () => ({ code: 1, tail: "getaddrinfo ENOTFOUND storage.googleapis.com" });
  await assert.rejects(renderBrowser({ env, run }), (e) => /could not be downloaded/.test(friendlyMessage(e)) && !/ENOTFOUND/.test(friendlyMessage(e)));
});

// ---- the Health check ------------------------------------------------------------------------------
test("health: names what to fix, spends nothing, and a key is only a yes or no", async () => {
  const env = { ITV_DATA_DIR: tmp("health"), ITV_ENGINE_DIR: tmp("noengine"), HYPERFRAMES_FFMPEG_PATH: "/no/ffmpeg", HYPERFRAMES_FFPROBE_PATH: "/no/ffprobe" };
  let calls = 0;
  const down = async () => {
    calls++;
    throw new TypeError("fetch failed");
  };
  const r = await healthCheck({ projectsDir: env.ITV_DATA_DIR, keys: { gemini: true, heygen: false }, env, fetchImpl: down });
  assert.equal(calls, 1, "one look at the internet, nothing else");
  const item = (id) => r.items.find((i) => i.id === id);
  assert.equal(item("ffmpeg").state, "fix");
  assert.match(item("ffmpeg").fix, /Reinstall/);
  assert.equal(item("engine").state, "fix");
  assert.equal(item("ai").state, "ok");
  assert.equal(item("heygen").state, "note");
  assert.equal(item("voice-model").state, "fix");
  assert.equal(item("internet").state, "note");
  assert.ok(r.problems >= 3);
  const online = await healthCheck({ projectsDir: env.ITV_DATA_DIR, keys: {}, env, fetchImpl: async () => answer(200, "") });
  assert.equal(online.items.find((i) => i.id === "voice-model").state, "note");
  assert.equal(online.items.find((i) => i.id === "ai").state, "note");
});
