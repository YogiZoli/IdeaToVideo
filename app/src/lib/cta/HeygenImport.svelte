<script lang="ts">
  // HeygenImport: a video already in the user's HeyGen account becomes the
  // segment of one comment keyword (DECISIONS 101): reading and downloading
  // costs nothing. On Wizards, CTA, next to the clips it makes (DECISIONS 168).
  import { onMount, untrack } from "svelte";
  import { convertFileSrc } from "@tauri-apps/api/core";
  import type { AppState, CtaKeyword, CtaSegment } from "../api";
  import { runner, errorText } from "../api";
  import { log } from "../logger";
  import ErrorBox from "../ErrorBox.svelte";

  let { app, keyword: start = "GUIDE" }: { app: AppState; keyword?: string } = $props();

  const TEXT_MAX = 1500;
  type HeygenVideo = { id: string; title: string; seconds: number | null; createdAt: number | string | null; image: string | null; tooLong: boolean; imported: boolean };
  let keywords = $state<CtaKeyword[]>([]);
  let keyword = $state(untrack(() => start));
  let theirs = $state<HeygenVideo[] | null>(null);
  let picked = $state<string | null>(null);
  let search = $state("");
  let said = $state("");
  let busy = $state("");
  let error = $state("");
  let done = $state("");
  const hasHeygen = $derived(!!app.keys["heygen"]);

  onMount(async () => {
    try {
      keywords = (await runner<{ options: { keywords: CtaKeyword[] } }>("cta-state", {})).options.keywords;
    } catch (e) {
      error = errorText(e);
    }
  });

  async function show() {
    error = "";
    busy = "Reading your HeyGen videos...";
    try {
      theirs = (await runner<{ videos: HeygenVideo[] }>("segment-import-list", { service: "heygen", title: search })).videos;
      picked = null;
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = "";
    }
  }

  async function importIt() {
    error = "";
    done = "";
    const v = theirs?.find((x) => x.id === picked);
    if (!v) return;
    busy = "Downloading the video from HeyGen...";
    try {
      const r = await runner<{ segment: CtaSegment }>("segment-import", { service: "heygen", id: v.id, keyword, name: "", text: said });
      log("segment_added", { keyword: r.segment.keyword, source: r.segment.source, seconds: r.segment.seconds, text: !!r.segment.text });
      done = `Saved as the ${r.segment.keyword} segment, ${r.segment.seconds} s. It plays wherever a comment call uses ${r.segment.keyword}.`;
      theirs = theirs?.map((x) => (x.id === v.id ? { ...x, imported: true } : x)) ?? null;
      picked = null;
      said = "";
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = "";
    }
  }
</script>

<div class="hg">
  {#if !hasHeygen}
    <p class="hint">Needs a HeyGen key (Settings, Connections).</p>
  {/if}
  <div class="row">
    <label class="kw">Keyword
      <select bind:value={keyword} disabled={!!busy}>
        {#each keywords as k (k.keyword)}<option value={k.keyword}>{k.keyword}</option>{/each}
      </select>
    </label>
    <input type="search" placeholder="Search by title (optional)" bind:value={search} onkeydown={(e) => e.key === "Enter" && show()} />
    <button type="button" disabled={!!busy || !hasHeygen} onclick={show}>{theirs ? "Search again" : "Show my HeyGen videos"}</button>
  </div>
  {#if theirs}
    {#if theirs.length}
      <ul class="picks">
        {#each theirs as v (v.id)}
          <li class:on={picked === v.id} class:dim={v.tooLong || v.imported}>
            <label>
              <input type="radio" name="heygen-video" value={v.id} bind:group={picked} disabled={!!busy || v.tooLong} />
              {#if v.image}<img src={convertFileSrc(v.image)} alt="" />{:else}<span class="noimg"></span>{/if}
              <span class="meta"><b>{v.title || "Untitled"}</b><span class="hint">{v.createdAt && Number(v.createdAt) ? `${new Date(Number(v.createdAt) * 1000).toLocaleDateString()}, ` : ""}{v.seconds != null ? `${v.seconds} s` : "length unknown"}{v.tooLong ? ", longer than 30 s: too long for a segment" : ""}{v.imported ? ", already imported" : ""}</span></span>
            </label>
          </li>
        {/each}
      </ul>
      <label class="field"><span>What does it say? (optional, for the captions)</span><textarea rows="3" maxlength={TEXT_MAX} bind:value={said} placeholder={`Comment ${keyword} below and ...`}></textarea></label>
      <div class="row"><button type="button" class="primary" disabled={!!busy || !picked} onclick={importIt}>Import as {keyword}</button></div>
    {:else}
      <p class="hint">{search.trim() ? "No finished video with this title." : "HeyGen listed no finished videos for this key. Download your clip in HeyGen and upload it on Wizards, CTA."}</p>
    {/if}
  {/if}
  {#if busy}<p class="busy">{busy}</p>{/if}
  {#if done}<p class="good">{done}</p>{/if}
  {#if error}<ErrorBox message={error} context={{ step: "cta" }} />{/if}
</div>

<style>
  .hg { display: grid; gap: 8px; }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .row input { flex: 1; min-width: 160px; }
  .kw { display: flex; gap: 6px; align-items: center; font-size: 13px; }
  .field { display: grid; gap: 4px; }
  .picks { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; max-height: 280px; overflow: auto; }
  .picks li { border: 1px solid var(--border); border-radius: 8px; }
  .picks li.on { border-color: var(--primary, currentColor); }
  .picks li.dim { opacity: 0.6; }
  .picks label { display: flex; align-items: center; gap: 10px; padding: 6px 8px; cursor: pointer; }
  .picks img, .noimg { width: 72px; height: 41px; object-fit: cover; border-radius: 4px; background: var(--border); flex: none; }
  .meta { display: grid; }
  .hint { font-size: 13px; color: var(--muted-foreground); margin: 0; }
  .busy { font-weight: 600; margin: 0; }
  .good { color: var(--success); margin: 0; }
</style>
