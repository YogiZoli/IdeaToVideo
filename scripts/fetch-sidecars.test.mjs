import { test } from "node:test";
import assert from "node:assert/strict";
import { TARGETS, NODE_VERSION, outputName, downloadUrl, fetchSidecar } from "./fetch-sidecars.mjs";

test("every target has a pinned sha256 and a nodejs.org url for the pinned version", () => {
  for (const triple of Object.keys(TARGETS)) {
    assert.match(TARGETS[triple].sha256, /^[0-9a-f]{64}$/);
    assert.equal(downloadUrl(triple).startsWith(`https://nodejs.org/dist/v${NODE_VERSION}/`), true);
  }
});

test("output names follow Tauri externalBin naming", () => {
  assert.equal(outputName("x86_64-pc-windows-msvc"), "node-x86_64-pc-windows-msvc.exe");
  assert.equal(outputName("aarch64-apple-darwin"), "node-aarch64-apple-darwin");
});

test("unknown target is refused", () => {
  assert.throws(() => downloadUrl("mips-unknown-none"), /Unsupported target/);
});

test("a download with the wrong hash is refused", async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode("not node").buffer });
  // aarch64-pc-windows-msvc is never fetched on the dev machine, so no real file is touched.
  await assert.rejects(fetchSidecar("aarch64-pc-windows-msvc", { fetchImpl, log: () => {} }), /SHA256 mismatch/);
});
