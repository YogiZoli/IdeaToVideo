// recorded/cursor.mjs: the mouse in a screen recording (docs/BUILD_PLAN.md phase 2).
// A recording holds no mouse data, only pixels, so the cursor is found the way a
// person finds it: the small thing that moves over a screen that stands still. A
// click is the cursor stopping and the screen answering next to it. From that come
// the zooms and a smooth cursor path; the composition draws them, and the original
// cursor is painted out of the footage with what was under it.

import { spawn } from "node:child_process";
import { bins } from "../audio.mjs";

export const TRACK_FPS = 15;
export const TRACK_WIDTH = 960;
const TILE = 4;
const DIFF = 22;
const SETTLE = 8; // frames a changed pixel must hold still to count as the screen
const MAX_BLOB = 72; // pixels at the tracking size
const BIG_CHANGE = 0.05;
export const ZOOM = 1.75;
const r2 = (x) => Math.round(x * 100) / 100;
const r4 = (x) => Math.round(x * 10000) / 10000;

/** Connected groups of tiles, each with its box in pixels. Pure. */
export function blobsOf(tiles, cols, rows) {
  const seen = new Uint8Array(tiles.length);
  const out = [];
  const stack = [];
  for (let i = 0; i < tiles.length; i++) {
    if (!tiles[i] || seen[i]) continue;
    let minX = cols;
    let maxX = 0;
    let minY = rows;
    let maxY = 0;
    let count = 0;
    stack.push(i);
    seen[i] = 1;
    while (stack.length) {
      const k = stack.pop();
      const x = k % cols;
      const y = (k - x) / cols;
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const n = ny * cols + nx;
          if (tiles[n] && !seen[n]) {
            seen[n] = 1;
            stack.push(n);
          }
        }
      }
    }
    out.push({ x: minX * TILE, y: minY * TILE, w: (maxX - minX + 1) * TILE, h: (maxY - minY + 1) * TILE, count });
  }
  return out;
}

// Does this box hold what a cursor looks like: a little very bright next to a
// little very dark. A patch of screen rarely has both.
function cursorLook(frame, width, b) {
  let bright = 0;
  let dark = 0;
  let n = 0;
  for (let y = b.y; y < b.y + b.h; y++) {
    for (let x = b.x; x < b.x + b.w; x++) {
      const v = frame[y * width + x];
      if (v === undefined) continue;
      n++;
      if (v > 215) bright++;
      else if (v < 45) dark++;
    }
  }
  return n ? Math.min(bright, dark) / n : 0;
}

/**
 * One frame's first look: everything small that differs from the settled screen,
 * and how much of it is changing right now. Which of them is the cursor is decided
 * over the whole recording (chooseTrack). state: { plate, stable, prev, width, height }.
 */
export function trackStep(state, frame) {
  const { width, height } = state;
  const cols = Math.floor(width / TILE);
  const rows = Math.floor(height / TILE);
  if (!state.plate) {
    state.plate = Uint8Array.from(frame);
    state.prev = Uint8Array.from(frame);
    state.stable = new Uint8Array(frame.length);
    state.tiles = new Uint8Array(cols * rows);
    return { blobs: [], big: false };
  }
  const { plate, prev, stable, tiles } = state;
  tiles.fill(0);
  let changed = 0;
  for (let y = 0; y < rows * TILE; y++) {
    const line = y * width;
    const ty = (y / TILE) | 0;
    for (let x = 0; x < cols * TILE; x++) {
      const i = line + x;
      const v = frame[i];
      if (Math.abs(v - prev[i]) <= 6) {
        if (stable[i] < 255) stable[i]++;
        if (stable[i] >= SETTLE) plate[i] = v;
      } else {
        stable[i] = 0;
      }
      if (Math.abs(v - plate[i]) > DIFF) {
        const t = ty * cols + ((x / TILE) | 0);
        if (!tiles[t]) {
          tiles[t] = 1;
          changed++;
        }
      }
    }
  }
  if (changed / tiles.length > BIG_CHANGE) {
    plate.set(frame);
    stable.fill(0);
    prev.set(frame);
    return { blobs: [], big: true };
  }
  const blobs = blobsOf(tiles, cols, rows).map((b) => {
    let moving = 0;
    let n = 0;
    for (let y = b.y; y < b.y + b.h; y += 2) {
      for (let x = b.x; x < b.x + b.w; x += 2) {
        const i = y * width + x;
        n++;
        if (Math.abs(frame[i] - prev[i]) > 14) moving++;
      }
    }
    return { ...b, moving: n ? moving / n : 0, look: cursorLook(frame, width, b) };
  });
  prev.set(frame);
  return { blobs, big: false };
}

const HOME_CELL = 16;

// How much a blob is a thing on its way: the same size as a blob of the frame before,
// some way off. An animation that plays in place, or grows, gets little of this. Pure.
export function transitOf(b, previous = []) {
  let best = 0;
  for (const p of previous) {
    if (Math.abs(p.w - b.w) > Math.max(12, b.w * 0.35) || Math.abs(p.h - b.h) > Math.max(12, b.h * 0.35)) continue;
    const d = Math.hypot(p.x - b.x, p.y - b.y);
    if (d < 2) continue;
    best = Math.max(best, Math.min(1, d / 12));
  }
  return best;
}

/**
 * Which blob is the cursor, decided over the whole recording. Spots where something
 * keeps changing in place (a playing video, an animation) are ruled out first: a
 * cursor never stays changing in one spot. Then a small search keeps the few best
 * paths through time. A path pays for jumping, for standing still, and for a blob
 * that is not moving, so the winner is the thing that travels. Pure.
 */
export function chooseTrack(steps, { width, height, keep = 8 } = {}) {
  const heat = new Map();
  const cellOf = (b) => `${Math.floor((b.x + b.w / 2) / HOME_CELL)},${Math.floor((b.y + b.h / 2) / HOME_CELL)}`;
  for (const s of steps) for (const b of s.blobs) if (b.w <= MAX_BLOB && b.h <= MAX_BLOB) heat.set(cellOf(b), (heat.get(cellOf(b)) ?? 0) + 1);
  const limit = Math.max(TRACK_FPS * 2.5, steps.length * 0.03);
  const isHome = (b) => (heat.get(cellOf(b)) ?? 0) >= limit;
  const reach = Math.hypot(width, height);
  let paths = [{ cost: 0, x: null, y: null, trail: null }];
  for (let i = 0; i < steps.length; i++) {
    const options = steps[i].blobs.filter((b) => b.w <= MAX_BLOB && b.h <= MAX_BLOB && b.w * b.h >= 32 && !isHome(b)).sort((p, q) => q.moving + q.look * 6 - (p.moving + p.look * 6)).slice(0, 5);
    const next = [];
    for (const p of paths) {
      // standing still costs a little: a stopped cursor melts into the screen
      next.push({ cost: p.cost + (p.x === null ? 0.05 : 0.12), x: p.x, y: p.y, trail: { i, b: null, up: p.trail } });
      for (const b of options) {
        const jump = p.x === null ? 0 : Math.hypot(b.x - p.x, b.y - p.y);
        // only what travels earns its place; something changing in place costs more than waiting
        const pay = Math.min(2.5, jump / (reach * 0.12)) + (b.moving > 0.12 ? 0.25 : 0.5) - transitOf(b, steps[i - 1]?.blobs) * 1.1 - Math.min(0.25, b.look * 8);
        next.push({ cost: p.cost + pay, x: b.x, y: b.y, trail: { i, b, up: p.trail } });
      }
    }
    next.sort((p, q) => p.cost - q.cost);
    const seen = new Set();
    paths = [];
    for (const n of next) {
      const key = n.x === null ? "none" : `${Math.round(n.x / 8)},${Math.round(n.y / 8)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      paths.push(n);
      if (paths.length >= keep) break;
    }
  }
  const chosen = new Array(steps.length).fill(null);
  for (let t = paths[0]?.trail; t; t = t.up) chosen[t.i] = t.b;
  let last = null;
  return steps.map((s, i) => {
    const c = chosen[i];
    if (c) last = c;
    // it stopped a little past its last moving frame: the stopped blob says exactly where
    else if (last) last = s.blobs.find((b) => !isHome(b) && Math.abs(b.w - last.w) <= 16 && Math.abs(b.h - last.h) <= 16 && Math.hypot(b.x - last.x, b.y - last.y) < 40) ?? last;
    const near = s.blobs.filter((b) => b !== c).map((b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2, w: b.w, h: b.h, count: b.count }));
    // something else moving now that the path did not take: the track may be wrong here
    const other = s.blobs.some((b) => b !== c && b.w <= MAX_BLOB && b.h <= MAX_BLOB && b.moving > 0.12 && transitOf(b, steps[i - 1]?.blobs) > 0.5);
    return { t: i / TRACK_FPS, x: last ? last.x : null, y: last ? last.y : null, w: last?.w ?? 0, h: last?.h ?? 0, sure: !!c && c.moving > 0.12, held: !c, other, near, big: s.big };
  });
}

/**
 * Clicks from the tracked frames: the cursor has stopped, and the screen changes
 * close to it (a button, a menu, a new page). `frames`: [{ t, x, y, sure, near, big }].
 */
export function findClicks(frames, { width, radius = 110, gap = 1 } = {}) {
  const clicks = [];
  const reach = radius * (width / TRACK_WIDTH);
  const nothingNear = (f) => !f.big && !(f.near ?? []).some((n) => Math.hypot(n.x - f.x, n.y - f.y) < reach);
  for (let i = 4; i < frames.length; i++) {
    const f = frames[i];
    if (f.x === null || f.x === undefined) continue;
    const before = frames[i - 4];
    const still = before.x !== null && Math.hypot(f.x - before.x, f.y - before.y) < 4;
    if (!still) continue;
    const answered = f.big || (f.near ?? []).some((n) => Math.hypot(n.x - f.x, n.y - f.y) < reach && n.count >= 4);
    if (!answered) continue;
    // the screen must have been quiet just before: a playing video is no click
    if (!nothingNear(frames[i - 2]) || !nothingNear(frames[i - 3])) continue;
    if (clicks.length && f.t - clicks[clicks.length - 1].t < gap) continue;
    clicks.push({ t: f.t, x: f.x, y: f.y });
  }
  return clicks;
}

/** Stops of the cursor long enough to point at something, for videos with few clicks. */
export function findStops(frames, { min = 1.2 } = {}) {
  const stops = [];
  let from = null;
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1];
    const b = frames[i];
    const moving = a.x === null || b.x === null || Math.hypot(b.x - a.x, b.y - a.y) > 3;
    if (moving) {
      if (from !== null && a.t - frames[from].t >= min) stops.push({ t: frames[from].t, x: frames[from].x, y: frames[from].y, seconds: a.t - frames[from].t });
      from = moving && b.x !== null ? i : null;
    } else if (from === null) {
      from = i - 1;
    }
  }
  return stops;
}

/** A smooth path through noisy points: forward and back, so it never lags. Pure. */
export function smoothPath(points, strength = 0.25) {
  const pass = (list) => {
    const out = [];
    let v = list[0];
    for (const p of list) {
      v = v + (p - v) * strength;
      out.push(v);
    }
    return out;
  };
  const once = pass(points);
  return pass(once.reverse()).reverse();
}

/** Missing values filled from their neighbours in time. Pure. */
export function fillGaps(values) {
  const out = values.slice();
  let last = null;
  for (let i = 0; i < out.length; i++) {
    if (out[i] === null) continue;
    if (last !== null && i - last > 1) for (let k = last + 1; k < i; k++) out[k] = out[last] + ((out[i] - out[last]) * (k - last)) / (i - last);
    last = i;
  }
  const first = out.findIndex((v) => v !== null);
  if (first < 0) return out.map(() => 0);
  for (let i = 0; i < first; i++) out[i] = out[first];
  for (let i = (last ?? 0) + 1; i < out.length; i++) out[i] = out[last];
  return out;
}

/**
 * The zooms: clicks close in time and on screen share one. Each lands just before
 * its first click and holds a little past its last. With no clicks at all, the long
 * stops of the cursor are used instead. Pure; x and y are parts of the frame, 0 to 1.
 */
export function zoomPlan(points, total, { closeIn = 3.5, closeBy = 0.3, lead = 0.7, hold = 1.8, minGap = 1.2, longest = 9, rest = 2.5 } = {}) {
  const groups = [];
  for (const p of [...points].sort((a, b) => a.t - b.t)) {
    const g = groups[groups.length - 1];
    if (g && p.t - g.to <= closeIn && p.t - g.from <= longest - hold - lead && Math.hypot(p.x - g.cx, p.y - g.cy) <= closeBy) {
      g.to = p.t;
      g.n++;
      g.cx += (p.x - g.cx) / g.n;
      g.cy += (p.y - g.cy) / g.n;
    } else {
      groups.push({ from: p.t, to: p.t, cx: p.x, cy: p.y, n: 1 });
    }
  }
  const out = [];
  for (const g of groups) {
    const start = Math.max(0, g.from - lead);
    const end = Math.min(total, g.to + hold);
    const prev = out[out.length - 1];
    if (end - start < 1.5) continue;
    // the whole screen comes back now and then, however busy the mouse is
    if (prev && start < prev.end + rest && prev.end - prev.start >= longest - 0.01) continue;
    if (prev && start - prev.end < minGap) {
      // too close to zoom out between them: the view moves over instead
      prev.end = Math.min(end, prev.start + longest);
      prev.path.push({ t: r2(start), x: r4(g.cx), y: r4(g.cy) });
    } else {
      out.push({ start: r2(start), end: r2(end), path: [{ t: r2(start), x: r4(g.cx), y: r4(g.cy) }] });
    }
  }
  return out;
}

/**
 * The view over time, 15 values a second as [x, y, scale]: x, y where the middle of
 * the view looks, parts of the frame. A spring moves it, so zooms start and end
 * softly and nothing jumps. While zoomed it follows the cursor when it leaves the
 * middle. Pure.
 */
export function viewPath(zooms, cursor, total, { scale = ZOOM, fps = TRACK_FPS } = {}) {
  const n = Math.ceil(total * fps) + 1;
  const out = [];
  let x = 0.5;
  let y = 0.5;
  let s = 1;
  let vx = 0;
  let vy = 0;
  let vs = 0;
  const dt = 1 / fps;
  const stiff = 26;
  const damp = 2 * Math.sqrt(stiff);
  let tx = 0.5;
  let ty = 0.5;
  for (let i = 0; i < n; i++) {
    const t = i / fps;
    const z = zooms.find((q) => t >= q.start && t < q.end);
    let want = 1;
    if (z) {
      want = scale;
      const stop = [...z.path].reverse().find((p) => p.t <= t) ?? z.path[0];
      tx = stop.x;
      ty = stop.y;
      const c = cursor?.[i];
      if (c && c[0] !== null) {
        const half = 0.28 / scale;
        if (Math.abs(c[0] - tx) > half) tx = c[0] - Math.sign(c[0] - tx) * half;
        if (Math.abs(c[1] - ty) > half) ty = c[1] - Math.sign(c[1] - ty) * half;
      }
    } else {
      tx = 0.5;
      ty = 0.5;
    }
    vx += (stiff * (tx - x) - damp * vx) * dt;
    vy += (stiff * (ty - y) - damp * vy) * dt;
    vs += (stiff * (want - s) - damp * vs) * dt;
    x += vx * dt;
    y += vy * dt;
    s += vs * dt;
    // the edges of the view stay on the picture
    const margin = 0.5 / Math.max(1, s);
    out.push([r4(Math.max(margin, Math.min(1 - margin, x))), r4(Math.max(margin, Math.min(1 - margin, y))), r4(Math.max(1, s))]);
  }
  return out;
}

/** Reads a video's frames in gray at the tracking size and tracks the cursor through them. */
export function trackFile({ file, width: fileWidth, height: fileHeight, seconds, env = process.env, signal, onPercent = () => {} }) {
  const width = Math.min(TRACK_WIDTH, fileWidth) & ~1;
  const height = Math.round((width * fileHeight) / fileWidth) & ~1;
  const size = width * height;
  return new Promise((resolve, reject) => {
    const p = spawn(bins(env).ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", file, "-an", "-vf", `fps=${TRACK_FPS},scale=${width}:${height}:flags=area,format=gray`, "-f", "rawvideo", "-"], { windowsHide: true, signal });
    const state = { width, height };
    const steps = [];
    let pending = Buffer.alloc(0);
    let err = "";
    let shown = -1;
    p.stderr.on("data", (d) => (err += d));
    p.stdout.on("data", (d) => {
      pending = pending.length ? Buffer.concat([pending, d]) : d;
      while (pending.length >= size) {
        const frame = pending.subarray(0, size);
        steps.push(trackStep(state, frame));
        pending = pending.subarray(size);
      }
      const pct = seconds ? Math.min(99, Math.round((steps.length / TRACK_FPS / seconds) * 100)) : 0;
      if (pct !== shown) {
        shown = pct;
        onPercent(pct);
      }
    });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve({ frames: chooseTrack(steps, { width, height }), width, height }) : reject(new Error(`The screen file could not be read: ${err.trim().split(/\r?\n/).slice(-1)[0] ?? ""}`))));
  });
}

/**
 * Everything the composition needs from a screen file, or { usable: false } when no
 * cursor could be followed: then the video keeps its own cursor and zooms by stops.
 */
export function analyzeTrack({ frames, width, height }, total) {
  const seen = frames.filter((f) => f.x !== null && !f.held);
  const sure = frames.filter((f) => f.sure).length;
  let travel = 0;
  for (let i = 1; i < frames.length; i++) if (frames[i].x !== null && frames[i - 1].x !== null) travel += Math.hypot(frames[i].x - frames[i - 1].x, frames[i].y - frames[i - 1].y);
  const coverage = frames.length ? frames.filter((f) => f.x !== null).length / frames.length : 0;
  const usable = seen.length >= TRACK_FPS && sure / Math.max(1, seen.length) >= 0.3 && travel >= width * 0.5;
  // A wrong drawn cursor is worse than the filmed one: it is redrawn only when almost
  // nothing else on the screen travels.
  const movingElse = frames.filter((f) => f.other).length / Math.max(1, frames.filter((f) => f.sure || f.other).length);
  const paintable = usable && movingElse <= 0.15;
  const clicks = findClicks(frames, { width });
  const stops = findStops(frames);
  const norm = (p) => ({ t: p.t, x: p.x / width, y: p.y / height });
  const points = clicks.length >= 2 ? clicks.map(norm) : [...clicks.map(norm), ...stops.filter((s) => s.seconds >= 1.5).map(norm)];
  const xs = smoothPath(fillGaps(frames.map((f) => f.x)));
  const ys = smoothPath(fillGaps(frames.map((f) => f.y)));
  const path = frames.map((_, i) => [r4(xs[i] / width), r4(ys[i] / height)]);
  const zooms = usable ? zoomPlan(points, total) : [];
  return { usable, paintable, movingElse: r2(movingElse), coverage: r2(coverage), sureShare: r2(sure / Math.max(1, seen.length)), clicks: clicks.length, stops: stops.length, zooms, cursor: usable ? path : null, view: viewPath(zooms, usable ? path : null, total), size: { width, height }, boxes: frames.map((f) => (f.x === null ? null : [f.x, f.y, f.w || 16, f.h || 24])) };
}

/** The stretch of cursor to paint out at a frame, in pixels of the file. Pure. */
export function cursorRect(box, scale, frameWidth, frameHeight, pad = 5) {
  const w = Math.max(box[2], 16) * scale + 2 * pad;
  const h = Math.max(box[3], 24) * scale + 2 * pad;
  const x = Math.max(0, Math.round(box[0] * scale - pad));
  const y = Math.max(0, Math.round(box[1] * scale - pad));
  return { x, y, w: Math.min(frameWidth - x, Math.round(w)), h: Math.min(frameHeight - y, Math.round(h)) };
}

/**
 * The file again without its cursor: under each cursor position goes what was last
 * seen there without it. `boxes`: the tracker's, TRACK_FPS a second.
 */
export function paintOutCursor({ file, out, width, height, trackWidth, boxes, fps = 30, seconds, env = process.env, signal, onPercent = () => {} }) {
  const { ffmpeg } = bins(env);
  const size = width * height * 3;
  const scale = width / trackWidth;
  return new Promise((resolve, reject) => {
    const dec = spawn(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", file, "-an", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { windowsHide: true, signal });
    const enc = spawn(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${width}x${height}`, "-r", String(fps), "-i", "-", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-g", String(fps), out], { windowsHide: true });
    const plate = Buffer.alloc(size);
    let hasPlate = false;
    let n = 0;
    // one frame's room: gluing pipe chunks together cost more than the whole job
    let frame = Buffer.allocUnsafe(size);
    let filled = 0;
    let shown = -1;
    let err = "";
    enc.stderr.on("data", (d) => (err += d));
    dec.stderr.on("data", (d) => (err += d));
    const stride = width * 3;
    // Standing still: only the cursor's own pixels, found once when it stops, so what opens
    // under it stays live. On the move: its whole box.
    let stillKey = null;
    let stillMask = null;
    const shapeOf = (frame, r) => {
      const mask = new Uint8Array(r.w * r.h);
      for (let y = 0; y < r.h; y++) {
        const at = (r.y + y) * stride + r.x * 3;
        for (let x = 0; x < r.w; x++) {
          const k = at + x * 3;
          if (Math.abs(frame[k] - plate[k]) + Math.abs(frame[k + 1] - plate[k + 1]) + Math.abs(frame[k + 2] - plate[k + 2]) > 36) mask[y * r.w + x] = 1;
        }
      }
      // a pixel of margin for the cursor's soft edge
      const grown = Uint8Array.from(mask);
      for (let y = 0; y < r.h; y++) {
        for (let x = 0; x < r.w; x++) {
          if (!mask[y * r.w + x]) continue;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < r.w && ny < r.h) grown[ny * r.w + nx] = 1;
          }
        }
      }
      return grown;
    };
    const paint = (frame) => {
      const i = Math.floor((n / fps) * TRACK_FPS);
      const here = [boxes[i], boxes[i + 1], boxes[i - 1]].filter(Boolean);
      const rects = here.map((b) => cursorRect(b, scale, width, height));
      const key = String(boxes[i]);
      const still = here.length === 3 && String(boxes[i + 1]) === key && String(boxes[i - 1]) === key;
      if (hasPlate) {
        if (still) {
          const r = rects[0];
          if (stillKey !== key) {
            stillKey = key;
            stillMask = shapeOf(frame, r);
          }
          for (let y = 0; y < r.h; y++) {
            const at = (r.y + y) * stride + r.x * 3;
            for (let x = 0; x < r.w; x++) {
              if (!stillMask[y * r.w + x]) continue;
              const k = at + x * 3;
              frame[k] = plate[k];
              frame[k + 1] = plate[k + 1];
              frame[k + 2] = plate[k + 2];
            }
          }
        } else {
          stillKey = null;
          for (const r of rects) {
            for (let y = 0; y < r.h; y++) {
              const at = (r.y + y) * stride + r.x * 3;
              plate.copy(frame, at, at, at + r.w * 3);
            }
          }
        }
      }
      // The clean picture takes the new frame, except around the cursor: a sliver of it
      // saved there would come back later as a ghost.
      const guard = here.map((b) => cursorRect(b, scale, width, height, Math.round(32 * scale)));
      const kept = hasPlate ? guard.map((r) => Array.from({ length: r.h }, (_, y) => {
        const at = (r.y + y) * stride + r.x * 3;
        return Buffer.from(plate.subarray(at, at + r.w * 3));
      })) : [];
      frame.copy(plate);
      kept.forEach((rows, g) => rows.forEach((row, y) => row.copy(plate, (guard[g].y + y) * stride + guard[g].x * 3)));
      hasPlate = true;
      n++;
    };
    dec.stdout.on("data", (d) => {
      let wrote = true;
      let at = 0;
      while (at < d.length) {
        const take = Math.min(size - filled, d.length - at);
        d.copy(frame, filled, at, at + take);
        filled += take;
        at += take;
        if (filled === size) {
          paint(frame);
          wrote = enc.stdin.write(frame) && wrote;
          frame = Buffer.allocUnsafe(size);
          filled = 0;
        }
      }
      if (!wrote) {
        dec.stdout.pause();
        enc.stdin.once("drain", () => dec.stdout.resume());
      }
      const pct = seconds ? Math.min(99, Math.round((n / fps / seconds) * 100)) : 0;
      if (pct !== shown) {
        shown = pct;
        onPercent(pct);
      }
    });
    dec.on("close", () => enc.stdin.end());
    dec.on("error", reject);
    enc.stdin.on("error", () => {});
    enc.on("error", reject);
    enc.on("close", (code) => (code === 0 ? resolve({ file: out, frames: n }) : reject(new Error(`The cursor could not be painted out: ${err.trim().split(/\r?\n/).slice(-1)[0] ?? ""}`))));
  });
}
