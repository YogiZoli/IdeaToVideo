// mock.js: see prepare.mjs. A stand-in for the Tauri core in a plain browser.
// Logs every call in window.__calls and keeps a small in-memory core: App
// settings, Identities, a keychain with App and Identity keys (docs/identity.md).
// URL switches: ?fresh=1 first run (no settings), ?tier=solo the Solo plan,
// ?one=1 a single Identity.
window.__calls = [];
const q = new URLSearchParams(location.search);
const project = { id: "p", title: "Test", status: "Scened", language: "en", gates: { script: { state: "approved" }, voice: { state: "approved" }, scenes: { state: "approved" }, review: { state: "todo" }, avatar: { state: "todo" } } };
const fields = (over = {}) => ({ llm: null, channel: { contentLanguage: "en", audience: "founders", youtubeUrl: null }, narrator: { provider: "elevenlabs", voice: "Zoltan BD" }, brand: { preset: "blue-professional", logo: null }, avatar: { enabled: true }, research: { vidiq: true }, defaults: { scriptTemplate: "ownership", targetLengthMin: 8 }, ...over });
const core = {
  app: q.get("fresh") ? null : { schema: 2, onboarded: true, llm: { provider: "gemini", model: "gemini-3.5-flash" }, projectsDir: null, activeIdentity: "my-identity", defaults: { autopilot: false } },
  identities: q.get("fresh") ? [] : [
    { schema: 1, id: "my-identity", name: "My Identity", folder: "My Identity", ...fields({ channel: { contentLanguage: "en", audience: "founders", youtubeUrl: "https://www.youtube.com/@zoltangero" } }) },
    ...(q.get("one") ? [] : [{ schema: 1, id: "voxflow", name: "VoxFlow", folder: "VoxFlow", ...fields({ llm: { provider: "claude", model: "claude-sonnet-5" }, channel: { contentLanguage: "hu", audience: "coaches", youtubeUrl: null } }) }]),
  ],
  // "<name>@app" or "<name>@<identity id>"
  keys: new Set(["gemini@app", "elevenlabs@app", "heygen@app", "vidiq@voxflow"]),
};
const tier = q.get("tier") === "solo" ? "Solo" : "Agency";
const edition = { product: "IdeaToVideo", tier, identityLimit: tier === "Solo" ? 1 : null, copyKeysDefault: tier !== "Solo" };
const NAMES = ["gemini", "openrouter", "claude", "openai", "deepseek", "grok", "elevenlabs", "heygen", "vidiq"];
const slug = (n) => n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "identity";
const active = () => core.identities.find((i) => i.id === core.app?.activeIdentity) ?? core.identities[0] ?? null;
function sources() {
  const id = active()?.id;
  return Object.fromEntries(NAMES.map((n) => [n, { app: core.keys.has(`${n}@app`), identity: !!id && core.keys.has(`${n}@${id}`) }]));
}
function state(notice = null) {
  const a = active();
  const src = sources();
  return {
    app: core.app, identity: a, edition, notice,
    identities: core.identities.map((i) => ({ id: i.id, name: i.name, folder: i.folder, youtubeUrl: i.channel?.youtubeUrl ?? null })),
    projectsRoot: "C:/P", projectsDir: a ? `C:/P/${a.folder}` : "C:/P", defaultProjectsDir: "C:/P",
    keys: Object.fromEntries(Object.entries(src).map(([n, s]) => [n, s.app || s.identity])), keySources: src, version: "0.1.0",
  };
}
function room() {
  if (edition.identityLimit !== null && core.identities.length >= edition.identityLimit) throw `The ${tier} plan includes 1 Identity. The Agency plan includes unlimited Identities.`;
}
function addIdentity(i) {
  room();
  let id = slug(i.name), n = 2;
  while (core.identities.some((x) => x.id === id)) id = `${slug(i.name)}-${n++}`;
  const made = { ...JSON.parse(JSON.stringify(i)), schema: 1, id, folder: i.name };
  core.identities.push(made);
  core.app.activeIdentity = id;
  return made;
}
const jobs = [{ id: 1, command: "render-video", identity: "voxflow", identityName: "VoxFlow", project: "C:/P/VoxFlow/2026-10-01_first", state: "running" }];
const replies = {
  "load-project": { project, brief: null, scriptMarkdown: "# T\n", latestVideo: null, stills: [], voiceInfo: null },
  "scene-table": { rows: [], gaps: [], warnings: [] },
  "list-voices": { voices: [{ id: "v1", name: "Zoltan BD", own: true, accent: null, gender: null, previewUrl: null }] },
  "music-estimate": { usd: 0.2, prompt: "calm" },
  "avatar-looks": { own: [{ id: "g1", name: "Me", note: null, image: null, looks: [{ id: "l1", name: "Look", image: null }] }], stock: [] },
  "avatar-plan": { segments: [{ name: "open", label: "Opening", start: 0, duration: 5 }], current: null, estimate: { low: 0.1, high: 0.3 }, account: null },
  "build-video": { scenes: 1, seconds: 5, stills: [] },
  "validate-config": { errors: [] },
  "test-llm": { ok: true, message: "The key works." },
  "test-service": { ok: true, message: "The key works." },
};
window.__TAURI_INTERNALS__ = {
  transformCallback: (cb) => { const id = Math.random(); window["_" + id] = cb; return id; },
  convertFileSrc: (p) => p,
  invoke: async (cmd, args) => {
    window.__calls.push({ cmd, args: JSON.parse(JSON.stringify(args ?? {})) });
    switch (cmd) {
      case "app_state": return state();
      case "save_settings": {
        if (args.config) core.app = { ...args.config };
        let notice = null;
        if (args.identity) {
          const known = core.identities.find((i) => i.id === args.identity.id);
          if (known) {
            if (known.name !== args.identity.name) notice = null;
            Object.assign(known, args.identity, { folder: args.identity.name });
          } else addIdentity(args.identity);
        }
        return state(notice);
      }
      case "set_active_identity": core.app.activeIdentity = args.id; return state();
      case "duplicate_identity": {
        const src = core.identities.find((i) => i.id === args.id);
        const made = addIdentity({ ...src, name: args.name });
        if (args.copyKeys) for (const n of NAMES) if (core.keys.has(`${n}@${src.id}`)) core.keys.add(`${n}@${made.id}`);
        return state();
      }
      case "delete_identity":
        if (core.identities.length <= 1) throw "This is the only Identity, so it cannot be deleted.";
        core.identities = core.identities.filter((i) => i.id !== args.id);
        core.app.activeIdentity = core.identities[0].id;
        return state();
      case "export_identity": return args.path;
      case "import_identity": addIdentity({ ...fields(), name: "Imported" }); return state();
      case "set_key": core.keys.add(`${args.name}@${args.scope === "app" ? "app" : active().id}`); return null;
      case "delete_key": core.keys.delete(`${args.name}@${args.scope === "app" ? "app" : active().id}`); return null;
      case "delete_all_keys": core.keys.clear(); return null;
      case "key_status": { const s = state(); return { keys: s.keys, keySources: s.keySources }; }
      case "job_list": return jobs;
      case "import_logo": return `C:/cfg/identities/${args.forNew ? ".new" : active().id}/brand/logo.png`;
      case "plugin:event|listen": return 1;
      case "plugin:dialog|open": return "C:/Downloads/VoxFlow.identity.zip";
      case "plugin:dialog|save": return args?.options?.defaultPath ? `C:/Downloads/${args.options.defaultPath}` : "C:/Downloads/x.identity.zip";
      case "plugin:dialog|ask": return true;
      case "run_runner":
        if (typeof args.request.projectDir !== "undefined" && typeof args.request.projectDir !== "string") throw "projectDir must be a string";
        if (args.command === "list-projects") return { projects: [{ id: "p", title: `Test of ${active()?.name}`, status: "Scened", dir: `${args.request.projectsDir}/test`, createdAt: "2026", gates: project.gates }] };
        if (args.command === "create-project") return { id: "n", dir: `${args.request.projectsDir}/2026-10-01_new` };
        return replies[args.command] ?? {};
    }
    return null;
  },
};
// unlisten() of @tauri-apps/api/event calls into the event plugin
window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
