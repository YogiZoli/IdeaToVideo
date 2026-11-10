<script lang="ts">
  // BubbleMarker: drag a box around the face bubble on a still of the recording
  // (ITV Editor, DECISIONS 184). The box is kept as parts of the frame (0 to 1), so it
  // fits the original at any size. A sensible corner is preselected.
  import { untrack } from "svelte";
  import { convertFileSrc } from "@tauri-apps/api/core";
  import { runner, errorText } from "../api";
  import ErrorBox from "../ErrorBox.svelte";

  type Box = { x: number; y: number; w: number; h: number };
  let { file, start, done, skip }: { file: string; start: Box; done: (b: Box) => void; skip: () => void } = $props();

  let still = $state("");
  let error = $state("");
  let box = $state<Box>({ ...untrack(() => start) });
  let frame = $state<HTMLDivElement | null>(null);
  let from: { x: number; y: number } | null = null;

  $effect(() => {
    runner<{ file: string }>("recorded-still", { file })
      .then((r) => (still = convertFileSrc(r.file)))
      .catch((e) => (error = errorText(e)));
  });

  const at = (e: PointerEvent) => {
    const r = frame!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  function down(e: PointerEvent) {
    from = at(e);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (!from) return;
    const p = at(e);
    box = { x: Math.min(from.x, p.x), y: Math.min(from.y, p.y), w: Math.abs(p.x - from.x), h: Math.abs(p.y - from.y) };
  }
  const up = () => (from = null);
  const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
  const usable = $derived(box.w >= 0.03 && box.h >= 0.03);
</script>

<div class="marker">
  {#if error}<ErrorBox message={error} context={{ step: "bubble-mark" }} />{/if}
  <p class="hint">Drag a box around your face bubble, a little wider than the circle. The app lifts exactly this box out and keeps it in place, so the zoom never cuts your face.</p>
  <div class="frame" bind:this={frame} role="presentation" onpointerdown={down} onpointermove={move} onpointerup={up}>
    {#if still}<img src={still} alt="The first frame of your recording" draggable="false" />{:else}<div class="wait">Loading the first frame...</div>{/if}
    <div class="box" style="left:{pct(box.x)};top:{pct(box.y)};width:{pct(box.w)};height:{pct(box.h)}"></div>
  </div>
  <div class="row">
    <button type="button" class="ghost" onclick={skip}>Skip, no zoom for this video</button>
    <button type="button" class="primary" disabled={!usable} onclick={() => done(box)}>This is the bubble</button>
  </div>
</div>

<style>
  .marker { display: grid; gap: 8px; }
  .frame { position: relative; user-select: none; touch-action: none; cursor: crosshair; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: var(--surface); }
  .frame img { display: block; width: 100%; pointer-events: none; }
  .wait { aspect-ratio: 16 / 9; display: grid; place-items: center; color: var(--muted-foreground); }
  .box { position: absolute; border: 3px solid var(--primary); border-radius: 8px; box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.35); pointer-events: none; }
  .row { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
  .hint { font-size: 13px; color: var(--muted-foreground); margin: 0; }
</style>
