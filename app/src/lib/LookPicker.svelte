<script lang="ts" module>
  export type Look = { id: string; name: string; type?: string; gender?: string | null; image: string | null; video?: string | null };
  export type Group = { id: string; name: string; image: string | null; status?: string; note: string | null; looks: Look[] };
</script>

<script lang="ts">
  // The avatar picker, the way HeyGen's own works (Zoltan, 2026-10-05: no
  // endless list of every look of every avatar). Step 1: one card per person
  // (avatar group). Step 2: that person's looks. "Your avatars" and "HeyGen
  // avatars" (the stock ones, with a search) are two tabs. Everything in a
  // box of fixed height that scrolls by itself; the choice is said under it.
  import { convertFileSrc } from "@tauri-apps/api/core";
  import { untrack } from "svelte";

  let {
    own,
    stock,
    value = $bindable(),
    disabled = false,
    preview,
  }: { own: Group[]; stock: Look[]; value?: string | null; disabled?: boolean; preview?: (l: Look) => void } = $props();

  const groupOf = (id?: string | null) => own.find((g) => g.looks.some((l) => l.id === id)) ?? null;
  let tab = $state<"own" | "stock">(untrack(() => (own.length && (!value || groupOf(value) || !stock.some((l) => l.id === value)) ? "own" : "stock")));
  let person = $state<Group | null>(untrack(() => groupOf(value)));
  let q = $state("");

  const chosen = $derived([...own.flatMap((g) => g.looks), ...stock].find((l) => l.id === value) ?? null);
  const chosenGroup = $derived(groupOf(value));
  const stockShown = $derived(q.trim() ? stock.filter((l) => l.name.toLowerCase().includes(q.trim().toLowerCase())) : stock);
  const img = (f: string | null) => (f ? convertFileSrc(f) : null);
</script>

<div class="picker">
  <div class="top">
    <div class="seg" role="tablist">
      <button type="button" role="tab" aria-selected={tab === "own"} class:on={tab === "own"} onclick={() => (tab = "own")}>Your avatars{own.length ? ` (${own.length})` : ""}</button>
      <button type="button" role="tab" aria-selected={tab === "stock"} class:on={tab === "stock"} onclick={() => (tab = "stock")}>HeyGen avatars</button>
    </div>
    {#if tab === "stock"}<input type="search" placeholder="Search by name" bind:value={q} aria-label="Search HeyGen avatars" />{/if}
  </div>

  {#if tab === "own"}
    <p class="crumb">
      {#if person}
        <button type="button" class="link" onclick={() => (person = null)}>All your avatars</button> / <b>{person.name}</b>: pick a look
      {:else}
        Pick a person, then one of their looks
      {/if}
    </p>
  {/if}

  <div class="box">
    {#if tab === "own" && !person}
      {#each own as g (g.id)}
        <button type="button" class="card" class:sel={chosenGroup?.id === g.id} onclick={() => (person = g)}>
          {#if img(g.image ?? g.looks[0]?.image ?? null)}<img src={img(g.image ?? g.looks[0]?.image ?? null)} alt="" loading="lazy" />{:else}<span class="noimg">{g.name.slice(0, 1)}</span>{/if}
          <span class="n">{g.name}</span>
          <span class="d">{g.note ?? `${g.looks.length} look${g.looks.length === 1 ? "" : "s"}`}</span>
        </button>
      {:else}
        <p class="hint">This HeyGen key sees no avatar of your own. If you have avatars in the HeyGen app, make the API key in the workspace where they are. Meanwhile you can pick one of the HeyGen avatars.</p>
      {/each}
    {:else}
      {#each tab === "own" ? person!.looks : stockShown as l (l.id)}
        <div class="card look" class:sel={value === l.id}>
          <button type="button" class="pick" {disabled} onclick={() => (value = l.id)} aria-pressed={value === l.id}>
            {#if img(l.image)}<img src={img(l.image)} alt="" loading="lazy" />{:else}<span class="noimg">{l.name.slice(0, 1)}</span>{/if}
            <span class="n">{l.name}</span>
          </button>
          {#if l.video && preview}<button type="button" class="pv" onclick={() => preview(l)}>Preview</button>{/if}
        </div>
      {:else}
        <p class="hint">No avatar matches.</p>
      {/each}
    {/if}
  </div>
  <p class="hint">Chosen: <b>{chosen ? `${chosenGroup ? `${chosenGroup.name}, ` : ""}${chosen.name}` : "none yet"}</b></p>
</div>

<style>
  .picker { display: grid; gap: 8px; }
  .top { display: flex; gap: 8px; align-items: center; }
  .top input { flex: 1; min-height: 38px; padding: 6px 12px; }
  .seg { display: inline-flex; border: 1px solid var(--border); border-radius: 10px; padding: 2px; }
  .seg button { min-height: 34px; border: none; background: none; padding: 4px 12px; font-size: 13px; }
  .seg button.on { background: var(--primary-surface); color: var(--primary-surface-foreground); }
  .crumb { margin: 0; font-size: 13px; color: var(--muted-foreground); }
  .link { border: none; background: none; padding: 0; min-height: 0; color: var(--primary); text-decoration: underline; font-size: inherit; font-weight: 400; }
  .box { display: grid; grid-template-columns: repeat(auto-fill, minmax(124px, 1fr)); gap: 8px; height: 250px; overflow: auto; padding: 2px; align-content: start; }
  .card { display: grid; gap: 2px; justify-items: start; text-align: left; padding: 6px; min-height: 0; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); font-weight: 400; }
  .card.sel { border: 2px solid var(--primary); background: var(--primary-surface); }
  .card img, .noimg { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 6px; background: var(--muted); display: grid; place-items: center; font-size: 22px; font-weight: 700; color: var(--muted-foreground); }
  .look { padding: 0; overflow: hidden; }
  .pick { display: grid; gap: 2px; justify-items: start; width: 100%; padding: 6px; min-height: 0; border: none; background: none; text-align: left; font-weight: 400; }
  .pv { width: 100%; min-height: 30px; padding: 2px; border: none; border-top: 1px solid var(--border); border-radius: 0; background: none; font-size: 12px; }
  .n { font-weight: 600; font-size: 13px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .d { font-size: 12px; color: var(--muted-foreground); }
  .hint { color: var(--muted-foreground); font-size: 13px; margin: 0; }
</style>
