// music/free.mjs: free background music, no key, no cost (DECISIONS 60).
// Piano recordings on Wikimedia Commons that are CC0 or public domain, so
// they can go under any video, commercial too, without a credit line. Each is
// pinned by URL, size and SHA256, downloaded on first use into the app's own
// folder, checked, and reused afterwards. Wikimedia throttles quick repeated
// downloads, so one track at a time, with a clear User-Agent and one retry.

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { dataDir } from "../../tools.mjs";

const COMMONS = "https://upload.wikimedia.org/wikipedia/commons";

export const FREE_TRACKS = [
  { id: "satie-gymnopedie-1", title: "Gymnopédie No. 1", composer: "Erik Satie", performer: "Robin Alciatore", license: "Public domain", mood: "calm, slow", seconds: 183.6, bytes: 3696351, ext: "ogg", url: `${COMMONS}/9/90/Erik_Satie_-_gymnopedies_-_la_1_ere._lent_et_douloureux.ogg`, sha256: "419e37656856224227086df32d6d481a00a738961e08fca9f6147e472beea53e" },
  { id: "bach-siloti-prelude", title: "Prelude in B minor (arr. Siloti)", composer: "J. S. Bach", performer: "Felipe Sarro", license: "CC0", mood: "calm, flowing", seconds: 265.8, bytes: 3411005, ext: "ogg", url: `${COMMONS}/e/e0/Bach-Siloti%2C_Prelude_in_B_minor_%28J._S._Bach%2C_arranged_Siloti%29%2C_arrangement_of_Prelude_in_E_minor_BWV_855a.ogg`, sha256: "3c173b72c3c891b87faf5d883c44e1e876f9557c3595b6ccbe20fd5457cf2b59" },
  { id: "chopin-nocturne-e-minor", title: "Nocturne in E minor, Op. 72", composer: "Frédéric Chopin", performer: "Commons (CC0)", license: "CC0", mood: "gentle, reflective", seconds: 237.3, bytes: 1973320, ext: "ogg", url: `${COMMONS}/c/cd/Chopin_Nocturne_in_Em%2C_Op._posth._72.ogg`, sha256: "91f2693a15138c7a58b3a9aa122f7b788266b8df1ea18f93d4554ecc1c195716" },
  { id: "chopin-nocturne-f-major", title: "Nocturne in F major, Op. 15 No. 1", composer: "Frédéric Chopin", performer: "Commons (CC0)", license: "CC0", mood: "warm, light", seconds: 305.5, bytes: 3512797, ext: "ogg", url: `${COMMONS}/5/56/Chopin_-_Nocturne_Op._15_no._1_in_F_major.ogg`, sha256: "8102e39f17629e0e9ffcfc3bb674e7b2e9da7bff2b447e2668421997d3d5cd4a" },
  { id: "chopin-nocturne-f-minor", title: "Nocturne in F minor, Op. 55 No. 1", composer: "Frédéric Chopin", performer: "Commons (CC0)", license: "CC0", mood: "serious, steady", seconds: 316.7, bytes: 3648933, ext: "ogg", url: `${COMMONS}/2/2f/Chopin_-_Nocturne-op-55-no-1.ogg`, sha256: "04bbf001e32d7cd7b9d12151c5838626f4bf73b725b2313ef61fd8f3aac2dfd1" },
];

export const freeDir = (env = process.env) => path.join(dataDir(env), "music-free");
export const trackFile = (t, env = process.env) => path.join(freeDir(env), `${t.id}.${t.ext}`);

export function freeTrack(id) {
  const t = FREE_TRACKS.find((x) => x.id === id);
  if (!t) throw new Error(`There is no free track called ${id}.`);
  return t;
}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The track's file, downloaded and checked on first use.
export async function ensureFreeTrack(id, { env = process.env, fetchImpl = fetch, sleep = defaultSleep } = {}) {
  const t = freeTrack(id);
  const file = trackFile(t, env);
  if (fs.existsSync(file) && fs.statSync(file).size === t.bytes) return file;
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await sleep(8000);
    let buf;
    try {
      const res = await fetchImpl(t.url, { headers: { "user-agent": "IdeaToVideo/0.1 (desktop app; free background music)" }, signal: AbortSignal.timeout(120000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      buf = Buffer.from(await res.arrayBuffer());
    } catch (e) {
      lastError = new Error(`Could not download "${t.title}": ${e.message}. Check the internet connection and try again.`);
      continue;
    }
    if (buf.length !== t.bytes || sha256(buf) !== t.sha256) {
      lastError = new Error(`The download of "${t.title}" was not the expected file (the server may be busy). Try again in a minute.`);
      continue;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, buf);
    return file;
  }
  throw lastError;
}

export function freeLibrary(env = process.env) {
  return FREE_TRACKS.map(({ url, sha256: _h, bytes: _b, ...t }) => {
    const file = trackFile(t, env);
    return { ...t, file: fs.existsSync(file) ? file : null };
  });
}
