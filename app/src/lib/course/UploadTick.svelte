<script lang="ts">
  // The Uploaded tick (DECISIONS 127): the upload itself stays manual in
  // YouTube Studio. The user pastes the link of the live video; the app keeps
  // it with the date. Then the vidrev handoff: the comment keywords this
  // video uses and a link to vidrev.app, where the user makes sure vidrev
  // watches the video (no automatic call to vidrev yet).
  import { onMount } from "svelte";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { runner, errorText } from "../api";
  import { log } from "../logger";
  import type { Call, Upload } from "./board";
  import { day, watchLink, VIDREV_URL } from "./board";

  let { dir, compact = false, changed = () => {} }: { dir: string; compact?: boolean; changed?: (u: Upload | null) => void } = $props();

  let upload = $state<Upload | null>(null);
  let calls = $state<Call[] | null>(null);
  let url = $state("");
  let date = $state(new Date().toISOString().slice(0, 10));
  let busy = $state(false);
  let error = $state("");
  let copied = $state(false);

  onMount(async () => {
    try {
      const r = await runner<{ upload: Upload | null; calls: Call[] | null }>("upload-info", { projectDir: dir });
      upload = r.upload;
      calls = r.calls;
    } catch (e) {
      error = errorText(e);
    }
  });

  async function tick(clear = false) {
    busy = true;
    error = "";
    try {
      const r = await runner<{ upload: Upload | null; calls: Call[] | null }>("set-upload", clear ? { projectDir: dir, clear: true } : { projectDir: dir, url, at: date });
      upload = r.upload;
      calls = r.calls;
      log("upload_tick", { set: !!r.upload });
      changed(r.upload);
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }

  async function copyLink() {
    if (!upload) return;
    try {
      await navigator.clipboard.writeText(upload.url);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      // no clipboard: the link is on screen
    }
  }
  const keywords = $derived((calls ?? []).map((c) => c.keyword));
</script>

<div class="up">
  {#if upload}
    <p><b>Uploaded</b> {day(upload.at)}. {#if watchLink(upload.url)}<button type="button" class="link" onclick={() => openUrl(upload!.url)}>{upload.url}</button>{/if}
      <button type="button" class="link" disabled={busy} onclick={() => tick(true)}>Untick</button></p>
    <p class="hint">Comment keywords in this video: {keywords.length ? keywords.join(", ") : "none found in the script"}. Make sure vidrev watches this video for them.
      <button type="button" class="link" onclick={() => openUrl(VIDREV_URL)}>Open vidrev.app</button>
      <button type="button" class="link" onclick={copyLink}>{copied ? "Copied" : "Copy the video link"}</button></p>
  {:else}
    <div class="row">
      <input type="url" bind:value={url} placeholder="YouTube link of the uploaded video" aria-label="YouTube link of the uploaded video" spellcheck="false" />
      <input type="date" bind:value={date} aria-label="Upload date" />
      <button type="button" disabled={busy || !url.trim()} onclick={() => tick()}>Mark uploaded</button>
    </div>
    {#if !compact}<p class="hint">Upload by hand in YouTube Studio, in playlist order, then paste the link here.</p>{/if}
  {/if}
  {#if error}<p class="err">{error}</p>{/if}
</div>

<style>
  .up { display: grid; gap: 4px; margin-top: 8px; }
  .up p { margin: 0; font-size: 13px; }
  .row { display: flex; gap: 6px; flex-wrap: wrap; }
  .row input[type="url"] { flex: 1 1 220px; min-width: 0; }
  .hint { color: var(--muted-foreground); }
  .err { color: var(--danger-text); }
</style>
