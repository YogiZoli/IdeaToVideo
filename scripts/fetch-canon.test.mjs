import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CANON_SRC, FORBIDDEN_DIRS, STRIP, blockNames, copyCanon } from "./fetch-canon.mjs";

const haveCanon = fs.existsSync(path.join(CANON_SRC, "PIPELINE.md"));

test("the canon copy has the runtime files and none of Zoltan's brand folders", { skip: !haveCanon && "submodule not checked out" }, () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "itv-canon-"));
  try {
    const names = copyCanon(CANON_SRC, out);
    assert.equal(names.length, blockNames(path.join(CANON_SRC, "zg-frames", "blocks")).length);
    assert.ok(names.includes("statement") && names.includes("end-card"));
    for (const f of ["pipeline/sentences.mjs", "pipeline/stamp-timing.mjs", "zg-frames/blocks/build-video.mjs", "zg-frames/blocks/CATALOG.md", "MOTION.md", "package-lock.json"]) {
      assert.ok(fs.existsSync(path.join(out, f)), f);
    }
    for (const bad of FORBIDDEN_DIRS) assert.ok(!fs.existsSync(path.join(out, bad)), bad);
    // only built blocks: no samplers, sheets or test renders
    const stray = [];
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(mp4|jpg|png|ps1|bat|log)$/i.test(e.name)) stray.push(p);
      }
    };
    walk(out);
    assert.deepEqual(stray, []);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("onnxruntime-node is stripped (DECISIONS 26)", () => {
  assert.ok(STRIP.includes("onnxruntime-node"));
});
