<script lang="ts">
  // The Identity switch, on the right of the top bar (DECISIONS 179, 187): the active Identity's name,
  // cut with an ellipsis at a fixed width, in full in the tooltip and in the open list. Open: every
  // Identity, and New Identity at the bottom. Duplicating, exporting and deleting one are on
  // Identity, Manage Identity.
  import type { AppState } from "./api";
  import { youtubeHandle } from "./identity";
  import { IDENTITY } from "./edition";

  let { app, choose, create }: { app: AppState; choose: (id: string) => void; create: () => void } = $props();

  let open = $state(false);
  let root: HTMLDivElement;
  const handle = $derived(youtubeHandle(app.identity?.channel?.youtubeUrl));
  const full = $derived(`${IDENTITY}: ${app.identity?.name ?? ""}${handle ? ` (${handle})` : ""}. Click to switch.`);

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
  <button type="button" class="current" aria-haspopup="menu" aria-expanded={open} onclick={() => (open = !open)} title={full} aria-label={full}>
    <span class="name">{app.identity?.name}</span>
    <span class="caret" aria-hidden="true">▾</span>
  </button>
  {#if open}
    <div class="pop" role="menu">
      {#each app.identities as i (i.id)}
        <button type="button" role="menuitem" class="item" class:active={i.id === app.identity?.id} title={i.name} onclick={() => act(() => choose(i.id))}>
          <span class="full">{i.name}</span>
          {#if youtubeHandle(i.youtubeUrl)}<span class="handle">{youtubeHandle(i.youtubeUrl)}</span>{/if}
        </button>
      {/each}
      <div class="sep"></div>
      <button type="button" role="menuitem" class="item add" onclick={() => act(create)}>New Identity</button>
    </div>
  {/if}
</div>

<style>
  /* a fixed maximum width: a long name never pushes the menu (FIX_PLAN 2026-11-19, item 1) */
  .menu { position: relative; flex: 0 1 220px; min-width: 72px; max-width: 220px; }
  .current { display: flex; gap: 6px; align-items: center; width: 100%; border: 1px solid var(--border); background: var(--background); padding: 5px 10px; border-radius: 8px; overflow: hidden; }
  .name { flex: 1; min-width: 0; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; }
  .caret { flex: none; font-size: 11px; color: var(--muted-foreground); }
  .pop { position: absolute; z-index: 20; top: calc(100% + 6px); right: 0; width: max-content; min-width: 260px; max-width: min(480px, 90vw); display: grid; gap: 2px; padding: 6px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 8px 24px rgb(0 0 0 / 0.12); }
  .item { display: flex; justify-content: space-between; gap: 12px; width: 100%; text-align: left; border: none; background: none; padding: 7px 10px; border-radius: 6px; }
  .full { overflow-wrap: anywhere; }
  .handle { flex: none; font-size: 12px; color: var(--muted-foreground); }
  .item.active { background: var(--primary-surface); color: var(--primary-surface-foreground); font-weight: 600; }
  .item.add { color: var(--primary-surface-foreground); font-weight: 600; }
  .sep { height: 1px; background: var(--border); margin: 4px 2px; }
</style>
