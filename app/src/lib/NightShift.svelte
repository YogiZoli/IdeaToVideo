<script lang="ts">
  // Home, Night shift (DECISIONS 182): pick videos, a whole playlist or a week's batch, and press
  // Start before you go to bed. In the morning the same card lists what is ready, what waits for
  // you and what failed. The run itself is in night.svelte.ts, so it goes on whatever is on screen.
  import { ask } from "@tauri-apps/plugin-dialog";
  import type { AppState } from "./api";
  import { runner, errorText } from "./api";
  import { ONE_VIDEO } from "./edition";
  import ErrorBox from "./ErrorBox.svelte";
  import { night, startNight, stopNight, clearNight, goOnNight, loadNight } from "./night.svelte";
  import { counts, morningLine, STATUS_WORD, type NightGroup } from "./night";

  let { app, openProject }: { app: AppState; openProject: (dir: string) => void } = $props();

  let groups = $state<NightGroup[] | null>(null);
  let picked = $state<Record<string, boolean>>({});
  let error = $state("");

  async function load() {
    error = "";
    try {
      await loadNight(app);
      groups = (await runner<{ groups: NightGroup[] }>("night-candidates", { projectsDir: app.projectsDir })).groups;
    } catch (e) {
      error = errorText(e);
      groups = [];
    }
  }
  $effect(() => {
    if (app.identity?.id) load();
  });
  // the list comes back fresh when a shift ends
  let was = false;
  $effect(() => {
    const now = night.running;
    if (was && !now) load();
    was = now;
  });

  const chosen = $derived((groups ?? []).flatMap((g) => g.videos).filter((v) => picked[v.dir]));
  const allOf = (g: NightGroup) => g.videos.every((v) => picked[v.dir]);
  function toggleGroup(g: NightGroup) {
    const on = !allOf(g);
    picked = { ...picked, ...Object.fromEntries(g.videos.map((v) => [v.dir, on])) };
  }
  const shift = $derived(night.shift);
  const c = $derived(shift ? counts(shift) : null);
  const current = $derived(shift?.items.find((i) => i.status === "running") ?? null);

  async function start() {
    const videos = chosen.map((v) => ({ dir: v.dir, title: v.title }));
    const n = videos.length;
    const ok = await ask(
      `${n} ${n === 1 ? "video" : "videos"}, one at a time, each to the finished MP4. A video takes about twice its length to render.\n\nIt can cost: your ElevenLabs credits, if the recipe has your own voice, and your AI key's credits, unless it is Gemini's free tier.\nIt never spends HeyGen credits or orders a paid clip, and it publishes nothing.\n\nKeep the app open and the computer plugged in, with the lid open. Go on?`,
      { title: "Start the night shift", kind: "info" },
    );
    if (!ok) return;
    picked = {};
    startNight(app, videos);
  }
</script>

<div class="wrap">
  <section class="card">
    <h2>Night shift</h2>
    <p class="hint">Make many videos while you sleep: pick them, press Start, and in the morning they are ready to watch.</p>
    {#if error}<ErrorBox message={error} context={{ step: "night-shift" }} />{/if}

    {#if shift}
      {#if night.running}
        <div class="now" role="status">
          <span><b>{c!.done + 1} of {c!.total}:</b> {current?.title ?? ""}{night.step ? `. ${night.step}...` : ""}</span>
          <button type="button" disabled={night.stopping} onclick={stopNight}>{night.stopping ? "Stopping..." : "Stop"}</button>
        </div>
      {:else}
        <p class="line"><b>{shift.state === "stopped" ? "Stopped" : "Last night"}:</b> {morningLine(shift)}</p>
      {/if}
      <ul class="items">
        {#each shift.items as i (i.dir)}
          <li>
            <span class="state {i.status}">{STATUS_WORD[i.status]}</span>
            <span class="what"><b>{i.title}</b>{#if i.reason}<span class="hint">{i.reason}</span>{/if}</span>
            <button type="button" class="ghost" onclick={() => openProject(i.dir)}>{i.status === "ready" ? "Watch" : "Open"}</button>
          </li>
        {/each}
      </ul>
      {#if !night.running}
        <div class="acts">
          {#if c!.left}<button type="button" class="primary" onclick={() => goOnNight(app)}>Go on with the rest</button>{/if}
          <button type="button" class="ghost" onclick={() => clearNight(app)}>Clear this list</button>
        </div>
      {/if}
    {/if}

    {#if !night.running}
      {#if groups === null}
        <p class="hint">Loading...</p>
      {:else if !groups.length}
        <p class="hint">Every {ONE_VIDEO} is finished. Make a week batch or a playlist first, then they show up here.</p>
      {:else}
        {#each groups as g (g.key)}
          <div class="group">
            <label class="ghead"><input type="checkbox" checked={allOf(g)} onchange={() => toggleGroup(g)} /> <b>{g.title}</b> <span class="hint">{g.videos.length} {g.videos.length === 1 ? "video" : "videos"}</span></label>
            <div class="vids">
              {#each g.videos as v (v.dir)}
                <label><input type="checkbox" bind:checked={picked[v.dir]} /> <span class="t">{v.title}</span> <span class="hint">{v.status}</span></label>
              {/each}
            </div>
          </div>
        {/each}
        <div class="acts">
          <button type="button" class="primary" disabled={!chosen.length} onclick={start}>{chosen.length ? `Start the night shift: ${chosen.length} ${chosen.length === 1 ? "video" : "videos"}` : "Start the night shift"}</button>
        </div>
      {/if}
    {/if}
  </section>
</div>

<style>
  .wrap { padding: 0 24px 24px; max-width: 900px; margin: 0 auto; }
  h2 { margin: 0; font-size: 17px; }
  .hint { font-size: 13px; color: var(--muted-foreground); margin: 6px 0 0; }
  .now { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 12px; padding: 10px 12px; border-radius: 8px; background: var(--primary-surface); font-size: 14px; }
  .line { margin: 12px 0 0; font-size: 14px; }
  .items { list-style: none; margin: 10px 0 0; padding: 0; display: grid; }
  .items li { display: grid; grid-template-columns: 110px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 8px 0; border-top: 1px solid var(--border); }
  .state { justify-self: start; font-size: 12px; font-weight: 600; padding: 2px 10px; border-radius: 99px; background: var(--muted); color: var(--muted-foreground); }
  .state.ready { background: var(--success-surface); color: var(--success); }
  .state.waiting { background: var(--warning-surface); color: var(--warning-text); }
  .state.failed { background: var(--danger-surface); color: var(--danger-text); }
  .state.running { background: var(--primary-surface); color: var(--primary-surface-foreground); }
  .what { display: grid; gap: 2px; min-width: 0; }
  .what .hint { margin: 0; }
  .group { margin-top: 14px; }
  .ghead { display: flex; gap: 8px; align-items: center; font-size: 14px; }
  .ghead .hint { margin: 0; }
  .vids { display: grid; gap: 4px; margin: 6px 0 0 24px; }
  .vids label { display: flex; gap: 8px; align-items: center; font-size: 14px; min-width: 0; }
  .vids .hint { margin: 0; flex: none; }
  .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .acts { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
</style>
