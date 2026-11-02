// synth.mjs: background music made by code, free and owned by nobody else
// (docs/BUILD_PLAN.md: music is synthesized by code, or the user's own files;
// never downloaded). A calm pad over four chords that loops without a seam:
// every voice is a whole number of cycles of the loop's length, so the end
// meets the start. Deterministic: the same seed gives the same bytes. The
// mixer (audio.mjs) loops it to the video's length and ducks it under the voice.

const RATE = 44100;
const BEATS_PER_CHORD = 8;
const CHORDS = 4;

// Semitones above the root. The moods are plain chord loops, nothing borrowed.
export const MOODS = {
  calm: { root: 110, bpm: 56, chords: [[0, 7, 12, 16], [5, 12, 17, 21], [-3, 7, 12, 16], [2, 9, 14, 17]], pulse: 0 },
  warm: { root: 98, bpm: 60, chords: [[0, 7, 12, 16], [-3, 4, 12, 16], [5, 9, 12, 17], [-5, 2, 11, 14]], pulse: 0.15 },
  dark: { root: 87.31, bpm: 52, chords: [[0, 7, 12, 15], [-4, 3, 8, 12], [-7, 0, 5, 9], [-2, 5, 10, 14]], pulse: 0.1 },
  bright: { root: 130.81, bpm: 72, chords: [[0, 7, 12, 16], [7, 11, 14, 19], [9, 12, 16, 21], [5, 9, 12, 17]], pulse: 0.25 },
};
export const DEFAULT_MOOD = "calm";

const hz = (root, semi) => root * 2 ** (semi / 12);
// a small fixed pseudo-random sequence, so nothing depends on Math.random
const rng = (seed) => {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 2 ** 32;
  };
};

export function loopSeconds(mood = DEFAULT_MOOD) {
  const m = MOODS[mood] ?? MOODS[DEFAULT_MOOD];
  return (CHORDS * BEATS_PER_CHORD * 60) / m.bpm;
}

/** The loop as a 16-bit stereo WAV. */
export function synthLoop({ mood = DEFAULT_MOOD, seed = 1 } = {}) {
  const m = MOODS[mood] ?? MOODS[DEFAULT_MOOD];
  const seconds = loopSeconds(mood);
  const frames = Math.round(seconds * RATE);
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  const rand = rng(seed);
  const chordFrames = Math.round(frames / CHORDS);
  m.chords.forEach((chord, c) => {
    // each chord fades in and out over its neighbours, cosine shaped; the last
    // one wraps around to the start, which is what makes the seam vanish
    const span = chordFrames * 2;
    const start = c * chordFrames - Math.round(chordFrames / 2);
    for (const semi of chord) {
      // whole cycles per chord span, so a chord starts and ends on a zero
      const f = hz(m.root, semi);
      const cycles = Math.max(1, Math.round((f * span) / RATE));
      const w = (2 * Math.PI * cycles) / span;
      const detune = (2 * Math.PI * (cycles + 1)) / span;
      const pan = 0.5 + (rand() - 0.5) * 0.5;
      const phase = rand() * 2 * Math.PI;
      for (let i = 0; i < span; i++) {
        const env = Math.sin((Math.PI * i) / span) ** 2;
        const pulse = 1 - m.pulse * (0.5 + 0.5 * Math.cos((2 * Math.PI * i * BEATS_PER_CHORD) / span));
        // two slightly detuned sines and a soft octave: a pad, no sharp attack
        const v = env * pulse * (Math.sin(w * i + phase) + 0.7 * Math.sin(detune * i + phase) + 0.18 * Math.sin(2 * w * i + phase));
        const at = ((start + i) % frames + frames) % frames;
        left[at] += v * (1 - pan);
        right[at] += v * pan;
      }
    }
  });
  let peak = 0;
  for (let i = 0; i < frames; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  const gain = peak ? 0.7 / peak : 0;
  const pcm = Buffer.alloc(frames * 4);
  for (let i = 0; i < frames; i++) {
    pcm.writeInt16LE(Math.round(left[i] * gain * 32767), i * 4);
    pcm.writeInt16LE(Math.round(right[i] * gain * 32767), i * 4 + 2);
  }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0, "ascii");
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVEfmt ", 8, "ascii");
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(2, 22);
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 4, 28);
  h.writeUInt16LE(4, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36, "ascii");
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
