<script lang="ts">
  // The backup of one ONE Video (docs/backup.md A): when it was last backed
  // up, its own level (or the default from Settings), and "Back up now".
  // Automatic backups after approvals and renders arrive as "backup-done".
  import { onDestroy } from "svelte";
  import type { AppState } from "./api";
  import { runner, onBackupDone, errorText } from "./api";
  import ErrorBox from "./ErrorBox.svelte";

  let { app, dir }: { app: AppState; dir: string } = $props();

  type Record = { path?: string; at?: string; level?: number | null; lastLevel?: number; restoredAt?: string };
  let rec = $state<Record>({});
  let busy = $state(false);
  let error = $state("");
  const deflt = $derived(app.app?.backup?.level ?? 4);

  const load = () => runner<Record>("backup-status", { projectDir: dir }).then((r) => (rec = r)).catch(() => {});
  load();
  const un = onBackupDone((b) => {
    if (b.projectDir.replace(/\\/g, "/") === dir.replace(/\\/g, "/")) {
      if (b.ok) load();
      else error = b.error ?? "The backup failed.";
    }
  });
  onDestroy(() => {
    un.then((f) => f());
  });

  const when = (iso?: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    const today = new Date().toDateString() === d.toDateString();
    return today ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  };

  async function setLevel(v: string) {
    try {
      rec = await runner<Record>("set-backup-level", { projectDir: dir, level: v === "default" ? null : Number(v) });
    } catch (e) {
      error = errorText(e);
    }
  }

  async function now() {
    busy = true;
    error = "";
    try {
      await runner("backup-project", { projectDir: dir });
      await load();
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }
</script>

<section class="card backup">
  <div class="row">
    <h2>Backup</h2>
    <span class="state">
      {#if !app.backupRoot}Off: no backup folder (Settings, App, Backup).
      {:else if rec.at}Backed up {when(rec.at)}, level {rec.lastLevel ?? deflt}.
      {:else}Not backed up yet.{/if}
    </span>
    <span class="spacer"></span>
    <label for="blevel" class="sr">Backup level</label>
    <select id="blevel" value={rec.level ? String(rec.level) : "default"} onchange={(e) => setLevel(e.currentTarget.value)} disabled={!app.backupRoot}>
      <option value="default">Default ({deflt})</option>
      <option value="1">1. Script</option>
      <option value="2">2. Script and voice</option>
      <option value="3">3. Plus the scene plan</option>
      <option value="4">4. Everything</option>
    </select>
    <button type="button" disabled={busy || !app.backupRoot} onclick={now}>{busy ? "Backing up..." : "Back up now"}</button>
  </div>
  {#if rec.path && app.backupRoot}<p class="hint">{app.backupRoot}/{rec.path.replace(/\\/g, "/")}</p>{/if}
  {#if error}<ErrorBox message={error} context={{ step: "backup" }} />{/if}
</section>

<style>
  .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  h2 { margin: 0; font-size: 17px; }
  .state { color: var(--muted-foreground); font-size: 14px; }
  .spacer { flex: 1; }
  .hint { margin: 8px 0 0; font-size: 12px; color: var(--muted-foreground); word-break: break-all; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
</style>
