<script lang="ts">
  // "Jobs" in the top bar (docs/identity.md 9): every running and waiting
  // job, of every Identity, so work can go on in another Identity while a
  // render runs. A click opens the job's ONE Video (switching Identity first
  // when needed). Hidden when nothing runs. Every job has its Stop here, so a long
  // step can always be ended, whichever screen is open (docs/AUDIT_REPORT.md).
  import { onMount } from "svelte";
  import { jobList, onJobsChanged, stopJob, type Job } from "./api";
  import { log } from "./logger";

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
    "planner-research": "Playlist keyword research",
    "planner-plan": "Playlist plan",
    "planner-outline": "Playlist outline",
    "make-voice": "Narration",
    "make-music": "Music",
    "make-scenes": "Scene plan",
    "refill-scene": "Scene plan",
    "make-avatar": "Avatar clips",
    "avatar-layout": "Avatar placement",
    "build-video": "Video check",
    "visual-check": "Picture check",
    "check-video": "Video check",
    "render-video": "Render",
    "backup-project": "Backup",
    "backup-all": "Backup",
    "restore-project": "Restore",
    "research-make": "Research",
    "week-batch": "Week batch",
    "week-batch-local": "Week batch",
    "make-template-scenes": "Scene plan",
    "simple-template-scenes": "Scene plan",
    "shot-map-make": "Shot map",
    "recorded-transcribe": "Words of the recording",
    "recorded-apply-cuts": "Cutting the recording",
    "recorded-plan": "Plan of the recording",
    "recorded-plan-rule": "Plan of the recording",
    "recorded-prepare": "Pictures of the recording",
    "broll-auto-plan": "B-roll plan",
    "broll-auto-plan-rule": "B-roll plan",
    "broll-auto-find": "Free B-roll",
    "broll-auto-find-checked": "Free B-roll",
    "broll-auto-pixabay": "Pixabay B-roll",
    "broll-paid-approve": "Paid B-roll",
    "thumbnail-make": "Thumbnails",
    "browser-ensure": "Render browser download",
    "voice-model-ensure": "Free voice download",
    "brand-preview": "Brand preview",
    "motion-preview": "Motion preview",
  };
  const stop = (j: Job) => stopJob(j.id).catch((e) => log("stop_failed", { error: String(e) }, "warn"));
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
          <div class="row">
            <button type="button" class="item" disabled={!j.project} onclick={() => { open = false; openJob(j); }}>
              <span class="what">{label(j.command)}</span>
              <span class="where">{j.identityName ?? ""}{j.project ? `, ${video(j.project)}` : ""}</span>
              <span class="state" class:wait={j.state === "waiting"}>{j.state === "running" ? "Running" : "Waiting"}</span>
            </button>
            <button type="button" class="ghost stop" onclick={() => stop(j)}>{j.state === "waiting" ? "Cancel" : "Stop"}</button>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .jobs { position: relative; margin-left: auto; }
  .pill { border: 1px solid var(--border); background: var(--primary-surface); color: var(--primary-surface-foreground); padding: 4px 12px; border-radius: 99px; font-size: 13px; }
  .pop { position: absolute; right: 0; top: calc(100% + 6px); z-index: 20; min-width: 420px; display: grid; gap: 2px; padding: 6px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 8px 24px rgb(0 0 0 / 0.12); }
  .row { display: grid; grid-template-columns: 1fr auto; gap: 4px; align-items: center; }
  .stop { font-size: 12px; padding: 3px 8px; }
  .item { display: grid; grid-template-columns: 110px 1fr auto; gap: 10px; text-align: left; border: none; background: none; padding: 7px 10px; border-radius: 6px; }
  .what { font-weight: 600; }
  .where { color: var(--muted-foreground); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .state { font-size: 12px; color: var(--success); }
  .state.wait { color: var(--warning-text); }
</style>
