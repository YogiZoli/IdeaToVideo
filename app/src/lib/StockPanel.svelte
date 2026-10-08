<script lang="ts">
  // StockPanel: "Photos and videos" on the Scenes tab (DECISIONS 111, 117).
  // A search in Pixabay's free photos and videos (Pixabay Content License:
  // commercial use, no credit needed) or Unsplash's photos (the source picker
  // shows the ones with a key), with search words from the script. Unsplash
  // previews load from Unsplash's own address and every one carries the
  // credit its API Guidelines ask for: "Photo by X on Unsplash", both linked.
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

  type Hit = { id: string; kind: "image" | "video"; width: number | null; height: number | null; seconds: number | null; tags: string; author: string; authorUrl?: string; pageUrl?: string; preview: string | null };
  type Source = "pixabay" | "unsplash";
  const LABEL: Record<Source, string> = { pixabay: "Pixabay", unsplash: "Unsplash" };
  const UNSPLASH_HOME = "https://unsplash.com/?utm_source=ideatovideo&utm_medium=referral";

  const keyed = $derived((["pixabay", "unsplash"] as Source[]).filter((s) => !!app.keys[s]));
  const hasKey = $derived(keyed.length > 0);
  let picked = $state<Source>("pixabay");
  const source = $derived<Source>(keyed.includes(picked) ? picked : (keyed[0] ?? "pixabay"));
  // the source of the hits on screen, so a switch does not relabel them
  let hitSource = $state<Source>("pixabay");
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
    const k = source === "unsplash" ? "image" : kind;
    busy = `Searching ${LABEL[source]}...`;
    try {
      const r = await runner<{ hits: Hit[] }>("stock-search", { service: source, q, kind: k });
      hits = r.hits;
      searched = q;
      hitSource = source;
      log("stock_search", { source, kind: k, results: r.hits.length });
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
      const r = await runner<{ clip: { name: string }; again: boolean }>("stock-add", { service: hitSource, q: searched, kind: h.kind, id: h.id });
      added = { ...added, [`${hitSource}-${h.kind}-${h.id}`]: r.again ? "Already in your footage" : "Added to your footage" };
      log("stock_added", { source: hitSource, kind: h.kind, again: r.again });
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
  <p class="hint">Free stock photos and videos from <button type="button" class="link" onclick={() => openUrl("https://pixabay.com/")}>Pixabay</button> and photos from <button type="button" class="link" onclick={() => openUrl(UNSPLASH_HOME)}>Unsplash</button>, free for commercial use. What you pick goes into your footage; a photo becomes a slow push-in clip. Plan the scenes again to use them.</p>
  {#if open}
    {#if !hasKey}
      <p class="warn">Add a free Pixabay key or your Unsplash Access Key first: Settings, Connections.</p>
    {:else}
      {#if error}<ErrorBox message={error} context={{ step: "stock", provider: source }} />{/if}
      {#if keyed.length > 1}
        <div class="row">
          <span class="hint">Source:</span>
          {#each keyed as s (s)}<label class="radio"><input type="radio" name="stock-source" checked={source === s} onchange={() => (picked = s)} /> {LABEL[s]}</label>{/each}
        </div>
      {/if}
      {#if source === "unsplash"}<p class="hint">Unsplash: photos only. While your key is in Demo mode, Unsplash allows 50 searches an hour.</p>{/if}
      <div class="row">
        <input type="search" class="grow" placeholder="What should it show? (in English works best)" bind:value={q} onkeydown={(e) => e.key === "Enter" && find()} />
        <label class="radio"><input type="radio" name="stock-kind" checked={kind === "image"} onchange={() => (kind = "image")} /> Photos</label>
        {#if source !== "unsplash"}<label class="radio"><input type="radio" name="stock-kind" checked={kind === "video"} onchange={() => (kind = "video")} /> Videos</label>{/if}
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
            {@const done = added[`${hitSource}-${h.kind}-${h.id}`]}
            <div class="hit">
              {#if h.preview}<img src={/^(https|data):/.test(h.preview) ? h.preview : convertFileSrc(h.preview)} alt={h.tags} />{:else}<span class="noimg"></span>{/if}
              <span class="hint">{h.tags}{h.seconds ? `, ${h.seconds} s` : ""}</span>
              {#if hitSource === "unsplash"}<span class="credit">Photo by <button type="button" class="link" onclick={() => h.authorUrl && openUrl(h.authorUrl)}>{h.author}</button> on <button type="button" class="link" onclick={() => openUrl(UNSPLASH_HOME)}>Unsplash</button></span>{/if}
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
  .credit { font-size: 12px; }
  .ok { color: var(--success, #1f7a3a); font-weight: 600; font-size: 13px; }
  .link { background: none; border: none; padding: 0; color: var(--primary, inherit); text-decoration: underline; cursor: pointer; font: inherit; }
</style>
