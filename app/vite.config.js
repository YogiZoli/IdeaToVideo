import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
// @ts-expect-error type error without @types/node package
import process from "node:process";
// @ts-expect-error type error without @types/node package
import fs from "node:fs";
// @ts-expect-error type error without @types/node package
import path from "node:path";
// @ts-expect-error type error without @types/node package
import { fileURLToPath } from "node:url";
const host = process.env.TAURI_DEV_HOST;

// The design canon (github.com/YogiZoli/design-system) is read at build time
// and baked into the bundle: the installed app never reads it again. Default:
// a sibling checkout next to this repo; CI sets DESIGN_SYSTEM_DIR.
const designDir = path.resolve(process.env.DESIGN_SYSTEM_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), "../../design-system"));
if (!fs.existsSync(path.join(designDir, "tokens.css"))) {
  throw new Error(`design-system tokens.css not found in ${designDir}. Clone github.com/YogiZoli/design-system next to this repo or set DESIGN_SYSTEM_DIR.`);
}

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [sveltekit()],
  resolve: { alias: { $design: designDir } },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || "127.0.0.1",
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    fs: { allow: [".", designDir] },
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
