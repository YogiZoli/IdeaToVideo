// mock.js: see prepare.mjs. A stand-in for the Tauri core in a plain browser.
// Stand-in for the Tauri core: logs every call, answers a fixed project.
window.__calls = [];
const project = { id: "p", title: "Test", status: "Scened", language: "en", gates: { script: { state: "approved" }, voice: { state: "approved" }, scenes: { state: "approved" }, review: { state: "todo" }, avatar: { state: "todo" } } };
const config = { schema: 1, onboarded: true, llm: { provider: "gemini", model: "" }, channel: { contentLanguage: "en" }, narrator: { provider: "elevenlabs", voice: "Zoltan BD" }, brand: { preset: "blue-professional" }, avatar: { enabled: true }, research: { vidiq: true } };
const replies = {
  "load-project": { project, brief: null, scriptMarkdown: "# T\n", latestVideo: null, stills: [], voiceInfo: null },
  "scene-table": { rows: [], gaps: [], warnings: [] },
  "list-voices": { voices: [{ id: "v1", name: "Zoltan BD", own: true, accent: null, gender: null, previewUrl: null }] },
  "music-estimate": { usd: 0.2, prompt: "calm" },
  "avatar-looks": { own: [{ id: "g1", name: "Me", note: null, image: null, looks: [{ id: "l1", name: "Look", image: null }] }], stock: [] },
  "avatar-plan": { segments: [{ name: "open", label: "Opening", start: 0, duration: 5 }], current: null, estimate: { low: 0.1, high: 0.3 }, account: null },
  "build-video": { scenes: 1, seconds: 5, stills: [] },
};
window.__TAURI_INTERNALS__ = {
  transformCallback: (cb) => { const id = Math.random(); window["_" + id] = cb; return id; },
  convertFileSrc: (p) => p,
  invoke: async (cmd, args) => {
    window.__calls.push({ cmd, args: JSON.parse(JSON.stringify(args ?? {})) });
    if (cmd === "app_state") return { config, projectsDir: "C:/P", defaultProjectsDir: "C:/P", keys: { heygen: true, elevenlabs: true, vidiq: true, gemini: true }, version: "0.1.0" };
    // the real core answers save_config with the fresh app state (lib.rs)
    if (cmd === "save_config") { Object.assign(config, args.config); return { config, projectsDir: "C:/P", defaultProjectsDir: "C:/P", keys: { heygen: true, elevenlabs: true, vidiq: true, gemini: true }, version: "0.1.0" }; }
    if (cmd === "key_status") return { heygen: true, elevenlabs: true, vidiq: true, gemini: true };
    if (cmd === "plugin:event|listen") return 1;
    if (cmd === "run_runner") {
      if (typeof args.request.projectDir !== "undefined" && typeof args.request.projectDir !== "string") throw "projectDir must be a string";
      if (args.command === "list-projects") return { projects: [{ id: "p", title: "Test", status: "Scened", dir: "C:/P/test", createdAt: "2026", gates: project.gates }] };
      return replies[args.command] ?? {};
    }
    return null;
  },
};
