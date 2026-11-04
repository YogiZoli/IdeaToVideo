<script lang="ts">
  // Publishing, PDT Connection (DECISIONS 114, 115, 168): a finished video's
  // publishing card goes out from here, or from its Your video tab: sent to the
  // publishing app, or saved as a file. Each list is this Identity's videos.
  import { onMount } from "svelte";
  import { save as saveDialog } from "@tauri-apps/plugin-dialog";
  import { revealItemInDir } from "@tauri-apps/plugin-opener";
  import type { AppState, ProjectSummary } from "../api";
  import { runner, errorText, exportCard } from "../api";
  import type { TabId } from "../tabs";
  import { log } from "../logger";
  import ErrorBox from "../ErrorBox.svelte";

  let { app, openVideoAt }: { app: AppState; openVideoAt: (dir: string, tab: TabId) => void } = $props();

  type Sent = { ok: boolean; retry?: boolean; message?: string; url?: string | null; updated?: boolean };
  let videos = $state<ProjectSummary[]>([]);
  let dir = $state("");
  let busy = $state(false);
  let error = $state("");
  let message = $state("");
  let path = $state("");
  const pubUrl = $derived(app.app?.publishing?.url ?? "");
  const pubReady = $derived(!!pubUrl && !!app.keys["publishing"]);

  onMount(async () => {
    try {
      videos = (await runner<{ projects: ProjectSummary[] }>("list-projects", { projectsDir: app.projectsDir })).projects;
      dir = videos[0]?.dir ?? "";
    } catch {
      videos = [];
    }
  });

  async function cardOf(): Promise<string> {
    const r = await runner<{ latestVideo: { cardFile?: string | null } | null }>("load-project", { projectDir: dir });
    const card = r.latestVideo?.cardFile;
    if (!card) throw new Error("This video has no publishing card yet: it is made with the finished video.");
    return card;
  }

  async function run(work: () => Promise<void>) {
    busy = true;
    error = "";
    message = "";
    path = "";
    try {
      await work();
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }

  const save = () =>
    run(async () => {
      const card = await cardOf();
      const file = await saveDialog({ defaultPath: card.split(/[\\/]/).pop(), filters: [{ name: "Publishing card", extensions: ["json"] }] });
      if (typeof file !== "string") return;
      path = await exportCard(card, file);
      log("card_exported", {});
      message = "Publishing card saved.";
    });

  const send = () =>
    run(async () => {
      const card = await cardOf();
      const sent = await runner<Sent>("card-send", { projectDir: dir, file: card, url: pubUrl, service: "publishing" });
      log("card_sent", { ok: sent.ok, updated: !!sent.updated });
      if (!sent.ok) throw new Error(sent.message ?? "The publishing app did not take the card.");
      message = sent.updated ? "Updated in Publishing." : "Sent to Publishing.";
    });
</script>

<section class="card">
  <h2>Video Publishing Card</h2>
  <p class="hint">One file per finished video with what publishing needs: chapters, script, comment keywords, title, summary, tags and the thumbnail you picked.</p>
  {#if videos.length}
    <select bind:value={dir} aria-label="Video">{#each videos as v (v.dir)}<option value={v.dir}>{v.title}</option>{/each}</select>
    <div class="row">
      <button type="button" class="primary" disabled={busy || !dir || !pubReady} title={pubReady ? "" : "Set the address and the token above"} onclick={send}>Send to Publishing</button>
      <button type="button" disabled={busy || !dir} onclick={save}>Save as a file</button>
      <button type="button" class="ghost" disabled={!dir} onclick={() => openVideoAt(dir, "video")}>Open this video</button>
    </div>
  {:else}
    <p class="hint">No video yet.</p>
  {/if}
  {#if error}<ErrorBox message={error} context={{ step: "publishing-card" }} />{/if}
  {#if message}<p class="good">{message} {#if path}<button type="button" class="link" onclick={() => revealItemInDir(path)}>Show in folder</button>{/if}</p>{/if}
</section>

<style>
  h2 { margin: 0 0 8px; font-size: 17px; }
  select { max-width: 100%; margin: 4px 0 10px; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; }
  .hint { color: var(--muted-foreground); font-size: 13px; margin: 0 0 8px; }
  .good { color: var(--success); margin: 8px 0 0; word-break: break-word; }
  .link { border: none; background: none; padding: 0; color: var(--primary); text-decoration: underline; cursor: pointer; font-size: inherit; font-family: inherit; min-height: 0; }
</style>
