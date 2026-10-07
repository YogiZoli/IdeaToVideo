// stock/index.mjs: a stock photo or video into the Identity's footage
// library (DECISIONS 111). What the user picks in the Scenes tab's search is
// downloaded and becomes a clip like the user's own footage, so the scene
// planner places it under a sentence that shows the same thing. A photo
// becomes a slow push-in clip (6 s), so it never stands still. The licence
// record stays with the clip (docs/stock.md 3); nothing goes into the video.

import fs from "node:fs";
import path from "node:path";
import { ffmpegRun } from "../audio.mjs";
import { addClip, footageDir, incomingFootage, loadLibrary } from "../footage/library.mjs";
import { download, LICENSE } from "./pixabay.mjs";

export const PHOTO_SECONDS = 6;

// A photo as a 1920x1080 clip that pushes in slowly (5% over 6 s), cropped
// to 16:9 from the middle; no sound.
export async function photoClip(image, out, { seconds = PHOTO_SECONDS, env = process.env } = {}) {
  const frames = Math.round(seconds * 30);
  const vf = [
    "scale=2304:1296:force_original_aspect_ratio=increase",
    "crop=2304:1296",
    `zoompan=z='1+0.05*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1920x1080:fps=30`,
    "format=yuv420p",
  ].join(",");
  await ffmpegRun(["-i", image, "-vf", vf, "-frames:v", String(frames), "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", out], env);
  return out;
}

// The hit into the library: { clip }. The same Pixabay item twice is not
// downloaded again.
export async function addStock({ identityDir, hit, query = "", fetchImpl, env = process.env }) {
  const lib = loadLibrary(identityDir);
  const have = lib.clips.find((c) => c.credit?.source === "Pixabay" && c.credit?.id === hit.id);
  if (have) return { clip: have, again: true };
  const dir = footageDir(identityDir);
  fs.mkdirSync(dir, { recursive: true });
  const target = incomingFootage(".mp4");
  if (hit.kind === "image") {
    const img = path.join(dir, `pixabay-${hit.id}${path.extname(new URL(hit.download).pathname) || ".jpg"}`);
    await download({ hit, out: img, ...(fetchImpl ? { fetchImpl } : {}) });
    try {
      await photoClip(img, path.join(dir, target), { env });
    } finally {
      fs.rmSync(img, { force: true });
    }
  } else {
    await download({ hit, out: path.join(dir, target), ...(fetchImpl ? { fetchImpl } : {}) });
  }
  const what = hit.tags.split(",").map((t) => t.trim()).filter(Boolean).join(", ");
  const clip = await addClip({
    identityDir,
    file: target,
    name: `${hit.kind === "image" ? "Photo" : "Video"}: ${what.split(", ").slice(0, 3).join(", ") || query}`.slice(0, 80),
    description: `${hit.kind === "image" ? "Stock photo" : "Stock video"} of ${what}${query ? ` (searched for: ${query})` : ""}.`,
    source: "pixabay",
    credit: { source: "Pixabay", id: hit.id, kind: hit.kind, author: hit.author, license: LICENSE.name, licenseUrl: LICENSE.url, pageUrl: hit.pageUrl, at: new Date().toISOString() },
    env,
  });
  return { clip, again: false };
}

const STOP = new Set("a an the of and or but to in on at by for with from into over under about this that these those is are was were be been it its your you we our they their them he she his her i me my not no so if then than as how what why when where who which will can just very more most also only even still there here".split(" "));

// Search words for the video: its title, its section headings, and the
// words its script repeats most (a starting point the user can change).
export function suggestQueries({ title = "", markdown = "" } = {}, max = 6) {
  const out = [];
  const add = (q) => {
    const clean = String(q).replace(/[#*_`>]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
    if (clean && clean.length >= 3 && !out.includes(clean)) out.push(clean);
  };
  if (title) add(title.split(/\s+/).filter((w) => !STOP.has(w.toLowerCase())).slice(0, 4).join(" "));
  for (const m of markdown.matchAll(/^#{2,3}\s+(.+)$/gm)) {
    const words = m[1].replace(/^\d+[.)]\s*/, "").split(/\s+/).filter((w) => !STOP.has(w.toLowerCase()) && !/^(open|teach|own)$/i.test(w));
    if (words.length) add(words.slice(0, 3).join(" "));
  }
  const counts = new Map();
  for (const w of markdown.replace(/^#.*$/gm, "").toLowerCase().match(/\p{L}{4,}/gu) ?? []) if (!STOP.has(w)) counts.set(w, (counts.get(w) ?? 0) + 1);
  for (const [w] of [...counts].sort((a, b) => b[1] - a[1]).slice(0, max)) add(w);
  return out.slice(0, max);
}
