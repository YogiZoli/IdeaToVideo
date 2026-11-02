// packs.test.mjs: block packs (.itvpack, DECISIONS 107).
import "./fixtures/test-catalog.mjs"; // the scene catalog fixture, before any scene module
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { zipBuffers, unzipBuffer } from "./packs/zip.mjs";
import { builtinPacks, checkManifest, importPack, listPacks, writeState, exportPack, removePack, fitPackBlock, readPackFile, registerPacks, packCatalog, PACK_SCHEMA } from "./packs/index.mjs";
import { componentMeta, PACK_COMPONENTS } from "./gates/scenes/roles.mjs";
import { fixBlock, emptyOptional, blockVariables } from "../scripts/make-pack.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "itv-pack-"));
const BLOCK = `<html data-composition-variables='[{"id":"kick","type":"string","label":"Kicker","default":"08 · SPLIT"},{"id":"word","type":"string","label":"Word","default":"NEVER"},{"id":"ghost","type":"string","label":"Unused","default":"x"}]'><template><style>@font-face{font-family:"Open Sans";src:url(data:font/ttf;base64,AAAA)}
.a{}</style><div id="root" data-composition-id="split"><section data-scene-dur="4.5"><div class="kick" data-vars='{"text":"kick"}'>08 · SPLIT</div><div class="w" data-anim="rise" data-at="2.2" data-vars='{"text":"word"}'>NEVER</div><span data-vars='{"text":"extra"}'>More</span></section></div><script>tl.fromTo(e, { opacity: 0, filter: "blur(26px)", scale: .96 },
        { opacity: 1, filter: "blur(12px)", scale: 1, duration: .38 }, at);</script></template></html>`;
const manifest = (extra = {}) => ({ schema: PACK_SCHEMA, id: "zg", name: "ZG", look: "own", blocks: [{ id: "split", role: "contrast", label: "Split", what: "two ways", seconds: 4.5, variables: [{ id: "word", type: "string", label: "Word", default: "NEVER", maxWords: 4 }] }], ...extra });
const packFile = (dir, m = manifest()) => {
  const f = path.join(dir, "zg.itvpack");
  fs.writeFileSync(f, zipBuffers([{ name: "pack.json", data: JSON.stringify(m) }, { name: "blocks/split.html", data: BLOCK }, { name: "shared/fontface.css", data: "@font-face{}" }]));
  return f;
};

test("zip: what is written reads back byte for byte", () => {
  const files = [{ name: "a.json", data: "{}" }, { name: "d/b.bin", data: Buffer.from([0, 255, 7]) }, { name: "c.txt", data: "x".repeat(5000) }];
  assert.deepEqual(unzipBuffer(zipBuffers(files)).map((f) => [f.name, f.data.toString("hex")]), files.map((f) => [f.name, Buffer.from(f.data).toString("hex")]));
  assert.throws(() => unzipBuffer(Buffer.from("not a zip")), /Not a zip/);
});

test("the manifest is checked: ids, roles, lengths", () => {
  assert.equal(checkManifest(manifest()).id, "zg");
  assert.throws(() => checkManifest(manifest({ id: "Bad Id" })), /id: lowercase/);
  assert.throws(() => checkManifest({ ...manifest(), blocks: [{ id: "x", role: "dance", label: "X", variables: [], seconds: 1 }] }), /role must be one of/);
});

test("import, list, state, export, remove; a pack file holds only pack files", async () => {
  const dir = tmp();
  const ident = path.join(dir, "ident");
  fs.mkdirSync(ident);
  assert.deepEqual(importPack(ident, packFile(dir)), { id: "zg", name: "ZG", blocks: 1 });
  assert.deepEqual(listPacks(ident).map((p) => [p.id, p.on, p.followBrand]), [["zg", true, false]]);
  writeState(ident, "zg", { on: true, followBrand: true, off: ["split"] });
  assert.deepEqual(packCatalog(ident), [], "a block turned off is not offered");
  importPack(ident, packFile(dir));
  assert.equal(listPacks(ident)[0].followBrand, true, "a re-import keeps the state");
  const out = await exportPack(ident, "zg", path.join(dir, "back"));
  assert.equal(path.extname(out.file), ".itvpack");
  assert.deepEqual(readPackFile(out.file).files.map((f) => f.name).sort(), ["blocks/split.html", "pack.json", "shared/fontface.css"], "no state.json in an export");
  const evil = path.join(dir, "evil.itvpack");
  fs.writeFileSync(evil, zipBuffers([{ name: "pack.json", data: JSON.stringify(manifest()) }, { name: "blocks/split.html", data: "x" }, { name: "../run.exe", data: "x" }]));
  assert.throws(() => readPackFile(evil), /files a pack never has/);
  removePack(ident, "zg");
  assert.deepEqual(listPacks(ident), []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("registered pack blocks are known to the scene checks by their pack:block name", async () => {
  const dir = tmp();
  const ident = path.join(dir, "ident");
  fs.mkdirSync(ident);
  importPack(ident, packFile(dir));
  assert.equal(await registerPacks(ident), 1 + builtinPacks().reduce((n, p) => n + p.blocks.length, 0), "the imported block, and the ones presets bring");
  assert.equal(componentMeta("zg:split").role, "contrast");
  assert.equal(componentMeta("zg:split").mainVar, "word");
  PACK_COMPONENTS.clear();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("the build copy: the pack's font inside, the scene's length, entrances pulled in, the Brand over the tokens", () => {
  const out = fitPackBlock(BLOCK, { fontface: "@font-face{x}", seconds: 2.25, drawn: 4.5, theme: { bg: "#fff", fg: "#111", brand: "#00f", accent: "#0a0", surface: "#eee", border: "#ccc", muted: "#666" }, family: "Inter" });
  assert.match(out, /<style>[\s\S]*@font-face\{x\}[\s\S]*<\/style>/);
  assert.match(out, /data-scene-dur="2.25"/);
  assert.match(out, /data-at="1.1"/, "2.2 s at half the length");
  assert.match(out, /--blue: #00f !important;/);
  assert.match(out, /font-family: "Inter"/);
  assert.equal(fitPackBlock(BLOCK, { seconds: 9, drawn: 4.5 }).includes('data-at="2.2"'), true, "a longer scene keeps the drawn timing");
});

test("make-pack: no blur, empty optional lines, the variables the block really uses", () => {
  const fixed = fixBlock(BLOCK);
  assert.doesNotMatch(fixed, /filter: "blur/);
  assert.match(fixed, /\.kick:empty/);
  const vars = blockVariables(BLOCK);
  assert.deepEqual(vars.map((v) => [v.id, Boolean(v.optional)]), [["kick", true], ["word", false], ["extra", false]], "declared and used; used but undeclared; the unused one goes");
  const empty = emptyOptional(BLOCK, ["kick"]);
  assert.match(empty, /"id":"kick","type":"string","label":"Kicker","default":""/);
  assert.match(empty, /data-vars='\{"text":"kick"\}'><\/div>/);
});
