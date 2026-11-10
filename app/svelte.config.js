// Tauri doesn't have a Node.js server to do proper SSR
// so we use adapter-static with a fallback to index.html to put the site in SPA mode
// See: https://svelte.dev/docs/kit/single-page-apps
// See: https://v2.tauri.app/start/frontend/sveltekit/ for more info
import process from "node:process";
import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // ITV Editor is built from the same source into its own folder (DECISIONS 184)
    adapter: adapter({
      pages: process.env.VITE_ITV_APP === "editor" ? "build-editor" : "build",
      assets: process.env.VITE_ITV_APP === "editor" ? "build-editor" : "build",
      fallback: "index.html",
    }),
  },
};

export default config;
