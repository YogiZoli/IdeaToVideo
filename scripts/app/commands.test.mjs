// Every runner command the UI calls must be on the Rust core's list
// (app/src-tauri/src/runner.rs COMMANDS), or the core refuses it with
// "Unknown runner command". packaging-make and brand-import were missing
// (Zoltan's log, 2026-10-08): the Script tab's packaging failed.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : /\.(svelte|ts)$/.test(e.name) ? [path.join(dir, e.name)] : []));
}

test("every runner command the UI calls is allowed by the core", () => {
  const rs = fs.readFileSync(path.join(root, "app/src-tauri/src/runner.rs"), "utf8");
  const allowed = new Set([...rs.matchAll(/\("([a-z0-9-]+)", (?:None|Some)/g)].map((m) => m[1]));
  const main = fs.readFileSync(path.join(root, "runner/main.mjs"), "utf8");
  const used = new Set();
  for (const f of files(path.join(root, "app/src"))) {
    const s = fs.readFileSync(f, "utf8");
    for (const m of s.matchAll(/runner(?:<[^>]*>)?\(\s*"([a-z0-9-]+)"/g)) used.add(m[1]);
    for (const m of s.matchAll(/command:\s*"([a-z0-9-]+)"/g)) used.add(m[1]);
  }
  assert.ok(used.size > 50);
  const missing = [...used].filter((c) => !allowed.has(c));
  assert.deepEqual(missing, [], `the core refuses: ${missing.join(", ")}`);
  const unknown = [...used].filter((c) => !main.includes(`"${c}":`));
  assert.deepEqual(unknown, [], `the runner has no: ${unknown.join(", ")}`);
});
