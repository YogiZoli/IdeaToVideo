// mock.js: see prepare.mjs. A stand-in for the Tauri core in a plain browser.
// Logs every call in window.__calls and keeps a small in-memory core: App
// settings, Identities, a keychain with App and Identity keys (docs/identity.md).
// URL switches: ?fresh=1 first run (no settings), ?tier=solo the Solo plan,
// ?one=1 a single Identity, ?nobackup=1 no backup folder. window.__log holds
// what the UI sent to the local log (log_event).
window.__calls = [];
window.__log = [];
const q = new URLSearchParams(location.search);
const project = { id: "p", title: "Test", status: "Scened", language: "en", gates: { script: { state: "approved" }, voice: { state: "approved" }, scenes: { state: "approved" }, review: { state: "todo" }, avatar: { state: "todo" } } };
const fields = (over = {}) => ({ llm: null, channel: { contentLanguage: "en", audience: "founders", youtubeUrl: null }, narrator: { provider: "elevenlabs", voice: "Zoltan BD" }, brand: { preset: "blue-professional", logo: null }, avatar: { enabled: true }, research: { vidiq: true }, defaults: { scriptTemplate: "ownership", targetLengthMin: 8 }, ...over });
const core = {
  app: q.get("fresh") ? null : { schema: 2, onboarded: true, llm: { provider: "gemini", model: "gemini-3.5-flash" }, projectsDir: null, activeIdentity: "my-identity", defaults: { autopilot: false }, backup: q.get("nobackup") ? {} : { dir: "G:/My Drive", level: 4, auto: true } },
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
    backupRoot: core.app?.backup?.dir ? `${core.app.backup.dir}/IdeaToVideo_Backup` : null,
    log: { dir: "C:/Users/me/AppData/Local/app.ideatovideo.desktop/logs", files: 2, bytes: 48000, session: "s1", errors: 0, warnings: 1 },
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
// The Brand wizard (brand-state.json from prepare.mjs) and the dictionary.
let motionProfile = null;
let brandCard = null;
let dictionary = { schema: "dictionary/1", preferred: [{ term: "Owner", note: "capital O" }], banned: [{ term: "blasting email", instead: "sending to your list" }], distinct: [], positions: [{ against: "hustle culture", kind: "phenomenon" }] };
async function brandState() {
  const s = await (await fetch("/brand-state.json")).json();
  return brandCard ? { ...s, card: brandCard, own: true } : s;
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
  "backup-estimate": { projects: 6, levels: { 1: 60000, 2: 9000000, 3: 9100000, 4: 75000000 } },
  "backup-all": { projects: 6, copied: 40, bytes: 70000000, failed: [] },
  "backup-status": { path: "My Identity/Test_2026-10-01", at: "2026-10-01T14:02:00Z", lastLevel: 4, level: null },
  "set-backup-level": { level: 2 },
  "backup-project": { path: "My Identity/Test_2026-10-01", copied: 3, at: "2026-10-01T15:00:00Z" },
  "list-backups": { backups: [{ path: "My Identity/Old_one_2026-09-20", title: "Old one", projectId: "2026-09-20_old-one", at: "2026-09-20T10:00:00Z", level: 4, here: false }, { path: "My Identity/Test_2026-10-01", title: "Test", projectId: "p", at: "2026-10-01T14:02:00Z", level: 4, here: true }] },
  "restore-project": { dir: "C:/P/My Identity/2026-09-20_old-one", id: "2026-09-20_old-one", reset: false },
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
      case "log_event": window.__log.push({ level: args.level, event: args.event, ...args.data }); return null;
      case "log_status": return state().log;
      case "delete_logs": return { ...state().log, files: 0, bytes: 0 };
      case "cloud_folders": return [{ label: "Google Drive", path: "G:/My Drive" }, { label: "OneDrive", path: "C:/Users/me/OneDrive" }];
      case "backup_settings_now": return core.identities.length;
      case "restore_settings":
        core.app = { schema: 2, onboarded: true, llm: { provider: "gemini", model: "gemini-3.5-flash" }, activeIdentity: "restored", backup: { dir: args.path, level: 4, auto: true } };
        core.identities = [{ schema: 1, id: "restored", name: "Restored", folder: "Restored", ...fields() }];
        return state();
      case "plugin:opener|reveal_item_in_dir": return null;
      case "import_logo": return `C:/cfg/identities/${args.forNew ? ".new" : active().id}/brand/${args.variant === "dark" ? "logo-dark" : "logo"}.png`;
      case "export_brand": return args.path;
      case "import_brand": return (await brandState()).presets.find((p) => p.id === "od-stripe").card;
      case "read_tokens_file": return ":root { --background: 0 0% 4%; }";
      case "plugin:event|listen": return 1;
      case "plugin:dialog|open": return "C:/Downloads/VoxFlow.identity.zip";
      case "plugin:dialog|save": return args?.options?.defaultPath ? `C:/Downloads/${args.options.defaultPath}` : "C:/Downloads/x.identity.zip";
      case "plugin:dialog|ask": return true;
      case "run_runner":
        if (typeof args.request.projectDir !== "undefined" && typeof args.request.projectDir !== "string") throw "projectDir must be a string";
        if (args.command === "list-projects") return { projects: [{ id: "p", title: `Test of ${active()?.name}`, status: "Scened", dir: `${args.request.projectsDir}/test`, createdAt: "2026", gates: project.gates }] };
        if (args.command === "create-project") return { id: "n", dir: `${args.request.projectsDir}/2026-10-01_new` };
        if (args.command === "brand-state") return brandState();
        if (args.command === "brand-save") { brandCard = { ...args.request.card, updatedAt: new Date().toISOString() }; return { card: brandCard, own: true, contrast: [] }; }
        if (args.command === "brand-import") return (await fetch("/brand-import.json")).json();
        if (args.command === "brand-preview") { await new Promise((r) => setTimeout(r, 600)); return { stills: [1, 2, 3, 4, 5].map((n) => ({ scene: n, at: n * 4 - 0.2, file: `/preview/${n}.png` })) }; }
        if (args.command === "dictionary-load") return { dictionary };
        // The Motion wizard (motion-state.json from prepare.mjs; the preview
        // video is the last real one, if prepare.mjs found it).
        if (args.command === "motion-state") { const m = await (await fetch("/motion-state.json")).json(); return { ...m, profile: motionProfile }; }
        if (args.command === "motion-save") { motionProfile = { ...args.request.profile, updatedAt: new Date().toISOString() }; return { profile: motionProfile }; }
        if (args.command === "motion-check") return { profile: args.request.profile };
        if (args.command === "motion-preview") { await new Promise((r) => setTimeout(r, 1500)); return { file: "/preview/motion.mp4", seconds: 18, renderSeconds: 41, notes: [], transitions: ["cross-warp-morph", "blur-crossfade", "cross-warp-morph", "blur-crossfade", "crossfade"] }; }
        if (args.command === "dictionary-save") { dictionary = args.request.dictionary; return { dictionary }; }
        if (args.command === "dictionary-check") return { findings: dictionary.banned.length ? [{ kind: "banned", term: dictionary.banned[0].term, found: dictionary.banned[0].term, instead: dictionary.banned[0].instead, where: "script open.problem" }, { kind: "spelling", term: "Owner", found: "owner", where: "scene 2 text" }] : [] };
        return replies[args.command] ?? {};
    }
    return null;
  },
};
// unlisten() of @tauri-apps/api/event calls into the event plugin
window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
