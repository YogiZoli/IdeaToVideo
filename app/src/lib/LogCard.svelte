<script lang="ts">
  // Settings, App, General, "Log" (docs/backup.md B): where the local log is,
  // how big it is, this session's errors and warnings, and the only way it
  // goes away (Zoltan, 2026-10-01: never deleted by the app).
  import { untrack } from "svelte";
  import { ask } from "@tauri-apps/plugin-dialog";
  import { revealItemInDir } from "@tauri-apps/plugin-opener";
  import { logStatus, deleteLogs, errorText, type LogStatus } from "./api";

  let { initial }: { initial: LogStatus } = $props();

  let st = $state<LogStatus>(untrack(() => ({ ...initial })));
  let message = $state("");
  logStatus().then((s) => (st = s)).catch(() => {});

  const size = $derived(st.bytes < 1024 * 1024 ? `${Math.max(1, Math.round(st.bytes / 1024))} KB` : `${(st.bytes / 1024 / 1024).toFixed(1)} MB`);

  async function openFolder() {
    if (st.dir) await revealItemInDir(st.dir).catch((e) => (message = errorText(e)));
  }

  async function remove() {
    if (!(await ask("Delete every log file? The log helps find problems, so keep it unless you need the space.", { title: "Delete logs", kind: "warning" }))) return;
    try {
      st = await deleteLogs();
      message = "Logs deleted.";
    } catch (e) {
      message = errorText(e);
    }
  }
</script>

<section class="card">
  <h2>Log</h2>
  <p class="hint">A record of what the app did, on this computer only. It never contains your keys, scripts or texts, and it is never sent anywhere. When something goes wrong, the person helping you can read it instead of asking for screenshots.</p>
  <p class="line">Since the app started: {st.errors} {st.errors === 1 ? "error" : "errors"}, {st.warnings} {st.warnings === 1 ? "warning" : "warnings"}. {st.files} {st.files === 1 ? "file" : "files"}, {size}.</p>
  {#if st.dir}<p class="path">{st.dir}</p>{/if}
  <div class="row">
    <button type="button" onclick={openFolder} disabled={!st.dir}>Open log folder</button>
    <button type="button" class="ghost" onclick={remove} disabled={!st.files}>Delete logs</button>
  </div>
  {#if message}<p class="hint">{message}</p>{/if}
</section>

<style>
  h2 { margin: 0 0 12px; font-size: 17px; }
  .row { display: flex; gap: 8px; }
  .hint { font-size: 13px; color: var(--muted-foreground); }
  .line { margin: 6px 0; }
  .path { font-family: var(--font-mono); font-size: 13px; word-break: break-all; color: var(--muted-foreground); }
</style>
