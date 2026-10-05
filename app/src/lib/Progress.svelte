<script lang="ts">
  // One progress bar for every long step (Zoltan, 2026-09-30: percent, time
  // left, "finishing now", and what to do meanwhile). The numbers come from
  // the app-wide job state (work.svelte.ts), so the bar is right even when it
  // appears after the job started: on another tab, or after the ONE Video was
  // closed and opened again. The runner sends an estimate at the start of a
  // step (seconds, learned on this computer, runner/timings.mjs) and, where
  // it can, real progress:
  //   render-video  every captured frame
  //   make-voice    part n of N, sentence k of K
  //   build-video   its phases (build, lint, check, stills, sheet)
  //   avatar-looks  preview pictures downloaded, n of N
  // Everything else fills by time against the estimate, which grows when an
  // AI call is repaired or tried again, and never claims 100% early.
  // When the bar appears it scrolls itself into view (Zoltan, 2026-10-05: "I
  // did not see that it was running").
  // 2026-10-06 (reliability): a Stop button (a paid step says what stays
  // paid), signs of life when a step is quiet, the sleep of the computer, and
  // per step whether the lid may close.
  import { onMount } from "svelte";
  import { costText, adviceText, lifeText, workPlace, clock } from "./progressInfo";
  import { work, track, measure, startWork, jobOf } from "./work.svelte";
  import { stopJob, errorText } from "./api";
  import { log } from "./logger";

  // provider: the narrator provider, for what make-voice costs
  // project: the ONE Video the job belongs to (null: the newest of its kind)
  let { command, label = "", provider, project = null, reveal = true }: { command: string; label?: string; provider?: string; project?: string | null; reveal?: boolean } = $props();
  startWork();

  let root = $state<HTMLDivElement>();
  onMount(() => {
    if (reveal) root?.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  const t = $derived(track(project, command));
  const m = $derived(t ? measure(t, work.now) : null);
  const life = $derived(t ? lifeText(t, work.now) : []);
  const job = $derived(jobOf(project, command));

  // Stop asks once for a step that spends money or credits
  const paid = $derived(workPlace(command) !== "local");
  let asking = $state(false);
  let stopping = $state(false);
  let stopError = $state("");
  async function stop() {
    if (!job) return;
    if (paid && !asking) {
      asking = true;
      return;
    }
    asking = false;
    stopping = true;
    stopError = "";
    log("stop_clicked", { command, job: job.id, state: job.state });
    try {
      await stopJob(job.id);
    } catch (e) {
      stopError = errorText(e);
      stopping = false;
    }
  }

  const fmt = (s: number) => (s >= 90 ? `${Math.round(s / 60)} minutes` : s >= 60 ? "a minute" : `${Math.max(5, Math.round(s / 5) * 5)} seconds`);
  const status = $derived(
    !t || !m || (t.expect === null && t.real === null)
      ? "Starting..."
      : m.late
        ? "Taking longer than usual this time. It is still working: the clock keeps running."
        : m.left !== null && m.left < 4
          ? "Finishing now..."
          : m.left !== null
            ? `About ${fmt(m.left)} left`
            : "",
  );
</script>

<div class="progress" role="status" aria-live="polite" bind:this={root}>
  <div class="line">
    <span class="label">{label}</span>
    <span class="pct">{m?.percent ?? 0}%</span>
  </div>
  <progress max="100" value={m?.percent ?? 0}></progress>
  <div class="line">
    <span class="hint">{t?.waiting ?? `${t?.phase ? `Now: ${t.phase}.` : "Working."} ${status}`}</span>
    <span class="hint clock">Running for {clock(m?.elapsed ?? 0)}</span>
  </div>
  {#each life as line (line)}<p class="hint life">{line}</p>{/each}
  <p class="hint">{costText(command, provider)} {adviceText(command)}</p>
  {#if job}
    <div class="stop">
      {#if asking}
        <span class="hint">Stop it? {command === "make-avatar" ? "Clips HeyGen already started stay paid; pressing the button again later picks them up." : "What the service already did stays paid; the step can be started again."}</span>
        <button type="button" class="danger" onclick={stop}>Stop now</button>
        <button type="button" class="ghost" onclick={() => (asking = false)}>Keep going</button>
      {:else}
        <button type="button" class="ghost" disabled={stopping} onclick={stop}>{stopping ? "Stopping..." : job.state === "waiting" ? "Cancel" : "Stop"}</button>
      {/if}
      {#if stopError}<span class="hint">{stopError}</span>{/if}
    </div>
  {/if}
</div>

<style>
  .progress { display: grid; gap: 6px; margin-top: 10px; padding: 12px 14px; border-radius: 10px; background: var(--primary-surface); scroll-margin: 80px; }
  .line { display: flex; justify-content: space-between; gap: 8px; font-size: 14px; }
  .label { font-weight: 600; }
  .pct, .clock { font-variant-numeric: tabular-nums; white-space: nowrap; }
  progress { width: 100%; height: 10px; }
  .hint { color: var(--muted-foreground); font-size: 13px; margin: 0; }
  .life { color: var(--foreground); }
  .stop { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
</style>
