<script lang="ts">
  // The channel's paid AI clips (docs/BUILD_PLAN.md phase 1b): off by default, a
  // switch, a most per video and a most per month. Saved at once, in the channel's
  // broll.json. Turning it on spends nothing: the Preview tab asks first.
  import { onMount } from "svelte";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import ErrorBox from "../ErrorBox.svelte";
  import type { AppState, BrollSettings, PaidChoice } from "../api";
  import { runner, errorText } from "../api";
  import { log } from "../logger";

  let { app }: { app: AppState } = $props();

  let s = $state<BrollSettings | null>(null);
  let choice = $state<PaidChoice | null>(null);
  let error = $state("");
  let saved = $state(false);

  onMount(async () => {
    try {
      const r = await runner<{ settings: BrollSettings; paidChoice: PaidChoice }>("broll-settings", {});
      s = r.settings;
      choice = r.paidChoice;
    } catch (e) {
      error = errorText(e);
    }
  });

  const hasKey = $derived(!!app.keys["kie"]);
  const each = $derived(choice?.qualities.find((q) => q.id === s?.paid.quality)?.clipUsd ?? 0);

  async function save(field: string) {
    if (!s) return;
    error = "";
    try {
      s = (await runner<{ settings: BrollSettings }>("broll-settings-save", { settings: $state.snapshot(s) })).settings;
      saved = true;
      setTimeout(() => (saved = false), 1500);
      log("choice_changed", { field: `paid clips ${field}` });
    } catch (e) {
      error = errorText(e);
    }
  }
</script>

{#if error}<ErrorBox message={error} context={{ step: "paid-clips" }} />{/if}
{#if s && choice}
  <div class="paid">
    <label><input type="checkbox" bind:checked={s.paid.on} onchange={() => save("on")} /> Paid AI clips for hero moments (off by default)</label>
    {#if s.paid.on}
      {#if !hasKey}<p class="warn">Add your Kie AI key in Settings, Connections.</p>{/if}
      <div class="grid">
        <label for="pq">Model</label>
        <div>
          <span>{choice.label}, {choice.qualities[0].seconds} seconds a clip</span>
          <select id="pq" bind:value={s.paid.quality} onchange={() => save("quality")}>
            {#each choice.qualities as q (q.id)}<option value={q.id}>{q.id}, {q.clipUsd.toFixed(2)} USD a clip</option>{/each}
          </select>
        </div>
        <label for="pv">Most per video</label>
        <div><input id="pv" type="number" min={choice.limits.perVideo.min} max={choice.limits.perVideo.max} step="0.5" bind:value={s.paid.maxPerVideoUsd} onchange={() => save("per video")} /> USD{each > 0 ? `, about ${Math.floor(s.paid.maxPerVideoUsd / each)} clips` : ""}</div>
        <label for="pm">Most per month</label>
        <div><input id="pm" type="number" min={choice.limits.perMonth.min} max={choice.limits.perMonth.max} step="1" bind:value={s.paid.maxPerMonthUsd} onchange={() => save("per month")} /> USD for this channel</div>
      </div>
      <p class="hint">Used only where nothing free fits a hero moment. The Preview tab lists those scenes and the total; nothing is spent until you approve it. Kie AI's product page calls this model licensed for business use, but its <button type="button" class="link" onclick={() => openUrl("https://kie.ai/terms-of-use")}>terms of use</button> do not say who owns the output.</p>
    {/if}
    {#if saved}<p class="saved">Saved.</p>{/if}
  </div>
{/if}

<style>
  .paid { margin-top: 10px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; }
  .paid > label { display: flex; gap: 8px; align-items: center; font-size: 14px; }
  .grid { display: grid; grid-template-columns: 130px minmax(0, 1fr); gap: 8px 12px; margin: 10px 0; align-items: center; font-size: 14px; }
  .grid select { display: block; margin-top: 4px; max-width: 300px; }
  input[type="number"] { width: 90px; }
  .hint { margin: 6px 0 0; font-size: 13px; color: var(--muted-foreground); }
  .warn { margin: 6px 0 0; font-size: 13px; color: var(--danger-text, #a5161b); }
  .saved { margin: 6px 0 0; font-size: 13px; color: var(--success, #1f7a3a); font-weight: 600; }
  .link { border: none; background: none; padding: 0 2px; color: var(--primary); text-decoration: underline; font-size: inherit; cursor: pointer; }
  @media (max-width: 760px) { .grid { grid-template-columns: 1fr; } }
</style>
