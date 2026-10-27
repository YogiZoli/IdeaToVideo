import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { childEnv, hfHome, percentOf, managedBrowser, systemChromeCandidates, resolveBrowser, ensureBrowser, renderBrowser, toolsStatus, runHyperframes, ENGINE_IDLE_MS } from "./tools.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "itv-tools-"));
const exe = process.platform === "win32" ? "chrome-headless-shell.exe" : "chrome-headless-shell";

// A fake hyperframes home with a downloaded shell in it.
function withShell(data) {
  const dir = path.join(hfHome({ ITV_DATA_DIR: data }), ".cache", "hyperframes", "chrome", "chrome-headless-shell", "win64-152.0.7977.30", "chrome-headless-shell-win64");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, exe), "");
  return path.join(dir, exe);
}

test("child env: no key, no NODE_OPTIONS, home inside the app data, telemetry off", () => {
  const env = { ITV_DATA_DIR: "C:\\Data\\itv", STUDIO_API_KEY: "sk-secret", NODE_OPTIONS: "--inspect", PATH: "x", HYPERFRAMES_FFMPEG_PATH: "C:\\ff\\ffmpeg.exe" };
  const out = childEnv({ env, browser: "C:\\b\\chrome.exe", platform: "win32" });
  assert.equal(out.STUDIO_API_KEY, undefined);
  assert.equal(out.NODE_OPTIONS, undefined);
  assert.equal(out.HOME, path.join("C:\\Data\\itv", "hyperframes-home"));
  assert.equal(out.USERPROFILE, out.HOME);
  assert.equal(out.HYPERFRAMES_NO_TELEMETRY, "1");
  assert.equal(out.HYPERFRAMES_NO_UPDATE_CHECK, "1");
  assert.equal(out.HYPERFRAMES_FFMPEG_PATH, "C:\\ff\\ffmpeg.exe");
  assert.equal(out.HYPERFRAMES_BROWSER_PATH, "C:\\b\\chrome.exe");
  assert.ok(!JSON.stringify(out).includes("sk-secret"));
});

test("child env on macOS does not invent Windows variables", () => {
  const out = childEnv({ env: { ITV_DATA_DIR: "/Users/x/Library/Application Support/itv" }, platform: "darwin" });
  assert.equal(out.USERPROFILE, undefined);
  assert.equal(out.HOMEDRIVE, undefined);
});

test("download progress lines give a percent", () => {
  assert.equal(percentOf("Downloading Chrome 152 ... 42%"), 42);
  assert.equal(percentOf("done"), null);
  assert.equal(percentOf("150%"), null);
});

test("the managed shell is found in our own home, nowhere else", () => {
  const data = tmp();
  assert.equal(managedBrowser({ ITV_DATA_DIR: data }), null);
  const p = withShell(data);
  assert.equal(managedBrowser({ ITV_DATA_DIR: data }).path, p);
  fs.rmSync(data, { recursive: true, force: true });
});

test("system fallback is Google Chrome only, never Edge", () => {
  for (const platform of ["win32", "darwin", "linux"]) {
    const c = systemChromeCandidates({ PROGRAMFILES: "C:\\Program Files", LOCALAPPDATA: "C:\\L" }, platform);
    assert.ok(c.length > 0);
    assert.ok(c.every((p) => /chrome/i.test(p) && !/edge/i.test(p)), platform);
  }
});

test("the managed shell wins over the system Chrome", () => {
  const data = tmp();
  const p = withShell(data);
  const r = resolveBrowser({ ITV_DATA_DIR: data });
  assert.deepEqual([r.source, r.path], ["managed", p]);
  fs.rmSync(data, { recursive: true, force: true });
});

test("ensureBrowser does nothing when the shell is already there", async () => {
  const data = tmp();
  withShell(data);
  const r = await ensureBrowser({ env: { ITV_DATA_DIR: data }, onProgress: () => assert.fail("no download expected") });
  assert.equal(r.downloaded, false);
  assert.equal(r.source, "managed");
  fs.rmSync(data, { recursive: true, force: true });
});

test("tools status reports a missing engine, ffmpeg and browser plainly", () => {
  const data = tmp();
  const s = toolsStatus({ ITV_DATA_DIR: data, ITV_ENGINE_DIR: path.join(data, "nope"), PROGRAMFILES: data, LOCALAPPDATA: data });
  assert.equal(s.engine, null);
  assert.equal(s.ffmpeg, false);
  fs.rmSync(data, { recursive: true, force: true });
});

// The engine has no limit of its own by default (the core's check-in tells
// the user instead); a caller's own limit still ends it with a sentence.
test("a silent engine is stopped only when a caller asks for a limit", async () => {
  assert.equal(ENGINE_IDLE_MS, 0);
  const engine = tmp();
  const bin = path.join(engine, "node_modules", "hyperframes", "bin");
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, "hyperframes.mjs"), "console.log('starting'); setTimeout(() => {}, 60000);\n");
  const env = { ...process.env, ITV_ENGINE_DIR: engine, ITV_DATA_DIR: tmp() };
  const lines = [];
  const t0 = Date.now();
  await assert.rejects(runHyperframes(["render"], { env, idleMs: 1500, onLine: (l) => lines.push(l) }), /no sign of life.*hyperframes render/);
  assert.ok(Date.now() - t0 < 15000);
  assert.deepEqual(lines, ["starting"]);
  fs.rmSync(engine, { recursive: true, force: true });
});

// DECISIONS 126: the render always uses the pinned shell. A missing one is
// downloaded with hyperframes' own downloader; an existing one is not.
test("renderBrowser downloads the shell when it is missing", async () => {
  const data = tmp();
  const calls = [];
  const steps = [];
  const run = async (args) => {
    calls.push(args.join(" "));
    withShell(data);
    return { code: 0, tail: "" };
  };
  const r = await renderBrowser({ env: { ITV_DATA_DIR: data, PROGRAMFILES: data, LOCALAPPDATA: data }, run, onProgress: (p) => steps.push(p.step) });
  assert.deepEqual(calls, ["browser ensure"]);
  assert.equal(r.source, "managed");
  assert.equal(r.downloaded, true);
  assert.ok(steps.includes("browser"));
  fs.rmSync(data, { recursive: true, force: true });
});

test("renderBrowser does not download when the shell is there", async () => {
  const data = tmp();
  const p = withShell(data);
  const r = await renderBrowser({ env: { ITV_DATA_DIR: data }, run: () => assert.fail("no download expected"), onProgress: () => assert.fail("no download expected") });
  assert.deepEqual([r.source, r.path, r.downloaded], ["managed", p, false]);
  fs.rmSync(data, { recursive: true, force: true });
});

test("renderBrowser never falls back to the system Chrome", async () => {
  const data = tmp();
  const chrome = path.join(data, "Google", "Chrome", "Application", "chrome.exe");
  fs.mkdirSync(path.dirname(chrome), { recursive: true });
  fs.writeFileSync(chrome, "");
  const env = { ITV_DATA_DIR: data, PROGRAMFILES: data, LOCALAPPDATA: data };
  await assert.rejects(renderBrowser({ env, run: async () => ({ code: 1, tail: "offline" }) }), /could not be downloaded/);
  fs.rmSync(data, { recursive: true, force: true });
});

// 2026-10-26: a long `check --json` report arrives in pieces that can end in
// the middle of a line (or of a letter like "é"). Lines and stdout come back whole.
test("output split mid-line comes back whole", async () => {
  const engine = tmp();
  const bin = path.join(engine, "node_modules", "hyperframes", "bin");
  fs.mkdirSync(bin, { recursive: true });
  const script = [
    "const b = Buffer.from(JSON.stringify({ ok: true, message: 'szép ' + 'x'.repeat(200000) }) + '\\n');",
    "const cut = b.indexOf(Buffer.from('é')) + 1;",
    "process.stdout.write(b.subarray(0, cut));",
    "setTimeout(() => { process.stderr.write('progress line\\n'); process.stdout.write(b.subarray(cut)); }, 300);",
  ].join("\n");
  fs.writeFileSync(path.join(bin, "hyperframes.mjs"), script + "\n");
  const env = { ...process.env, ITV_ENGINE_DIR: engine, ITV_DATA_DIR: tmp() };
  const lines = [];
  const r = await runHyperframes(["check", "--json"], { env, onLine: (l) => lines.push(l) });
  assert.equal(r.code, 0, r.tail);
  assert.equal(JSON.parse(r.stdout).message.length, 200005);
  assert.deepEqual(lines.map((l) => l.slice(0, 13)), ["progress line", '{"ok":true,"m']);
  assert.equal(JSON.parse(lines[1]).ok, true);
  fs.rmSync(engine, { recursive: true, force: true });
});
