#!/usr/bin/env node
// make-map.mjs: writes the maps Archive Collage bundles, from Natural Earth (public domain,
// naturalearthdata.com), pinned to one release. A tool for whoever changes the maps, not part
// of the app: the files it writes are committed, and nothing is downloaded when a video is made.
//
//   node scripts/make-map.mjs
//
// pack/shared/map-data.js   the shapes and the points, for the drawing code
// places.json               the names the sentences can say, for the plan

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "runner", "presets", "archive-collage");
const BASE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson";
export const SOURCE = { countries: `${BASE}/ne_50m_admin_0_countries.geojson`, cities: `${BASE}/ne_110m_populated_places_simple.geojson` };

// Degrees: a point closer than this to the line through its neighbours goes.
const TOLERANCE = 0.12;
// A real word before it is a country: as a rule these would be found in the wrong sentences.
const NOT_BY_RULE = new Set(["Man", "Chad", "Jordan", "Georgia", "Guinea", "Lobamba", "Bern", "Kingstown", "Castries", "Georgetown", "Baguio"]);
const MORE_WORDS = {
  "United States of America": ["United States", "USA", "America", "Amerika", "Egyesült Államok"],
  "United Kingdom": ["UK", "Britain", "Great Britain", "England", "Scotland", "Wales", "Nagy-Britannia", "Anglia", "Egyesült Királyság"],
  Czechia: ["Czech Republic", "Csehország"],
  Netherlands: ["Holland", "Hollandia"],
  "Russia": ["Soviet Union", "Szovjetunió"],
  "Washington, D.C.": ["Washington"],
  Paris: ["Párizs"],
  Rome: ["Róma"],
  Vienna: ["Bécs"],
  Moscow: ["Moszkva"],
  Beijing: ["Peking"],
  Tokyo: ["Tokió"],
  Warsaw: ["Varsó"],
  Prague: ["Prága"],
  Athens: ["Athén"],
  Cairo: ["Kairó"],
  Istanbul: ["Isztambul"],
};

const round = (x) => Math.round(x * 100) / 100;
const idOf = (name) => name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Douglas-Peucker, on a closed ring.
function simplify(ring) {
  if (ring.length < 8) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = keep[ring.length - 1] = 1;
  const far = Math.floor(ring.length / 2);
  keep[far] = 1;
  const stack = [[0, far], [far, ring.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let most = 0;
    let at = -1;
    const [ax, ay] = ring[a];
    const dx = ring[b][0] - ax;
    const dy = ring[b][1] - ay;
    const len = Math.hypot(dx, dy) || 1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dx * (ring[i][1] - ay) - dy * (ring[i][0] - ax)) / len;
      if (d > most) {
        most = d;
        at = i;
      }
    }
    if (most > TOLERANCE) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return ring.filter((_, i) => keep[i]);
}

const area = (ring) => Math.abs(ring.reduce((sum, [x, y], i) => {
  const [nx, ny] = ring[(i + 1) % ring.length];
  return sum + x * ny - nx * y;
}, 0)) / 2;
const boxOf = (ring) => [Math.min(...ring.map((p) => p[0])), Math.min(...ring.map((p) => p[1])), Math.max(...ring.map((p) => p[0])), Math.max(...ring.map((p) => p[1]))].map(round);

export function makeCountry(feature) {
  const p = feature.properties;
  const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  const outer = polygons.map((poly) => poly[0]);
  // the view fits the biggest piece: France is not its overseas parts
  const main = outer.reduce((a, b) => (area(b) > area(a) ? b : a));
  const kept = outer.map(simplify).filter((r) => r.length >= 4);
  // the smallest islands would vanish: they keep their one main shape
  const rings = (kept.length ? kept : [main]).map((r) => r.flat().map(round));
  return { id: idOf(p.NAME), name: p.NAME, lon: round(p.LABEL_X), lat: round(p.LABEL_Y), box: boxOf(main), rings };
}

function wordsFor(name, more = []) {
  if (NOT_BY_RULE.has(name)) return [];
  return [...new Set([name, ...(MORE_WORDS[name] ?? []), ...more].filter((w) => w && !NOT_BY_RULE.has(w) && /^\p{Lu}/u.test(w) && w.length >= 3))];
}

async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

async function main() {
  const [countries, cities] = await Promise.all([get(SOURCE.countries), get(SOURCE.cities)]);
  const shapes = countries.features.map(makeCountry).sort((a, b) => a.id.localeCompare(b.id));
  const points = cities.features.map((f) => ({ id: idOf(f.properties.name), name: f.properties.name, lon: round(f.geometry.coordinates[0]), lat: round(f.geometry.coordinates[1]) })).sort((a, b) => a.id.localeCompare(b.id));
  const taken = new Set(shapes.map((s) => s.id));
  const towns = points.filter((c) => !taken.has(c.id));
  const header = "// Natural Earth 1:50m countries and 1:110m populated places, public domain, simplified.\n// Written by scripts/make-map.mjs. Do not edit by hand.\n";
  fs.mkdirSync(path.join(DIR, "pack", "shared"), { recursive: true });
  fs.writeFileSync(path.join(DIR, "pack", "shared", "map-data.js"), `${header}window.ITV_WORLD = ${JSON.stringify({ countries: shapes, cities: towns })};\n`);
  const allowed = new Set(["Sovereign country", "Country", "Disputed"]);
  const places = [
    ...countries.features.filter((f) => allowed.has(f.properties.TYPE)).map((f) => ({ id: idOf(f.properties.NAME), name: f.properties.NAME, kind: "country", words: wordsFor(f.properties.NAME, [f.properties.NAME_EN, f.properties.NAME_HU]) })),
    ...towns.map((c) => ({ id: c.id, name: c.name, kind: "city", words: wordsFor(c.name, cities.features.find((f) => idOf(f.properties.name) === c.id)?.properties.nameascii ? [cities.features.find((f) => idOf(f.properties.name) === c.id).properties.nameascii] : []) })),
  ].sort((a, b) => a.id.localeCompare(b.id));
  fs.writeFileSync(path.join(DIR, "places.json"), `${JSON.stringify(places, null, 1)}\n`);
  console.log(`${shapes.length} countries, ${towns.length} cities, ${places.length} places`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
