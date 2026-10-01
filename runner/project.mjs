// project.mjs: one video = one folder (SPEC 4.3) with project.json as the
// source of truth (SPEC 4.4). Re-running a gate invalidates every later gate
// (SPEC 6).

import fs from "node:fs";
import path from "node:path";
import { validate, loadSchema } from "./schema/validate.mjs";

export const GATES = ["script", "voice", "scenes", "review", "avatar"];
const STATUS_AFTER = { script: "Scripted", voice: "Voiced", scenes: "Scened", review: "Reviewed" };

export function slugify(title) {
  const s = String(title)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/g, "");
  return s || "video";
}

export function createProject({ projectsDir, title, language = "en", brief = null, autopilot = false, now = new Date() }) {
  if (!projectsDir) throw new Error("No projects folder set.");
  if (brief) {
    const errors = validate(brief, loadSchema("brief-card"));
    if (errors.length) throw new Error(`The Video Brief Card is not valid: ${errors.slice(0, 5).join("; ")}`);
  }
  const name = title || brief?.title;
  if (!name) throw new Error("A project needs a title or topic.");
  const base = `${now.toISOString().slice(0, 10)}_${slugify(name)}`;
  let id = base;
  for (let n = 2; fs.existsSync(path.join(projectsDir, id)); n++) id = `${base}-${n}`;
  const dir = path.join(projectsDir, id);
  fs.mkdirSync(dir, { recursive: true });
  const project = {
    schema: 1,
    id,
    title: name,
    status: "Idea",
    language: brief?.language || language,
    autopilot,
    createdAt: now.toISOString(),
    gates: Object.fromEntries(GATES.map((g) => [g, { state: "todo" }])),
  };
  saveProject(dir, project);
  if (brief) writeJson(path.join(dir, "brief.json"), brief);
  return { id, dir, project };
}

export function loadProject(dir) {
  const project = JSON.parse(fs.readFileSync(path.join(dir, "project.json"), "utf8"));
  const errors = validate(project, loadSchema("project"));
  if (errors.length) throw new Error(`project.json is not valid: ${errors.slice(0, 5).join("; ")}`);
  return project;
}

export function saveProject(dir, project) {
  const errors = validate(project, loadSchema("project"));
  if (errors.length) throw new Error(`refusing to save an invalid project.json: ${errors.slice(0, 5).join("; ")}`);
  writeJson(path.join(dir, "project.json"), project);
}

// Sets a gate's state. Starting a gate again resets every later gate to todo,
// because their inputs are about to change.
export function setGate(project, gate, patch, now = new Date()) {
  if (!GATES.includes(gate)) throw new Error(`Unknown gate: ${gate}`);
  const next = structuredClone(project);
  next.gates[gate] = { ...stripUndefined(patch), at: now.toISOString() };
  if (patch.state === "running") next.gates[gate].pid = process.pid;
  if (patch.state === "running") {
    for (const later of GATES.slice(GATES.indexOf(gate) + 1)) next.gates[later] = { state: "todo" };
  }
  next.status = statusFor(next);
  return next;
}

// A gate left "running" by a runner that no longer exists (the app was closed
// or crashed mid-step) would show "Running" forever. It becomes failed, so the
// UI offers to run it again. A gate with no pid (older projects) counts as
// interrupted too: a step that is really running always has one.
export const INTERRUPTED = "Interrupted: the app was closed while this step was running. Run it again.";
export function recoverInterrupted(project, alive = pidAlive) {
  let next = project;
  for (const g of GATES) {
    const gate = next.gates[g];
    if (gate?.state === "running" && !(gate.pid && alive(gate.pid))) {
      next = structuredClone(next);
      next.gates[g] = { state: "failed", ...(gate.mode ? { mode: gate.mode } : {}), at: gate.at ?? new Date().toISOString(), error: INTERRUPTED };
    }
  }
  return next;
}
function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

export function statusFor(project) {
  let status = "Idea";
  for (const g of ["script", "voice", "scenes", "review"]) {
    if (project.gates[g]?.state === "approved") status = STATUS_AFTER[g];
    else break;
  }
  return status;
}

export function readBrief(dir) {
  const p = path.join(dir, "brief.json");
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
}

export function appendLog(dir, line) {
  fs.appendFileSync(path.join(dir, "log.txt"), `${new Date().toISOString()} ${line}\n`);
}

// Write to a temp file, then rename: a crash never leaves a half-written file.
export function writeJson(file, value) {
  writeAtomic(file, JSON.stringify(value, null, 2) + "\n");
}
export function writeAtomic(file, text) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, text, "utf8");
  fs.renameSync(tmp, file);
}

function stripUndefined(o) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}
