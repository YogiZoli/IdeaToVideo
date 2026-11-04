// The search keyword chosen on a video's Research tab (DECISIONS 169): kept in its
// project.json, valid against the schema, and gone again when it is removed.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createProject, loadProject } from "./project.mjs";

const main = path.join(path.dirname(fileURLToPath(import.meta.url)), "main.mjs");
const run = (command, request) => {
  const r = spawnSync(process.execPath, [main, command], { input: JSON.stringify(request), encoding: "utf8" });
  return JSON.parse(r.stdout.trim().split("\n").at(-1));
};

test("a keyword is saved with the video, and can be removed", () => {
  const projectsDir = fs.mkdtempSync(path.join(os.tmpdir(), "itv-keyword-"));
  try {
    const { dir } = createProject({ projectsDir, title: "A video", identity: "someone" });
    const set = run("video-keyword", { projectDir: dir, keyword: "  how to get subscribers  " });
    assert.equal(set.event, "result");
    assert.equal(set.data.keyword, "how to get subscribers");
    assert.equal(loadProject(dir).keyword, "how to get subscribers");
    const off = run("video-keyword", { projectDir: dir, keyword: null });
    assert.equal(off.data.keyword, null);
    assert.equal("keyword" in loadProject(dir), false);
  } finally {
    fs.rmSync(projectsDir, { recursive: true, force: true });
  }
});
