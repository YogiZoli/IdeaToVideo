// build-editor.mjs: the window of RecCut, from the same source as IdeaToVideo's
// (DECISIONS 184). Sets VITE_ITV_APP=editor on every system, then runs Vite.
import { spawnSync } from "node:child_process";
import process from "node:process";

const dev = process.argv[2] === "dev";
const r = spawnSync("npx", ["vite", dev ? "dev" : "build", ...(dev ? ["--port", "1430", "--strictPort"] : [])], { stdio: "inherit", shell: true, env: { ...process.env, VITE_ITV_APP: "editor" } });
process.exit(r.status ?? 1);
