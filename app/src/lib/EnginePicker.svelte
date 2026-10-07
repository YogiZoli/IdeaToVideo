<script lang="ts">
  // Which HeyGen avatar engine makes the clips (DECISIONS 100, 101). Used in
  // Settings (the default, no look known) and on the Avatar tab (per video,
  // with the chosen look's supported engines: one it does not take is greyed
  // out). No fallback on the bindable: a config without it yet is undefined
  // and the picker shows the default, Avatar III.
  import { ENGINES, DEFAULT_ENGINE, chooseEngine, type AvatarEngine } from "./avatarEngines";

  let { engine = $bindable(), supported = null, disabled = false }: { engine?: AvatarEngine; supported?: string[] | null; disabled?: boolean } = $props();

  const effective = $derived(chooseEngine(engine, supported));
  const takes = (id: AvatarEngine) => !supported?.length || supported.includes(id);
</script>

<div class="field">
  <span class="label">Avatar engine</span>
  <div class="cards" role="radiogroup" aria-label="Avatar engine">
    {#each ENGINES as e (e.id)}
      <label class="card" class:on={effective.engine === e.id} class:off={!takes(e.id)}>
        <input type="radio" name="avatar-engine" value={e.id} checked={effective.engine === e.id} disabled={disabled || !takes(e.id)} onchange={() => (engine = e.id)} />
        <b>{e.label}{e.id === DEFAULT_ENGINE ? " (default)" : ""}</b>
        <span class="price">{e.price}</span>
        <span class="hint">{takes(e.id) ? e.blurb : "The chosen look does not work with this engine."}</span>
      </label>
    {/each}
  </div>
  {#if effective.note}<p class="hint">{effective.note}</p>{/if}
  <p class="hint">HeyGen's "unlimited" Avatar III in its web app does not apply to this app: here you pay HeyGen's API prices, from your API balance.</p>
</div>

<style>
  .field { display: grid; gap: 6px; margin: 10px 0 14px; }
  .label { font-weight: 600; }
  .cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .card { display: grid; gap: 3px; align-content: start; padding: 10px; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; }
  .card.on { border-color: var(--primary, currentColor); box-shadow: 0 0 0 1px var(--primary, currentColor); }
  .card.off { opacity: 0.55; cursor: not-allowed; }
  .card input { justify-self: start; margin: 0 0 2px; }
  .price { font-size: 13px; }
  .hint { color: var(--muted-foreground); font-size: 13px; margin: 0; }
  @media (max-width: 760px) { .cards { grid-template-columns: 1fr; } }
</style>
