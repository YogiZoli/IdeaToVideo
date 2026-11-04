<script lang="ts">
  // The Evergreen Traffic Card on Identity, YouTube Channel & Audience
  // (DECISIONS 127). The .md from the Brand Channel Wizard, as a file or
  // pasted: kept with the Identity as it came, and its values offered for the
  // fields this page already has (name, audience, topic and promise,
  // language). Ticked values go into the fields below; "Save settings" keeps
  // them, as with any edit. The Playlist Planner reads the kept card.
  import { onMount } from "svelte";
  import { open } from "@tauri-apps/plugin-dialog";
  import type { Config } from "../api";
  import { runner, errorText } from "../api";
  import { log } from "../logger";
  import type { CardField, TrafficCard } from "./planner";

  let { config = $bindable() }: { config: Config } = $props();

  let kept = $state<TrafficCard | null>(null);
  let pasted = $state("");
  let fields = $state<(CardField & { take: boolean })[] | null>(null);
  let input = $state<{ file?: string; text?: string } | null>(null);
  let busy = $state(false);
  let error = $state("");
  let done = $state("");

  onMount(async () => {
    try {
      kept = (await runner<{ card: TrafficCard | null }>("traffic-card-load", {})).card;
    } catch {
      kept = null;
    }
  });

  async function look(what: { file?: string; text?: string }) {
    busy = true;
    error = "";
    done = "";
    try {
      const r = await runner<{ card: TrafficCard; fields: CardField[] }>("traffic-card-preview", { ...what, channel: config.channel, name: config.name });
      input = what;
      fields = r.fields.map((f) => ({ ...f, take: !f.now }));
    } catch (e) {
      error = errorText(e);
      fields = null;
    } finally {
      busy = false;
    }
  }

  async function pickFile() {
    const file = await open({ title: "Evergreen Traffic Card", multiple: false, filters: [{ name: "Traffic Card", extensions: ["md"] }] });
    if (typeof file === "string") await look({ file });
  }

  async function keep() {
    if (!input || !fields) return;
    busy = true;
    error = "";
    try {
      kept = (await runner<{ card: TrafficCard }>("traffic-card-save", input)).card;
      const taken = fields.filter((f) => f.take);
      for (const f of taken) {
        if (f.field === "name") config.name = f.value;
        else config.channel = { ...config.channel, [f.field]: f.value };
      }
      log("traffic_card", { fields: taken.map((f) => f.field), keywords: kept.keywords.length });
      done = taken.length ? `Card kept. ${taken.length} ${taken.length === 1 ? "field" : "fields"} filled below: click Save settings to keep them.` : "Card kept. No field changed.";
      fields = null;
      pasted = "";
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }
</script>

<section class="card">
  <h2>Evergreen Traffic Card</h2>
  <p class="hint">The .md card from the YouTube Brand Channel Wizard: the wizard in this app keeps it here by itself, and a card from the web version comes in with Import. It stays with this Identity, fills the fields that fit, and the Playlist Planner reads its keywords.</p>
  {#if kept}<p class="good">Card kept{kept.generated ? `, made ${kept.generated}` : ""}: {kept.keywords.length} keywords, {kept.playlists.length} playlists, {kept.videos.length} video ideas.</p>{/if}
  <div class="acts">
    <button type="button" disabled={busy} onclick={pickFile}>Import card (.md)</button>
  </div>
  <textarea rows="3" bind:value={pasted} placeholder="Or paste the card here" aria-label="Paste the Traffic Card" spellcheck="false"></textarea>
  <div class="acts"><button type="button" disabled={busy || !pasted.trim()} onclick={() => look({ text: pasted })}>Preview</button></div>

  {#if fields}
    {#if fields.length}
      <p class="hint">Tick what the card should fill. Fields you already filled are not ticked.</p>
      <ul class="fields">
        {#each fields as f (f.field)}
          <li><label><input type="checkbox" bind:checked={f.take} /> <b>{f.label}</b></label>
            <span class="v">{f.value}</span>
            {#if f.now}<span class="hint">Now: {f.now}</span>{/if}</li>
        {/each}
      </ul>
    {:else}
      <p class="hint">Every field the card has is already the same here.</p>
    {/if}
    <button type="button" class="primary" disabled={busy} onclick={keep}>Keep the card{fields.some((f) => f.take) ? " and fill" : ""}</button>
  {/if}
  {#if done}<p class="good">{done}</p>{/if}
  {#if error}<p class="err">{error}</p>{/if}
</section>

<style>
  .acts { display: flex; gap: 8px; margin: 8px 0; }
  textarea { width: 100%; box-sizing: border-box; }
  .fields { list-style: none; padding: 0; margin: 8px 0; display: grid; gap: 8px; }
  .fields li { display: grid; gap: 2px; }
  .v { font-size: 13px; }
  .hint { font-size: 13px; color: var(--muted-foreground); margin: 0; }
  .err { color: var(--danger-text); }
</style>
