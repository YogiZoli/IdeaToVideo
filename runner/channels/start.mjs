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
  const tooLong = textProblem(pasted);
  if (tooLong) throw new Error(tooLong);
  if (pasted && !/[\p{L}\p{N}]/u.test(pasted)) throw new Error("That text has no words in it. Paste your script or notes, or type a topic.");
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

// Offline mode (docs/AUDIT_REPORT.md): no AI could write the script. Notes become the draft
// as they are; a topic gets a skeleton. The Script tab is open for the user, and this
// mark must be gone before the script can be approved, so it is never read aloud.
export const WRITE_HERE = "[write here]";
export function offlineDraft(projectDir) {
  const project = loadProject(projectDir);
  const notes = notesOf(projectDir);
  const title = project.title;
  const markdown = notes ? `# ${title}\n\n${notes.trim()}\n` : `# ${title}\n\n${WRITE_HERE} Your opening: what this video is about and why it matters.\n\n## Part 1\n\n${WRITE_HERE} Your first point.\n\n## Part 2\n\n${WRITE_HERE} Your second point, and how the video ends.\n`;
  writeAtomic(path.join(projectDir, "script.md"), markdown);
  saveProject(projectDir, setGate(setGate(loadProject(projectDir), "script", { state: "running", mode: "custom" }), "script", { state: "pending", mode: "custom" }));
  appendLog(projectDir, `script: offline draft from ${notes ? "the notes" : "the topic"}, waiting for the user`);
  return { markdown };
}

// Text longer than this is not one video: about 11 hours of speech.
export const MAX_TEXT = 100000;
export function textProblem(text) {
  const t = String(text ?? "");
  if (t.length > MAX_TEXT) return `That text is too long for one video: ${Math.round(t.length / 1000)}k characters, and the limit is ${MAX_TEXT / 1000}k. Split it into parts, or into a week batch.`;
  return null;
}

/** Pasted texts for a week batch: one per block, split on a line of dashes. */
export function splitPasted(text, max = 7) {
  const parts = String(text ?? "").replace(/\r\n/g, "\n").split(/^\s*-{3,}\s*$/m).map((p) => p.trim()).filter(Boolean);
  if (parts.length > max) throw new Error(`That is ${parts.length} texts. A week batch takes at most ${max}: put a line with --- between them.`);
  return parts;
}
