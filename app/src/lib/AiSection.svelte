<script lang="ts">
  // The AI provider, model, effort and key. Used by the setup's AI step and by
  // both "AI and keys" pages in Settings: the App's (the default for every
  // Identity) and an Identity's own override (docs/identity.md 4). In
  // Settings, "Choose a model for each step" gives the script, the scenes and
  // the small texts their own model and effort (DECISIONS 89); off, every
  // step uses the one above.
  import type { Llm, KeyScope } from "./api";
  import { LLM_PROVIDERS } from "./catalog";
  import { STEPS, llmFor } from "./llm";
  import KeyField from "./KeyField.svelte";
  import ModelPicker from "./ModelPicker.svelte";

  let {
    llm = $bindable(),
    keys = $bindable(),
    keyScope = "app",
    steps = false,
  }: { llm: Llm; keys: Record<string, boolean>; keyScope?: KeyScope; steps?: boolean } = $props();

  const provider = $derived(LLM_PROVIDERS.find((p) => p.id === llm.provider) ?? LLM_PROVIDERS[0]);

  function setPerStep(on: boolean) {
    // turning it on starts every step from the AI above
    const filled = Object.fromEntries(STEPS.map((s) => [s.id, llm.steps?.[s.id] ?? llmFor({ llm: { ...llm, perStep: false } }, s.id)]));
    llm = { ...llm, perStep: on, steps: filled };
  }
  // a saved setting from before a step existed: that step starts from the AI above
  $effect(() => {
    if (llm.perStep && STEPS.some((s) => !llm.steps?.[s.id])) setPerStep(true);
  });
</script>

<div class="field">
  <ModelPicker bind:value={llm} id={`ai-${keyScope}`} />
  {#if provider.note}<p class="hint">{provider.note}</p>{/if}
  <p class="hint">Model names change often. Effort: how hard the model thinks. Higher is better for hard work and costs more; Default is the provider's own setting.</p>
</div>
{#key llm.provider}
  <KeyField
    name={llm.provider}
    label={provider.label}
    keyUrl={provider.keyUrl}
    scope={keyScope}
    bind:isSet={keys[llm.provider]}
    test={() => ({ command: "test-llm", provider: llm.provider, model: llm.model })}
  />
{/key}

{#if steps}
  <div class="steps">
    <label class="toggle"><input type="checkbox" checked={!!llm.perStep} onchange={(e) => setPerStep(e.currentTarget.checked)} /> Choose a model for each step</label>
    {#if llm.perStep}
      <p class="hint">For example a strong model for the script and a fast, cheaper one for the rest. The voice, the music and the avatar use their own services; the preview and the render use no AI. A change on the Script or Scenes tab of a video is saved here too.</p>
      {#each STEPS as s (s.id)}
        <div class="step">
          <span class="name">{s.label}</span>
          <span class="hint">{s.hint}</span>
          {#if llm.steps?.[s.id]}
            <ModelPicker bind:value={llm.steps[s.id]!} id={`ai-${keyScope}-${s.id}`} {keys} compact />
          {/if}
        </div>
      {/each}
    {:else}
      <p class="hint">Off: every step uses the AI above.</p>
    {/if}
  </div>
{/if}
{#if steps}
  <label class="field">
    <span>How long the AI may plan the scenes</span>
    <select value={String(llm.waitSeconds ?? 180)} onchange={(e) => (llm = { ...llm, waitSeconds: Number(e.currentTarget.value) })}>
      <option value="90">90 seconds</option>
      <option value="180">3 minutes (default)</option>
      <option value="300">5 minutes</option>
      <option value="0">No limit, wait like before</option>
    </select>
    <span class="hint">Past it, your next saved AI key gets one try, then the free rule-made plan is used and the Preview tab says so. Several videos at once on one key are slower: then a longer limit helps.</span>
  </label>
{/if}
<p class="warn">A ChatGPT Plus or Claude Pro subscription is not an API key. The API is a separate account with its own key.</p>

<style>
  .field { display: grid; gap: 6px; margin-bottom: 14px; }
  .hint { margin: 0; font-size: 13px; color: var(--muted-foreground); }
  .warn { font-size: 13px; background: var(--warning-surface); color: var(--warning-text); padding: 8px 10px; border-radius: 6px; }
  .steps { display: grid; gap: 8px; margin: 6px 0 14px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 10px; }
  .toggle { display: flex; gap: 8px; align-items: center; font-weight: 600; }
  .step { display: grid; gap: 4px; padding-top: 8px; border-top: 1px solid var(--border); }
  .name { font-weight: 700; }
</style>
