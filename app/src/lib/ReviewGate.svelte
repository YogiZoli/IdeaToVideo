<script lang="ts">
  // Gate 4: build the video from the approved scene table, check it (0 errors),
  // show the contact sheet (one still per scene), approve, then render once,
  // locally, into the project's out/ folder.
  import { convertFileSrc } from "@tauri-apps/api/core";
  import { revealItemInDir } from "@tauri-apps/plugin-opener";
  import { onDestroy } from "svelte";
  import ErrorBox from "./ErrorBox.svelte";
  import type { Gate } from "./api";
  import { runner, onProgress, errorText } from "./api";

  let { dir, gate, scenesApproved, changed }: { dir: string; gate?: Gate; scenesApproved: boolean; changed: () => Promise<void> } = $props();

  const MINUTES_PER_VIDEO_MINUTE = 2.2; // measured, phase 2 pilot

  let busy = $state(false);
  let step = $state("");
  let error = $state("");
  let seconds = $state<number | null>(null);
  let stamp = $state(Date.now());
  let quality = $state("standard");
  let rendering = $state(false);
  let percent = $state<number | null>(null);
  let video = $state<{ file: string; seconds: number; renderSeconds: number } | null>(null);

  const built = $derived(gate?.state === "pending" || gate?.state === "approved");
  const sheetSrc = $derived(convertFileSrc(`${dir}/review/contact.png`) + `?t=${stamp}`);

  const unlisten = onProgress((p) => {
    const s = p.progress;
    if (p.command === "build-video") {
      step = ({ build: "Building the video...", lint: "Checking the build (lint)...", check: "Checking layout, motion and contrast...", snapshots: `Taking ${s.frames ?? ""} stills...`, sheet: "Making the contact sheet..." } as Record<string, string>)[String(s.step)] ?? step;
    }
    if (p.command === "render-video" && typeof s.percent === "number") percent = s.percent;
  });
  onDestroy(() => unlisten.then((f) => f()));

  async function build() {
    busy = true;
    error = "";
    step = "Starting...";
    try {
      const r = await runner<{ seconds: number }>("build-video", { projectDir: dir });
      seconds = r.seconds;
      stamp = Date.now();
      await changed();
    } catch (e) {
      error = errorText(e);
      await changed();
    } finally {
      busy = false;
      step = "";
    }
  }

  async function approve() {
    busy = true;
    try {
      await runner("approve-gate", { projectDir: dir, gate: "review" });
      await changed();
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }

  async function render() {
    rendering = true;
    busy = true;
    error = "";
    percent = 0;
    try {
      video = await runner("render-video", { projectDir: dir, quality });
    } catch (e) {
      error = errorText(e);
    } finally {
      rendering = false;
      busy = false;
      percent = null;
    }
  }

  const estimate = $derived(seconds ? Math.max(1, Math.round((seconds / 60) * MINUTES_PER_VIDEO_MINUTE)) : null);
</script>

<section class="card">
  <div class="head">
    <h2>4. Review and render</h2>
    {#if gate}<span class="pill {gate.state}">{gate.state}</span>{/if}
  </div>

  {#if !scenesApproved}
    <p class="hint">Approve the scene table first.</p>
  {:else}
    <div class="actions">
      <span class="hint grow">Builds the video from your scene table and checks it. Then you see one still per scene.</span>
      <button type="button" class="primary" disabled={busy} onclick={build}>{built ? "Build again" : "Build and check (Recommended)"}</button>
    </div>
    {#if busy && step}<p class="hint">{step} This takes about a minute.</p>{/if}
    {#if error}<ErrorBox message={error} context={{ step: "review" }} />{:else if gate?.state === "failed" && gate.error}<ErrorBox message={`Last attempt failed: ${gate.error}`} context={{ step: "review" }} />{/if}

    {#if built}
      <p class="hint">Contact sheet: one still per scene, as it looks just before the scene ends. It shows no motion.</p>
      <img class="sheet" src={sheetSrc} alt="Contact sheet: one still per scene" />
      <div class="actions">
        <button type="button" class="primary" disabled={busy || gate?.state === "approved"} onclick={approve}>{gate?.state === "approved" ? "Approved" : "Approve contact sheet"}</button>
      </div>
    {/if}

    {#if gate?.state === "approved"}
      <div class="render">
        <label for="quality">Quality</label>
        <select id="quality" bind:value={quality} disabled={busy}>
          <option value="draft">Draft (fast)</option>
          <option value="standard">Standard</option>
          <option value="high">High</option>
        </select>
        <span class="hint grow">{estimate ? `About ${estimate} minute${estimate > 1 ? "s" : ""} on this computer. Keep it on.` : "Keep the computer on while it renders."}</span>
        <button type="button" class="primary" disabled={busy} onclick={render}>{video ? "Render again" : "Render video"}</button>
      </div>
      {#if rendering}<progress max="100" value={percent ?? 0}></progress><p class="hint">Rendering {percent ?? 0}%...</p>{/if}
      {#if video}
        <p class="good">Done: {video.seconds} s of video in {video.renderSeconds} s.</p>
        <!-- svelte-ignore a11y_media_has_caption -->
        <video controls src={convertFileSrc(video.file)}></video>
        <div class="actions">
          <button type="button" onclick={() => revealItemInDir(video!.file)}>Show in folder</button>
        </div>
      {/if}
    {/if}
  {/if}
</section>

<style>
  .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  h2 { margin: 0; font-size: 17px; }
  .actions, .render { display: flex; justify-content: flex-end; align-items: center; gap: 8px; margin-top: 10px; }
  .grow { flex: 1; }
  .sheet { width: 100%; border-radius: 8px; margin-top: 8px; background: var(--muted); }
  video { width: 100%; margin-top: 8px; border-radius: 8px; }
  progress { width: 100%; }
  .hint { color: var(--muted-foreground); font-size: 13px; }
  .good { color: var(--success); }
  .pill { font-size: 12px; padding: 3px 10px; border-radius: 99px; background: var(--muted); color: var(--muted-foreground); }
  .pill.approved { background: var(--success-surface); color: var(--success); }
  .pill.pending { background: var(--primary-surface); color: var(--primary-surface-foreground); }
  .pill.failed { background: var(--danger-surface); color: var(--danger-text); }
</style>
