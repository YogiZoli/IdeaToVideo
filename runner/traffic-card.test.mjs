// traffic-card.test.mjs: the Evergreen Traffic Card (DECISIONS 127). The
// fixture follows the Brand Channel Wizard's buildMarkdown: the profile, the
// research tables read by column name, only existing fields offered, the
// card kept with the Identity as it came.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseTrafficCard, cardFields, previewCard, saveCard, loadCard, readTable, CARD_FILE } from "./planner/traffic-card.mjs";

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "example-traffic-card.md");
const TEXT = fs.readFileSync(FIXTURE, "utf8");

test("traffic card: the profile, the name, the language and the tables", () => {
  const c = parseTrafficCard(TEXT);
  assert.equal(c.audience, "TEST home bakers who are new to sourdough");
  assert.equal(c.result, "bake a good loaf in one weekend");
  assert.equal(c.language, "en");
  assert.equal(c.generated, "2026-10-20");
  assert.deepEqual(c.nameOptions, ["TEST Sourdough Weekend", "TEST Sourdough Weekend Academy"]);
  assert.deepEqual(c.keywords.map((k) => [k.keyword, k.volume, k.competition]), [["sourdough starter", 74000, "Medium"], ["sourdough for beginners", 12500, "Low"], ["why is my sourdough dense", 2900, "Low"]]);
  assert.equal(c.playlists[0].keyword, "sourdough starter");
  assert.equal(c.videos[0].title, "Make a Sourdough Starter in 7 Days");
  assert.deepEqual(parseTrafficCard("﻿" + TEXT.replace(/\r?\n/g, "\r\n")).keywords.length, 3, "a BOM and Windows line ends are no problem");
});

test("traffic card: anything else is refused in plain words", () => {
  assert.throws(() => parseTrafficCard(""), /empty/);
  assert.throws(() => parseTrafficCard("# Hello"), /not an Evergreen Traffic Card/);
  assert.throws(() => parseTrafficCard(TEXT.replace("youtube-evergreen-organic-traffic-card", "other")), /it says "other"/);
  assert.throws(() => parseTrafficCard(TEXT.replace("version: 1", "version: 2")), /version 2/);
});

test("traffic card: only fields that exist, filled ones shown with their value", () => {
  const c = parseTrafficCard(TEXT);
  const f = cardFields(c, { audience: "", contentLanguage: "en" }, "My Identity");
  assert.deepEqual(f.map((x) => x.field), ["name", "audience", "profile"], "the same language is not offered");
  assert.equal(f[0].now, "My Identity");
  assert.match(f[2].value, /^Topic: sourdough baking\. Promise: bake a good loaf in one weekend\./);
  assert.deepEqual(cardFields({ ...c, nameOptions: [], audience: "", topic: "", result: "", frustration: "", proof: "", language: null }, {}), []);
});

test("traffic card: kept with the Identity byte for byte, read back", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "itv-card-"));
  assert.equal(loadCard(dir), null);
  assert.equal(previewCard({ file: FIXTURE }).fields.length, 4);
  saveCard(dir, { text: TEXT });
  assert.equal(fs.readFileSync(path.join(dir, CARD_FILE), "utf8"), TEXT);
  assert.equal(loadCard(dir).keywords.length, 3);
  assert.throws(() => saveCard(dir, { text: "nope" }), /not an Evergreen/);
  assert.equal(fs.readFileSync(path.join(dir, CARD_FILE), "utf8"), TEXT, "a bad card never replaces the kept one");
  assert.throws(() => previewCard({ file: path.join(dir, "x.txt") }), /\.md/);
});

test("traffic card: a table with pipes only, no rows, is empty", () => {
  assert.deepEqual(readTable(["| A | B |", "|---|---|"]), []);
  assert.deepEqual(readTable(["text", "| A | B |", "|---|---|", "| 1 | 2 |", "", "| X |"]), [{ a: "1", b: "2" }]);
});
