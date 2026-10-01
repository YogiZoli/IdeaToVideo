<script lang="ts">
  // "Jobs" in the top bar (docs/identity.md 9): every running and waiting
  // job, of every Identity, so work can go on in another Identity while a
  // render runs. A click opens the job's ONE Video (switching Identity first
  // when needed). Hidden when nothing runs.
  import { onMount } from "svelte";
  import { jobList, onJobsChanged, type Job } from "./api";

  let { openJob }: { openJob: (j: Job) => void } = $props();

  let jobs = $state<Job[]>([]);
  let open = $state(false);
  let root = $state<HTMLDivElement>();

  onMount(() => {
    jobList().then((j) => (jobs = j)).catch(() => {});
    const un = onJobsChanged((j) => (jobs = j));
    return () => {
      un.then((f) => f());
    };
  });

  const LABELS: Record<string, string> = {
    "write-script": "Script",
    "suggest-channel": "Suggestion",
    "keyword-ideas": "Keyword ideas",
    "make-voice": "Narration",
    "make-music": "Music",
    "make-scenes": "Scene plan",
    "refill-scene": "Scene plan",
    "make-avatar": "Avatar clips",
    "avatar-layout": "Avatar placement",
    "build-video": "Video check",
    "check-video": "Video check",
    "render-video": "Render",
  };
  const label = (c: string) => LABELS[c] ?? c;
  const video = (p: string | null) => (p ? p.split(/[\\/]/).pop() : "");
  const running = $derived(jobs.filter((j) => j.state === "running").length);

  function outside(e: MouseEvent) {
    if (open && root && !root.contains(e.target as Node)) open = false;
  }
</script>

<svelte:window onclick={outside} />

{#if jobs.length}
  <div class="jobs" bind:this={root}>
    <button type="button" class="pill" onclick={() => (open = !open)} aria-expanded={open}>
      Jobs: {running} running{jobs.length > running ? `, ${jobs.length - running} waiting` : ""}
    </button>
    {#if open}
      <div class="pop">
        {#each jobs as j (j.id)}
          <button type="button" class="item" disabled={!j.project} onclick={() => { open = false; openJob(j); }}>
            <span class="what">{label(j.command)}</span>
            <span class="where">{j.identityName ?? ""}{j.project ? `, ${video(j.project)}` : ""}</span>
            <span class="state" class:wait={j.state === "waiting"}>{j.state === "running" ? "Running" : "Waiting"}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .jobs { position: relative; margin-left: auto; }
  .pill { border: 1px solid var(--border); background: var(--primary-surface); color: var(--primary-surface-foreground); padding: 4px 12px; border-radius: 99px; font-size: 13px; }
  .pop { position: absolute; right: 0; top: calc(100% + 6px); z-index: 20; min-width: 340px; display: grid; gap: 2px; padding: 6px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 8px 24px rgb(0 0 0 / 0.12); }
  .item { display: grid; grid-template-columns: 110px 1fr auto; gap: 10px; text-align: left; border: none; background: none; padding: 7px 10px; border-radius: 6px; }
  .what { font-weight: 600; }
  .where { color: var(--muted-foreground); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .state { font-size: 12px; color: var(--success); }
  .state.wait { color: var(--warning-text); }
</style>
