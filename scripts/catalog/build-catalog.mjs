#!/usr/bin/env node
// build-catalog.mjs: writes library/catalog.json (DECISIONS 130) from
//   - every component's own registry-item.json (the bundled library),
//   - the test run of scripts/catalog/test-components.mjs (results.json),
//   - scripts/catalog/notes.json: the catalog text, written by reading each
//     component's file and looking at its two topics' test stills (what it
//     shows, when it fits, role, needs, strong and weak points, an example
//     sentence, and a review verdict where the stills showed a problem).
//
// A component is "off" when it failed any test (build, lint, check, stills,
// render) in either topic, when its finished frame is empty, when it drew the
// same picture for both topics (it ignores the words and the Brand), or when
// the review of its stills found that it shows its own fixed content or its
// own colours instead of the topic and the Brand. "off" is never "deleted":
// the component stays bundled and in the catalog with the reason.
//
// Usage: node scripts/catalog/build-catalog.mjs --results <dir>/results.json

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const LIB = path.join(ROOT, "app", "src-tauri", "library");
const NOTES = path.join(ROOT, "scripts", "catalog", "notes.json");
const OUT = path.join(ROOT, "library", "catalog.json");
export const ROLES = ["opening", "statement", "emphasis", "proof", "list", "diagram", "quote", "transition", "closing"];
export const NEEDS = ["text", "number", "image", "recording"];

const exe = process.platform === "win32" ? ".exe" : "";
const FFMPEG = process.env.HYPERFRAMES_FFMPEG_PATH ?? path.join(ROOT, "app", "src-tauri", "ffmpeg", `ffmpeg${exe}`);

// A still as 64 x 36 grey values (0 to 255).
export function tiny(file) {
  const r = spawnSync(FFMPEG, ["-v", "error", "-i", file, "-vf", "scale=64:36,format=gray", "-f", "rawvideo", "-"], { maxBuffer: 1 << 20 });
  return r.status === 0 && r.stdout.length === 64 * 36 ? r.stdout : null;
}
export const spread = (px) => {
  const m = px.reduce((a, b) => a + b, 0) / px.length;
  return Math.sqrt(px.reduce((a, b) => a + (b - m) ** 2, 0) / px.length);
};
export const difference = (a, b) => a.reduce((t, v, i) => t + Math.abs(v - b[i]), 0) / a.length;

// The test verdict of one record: null when it passed, else the reason.
export function testFailure(r) {
  if (!r) return "not tested";
  if (!r.build?.ok) return `it is not a mountable scene: ${String(r.build?.error ?? "the build failed").replace(/^[a-z0-9-]+: /, "")}`;
  if (r.lint?.code) return `hyperframes lint failed${r.lint.errors?.length ? `: ${r.lint.errors[0]}` : ""}`;
  if (r.check?.errors?.length) return `hyperframes check found ${r.check.errors[0]}`;
  if (r.check && !r.check.readable) return "hyperframes check gave no readable report";
  if ((r.stills ?? []).length < 3) return "the stills could not be taken";
  if (r.render && !r.render.ok) return `the render failed${r.render.tail ? `: ${r.render.tail.slice(0, 160)}` : ""}`;
  return null;
}

export function pictureFailure(a, b) {
  const endA = a?.stills?.[2] && tiny(a.stills[2]);
  const endB = b?.stills?.[2] && tiny(b.stills[2]);
  if (!endA || !endB) return null;
  if (spread(endA) < 2 && spread(endB) < 2) return "its finished frame is empty in both topics";
  if (difference(endA, endB) < 1.5) return "it drew the same picture for both test topics: it shows its own fixed content and colours, not the words and the Brand";
  return null;
}

export function buildCatalog({ results, notes, items, commit }) {
  const components = {};
  for (const name of Object.keys(items).sort()) {
    const item = items[name];
    const n = notes[name] ?? {};
    const recs = Object.fromEntries(results.filter((r) => r.component === name).map((r) => [r.topic, r]));
    const topics = Object.keys(recs).sort();
    const failures = topics.map((t) => [t, testFailure(recs[t])]).filter(([, f]) => f);
    const picture = failures.length ? null : pictureFailure(recs.groceries, recs.sleep);
    const off = failures.length ? `Failed the test (${failures.map(([t]) => t).join(" and ")}): ${failures[0][1]}.` : !topics.length ? "Not tested yet." : picture ? `Off after the test renders: ${picture}.` : n.review === "off" ? `Off after the review of its test stills: ${n.reviewNote}.` : null;
    const authored = (/data-duration="([\d.]+)"/.exec(fs.readFileSync(path.join(LIB, "components", name, `${name}.html`), "utf8")) ?? [])[1];
    components[name] = {
      status: off ? "off" : "on",
      ...(off ? { off } : {}),
      title: item.title ?? name,
      label: n.label ?? item.title ?? name,
      role: n.role ?? "statement",
      shows: n.shows ?? item.description,
      fitsWhen: n.fitsWhen ?? "",
      needs: n.needs ?? ["text"],
      strong: n.strong ?? "",
      weak: n.weak ?? "",
      example: n.example ?? "",
      ...(n.mainVar !== undefined ? { mainVar: n.mainVar } : {}),
      ...(n.maxWords ? { maxWords: n.maxWords } : {}),
      ...(authored ? { seconds: Number(authored) } : {}),
      tests: Object.fromEntries(topics.map((t) => [t, testFailure(recs[t]) ?? "passed"])),
      ...(n.review && n.review !== "off" && n.reviewNote ? { reviewNote: n.reviewNote } : {}),
    };
  }
  const values = Object.values(components);
  return {
    schema: "itv-catalog/1",
    $comment: "The app's scene catalog (DECISIONS 130): every HyperFrames registry component at the pinned commit, what it shows and when it fits, written from its files and its test renders (scripts/catalog). status off: failed a test or the review, with the reason; never deleted. The planner (runner/gates/scenes) reads it.",
    commit,
    tested: { topics: { groceries: "saving money on groceries, the coral look (light)", sleep: "sleeping better, the broadside look (dark)" }, steps: ["build", "hyperframes lint", "hyperframes check", "three stills", "draft render"] },
    counts: { all: values.length, on: values.filter((c) => c.status === "on").length, off: values.filter((c) => c.status === "off").length },
    components,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values: args } = parseArgs({ options: { results: { type: "string" } } });
  if (!args.results) {
    console.error("Usage: node scripts/catalog/build-catalog.mjs --results <dir>/results.json");
    process.exit(2);
  }
  const list = JSON.parse(fs.readFileSync(path.join(ROOT, "library", "components.json"), "utf8"));
  const items = Object.fromEntries(list.components.map((n) => [n, JSON.parse(fs.readFileSync(path.join(LIB, "components", n, "registry-item.json"), "utf8"))]));
  const notes = fs.existsSync(NOTES) ? JSON.parse(fs.readFileSync(NOTES, "utf8")) : {};
  for (const [n, v] of Object.entries(notes)) {
    if (!items[n]) throw new Error(`notes.json names ${n}, which is not in the library.`);
    if (v.role && !ROLES.includes(v.role)) throw new Error(`${n}: role ${v.role} is not one of ${ROLES.join(", ")}.`);
    for (const x of v.needs ?? []) if (!NEEDS.includes(x)) throw new Error(`${n}: need ${x} is not one of ${NEEDS.join(", ")}.`);
  }
  const results = JSON.parse(fs.readFileSync(args.results, "utf8"));
  const catalog = buildCatalog({ results, notes, items, commit: list.commit });
  fs.writeFileSync(OUT, JSON.stringify(catalog, null, 1) + "\n");
  console.log(`catalog: ${catalog.counts.on} on, ${catalog.counts.off} off, of ${catalog.counts.all} -> ${OUT}`);
}
