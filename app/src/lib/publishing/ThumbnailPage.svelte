<script lang="ts">
  // Publishing, Thumbnail (DECISIONS 169): the thumbnail of any video of this
  // Identity, at any time, before the video too. Pick the video, the rest is the
  // Thumbnail step as it was (ThumbnailTab, DECISIONS 131).
  import { onMount, untrack } from "svelte";
  import type { AppState, ProjectSummary } from "../api";
  import { runner, errorText } from "../api";
  import type { TabId } from "../tabs";
  import ErrorBox from "../ErrorBox.svelte";
  import ThumbnailTab from "../ThumbnailTab.svelte";
  import PhotosPanel from "../PhotosPanel.svelte";

  let { app, video = null, openVideoAt, goto }: { app: AppState; video?: string | null; openVideoAt: (dir: string, tab: TabId) => void; goto: (page: "connections") => void } = $props();

  let videos = $state<ProjectSummary[] | null>(null);
  let dir = $state(untrack(() => video ?? ""));
  let error = $state("");

  onMount(async () => {
    try {
      const all = (await runner<{ projects: ProjectSummary[] }>("list-projects", { projectsDir: app.projectsDir })).projects;
      videos = [...all].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      if (!videos.some((v) => v.dir === dir)) dir = videos[0]?.dir ?? "";
    } catch (e) {
      error = errorText(e);
      videos = [];
    }
  });
</script>

{#if error}<ErrorBox message={error} context={{ step: "thumbnail" }} />{/if}
<section class="card">
  {#if videos && !videos.length}
    <p class="hint">No video yet. A thumbnail belongs to a video: start one on ONE Video, it only needs a title.</p>
  {:else if videos}
    <label class="pick">
      <span>Thumbnail for this video</span>
      <select bind:value={dir}>
        {#each videos as v (v.dir)}<option value={v.dir}>{v.title}</option>{/each}
      </select>
    </label>
  {:else}
    <p class="hint">Loading...</p>
  {/if}
</section>
{#if videos && !videos.length}
  <!-- the photos live here since DECISIONS 175; with a video they are in its Thumbnail below -->
  <section class="card">
    <h2>Your face on thumbnails</h2>
    <PhotosPanel />
  </section>
{/if}
{#if dir}
  {#key dir}
    <ThumbnailTab {app} {dir} changed={async () => {}} goto={(tab) => openVideoAt(dir, tab)} openPage={goto} />
  {/key}
{/if}

<style>
  h2 { margin: 0 0 12px; font-size: 17px; }
  .pick { display: grid; gap: 4px; }
  .pick span { font-weight: 600; }
  .hint { color: var(--muted-foreground); font-size: 13px; margin: 0; }
</style>
