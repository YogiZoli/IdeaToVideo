#!/usr/bin/env node
// prepare.mjs: the app's UI in a normal browser, without Tauri, for finding
// UI bugs (how the Settings crash was found, 2026-10-01). Copies the built UI
// (app/build, from `npm run build` in app/) into <dir> and puts mock.js in
// front of it: a stand-in for the Tauri core that logs every call in
// window.__calls and answers a fixed project. Then serve <dir> and open it:
//   node scripts/ui-mock/prepare.mjs <dir>
//   python -m http.server 5199 --directory <dir>
// In the browser: window.__calls shows exactly what the UI sent to Rust.
// Edit mock.js to shape the project (gates, keys, config) you need.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2];
if (!out) {
  console.error("Usage: node scripts/ui-mock/prepare.mjs <dir>");
  process.exit(2);
}
const build = path.join(here, "..", "..", "app", "build");
if (!fs.existsSync(path.join(build, "index.html"))) {
  console.error("No app/build yet: run `npm run build` in app/ first.");
  process.exit(1);
}
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(build, out, { recursive: true });
fs.copyFileSync(path.join(here, "mock.js"), path.join(out, "mock.js"));
const index = path.join(out, "index.html");
fs.writeFileSync(index, fs.readFileSync(index, "utf8").replace("<head>", `<head><script src="/mock.js?v=${Date.now()}"></script>`));
console.log(`ui-mock ready in ${out}`);
