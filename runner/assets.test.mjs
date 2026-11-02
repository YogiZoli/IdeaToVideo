// The asset license module (docs/BUILD_PLAN.md): only a clear CC0 or Public
// Domain license comes in, and every asset is logged.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { refusal, logAsset, readLedger, checkLedger, looksLikePerson, clipAsset, logTableFootage, LEDGER } from "./assets/license.mjs";
import { openverseHits, wikimediaHits, locHits, commonsLicense, searchAll, searchOpenverse } from "./assets/sources.mjs";

const good = { source: "openverse", sourceUrl: "https://example.org/map", license: "cc0", author: "A. Maker", date: "2026-11-02", title: "Old map of a river" };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "itv-assets-"));

test("anything without a clear CC0 or PD license is refused", () => {
  assert.equal(refusal(good), null);
  for (const license of ["by", "by-sa", "CC BY 4.0", "unsplash", "", undefined, "unknown"]) assert.ok(refusal({ ...good, license }), String(license));
  assert.match(refusal({ ...good, source: "pixabay" }), /cannot give the license/);
  assert.match(refusal({ ...good, source: "unsplash" }), /not an allowed/);
});

test("each source can only give its own licenses", () => {
  assert.ok(refusal({ ...good, source: "openverse", license: "no-known-restrictions" }));
  assert.equal(refusal({ ...good, source: "loc", sourceUrl: "https://www.loc.gov/item/1/", license: "no-known-restrictions" }), null);
  assert.match(refusal({ ...good, source: "loc", sourceUrl: "https://example.org/x", license: "no-known-restrictions" }), /loc\.gov/);
});

test("a federal work comes from a federal agency's own site, not any .gov", () => {
  assert.equal(refusal({ ...good, source: "us-federal", license: "us-federal", sourceUrl: "https://images.nasa.gov/details/x" }), null);
  assert.match(refusal({ ...good, source: "us-federal", license: "us-federal", sourceUrl: "https://www.ca.gov/photo" }), /federal agency/);
  assert.ok(refusal({ ...good, source: "us-federal", license: "us-federal", sourceUrl: "https://nasa.gov.evil.example/x" }));
});

test("source URL, author and date are required", () => {
  assert.match(refusal({ ...good, sourceUrl: "" }), /source URL/);
  assert.match(refusal({ ...good, author: " " }), /author/);
  assert.match(refusal({ ...good, date: "" }), /date/);
});

test("a picture of a real person is refused", () => {
  assert.ok(looksLikePerson({ title: "Portrait of a president" }));
  assert.ok(looksLikePerson({ title: "A thing", tags: ["woman", "river"] }));
  assert.ok(!looksLikePerson({ title: "Parking lot near the kingdom's river" }));
  assert.match(refusal({ ...good, title: "Portrait of the actor" }), /person/);
});

test("the ledger logs one record per source URL, with all four fields", () => {
  const dir = tmp();
  logAsset(dir, good);
  logAsset(dir, { ...good, author: "Corrected" });
  logAsset(dir, { ...good, sourceUrl: "https://example.org/other" });
  const { assets } = readLedger(dir);
  assert.equal(assets.length, 2);
  assert.equal(assets[0].author, "Corrected");
  for (const k of ["sourceUrl", "license", "author", "date"]) assert.ok(assets[0][k], k);
  assert.ok(fs.existsSync(path.join(dir, LEDGER)));
  assert.deepEqual(checkLedger(dir), []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a refused asset writes nothing; an edited ledger is caught", () => {
  const dir = tmp();
  assert.throws(() => logAsset(dir, { ...good, license: "by" }), /not a clear/);
  assert.ok(!fs.existsSync(path.join(dir, LEDGER)));
  logAsset(dir, good);
  const f = path.join(dir, LEDGER);
  const j = JSON.parse(fs.readFileSync(f, "utf8"));
  j.assets[0].license = "by-nc";
  fs.writeFileSync(f, JSON.stringify(j));
  assert.equal(checkLedger(dir).length, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a channel video: stock clips stop the build, own uploads are not external, free ones are logged", () => {
  const dir = tmp();
  const table = { footage: [{ from: "S1", clip: "a" }] };
  const stock = { id: "a", name: "Photo", file: "a.mp4", credit: { source: "Unsplash", license: "Unsplash License", author: "x" } };
  assert.throws(() => logTableFootage({ projectDir: dir, table, clips: [stock] }), /cannot be in this channel's video/);
  assert.equal(clipAsset({ id: "a", name: "Mine", file: "a.mp4" }), null);
  assert.deepEqual(logTableFootage({ projectDir: dir, table, clips: [{ id: "a", name: "Mine", file: "a.mp4" }] }), []);
  const free = { id: "a", name: "Old map", file: "a.mp4", credit: { source: "Openverse", sourceId: "openverse", licenseKey: "cc0", pageUrl: "https://example.org/map", author: "A", date: "2026-11-02" } };
  assert.equal(logTableFootage({ projectDir: dir, table, clips: [free] }).length, 1);
  assert.equal(readLedger(dir).assets[0].sourceUrl, "https://example.org/map");
  // a clip the table does not use is none of the ledger's business
  assert.deepEqual(logTableFootage({ projectDir: dir, table: { footage: [] }, clips: [stock] }), []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("Openverse: the license is read again from the answer", () => {
  const hits = openverseHits({
    results: [
      { id: 1, title: "Map", license: "cc0", foreign_landing_url: "https://e.org/1", url: "https://e.org/1.jpg", thumbnail: "https://e.org/t1.jpg", creator: "A" },
      { id: 2, title: "River", license: "pdm", foreign_landing_url: "https://e.org/2", url: "https://e.org/2.jpg", creator: "" },
      { id: 3, title: "Slipped through", license: "by", foreign_landing_url: "https://e.org/3", url: "https://e.org/3.jpg", creator: "B" },
      { id: 4, title: "Portrait of a king", license: "cc0", foreign_landing_url: "https://e.org/4", url: "https://e.org/4.jpg", creator: "C" },
    ],
  });
  assert.deepEqual(hits.map((h) => [h.id, h.license]), [["1", "cc0"], ["2", "pd"]]);
  assert.equal(hits[1].author, "unknown");
});

test("Wikimedia Commons: PD and CC0 only", () => {
  assert.equal(commonsLicense({ License: { value: "cc0" } }), "cc0");
  assert.equal(commonsLicense({ License: { value: "pd" }, LicenseShortName: { value: "Public domain" } }), "pd");
  assert.equal(commonsLicense({ License: { value: "pd-usgov-nasa" } }), "us-federal");
  assert.equal(commonsLicense({ License: { value: "cc-by-sa-4.0" }, LicenseShortName: { value: "CC BY-SA 4.0" } }), "");
  const page = (id, license) => ({ pageid: id, title: `File:Map ${id}.jpg`, imageinfo: [{ url: "https://u/x.jpg", thumburl: "https://u/t.jpg", descriptionurl: `https://commons.wikimedia.org/wiki/${id}`, extmetadata: { License: { value: license }, LicenseShortName: { value: license }, Artist: { value: "<a>Someone</a>" } } }] });
  const hits = wikimediaHits({ query: { pages: { 1: page(1, "cc0"), 2: page(2, "cc-by-4.0") } } });
  assert.deepEqual(hits.map((h) => h.id), ["1"]);
  assert.equal(hits[0].author, "Someone");
});

test("Library of Congress: only \"no known restrictions\"", () => {
  const hits = locHits({
    results: [
      { id: "https://www.loc.gov/item/1/", url: "https://www.loc.gov/item/1/", title: "A bridge", image_url: ["//loc.gov/t.jpg", "//loc.gov/big.jpg"], rights_advisory: ["No known restrictions on publication."], contributor: ["Survey"] },
      { id: "https://www.loc.gov/item/2/", url: "https://www.loc.gov/item/2/", title: "A road", image_url: ["//loc.gov/t2.jpg"], rights_advisory: ["Rights status not evaluated."] },
    ],
  });
  assert.deepEqual(hits.map((h) => h.title), ["A bridge"]);
  assert.equal(hits[0].imageUrl, "https://loc.gov/big.jpg");
  assert.equal(hits[0].license, "no-known-restrictions");
});

test("a source that fails does not hide the others", async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes("openverse")) return { ok: true, json: async () => ({ results: [{ id: 1, title: "Map", license: "cc0", foreign_landing_url: "https://e.org/1", url: "https://e.org/1.jpg", creator: "A" }] }) };
    return { ok: false, status: 503 };
  };
  const r = await searchAll({ q: "map", fetchImpl });
  assert.equal(r.hits.length, 1);
  assert.equal(r.failed.length, 3);
  await assert.rejects(searchAll({ q: " ", fetchImpl }), /Type what/);
});

test("the search asks Openverse for cc0 and pdm only", async () => {
  let asked = "";
  await searchOpenverse({ q: "old map", fetchImpl: async (u) => ((asked = String(u)), { ok: true, json: async () => ({ results: [] }) }) });
  assert.match(asked, /license=cc0,pdm/);
  assert.match(asked, /q=old%20map/);
});
