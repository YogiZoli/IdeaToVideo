<script lang="ts">
  // Settings, Import & Export (D4, DECISIONS 119): every file that goes in
  // or out, on one page. The Identity first, then one row each: what it
  // carries, Import, Export. The places these buttons used to be link here.
  // Brand Identity Card import and export come from Settings (they also
  // write the Identity's light logo); the rest is done here.
  import { onMount } from "svelte";
  import { open, save as saveDialog } from "@tauri-apps/plugin-dialog";
  import { revealItemInDir } from "@tauri-apps/plugin-opener";
  import type { AppState, BrandState, BrandCard, ProjectSummary } from "./api";
  import { runner, errorText, importIdentity, exportIdentity, exportDiagnostics, backupSettingsNow, exportCard, readTokensFile } from "./api";
  import { roomForIdentity } from "./identity";
  import { fullPlanText } from "./edition";
  import { fileName } from "./brand";
  import { log } from "./logger";
  import ErrorBox from "./ErrorBox.svelte";
  import Progress from "./Progress.svelte";
  import HeygenImport from "./cta/HeygenImport.svelte";

  let {
    app,
    saved,
    busy: outerBusy = false,
    importCard,
    exportCardFile,
    goto,
  }: {
    app: AppState;
    saved: (s: AppState, text: string) => void;
    busy?: boolean;
    importCard: () => void;
    exportCardFile: () => void;
    goto: (page: "backup" | "look") => void;
  } = $props();

  let busy = $state("");
  let message = $state("");
  let error = $state("");
  let path = $state("");
  const room = $derived(roomForIdentity(app.identities.length, app.edition.identityLimit));

  type Pack = { id: string; name: string };
  let packs = $state<Pack[]>([]);
  let packId = $state("");
  let videos = $state<ProjectSummary[]>([]);
  let videoDir = $state("");

  async function loadLists() {
    try {
      packs = (await runner<{ packs: Pack[] }>("packs-list", {})).packs;
      if (!packs.some((p) => p.id === packId)) packId = packs[0]?.id ?? "";
    } catch {
      packs = [];
    }
    try {
      videos = (await runner<{ projects: ProjectSummary[] }>("list-projects", { projectsDir: app.projectsDir })).projects;
      if (!videos.some((v) => v.dir === videoDir)) videoDir = videos[0]?.dir ?? "";
    } catch {
      videos = [];
    }
  }
  onMount(loadLists);

  async function run(label: string, work: () => Promise<void>) {
    busy = label;
    message = "";
    error = "";
    path = "";
    try {
      await work();
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = "";
    }
  }

  async function identityIn() {
    const file = await open({ multiple: false, directory: false, filters: [{ name: "Identity", extensions: ["zip"] }] });
    if (typeof file !== "string") return;
    await run("Importing the Identity...", async () => {
      const s = await importIdentity(file);
      saved(s, `Imported "${s.identity?.name}". You are now working in it. Its own API keys are not in the file: add them on Settings, Connections if it needs any.`);
    });
  }

  async function identityOut() {
    const file = await saveDialog({ defaultPath: `${app.identity!.name}.identity.zip`, filters: [{ name: "Identity", extensions: ["zip"] }] });
    if (typeof file !== "string") return;
    await run("Exporting the Identity...", async () => {
      path = await exportIdentity(app.identity!.id, file);
      message = "Exported. No API key is in the file.";
    });
  }

  // tokens.css: a design system's tokens become this Identity's look; the
  // logo and the name on screen stay (docs/wizards/brand.md).
  async function tokensIn() {
    const file = await open({ multiple: false, directory: false, filters: [{ name: "Design tokens", extensions: ["css"] }] });
    if (typeof file !== "string") return;
    await run("Reading the tokens...", async () => {
      const text = await readTokensFile(file);
      const r = await runner<{ card: BrandCard; fonts: string[] }>("brand-import", { text, fileName: fileName(file) });
      const now = await runner<BrandState>("brand-state", {});
      await runner("brand-save", { card: { ...r.card, logo: now.card.logo, nameplate: now.card.nameplate } });
      log("brand_tokens_imported", { fonts: r.fonts.length });
      message = `Imported from ${fileName(file)}. New videos of this Identity use this look.${r.fonts.length ? ` Fonts the app does not ship were replaced by free look-alikes: ${[...new Set(r.fonts)].join(", ")}.` : ""} Check it in Wizards, Brand.`;
    });
  }

  async function packIn() {
    const file = await open({ multiple: false, directory: false, filters: [{ name: "IdeaToVideo pack", extensions: ["itvpack"] }] });
    if (typeof file !== "string") return;
    await run("Checking and importing the pack...", async () => {
      const r = await runner<{ id: string; name: string; blocks: number }>("pack-import", { file });
      log("pack_imported", { id: r.id, blocks: r.blocks });
      message = `Imported: ${r.name}, ${r.blocks} scene types. Turn them on or off in Wizards, Scenes.`;
      await loadLists();
    });
  }

  async function packOut() {
    const file = await saveDialog({ title: "Export pack", defaultPath: `${packId}.itvpack`, filters: [{ name: "IdeaToVideo pack", extensions: ["itvpack"] }] });
    if (!file) return;
    await run("Exporting the pack...", async () => {
      path = (await runner<{ file: string }>("pack-export", { id: packId, file })).file;
      log("pack_exported", { id: packId });
      message = "Pack exported.";
    });
  }

  async function cardOut() {
    await run("Finding the card...", async () => {
      const r = await runner<{ latestVideo: { cardFile?: string | null } | null }>("load-project", { projectDir: videoDir });
      const card = r.latestVideo?.cardFile;
      if (!card) throw new Error("This ONE Video has no publishing card yet: it is made with the finished video.");
      const file = await saveDialog({ defaultPath: card.split(/[\\/]/).pop(), filters: [{ name: "Publishing card", extensions: ["json"] }] });
      if (typeof file !== "string") return;
      path = await exportCard(card, file);
      log("card_exported", {});
      message = "Video Publishing Card exported.";
    });
  }

  async function diagnostics() {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    const file = await saveDialog({ title: "Export diagnostics", defaultPath: `IdeaToVideo-diagnostics-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.zip`, filters: [{ name: "Zip", extensions: ["zip"] }] });
    if (!file) return;
    await run("Exporting...", async () => {
      path = await exportDiagnostics(file);
      message = "Saved. Send this file to the person helping you; it holds no key, no video and no script text.";
    });
  }

  const mb = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);
  async function backupNow() {
    await run("Backing up...", async () => {
      const r = await runner<{ projects: number; copied: number; bytes: number; failed: { project: string; error: string }[] }>("backup-all", {});
      const n = await backupSettingsNow();
      message = `Backed up ${r.projects} ${r.projects === 1 ? "video" : "videos"} (${r.copied} files changed, ${mb(r.bytes)}) and the settings of ${n} ${n === 1 ? "Identity" : "Identities"}.`;
      if (r.failed.length) error = `Not backed up: ${r.failed.map((f) => `${f.project}: ${f.error}`).join("; ")}`;
    });
  }

  const off = $derived(!!busy || outerBusy);
</script>

{#if message}<p class="good">{message}{#if path} <button type="button" class="link" onclick={() => revealItemInDir(path)}>Show in folder</button>{/if}</p>{/if}
{#if error}<ErrorBox message={error} context={{ step: "import-export" }} />{/if}
{#if busy}<p class="busy">{busy}</p>{/if}
{#if busy === "Backing up..."}<Progress command="backup-all" label="Backup" />{/if}

<section class="card top">
  <h2>Identity</h2>
  <p class="hint">One file with an Identity's settings, logo, look and scene packs, to start it on another computer or for another person. API keys are never in it.</p>
  <div class="row">
    <button type="button" class="primary" disabled={off || !room} title={room ? "" : fullPlanText(app.edition)} onclick={identityIn}>Import Identity</button>
    <button type="button" disabled={off} onclick={identityOut}>Export {app.identity?.name}</button>
  </div>
  {#if !room}<p class="hint">{fullPlanText(app.edition)}</p>{/if}
</section>

<section class="card">
  <h2>Everything else</h2>
  <div class="rows">
    <div class="r">
      <div><b>Brand Identity Card</b><span>This Identity's look (colors, fonts, shapes, name on screen) and its logos, as one .zip. Import replaces the look.</span></div>
      <div class="acts"><button type="button" disabled={off} onclick={importCard}>Import</button><button type="button" disabled={off} onclick={exportCardFile}>Export</button></div>
    </div>
    <div class="r">
      <div><b>Design tokens (tokens.css)</b><span>From Claude Design, open-design or any design system. Becomes this Identity's look; the logo stays. Fine-tune it in <button type="button" class="link" onclick={() => goto("look")}>Wizards, Brand</button>.</span></div>
      <div class="acts"><button type="button" disabled={off} onclick={tokensIn}>Import</button><span class="na">Import only</span></div>
    </div>
    <div class="r">
      <div><b>Scene pack (.itvpack)</b><span>Scene types someone designed, for this Identity.</span>
        {#if packs.length}<select bind:value={packId} aria-label="Pack to export">{#each packs as p (p.id)}<option value={p.id}>{p.name}</option>{/each}</select>{/if}
      </div>
      <div class="acts"><button type="button" disabled={off} onclick={packIn}>Import</button><button type="button" disabled={off || !packId} onclick={packOut}>Export</button></div>
    </div>
    <div class="r wide">
      <div><b>HeyGen video for a CTA keyword</b><span>A video already in your HeyGen account becomes the clip of one comment keyword. Reading and downloading costs nothing.</span></div>
      <HeygenImport {app} />
    </div>
    <div class="r">
      <div><b>Video Publishing Card</b><span>A finished ONE Video's card (.card.json): chapters, script, comment keywords, title, summary, tags.</span>
        {#if videos.length}<select bind:value={videoDir} aria-label="ONE Video">{#each videos as v (v.dir)}<option value={v.dir}>{v.title}</option>{/each}</select>{:else}<span>No ONE Video yet.</span>{/if}
      </div>
      <div class="acts"><span class="na">Export only</span><button type="button" disabled={off || !videoDir} onclick={cardOut}>Export</button></div>
    </div>
    <div class="r">
      <div><b>Diagnostics</b><span>One zip with the log, the settings and every ONE Video's state, for the person helping you. No key, no video, no script text.</span></div>
      <div class="acts"><span class="na">Export only</span><button type="button" disabled={off} onclick={diagnostics}>Export</button></div>
    </div>
    <div class="r">
      <div><b>Backup</b><span>{app.backupRoot ? "Every ONE Video of every Identity and the settings (never the keys) into the backup folder. Only changed files are copied." : "No backup folder yet."} The folder and the level: <button type="button" class="link" onclick={() => goto("backup")}>Settings, Backup</button>. A ONE Video comes back with "Restore from backup" on Videos.</span></div>
      <div class="acts"><span class="na">Restore on Videos</span><button type="button" disabled={off || !app.backupRoot} onclick={backupNow}>Back up now</button></div>
    </div>
  </div>
</section>

<style>
  h2 { margin: 0 0 8px; font-size: 17px; }
  .top { border-width: 2px; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; }
  .rows { display: grid; }
  .r { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 12px 0; border-top: 1px solid var(--border); }
  .r:first-child { border-top: none; padding-top: 0; }
  .r.wide { grid-template-columns: 1fr; }
  .r > div:first-child { display: grid; gap: 4px; }
  .r span { font-size: 13px; color: var(--muted-foreground); }
  .r select { max-width: 360px; }
  .acts { display: flex; gap: 8px; align-items: center; justify-content: flex-end; }
  .acts button { min-width: 84px; }
  .na { font-size: 12px; min-width: 84px; text-align: center; }
  .hint { font-size: 13px; color: var(--muted-foreground); margin: 0 0 8px; }
  .good { color: var(--success); margin: 0; word-break: break-word; }
  .busy { font-weight: 600; margin: 0; }
  .link { border: none; background: none; padding: 0; color: var(--primary); text-decoration: underline; cursor: pointer; font-size: inherit; font-family: inherit; min-height: 0; }
</style>
