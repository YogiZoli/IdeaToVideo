// project.mjs: one video = one folder (SPEC 4.3) with project.json as the
// source of truth (SPEC 4.4). Re-running a gate invalidates every later gate
// (SPEC 6).

import fs from "node:fs";
import path from "node:path";
import { validate, loadSchema } from "./schema/validate.mjs";

// The order of the work, as the tabs show it since DECISIONS 85: the avatar
// before the preview, because the preview build puts the avatar clips in.
// (Until 2026-10-06 the avatar was last here, so every preview build reset
// an approved, paid avatar to todo: Zoltan's test.)
export const GATES = ["script", "voice", "scenes", "avatar", "review"];
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

export function createProject({ projectsDir, title, language = "en", brief = null, autopilot = false, identity = null, now = new Date() }) {
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
    ...(identity ? { identity } : {}),
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

// A gate left "running" by a runner that no longer exists (the app was
// closed, crashed, or the step was stopped) would show "Running" forever. It
// becomes failed, so the UI offers to run it again. `live`: the ONE Videos
// the app's core knows a step really works on now (jobs.rs live_projects);
// without it (tests, command line) the runner's process id decides, and a
// gate with no pid (older projects) counts as interrupted too.
export const INTERRUPTED = "Interrupted: this step stopped before it finished (it was stopped, it stopped answering, or the app was closed). Run it again; nothing else is lost.";
const normPath = (p) => String(p).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
const samePath = (a, b) => normPath(a) === normPath(b);
export function recoverInterrupted(project, alive = pidAlive, { dir = null, live = null } = {}) {
  const running = (gate) => (Array.isArray(live) && dir ? live.some((p) => samePath(p, dir)) : !!(gate.pid && alive(gate.pid)));
  let next = project;
  for (const g of GATES) {
    const gate = next.gates[g];
    if (gate?.state === "running" && !running(gate)) {
      next = structuredClone(next);
      next.gates[g] = { state: "failed", ...(gate.mode ? { mode: gate.mode } : {}), at: gate.at ?? new Date().toISOString(), error: INTERRUPTED };
    }
  }
  if (next.render?.state === "running" && !running(next.render)) {
    next = structuredClone(next);
    next.render = { ...next.render, state: "failed", error: INTERRUPTED };
    delete next.render.pid;
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

// The ONE Video's own log.txt. A log line never fails the step it describes.
export function appendLog(dir, line) {
  try {
    fs.appendFileSync(path.join(dir, "log.txt"), `${new Date().toISOString()} ${line}\n`);
  } catch {
    // the folder went away or is locked: the app's own log still has the step
  }
}

// Write to a temp file, then rename: a crash never leaves a half-written file.
export function writeJson(file, value) {
  writeAtomic(file, JSON.stringify(value, null, 2) + "\n");
}
// The temp name is this process's own, so two runners never share one; on
// Windows a rename can briefly fail while a virus scanner, a cloud sync or
// another reader holds the file, so it is tried again for about two seconds.
const BUSY = new Set(["EPERM", "EBUSY", "EACCES", "ENOTEMPTY"]);
let tmpSeq = 0;
export function writeAtomic(file, text, { tries = 20, waitMs = 100 } = {}) {
  const tmp = `${file}.${process.pid}-${++tmpSeq}.tmp`;
  fs.writeFileSync(tmp, text, "utf8");
  for (let i = 1; ; i++) {
    try {
      fs.renameSync(tmp, file);
      return;
    } catch (e) {
      if (!BUSY.has(e.code) || i >= tries) {
        fs.rmSync(tmp, { force: true });
        throw e;
      }
      sleepSync(waitMs);
    }
  }
}
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function stripUndefined(o) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}
