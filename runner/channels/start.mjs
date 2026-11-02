// channels/start.mjs: what a script video starts from (docs/BUILD_PLAN.md phase 3).
// Empty text means a topic only. A pasted text is marked "notes" (turned into a
// script, nothing added) or "finished" (used as it is, the Script step is done).
// The start screen and the week batch both come through here.

import fs from "node:fs";
import path from "node:path";
import { createProject, loadProject, saveProject, setGate, appendLog, writeAtomic } from "../project.mjs";
import { scriptMarkdown } from "./recipe.mjs";

export const NOTES_FILE = "notes.txt";
export const notesOf = (projectDir) => {
  try {
    return fs.readFileSync(path.join(projectDir, NOTES_FILE), "utf8");
  } catch {
    return null;
  }
};

const firstWords = (text, n = 8) => String(text).replace(/\s+/g, " ").trim().split(" ").slice(0, n).join(" ").replace(/[.,:;!?]+$/, "");

/** Creates the video. Pure file work, no AI. Returns { id, dir, project }. */
export function newScriptVideo({ projectsDir, identity, language = "en", recipe, topic = "", text = "", textKind = "notes", research = false, queue = null, title = "" }) {
  const name = String(topic).replace(/\s+/g, " ").trim().slice(0, 200);
  const pasted = String(text ?? "").replace(/\r\n/g, "\n").trim();
  const on = research === true;
  if (!pasted) {
    if (!name) throw new Error("Type the topic or idea, or paste a text.");
    return createProject({ projectsDir, title: name, language, identity, recipe, queue, start: { kind: "topic", research: on, topic: name } });
  }
  if (textKind === "finished") {
    const { title: head, markdown } = scriptMarkdown(pasted, title || name);
    const made = createProject({ projectsDir, title: head, language, identity, recipe, queue, start: { kind: "finished", research: on, ...(name ? { topic: name } : {}) } });
    writeAtomic(path.join(made.dir, "script.md"), markdown);
    saveProject(made.dir, setGate(setGate(loadProject(made.dir), "script", { state: "running", mode: "custom" }), "script", { state: "approved", mode: "custom" }));
    appendLog(made.dir, "script: pasted in, approved with the video");
    return made;
  }
  const made = createProject({ projectsDir, title: name || title || firstWords(pasted), language, identity, recipe, queue, start: { kind: "notes", research: on, ...(name ? { topic: name } : {}) } });
  writeAtomic(path.join(made.dir, NOTES_FILE), pasted + "\n");
  appendLog(made.dir, `script: notes pasted in, ${pasted.split(/\s+/).length} words`);
  return made;
}

/** Pasted texts for a week batch: one per block, split on a line of dashes. */
export function splitPasted(text, max = 7) {
  const parts = String(text ?? "").replace(/\r\n/g, "\n").split(/^\s*-{3,}\s*$/m).map((p) => p.trim()).filter(Boolean);
  if (parts.length > max) throw new Error(`That is ${parts.length} texts. A week batch takes at most ${max}: put a line with --- between them.`);
  return parts;
}
