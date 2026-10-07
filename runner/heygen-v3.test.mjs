// heygen-v3.test.mjs: HeyGen retires its v1 and v2 API on 2026-10-31
// (DECISIONS 116). No source file may call api.heygen.com/v1 or /v2; every
// HeyGen path the code builds starts with /v3/. A live check of the free
// endpoints runs when HEYGEN_API_KEY is set (no video is ever made here).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as heygen from "./providers/avatar/heygen.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set(["node_modules", ".git", "target", "dist", "build", "library", "vendor", "feedback", "gen"]);

function sources(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sources(p, out);
    else if (/\.(mjs|js|ts|svelte|rs|json)$/.test(e.name) && !e.name.endsWith(".test.mjs")) out.push(p);
  }
  return out;
}

test("no HeyGen v1 or v2 call anywhere in the code", () => {
  const files = [...sources(path.join(root, "runner")), ...sources(path.join(root, "app", "src")), ...sources(path.join(root, "app", "src-tauri", "src")), ...sources(path.join(root, "scripts"))];
  assert.ok(files.length > 50, `scanned ${files.length} files`);
  const bad = [];
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    if (/api\.heygen\.com\/v[12]\b/.test(text)) bad.push(path.relative(root, f));
  }
  assert.deepEqual(bad, []);
  // the two HeyGen clients build paths on the bare host; each one is /v3/
  for (const f of ["runner/providers/avatar/heygen.mjs", "runner/generate/heygen-video.mjs"]) {
    const text = fs.readFileSync(path.join(root, f), "utf8");
    const paths = [...text.matchAll(/(?:call|all)\(apiKey,\s*[`"](\/[^`"?$]*)/g)].map((m) => m[1]);
    assert.ok(paths.length > 0, `${f}: paths found`);
    for (const p of paths) assert.match(p, /^\/v3\//, `${f}: ${p}`);
  }
});

test("live: HeyGen v3 free endpoints (users/me, avatar list)", { skip: !process.env.HEYGEN_API_KEY && "HEYGEN_API_KEY not set" }, async () => {
  const me = await heygen.balance({ apiKey: process.env.HEYGEN_API_KEY });
  assert.ok(me);
  const looks = await heygen.listAvatars({ apiKey: process.env.HEYGEN_API_KEY, stockLimit: 3 });
  assert.ok(Array.isArray(looks.own) && Array.isArray(looks.stock));
});
