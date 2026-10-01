<script lang="ts">
  // The AI provider, model and key. Used by the setup's AI step and by both
  // "AI and keys" pages in Settings: the App's (the default for every
  // Identity) and an Identity's own override (docs/identity.md 4).
  import type { Llm, KeyScope } from "./api";
  import { LLM_PROVIDERS } from "./catalog";
  import KeyField from "./KeyField.svelte";

  let {
    llm = $bindable(),
    keys = $bindable(),
    keyScope = "app",
  }: { llm: Llm; keys: Record<string, boolean>; keyScope?: KeyScope } = $props();

  const provider = $derived(LLM_PROVIDERS.find((p) => p.id === llm.provider) ?? LLM_PROVIDERS[0]);

  function pickProvider(pid: string) {
    const p = LLM_PROVIDERS.find((x) => x.id === pid)!;
    llm = { provider: p.id, model: p.model };
  }
</script>

<div class="field">
  <label for={`provider-${keyScope}`}>AI provider</label>
  <select id={`provider-${keyScope}`} value={llm.provider} onchange={(e) => pickProvider(e.currentTarget.value)}>
    {#each LLM_PROVIDERS as p}<option value={p.id}>{p.label}</option>{/each}
  </select>
  {#if provider.note}<p class="hint">{provider.note}</p>{/if}
</div>
<div class="field">
  <label for={`model-${keyScope}`}>Model</label>
  <input id={`model-${keyScope}`} bind:value={llm.model} placeholder="model name" spellcheck="false" />
  <p class="hint">Model names change often. You can edit this any time in Settings.</p>
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
<p class="warn">A ChatGPT Plus or Claude Pro subscription is not an API key. The API is a separate account with its own key.</p>

<style>
  .field { display: grid; gap: 6px; margin-bottom: 14px; }
  label { font-weight: 600; font-size: 14px; }
  .hint { margin: 0; font-size: 13px; color: var(--muted-foreground); }
  .warn { font-size: 13px; background: var(--warning-surface); color: var(--warning-text); padding: 8px 10px; border-radius: 6px; }
</style>
