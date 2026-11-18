// topbar.test.mjs: the top bar with a 60 character Identity name (FIX_PLAN 2026-11-19, item 1,
// DECISIONS 187). The built window (app/build) runs in the render browser with the mock core; at
// 1280, 1440 and 1920 px wide every menu item must be the element under its own centre (nothing
// covers it), a click on it must make it the active one, and the Identity switch must stay inside
// the bar. Skipped when there is no app/build (run `npm run build` in app/ first) or no browser.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveBrowser } from "../../runner/tools.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, "..", "..");
const build = path.join(repo, "app", "build", "index.html");
const browser = resolveBrowser();
const require = createRequire(path.join(repo, "engine", "package.json"));
let puppeteer = null;
try {
  puppeteer = require("puppeteer-core");
} catch {
  puppeteer = null;
}
const skip = !fs.existsSync(build) ? "no app/build" : !browser ? "no browser" : !puppeteer ? "no puppeteer-core in engine/" : false;

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".mjs": "text/javascript" };

function serve(dir) {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
    let file = path.join(dir, url);
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dir, "index.html");
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

test("the top bar: a 60 character Identity name covers no menu item", { skip, timeout: 120000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "itv-topbar-"));
  execFileSync(process.execPath, [path.join(here, "prepare.mjs"), dir], { stdio: "ignore" });
  const server = await serve(dir);
  const port = server.address().port;
  const b = await puppeteer.launch({ executablePath: browser.path, headless: true, args: ["--no-sandbox"] });
  try {
    for (const width of [1280, 1440, 1920]) {
      const page = await b.newPage();
      await page.setViewport({ width, height: 800 });
      await page.goto(`http://127.0.0.1:${port}/?longname=1`, { waitUntil: "networkidle0" });
      await page.waitForSelector("nav.brandbar .menuitem", { timeout: 20000 });
      const name = await page.$eval(".menu .current", (e) => e.getAttribute("title"));
      assert.match(name, /Hello Cambodia AI Coach for the English class, Siem Reap 202/, "the full name is in the tooltip");
      const ids = await page.$$eval("nav.brandbar .menuitem", (els) => els.map((e) => e.dataset.menu));
      assert.ok(ids.length >= 7, `the whole menu is there (${ids.join(", ")})`);
      for (const id of ids) {
        const hit = await page.$eval(`nav.brandbar .menuitem[data-menu="${id}"]`, (el) => {
          const r = el.getBoundingClientRect();
          const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return { ok: !!at && (at === el || el.contains(at)), right: r.right, w: window.innerWidth };
        });
        assert.ok(hit.ok, `${id} is not covered at ${width} px`);
        assert.ok(hit.right <= hit.w, `${id} is inside the window at ${width} px`);
        await page.click(`nav.brandbar .menuitem[data-menu="${id}"]`);
        await page.waitForFunction((m) => document.querySelector(`nav.brandbar .menuitem[data-menu="${m}"]`)?.classList.contains("active"), { timeout: 5000 }, id);
      }
      const bar = await page.$eval("nav.brandbar", (nav) => {
        const menus = [...nav.querySelectorAll(".menuitem")].map((e) => e.getBoundingClientRect());
        const ident = nav.querySelector(".menu").getBoundingClientRect();
        const last = menus[menus.length - 1];
        return { gap: ident.left - last.right, identRight: ident.right, w: window.innerWidth, overflow: nav.scrollWidth > nav.clientWidth + 1 };
      });
      assert.ok(bar.gap >= 0, `the Identity switch starts after the last menu item at ${width} px (gap ${bar.gap})`);
      assert.ok(bar.identRight <= bar.w, `the Identity switch is inside the window at ${width} px`);
      assert.equal(bar.overflow, false, `the bar does not overflow at ${width} px`);
      await page.close();
    }
  } finally {
    await b.close();
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
