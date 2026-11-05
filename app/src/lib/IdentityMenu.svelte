<script lang="ts">
  // The Identity switch in the top bar (DECISIONS 179): the active Identity's name and YouTube
  // handle; open, the list of every Identity and nothing else. Adding, duplicating, exporting and
  // deleting one are on Identity, Manage Identity.
  import type { AppState } from "./api";
  import { youtubeHandle } from "./identity";
  import { IDENTITY } from "./edition";

  let { app, choose }: { app: AppState; choose: (id: string) => void } = $props();

  let open = $state(false);
  let root: HTMLDivElement;
  const handle = $derived(youtubeHandle(app.identity?.channel?.youtubeUrl));

  function act(fn: () => void) {
    open = false;
    fn();
  }

  function outside(e: MouseEvent) {
    if (open && root && !root.contains(e.target as Node)) open = false;
  }
</script>

<svelte:window onclick={outside} onkeydown={(e) => e.key === "Escape" && (open = false)} />

<div class="menu" bind:this={root}>
  <button type="button" class="current" aria-haspopup="menu" aria-expanded={open} onclick={() => (open = !open)} title={`Switch ${IDENTITY}`}>
    <span class="label">{IDENTITY}</span>
    <span class="name">{app.identity?.name}</span>
    {#if handle}<span class="handle">{handle}</span>{/if}
    <span class="caret" aria-hidden="true">▾</span>
  </button>
  {#if open}
    <div class="pop" role="menu">
      {#each app.identities as i (i.id)}
        <button type="button" role="menuitem" class="item" class:active={i.id === app.identity?.id} onclick={() => act(() => choose(i.id))}>
          <span>{i.name}</span>
          {#if youtubeHandle(i.youtubeUrl)}<span class="handle">{youtubeHandle(i.youtubeUrl)}</span>{/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .menu { position: relative; margin-right: 8px; flex-shrink: 1; min-width: 0; }
  /* the top bar is one row, with the Jobs button too: the handle goes first, on a smaller window all but the name (DECISIONS 175) */
  @media (max-width: 1400px) {
    .current .handle { display: none; }
  }
  @media (max-width: 1180px) {
    .menu { margin-right: 2px; }
    .current .label, .current .handle { display: none; }
    .current .name { max-width: 130px; font-size: 14px; }
  }
  .current { display: inline-flex; gap: 8px; align-items: baseline; border: 1px solid var(--border); background: var(--background); padding: 5px 10px; border-radius: 8px; max-width: 360px; }
  .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted-foreground); }
  .name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .handle { font-size: 12px; color: var(--muted-foreground); }
  .caret { font-size: 11px; color: var(--muted-foreground); }
  .pop { position: absolute; z-index: 20; top: calc(100% + 6px); left: 0; min-width: 260px; display: grid; gap: 2px; padding: 6px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 8px 24px rgb(0 0 0 / 0.12); }
  .item { display: flex; justify-content: space-between; gap: 12px; width: 100%; text-align: left; border: none; background: none; padding: 7px 10px; border-radius: 6px; }
  .item.active { background: var(--primary-surface); color: var(--primary-surface-foreground); font-weight: 600; }
</style>
