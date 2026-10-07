<script lang="ts">
  // Packaging, at gate 1 (DECISIONS 86): the YouTube title, summary and tags
  // made with the script, before anything is produced. The chosen title is
  // the script's title too. A new script may bring new ideas; the user's
  // choice stays until they change it. After the render the Video tab puts
  // the description together from this and the exact data.
  import { untrack } from "svelte";
  import ErrorBox from "./ErrorBox.svelte";
  import Progress from "./Progress.svelte";
  import { llmFor } from "./llm";
  import type { AppState } from "./api";
  import { runner, errorText } from "./api";
  import { running } from "./work.svelte";

  type Pack = { titles: string[]; title: string; summary: string; tags: string[]; chosen: boolean };
  let { app, dir, version, disabled = false, changed }: { app: AppState; dir: string; version: string | null; disabled?: boolean; changed: () => Promise<void> } = $props();

  let pack = $state<Pack | null>(null);
  let title = $state("");
  let summary = $state("");
  let tags = $state("");
  let error = $state("");
  let notice = $state("");
  let busy = $state(false);
  const job = $derived(!!running(dir, ["packaging-make", "write-script"]));

  function show(p: Pack | null) {
    pack = p;
    title = p?.title ?? "";
    summary = p?.summary ?? "";
    tags = p?.tags.join(", ") ?? "";
  }
  $effect(() => {
    void version;
    untrack(() => runner<{ packaging: Pack | null }>("packaging-state", { projectDir: dir }).then((r) => show(r.packaging)).catch(() => show(null)));
  });
  const dirty = $derived(!!pack && (title !== pack.title || summary !== pack.summary || tags !== pack.tags.join(", ")));

  async function make() {
    error = "";
    notice = "";
    busy = true;
    try {
      show((await runner<{ packaging: Pack }>("packaging-make", { projectDir: dir, llm: llmFor(app.config, "texts") })).packaging);
      await changed();
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }
  async function save() {
    error = "";
    try {
      show((await runner<{ packaging: Pack }>("packaging-save", { projectDir: dir, title, summary, tags: tags.split(",") })).packaging);
      notice = "Saved. The title is the script's title too.";
      await changed();
    } catch (e) {
      error = errorText(e);
    }
  }
</script>

<div class="pack">
  <h3>Packaging</h3>
  <p class="hint">The YouTube title, summary and tags, decided now, before the video is made. After the render the Video tab adds the chapters, the comment keywords and your landing page to the description.</p>
  {#if busy}<Progress command="packaging-make" project={dir} label="Writing title ideas, summary and tags" />{/if}
  {#if error}<ErrorBox message={error} context={{ step: "texts" }} />{/if}
  {#if pack}
    <span class="sub">Title (pick one, or write your own)</span>
    {#each pack.titles as t (t)}
      <label class="pick"><input type="radio" name="pack-title" value={t} bind:group={title} {disabled} /> {t}</label>
    {/each}
    <input type="text" maxlength="100" bind:value={title} {disabled} aria-label="Title" />
    <label class="field"><span class="sub">Summary</span><textarea rows="3" maxlength="1000" bind:value={summary} {disabled}></textarea></label>
    <label class="field"><span class="sub">Tags (comma separated)</span><input type="text" bind:value={tags} {disabled} /></label>
    <div class="row">
      <button type="button" class="primary" disabled={disabled || !dirty || !title.trim() || !summary.trim()} onclick={save}>Use this</button>
      <button type="button" disabled={disabled || busy || job} onclick={make}>New ideas (AI)</button>
      <span class="hint">{pack.chosen ? "Your choice is kept when the script is written again." : "Not chosen yet: a new script brings new ones."}</span>
    </div>
    {#if notice}<p class="good">{notice}</p>{/if}
  {:else}
    <button type="button" disabled={disabled || busy || job} onclick={make}>Make title, summary and tags (AI)</button>
  {/if}
</div>

<style>
  .pack { display: grid; gap: 8px; margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border); }
  h3 { margin: 0; font-size: 15px; }
  .sub { font-weight: 600; }
  .pick { display: flex; gap: 8px; align-items: center; }
  .field { display: grid; gap: 4px; }
  .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .good { color: var(--success, #1f7a3a); font-weight: 600; }
</style>
