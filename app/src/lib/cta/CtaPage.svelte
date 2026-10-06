<script lang="ts">
  // CtaPage: Settings, Identity, CTA. The comment calls of the Identity's
  // videos and the way into the CTA wizard (docs/wizards/cta.md).
  import { onMount } from "svelte";
  import type { AppState, CtaState, CtaSlot } from "../api";
  import { runner, errorText } from "../api";
  import { log } from "../logger";
  import ErrorBox from "../ErrorBox.svelte";
  import SegmentsManager from "./SegmentsManager.svelte";

  let { app, onopen, refresh = 0 }: { app: AppState; onopen: () => void; refresh?: number } = $props();

  // YouTube's end screen (DECISIONS 53): seconds left after the last call,
  // set here, not in the wizard.
  let endSaved = $state("");
  async function setEndScreen(value: number) {
    try {
      const base = st!.profile ?? st!.start;
      await runner("cta-save", { profile: { ...$state.snapshot(base), endScreen: value } });
      log("choice_changed", { field: "End screen seconds", value: String(value) });
      endSaved = "Saved.";
      await load();
    } catch (e) {
      error = errorText(e);
    }
  }

  let st = $state<CtaState | null>(null);
  let error = $state("");

  async function load() {
    try {
      st = await runner<CtaState>("cta-state", {});
    } catch (e) {
      error = errorText(e);
    }
  }
  onMount(load);
  $effect(() => {
    if (refresh) load();
  });

  const SLOT_IDS: CtaSlot[] = ["start", "middle", "end"];
  const summary = (p: CtaState["start"]) =>
    SLOT_IDS.filter((s) => p.slots[s]).map((s) => {
      const k = st!.options.keywords.find((x) => x.keyword === p.slots[s])!;
      return `${st!.options.slots[s].label}: ${k.keyword} (${st!.options.temperatures[k.temperature].label.toLowerCase()})${p.modes?.[s] !== "narrator" && st!.segments.some((g) => g.keyword === k.keyword) ? ", your segment plays" : ""}`;
    });
</script>

{#if error}<ErrorBox message={error} context={{ step: "cta" }} />{/if}
<section class="card">
  <h2>Comment calls</h2>
  {#if !st}
    <p class="hint">Loading...</p>
  {:else}
    {@const p = st.profile ?? st.start}
    {@const lines = summary(p)}
    {#if !st.profile}<p>Not set yet, so the method applies:</p>{/if}
    {#if lines.length}
      <ul>{#each lines as l (l)}<li>{l}</li>{/each}</ul>
    {:else}
      <p>No comment calls in the videos.</p>
    {/if}
    {#if Object.keys(p.offers).length}<p class="hint">Your own words for what viewers get: {Object.keys(p.offers).join(", ")}.</p>{/if}
    {#if p.updatedAt}<p class="hint">Saved {new Date(p.updatedAt).toLocaleDateString()}.</p>{/if}
  {/if}
  <p class="hint">Every new script of this Identity uses them. A single video can change them at gate 1.</p>
  <div class="row"><button type="button" class="primary" onclick={onopen}>Open CTA wizard</button></div>
</section>

{#if st}
  <section class="card">
    <h2>YouTube end screen</h2>
    <p class="hint">Seconds left at the end of every video, after the last call, for the end screen elements you add in YouTube Studio (subscribe, next video). The last picture holds and the music fades out.</p>
    <label class="row">
      <select value={String((st.profile ?? st.start).endScreen ?? 20)} onchange={(e) => setEndScreen(Number(e.currentTarget.value))}>
        {#each [0, 5, 10, 15, 20] as v (v)}<option value={String(v)}>{v === 0 ? "No end screen" : `${v} seconds${v === 20 ? " (recommended)" : ""}`}</option>{/each}
      </select>
      {#if endSaved}<span class="hint">{endSaved}</span>{/if}
    </label>
  </section>
  <SegmentsManager {app} options={st.options} cta={st.profile ?? st.start} bind:segments={st.segments} />
{/if}

<style>
  .row { display: flex; gap: 8px; }
  ul { margin: 4px 0; }
</style>
