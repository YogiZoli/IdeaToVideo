<script lang="ts">
  // One AI choice in two parts (Zoltan, 2026-10-05, DECISIONS 89): the model
  // (Claude Opus 5.5, Sonnet 5.5, Haiku 4.5, Gemini 3.5 Flash...) and the
  // effort (Low, Medium, High...), each its own list. "Other model" takes any
  // model name the provider knows. Used for the App's or Identity's AI, for
  // each step in Settings, and for "Change" on the Script and Scenes tabs.
  import type { StepLlm, Effort } from "./api";
  import { LLM_PROVIDERS, modelChoices, effortChoices, EFFORT_LABELS } from "./catalog";

  let {
    value = $bindable(),
    id = "llm",
    keys = null,
    compact = false,
  }: { value: StepLlm; id?: string; keys?: Record<string, boolean> | null; compact?: boolean } = $props();

  const choices = $derived(modelChoices(value.provider));
  const known = $derived(choices.some((m) => m.id === value.model));
  let other = $state(false);
  const efforts = $derived(effortChoices(value.provider, value.model));
  const OTHER = "__other__";

  function pickProvider(pid: string) {
    const p = LLM_PROVIDERS.find((x) => x.id === pid)!;
    other = false;
    value = { ...value, provider: p.id, model: p.model || modelChoices(p.id)[0]?.id || "", effort: null };
  }
  function pickModel(m: string) {
    if (m === OTHER) {
      other = true;
      value = { ...value, model: "" };
      return;
    }
    other = false;
    const eff = effortChoices(value.provider, m);
    value = { ...value, model: m, effort: value.effort && eff.includes(value.effort) ? value.effort : null };
  }
</script>

<div class="picker" class:compact>
  <label class="f">
    <span>Provider</span>
    <select id={`${id}-provider`} value={value.provider} onchange={(e) => pickProvider(e.currentTarget.value)}>
      {#each LLM_PROVIDERS as p}<option value={p.id}>{p.label}{keys && !keys[p.id] ? " (no key yet)" : ""}</option>{/each}
    </select>
  </label>
  <label class="f">
    <span>Model</span>
    {#if choices.length && !other && (known || !value.model)}
      <select id={`${id}-model`} value={value.model} onchange={(e) => pickModel(e.currentTarget.value)}>
        {#each choices as m}<option value={m.id}>{m.label}</option>{/each}
        <option value={OTHER}>Other model...</option>
      </select>
    {:else}
      <input id={`${id}-model`} bind:value={value.model} placeholder="model name" spellcheck="false" />
    {/if}
  </label>
  <label class="f">
    <span>Effort</span>
    {#if efforts.length}
      <select id={`${id}-effort`} value={value.effort ?? ""} onchange={(e) => (value = { ...value, effort: (e.currentTarget.value || null) as Effort | null })}>
        <option value="">Default</option>
        {#each efforts as ef}<option value={ef}>{EFFORT_LABELS[ef]}</option>{/each}
      </select>
    {:else}
      <span class="none">This model has no effort setting</span>
    {/if}
  </label>
</div>
{#if keys && !keys[value.provider]}<p class="hint">No {LLM_PROVIDERS.find((p) => p.id === value.provider)?.label} key yet: add it in Settings, AI and keys.</p>{/if}

<style>
  .picker { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr) minmax(0, 1fr); gap: 8px; align-items: end; }
  .f { display: grid; gap: 4px; font-size: 13px; }
  .f span { font-weight: 600; }
  .f select, .f input { width: 100%; min-width: 0; }
  .compact .f select, .compact .f input { min-height: 38px; padding: 4px 10px; font-size: 14px; }
  .none { font-weight: 400 !important; color: var(--muted-foreground); font-size: 13px; padding: 10px 0; }
  .hint { color: var(--muted-foreground); font-size: 13px; margin: 4px 0 0; }
  @media (max-width: 760px) { .picker { grid-template-columns: 1fr; } }
</style>
