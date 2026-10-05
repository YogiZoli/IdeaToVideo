// gates/avatar: gate 5, optional. An avatar says the opening and/or the
// closing of the video, full screen, on the theme's background color, lip-
// synced to the video's own narration (DECISIONS 47, 61). The clips land in
// avatar/ with avatar.json; the assembler puts them over the first and the last
// scene, so the video is built again at gate 4 and rendered.
//
// A clip is cut from the narration exactly where its scene starts and ends
// (the scene table's timing), so it fits the video to the frame.

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { sceneTimes, baseTheme } from "../build/assemble.mjs";
import { duration, bins } from "../../audio.mjs";
import * as heygen from "../../providers/avatar/heygen.mjs";

export const SEGMENTS = { open: { label: "Opening", scene: "first" }, close: { label: "Closing", scene: "last" } };

// Where and how the avatar sits (Zoltan, 2026-10-01): a default in Settings,
// changeable per video. cutout = transparent background (HeyGen WebM), the
// person only; circle and card crop the face out of a normal clip, so they
// need no background removal and nothing is stretched; full = the whole frame.
export const STYLES = ["cutout", "circle", "card", "full"];
export const POSITIONS = ["bottom-right", "bottom-left", "top-right", "top-left"];
export const SIZES = ["small", "medium", "large"];
export const DEFAULT_LAYOUT = { style: "cutout", position: "bottom-right", size: "medium" };

export function normalizeLayout(l = {}) {
  return {
    style: STYLES.includes(l?.style) ? l.style : DEFAULT_LAYOUT.style,
    position: POSITIONS.includes(l?.position) ? l.position : DEFAULT_LAYOUT.position,
    size: SIZES.includes(l?.size) ? l.size : DEFAULT_LAYOUT.size,
  };
}

const r3 = (x) => Math.round(x * 1000) / 1000;
const read = (projectDir, f) => JSON.parse(fs.readFileSync(path.join(projectDir, f), "utf8"));
export const avatarDir = (projectDir) => path.join(projectDir, "avatar");
const avatarJson = (projectDir) => path.join(avatarDir(projectDir), "avatar.json");

export function currentAvatar(projectDir) {
  try {
    return JSON.parse(fs.readFileSync(avatarJson(projectDir), "utf8"));
  } catch {
    return null;
  }
}

// Where the opening and the closing are, from the approved scene table.
export async function avatarPlan(projectDir, { env = process.env } = {}) {
  const scenes = read(projectDir, "scenes.json").scenes ?? [];
  const sentences = read(projectDir, "sentences.json");
  if (!scenes.length) throw new Error("There is no scene table yet.");
  const total = r3(await duration(path.join(projectDir, "audio", "vo_bgm.mp3"), env));
  const times = sceneTimes(scenes, sentences, total);
  const at = (i) => ({ start: times[i].start, duration: times[i].duration });
  const segments = [{ name: "open", label: SEGMENTS.open.label, ...at(0) }];
  if (scenes.length > 1) segments.push({ name: "close", label: SEGMENTS.close.label, ...at(scenes.length - 1) });
  return { segments, current: currentAvatar(projectDir) };
}

function ffmpeg(args, env) {
  const { ffmpeg: bin } = bins(env);
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ["-hide_banner", "-loglevel", "error", "-y", ...args], { windowsHide: true });
    let err = "";
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg failed: ${err.slice(-300)}`))));
  });
}

// The narration (no music) of one stretch, as an mp3 for upload.
export async function cutNarration(projectDir, { start, duration: seconds }, out, { env = process.env } = {}) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await ffmpeg(["-ss", String(start), "-t", String(seconds), "-i", path.join(projectDir, "audio", "vo.mp3"), "-c:a", "libmp3lame", "-b:a", "192k", "-ar", "44100", out], env);
  return out;
}

const voBytes = (projectDir) => fs.statSync(path.join(projectDir, "audio", "vo.mp3")).size;

// Gate 5: make the clips. `which` = ["open", "close"] or one of them.
export async function makeAvatar({ projectDir, apiKey, lookId, which = ["open", "close"], look, layout: wanted, env = process.env, fetchImpl = fetch, sleep, onProgress = () => {} }) {
  const layout = normalizeLayout(wanted);
  let format = layout.style === "cutout" ? "webm" : "mp4";
  let note = null;
  if (!lookId) throw new Error("Choose an avatar first.");
  const plan = await avatarPlan(projectDir, { env });
  const chosen = plan.segments.filter((s) => which.includes(s.name));
  if (!chosen.length) throw new Error("Choose the opening, the closing, or both.");
  const dir = avatarDir(projectDir);
  const background = baseTheme(look).bg;
  const jobs = [];
  for (const [i, seg] of chosen.entries()) {
    onProgress({ step: "upload", segment: seg.label, n: i + 1, of: chosen.length });
    const audio = await cutNarration(projectDir, seg, path.join(dir, `${seg.name}.mp3`), { env });
    const assetId = await heygen.uploadAudio({ apiKey, file: audio, fetchImpl });
    const title = `IdeaToVideo ${path.basename(projectDir)} ${seg.name}`;
    let id;
    try {
      id = await heygen.createVideo({ apiKey, avatarId: lookId, audioAssetId: assetId, background, title, format, full: layout.style === "full", fetchImpl });
    } catch (e) {
      // an older look without background removal: a card instead, said plainly
      if (format !== "webm" || !heygen.noMatting(e)) throw e;
      format = "mp4";
      layout.style = "card";
      note = "This look has no background removal at HeyGen, so it is shown as a card instead of a cut-out.";
      id = await heygen.createVideo({ apiKey, avatarId: lookId, audioAssetId: assetId, background, title, format, fetchImpl });
    }
    jobs.push({ seg, id, format });
  }
  const done = [];
  for (const f of fs.readdirSync(dir)) if (/^(open|close)\.(mp4|webm)$/.test(f)) fs.rmSync(path.join(dir, f), { force: true });
  for (const [i, { seg, id, format: fmt }] of jobs.entries()) {
    const out = path.join(dir, `${seg.name}.${fmt}`);
    await heygen.waitAndDownload({ apiKey, id, out, fetchImpl, ...(sleep ? { sleep } : {}), onStatus: (status) => onProgress({ step: "heygen", segment: seg.label, status, n: i + 1, of: jobs.length }) });
    done.push({ name: seg.name, label: seg.label, start: seg.start, duration: seg.duration, file: `avatar/${seg.name}.${fmt}`, videoId: id });
  }
  const record = { lookId, background, format, layout, note, voBytes: voBytes(projectDir), segments: done, at: new Date().toISOString() };
  fs.writeFileSync(avatarJson(projectDir), JSON.stringify(record, null, 2) + "\n");
  return record;
}

// A new place or size, or another style, for the clips already made: no new
// HeyGen video, no cost. Only a cut-out needs clips with transparency.
export function setLayout(projectDir, wanted) {
  const a = currentAvatar(projectDir);
  if (!a) throw new Error("There are no avatar clips yet.");
  const layout = normalizeLayout(wanted);
  if (layout.style === "cutout" && a.format !== "webm") throw new Error("A cut-out needs clips with a transparent background. Make the clips again with Cut-out chosen.");
  const record = { ...a, layout };
  fs.writeFileSync(avatarJson(projectDir), JSON.stringify(record, null, 2) + "\n");
  return record;
}

export function removeAvatar(projectDir) {
  fs.rmSync(avatarDir(projectDir), { recursive: true, force: true });
}

// For the assembler: the clips, if they still belong to this narration.
export function avatarClips(projectDir) {
  const a = currentAvatar(projectDir);
  if (!a?.segments?.length) return [];
  if (a.voBytes !== voBytes(projectDir)) throw new Error("The avatar clips were made for an earlier voice. Make them again on the 4. Avatar tab, or remove them there.");
  for (const s of a.segments) if (!fs.existsSync(path.join(projectDir, s.file))) throw new Error(`The avatar clip ${s.file} is missing. Make it again on the 4. Avatar tab.`);
  return a.segments.map((s) => ({ ...s, layout: normalizeLayout(a.layout ?? { style: "full" }) }));
}
