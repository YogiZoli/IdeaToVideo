// Every outside address the UI opens must be inside the opener scope of the
// main window's capability, or Tauri refuses it ("Not allowed to open url",
// Zoltan's test, 2026-10-06: the Claude "Get a key" link did nothing).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const capability = JSON.parse(fs.readFileSync(path.join(ROOT, "app", "src-tauri", "capabilities", "default.json"), "utf8"));
const scope = capability.permissions.find((p) => p.identifier === "opener:allow-open-url")?.allow ?? [];
// The same glob the opener scope uses: "*" matches anything.
const allowed = (url) => scope.some(({ url: glob }) => new RegExp("^" + glob.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$").test(url));

// The key links of catalog.ts (read as text: it imports other .ts modules
// without an extension, which plain Node does not resolve).
function catalogUrls() {
  const src = fs.readFileSync(path.join(ROOT, "app", "src", "lib", "catalog.ts"), "utf8");
  return [...src.matchAll(/(?:keyUrl: |^\s+\w+: )"(https:[^"]+)"/gm)].map((m) => m[1]);
}

// Literal openUrl("https://...") calls in the Svelte files.
function literalUrls() {
  const dir = path.join(ROOT, "app", "src", "lib");
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".svelte"))
    .flatMap((f) => [...fs.readFileSync(path.join(dir, f), "utf8").matchAll(/openUrl\("(https:[^"]+)"\)/g)].map((m) => m[1]));
}

test("every link the UI opens is in the opener scope", () => {
  const urls = [...catalogUrls(), ...literalUrls()];
  assert.ok(urls.length >= 10);
  for (const url of urls) assert.ok(allowed(url), `not in the opener scope: ${url}`);
});

test("the scope opens only https addresses on named hosts", () => {
  assert.ok(scope.length > 0);
  for (const { url } of scope) assert.match(url, /^https:\/\/[a-z0-9.-]+\.[a-z]+[/*]/);
  assert.equal(allowed("https://evil.example.com/"), false);
  assert.equal(allowed("file:///C:/Windows/System32/cmd.exe"), false);
});
