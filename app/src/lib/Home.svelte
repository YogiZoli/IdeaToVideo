<script lang="ts">
  // The latest videos on Home, right under Today's video (DECISIONS 175). The rest of Home is
  // ChannelStudio: Identity, recipe, a new video, week batch. "What a video needs" moved to
  // Settings, Health check (VideoNeeds); the Channels board is gone.
  import { onMount } from "svelte";
  import type { AppState, ProjectSummary } from "./api";
  import { runner } from "./api";
  import { ONE_VIDEO } from "./edition";

  let { app, openProject, videos }: { app: AppState; openProject: (dir: string) => void; videos: () => void } = $props();

  let recent = $state<ProjectSummary[] | null>(null);
  onMount(async () => {
    try {
      const all = (await runner<{ projects: ProjectSummary[] }>("list-projects", { projectsDir: app.projectsDir })).projects;
      recent = [...all].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 5);
    } catch {
      recent = [];
    }
  });
</script>

<div class="home">
  <section class="card">
    <div class="head">
      <h2>Latest videos</h2>
      <button type="button" class="ghost" onclick={videos}>All {ONE_VIDEO}s</button>
    </div>
    {#if recent === null}
      <p class="hint">Loading...</p>
    {:else if !recent.length}
      <p class="hint">No {ONE_VIDEO} yet.</p>
    {:else}
      <ul class="recent">
        {#each recent as p (p.dir)}
          <li><button type="button" class="ghost item" onclick={() => openProject(p.dir)}><span class="t">{p.title}</span><span class="hint">{p.status}</span></button></li>
        {/each}
      </ul>
    {/if}
  </section>
</div>

<style>
  .home { padding: 16px 24px 0; max-width: 900px; margin: 0 auto; }
  .head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  h2 { margin: 0; font-size: 17px; }
  .recent { list-style: none; margin: 8px 0 0; padding: 0; display: grid; }
  .recent li { border-top: 1px solid var(--border); }
  .item { width: 100%; display: flex; justify-content: space-between; gap: 12px; text-align: left; border: none; padding: 10px 4px; }
  .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hint { font-size: 13px; color: var(--muted-foreground); margin: 0; }
</style>
