// broll/depth.mjs: how far away each point of a still is, on this computer
// (docs/BUILD_PLAN.md phase 1b). Depth Anything V2 Small, Apache 2.0: only the
// Small size carries that license, the larger ones are non-commercial. The ONNX
// export is downloaded once and checked against a pinned hash; it runs on the
// ONNX runtime the free voice already uses. The picture goes in and out through
// ffmpeg, so no image library comes with it.

import fs from "node:fs";
import path from "node:path";
import { dataDir } from "../tools.mjs";
import { ffmpegRun } from "../audio.mjs";
import { fetchFile } from "../providers/tts/kokoro.mjs";

const REPO = "https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/4472b7362082ad9968fee890ca0f1e5aca36b93d";
export const DEPTH_MODEL = { file: "model_quantized.onnx", url: `${REPO}/onnx/model_quantized.onnx`, sha256: "fcf51f1b230362b28690bb9d1809bf0431f29cad20534e3f589bd7285547f20d", bytes: 27258801, license: "Apache-2.0" };

// The model takes multiples of 14 pixels. 16:9 at about its native 518 px.
export const DEPTH_WIDTH = 924;
export const DEPTH_HEIGHT = 518;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

export const depthModelDir = (env = process.env) => path.join(dataDir(env), "models", "depth-anything-v2-small");
export const depthModelFile = (env = process.env) => path.join(depthModelDir(env), DEPTH_MODEL.file);

/** The model on this computer (downloaded once, 27 MB). */
export async function ensureDepthModel({ env = process.env, fetchImpl = fetch, onProgress = () => {} } = {}) {
  await fetchFile({ url: DEPTH_MODEL.url, sha: DEPTH_MODEL.sha256, out: depthModelFile(env), fetchImpl, label: "depth model", what: "the depth model", onProgress });
  return depthModelFile(env);
}

// Packed RGB bytes to the model's planar, normalized input. Pure, the tests call it.
export function toTensorData(rgb, width, height) {
  const n = width * height;
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) out[c * n + i] = (rgb[i * 3 + c] / 255 - MEAN[c]) / STD[c];
  }
  return out;
}

// The model's relative depth to 8 bit gray, 255 the nearest. A few stray pixels
// must not set the scale, so it stretches between the 1st and 99th percentile.
export function toGray(depth) {
  const sorted = Float32Array.from(depth).sort();
  const lo = sorted[Math.floor(sorted.length * 0.01)];
  const hi = sorted[Math.floor(sorted.length * 0.99)];
  const span = hi - lo || 1;
  const out = new Uint8Array(depth.length);
  for (let i = 0; i < depth.length; i++) out[i] = Math.max(0, Math.min(255, Math.round(((depth[i] - lo) / span) * 255)));
  return out;
}

let session = null;
async function loadSession(env) {
  if (session) return session;
  const ort = await import("onnxruntime-node");
  session = { ort, run: await ort.InferenceSession.create(depthModelFile(env), { executionProviders: ["cpu"] }) };
  return session;
}

/**
 * The depth map of a 16:9 picture as a gray PNG. Softened a little and grown
 * toward the near side, so a moving edge carries a little background with it
 * instead of tearing the object apart.
 */
export async function depthMap({ image, out, width = 1920, height = 1080, env = process.env, onProgress = () => {} }) {
  await ensureDepthModel({ env, onProgress });
  onProgress({ step: "depth" });
  const raw = `${out}.rgb`;
  const gray = `${out}.gray`;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  try {
    await ffmpegRun(["-i", image, "-frames:v", "1", "-vf", `scale=${DEPTH_WIDTH}:${DEPTH_HEIGHT}:flags=bicubic`, "-f", "rawvideo", "-pix_fmt", "rgb24", raw], env);
    const rgb = fs.readFileSync(raw);
    if (rgb.length !== DEPTH_WIDTH * DEPTH_HEIGHT * 3) throw new Error("The picture could not be read for its depth.");
    const { ort, run } = await loadSession(env);
    const input = new ort.Tensor("float32", toTensorData(rgb, DEPTH_WIDTH, DEPTH_HEIGHT), [1, 3, DEPTH_HEIGHT, DEPTH_WIDTH]);
    const result = await run.run({ [run.inputNames[0]]: input });
    const output = result[run.outputNames[0]];
    const [h, w] = output.dims.slice(-2);
    fs.writeFileSync(gray, toGray(output.data));
    await ffmpegRun(["-f", "rawvideo", "-pix_fmt", "gray", "-video_size", `${w}x${h}`, "-i", gray, "-frames:v", "1", "-vf", `dilation,gblur=sigma=2.5,scale=${width}:${height}:flags=bicubic,format=gray`, out], env);
  } finally {
    fs.rmSync(raw, { force: true });
    fs.rmSync(gray, { force: true });
  }
  return out;
}
