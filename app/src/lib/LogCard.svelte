<script lang="ts">
  // Settings, App, General, "Log" (docs/backup.md B): where the local log is,
  // how big it is, this session's errors and warnings, and the only way it
  // goes away (Zoltan, 2026-10-01: never deleted by the app).
  import { untrack } from "svelte";
  import { ask, save } from "@tauri-apps/plugin-dialog";
  import { revealItemInDir } from "@tauri-apps/plugin-opener";
  import { logStatus, deleteLogs, exportDiagnostics, errorText, type LogStatus } from "./api";

  let { initial }: { initial: LogStatus } = $props();

  let st = $state<LogStatus>(untrack(() => ({ ...initial })));
  let message = $state("");
  logStatus().then((s) => (st = s)).catch(() => {});

  const size = $derived(st.bytes < 1024 * 1024 ? `${Math.max(1, Math.round(st.bytes / 1024))} KB` : `${(st.bytes / 1024 / 1024).toFixed(1)} MB`);

  async function openFolder() {
    if (st.dir) await revealItemInDir(st.dir).catch((e) => (message = errorText(e)));
  }

  // One zip to send when something went wrong (2026-10-06): the log, the
  // settings and every ONE Video's state, never a key or a video.
  let exporting = $state(false);
  let exported = $state("");
  async function diagnostics() {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    const path = await save({ title: "Export diagnostics", defaultPath: `IdeaToVideo-diagnostics-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.zip`, filters: [{ name: "Zip", extensions: ["zip"] }] });
    if (!path) return;
    exporting = true;
    message = "";
    try {
      exported = await exportDiagnostics(path);
      message = "Saved. Send this file to the person helping you; it holds no key, no video and no script text.";
    } catch (e) {
      message = errorText(e);
    } finally {
      exporting = false;
    }
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
    <button type="button" class="primary" onclick={diagnostics} disabled={exporting}>{exporting ? "Exporting..." : "Export diagnostics"}</button>
    <button type="button" onclick={openFolder} disabled={!st.dir}>Open log folder</button>
    <button type="button" class="ghost" onclick={remove} disabled={!st.files}>Delete logs</button>
  </div>
  {#if message}<p class="hint">{message}</p>{/if}
  {#if exported}<p class="path">{exported} <button type="button" class="link" onclick={() => revealItemInDir(exported)}>Show in folder</button></p>{/if}
</section>

<style>
  h2 { margin: 0 0 12px; font-size: 17px; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; }
  .hint { font-size: 13px; color: var(--muted-foreground); }
  .line { margin: 6px 0; }
  .path { font-family: var(--font-mono); font-size: 13px; word-break: break-all; color: var(--muted-foreground); }
</style>
