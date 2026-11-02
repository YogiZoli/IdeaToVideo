// broll/parallax.mjs: a still becomes a short moving clip (docs/BUILD_PLAN.md
// phase 1b). We write the composition, HyperFrames makes the frames, like every
// other picture in the app: one <canvas> whose shader moves the camera over the
// still and its depth map, seeked by the engine's timeline. The near parts move
// more than the far ones, so the picture has real depth. All local, 0 USD.

import fs from "node:fs";
import path from "node:path";
import { engineDir, renderBrowser, runHyperframes } from "../tools.mjs";
import { ffmpegRun } from "../audio.mjs";
import { renderTemp } from "../gates/render/index.mjs";
import { depthMap } from "./depth.mjs";

export const WIDTH = 1920;
export const HEIGHT = 1080;
export const MIN_SECONDS = 4;
export const MAX_SECONDS = 6;

// Each move: the zoom at both ends, the camera's pan, and how far the depth
// shifts the picture (x, y) from start to end, as parts of the frame.
export const MOVES = {
  "push-in": { label: "Push in", zoom: [1.04, 1.16], pan: [[0, 0], [0, 0]], shift: [[0, 0], [0, 0]], radial: [0, 0.05] },
  drift: { label: "Drift", zoom: [1.1, 1.12], pan: [[-0.02, 0], [0.02, 0]], shift: [[-0.018, 0], [0.018, 0]], radial: [0, 0] },
  orbit: { label: "Orbit", zoom: [1.12, 1.12], pan: [[0.008, -0.006], [-0.008, 0.006]], shift: [[0.024, -0.008], [-0.024, 0.008]], radial: [0, 0] },
};
export const MOVE_IDS = Object.keys(MOVES);

/** The move of a clip: the same clip number always gets the same one. */
export const moveFor = (n = 0) => MOVE_IDS[Math.abs(Number(n) || 0) % MOVE_IDS.length];

export const clipSeconds = (seconds) => Math.max(MIN_SECONDS, Math.min(MAX_SECONDS, Math.ceil(Number(seconds) - 0.05) || MIN_SECONDS));

// The shader: for each screen point it looks for the spot of the still that
// lands there, walking the depth a few times, because that spot's own depth
// decides how far it moved. Near = 1, the plane in focus stays put.
const FRAGMENT = `precision highp float;
uniform sampler2D still;
uniform sampler2D depth;
uniform float zoom;
uniform vec2 pan;
uniform vec2 shift;
uniform float radial;
varying vec2 uv;
const float FOCUS = 0.35;
void main() {
  vec2 p = (uv - 0.5) / zoom + 0.5 + pan;
  vec2 dir = shift + (p - 0.5) * radial;
  float d = texture2D(depth, p).r;
  for (int i = 0; i < 8; i++) {
    d = mix(d, texture2D(depth, clamp(p - dir * (d - FOCUS), 0.0, 1.0)).r, 0.6);
  }
  gl_FragColor = vec4(texture2D(still, clamp(p - dir * (d - FOCUS), 0.0, 1.0)).rgb, 1.0);
}`;

/** The composition of one clip. Pure, the tests read it. */
export function parallaxHtml({ seconds, move = "push-in", still = "still.jpg", depth = "depth.png" }) {
  const m = MOVES[move];
  if (!m) throw new Error(`Unknown camera move: ${move}.`);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${WIDTH}, height=${HEIGHT}" />
    <title>Moving still</title>
    <style>
      html, body { margin: 0; background: #000; }
      #main { position: relative; width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
      #view { position: absolute; left: 0; top: 0; width: ${WIDTH}px; height: ${HEIGHT}px; }
      .src { position: absolute; left: 0; top: 0; width: 1px; height: 1px; opacity: 0; }
    </style>
    <script src="gsap.min.js"></script>
  </head>
  <body>
    <div id="main" data-composition-id="main" data-start="0" data-duration="${seconds}" data-width="${WIDTH}" data-height="${HEIGHT}" data-fps="30">
      <img id="still" class="src" src="${still}" alt="" />
      <img id="depth" class="src" src="${depth}" alt="" />
      <canvas id="view" width="${WIDTH}" height="${HEIGHT}"></canvas>
    </div>
    <script>
      var MOVE = ${JSON.stringify(m)};
      var canvas = document.getElementById("view");
      var gl = canvas.getContext("webgl", { preserveDrawingBuffer: true, antialias: false });
      var program = gl.createProgram();
      function shader(type, text) {
        var s = gl.createShader(type);
        gl.shaderSource(s, text);
        gl.compileShader(s);
        gl.attachShader(program, s);
      }
      shader(gl.VERTEX_SHADER, "attribute vec2 at; varying vec2 uv; void main() { uv = vec2(at.x * 0.5 + 0.5, 0.5 - at.y * 0.5); gl_Position = vec4(at, 0.0, 1.0); }");
      shader(gl.FRAGMENT_SHADER, ${JSON.stringify(FRAGMENT)});
      gl.linkProgram(program);
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(gl.getAttribLocation(program, "at"));
      gl.vertexAttribPointer(gl.getAttribLocation(program, "at"), 2, gl.FLOAT, false, 0, 0);
      var loaded = false;
      function texture(unit, id, name) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, document.getElementById(id));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.uniform1i(gl.getUniformLocation(program, name), unit);
      }
      function ready() {
        return document.getElementById("still").complete && document.getElementById("depth").complete;
      }
      var state = { t: 0 };
      function mix(a, b, t) { return a + (b - a) * t; }
      function draw() {
        if (!ready()) return;
        if (!loaded) {
          texture(0, "still", "still");
          texture(1, "depth", "depth");
          loaded = true;
        }
        var t = state.t;
        gl.uniform1f(gl.getUniformLocation(program, "zoom"), mix(MOVE.zoom[0], MOVE.zoom[1], t));
        gl.uniform2f(gl.getUniformLocation(program, "pan"), mix(MOVE.pan[0][0], MOVE.pan[1][0], t), mix(MOVE.pan[0][1], MOVE.pan[1][1], t));
        gl.uniform2f(gl.getUniformLocation(program, "shift"), mix(MOVE.shift[0][0], MOVE.shift[1][0], t), mix(MOVE.shift[0][1], MOVE.shift[1][1], t));
        gl.uniform1f(gl.getUniformLocation(program, "radial"), mix(MOVE.radial[0], MOVE.radial[1], t));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      window.__timelines = window.__timelines || {};
      var tl = gsap.timeline({ paused: true, onUpdate: draw });
      tl.to(state, { t: 1, duration: ${seconds}, ease: "sine.inOut" }, 0);
      window.__timelines["main"] = tl;
      window.addEventListener("load", draw);
    </script>
  </body>
</html>
`;
}

/**
 * A still (any size, cropped to 16:9 from the middle) as a silent 1080p clip.
 * Returns { file, seconds, move, stillFile }. `keepStill`: where the cropped
 * still stays, so an AI clip can start from it later.
 */
export async function parallaxClip({ image, out, seconds = 5, move = "push-in", keepStill = null, env = process.env, signal, onProgress = () => {}, run = runHyperframes, browserFor = renderBrowser }) {
  const length = clipSeconds(seconds);
  const browser = await browserFor({ env, onProgress: (p) => onProgress({ step: "browser", message: p.message ?? "Downloading the render browser" }) });
  const dir = renderTemp(env);
  try {
    const still = path.join(dir, "still.jpg");
    await ffmpegRun(["-i", image, "-frames:v", "1", "-vf", `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase:flags=lanczos,crop=${WIDTH}:${HEIGHT}`, "-q:v", "2", still], env);
    await depthMap({ image: still, out: path.join(dir, "depth.png"), width: WIDTH, height: HEIGHT, env, onProgress });
    fs.copyFileSync(path.join(engineDir(env), "node_modules", "gsap", "dist", "gsap.min.js"), path.join(dir, "gsap.min.js"));
    fs.writeFileSync(path.join(dir, "index.html"), parallaxHtml({ seconds: length, move }));
    onProgress({ step: "parallax", move });
    const tmp = path.join(dir, "clip.mp4");
    const r = await run(["render", "-o", tmp, "--quality", "standard"], { env, cwd: dir, browser: browser.path, signal });
    if (r.code !== 0 || !fs.existsSync(tmp)) throw new Error(`The moving still could not be rendered: ${r.tail.split("\n").slice(-4).join(" ")}`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.copyFileSync(tmp, out);
    if (keepStill) {
      fs.mkdirSync(path.dirname(keepStill), { recursive: true });
      fs.copyFileSync(still, keepStill);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return { file: out, seconds: length, move };
}
