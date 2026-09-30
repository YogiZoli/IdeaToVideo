<script lang="ts">
  // The render engine's one-time setup: the pinned render browser (DECISIONS 25)
  // goes into the app's own folder. Shown only while something is missing.
  import { onDestroy } from "svelte";
  import { runner, onProgress, errorText } from "./api";
  import ErrorBox from "./ErrorBox.svelte";

  type Browser = { source: "managed" | "system"; path: string; version?: string } | null;
  type Status = { canon: { commit: string; hyperframes: string; blocks: number } | null; ffmpeg: boolean; browser: Browser };

  let status = $state<Status | null>(null);
  let busy = $state(false);
  let percent = $state<number | null>(null);
  let note = $state("");
  let error = $state("");

  async function check() {
    try {
      status = await runner<Status>("tools-status");
    } catch (e) {
      error = errorText(e);
    }
  }
  check();

  const unlisten = onProgress((p) => {
    if (p.command !== "browser-ensure") return;
    if (typeof p.progress.percent === "number") percent = p.progress.percent;
  });
  onDestroy(() => unlisten.then((f) => f()));

  async function download() {
    busy = true;
    error = "";
    percent = 0;
    try {
      const r = await runner<{ source: string; warning?: string }>("browser-ensure");
      note = r.warning ?? "";
      await check();
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
      percent = null;
    }
  }

  const broken = $derived(status && (!status.canon || !status.ffmpeg));
  const needsBrowser = $derived(status && status.browser?.source !== "managed");
</script>

{#if broken}
  <section class="banner">
    <strong>The video engine is incomplete.</strong>
    <p>Part of the app is missing ({!status?.canon ? "video library" : "ffmpeg"}). Reinstall IdeaToVideo.</p>
  </section>
{:else if needsBrowser}
  <section class="banner">
    <div class="text">
      <strong>One more download before your first video</strong>
      <p>
        The render browser (about 280 MB) goes into the app's own folder, once.
        {#if status?.browser?.source === "system"}Until then, your installed Google Chrome is used.{/if}
      </p>
      {#if busy}
        <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={percent ?? 0}>
          <span style={`width:${percent ?? 0}%`}></span>
        </div>
        <p class="muted">{percent ?? 0}%</p>
      {/if}
    </div>
    <button type="button" class="primary" disabled={busy} onclick={download}>{busy ? "Downloading..." : "Download now"}</button>
  </section>
{/if}
{#if note}<p class="muted">{note}</p>{/if}
{#if error}<ErrorBox message={error} context={{ step: "render-engine" }} />{/if}

<style>
  .banner { display: flex; gap: 16px; align-items: center; justify-content: space-between; padding: 14px 16px; margin-bottom: 16px; border: var(--border-width) solid var(--border); border-radius: var(--radius-lg, 10px); background: var(--primary-surface); }
  .text { flex: 1; }
  .banner p { margin: 4px 0 0; }
  .bar { height: 6px; margin-top: 10px; border-radius: 3px; background: var(--surface); overflow: hidden; }
  .bar span { display: block; height: 100%; background: var(--primary); transition: width 0.2s; }
  .muted { color: var(--muted-foreground); }
</style>
