<script lang="ts">
  // The Identity menu in the top bar (docs/identity.md 7): the active
  // Identity's name and YouTube handle; open, it lists every Identity and
  // offers New, Duplicate, Import and the Identity's settings. On a full plan
  // (Solo) New, Duplicate and Import are greyed out, with the reason.
  import type { AppState } from "./api";
  import { youtubeHandle, roomForIdentity } from "./identity";
  import { fullPlanText, IDENTITY } from "./edition";

  let {
    app,
    choose,
    newIdentity,
    duplicate,
    importIdentity,
    settings,
  }: {
    app: AppState;
    choose: (id: string) => void;
    newIdentity: () => void;
    duplicate: () => void;
    importIdentity: () => void;
    settings: () => void;
  } = $props();

  let open = $state(false);
  let root: HTMLDivElement;
  const room = $derived(roomForIdentity(app.identities.length, app.edition.identityLimit));
  const full = $derived(room ? "" : fullPlanText(app.edition));
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
      <hr />
      <button type="button" role="menuitem" class="item" disabled={!room} title={full} onclick={() => act(newIdentity)}>New Identity</button>
      <button type="button" role="menuitem" class="item" disabled={!room} title={full} onclick={() => act(duplicate)}>Duplicate this Identity</button>
      <button type="button" role="menuitem" class="item" disabled={!room} title={full} onclick={() => act(importIdentity)}>Import Identity</button>
      <button type="button" role="menuitem" class="item" onclick={() => act(settings)}>Identity settings</button>
      {#if !room}<p class="note">{full}</p>{/if}
    </div>
  {/if}
</div>

<style>
  .menu { position: relative; margin-right: 14px; }
  .current { display: inline-flex; gap: 8px; align-items: baseline; border: 1px solid var(--border); background: var(--background); padding: 5px 10px; border-radius: 8px; max-width: 360px; }
  .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted-foreground); }
  .name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .handle { font-size: 12px; color: var(--muted-foreground); }
  .caret { font-size: 11px; color: var(--muted-foreground); }
  .pop { position: absolute; z-index: 20; top: calc(100% + 6px); left: 0; min-width: 260px; display: grid; gap: 2px; padding: 6px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 8px 24px rgb(0 0 0 / 0.12); }
  .item { display: flex; justify-content: space-between; gap: 12px; width: 100%; text-align: left; border: none; background: none; padding: 7px 10px; border-radius: 6px; }
  .item.active { background: var(--primary-surface); color: var(--primary-surface-foreground); font-weight: 600; }
  hr { border: none; border-top: 1px solid var(--border); margin: 4px 0; width: 100%; }
  .note { margin: 4px 10px; font-size: 12px; color: var(--muted-foreground); max-width: 260px; }
</style>
