<script lang="ts">
  // PacksPage: Wizards, Scenes (DECISIONS 107). Block packs are
  // scene types someone designed, imported per Identity from an .itvpack
  // file: the planner may use their blocks, the Scenes tab offers them as
  // swaps. On and off per pack and per block; a pack keeps its own look or
  // follows this Identity's Brand. Import and Export are on Settings,
  // Import & Export (DECISIONS 119).
  import { onMount } from "svelte";
  import { runner, errorText } from "../api";
  import { log } from "../logger";
  import ErrorBox from "../ErrorBox.svelte";

  type Block = { id: string; label: string; role: string; what: string; needs: string[]; realOnly: boolean };
  type Pack = { id: string; name: string; author: string; version: string; description: string; look: string; on: boolean; followBrand: boolean; off: string[]; blocks: Block[] };

  let packs = $state<Pack[]>([]);
  let error = $state("");
  let busy = $state("");
  let saved = $state("");
  let openId = $state<string | null>(null);
  let { goto }: { goto?: (page: "transfer") => void } = $props();

  async function load() {
    try {
      packs = (await runner<{ packs: Pack[] }>("packs-list", {})).packs;
    } catch (e) {
      error = errorText(e);
    }
  }
  onMount(load);

  async function removeOne(p: Pack) {
    error = "";
    saved = "";
    try {
      await runner("pack-remove", { id: p.id });
      log("pack_removed", { id: p.id });
      await load();
    } catch (e) {
      error = errorText(e);
    }
  }

  async function setState(p: Pack, change: Partial<Pick<Pack, "on" | "followBrand" | "off">>) {
    error = "";
    try {
      const r = await runner<{ state: { on: boolean; followBrand: boolean; off: string[] } }>("pack-state", { id: p.id, state: { on: p.on, followBrand: p.followBrand, off: p.off, ...change } });
      Object.assign(p, r.state);
      packs = [...packs];
    } catch (e) {
      error = errorText(e);
    }
  }
  const toggleBlock = (p: Pack, id: string, on: boolean) => setState(p, { off: on ? p.off.filter((x) => x !== id) : [...p.off, id] });
</script>

<section class="card">
  <h2>Scene packs</h2>
  <p class="hint">Extra scene types someone designed, imported from a pack file (.itvpack). The AI may use them when it plans your scenes, and you can swap them in on the Scenes tab. They belong to this Identity; an Identity export takes them along.</p>
  {#if error}<ErrorBox message={error} context={{ step: "packs" }} />{/if}
  <p class="hint">Import a pack file, or export one: {#if goto}<button type="button" class="link" onclick={() => goto("transfer")}>Settings, Import & Export</button>{:else}Settings, Import & Export{/if}.</p>
  {#if busy}<p class="busy">{busy}</p>{/if}
  {#if saved}<p class="saved">{saved}</p>{/if}

  {#if packs.length}
    {#each packs as p (p.id)}
      <div class="pack">
        <div class="row">
          <b class="grow">{p.name}</b>
          <span class="hint">{p.blocks.length} scene types{p.author ? `, by ${p.author}` : ""}{p.version ? `, ${p.version}` : ""}</span>
        </div>
        {#if p.description}<p class="hint">{p.description}</p>{/if}
        <label class="radio"><input type="checkbox" checked={p.on} onchange={(e) => setState(p, { on: e.currentTarget.checked })} /> Use this pack</label>
        <label class="radio"><input type="checkbox" checked={p.followBrand} onchange={(e) => setState(p, { followBrand: e.currentTarget.checked })} /> Use this Identity's Brand colors and font (off: the pack's own look)</label>
        <div class="row">
          <button type="button" class="ghost" onclick={() => (openId = openId === p.id ? null : p.id)}>{openId === p.id ? "Hide the scene types" : "Choose scene types"}</button>
          <button type="button" class="ghost" onclick={() => removeOne(p)}>Remove</button>
        </div>
        {#if openId === p.id}
          <ul class="blocks">
            {#each p.blocks as b (b.id)}
              <li>
                <label class="radio"><input type="checkbox" checked={!p.off.includes(b.id)} onchange={(e) => toggleBlock(p, b.id, e.currentTarget.checked)} /> <b>{b.label}</b></label>
                <span class="hint">{b.what}{b.needs.includes("footage") ? " Needs your own footage." : ""}{b.realOnly ? " Only for real names, records or quotes." : ""}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/each}
  {:else}
    <p>No packs yet.</p>
  {/if}
</section>

<style>
  .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin: 6px 0; }
  .grow { flex: 1; }
  .pack { border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; margin-top: 12px; }
  .blocks { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 6px; max-height: 360px; overflow: auto; }
  .blocks li { display: grid; gap: 2px; }
  .busy { font-weight: 600; }
  .saved { padding: 10px 12px; border-radius: 8px; background: var(--success-surface, #e7f6ec); color: var(--success, #1f7a3a); font-weight: 600; }
  .link { border: none; background: none; padding: 0; color: var(--primary); text-decoration: underline; cursor: pointer; font-size: inherit; font-family: inherit; min-height: 0; }
</style>
