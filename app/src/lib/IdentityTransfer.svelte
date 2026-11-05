<script lang="ts">
  // One Identity as one file, in or out: its settings, logo, look and extra scene designs, with no
  // key. On Identity, Manage Identity and on Settings, Import & Export (DECISIONS 179).
  import { open, save as saveDialog } from "@tauri-apps/plugin-dialog";
  import { revealItemInDir } from "@tauri-apps/plugin-opener";
  import type { AppState } from "./api";
  import { errorText, importIdentity, exportIdentity } from "./api";
  import { roomForIdentity } from "./identity";
  import { fullPlanText } from "./edition";
  import ErrorBox from "./ErrorBox.svelte";

  let { app, saved, off = false }: { app: AppState; saved: (s: AppState, text: string) => void; off?: boolean } = $props();

  let busy = $state("");
  let message = $state("");
  let error = $state("");
  let path = $state("");
  const room = $derived(roomForIdentity(app.identities.length, app.edition.identityLimit));

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
</script>

<p class="hint">One file with everything of an Identity: its settings, logo, look and extra scene designs, to start it on another computer or for another person. API keys are never in it.</p>
<div class="row">
  <button type="button" disabled={off || !!busy || !room} title={room ? "" : fullPlanText(app.edition)} onclick={identityIn}>Import Identity</button>
  <button type="button" disabled={off || !!busy} onclick={identityOut}>Export {app.identity?.name}</button>
</div>
{#if !room}<p class="hint">{fullPlanText(app.edition)}</p>{/if}
{#if busy}<p class="busy">{busy}</p>{/if}
{#if message}<p class="good">{message}{#if path} <button type="button" class="link" onclick={() => revealItemInDir(path)}>Show in folder</button>{/if}</p>{/if}
{#if error}<ErrorBox message={error} context={{ step: "identity-transfer" }} />{/if}

<style>
  .row { display: flex; gap: 8px; flex-wrap: wrap; }
  .hint { font-size: 13px; color: var(--muted-foreground); margin: 0 0 8px; }
  .good { color: var(--success); margin: 8px 0 0; word-break: break-word; }
  .busy { font-weight: 600; margin: 8px 0 0; }
  .link { border: none; background: none; padding: 0; color: var(--primary); text-decoration: underline; cursor: pointer; font-size: inherit; font-family: inherit; min-height: 0; }
</style>
