<script lang="ts">
  // StockPanel: "Photos and videos" on the Scenes tab (DECISIONS 111). A
  // search in Pixabay's free photos and videos (Pixabay Content License:
  // commercial use, no credit needed), with search words from the script.
  // Only what the user picks is downloaded (docs/stock.md 3): it goes into
  // the Identity's footage library, a photo as a slow push-in clip, and the
  // next scene plan places it under a sentence that shows the same thing.
  import { onMount } from "svelte";
  import { convertFileSrc } from "@tauri-apps/api/core";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import ErrorBox from "./ErrorBox.svelte";
  import type { AppState } from "./api";
  import { runner, errorText } from "./api";
  import { log } from "./logger";

  let { app, dir }: { app: AppState; dir: string } = $props();

  type Hit = { id: string; kind: "image" | "video"; width: number | null; height: number | null; seconds: number | null; tags: string; author: string; preview: string | null };

  const hasKey = $derived(!!app.keys["pixabay"]);
  let open = $state(false);
  let q = $state("");
  let kind = $state<"image" | "video">("image");
  let ideas = $state<string[]>([]);
  let hits = $state<Hit[]>([]);
  let searched = $state("");
  let busy = $state("");
  let error = $state("");
  let added = $state<Record<string, string>>({});

  onMount(async () => {
    try {
      ideas = (await runner<{ queries: string[] }>("stock-suggest", { projectDir: dir })).queries;
      if (!q && ideas[0]) q = ideas[0];
    } catch {
      ideas = [];
    }
  });

  async function find() {
    error = "";
    if (!q.trim()) return;
    busy = "Searching Pixabay...";
    try {
      const r = await runner<{ hits: Hit[] }>("stock-search", { service: "pixabay", q, kind });
      hits = r.hits;
      searched = q;
      log("stock_search", { kind, results: r.hits.length });
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = "";
    }
  }

  async function add(h: Hit) {
    error = "";
    busy = h.kind === "image" ? "Downloading the photo and making it a slow push-in clip..." : "Downloading the video...";
    try {
      const r = await runner<{ clip: { name: string }; again: boolean }>("stock-add", { service: "pixabay", q: searched, kind: h.kind, id: h.id });
      added = { ...added, [`${h.kind}-${h.id}`]: r.again ? "Already in your footage" : "Added to your footage" };
      log("stock_added", { kind: h.kind, again: r.again });
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = "";
    }
  }
</script>

<section class="card">
  <div class="row">
    <h2 class="grow">Photos and videos</h2>
    <button type="button" class="ghost" onclick={() => (open = !open)}>{open ? "Hide" : "Find photos and videos"}</button>
  </div>
  <p class="hint">Free stock photos and videos from <button type="button" class="link" onclick={() => openUrl("https://pixabay.com/")}>Pixabay</button>, free for commercial use, no credit needed. What you pick goes into your footage; a photo becomes a slow push-in clip. Plan the scenes again to use them.</p>
  {#if open}
    {#if !hasKey}
      <p class="warn">Add a free Pixabay key first: Settings, Identity, Footage, "Stock photos and videos".</p>
    {:else}
      {#if error}<ErrorBox message={error} context={{ step: "stock", provider: "pixabay" }} />{/if}
      <div class="row">
        <input type="search" class="grow" placeholder="What should it show? (in English works best)" bind:value={q} onkeydown={(e) => e.key === "Enter" && find()} />
        <label class="radio"><input type="radio" name="stock-kind" checked={kind === "image"} onchange={() => (kind = "image")} /> Photos</label>
        <label class="radio"><input type="radio" name="stock-kind" checked={kind === "video"} onchange={() => (kind = "video")} /> Videos</label>
        <button type="button" class="primary" disabled={!!busy || !q.trim()} onclick={find}>Search</button>
      </div>
      {#if ideas.length}
        <div class="row ideas">
          <span class="hint">Ideas from your script:</span>
          {#each ideas as idea (idea)}<button type="button" class="chip" onclick={() => { q = idea; find(); }}>{idea}</button>{/each}
        </div>
      {/if}
      {#if busy}<p class="busy">{busy}</p>{/if}
      {#if searched && !hits.length && !busy}<p class="hint">Nothing found for "{searched}". Try other, simpler words.</p>{/if}
      {#if hits.length}
        <div class="grid">
          {#each hits as h (h.kind + h.id)}
            {@const done = added[`${h.kind}-${h.id}`]}
            <div class="hit">
              {#if h.preview}<img src={convertFileSrc(h.preview)} alt={h.tags} />{:else}<span class="noimg"></span>{/if}
              <span class="hint">{h.tags}{h.seconds ? `, ${h.seconds} s` : ""}</span>
              {#if done}<span class="ok">{done}</span>{:else}<button type="button" disabled={!!busy} onclick={() => add(h)}>Add</button>{/if}
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  {/if}
</section>

<style>
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 6px 0; }
  .grow { flex: 1; min-width: 200px; }
  .ideas .chip { border: 1px solid var(--border); border-radius: 999px; padding: 2px 10px; background: none; font-size: 13px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; margin-top: 8px; }
  .hit { display: grid; gap: 4px; align-content: start; }
  .hit img, .noimg { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 6px; background: var(--border); }
  .warn { color: var(--warning-text, #8a5a00); font-size: 13px; }
  .busy { font-weight: 600; }
  .ok { color: var(--success, #1f7a3a); font-weight: 600; font-size: 13px; }
  .link { background: none; border: none; padding: 0; color: var(--primary, inherit); text-decoration: underline; cursor: pointer; font: inherit; }
</style>
