<script lang="ts">
  // Settings, Backup (DECISIONS 66, docs/backup.md): the backup folder
  // (the Google Drive, OneDrive or Dropbox desktop folder uploads it), the
  // default level with sizes from the ONE Videos on this computer, automatic
  // backups. "Back up now" is on Settings, Import & Export (DECISIONS 119).
  import { open } from "@tauri-apps/plugin-dialog";
  import type { AppState, BackupSettings } from "./api";
  import { runner, cloudFolders } from "./api";

  let { app, backup = $bindable(), goto }: { app: AppState; backup: BackupSettings; goto?: (page: "transfer") => void } = $props();

  let clouds = $state<{ label: string; path: string }[]>([]);
  let sizes = $state<Record<string, number> | null>(null);
  let projects = $state(0);

  cloudFolders().then((c) => (clouds = c)).catch(() => {});
  runner<{ projects: number; levels: Record<string, number> }>("backup-estimate", {})
    .then((r) => {
      sizes = r.levels;
      projects = r.projects;
    })
    .catch(() => {});


  const LEVELS: { n: 1 | 2 | 3 | 4; title: string; what: string }[] = [
    { n: 1, title: "Script", what: "The script and the ONE Video's settings." },
    { n: 2, title: "Script and voice", what: "Plus the narration, the music and the timing." },
    { n: 3, title: "Plus the scene plan", what: "Plus the scene table." },
    { n: 4, title: "Everything", what: "Plus the latest finished video, its captions and chapters, and the avatar clips." },
  ];

  const mb = (b: number | undefined) => (b === undefined ? "" : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(b < 100 * 1024 * 1024 ? 1 : 0)} MB`);

  async function choose() {
    const dir = await open({ directory: true, multiple: false });
    if (typeof dir === "string") backup = { ...backup, dir };
  }

</script>

<section class="card">
  <h2>Backup folder</h2>
  <p class="hint">Your videos and settings are copied here. Pick a folder inside Google Drive, OneDrive or Dropbox on this computer, and their own app uploads it. No account or key is needed in {app.edition.product}.</p>
  {#if backup.dir}
    <p class="path">{backup.dir}</p>
  {:else}
    <p class="hint"><strong>No backup folder yet.</strong> Your videos are only on this computer.</p>
  {/if}
  <div class="row">
    <button type="button" onclick={choose}>Choose folder</button>
    {#each clouds as c (c.path)}
      <button type="button" class:primary={backup.dir === c.path} onclick={() => (backup = { ...backup, dir: c.path })} title={c.path}>Use {c.label}</button>
    {/each}
    {#if backup.dir}<button type="button" class="ghost" onclick={() => (backup = { ...backup, dir: null })}>Turn off</button>{/if}
  </div>
  {#if backup.dir}<p class="hint">The backup goes in {backup.dir.replace(/[\\/]+$/, "")}/{app.edition.product}_Backup.</p>{/if}
</section>

<section class="card">
  <h2>What to back up</h2>
  <p class="hint">The default for every ONE Video. A ONE Video can choose its own on its page.{sizes ? ` Sizes for your ${projects} ${projects === 1 ? "video" : "videos"} now:` : ""}</p>
  {#each LEVELS as l (l.n)}
    <label class="radio">
      <input type="radio" name="level" checked={(backup.level ?? 4) === l.n} onchange={() => (backup = { ...backup, level: l.n })} />
      <span><strong>{l.n}. {l.title}</strong>{sizes ? ` (${mb(sizes[l.n])})` : ""}. {l.what}</span>
    </label>
  {/each}
  <label class="radio"><input type="checkbox" checked={backup.auto ?? true} onchange={(e) => (backup = { ...backup, auto: e.currentTarget.checked })} /> Back up automatically after every approval and every render</label>
</section>

<section class="card">
  <h2>Back up now</h2>
  <p class="hint">Every ONE Video of every Identity and the settings, at once: on {#if goto}<button type="button" class="link" onclick={() => goto("transfer")}>Settings, Import & Export</button>{:else}Settings, Import & Export{/if}. Save settings first if you changed the folder.</p>
</section>

<style>
  h2 { margin: 0 0 12px; font-size: 17px; }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .radio { display: flex; gap: 8px; align-items: baseline; margin: 8px 0; font-weight: 400; }
  .hint { font-size: 13px; color: var(--muted-foreground); }
  .path { font-family: var(--font-mono); font-size: 13px; word-break: break-all; }
  .link { border: none; background: none; padding: 0; color: var(--primary); text-decoration: underline; cursor: pointer; font-size: inherit; font-family: inherit; min-height: 0; }
</style>
