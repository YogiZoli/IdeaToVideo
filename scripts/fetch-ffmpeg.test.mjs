import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FFMPEG_TARGETS, ffmpegTarget, fetchFfmpeg } from "./fetch-ffmpeg.mjs";
import { names, missing, NEEDS } from "./check-ffmpeg.mjs";

test("every ffmpeg file is pinned: https, a fixed release, a sha256", () => {
  for (const [triple, t] of Object.entries(FFMPEG_TARGETS)) {
    assert.ok(t.files.length > 0, triple);
    assert.ok(t.source.includes("github.com/FFmpeg/FFmpeg"), `${triple}: source link for the GPL`);
    for (const f of t.files) {
      assert.match(f.sha256, /^[0-9a-f]{64}$/);
      assert.ok(f.url.startsWith("https://github.com/"), f.url);
      assert.ok(!/\/latest\//.test(f.url), `${f.url} must be a pinned release, not latest`);
    }
  }
});

test("both desktop platforms and both architectures are covered", () => {
  for (const t of ["x86_64-pc-windows-msvc", "aarch64-pc-windows-msvc", "x86_64-apple-darwin", "aarch64-apple-darwin"]) {
    assert.ok(ffmpegTarget(t));
  }
  assert.throws(() => ffmpegTarget("mips-unknown-none"), /Unsupported ffmpeg target/);
});

test("a download with the wrong hash is refused and leaves the folder alone", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "itv-ffmpeg-test-"));
  fs.writeFileSync(path.join(dir, "keep.txt"), "old set");
  const fetchImpl = async () => ({ ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode("not ffmpeg").buffer });
  await assert.rejects(fetchFfmpeg("aarch64-apple-darwin", { fetchImpl, log: () => {}, dir }), /SHA256 mismatch/);
  assert.equal(fs.readFileSync(path.join(dir, "keep.txt"), "utf8"), "old set");
  fs.rmSync(dir, { recursive: true, force: true });
});

const ENCODERS = `Encoders:
 V..... = Video
 ------
 V....D libx264              libx264 H.264 / AVC / MPEG-4 AVC
 V....D prores_ks            Apple ProRes (iCodec Pro) (codec prores)
 A....D aac                  AAC (Advanced Audio Coding)
`;

test("ffmpeg listings are parsed by name, after the dashes", () => {
  const n = names(ENCODERS);
  assert.ok(n.has("libx264") && n.has("aac") && n.has("prores_ks"));
  assert.ok(!n.has("=") && !n.has("Video"));
});

test("missing capabilities are named", () => {
  const gaps = missing({ encoders: ENCODERS, decoders: "", filters: "" });
  assert.ok(gaps.includes("encoder libmp3lame"));
  assert.ok(gaps.includes("decoder libvpx-vp9"));
  assert.equal(gaps.filter((g) => g.startsWith("filter")).length, NEEDS.filters.length);
});
