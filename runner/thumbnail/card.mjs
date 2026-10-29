// thumbnail/card.mjs: the chosen thumbnail in the Video Publishing Card
// (DECISIONS 131). Optional block "thumbnail", the version stays
// video-publishing-card/1 (fields are only ever added, as "series"). The
// picture rides inside the card as base64, so one request carries it and the
// publishing app needs no new address:
//
//   thumbnail { file, mime, width, height, bytes, sha256, words, withFace, data }
//
// The JPEG is kept under 1 MB (compose.mjs), so the card stays under the
// publishing app's 2 MB. A copy sits next to the video as
// <video>.thumbnail.jpg, for people.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const STATE = path.join("thumbnail", "thumbnail.json");
export const CHOSEN = path.join("thumbnail", "chosen.jpg");

function readState(projectDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(projectDir, STATE), "utf8"));
  } catch {
    return null;
  }
}

// The block for the card of videoFile, or null when no thumbnail is chosen.
export function thumbnailBlock(projectDir, videoFile) {
  const chosen = path.join(projectDir, CHOSEN);
  const state = readState(projectDir);
  if (!state?.chosen || !fs.existsSync(chosen)) return null;
  const bytes = fs.readFileSync(chosen);
  const base = path.basename(videoFile).replace(/\.mp4$/i, "");
  const copy = path.join(path.dirname(videoFile), `${base}.thumbnail.jpg`);
  try {
    fs.copyFileSync(chosen, copy);
  } catch {
    // the copy is for people; the card carries the picture anyway
  }
  return {
    file: `${base}.thumbnail.jpg`,
    mime: "image/jpeg",
    width: state.chosen.width ?? 1280,
    height: state.chosen.height ?? 720,
    bytes: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    words: state.chosen.words ?? null,
    withFace: !!state.chosen.withFace,
    data: bytes.toString("base64"),
  };
}
