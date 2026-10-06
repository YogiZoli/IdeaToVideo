<script lang="ts">
  // DictionaryPage: the Identity's dictionary (DECISIONS 68, docs/wizards/
  // brand.md 10), four lists. The script gate follows them, and a machine
  // check marks banned words and other spellings in gates 1 and 3.
  import { onMount } from "svelte";
  import type { Dictionary } from "../api";
  import { runner, errorText } from "../api";
  import { log } from "../logger";
  import ErrorBox from "../ErrorBox.svelte";

  let dict = $state<Dictionary | null>(null);
  let busy = $state(false);
  let error = $state("");
  let message = $state("");

  onMount(async () => {
    try {
      dict = (await runner<{ dictionary: Dictionary }>("dictionary-load", {})).dictionary;
    } catch (e) {
      error = errorText(e);
    }
  });

  async function save() {
    busy = true;
    error = "";
    message = "";
    try {
      dict = (await runner<{ dictionary: Dictionary }>("dictionary-save", { dictionary: $state.snapshot(dict) })).dictionary;
      log("dictionary_saved", { preferred: dict.preferred.length, banned: dict.banned.length, distinct: dict.distinct.length, positions: dict.positions.length });
      message = "Dictionary saved. New scripts follow it.";
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }
</script>

{#if error}<ErrorBox message={error} context={{ step: "dictionary" }} />{/if}
{#if !dict}
  <p class="hint">Loading...</p>
{:else}
  <p class="hint">Words for this Identity's scripts. The AI follows them when it writes, and the app marks a slip in the script and in the scene texts. A mark never stops you: you decide.</p>

  <section class="card">
    <h2>Preferred spellings</h2>
    <p class="hint">Words always written exactly like this. Example: "Owner" with a capital O.</p>
    {#each dict.preferred as row, i (i)}
      <div class="row">
        <input bind:value={row.term} maxlength="200" placeholder="Word or phrase" aria-label="Preferred word" />
        <input bind:value={row.note} maxlength="200" placeholder="Note (optional)" aria-label="Note" />
        <button type="button" class="ghost" onclick={() => dict!.preferred.splice(i, 1)}>Remove</button>
      </div>
    {/each}
    <button type="button" onclick={() => dict!.preferred.push({ term: "" })}>Add a word</button>
  </section>

  <section class="card">
    <h2>Banned words</h2>
    <p class="hint">Never in a script. Example: "blasting email". Say what to use instead, and the AI uses that.</p>
    {#each dict.banned as row, i (i)}
      <div class="row">
        <input bind:value={row.term} maxlength="200" placeholder="Banned word or phrase" aria-label="Banned word" />
        <input bind:value={row.instead} maxlength="200" placeholder="Say instead (optional)" aria-label="Instead" />
        <button type="button" class="ghost" onclick={() => dict!.banned.splice(i, 1)}>Remove</button>
      </div>
    {/each}
    <button type="button" onclick={() => dict!.banned.push({ term: "" })}>Add a word</button>
  </section>

  <section class="card">
    <h2>Never mix up</h2>
    <p class="hint">Two things that sound alike but are not the same. Example: YouTube Subscriber and Email Subscriber; avatar as an AI avatar and as your ideal customer.</p>
    {#each dict.distinct as row, i (i)}
      <div class="row">
        <input bind:value={row.a} maxlength="200" placeholder="One" aria-label="First term" />
        <input bind:value={row.b} maxlength="200" placeholder="The other" aria-label="Second term" />
        <input bind:value={row.note} maxlength="200" placeholder="Note (optional)" aria-label="Note" />
        <button type="button" class="ghost" onclick={() => dict!.distinct.splice(i, 1)}>Remove</button>
      </div>
    {/each}
    <button type="button" onclick={() => dict!.distinct.push({ a: "", b: "" })}>Add a pair</button>
  </section>

  <section class="card">
    <h2>What you stand against</h2>
    <p class="hint">Your positions draw the viewers you want and turn away the rest. An opponent can be a phenomenon or a type, not a person: "hustle culture", "the hustle bro". If you name a real person, the script speaks about them only as your opinion.</p>
    {#each dict.positions as row, i (i)}
      <div class="row">
        <input bind:value={row.against} maxlength="200" placeholder="Against what" aria-label="Against" />
        <select bind:value={row.kind} aria-label="Kind">
          <option value="phenomenon">A phenomenon</option>
          <option value="type">A type of person</option>
          <option value="person">A real person</option>
        </select>
        <input bind:value={row.stance} maxlength="200" placeholder="Your stance (optional)" aria-label="Stance" />
        <button type="button" class="ghost" onclick={() => dict!.positions.splice(i, 1)}>Remove</button>
      </div>
    {/each}
    <button type="button" onclick={() => dict!.positions.push({ against: "", kind: "phenomenon" })}>Add a position</button>
  </section>

  <div class="actions">
    {#if message}<p class="good">{message}</p>{/if}
    <button type="button" class="primary" disabled={busy} onclick={save}>Save dictionary</button>
  </div>
{/if}

<style>
  section { display: grid; gap: 10px; justify-items: start; }
  section .row { width: 100%; }
  h2 { margin: 0; font-size: 17px; }
  .row { display: flex; gap: 8px; align-items: center; }
  .row { flex-wrap: wrap; }
  .row input { flex: 1 1 160px; min-width: 0; }
  .row select { flex: 0 1 180px; min-width: 0; }
  .hint { font-size: 13px; color: var(--muted-foreground); margin: 0; }
  .actions { display: flex; gap: 12px; align-items: center; justify-content: flex-end; }
  .good { color: var(--success); margin: 0; }
</style>
