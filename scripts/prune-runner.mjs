#!/usr/bin/env node
// prune-runner.mjs: what of the runner's node_modules the installer does not
// need (tauri.conf.json beforeBuildCommand, after npm ci). The ONNX runtime's
// package carries every platform; only this computer's stays. DirectML and its
// compilers go on every platform: the free voice runs on the CPU, and they are
// Microsoft's own license, not MIT, Apache or BSD (docs/BUILD_PLAN.md).
//
// Usage: node scripts/prune-runner.mjs [--target <platform>-<arch>]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const NOT_OURS = ["DirectML.dll", "dxcompiler.dll", "dxil.dll"];

/** The folders and files to remove, from a listing of the runtime's bin folder. */
export function toRemove(binDir, platform = process.platform, arch = process.arch) {
  const out = [];
  if (!fs.existsSync(binDir)) return out;
  for (const napi of fs.readdirSync(binDir)) {
    const base = path.join(binDir, napi);
    for (const os of fs.readdirSync(base)) {
      if (os !== platform) {
        out.push(path.join(base, os));
        continue;
      }
      for (const a of fs.readdirSync(path.join(base, os))) {
        if (a !== arch) {
          out.push(path.join(base, os, a));
          continue;
        }
        for (const f of NOT_OURS) if (fs.existsSync(path.join(base, os, a, f))) out.push(path.join(base, os, a, f));
      }
    }
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { target: { type: "string" } } });
  const [platform, arch] = (values.target ?? `${process.platform}-${process.arch}`).split("-");
  const bin = path.join(ROOT, "runner", "node_modules", "onnxruntime-node", "bin");
  const list = toRemove(bin, platform, arch);
  for (const p of list) fs.rmSync(p, { recursive: true, force: true });
  console.log(`prune-runner: ${list.length} removed, the voice runtime is for ${platform}-${arch} only`);
}
