// channels/night.mjs: the Night shift's files (DECISIONS 182). The videos of one Identity that can
// still be made, grouped as they belong together, and the shift itself in one file, so a restart
// goes on and the morning list is there. The steps run in the window (app/src/lib/night.svelte.ts),
// through the same commands as always.

import fs from "node:fs";
import path from "node:path";
import { loadProject, saveProject, writeJson, appendLog } from "../project.mjs";
import { loadRecipe, recipeFor, defaultRecipe } from "./recipe.mjs";

export const NIGHT_FILE = "night-shift.json";

/** Every video not finished yet, by playlist or week batch, in their order. */
export function nightCandidates(projectsDir) {
  if (!projectsDir || !fs.existsSync(projectsDir)) return { groups: [] };
  const groups = new Map();
  for (const name of fs.readdirSync(projectsDir)) {
    const dir = path.join(projectsDir, name);
    let p;
    try {
      if (!fs.statSync(dir).isDirectory()) continue;
      p = loadProject(dir);
    } catch {
      continue; // not a project folder
    }
    if (p.render?.state === "done" && p.gates?.review?.state === "approved") continue;
    const key = p.series ? `playlist:${p.series.courseSlug}` : p.queue ? `batch:${p.queue.batch}` : "other";
    const title = p.series ? `Playlist: ${p.series.courseTitle ?? p.series.courseSlug}` : p.queue ? `Week batch ${String(p.queue.batch).slice(0, 10)}` : "Other videos";
    if (!groups.has(key)) groups.set(key, { key, title, videos: [] });
    groups.get(key).videos.push({ dir, title: p.title, status: p.status, position: p.series?.playlistPosition ?? p.queue?.position ?? null, createdAt: p.createdAt ?? "", engine: p.recipe?.engine ?? "script" });
  }
  const order = (g) => (g.key === "other" ? 2 : g.key.startsWith("playlist:") ? 0 : 1);
  const list = [...groups.values()].sort((a, b) => order(a) - order(b) || a.title.localeCompare(b.title));
  for (const g of list) g.videos.sort((a, b) => (a.position ?? 1e9) - (b.position ?? 1e9) || String(a.createdAt).localeCompare(String(b.createdAt)));
  return { groups: list };
}

export function loadShift(projectsDir) {
  if (!projectsDir) return null;
  try {
    const s = JSON.parse(fs.readFileSync(path.join(projectsDir, NIGHT_FILE), "utf8"));
    return Array.isArray(s?.items) ? s : null;
  } catch {
    return null; // none yet, or a damaged file: no shift to go on with
  }
}

export function saveShift(projectsDir, shift) {
  if (!projectsDir) throw new Error("There is no videos folder for the night shift.");
  fs.mkdirSync(projectsDir, { recursive: true });
  writeJson(path.join(projectsDir, NIGHT_FILE), shift);
  return shift;
}

export function clearShift(projectsDir) {
  if (projectsDir) fs.rmSync(path.join(projectsDir, NIGHT_FILE), { force: true });
  return {};
}

/**
 * A video the Night shift can run: a lesson imported from a playlist has no recipe yet, so it gets
 * its Identity's now. A video that has one keeps it.
 */
export function prepareForNight(projectDir, identityDir) {
  const p = loadProject(projectDir);
  if (p.recipe) return { recipe: p.recipe };
  const recipe = recipeFor(loadRecipe(identityDir) ?? defaultRecipe({}), "script", { language: p.language });
  saveProject(projectDir, { ...p, recipe });
  appendLog(projectDir, "night shift: took the Identity's recipe");
  return { recipe };
}
