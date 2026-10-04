<script lang="ts">
  // CtaPage: Settings, Identity, CTA. The comment calls of the Identity's
  // videos and the way into the CTA wizard (docs/wizards/cta.md).
  import { onMount } from "svelte";
  import type { CtaState, CtaSlot } from "../api";
  import { runner, errorText } from "../api";
  import ErrorBox from "../ErrorBox.svelte";

  let { onopen, refresh = 0 }: { onopen: () => void; refresh?: number } = $props();

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
      return `${st!.options.slots[s].label}: ${k.keyword} (${st!.options.temperatures[k.temperature].label.toLowerCase()})`;
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

<style>
  .row { display: flex; gap: 8px; }
  ul { margin: 4px 0; }
</style>
