<script lang="ts">
  // Free images (runner/assets, docs/BUILD_PLAN.md): a search in Openverse,
  // Wikimedia Commons and the Library of Congress, CC0 and public domain only,
  // no key. What the user picks goes into the channel's footage with its
  // license; a video that uses it logs it in its assets_license.json. Also on a
  // video's Research tab, for one fact: `query` starts the search, `about` tells the
  // scene planner what the picture is for (DECISIONS 173).
  import { onMount, untrack } from "svelte";
  import { convertFileSrc } from "@tauri-apps/api/core";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import ErrorBox from "../ErrorBox.svelte";
  import { runner, errorText } from "../api";

  let { added, query = "", about = "", onclose }: { added?: () => void; query?: string; about?: string; onclose?: () => void } = $props();

  type Hit = { id: string; source: string; title: string; author: string; license: string; sourceUrl: string; local: string; [k: string]: unknown };
  const LICENSE: Record<string, string> = { cc0: "CC0", pd: "Public domain", "no-known-restrictions": "No known restrictions", "us-federal": "US federal work" };

  let q = $state(untrack(() => query));
  let hits = $state<Hit[] | null>(null);
  let failed = $state<{ source: string; message: string }[]>([]);
  let busy = $state(false);
  let adding = $state("");
  let error = $state("");
  let note = $state("");

  async function search() {
    if (!q.trim()) return;
    busy = true;
    error = "";
    note = "";
    try {
      const r = await runner<{ hits: Hit[]; failed: { source: string; message: string }[] }>("assets-search", { q });
      hits = r.hits;
      failed = r.failed;
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }

  onMount(() => {
    if (query.trim()) search();
  });

  async function add(h: Hit) {
    adding = h.sourceUrl;
    error = "";
    note = "";
    try {
      const r = await runner<{ again: boolean }>("assets-add", { hit: h, about });
      note = r.again ? "That one is already in your footage." : about ? "Added, with its license. The scene planner puts it under the sentence it fits; a scene plan made already needs planning again." : "Added to your footage, with its license.";
      added?.();
    } catch (e) {
      error = errorText(e);
    } finally {
      adding = "";
    }
  }
</script>

<section class="card free">
  <p class="hint">Only pictures free of copyright: CC0 and public domain, from Openverse, Wikimedia Commons and the Library of Congress. Anything else is refused by the app, so no credit is ever owed. No key, no cost. Each one's source and license are kept with the video. Look at each picture before you use it: real people never go in a video.</p>
  {#if onclose}<div class="row"><span></span><button type="button" class="ghost" onclick={onclose}>Close</button></div>{/if}
  <form class="row" onsubmit={(e) => { e.preventDefault(); search(); }}>
    <input bind:value={q} aria-label="What the image should show" placeholder="What should the image show?" />
    <button type="submit" disabled={busy || !q.trim()}>{busy ? "Searching..." : "Search"}</button>
  </form>
  {#if error}<ErrorBox message={error} context={{ step: "free-images" }} />{/if}
  {#if note}<p class="good">{note}</p>{/if}
  {#each failed as f (f.source)}<p class="hint">{f.source} did not answer: {f.message}</p>{/each}
  {#if hits && !hits.length}<p class="hint">Nothing with a clear CC0 or public domain license. Try other words.</p>{/if}
  {#if hits?.length}
    <ul class="grid">
      {#each hits as h (h.sourceUrl)}
        <li>
          <img src={convertFileSrc(h.local)} alt={h.title} />
          <span class="title" title={h.title}>{h.title || "Untitled"}</span>
          <span class="hint">{LICENSE[h.license] ?? h.license}, {h.author}</span>
          <span class="row">
            <button type="button" class="link" onclick={() => openUrl(h.sourceUrl)}>Source</button>
            <button type="button" disabled={!!adding} onclick={() => add(h)}>{adding === h.sourceUrl ? "Adding..." : "Add"}</button>
          </span>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .free { display: grid; gap: 10px; }
  .row { display: flex; gap: 8px; align-items: center; justify-content: space-between; }
  form.row input { flex: 1; }
  .grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
  li { display: grid; gap: 4px; min-width: 0; }
  img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 8px; background: var(--muted); }
  .title { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hint { font-size: 12px; color: var(--muted-foreground); margin: 0; overflow-wrap: anywhere; }
  .good { font-size: 13px; color: var(--success); margin: 0; }
  .link { border: none; background: none; padding: 0; color: var(--primary); text-decoration: underline; cursor: pointer; font-size: 12px; font-family: inherit; min-height: 0; }
</style>
