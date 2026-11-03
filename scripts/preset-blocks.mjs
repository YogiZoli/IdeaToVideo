// preset-blocks.mjs: what make-3d-blocks.mjs and make-stick-blocks.mjs share. A preset's
// pack is written from one list, so its manifest, its blocks and its templates cannot
// disagree. A tool for whoever changes a preset, not part of the app.
//
// A block's script runs inside the runtime's scope: this mount's own document and timeline
// registry, also when the same block is mounted many times. So those two calls stay in the
// block, and never move into the shared code, which sees the plain page.

import fs from "node:fs";
import path from "node:path";

export const text = (maxWords, required = true) => ({ maxWords, required });
export const object = (required = true) => ({ type: "object", required });
export const number = () => ({ type: "number", required: true, said: true });
export const place = (required = true) => ({ type: "place", required });

const label = (id) => id.replace(/([A-Z0-9])/g, " $1").replace(/^./, (c) => c.toUpperCase());

// `neutral`: the object a block shows when nothing is named, the first of the preset's list.
export const variablesOf = (b, neutral) =>
  Object.entries(b.params).map(([id, p]) => ({
    id,
    type: p.type === "number" ? "number" : "string",
    label: label(id),
    default: p.type === "number" ? 0 : p.type === "object" ? neutral : "",
    ...(p.required && p.type !== "object" && p.type !== "place" ? {} : { optional: true }),
    ...(p.maxWords ? { maxWords: p.maxWords } : {}),
  }));

// `prefix`: the block's composition and class names. `api`: what the shared code calls itself.
export function blockHtml(b, { prefix, api, neutral }) {
  const comp = `${prefix}-${b.id}`;
  const vars = JSON.stringify(variablesOf(b, neutral).map(({ id, type, label: l, default: def }) => ({ id, type, label: l, default: def })));
  return `<!doctype html>
<html lang="en" data-resolution="landscape" data-composition-variables='${vars}'>
<head><meta charset="UTF-8"/></head>
<body>
<template>
<div id="root" data-composition-id="${comp}" data-width="1920" data-height="1080" data-start="0" data-duration="600">
<div class="${prefix}-root">
<canvas class="${prefix}-view" width="1" height="1"></canvas>
<section class="clip ${prefix}-clip" data-start="0" data-duration="600" data-scene-dur="5" data-track-index="1"></section>
</div>
<script>
window.__timelines = window.__timelines || {};
window.__timelines["${comp}"] = ${api}.block(document.getElementById("root"), "${b.id}", window.__hyperframes && window.__hyperframes.getVariables ? window.__hyperframes.getVariables() : {});
</script>
</div>
</template>
</body>
</html>
`;
}

// Writes pack/pack.json, pack/blocks/<id>.html and the templates of preset.json (its tokens,
// rules and objects stay). `blocks` is the list, `html` makes one block's file.
export function writePack({ dir, pack, name, camera, runtime = [], script, blocks, neutral, html }) {
  fs.mkdirSync(path.join(dir, "pack", "blocks"), { recursive: true });
  for (const b of blocks) fs.writeFileSync(path.join(dir, "pack", "blocks", `${b.id}.html`), html(b));
  const manifest = {
    schema: "itv-pack/1",
    id: pack,
    name,
    look: "own",
    camera,
    runtime,
    script,
    blocks: blocks.map((b) => ({ id: b.id, role: b.role, label: b.label, what: b.when, variables: variablesOf(b, neutral), seconds: 5 })),
  };
  fs.writeFileSync(path.join(dir, "pack", "pack.json"), JSON.stringify(manifest, null, 2) + "\n");
  const preset = JSON.parse(fs.readFileSync(path.join(dir, "preset.json"), "utf8"));
  preset.templates = blocks.map((b) => ({
    id: b.id,
    label: b.label,
    when: b.when,
    ...(b.first ? { ruleFirst: true } : {}),
    ...(b.rare ? { rare: b.rare } : {}),
    params: b.params,
    use: [{ component: `${pack}:${b.id}`, vars: Object.fromEntries(Object.keys(b.params).map((p) => [p, `$${p}`])) }],
  }));
  fs.writeFileSync(path.join(dir, "preset.json"), JSON.stringify(preset, null, 2) + "\n");
  console.log(`${blocks.length} blocks written to ${dir}`);
}
