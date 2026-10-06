// motion/stage.mjs: what moves around the scenes, from HyperFrames' own parts.
//
// Background: a registry background component (aurora-drift, grain-field) on
// the bottom track instead of the flat background colour. Both are
// "loop-exact": one whole ambient cycle per mount, the first and last frame the
// same. One mount under a 10-minute video would stretch that cycle over 10
// minutes and look still, so the background is laid in pieces of 5-15 s that
// meet without a seam.
//
// Camera: HyperFrames' camera rules, held to the motion doctrine of its
// explainer workflow (skills/faceless-explainer/references/motion-language.md:
// "no lazy breathing, no bad slow pan/push in the back half", "subtle jitter"
// the only sanctioned aliveness, finite tweens only, power3 settles):
//   push    one continuous move over the WHOLE scene: a push-in of 5% with a
//           slow sideways drift, alternating direction scene by scene. It
//           never settles: Zoltan's 2026-10-06 video froze for seconds after
//           the old half-scene push. That doctrine ("no slow push in the back
//           half") lost to the rule that nothing ever stops: one continuous
//           move per scene, at least 4%;
//   jitter  sine-wave-loop's low-amplitude register: a small positional jitter
//           over the hold, as one finite keyframe tween.
// Each runs on a camera wrapper around the scene, so it never fights the
// scene-change recipes on the scene itself.

export const BACKGROUNDS = {
  plain: { label: "Plain", component: null },
  "grain-field": { label: "Dot field", component: "grain-field", dark: false },
  "aurora-drift": { label: "Aurora", component: "aurora-drift", dark: true },
};
export const CAMERAS = { off: { label: "Off" }, jitter: { label: "Subtle jitter" }, push: { label: "Push in" } };
export const PIECE = { target: 10, min: 5, max: 15 };
export const PUSH_SCALE = 1.05;
export const DRIFT_PX = 16;
export const JITTER_PX = 3;

const r3 = (x) => Math.round(x * 1000) / 1000;

// Piece lengths that add up to `total`: as close to the target as possible,
// none shorter than min (a short rest joins the piece before it).
export function backgroundPieces(total, piece = PIECE) {
  if (total <= piece.max) return [{ start: 0, duration: r3(total) }];
  const n = Math.max(1, Math.round(total / piece.target));
  const starts = Array.from({ length: n }, (_, i) => r3((i * total) / n));
  // each piece ends exactly where the next starts, so rounding never adds up
  return starts.map((start, i) => ({ start, duration: r3((i + 1 < n ? starts[i + 1] : total) - start) }));
}

// The background the build uses: the chosen one, unless it needs a dark look
// and the look is light (aurora-drift's base is always deep blue, whatever the
// theme). Then plain, with a reason for the video's log.
export function backgroundFor(background, { light }) {
  const b = BACKGROUNDS[background?.type] ?? BACKGROUNDS.plain;
  if (b.component && b.dark && light) return { component: null, note: `${b.label} background needs a dark look, so this video has a plain one.` };
  return { component: b.component, vars: background?.vars ?? {}, note: null };
}

// Camera lines for one scene wrapper (`#cam-<n>`), local to the main timeline.
export function cameraLines(move, { id, start, duration, index = 0 }) {
  if (move === "push") {
    const dir = index % 2 === 0 ? 1 : -1;
    return [`tl.fromTo("#${id}", { scale: 1, x: 0 }, { scale: ${PUSH_SCALE}, x: ${dir * DRIFT_PX}, duration: ${r3(duration)}, ease: "none" }, ${start});`];
  }
  if (move === "jitter") {
    // A fixed, deterministic path (varies with the scene index, never random).
    const steps = Math.max(2, Math.round(duration / 1.5));
    const pts = Array.from({ length: steps }, (_, k) => {
      const a = (k + 1) * 2.399 + index; // golden-angle walk
      const last = k === steps - 1;
      return `{ x: ${last ? 0 : r3(Math.cos(a) * JITTER_PX)}, y: ${last ? 0 : r3(Math.sin(a) * JITTER_PX * 0.7)} }`;
    });
    return [`tl.fromTo("#${id}", { x: 0, y: 0 }, { keyframes: [${pts.join(", ")}], duration: ${r3(duration)}, ease: "sine.inOut" }, ${start});`];
  }
  return [];
}
