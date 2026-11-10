<script lang="ts">
  // Today's video, on top of Home (DECISIONS 173): the one video to go on with, and the
  // step it is at. One button. A new video is right under it. Nothing here starts a step.
  import { ofThisApp } from "./split";
  import { onMount } from "svelte";
  import type { AppState, ProjectSummary } from "./api";
  import { runner } from "./api";
  import { nextVideo } from "./tabs";

  let { app, openProject, videos, label = "Today's video" }: { app: AppState; openProject: (dir: string) => void; videos: () => void; label?: string } = $props();

  let list = $state<ProjectSummary[] | null>(null);
  onMount(async () => {
    try {
      list = (await runner<{ projects: ProjectSummary[] }>("list-projects", { projectsDir: app.projectsDir })).projects.filter(ofThisApp);
    } catch {
      list = [];
    }
  });
  const next = $derived(list ? nextVideo(list, !!app.keys["heygen"]) : null);
</script>

{#if next}
  <div class="wrap">
    <section class="card today">
      <div class="text">
        <span class="label">{label}</span>
        <h1 title={next.video.title}>{next.video.title}</h1>
        <p class="hint">Next step: {next.step}.{#if next.others} <button type="button" class="link" onclick={videos}>{next.others} more not finished</button>{/if}</p>
      </div>
      <button type="button" class="primary big" onclick={() => openProject(next!.video.dir)}>Go on with it</button>
    </section>
  </div>
{/if}

<style>
  .wrap { padding: 24px 24px 0; max-width: 900px; margin: 0 auto; }
  .today { display: flex; justify-content: space-between; align-items: center; gap: 16px; border-width: 2px; }
  .text { display: grid; gap: 2px; min-width: 0; }
  .label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted-foreground); }
  h1 { margin: 0; font-size: 22px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .big { flex: none; font-size: 16px; padding: 10px 22px; }
  .hint { margin: 0; font-size: 13px; color: var(--muted-foreground); }
  .link { border: none; background: none; padding: 0; color: var(--primary); text-decoration: underline; cursor: pointer; font-size: inherit; font-family: inherit; min-height: 0; }
</style>
