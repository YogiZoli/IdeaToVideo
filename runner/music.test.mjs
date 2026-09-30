import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { FREE_TRACKS, ensureFreeTrack, freeLibrary, freeTrack } from "./providers/music/free.mjs";

const envFor = () => ({ ITV_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "itv-music-")) });
const answer = (buf, status = 200) => ({ ok: status === 200, status, arrayBuffer: async () => buf });

test("every free track is pinned: CC0 or public domain, https on Wikimedia, size and SHA256", () => {
  assert.ok(FREE_TRACKS.length >= 5);
  for (const t of FREE_TRACKS) {
    assert.match(t.license, /^(CC0|Public domain)$/, t.id);
    assert.match(t.url, /^https:\/\/upload\.wikimedia\.org\//, t.id);
    assert.match(t.sha256, /^[0-9a-f]{64}$/, t.id);
    assert.ok(t.bytes > 100000 && t.seconds > 60, t.id);
  }
  assert.throws(() => freeTrack("nope"), /no free track/);
});

test("a track is downloaded once, checked, and reused", async () => {
  const env = envFor();
  const t = FREE_TRACKS[0];
  const fake = Buffer.alloc(t.bytes, 1);
  const real = { ...t };
  // the real file is not downloaded in tests: pretend the pinned hash is the fake's
  t.sha256 = createHash("sha256").update(fake).digest("hex");
  try {
    let calls = 0;
    const fetchImpl = async () => (calls++, answer(fake));
    const file = await ensureFreeTrack(t.id, { env, fetchImpl, sleep: async () => {} });
    assert.equal(fs.statSync(file).size, t.bytes);
    await ensureFreeTrack(t.id, { env, fetchImpl, sleep: async () => {} });
    assert.equal(calls, 1, "the second time comes from the app folder");
    assert.equal(freeLibrary(env).find((x) => x.id === t.id).file, file);
    assert.equal(freeLibrary(env)[0].url, undefined, "the UI does not get the URL");
  } finally {
    Object.assign(t, real);
  }
});

test("a throttled or wrong download is retried once, then refused, and nothing is kept", async () => {
  const env = envFor();
  const t = FREE_TRACKS[1];
  let calls = 0;
  const fetchImpl = async () => (calls++, answer(Buffer.from("<html>Wikimedia Error</html>")));
  await assert.rejects(ensureFreeTrack(t.id, { env, fetchImpl, sleep: async () => {} }), /not the expected file/);
  assert.equal(calls, 2);
  assert.equal(freeLibrary(env).find((x) => x.id === t.id).file, null);
  const down = async () => answer(Buffer.alloc(0), 429);
  await assert.rejects(ensureFreeTrack(t.id, { env, fetchImpl: down, sleep: async () => {} }), /HTTP 429/);
});
