<script lang="ts">
  // First-run wizard (PRD 5): 12 steps, each with fill in / Use recommended /
  // Skip, use default. Only the AI key is mandatory.
  import type { Config } from "./api";
  import { saveConfig, errorText, type AppState } from "./api";
  import { cleanConfig } from "./catalog";
  import { STEPS, skipStep, recommendStep, stepReady } from "./steps";
  import ConfigSection from "./ConfigSection.svelte";
  import ErrorBox from "./ErrorBox.svelte";


  let { config = $bindable(), keys = $bindable(), done }: { config: Config; keys: Record<string, boolean>; done: (s: AppState) => void } = $props();

  let index = $state(0);
  let busy = $state(false);
  let error = $state("");
  const step = $derived(STEPS[index]);
  const blocker = $derived(stepReady(step.id, config, keys));

  async function next() {
    error = "";
    if (index < STEPS.length - 1) {
      index++;
      return;
    }
    busy = true;
    try {
      done(await saveConfig(cleanConfig({ ...config, onboarded: true })));
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }

  async function recommend() {
    busy = true;
    error = "";
    try {
      config = await recommendStep(step.id, config);
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }

  function skip() {
    config = skipStep(step.id, config);
    if (!stepReady(step.id, config, keys)) next();
  }
</script>

<div class="wizard">
  <ol class="steps">
    {#each STEPS as s, i}
      <li class:current={i === index} class:past={i < index}>
        <button type="button" disabled={i > index} onclick={() => (index = i)}>{i + 1}. {s.title}</button>
      </li>
    {/each}
  </ol>

  <section class="card">
    <p class="count">Step {index + 1} of {STEPS.length}</p>
    <h1>{step.title}</h1>
    <p class="intro">{step.intro}</p>

    <ConfigSection id={step.id} bind:config bind:keys />

    {#if error}<ErrorBox message={error} context={{ step: `onboarding:${step.id}`, provider: config.llm.provider, model: config.llm.model }} />{/if}
    {#if blocker}<p class="hint">{blocker}</p>{/if}

    <div class="actions">
      <button type="button" class="ghost" disabled={index === 0 || busy} onclick={() => (index -= 1)}>Back</button>
      <span class="spacer"></span>
      {#if step.canRecommend}
        <button type="button" disabled={busy} onclick={recommend}>{busy ? "Working..." : "Use recommended"}</button>
      {/if}
      {#if !step.required}
        <button type="button" disabled={busy} onclick={skip}>Skip, use default</button>
      {/if}
      <button type="button" class="primary" disabled={busy || !!blocker} onclick={next}>
        {index === STEPS.length - 1 ? "Finish" : "Next"}
      </button>
    </div>
  </section>
</div>

<style>
  .wizard { display: grid; grid-template-columns: 220px 1fr; gap: 24px; padding: 24px; max-width: 1040px; margin: 0 auto; }
  .steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; align-content: start; }
  .steps button { width: 100%; text-align: left; border: none; background: none; padding: 6px 10px; border-radius: 6px; color: var(--muted-foreground); }
  .steps .past button { color: var(--foreground); }
  .steps .current button { background: var(--primary-surface); color: var(--primary-surface-foreground); font-weight: 600; }
  .count { margin: 0; font-size: 13px; color: var(--muted-foreground); }
  h1 { margin: 4px 0 6px; font-size: 24px; }
  .intro { margin: 0 0 18px; color: var(--muted-foreground); }
  .actions { display: flex; gap: 8px; margin-top: 20px; align-items: center; }
  .spacer { flex: 1; }
  .hint { font-size: 13px; color: var(--muted-foreground); }
</style>
