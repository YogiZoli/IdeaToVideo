<script lang="ts">
  // BrollSettings: Identity, Footage, AI B-roll (docs/ai-broll.md,
  // DECISIONS 95, 98). Off by default, it costs money. On: the generator
  // (HeyGen Video 1, or free test clips), the quality and the most one ONE
  // Video may spend. The Scenes tab shows "Make B-roll clips" only when on.
  import { onMount } from "svelte";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import type { AppState, BrollSettings, BrollChoices } from "../api";
  import { runner, errorText } from "../api";
  import { log } from "../logger";
  import ErrorBox from "../ErrorBox.svelte";

  let { app }: { app: AppState } = $props();

  let st = $state<(BrollChoices & { settings: BrollSettings; cap: { min: number; max: number; step: number; default: number } }) | null>(null);
  let s = $state<BrollSettings | null>(null);
  let error = $state("");
  let saved = $state("");

  onMount(async () => {
    try {
      st = await runner("broll-settings", {});
      s = { ...st!.settings };
    } catch (e) {
      error = errorText(e);
    }
  });

  const hasKey = $derived(!!app.keys["heygen"]);
  const gen = $derived(st?.generators.find((g) => g.id === s?.generator) ?? null);
  const rate = $derived(gen && s ? gen.usdPerSecond[s.quality] ?? 0 : 0);
  // what the limit buys at this quality, in seconds and 5 s clips
  const fits = $derived(rate > 0 && s ? Math.floor(s.capUsd / rate) : null);

  async function save(field: string, value: unknown) {
    if (!s) return;
    error = "";
    try {
      const r = await runner<{ settings: BrollSettings }>("broll-settings-save", { settings: { ...s } });
      s = { ...r.settings };
      saved = "Saved.";
      setTimeout(() => (saved = ""), 1500);
      log("choice_changed", { field: `AI B-roll ${field}`, value });
    } catch (e) {
      error = errorText(e);
    }
  }
</script>

{#if error}<ErrorBox message={error} context={{ step: "broll-settings" }} />{/if}
<section class="card">
  <h2>AI B-roll</h2>
  <p class="hint">Short video clips made by AI for your sentences, instead of an animated scene: each one shows what the narrator says, made only for your video, with no source to credit. Off by default, because every clip costs money from your HeyGen API balance. Clips already made stay below, in your AI B-roll library, and later videos use them again for free.</p>
  {#if s && st}
    <label class="switch"><input type="checkbox" bind:checked={s.enabled} onchange={() => save("on", s!.enabled)} /> Make AI B-roll clips (shows "Make B-roll clips" on the Scenes tab)</label>
    {#if s.enabled}
      <div class="grid">
        <span class="label">Generator</span>
        <div>
          {#each st.generators as g (g.id)}
            <label class="radio"><input type="radio" name="brgen" checked={s.generator === g.id} onchange={() => { s!.generator = g.id; save("generator", g.id); }} /> {g.label}{g.id === "heygen-video-1" ? " (default)" : ""}</label>
          {/each}
          {#if s.generator === "test"}
            <p class="note">Test clips are free test patterns made on this computer, so you can try the whole flow before there is money on your HeyGen account. They are marked as tests and never put into a video by the scene planner.</p>
          {:else if !hasKey}
            <p class="warn">No HeyGen key yet. Add it in Settings, Connections. Video clips need a paid HeyGen API balance.</p>
          {/if}
        </div>

        <span class="label">Quality</span>
        <div>
          {#each st.qualities as q (q.id)}
            <label class="radio"><input type="radio" name="brq" checked={s.quality === q.id} onchange={() => { s!.quality = q.id; save("quality", q.id); }} /> {q.label} <span class="hint">({q.note}{gen && gen.usdPerSecond[q.id] ? `, about ${gen.usdPerSecond[q.id].toFixed(2)} USD a second` : ""})</span></label>
          {/each}
          <p class="hint">Your video is 1080p. HeyGen Video 1 makes 480p, 768p or 2K: for 1080p the app orders the 2K clip and scales it to your video.</p>
        </div>

        <span class="label">Limit per video</span>
        <div>
          <div class="slider">
            <input type="range" min={st.cap.min} max={st.cap.max} step={st.cap.step} bind:value={s.capUsd} onchange={() => save("limit", s!.capUsd)} aria-label="Most a video may spend on AI B-roll, in USD" />
            <b>{s.capUsd.toFixed(2)} USD</b>
          </div>
          <p class="hint">The most one video may spend on B-roll clips{fits !== null ? `: about ${fits} seconds at ${s.quality}, ${Math.floor(fits / 5)} clips of 5 seconds` : ""}. Above it the app always asks you first; it never goes over by itself.</p>
        </div>
      </div>
      <p class="hint">Prices are HeyGen's regular ones; the estimate before each order shows the real amount for that video. Clips you make with a paid HeyGen plan are yours to use, also commercially; HeyGen may use what you generate to improve its service (its terms). <button type="button" class="link" onclick={() => openUrl("https://www.heygen.com/terms")}>HeyGen terms</button></p>
    {/if}
    {#if saved}<p class="saved">{saved}</p>{/if}
  {:else}
    <p class="hint">Loading...</p>
  {/if}
</section>

<style>
  .switch { display: flex; gap: 8px; align-items: center; font-weight: 600; margin: 8px 0; }
  .grid { display: grid; grid-template-columns: 140px minmax(0, 1fr); gap: 12px 16px; margin: 12px 0; }
  .label { font-weight: 600; padding-top: 2px; }
  .radio { display: flex; gap: 6px; align-items: center; margin: 2px 0; }
  .slider { display: flex; gap: 12px; align-items: center; }
  .slider input { flex: 1; max-width: 360px; }
  .note { margin: 6px 0 0; padding: 8px 10px; border-radius: 8px; background: var(--muted); font-size: 13px; }
  .warn { margin: 6px 0 0; font-size: 13px; color: var(--danger-text, #a5161b); }
  .saved { color: var(--success, #1f7a3a); font-weight: 600; }
  .link { border: none; background: none; padding: 0 2px; color: var(--primary); text-decoration: underline; font-size: inherit; cursor: pointer; }
  @media (max-width: 760px) { .grid { grid-template-columns: 1fr; } }
</style>
