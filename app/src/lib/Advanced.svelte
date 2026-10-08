<script lang="ts">
  // Advanced (D6, DECISIONS 119): a tab's action bar shows one main button;
  // everything else (make again, fine-tuning) waits in this small menu,
  // which opens upwards from the bar. It closes after a choice.
  import type { Snippet } from "svelte";

  let { children, label = "Advanced" }: { children: Snippet; label?: string } = $props();
  let el = $state<HTMLDetailsElement>();
  const close = () => el && (el.open = false);
</script>

<svelte:window onclick={(e) => el?.open && !el.contains(e.target as Node) && close()} />

<details class="advanced" bind:this={el}>
  <summary>{label}</summary>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="menu" onclick={(e) => (e.target as HTMLElement).closest("button") && setTimeout(close)}>
    {@render children()}
  </div>
</details>

<style>
  .advanced { position: relative; }
  summary { list-style: none; cursor: pointer; padding: 8px 14px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px; background: var(--background); user-select: none; }
  summary::-webkit-details-marker { display: none; }
  summary::after { content: " \25B4"; color: var(--muted-foreground); }
  .menu { position: absolute; right: 0; bottom: calc(100% + 6px); z-index: 30; display: grid; gap: 4px; min-width: 240px; padding: 6px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 8px 24px rgb(0 0 0 / 0.14); }
  .menu :global(button) { width: 100%; justify-content: flex-start; text-align: left; }
  .menu :global(label) { padding: 4px 6px; }
</style>
