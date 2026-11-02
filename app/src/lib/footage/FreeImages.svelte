<script lang="ts">
  // Free images (runner/assets, docs/BUILD_PLAN.md): a search in Openverse,
  // Wikimedia Commons and the Library of Congress, CC0 and public domain only,
  // no key. What the user picks goes into the channel's footage with its
  // license; a video that uses it logs it in its assets_license.json.
  import { convertFileSrc } from "@tauri-apps/api/core";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import ErrorBox from "../ErrorBox.svelte";
  import { runner, errorText } from "../api";

  let { added }: { added?: () => void } = $props();

  type Hit = { id: string; source: string; title: string; author: string; license: string; sourceUrl: string; local: string; [k: string]: unknown };
  const LICENSE: Record<string, string> = { cc0: "CC0", pd: "Public domain", "no-known-restrictions": "No known restrictions", "us-federal": "US federal work" };

  let q = $state("");
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

  async function add(h: Hit) {
    adding = h.sourceUrl;
    error = "";
    note = "";
    try {
      const r = await runner<{ again: boolean }>("assets-add", { hit: h });
      note = r.again ? "That one is already in your footage." : "Added to your footage, with its license.";
      added?.();
    } catch (e) {
      error = errorText(e);
    } finally {
      adding = "";
    }
  }
</script>

<section class="card free">
  <h2>Free images</h2>
  <p class="hint">CC0 and public domain only, from Openverse, Wikimedia Commons and the Library of Congress. No key, no cost. Look at each picture before you use it: real people never go in a video.</p>
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
  h2 { margin: 0; font-size: 17px; }
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
