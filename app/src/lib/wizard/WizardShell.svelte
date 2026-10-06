<script lang="ts">
  // WizardShell: the frame every optional wizard shares (Brand now; Motion and
  // CTA next, docs/wizards/brand.md 11): the steps on top, one screen at a
  // time, Back and Next, Save on every screen, and the same reassurance at
  // the bottom. The wizard itself owns its data and what Save does.
  import type { Snippet } from "svelte";
  import { log } from "../logger";

  let {
    title,
    steps,
    step = $bindable(0),
    busy = false,
    saveLabel = "Save",
    onsave,
    oncancel,
    aside,
    children,
  }: {
    title: string;
    steps: { id: string; title: string }[];
    step?: number;
    busy?: boolean;
    saveLabel?: string;
    onsave: () => void;
    oncancel: () => void;
    aside?: Snippet;
    children: Snippet;
  } = $props();

  function go(n: number) {
    step = Math.max(0, Math.min(steps.length - 1, n));
    log("wizard_step", { wizard: title, step: steps[step].id });
  }
</script>

<div class="wizard">
  <header>
    <div>
      <p class="for">{title}</p>
      <h1>{steps[step].title}</h1>
    </div>
    <div class="row">
      <button type="button" class="ghost" disabled={busy} onclick={oncancel}>Close</button>
      <button type="button" class="primary" disabled={busy} onclick={onsave}>{saveLabel}</button>
    </div>
  </header>
  <ol class="steps">
    {#each steps as s, i (s.id)}
      <li><button type="button" class:current={i === step} class:done={i < step} disabled={busy} onclick={() => go(i)}>{i + 1}. {s.title}</button></li>
    {/each}
  </ol>
  <div class="body" class:with-aside={!!aside}>
    <div class="screen">{@render children()}</div>
    {#if aside}<aside>{@render aside()}</aside>{/if}
  </div>
  <footer>
    <p class="hint">Not sure? Skip or use the default. You can change this any time in Settings.</p>
    <div class="row">
      <button type="button" disabled={busy || step === 0} onclick={() => go(step - 1)}>Back</button>
      {#if step < steps.length - 1}
        <button type="button" disabled={busy} onclick={() => go(step + 1)}>Next</button>
      {:else}
        <button type="button" class="primary" disabled={busy} onclick={onsave}>{saveLabel}</button>
      {/if}
    </div>
  </footer>
</div>

<style>
  .wizard { display: grid; gap: 16px; padding: 24px; max-width: 1100px; margin: 0 auto; }
  header, footer { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .for { margin: 0; font-size: 13px; color: var(--muted-foreground); }
  h1 { margin: 0; }
  .row { display: flex; gap: 8px; align-items: center; }
  .steps { list-style: none; display: flex; flex-wrap: wrap; gap: 4px; margin: 0; padding: 0; }
  .steps button { border: none; background: none; padding: 4px 10px; border-radius: 999px; font-size: 13px; color: var(--muted-foreground); }
  .steps .done { color: var(--foreground); }
  .steps .current { background: var(--primary-surface); color: var(--primary-surface-foreground); font-weight: 600; }
  .body { display: grid; gap: 24px; }
  .body.with-aside { grid-template-columns: minmax(0, 1fr) 360px; align-items: start; }
  aside { position: sticky; top: 12px; }
  .screen { display: grid; gap: 16px; min-width: 0; }
  .hint { font-size: 13px; color: var(--muted-foreground); margin: 0; }
  @media (max-width: 900px) { .body.with-aside { grid-template-columns: 1fr; } }
</style>
