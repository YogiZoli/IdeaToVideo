// recorded/matte.mjs: the person apart from the background, on this computer
// (docs/BUILD_PLAN.md phase 2). MODNet (Apache 2.0) on the ONNX runtime the free
// voice already uses, downloaded once and checked against a pinned hash. It reads a
// video through ffmpeg and writes a gray video of masks; ffmpeg then builds the two
// things the composition mounts: a cut-out clip for a big word to sit behind, and the
// dark figure with its rim light. Both are VP9 with alpha.

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { dataDir } from "../tools.mjs";
import { bins } from "../audio.mjs";
import { fetchFile } from "../providers/tts/kokoro.mjs";
import { ffmpegProgress } from "./edit.mjs";
import { FPS } from "./cuts.mjs";

const REPO = "https://huggingface.co/Xenova/modnet/resolve/fa2fa546052fba4c08921230a26cc69a333fca12";
export const MATTE_MODEL = { file: "model.onnx", url: `${REPO}/onnx/model.onnx`, sha256: "07c308cf0fc7e6e8b2065a12ed7fc07e1de8febb7dc7839d7b7f15dd66584df9", bytes: 25888640, license: "Apache-2.0" };
export const MATTE_FPS = 15;
const INPUT_WIDTH = 512;
const r3 = (x) => Math.round(x * 1000) / 1000;

export const matteDir = (env = process.env) => path.join(dataDir(env), "models", "modnet");
export const matteFile = (env = process.env) => path.join(matteDir(env), MATTE_MODEL.file);

export async function ensureMatte({ env = process.env, fetchImpl = fetch, onProgress = () => {} } = {}) {
  await fetchFile({ url: MATTE_MODEL.url, sha: MATTE_MODEL.sha256, out: matteFile(env), fetchImpl, label: "person model", what: "the person cut-out model", onProgress });
  return matteFile(env);
}

/** The model's input size for a picture: multiples of 32, about 512 wide. Pure. */
export function inputSize(width, height) {
  const h = Math.max(32, Math.round((INPUT_WIDTH * height) / width / 32) * 32);
  return { width: INPUT_WIDTH, height: h };
}

/** Packed RGB to the model's planar input, -1 to 1. Pure. */
export function toInput(rgb, width, height) {
  const n = width * height;
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) out[c * n + i] = (rgb[i * 3 + c] - 127.5) / 127.5;
  }
  return out;
}

/**
 * The model's answer to 8 bit gray: hard where it is sure, soft at the edge, and
 * steadied with the frame before, so the edge does not boil. Pure.
 */
export function toMask(matte, previous = null, { low = 0.12, high = 0.88, keep = 0.15 } = {}) {
  const out = new Uint8Array(matte.length);
  for (let i = 0; i < matte.length; i++) {
    let v = (matte[i] - low) / (high - low);
    v = v < 0 ? 0 : v > 1 ? 1 : v;
    out[i] = previous ? Math.round(v * 255 * (1 - keep) + previous[i] * keep) : Math.round(v * 255);
  }
  return out;
}

let session = null;
async function loadSession(env) {
  if (session) return session;
  const ort = await import("onnxruntime-node");
  session = { ort, run: await ort.InferenceSession.create(matteFile(env), { executionProviders: ["cpu"] }) };
  return session;
}

/** The model out of memory, before the process ends. */
export async function releaseMatte() {
  const s = session;
  session = null;
  if (s) await s.run.release();
}

/**
 * A gray video of the person in one stretch of a file. `from`, `seconds` in the
 * file's own time; the masks come at MATTE_FPS and ffmpeg blends between them.
 */
export async function personMasks({ file, out, width, height, from = 0, seconds, env = process.env, signal, onPercent = () => {}, onProgress = () => {} }) {
  await ensureMatte({ env, onProgress });
  const { ort, run } = await loadSession(env);
  const size = inputSize(width, height);
  const bytes = size.width * size.height * 3;
  const { ffmpeg } = bins(env);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const dec = spawn(ffmpeg, ["-hide_banner", "-loglevel", "error", ...(from ? ["-ss", String(from)] : []), "-i", file, ...(seconds ? ["-t", String(seconds)] : []), "-an", "-vf", `fps=${MATTE_FPS},scale=${size.width}:${size.height}:flags=bilinear`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { windowsHide: true, signal });
  const enc = spawn(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "gray", "-s", `${size.width}x${size.height}`, "-r", String(MATTE_FPS), "-i", "-", "-c:v", "libx264", "-preset", "veryfast", "-crf", "12", "-pix_fmt", "yuv420p", out], { windowsHide: true });
  let err = "";
  dec.stderr.on("data", (d) => (err += d));
  enc.stderr.on("data", (d) => (err += d));
  enc.stdin.on("error", () => {});
  const closed = new Promise((resolve, reject) => {
    enc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`The person masks could not be written: ${err.trim().split(/\r?\n/).slice(-1)[0] ?? ""}`))));
    enc.on("error", reject);
  });
  let previous = null;
  let n = 0;
  let carry = Buffer.alloc(0);
  let shown = -1;
  for await (const chunk of dec.stdout) {
    carry = carry.length ? Buffer.concat([carry, chunk]) : chunk;
    while (carry.length >= bytes) {
      const frame = carry.subarray(0, bytes);
      carry = carry.subarray(bytes);
      const input = new ort.Tensor("float32", toInput(frame, size.width, size.height), [1, 3, size.height, size.width]);
      const result = await run.run({ [run.inputNames[0]]: input });
      const mask = toMask(result[run.outputNames[0]].data, previous);
      previous = mask;
      n++;
      if (!enc.stdin.write(Buffer.from(mask.buffer, mask.byteOffset, mask.byteLength))) await new Promise((r) => enc.stdin.once("drain", r));
      const pct = seconds ? Math.min(99, Math.round((n / MATTE_FPS / seconds) * 100)) : 0;
      if (pct !== shown) {
        shown = pct;
        onPercent(pct);
      }
    }
  }
  enc.stdin.end();
  await closed;
  if (!n) throw new Error("No picture could be read for the person masks.");
  return { file: out, frames: n };
}

/** One stretch of a video with only the person left, on see-through. */
export async function cutoutClip({ file, mask, out, from, seconds, width = 1920, height = 1080, env = process.env, signal }) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const filter = [
    `[0:v]fps=${FPS},scale=${width}:${height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${width}:${height},format=yuva420p[pic]`,
    `[1:v]framerate=fps=${FPS},scale=${width}:${height}:force_original_aspect_ratio=increase:flags=bicubic,crop=${width}:${height},format=gray,gblur=sigma=1.2[a]`,
    "[pic][a]alphamerge,format=yuva420p[out]",
  ].join(";");
  await ffmpegProgress(["-ss", String(r3(from)), "-t", String(r3(seconds)), "-i", file, "-i", mask, "-filter_complex", filter, "-map", "[out]", "-t", String(r3(seconds)), "-an", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-deadline", "realtime", "-cpu-used", "6", "-crf", "24", "-b:v", "0", out], { env, signal });
  return out;
}

/**
 * The dark figure with a thin rim light on the side it faces, on see-through. The
 * rim is what the mask has and a slightly moved copy of itself does not.
 */
export async function silhouetteClip({ mask, out, seconds, figure = "#0a0b0e", rim = "#fff4e0", rimSide = 1, width = 1920, height = 1080, env = process.env, signal, onPercent }) {
  const hex = (c) => c.replace("#", "0x");
  const shift = 5 * rimSide;
  const filter = [
    `color=c=${hex(figure)}:s=${width}x${height}:r=${FPS},format=yuva420p[dark]`,
    `color=c=${hex(rim)}:s=${width}x${height}:r=${FPS},format=yuva420p[light]`,
    `[0:v]framerate=fps=${FPS},scale=${width}:${height}:force_original_aspect_ratio=increase:flags=bicubic,crop=${width}:${height},format=gray,lut=y='clip((val-110)*6,0,255)',gblur=sigma=1.2,split=3[m1][m2][m3]`,
    `[m2]pad=${width + Math.abs(shift)}:${height}:${shift > 0 ? shift : 0}:0:black,crop=${width}:${height}:${shift > 0 ? 0 : Math.abs(shift)}:0[moved]`,
    "[m1][moved]blend=all_mode=subtract,gblur=sigma=0.7,format=gray,lut=y='clip(val*2,0,255)'[edge]",
    "[dark][light][edge]maskedmerge[paint]",
    "[paint][m3]alphamerge,format=yuva420p[out]",
  ].join(";");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await ffmpegProgress(["-i", mask, "-filter_complex", filter, "-map", "[out]", "-t", String(r3(seconds)), "-an", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-deadline", "realtime", "-cpu-used", "6", "-crf", "26", "-b:v", "0", out], { env, signal, seconds, onPercent });
  return out;
}
