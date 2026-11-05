<script lang="ts">
  // The Scene Timing (runner/shots, docs/BUILD_PLAN.md phase 3): every shot with its
  // time, what it shows, its camera and change, and the word each thing on screen
  // enters on. A block chosen on the Scenes tab stays that block. Per shot, off by
  // default: a Google Flow slot, with a ready prompt, a copy button and the exact
  // length; the mp4 comes back by dropping it on the shot, or with the button.
  import { getCurrentWebview } from "@tauri-apps/api/webview";
  import { open as pickFile } from "@tauri-apps/plugin-dialog";
  import { onMount, onDestroy } from "svelte";
  import ErrorBox from "../ErrorBox.svelte";
  import { runner, errorText } from "../api";
  import { running } from "../work.svelte";
  import type { TabId } from "../tabs";
  import type { Shot, ShotMap } from "./channels";

  let { dir, look, busy = false, planned = false, changed, goto, next }: { dir: string; look: string; busy?: boolean; planned?: boolean; changed: () => Promise<void>; goto: (t: TabId) => void; next: TabId } = $props();

  const job = $derived(running(dir, ["shot-map-make", "shot-flow-clip"]));
  let map = $state<ShotMap | null>(null);
  let error = $state("");
  let working = $state("");
  let copied = $state("");
  const off = $derived(busy || !!job || !!working);
  const count = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  const clock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
  const HOW: Record<string, string> = { shot: "with the shot", cue: "on its own word", block: "with its block", "not-said": "not said" };

  async function load() {
    try {
      map = await runner<ShotMap>("shot-map-state", { projectDir: dir });
    } catch (e) {
      error = errorText(e);
    }
  }
  onMount(load);
  let wasRunning = false;
  $effect(() => {
    const now = !!job || busy;
    if (wasRunning && !now) load();
    wasRunning = now;
  });

  async function act(id: string, fn: () => Promise<ShotMap>) {
    working = id;
    error = "";
    try {
      map = await fn();
      await changed();
    } catch (e) {
      error = errorText(e);
    } finally {
      working = "";
    }
  }
  const makeMap = () => act("make", () => runner<ShotMap>("shot-map-make", { projectDir: dir, look }));
  const setOn = (s: Shot, on: boolean) => act(s.id, () => runner<ShotMap>("shot-flow-set", { projectDir: dir, id: s.id, on }));
  const setPrompt = (s: Shot, prompt: string) => act(s.id, () => runner<ShotMap>("shot-flow-set", { projectDir: dir, id: s.id, prompt }));
  const addClip = (id: string, file: string) => act(id, () => runner<ShotMap>("shot-flow-clip", { projectDir: dir, id, file }));
  async function choose(s: Shot) {
    const f = await pickFile({ multiple: false, directory: false, filters: [{ name: "Video", extensions: ["mp4", "mov", "webm", "m4v"] }] });
    if (typeof f === "string") addClip(s.id, f);
  }
  async function copy(s: Shot) {
    try {
      await navigator.clipboard.writeText(s.flow?.prompt ?? "");
      copied = s.id;
      setTimeout(() => (copied = ""), 2000);
    } catch (e) {
      error = errorText(e);
    }
  }

  // An mp4 dropped on a shot with its slot on goes under that shot.
  let stopDrop: (() => void) | null = null;
  onMount(async () => {
    try {
      stopDrop = await getCurrentWebview().onDragDropEvent((e) => {
        if (e.payload.type !== "drop" || off) return;
        const scale = window.devicePixelRatio || 1;
        const under = document.elementFromPoint(e.payload.position.x / scale, e.payload.position.y / scale);
        const id = under?.closest<HTMLElement>("[data-shot]")?.dataset.shot;
        const shot = map?.shots.find((s) => s.id === id);
        if (shot?.flow?.on && e.payload.paths[0]) addClip(shot.id, e.payload.paths[0]);
      });
    } catch {
      // no window to listen to (the UI mock): the button still works
    }
  });
  onDestroy(() => stopDrop?.());
</script>

<section class="card shots">
  <div class="head">
    <h2>Scene Timing</h2>
    <button type="button" class="ghost" onclick={() => goto("scenes")}>Change a block on the Scenes tab</button>
  </div>
  <p class="hint">The detailed plan behind the Scenes: every shot with its length and camera, and the exact word each thing on screen appears on. Made on this computer, it costs nothing. The Preview, the next big step, shows what it looks like.</p>
  {#if error}<ErrorBox message={error} context={{ step: "shot-map" }} />{/if}
  {#if !map || !map.shots.length}
    <p class="hint">{map?.warning ?? (planned ? "This video has no scene timing yet." : "The scene timing comes after the voice and the scene plan. Plan the scenes first.")}</p>
    {#if planned}<div class="actions"><button type="button" class="primary" disabled={off} onclick={makeMap}>{working === "make" ? "Making..." : "Make the scene timing"}</button></div>{/if}
  {:else}
    {#if map.warning}<p class="warn">{map.warning}</p>{/if}
    {#if map.summary}
      <p class="hint">{count(map.summary.shots, "shot")}, {map.summary.broll} with B-roll, {count(map.summary.hero, "hero moment")}, {count(map.summary.overrides, "block")} you or the catalog chose. {map.summary.onTheirWord} of {map.summary.elements} things on screen enter on their word; {map.summary.withBlock} {map.summary.withBlock === 1 ? "comes" : "come"} with the block's own animation.</p>
    {/if}
    <ol class="list">
      {#each map.shots as s (s.id)}
        <li data-shot={s.id} class:hero={s.hero}>
          <div class="top">
            <span class="time">{clock(s.start)}</span>
            <span class="len">{s.seconds.toFixed(1)} s</span>
            <span class="tag" class:broll={s.kind === "broll"}>{s.kind === "broll" ? "B-roll" : "Graphic"}</span>
            {#if s.hero}<span class="tag heroTag">Hero</span>{/if}
            {#if s.override && !s.call}<span class="tag">Your block</span>{/if}
            <b>{s.kind === "broll" ? s.source : s.block}</b>
          </div>
          <p class="said">{s.said}</p>
          <p class="meta">Camera: {s.camera}. Into it: {s.transition}.{s.paid ? ` Waiting for your yes on the Preview tab: ${s.paid.tier === "video" ? "a paid video clip" : "a paid picture, moved in 2.5D"}.` : ""}</p>
          {#if s.entrances.length && s.kind !== "broll"}
            <p class="meta">
              {#each s.entrances as e, i (i)}{i ? "; " : ""}"{e.text}" {#if e.at !== null}on "{e.word}" at {clock(e.at)}, {HOW[e.how]}{:else}{HOW[e.how]}{/if}{/each}
            </p>
          {/if}
          {#if !s.call}
            <label class="tick"><input type="checkbox" checked={!!s.flow?.on} disabled={off} onchange={(e) => setOn(s, e.currentTarget.checked)} /> Google Flow for this shot</label>
          {/if}
          {#if s.flow?.on}
            <div class="flow">
              <textarea rows="3" aria-label="Google Flow prompt" value={s.flow.prompt} disabled={off} onchange={(e) => setPrompt(s, e.currentTarget.value)}></textarea>
              <div class="row">
                <button type="button" disabled={off} onclick={() => copy(s)}>{copied === s.id ? "Copied" : "Copy the prompt"}</button>
                <span class="hint">Clip length: exactly {s.flow.seconds.toFixed(1)} seconds.</span>
                <button type="button" class="primary" disabled={off} onclick={() => choose(s)}>{working === s.id ? "Adding..." : s.flow.clip ? "Choose another mp4" : "Choose the mp4"}</button>
              </div>
              <p class="hint">{s.flow.clip ? `In the video: ${s.flow.name}.` : "Or drop the mp4 on this shot."} Logged as Google Flow (Veo), own generation.{s.flow.short ? " This clip is shorter than the shot, so it repeats." : ""}</p>
            </div>
          {/if}
        </li>
      {/each}
    </ol>
    <div class="actions"><button type="button" class="primary" disabled={off} onclick={() => goto(next)}>Next</button></div>
  {/if}
</section>

<style>
  .shots { display: grid; gap: 8px; }
  .head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  h2 { margin: 0; font-size: 18px; }
  .list { list-style: none; margin: 0; padding: 0; display: grid; }
  .list > li { padding: 10px 0; border-top: 1px solid var(--border); display: grid; gap: 3px; }
  .list > li.hero { border-left: 3px solid var(--primary); padding-left: 10px; }
  .top { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 13px; }
  .time { font-variant-numeric: tabular-nums; font-weight: 600; }
  .len { color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
  .tag { padding: 0 8px; border-radius: 10px; background: var(--muted); font-size: 12px; }
  .tag.broll { background: var(--success-surface); color: var(--success); }
  .heroTag { background: var(--primary-surface); color: var(--primary-surface-foreground); font-weight: 600; }
  .said { margin: 0; font-size: 14px; }
  .meta { margin: 0; font-size: 12px; color: var(--muted-foreground); overflow-wrap: anywhere; }
  .tick { display: flex; gap: 8px; align-items: center; font-size: 13px; margin-top: 2px; }
  .flow { display: grid; gap: 6px; margin-top: 4px; padding: 10px; border: 1px solid var(--border); border-radius: 8px; }
  .flow textarea { width: 100%; box-sizing: border-box; font-size: 13px; }
  .row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .row .hint { flex: 1; }
  .hint { margin: 0; font-size: 13px; color: var(--muted-foreground); }
  .warn { margin: 0; padding: 8px 12px; border-radius: 8px; background: var(--warning-surface); color: var(--warning-text); font-size: 13px; }
  .actions { display: flex; justify-content: flex-end; margin-top: 8px; }
</style>
