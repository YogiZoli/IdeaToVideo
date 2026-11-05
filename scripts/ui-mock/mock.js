// mock.js: see prepare.mjs. A stand-in for the Tauri core in a plain browser.
// Logs every call in window.__calls and keeps a small in-memory core: App
// settings, Identities, a keychain with App and Identity keys (docs/identity.md).
// URL switches: ?fresh=1 first run (no settings), ?tier=solo the Solo plan,
// ?one=1 a single Identity, ?nobackup=1 no backup folder. window.__log holds
// what the UI sent to the local log (log_event).
// The ONE Video tabs (DECISIONS 85): ?stage=0..6 how many steps of the test
// project are approved (default 3), ?slow=<ms> how long a long job takes
// (default 2500). Long jobs show up in the Jobs list and send progress
// events, like the real core; window.__emit(event, payload) sends one by hand.
// Recorded engine (runner/recorded): ?recorded=talking-head (or another preset) makes the
// channel's recipe and the test project a recording's.
// AI B-roll (docs/ai-broll.md): ?broll=1 on with HeyGen Video 1, ?broll=test
// on with the free test clips; both give the Scenes tab a seven-scene table.
window.__calls = [];
window.__log = [];
const q = new URLSearchParams(location.search);
const ORDER = ["script", "voice", "scenes", "avatar", "review"];
const stage = Number(q.get("stage") ?? 3);
const slow = Number(q.get("slow") ?? 2500);
const project = { id: "p", title: "How to turn viewers into subscribers with one simple question", status: "Scened", language: "en", gates: Object.fromEntries(ORDER.map((g, i) => [g, { state: i < stage ? (g === "avatar" ? "skipped" : "approved") : "todo" }])) };
// ?run=1: a channel video whose run just started (ProjectView recipeRun)
if (q.get("run")) Object.assign(project, { autopilotRun: { at: "2026-11-02T10:00:00Z" }, recipe: { engine: "script", preset: "motion-frames", voice: { provider: "kokoro", voice: "am_michael" }, avatar: { on: false, lookId: null }, music: { on: true, source: "synth", mood: "calm" }, targetLengthMin: 8 } });
let video = stage >= 6 ? { file: "/preview/motion.mp4", seconds: 128, renderSeconds: 417, chapters: "0:00 Intro\n0:35 The mistake", srt: "x.srt", publishFile: "x.publish.json", comments: "GUIDE", youtube: null } : null;
// Direction, Research and Shot map: ?research=notes (or topic, finished) a channel video
// with its brief waiting; ?shots=1 a channel video with its Shot map; ?noscriptvoice=1
// a recording channel that never had a voice.
if (q.get("research")) Object.assign(project, { start: { kind: q.get("research"), research: true }, recipe: { engine: "script", preset: "motion-frames", voice: { provider: "kokoro", voice: "am_michael" }, avatar: { on: false, lookId: null }, music: { on: true, source: "synth", mood: "calm" }, broll: { on: true }, targetLengthMin: 8 } });
if (q.get("shots")) Object.assign(project, { start: { kind: "topic", research: false }, recipe: { engine: "script", preset: "motion-frames", voice: { provider: "kokoro", voice: "am_michael" }, avatar: { on: false, lookId: null }, music: { on: true, source: "synth", mood: "calm" }, broll: { on: true }, targetLengthMin: 8 } });
const BRIEF = { state: "pending", grounded: true, queries: ["why are trains late", "train delays statistics"], warnings: [], facts: [{ text: "Most delays start with one late departure.", source: 1 }, { text: "A timetable has slack built in at the big stations.", source: 2 }], numbers: [{ text: "About 1 in 10 trains arrives over 5 minutes late.", source: 2 }], dates: [{ text: "Railway time came in during the 1840s.", source: 3 }], missing: [{ text: "Your notes leave out freight traffic on shared lines.", source: 1 }], claims: [{ claim: "Nobody owns the timetable.", verdict: "wrong", note: "A named office plans it each year.", source: 1 }, { claim: "Staff shortages cause most delays.", verdict: "unclear", note: "The sources disagree.", source: null }, { claim: "Trains used to run on time.", verdict: "right", note: "", source: 3 }], sources: [{ title: "Rail regulator: performance report", url: "https://example.org/report" }, { title: "How timetables are built", url: "https://example.org/timetables" }, { title: "A short history of railway time", url: "https://example.org/history" }] };
const SHOTMAP = { warning: null, summary: { shots: 4, broll: 1, hero: 1, overrides: 1, elements: 7, onTheirWord: 5, withBlock: 2 }, shots: [
  { id: "S1@0", n: 1, start: 0, seconds: 4.2, said: "Trains used to run on time.", kind: "graphic", block: "Big title", override: false, call: false, camera: "The channel's move", transition: "The channel's change", hero: false, source: null, license: null, paid: null, entrances: [], flow: null, entrances: [{ text: "Trains on time", word: "Trains", at: 0, how: "shot" }] },
  { id: "S2@4.2", n: 2, start: 4.2, seconds: 3.6, said: "Then costs went up and most lines lost", kind: "graphic", block: "Rising words", override: false, call: false, camera: "The channel's move", transition: "The channel's change", hero: false, source: null, license: null, paid: null, entrances: [], flow: null,  },
  { id: "S2@7.8", n: 3, start: 7.8, seconds: 2.4, said: "40 percent of their staff.", kind: "graphic", block: "Counting number", override: false, call: false, camera: "The channel's move", transition: "The channel's change", hero: false, source: null, license: null, paid: null, entrances: [], flow: null, camera: "Still", transition: "Cut, inside a sentence", override: true, entrances: [{ text: "40", word: "40", at: 7.8, how: "shot" }, { text: "of staff", word: "of", at: 9.1, how: "block" }] },
  { id: "S3@10.2", n: 4, start: 10.2, seconds: 5, said: "An old steam engine crossed the valley at dawn.", kind: "broll", block: "Rising words", override: false, call: false, camera: "The channel's move", transition: "The channel's change", hero: false, source: null, license: null, paid: null, entrances: [], flow: null, hero: true, kind: "broll", source: "Free still, moved in 2.5D", license: "Public Domain", camera: "2.5D push-in", flow: { on: true, prompt: "A clear view of old steam engine crossed valley dawn, one continuous shot, one slow camera move, soft natural light, no text, no logos. 16:9, 5 seconds.", seconds: 5, clip: null, name: null, short: false } },
] };
const RECORDED = q.get("recorded");
if (RECORDED) project.recipe = { engine: "recorded", preset: RECORDED, voice: { provider: "recording", voice: "own" }, avatar: { on: false, lookId: null }, music: { on: false, source: "synth", mood: "calm" }, broll: { on: true }, recorded: { cutout: true, smoothCursor: true }, targetLengthMin: 8 };
const hasStills = () => ORDER.indexOf("review") < stage || project.gates.review.state !== "todo";
const listeners = {};
window.__emit = (event, payload) => (listeners[event] ?? []).forEach((h) => window["_" + h]?.({ event, payload, id: 1 }));
const LONG = { "suggest-channel": 8, "keyword-ideas": 6, "broll-plan": 20, "broll-make": 90, "write-script": 60, "make-voice": 90, "make-music": 95, "make-scenes": 40, "simple-scenes": 2, "refill-scene": 18, "make-avatar": 300, "build-video": 45, "render-video": 400, "youtube-texts": 10 };
// ?quiet=1: no heartbeat, ?stuck=1: the check-in says stuck (the bar's "no sign of life" line); ?slept=1: the
// computer slept during the job; Stop (stop_job) ends a job with its reason.
let nextJob = 10;
async function longJob(command, request) {
  const job = { id: nextJob++, command, identity: "my-identity", identityName: "My Identity", project: request.projectDir ?? null, state: "running" };
  jobs.push(job);
  window.__emit("jobs-changed", [...jobs]);
  window.__emit("runner-progress", { command, project: job.project, progress: { step: "estimate", expectSeconds: LONG[command] } });
  const t0 = Date.now();
  let beat = 0;
  if (q.get("slept")) window.__emit("runner-progress", { command, project: job.project, progress: { step: "slept", seconds: 754 } });
  while (Date.now() - t0 < slow) {
    await new Promise((r) => setTimeout(r, 250));
    if (job.stopped) {
      jobs.splice(jobs.indexOf(job), 1);
      window.__emit("jobs-changed", [...jobs]);
      throw "Stopped by you.";
    }
    if (!q.get("quiet") && ++beat % 8 === 0) window.__emit("runner-progress", { command, project: job.project, progress: { step: "alive" } });
    // the core's check-in (runner.rs): ?stuck=1 shows a step that seems stuck
    if (beat % 8 === 4) window.__emit("runner-progress", { command, project: job.project, progress: { step: "pulse", state: q.get("stuck") ? "stuck" : q.get("quiet") ? "waiting" : "working" } });
    const f = (Date.now() - t0) / slow;
    if (command === "render-video") window.__emit("runner-progress", { command, project: job.project, progress: { step: "render", percent: Math.round(3 + 92 * f), frame: Math.round(3848 * f), frames: 3848 } });
  }
  jobs.splice(jobs.indexOf(job), 1);
  window.__emit("jobs-changed", [...jobs]);
}
const setState = (g, state, mode) => {
  project.gates[g] = { state, ...(mode ? { mode } : {}) };
  if (state === "running" || state === "pending") for (const later of ORDER.slice(ORDER.indexOf(g) + 1)) if (g !== "review") project.gates[later] = { state: "todo" };
};
const stillsList = () => (hasStills() ? [1, 2, 3, 4, 5].map((n) => ({ scene: n, at: n * 6 - 0.5, file: `/preview/${n}.png` })) : []);
const fields = (over = {}) => ({ llm: null, channel: { contentLanguage: "en", audience: "founders", youtubeUrl: null }, narrator: { provider: "elevenlabs", voice: "Zoltan BD" }, brand: { preset: "blue-professional", logo: null }, avatar: { enabled: true }, research: { vidiq: true }, defaults: { scriptTemplate: "ownership", targetLengthMin: 8 }, ...over });
const core = {
  app: q.get("fresh") ? null : { schema: 2, onboarded: true, llm: { provider: "gemini", model: "gemini-3.5-flash" }, projectsDir: null, activeIdentity: "my-identity", defaults: { autopilot: false }, backup: q.get("nobackup") ? {} : { dir: "G:/My Drive", level: 4, auto: true } },
  identities: q.get("fresh") ? [] : [
    { schema: 1, id: "my-identity", name: "My Identity", folder: "My Identity", ...fields({ channel: { contentLanguage: "en", audience: "founders", youtubeUrl: "https://www.youtube.com/@yourchannel" } }) },
    ...(q.get("one") ? [] : [{ schema: 1, id: "voxflow", name: "VoxFlow", folder: "VoxFlow", ...fields({ llm: { provider: "claude", model: "claude-sonnet-5" }, channel: { contentLanguage: "hu", audience: "coaches", youtubeUrl: null } }) }]),
  ],
  // "<name>@app" or "<name>@<identity id>"
  keys: new Set([...(q.get("noai") ? [] : ["gemini@app"]), "elevenlabs@app", "heygen@app", "vidiq@voxflow", "pixabay@app", "unsplash@app"]),
};
const tier = q.get("tier") === "solo" ? "Solo" : "Agency";
const edition = { product: "IdeaToVideo", tier, identityLimit: tier === "Solo" ? 1 : null, copyKeysDefault: tier !== "Solo" };
const NAMES = ["gemini", "openrouter", "claude", "openai", "deepseek", "grok", "elevenlabs", "heygen", "vidiq", "pixabay", "unsplash"];
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
let ctaProfile = null;
let brandCard = null;
let dictionary = { schema: "dictionary/1", preferred: [{ term: "Owner", note: "capital O" }], banned: [{ term: "blasting email", instead: "sending to your list" }], distinct: [], positions: [{ against: "hustle culture", kind: "phenomenon" }] };
async function brandState() {
  const s = await (await fetch("/brand-state.json")).json();
  return brandCard ? { ...s, card: brandCard, own: true } : s;
}
// AI B-roll: the Identity's settings, the video's plan, the library.
const brollOn = q.get("broll");
const PAID_CHOICE = { model: "kie-seedance-v1-lite", label: "Seedance 1.0 Lite (Kie AI)", limits: { perVideo: { min: 0, max: 100, default: 1 }, perMonth: { min: 0, max: 1000, default: 5 } }, qualities: [{ id: "480p", clipUsd: 0.05, seconds: 5 }, { id: "720p", clipUsd: 0.12, seconds: 5 }, { id: "1080p", clipUsd: 0.25, seconds: 5 }] };
const HERO_PROMPT = "A slow push in over a rocket standing on its launch pad at dawn, thin vapour drifting across the frame, soft orange light, one continuous shot from far away, natural colours.";
const engineItems = [
  { id: "b1", scene: 2, said: "The first steam engines changed how cities moved.", seconds: 4.2, query: "steam locomotive", hero: false, prompt: "", use: true, state: "done", source: "archive", usd: 0, license: "Public Domain", sourceUrl: "https://archive.org/details/x", author: "Prelinger Archives", checked: true },
  { id: "b2", scene: 5, said: "From orbit, the whole coast looks like a thin line of light.", seconds: 4.8, query: "earth from orbit coast", hero: true, prompt: HERO_PROMPT, use: true, state: "done", source: "still", usd: 0, license: "US federal government work", sourceUrl: "https://images.nasa.gov/details/x", author: "NASA", checked: true },
  { id: "b3", scene: 8, said: "Traffic slows when one car brakes.", seconds: 3.5, query: "city traffic", hero: false, prompt: "", use: true, state: "done", source: "pixabay", usd: 0, license: "Free license, not CC0 (Pixabay Content License)", sourceUrl: "https://pixabay.com/videos/x-1/", author: "ana", checked: false },
  { id: "b4", scene: 11, said: "Then the rocket leaves the pad.", seconds: 3.1, query: "rocket launch pad dawn", hero: true, prompt: HERO_PROMPT, use: true, state: "none", source: null, paidWanted: true },
];
function engineState() {
  const wanted = engineItems.filter((i) => i.use && i.paidWanted);
  const totalUsd = Math.round(wanted.length * 12) / 100;
  const spentVideoUsd = engineItems.filter((i) => i.source === "ai").length * 0.12;
  return { plan: q.get("engine") ? { auto: true, finished: true, stale: false, items: engineItems } : null, clips: {}, footageDir: "/preview", paid: { on: true, model: PAID_CHOICE.model, quality: "720p", maxPerVideoUsd: 1, maxPerMonthUsd: 5, label: PAID_CHOICE.label, clipUsd: 0.12, clips: wanted.length, totalUsd, spentVideoUsd, spentMonthUsd: spentVideoUsd, leftVideoUsd: 1 - spentVideoUsd, leftMonthUsd: 5 - spentVideoUsd, over: false } };
}
let brollSettings = { schema: "itv-broll-settings/1", enabled: !!brollOn, generator: brollOn === "test" ? "test" : "heygen-video-1", quality: "768p", capUsd: 1, paid: { on: q.get("engine") === "1", model: "kie-seedance-v1-lite", quality: "720p", maxPerVideoUsd: 1, maxPerMonthUsd: 5 } };
const BROLL_GENERATORS = [{ id: "heygen-video-1", label: "HeyGen Video 1", test: false, usdPerSecond: { "480p": 0.02, "768p": 0.03, "1080p": 0.09 } }, { id: "test", label: "Test clips (free, placeholder)", test: true, usdPerSecond: { "480p": 0, "768p": 0, "1080p": 0 } }];
const BROLL_QUALITIES = [{ id: "480p", label: "480p", note: "cheapest, soft on a 1080p video" }, { id: "768p", label: "768p", note: "the default" }, { id: "1080p", label: "1080p", note: "sharp, three times the 768p price" }];
let brollPlan = null;
const brollGenerated = [];
const SAID = ["You want people to stay after the first ten seconds.", "Most channels lose them right there.", "Picture a small coffee shop at dawn, the first customer at the door.", "The owner looks up and asks one simple question.", "That question changes the whole visit.", "Here is how it works on your channel.", "Comment GUIDE and I send you the checklist."];
const BROLL_TABLE = { rows: SAID.map((said, i) => ({ index: i, from: `S${i + 1}`, to: `S${i + 1}`, start: i * 6, duration: 6, said, component: ["titlecard-lockup", "per-word-rise", "headline-slam", "per-word-rise", "marker-highlight", "grid-card-assemble", "cta-close"][i], label: ["Title card", "Words rise in", "Headline lands hard", "Words rise in", "Word marked", "Cards in a grid", "Call to action"][i], roleLabel: "", mainVar: null, mainText: null, shows: said.split(" ").slice(0, 3).join(" "), alternatives: [], call: i === 6 ? { slot: "end", keyword: "GUIDE", temperature: "warm" } : null, footage: null })), gaps: [], warnings: [] };
const brollRate = () => BROLL_GENERATORS.find((g) => g.id === brollSettings.generator).usdPerSecond[brollSettings.quality];
function brollEstimate(ids = null) {
  const items = (brollPlan?.items ?? []).filter((i) => i.use && !i.library && i.state !== "done" && (!ids || ids.includes(i.id)));
  const seconds = items.reduce((t, i) => t + i.order, 0);
  const usd = Math.round(seconds * brollRate() * 100) / 100;
  const spent = brollPlan?.spentUsd ?? 0;
  return { generator: brollSettings.generator, test: brollSettings.generator === "test", quality: brollSettings.quality, items: items.length, pending: 0, fromLibrary: 0, seconds, usd, capUsd: brollSettings.capUsd, spentUsd: spent, leftUsd: Math.max(0, brollSettings.capUsd - spent), overCap: usd > 0 && spent + usd > brollSettings.capUsd };
}
function brollState() {
  const clips = Object.fromEntries((brollPlan?.items ?? []).filter((i) => i.clip).map((i) => [i.id, brollGenerated.find((c) => c.id === i.clip) ?? null]));
  return { settings: brollSettings, plan: brollPlan, estimate: brollEstimate(), clips, footageDir: "/preview", generators: BROLL_GENERATORS, qualities: BROLL_QUALITIES };
}
function brollTable() {
  const done = (brollPlan?.items ?? []).filter((i) => i.use && i.state === "done");
  return { ...BROLL_TABLE, rows: BROLL_TABLE.rows.map((r) => ({ ...r, footage: done.find((i) => i.from === r.from)?.clip ?? null })) };
}
// Course import (DECISIONS 121): ?course=1 the test video is lesson 2 of an
// imported course, and the course is on Videos; without it the first import
// can be tried on Settings, Import & Export (the preview is the real one of
// the example file, course-preview.json from prepare.mjs).
const PLAYLIST = "https://www.youtube.com/playlist?list=PLxxxxxxxxxxxxxxxx";
let courseHere = !!q.get("course");
const SERIES = { courseSlug: "test-sourdough-in-a-weekend", courseTitle: "TEST Sourdough in a Weekend", lessonId: "m1-l2", playlistPosition: 2, playlistCount: 4, playlistId: "PLxxxxxxxxxxxxxxxx", playlistUrl: PLAYLIST };
if (courseHere) project.series = SERIES;
const coursePreview = async () => { const p = await (await fetch("/course-preview.json")).json(); return { ...p, lessons: p.lessons.map((l) => ({ ...l, exists: courseHere })), newCount: courseHere ? 0 : p.lessons.length, existingCount: courseHere ? p.lessons.length : 0 }; };
const jobs = q.get("otherjob") ? [{ id: 1, command: "render-video", identity: "voxflow", identityName: "VoxFlow", project: "C:/P/VoxFlow/2026-10-01_first", state: "running" }] : [];
const replies = {
  "load-project": { project, brief: null, scriptMarkdown: "# T\n", latestVideo: null, stills: [], voiceInfo: null, researchState: q.get("research") ? "pending" : null },
  "scene-table": { rows: [], gaps: [], warnings: [] },
  "list-voices": { voices: [{ id: "v1", name: "Zoltan BD", own: true, accent: null, gender: null, previewUrl: null }, { id: "v2", name: "Zoltan EN calm", own: true, accent: "hungarian", gender: "male", previewUrl: null }, ...["Adam", "Alice", "Bella", "Bill", "Brian", "Callum", "Charlie", "Charlotte", "Chris", "Daniel", "Emily", "Eric", "George", "Jessica", "Laura", "Liam", "Lily", "Matilda", "River", "Roger", "Sarah", "Will"].map((n, i) => ({ id: `s${i}`, name: n, own: false, accent: ["american", "british", "australian"][i % 3], gender: i % 2 ? "female" : "male", description: "narration", previewUrl: null }))] },
  "music-estimate": { usd: 0.2, prompt: "calm" },
  "avatar-looks": { own: [{ id: "g1", name: "Zoltan", note: null, image: "/preview/1.png", looks: ["Office, blue shirt", "Studio, black tee", "Outdoor, jacket", "Desk, glasses", "Stage, suit", "Kitchen, casual", "Podcast", "Green screen"].map((n, i) => ({ id: `l${i}`, name: n, image: `/preview/${(i % 5) + 1}.png`, video: "x", engines: i === 2 ? ["avatar_iv", "avatar_v"] : ["avatar_iii", "avatar_iv"] })) }, { id: "g2", name: "Zoltan 2025", note: null, image: null, looks: [{ id: "m1", name: "Webinar", image: null }] }, { id: "g3", name: "Anna (client)", note: "training", image: null, looks: [] }], stock: ["Abigail", "Brandon", "Chen", "Daisy", "Elias", "Fatima", "Gabriel", "Hana", "Ivan", "Julia", "Kofi", "Lena", "Marco", "Nina", "Omar"].map((n, i) => ({ id: `st${i}`, name: `${n} ${["Office", "Casual", "Studio"][i % 3]}`, image: null })) },
  "avatar-plan": { segments: [{ name: "open", label: "Opening", start: 0, duration: 5.2 }, { name: "close", label: "Closing", start: 120, duration: 7.4 }], current: null, estimate: { low: 1.2, high: 2.5 }, estimates: { avatar_iii: { low: 0.13, high: 0.21 }, avatar_iv: { low: 0.49, high: 1.02 }, avatar_v: { low: 0.49, high: 1.02, guess: true } }, account: { remaining: 23.5, currency: "usd" } },
  "youtube-texts": { titles: ["Turn viewers into subscribers with one question", "The one question that grows your channel", "Stop asking for subs: do this instead"], title: "", summary: "You learn why asking for a subscription fails, and the one-word question that turns viewers into subscribers.", description: "You learn why asking for a subscription fails.\n\nGUIDE: the one-page checklist\n\n0:00 Intro\n0:35 The mistake\n", tags: ["youtube growth", "get subscribers", "call to action"] },
  "build-video": { scenes: 1, seconds: 5, stills: [] },
  "validate-config": { errors: [] },
  "channel-state": {
    recipe: RECORDED ? project.recipe : { schema: "channel-recipe/1", engine: "script", preset: "motion-frames", voice: q.get("recipe") === "eleven" ? { provider: "elevenlabs", voice: "v1", name: "My voice" } : { provider: "kokoro", voice: "am_michael" }, avatar: { on: false, lookId: null }, music: { on: true, source: "synth", mood: "calm" }, broll: { on: true }, targetLengthMin: 8 },
    saved: !q.get("newrecipe"),
    presets: [{ id: "motion-frames", label: "Motion Frames", description: "The motion graphics this app already makes.", engine: "script", templates: Array.from({ length: 13 }, (_, i) => ({ id: `t${i}`, label: `T${i}` })), shotRules: {} }, { id: "explainer-3d", label: "3D Explainer", description: "One strange question per video. Simple 3D scenes drawn on this computer: soft-shaded objects, cutaway views, scale comparisons, bright clean materials, smooth camera moves.", engine: "script", templates: Array.from({ length: 14 }, (_, i) => ({ id: `x${i}`, label: `X${i}` })), shotRules: {}, defaults: { broll: false } }, { id: "night-case-file", label: "Night Case File", description: "A true story documentary at night. Dark blue-black scenes, faceless figures glowing in one color, rooms and streets built from simple shapes, date and place stamps, an evidence board. Nothing violent is ever shown: a light flashes and a sound is heard. Scripts are fact-checked, and the sources go into the Publishing Card.", engine: "script", templates: Array.from({ length: 15 }, (_, i) => ({ id: `n${i}`, label: `N${i}` })), shotRules: {}, defaults: { broll: false, research: true, mood: "dark" }, factChecked: true }, { id: "soft-clay", label: "Soft Clay Chronicle", description: "A warm history documentary in matte clay. Rounded faceless figures, hand-pressed things with a faint fingerprint texture, warm lamp light on an old map table, a soft glow on the thing the story is about, a small date label in the corner.", engine: "script", templates: Array.from({ length: 15 }, (_, i) => ({ id: `t${i}`, label: `T${i}` })), shotRules: {}, defaults: { broll: false, research: true, mood: "warm" } }, { id: "archive-collage", label: "Archive Collage", description: "A documentary collage explainer. Halftone cutouts on aged paper and maps, giant numbers, map pins and route lines, torn edges and print grain, one hot accent. Layers move in parallax under one slow camera drift.", engine: "script", templates: Array.from({ length: 15 }, (_, i) => ({ id: `c${i}`, label: `C${i}` })), shotRules: {}, defaults: { broll: false } }, { id: "stick-world", label: "Stick World", description: "What-if stories told to you. Black stick figures on a light plain background, you are the one with the colored scarf. A nearly still camera, one short sentence per shot, big readable numbers.", engine: "script", templates: Array.from({ length: 14 }, (_, i) => ({ id: `s${i}`, label: `S${i}` })), shotRules: {}, defaults: { broll: false } }, ...[{"id":"talking-head","label":"Talking Head","description":"Your face is the main picture. B-roll on the things you name, big words on screen, chapter titles. Optional: a person cut-out, so a big word can sit behind your head.","engine":"recorded","templates":[{"id":"big-word","label":"Big word"},{"id":"chapter-title","label":"Chapter title"},{"id":"broll","label":"B-roll"}],"shotRules":{"pacing":"balanced","cutFrequency":"A new element on a word every 7 to 15 seconds. The face stays between them.","camera":"The recording itself, untouched.","characters":"The person speaking, nobody else.","sound":"No transition sounds, ever. The recording's own voice carries the video."},"recorded":{"main":"camera","bigWords":true,"chapterTitles":true,"broll":true,"cutout":true,"slots":[{"id":"camera","label":"Camera file","hint":"You talking to the camera."},{"id":"combined","label":"Or one combined file","hint":"One file with picture and sound."}]}},{"id":"screen-recording","label":"Screen Recording","description":"The screen is the main picture. The view zooms to clicks and follows the cursor, the cursor moves smoothly. Optional: a small face bubble from a separate camera file.","engine":"recorded","templates":[{"id":"zoom","label":"Zoom to a click"},{"id":"cursor","label":"Smooth cursor"},{"id":"chapter-title","label":"Chapter title"},{"id":"face-bubble","label":"Face bubble"}],"shotRules":{"pacing":"balanced","cutFrequency":"The view moves with the clicks, never faster than the viewer can follow.","camera":"A zoom to every group of clicks, then back out to the whole screen.","characters":"At most the small face bubble.","sound":"No transition sounds, ever. The recording's own voice carries the video."},"recorded":{"main":"screen","zoom":true,"chapterTitles":true,"bubble":true,"slots":[{"id":"screen","label":"Screen file","hint":"The screen recording."},{"id":"combined","label":"Or one combined file","hint":"One file with picture and sound."},{"id":"camera","label":"Camera file (optional)","hint":"Gives the small face bubble.","optional":true}]}},{"id":"screen-share","label":"Screen Share","description":"A camera file and a screen file. The layout switches between full face, split, and big screen with a small face, about every 8 seconds, timed to your sentences.","engine":"recorded","templates":[{"id":"full-face","label":"Full face"},{"id":"split","label":"Split"},{"id":"big-screen","label":"Big screen, small face"},{"id":"chapter-title","label":"Chapter title"}],"shotRules":{"pacing":"fast","cutFrequency":"A layout change about every 8 seconds, always where a sentence starts.","camera":"No camera moves: the layouts change.","characters":"The person speaking.","sound":"No transition sounds, ever. The recording's own voice carries the video."},"recorded":{"main":"both","layouts":true,"chapterTitles":true,"slots":[{"id":"camera","label":"Camera file","hint":"You talking."},{"id":"screen","label":"Screen file","hint":"What you show."}]}},{"id":"profile-silhouette","label":"Profile Silhouette","description":"A side-angle take becomes a dark silhouette with a thin rim light on a flat color background that changes at story beats. A front take supplies the voice.","engine":"recorded","templates":[{"id":"silhouette","label":"Silhouette"},{"id":"color-beat","label":"Color beat"}],"shotRules":{"pacing":"calm","cutFrequency":"The background changes at story beats, on a sentence.","camera":"None. The silhouette stays where it was filmed.","characters":"One dark figure, side on, with a thin rim light.","sound":"No transition sounds, ever. The recording's own voice carries the video."},"recorded":{"main":"camera","silhouette":true,"beats":true,"slots":[{"id":"camera","label":"Side-angle take","hint":"Filmed from the side, against anything: the background goes."},{"id":"front","label":"Front take (the voice)","hint":"Gives the sound. Without it the side take's own sound is used.","optional":true}]}}]],
    voiceKinds: { kokoro: "Free voice on this computer (Kokoro)", elevenlabs: "My ElevenLabs voice" },
    musicSources: { synth: "Made by code, free", own: "My own files" },
    moods: ["calm", "warm", "dark", "bright"],
    ownMusic: [],
    musicDir: "C:/identity/music",
    freeVoices: [{ id: "am_michael", name: "Michael", gender: "male" }, { id: "af_heart", name: "Heart", gender: "female" }],
    queue: q.get("queue") ? [1, 2, 3].map((n) => ({ dir: `C:/P/q${n}`, id: `q${n}`, title: `Queued video number ${n}`, status: n === 3 ? "Idea" : "Scripted", script: n === 3 ? "failed" : "pending", error: n === 3 ? "The AI said no." : null, running: false, batch: "b", position: n, of: 7 })) : [],
    week: 7,
  },
  "recipe-save": { recipe: { engine: "script" } },
  "thumbnail-state": { withFace: false, model: "free", variants: [], chosen: null, chosenFile: null, spentUsd: 0, photos: [], models: [{ id: "free", label: "Brand colours (free, no AI)", usdPerImage: 0, test: false, free: true }, { id: "gemini-nano-banana-2.1", label: "Gemini picture", usdPerImage: 0.0336, test: false }], title: "How to turn viewers into subscribers", hasVideo: false, maxWords: 4 },
  "thumbnail-photos": { photos: [], max: 3 },
  "keyword-ideas": { keywords: [{ keyword: "turn viewers into subscribers", monthlySearches: 1200, competition: 30, score: 62, growthPct: 4 }, { keyword: "how to get subscribers", monthlySearches: 8800, competition: 71, score: 41, growthPct: 1 }] },
  "video-keyword": { keyword: null },
  "suggest-channel": { text: "TEST text written by the AI" },
  // ?nobrief=1: a video whose research has not been done yet
  "research-state": { brief: q.get("nobrief") ? null : BRIEF },
  "research-save": { brief: BRIEF },
  "research-approve": { brief: { ...BRIEF, state: "approved" } },
  "research-make": { brief: BRIEF },
  "shot-map-state": SHOTMAP,
  "shot-map-make": SHOTMAP,
  "shot-flow-set": SHOTMAP,
  "shot-flow-clip": SHOTMAP,
  "week-batch-local": { written: 7, failed: 0, videos: [] },
  "recorded-state": {
    input: { files: { camera: "C:/Videos/my take.mp4" }, voice: "camera", notes: [] },
    preset: RECORDED,
    cuts: { before: 754, after: 612, removed: 142, counts: { take: 3, filler: 2, sound: 1 }, careful: false, keepPauses: false, words: 1830, check: { ok: true, words: 1830, wordsOnSpeech: 0.99, speechWithWords: 0.95, drift: 0.04, past: 0, seconds: 754 }, marks: [{ id: "c1", kind: "take", start: 12.4, end: 15.6, text: "The best way to start,", on: true }, { id: "c2", kind: "filler", start: 40.1, end: 40.4, text: "Um,", on: true }, { id: "c3", kind: "sound", start: 91, end: 91.4, text: "", on: false }] },
    plan: { title: "One clear promise", total: 612, plannedBy: "rule", chapters: [{ start: 0, sentence: "S1", title: "Why people leave" }, { start: 190, sentence: "S40", title: "One clear promise" }, { start: 420, sentence: "S88", title: "What to do next" }], bigWords: [{ id: "w1", text: "40%", start: 22.5, end: 24, behind: true }, { id: "w2", text: "promise", start: 80, end: 82, behind: true }], layouts: [], beats: [] },
    after: { ok: true, words: 1790, wordsOnSpeech: 0.99, speechWithWords: 0.96, drift: 0.05, past: 0, seconds: 612 },
    kept: 612,
    motion: null,
  },
  "week-batch": { written: 7, failed: 0, videos: [] },
  "queue-list": { queue: [] },
  "channel-video-new": { id: "new", dir: "C:/P/new" },
  "autopilot-mark": { autopilotRun: true },
  "assets-search": { hits: [], failed: [] },
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
      case "stop_job": { const j = jobs.find((x) => x.id === args.id); if (!j) throw "That job has already finished."; j.stopped = true; return null; }
      case "export_diagnostics": return args.path;
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
      case "plugin:event|listen": (listeners[args.event] ??= []).push(args.handler); return args.handler;
      case "export_video": return args.path;
      case "plugin:dialog|open": return "C:/Downloads/VoxFlow.identity.zip";
      case "plugin:dialog|save": return args?.options?.defaultPath ? `C:/Downloads/${args.options.defaultPath}` : "C:/Downloads/x.identity.zip";
      case "plugin:dialog|ask": return true;
      // ask() goes through "message" in the dialog plugin 2.x: confirm it.
      case "plugin:dialog|message": return "Yes";
      case "run_runner":
        if (typeof args.request.projectDir !== "undefined" && typeof args.request.projectDir !== "string") throw "projectDir must be a string";
        if (args.command in LONG) await longJob(args.command, args.request);
        if (args.command === "health-check") return { at: new Date().toISOString(), online: !q.get("sick"), problems: q.get("sick") ? 2 : 0, items: [
          { id: "ai", label: "AI text", state: "ok", detail: "Gemini" },
          { id: "heygen", label: "HeyGen", state: "note", fix: "No key. Videos are made without an avatar." },
          { id: "ffmpeg", label: "ffmpeg", state: q.get("sick") ? "fix" : "ok", fix: "ffmpeg is missing, so no video can be made. Reinstall the app." },
          { id: "engine", label: "Video engine", state: "ok", detail: "HyperFrames 0.8.181" },
          { id: "voice-model", label: "Free voice", state: "ok" },
          { id: "speech-model", label: "Speech model", state: "note", fix: "Recordings are turned into words on this computer. It downloads once, the first time it is needed." },
          { id: "disk-projects", label: "Disk space, your videos", state: q.get("sick") ? "fix" : "ok", detail: "36.0 GB free", fix: "Only 0.4 GB free, too little for a render. Free up some space." },
          { id: "internet", label: "Internet", state: "ok" },
        ] };
        if (args.command === "error-details") return { file: "C:/Users/me/AppData/Local/app.ideatovideo.desktop/logs/errors.log", entry: { at: "2026-11-03T20:00:00Z", command: "render-video", message: "A sentence.", raw: "ENOSPC: no space left", stack: "Error: ENOSPC" } };
        if (args.command === "project-note" || args.command === "script-offline" || args.command === "research-offline") return {};
        if (args.command === "load-project") return { project: q.get("notes") ? { ...project, notes: [{ kind: "voice", text: "The free voice on this computer read the narration, because ElevenLabs did not work: ElevenLabs rejected the API key." }, { kind: "avatar", text: "This video has no avatar: no HeyGen key is set." }] } : project, brief: null, scriptMarkdown: ORDER.indexOf("script") < stage || project.gates.script.state !== "todo" ? "## Opening\nYou want to start a channel.\n\n## Main part\nAsk one question.\n" : null, latestVideo: video, stills: stillsList(), voiceInfo: project.gates.voice.state !== "todo" ? { seconds: 128, voLufs: -16, finalLufs: -14, musicGainDb: -18, music: "music.mp3", words: 318 } : null, calls: null };
        if (args.command === "approve-gate") { setState(args.request.gate, "approved", project.gates[args.request.gate]?.mode); return { gate: project.gates[args.request.gate] }; }
        if (args.command === "skip-gate") { setState("avatar", "skipped"); return { gate: project.gates.avatar }; }
        if (args.command === "write-script" || args.command === "save-script") { setState("script", "pending", args.command === "save-script" ? "custom" : "recommended"); return { words: 318 }; }
        if (args.command === "make-voice") { setState("voice", "pending"); return { info: { seconds: 128, voLufs: -16, finalLufs: -14, musicGainDb: null, music: null, words: 318 } }; }
        if (args.command === "make-scenes" && q.get("aifail")) { setState("scenes", "failed"); throw "Gemini is overloaded or having problems right now (HTTP 503). Try again in a few minutes, or pick another model in Settings."; }
        if (args.command === "make-template-scenes" || args.command === "simple-template-scenes") setState("scenes", "pending", "recommended");
        if (args.command === "autopilot-mark") { if (args.request.on) project.autopilotRun = { at: "now" }; else delete project.autopilotRun; }
        if (args.command === "make-scenes" || args.command === "simple-scenes") setState("scenes", "pending", args.command === "simple-scenes" ? "default" : "recommended");
        if (args.command === "refill-scene" || args.command === "save-scenes") { setState("scenes", "pending", "custom"); project.gates.review = { state: "todo" }; }
        if (args.command === "build-video") { project.gates.review = { state: "pending" }; }
        if (args.command === "render-video") { video = { file: "/preview/motion.mp4", seconds: 128, renderSeconds: 417, chapters: "0:00 Intro", srt: "x.srt", publishFile: "x.publish.json", comments: "GUIDE", youtube: null }; return video; }
        if (args.command === "list-projects") return { projects: [{ id: "p", title: `Test of ${active()?.name}`, status: "Scened", dir: `${args.request.projectsDir}/test`, createdAt: "2026", gates: project.gates, series: courseHere ? SERIES : null }] };
        if (args.command === "course-preview") { if (/"schema_version":\s*"2/.test(args.request.text ?? "")) throw "This Course Content Structure is version 2.0. This app reads version 1 only. Update IdeaToVideo, then import it again."; return coursePreview(); }
        if (args.command === "course-list") { if (!courseHere) return { courses: [] }; const p = await coursePreview(); return { courses: [{ slug: p.course.slug, title: p.course.title, playlist: p.playlist, importedAt: "2026-10-11", hasFile: true, lessons: p.lessons.map((l, i) => ({ id: l.id, position: l.position, title: l.title, dir: i === 2 ? null : `${args.request.projectsDir}/test`, videoTitle: l.title, status: i === 2 ? null : ["Rendered", "Scened", null, "Idea"][i] })) }] }; }
        if (args.command === "course-import") { const p = await coursePreview(); const again = courseHere; courseHere = true; return { course: p.course, playlist: p.playlist, again, created: again ? 0 : 4, updated: again ? 1 : 0, unchanged: again ? 3 : 0, gone: [], warnings: [], file: "C:/P/_courses/x.json", lessons: p.lessons.map((l, i) => ({ id: l.id, position: l.position, title: l.title, dir: "x", action: again ? (i === 0 ? "updated" : "unchanged") : "created", updated: again && i === 0 ? ["keyword", "CTA"] : [], kept: again && i === 0 ? ["YouTube title", "hook"] : [], scriptKept: again && i === 0 })) }; }
        if (args.command === "course-export") return { file: args.request.file };
        // Channels board, Uploaded tick, Traffic Card, Playlist Planner (DECISIONS 127)
        if (args.command === "channel-board") {
          if (!courseHere) return { playlists: [] };
          const done = { script: { state: "approved" }, voice: { state: "approved" }, scenes: { state: "approved" }, review: { state: "approved" }, avatar: { state: "skipped" } };
          const v = (id, position, title, gates, extra = {}) => ({ id, position, title, dir: `${args.request.projectsDir}/${id}`, gates, rendered: false, done: false, sentAt: null, upload: null, ...extra });
          const videos = [
            v("m1-l1", 1, "What a ready starter looks like", done, { rendered: true, done: true, sentAt: "2026-10-22T10:00:00Z", upload: { at: "2026-10-23T12:00:00Z", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", videoId: "dQw4w9WgXcQ" } }),
            v("m1-l2", 2, "Mix the dough: touch one", project.gates),
            v("m2-l1", 3, "Shape the loaf", {}),
            v("m2-l2", 4, "Bake and cool", {}),
          ];
          return { playlists: [{ slug: "test-sourdough-in-a-weekend", title: "TEST Sourdough in a Weekend", playlist: null, total: 4, done: 1, uploaded: 1, next: "m1-l2", videos }] };
        }
        if (args.command === "upload-info" || args.command === "set-upload") {
          const calls = [{ slot: "start", keyword: "GUIDE" }, { slot: "middle", keyword: "COURSE" }, { slot: "end", keyword: "TRIGGER" }];
          if (args.command === "set-upload" && args.request.clear) return { upload: null, calls };
          if (args.command === "set-upload") return { upload: { at: `${args.request.at}T12:00:00Z`, url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", videoId: "dQw4w9WgXcQ" }, calls };
          return { upload: /m1-l1$/.test(args.request.projectDir) ? { at: "2026-10-23T12:00:00Z", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", videoId: "dQw4w9WgXcQ" } : null, calls };
        }
        // The YouTube Brand Channel Wizard: real questions and kit (kit.mjs), the answers kept in memory. ?noai=1: no AI key saved.
        if (args.command.startsWith("channel-wizard-")) {
          const K = await import("/channel-wizard-kit.mjs");
          const { channel = {}, ...input } = args.request;
          window.__wizard = window.__wizard ?? null;
          if (args.command === "channel-wizard-state") return { questions: K.QUESTIONS, phases: K.PHASES, draft: window.__wizard, hasCard: !!q.get("card"), kept: q.get("card") ? { keywords: 1, playlists: 0, videos: 0 } : null };
          if (args.command === "channel-wizard-draft") { window.__wizard = input; return { saved: true }; }
          if (args.command === "channel-wizard-kit") return { ...K.buildKit(input.answers, input.texts), checklist: K.checklist(input.answers), checklistText: K.checklistText(input.answers, input.checks), pathNote: K.PATH_NOTE, fields: K.fieldsFrom(input.answers, channel, input.texts), missing: K.missingAnswers(input.answers), markdown: K.cardMarkdown({ ...input, today: "2026-11-04" }), hasCard: !!q.get("card"), kept: q.get("card") ? { keywords: 1, playlists: 0, videos: 0 } : null };
          if (args.command === "channel-wizard-save") { window.__wizard = input; window.__wizardCard = K.cardMarkdown({ ...input, today: "2026-11-04" }); return { card: {} }; }
          if (args.command === "channel-wizard-export") return { file: input.file };
        }
        const mockCard = { generated: "2026-10-20", audience: "TEST home bakers", result: "bake a loaf in a weekend", topic: "sourdough", frustration: "", proof: "", language: "en", nameOptions: ["TEST Sourdough Weekend"], keywords: [{ keyword: "sourdough starter", volume: 74000, competition: "Medium", score: 62 }], playlists: [], videos: [] };
        if (args.command === "traffic-card-load") return { card: q.get("card") ? mockCard : null };
        if (args.command === "traffic-card-preview") return { card: mockCard, fields: [{ field: "name", label: "Channel name", now: "My Identity", value: "TEST Sourdough Weekend" }, { field: "audience", label: "Audience", now: "", value: "TEST home bakers" }] };
        if (args.command === "traffic-card-save") return { card: mockCard };
        if (args.command === "planner-start") return { card: q.get("card") ? mockCard : null, seeds: ["sourdough starter", "sourdough for beginners"], context: { audience: "TEST home bakers" }, research: window.__research ?? null };
        if (args.command === "night-candidates") return { groups: [{ key: "playlist:bread", title: "Playlist: TEST Sourdough Basics", videos: [1, 2, 3].map((n) => ({ dir: `C:/P/My Identity/lesson-${n}`, title: `TEST lesson ${n}`, status: "Idea", position: n, engine: "script" })) }, { key: "other", title: "Other videos", videos: [{ dir: `C:/P/My Identity/other`, title: "TEST other", status: "Scened", position: null, engine: "script" }] }] };
        if (args.command === "night-load") return { shift: window.__shift ?? null };
        if (args.command === "night-save") { window.__shift = args.request.shift; return { shift: args.request.shift }; }
        if (args.command === "night-clear") { window.__shift = null; return {}; }
        if (args.command === "night-prepare") return { recipe: {} };
        if (args.command === "planner-balance") return { credits: 480 };
        if (args.command === "planner-research") return window.__research = { seeds: args.request?.seeds ?? [], at: new Date().toISOString(), keywords: Array.from({ length: 12 }, (_, i) => ({ keyword: `sourdough kw ${i + 1}`, volume: 5000 - i * 300, competition: 20 + i, score: 70 - i })), failed: [], creditsBefore: 480, creditsAfter: 474, creditsUsed: 6 };
        if (args.command === "planner-plan") return { title: "TEST Sourdough Basics", promise: "Bake a loaf in a weekend", why: "Ten keywords have real volume and low competition; two are near duplicates, so 10 videos.", rows: Array.from({ length: 10 }, (_, i) => ({ position: i + 1, title: `Sourdough video ${i + 1}`, keyword: `sourdough kw ${i + 1}`, volume: 5000 - i * 300, competition: 20 + i })) };
        if (args.command === "planner-outline") return { outline: [] };
        if (args.command === "planner-build") return { text: "{}" };
        if (args.command === "create-project") return { id: "n", dir: `${args.request.projectsDir}/2026-10-01_new` };
        if (args.command === "brand-state") return brandState();
        if (args.command === "brand-save") { brandCard = { ...args.request.card, updatedAt: new Date().toISOString() }; return { card: brandCard, own: true, contrast: [] }; }
        if (args.command === "brand-import") return (await fetch("/brand-import.json")).json();
        if (args.command === "brand-preview") { await new Promise((r) => setTimeout(r, 600)); return { stills: [1, 2, 3, 4, 5].map((n) => ({ scene: n, at: n * 4 - 0.2, file: `/preview/${n}.png` })) }; }
        if (args.command === "dictionary-load") return { dictionary };
        // The Motion wizard (motion-state.json from prepare.mjs; the preview
        // video is the last real one, if prepare.mjs found it).
        // The CTA wizard (cta-state.json from prepare.mjs).
        if (args.command === "cta-state") { const c = await (await fetch("/cta-state.json")).json(); return { ...c, profile: ctaProfile }; }
        // "Previously used" voice and avatar of the Identity (runner last-used).
        // The Identity's footage (runner footage-list).
        // A real scene table, when prepare.mjs or a test put one next to the page.
        if (args.command === "scene-table") { try { const r = await fetch("/scene-table.json"); if (r.ok) return await r.json(); } catch {} }
        if (args.command === "scene-table" && brollOn) return brollTable();
        if (args.command === "broll-settings") return { settings: brollSettings, cap: { min: 1, max: 10, step: 0.5, default: 1 }, generators: BROLL_GENERATORS, qualities: BROLL_QUALITIES, paidChoice: PAID_CHOICE };
        // The B-roll engine on the Preview tab (?engine=1, runner/broll/engine.mjs).
        if (args.command === "broll-auto-state") return engineState();
        if (args.command === "kie-balance") return { account: { credits: 80, usd: 0.4 } };
        if (args.command === "broll-paid-toggle") { engineItems.find((i) => i.id === args.request.id).paidWanted = args.request.on; return engineState(); }
        if (args.command === "broll-auto-remove") { engineItems.find((i) => i.id === args.request.id).use = false; return engineState(); }
        if (args.command === "broll-prompt-save") { engineItems.find((i) => i.id === args.request.id).prompt = args.request.prompt; return engineState(); }
        if (args.command === "broll-paid-approve") { for (const i of engineItems.filter((x) => x.paidWanted)) Object.assign(i, { paidWanted: false, state: "done", source: "ai", usd: 0.12, license: "Kie AI terms of use (AI output, see docs/BUILD_PLAN.md)", author: "AI: Seedance 1.0 Lite (Kie AI)" }); return { ...engineState(), made: 1, failed: [] }; }
        if (args.command === "broll-settings-save") { brollSettings = { ...brollSettings, ...args.request.settings, capUsd: Math.min(10, Math.max(1, Math.round(Number(args.request.settings.capUsd) * 2) / 2)) }; return { settings: brollSettings }; }
        if (args.command === "broll-state") return brollState();
        if (args.command === "broll-balance") return { account: { kind: "wallet", remaining: 4.88, currency: "usd" } };
        if (args.command === "broll-estimate") return { estimate: brollEstimate(args.request.ids ?? null) };
        if (args.command === "broll-plan") {
          const p = (scene, text) => `A ${text}, seen from the side in soft morning light. Slow push in, shallow depth of field, warm golden tones with deep blue accents from the brand. Photographic, natural, calm, one continuous shot, no text and no logos anywhere in the picture.`;
          brollPlan = { schema: "itv-broll/1", aspect: "16:9", spentUsd: brollPlan?.spentUsd ?? 0, at: new Date().toISOString(), stale: false, items: [
            { id: "b1", scene: 2, from: "S3", to: "S3", said: SAID[2], start: 12, seconds: 6, order: 6, prompt: p(3, "small coffee shop at dawn with the first customer opening the glass door"), library: null, use: true, state: "planned", attempt: 0 },
            { id: "b2", scene: 5, from: "S6", to: "S6", said: SAID[5], start: 30, seconds: 6, order: 6, prompt: p(6, "creator at a desk looking at a laptop screen, hands on the keyboard"), library: null, use: true, state: "planned", attempt: 0 },
          ] };
          return { ...brollState(), note: null };
        }
        if (args.command === "broll-make") {
          const e = brollEstimate(args.request.ids ?? null);
          if (e.overCap && !args.request.allowOverCap) throw `These clips cost about ${e.usd.toFixed(2)} USD; this video's B-roll limit is ${brollSettings.capUsd.toFixed(2)} USD.`;
          let made = 0;
          for (const i of brollPlan.items.filter((x) => x.use && x.state !== "done" && (!args.request.ids || args.request.ids.includes(x.id)))) {
            const id = `g${brollGenerated.length + 1}`;
            const usd = Math.round(i.order * brollRate() * 100) / 100;
            brollGenerated.push({ id, file: `${id}.mp4`, name: `${brollSettings.generator === "test" ? "Test clip" : "AI clip"}: ${i.said.slice(0, 60)}`, description: i.prompt, seconds: i.order, shots: [0], stills: ["2.png", "3.png", "4.png"], source: "generated", used: [], createdAt: new Date().toISOString(), generated: { generator: brollSettings.generator, label: BROLL_GENERATORS.find((g) => g.id === brollSettings.generator).label, quality: brollSettings.quality, aspect: "16:9", prompt: i.prompt, seconds: i.order, usd, videoId: id, project: "p", ...(brollSettings.generator === "test" ? { test: true } : {}), at: new Date().toISOString() } });
            Object.assign(i, { state: "done", clip: id, usd });
            brollPlan.spentUsd = Math.round((brollPlan.spentUsd + usd) * 100) / 100;
            made++;
          }
          project.gates.review = { state: "todo" };
          return { ...brollState(), made, fromLibrary: 0, failed: [] };
        }
        if (args.command === "broll-update") { const i = brollPlan.items.find((x) => x.id === args.request.id); if (typeof args.request.prompt === "string") i.prompt = args.request.prompt; if (typeof args.request.use === "boolean") i.use = args.request.use; return brollState(); }
        if (args.command === "broll-again") { const i = brollPlan.items.find((x) => x.id === args.request.id); Object.assign(i, { state: "planned", clip: null, use: true, prompt: args.request.prompt ?? i.prompt, attempt: i.attempt + 1 }); return brollState(); }
        if (args.command === "broll-remove") { brollPlan.items.find((x) => x.id === args.request.id).use = false; return brollState(); }
        if (args.command === "footage-list" && brollOn) return { mode: "scene", dir: "/preview", maxSeconds: 600, modes: { scene: "Its own scene: only the footage, full frame", background: "Behind the words: the footage, darkened, with the scene's short text on it" }, clips: [{ id: "f1", file: "f1.mp4", name: "office walk", description: "A person walks through a bright office with a laptop.", seconds: 74.2, shots: [0, 12.5, 31, 47.2], stills: [], source: "upload", used: [{ project: "a", start: 0, end: 6 }], createdAt: "2026-10-05" }, ...brollGenerated] };
        if (args.command === "footage-list") return { mode: "scene", dir: "/preview", maxSeconds: 600, modes: { scene: "Its own scene: only the footage, full frame", background: "Behind the words: the footage, darkened, with the scene's short text on it" }, clips: [{ id: "f1", file: "f1.mp4", name: "office walk", description: "A person walks through a bright office with a laptop.", seconds: 74.2, shots: [0, 12.5, 31, 47.2], stills: [], source: "upload", used: [{ project: "a", start: 0, end: 6 }], createdAt: "2026-10-05" }, { id: "f2", file: "f2.mp4", name: "city timelapse", description: "", seconds: 31, shots: [0], stills: [], source: "upload", used: [], createdAt: "2026-10-05" }] };
        if (args.command === "last-used") return { used: { voice: { provider: "elevenlabs", voice: "v1", name: "Zoltan BD" } } };
        if (args.command === "segment-import-list") return { maxSeconds: 30, videos: [{ id: "v1", title: "Comment GUIDE below", seconds: 8.4, createdAt: 1760000000, image: null, tooLong: false, imported: false }, { id: "v2", title: "Comment COURSE below", seconds: 9.1, createdAt: 1760000100, image: null, tooLong: false, imported: false }, { id: "v3", title: "Comment TRIGGER below", seconds: 7.7, createdAt: 1760000200, image: null, tooLong: false, imported: true }, { id: "v4", title: "Full webinar intro", seconds: 74, createdAt: 1760000300, image: null, tooLong: true, imported: false }] };
        if (args.command === "segments-list") { const c = await (await fetch("/cta-state.json")).json(); return { segments: c.segments, maxSeconds: 30, perKeyword: 3 }; }
        if (args.command === "cta-save") { ctaProfile = { schema: "cta-profile/1", ...args.request.profile, updatedAt: new Date().toISOString() }; return { profile: ctaProfile }; }
        if (args.command === "stock-suggest") return { queries: ["plan week", "morning routine", "calendar", "coffee"] };
        if (args.command === "stock-search") { await new Promise((r) => setTimeout(r, 600)); const hue = [210, 30, 140, 280, 0, 90]; return { cached: false, hits: hue.map((h, i) => ({ id: String(100 + i), kind: args.request.kind, width: 1920, height: 1080, seconds: args.request.kind === "video" ? 8 + i : null, tags: `${args.request.q}, desk, light`, author: "someone", ...(args.request.service === "unsplash" ? { authorUrl: "https://unsplash.com/@someone?utm_source=ideatovideo&utm_medium=referral", pageUrl: "https://unsplash.com/photos/x?utm_source=ideatovideo&utm_medium=referral" } : {}), preview: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 9'><rect width='16' height='9' fill='hsl(${h},45%,60%)'/></svg>`)}` })) }; }
        if (args.command === "stock-add") { await new Promise((r) => setTimeout(r, 1200)); return { clip: { name: "Photo: desk" }, again: args.request.id === "101" }; }
        if (args.command === "scenes-state") return await (await fetch("/scenes-state.json")).json();
        if (args.command === "scenes-save") return { profile: args.profile };
        if (args.command === "packs-list") return await (await fetch("/packs-list.json")).json();
        if (args.command === "pack-state") return { state: { on: true, followBrand: true, off: [], ...args.state } };
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
