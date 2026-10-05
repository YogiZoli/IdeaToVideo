<script lang="ts">
  // Gate 4: build the video from the approved scene table, check it (0 errors),
  // show one still per scene (click to enlarge, arrows to page), approve, then
  // render once, locally, into the project's out/ folder, with captions (.srt)
  // and the YouTube chapter list next to it. The page says what this step is
  // for, what to look for and what comes next (Zoltan's feedback, 2026-09-30).
  import { convertFileSrc } from "@tauri-apps/api/core";
  import { revealItemInDir } from "@tauri-apps/plugin-opener";
  import { onDestroy } from "svelte";
  import ErrorBox from "./ErrorBox.svelte";
  import Progress from "./Progress.svelte";
  import type { Gate } from "./api";
  import { runner, onProgress, errorText, exportPublish } from "./api";
  import { save as saveDialog } from "@tauri-apps/plugin-dialog";
  import { log } from "./logger";

  type Still = { scene: number; at: number; file: string };
  type Video = { file: string; seconds?: number; renderSeconds?: number; srt?: string | null; chapters?: string | null; chaptersNote?: string | null; extrasError?: string; publishFile?: string | null; comments?: string | null };
  let { dir, gate, scenesApproved, latest, stills = [], look = "blue-professional", changed }: { dir: string; gate?: Gate; scenesApproved: boolean; latest?: Video | null; stills?: Still[]; look?: string; changed: () => Promise<void> } = $props();

  let open = $state<number | null>(null); // index of the enlarged still
  const src = (f: string) => convertFileSrc(f) + `?t=${stamp}`;
  const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  function onKey(e: KeyboardEvent) {
    const i = open;
    if (i === null) return;
    if (e.key === "Escape") open = null;
    if (e.key === "ArrowRight") open = Math.min(stills.length - 1, i + 1);
    if (e.key === "ArrowLeft") open = Math.max(0, i - 1);
  }

  const MINUTES_PER_VIDEO_MINUTE = 2.2; // measured, phase 2 pilot

  let busy = $state(false);
  let step = $state("");
  let error = $state("");
  let seconds = $state<number | null>(null);
  let stamp = $state(Date.now());
  let quality = $state("standard");
  let rendering = $state(false);
  let rendered = $state<Video | null>(null);
  // this session's render, else the newest one on disk (after a restart or an
  // Autopilot run)
  const video = $derived(rendered ?? latest ?? null);
  let copied = $state(false);

  async function copyChapters() {
    if (!video?.chapters) return;
    await navigator.clipboard.writeText(video.chapters);
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }

  // The publishing data (runner/gates/render/publish.mjs): saved next to the
  // video anyway; Export puts a copy where the user wants it.
  let exported = $state("");
  async function exportData() {
    if (!video?.publishFile) return;
    const name = video.publishFile.split(/[\\/]/).pop()!;
    const path = await saveDialog({ defaultPath: name, filters: [{ name: "Publishing data", extensions: ["json"] }] });
    if (typeof path !== "string") return;
    try {
      exported = `Saved: ${await exportPublish(video.publishFile, path)}`;
      log("publish_exported", {});
    } catch (e) {
      exported = errorText(e);
    }
  }
  let copiedComments = $state(false);
  async function copyComments() {
    if (!video?.comments) return;
    await navigator.clipboard.writeText(video.comments);
    copiedComments = true;
    setTimeout(() => (copiedComments = false), 2000);
  }

  const built = $derived(gate?.state === "pending" || gate?.state === "approved");

  const unlisten = onProgress((p) => {
    const s = p.progress;
    if (p.command === "build-video") {
      step = ({ build: "Building the video...", lint: "Checking the build (lint)...", check: "Checking layout, motion and contrast...", snapshots: `Taking ${s.frames ?? ""} stills...`, sheet: "Making the contact sheet..." } as Record<string, string>)[String(s.step)] ?? step;
    }
  });
  onDestroy(() => unlisten.then((f) => f()));

  async function build() {
    busy = true;
    error = "";
    step = "Starting...";
    try {
      const r = await runner<{ seconds: number }>("build-video", { projectDir: dir, look });
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
    try {
      rendered = await runner<Video>("render-video", { projectDir: dir, quality });
      await changed();
    } catch (e) {
      error = errorText(e);
    } finally {
      rendering = false;
      busy = false;
    }
  }

  const length = $derived(seconds ?? (stills.length ? stills[stills.length - 1].at : null));
  const estimate = $derived(length ? Math.max(1, Math.round((length / 60) * MINUTES_PER_VIDEO_MINUTE)) : null);
</script>

<section class="card">
  <div class="head">
    <h2>4. Review and render</h2>
    {#if gate}<span class="pill {gate.state}">{gate.state}</span>{/if}
  </div>

  {#if !scenesApproved}
    <p class="hint">Approve the scene table first.</p>
  {:else}
    {#if gate?.state !== "approved"}
      <div class="explain">
        <p><strong>What this step is:</strong> a quick check before the render. The app builds your video from the scene table and tests it for cut-off text, contrast and timing. This takes about a minute; the render itself takes {estimate ? `about ${estimate} minute${estimate > 1 ? "s" : ""}` : "a few minutes"}, so a mistake is cheaper to catch here.</p>
        <p><strong>What you see:</strong> one picture per scene, as it looks just before the scene ends. Pictures do not move; the video does. Click a picture to see it large, use the arrow keys to page.</p>
        <p><strong>What to look for:</strong> text cut off or too small, an empty picture, a wrong word.</p>
        <p><strong>To change a scene:</strong> go back to 3. Scene table, swap the scene or edit its text, approve it, then build again here.</p>
        <p><strong>Next:</strong> approve the pictures, then render the video.</p>
      </div>
    {/if}
    <div class="actions">
      <button type="button" class="primary" disabled={busy} onclick={build}>{built ? "Build again" : "Build and check (Recommended)"}</button>
    </div>
    {#if busy && !rendering}<Progress command="build-video" label={step || "Building the video"} />{/if}
    {#if error}<ErrorBox message={error} context={{ step: "review" }} />{:else if gate?.state === "failed" && gate.error}<ErrorBox message={`Last attempt failed: ${gate.error}`} context={{ step: "review" }} />{/if}

    {#if built && stills.length}
      <div class="stills">
        {#each stills as s, i (s.file)}
          <button type="button" class="still" onclick={() => (open = i)} title="Scene {s.scene} at {clock(s.at)}: click to enlarge">
            <img src={src(s.file)} alt="Scene {s.scene}" loading="lazy" />
            <span>Scene {s.scene} · {clock(s.at)}</span>
          </button>
        {/each}
      </div>
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
      {#if rendering}<Progress command="render-video" label="Rendering the video" />{/if}
      {#if video}
        {#if video.renderSeconds}<p class="good">Done: {video.seconds} s of video in {video.renderSeconds} s.</p>{:else}<p class="good">Your latest video:</p>{/if}
        <!-- svelte-ignore a11y_media_has_caption -->
        <video controls src={convertFileSrc(video.file)}></video>
        {#if video.extrasError}<p class="hint">Captions and chapters could not be made: {video.extrasError}</p>{/if}
        <!-- Chapters and comment keywords belong to publishing (the publishing
             tool, the comment-reply tool), so they are not on this page: they
             wait in the publishing data, one click away (Zoltan, 2026-10-05). -->
        {#if video.publishFile}<p class="hint">Next to the video: the captions (.srt) and the publishing data for your publishing tool and your comment-reply tool (chapters with times, the script, the comment keywords with their times, your landing page).</p>{/if}
        {#if exported}<p class="hint">{exported}</p>{/if}
        <div class="actions">
          {#if video.publishFile}<button type="button" class="primary" onclick={exportData}>Export publishing data</button>{/if}
          <button type="button" onclick={() => revealItemInDir(video.file)}>Show in folder</button>
        </div>
        {#if video.chapters || video.comments}
          <details class="inside">
            <summary>What is in the publishing data</summary>
            {#if video.chapters}
              <span class="label">YouTube chapters</span>
              <pre class="chapters">{video.chapters}</pre>
              {#if video.chaptersNote}<p class="hint">{video.chaptersNote}</p>{/if}
            {/if}
            {#if video.comments}
              <span class="label">Comment keywords</span>
              <pre class="chapters">{video.comments}</pre>
            {/if}
            <div class="actions">
              {#if video.chapters}<button type="button" onclick={copyChapters}>{copied ? "Copied" : "Copy chapters"}</button>{/if}
              {#if video.comments}<button type="button" onclick={copyComments}>{copiedComments ? "Copied" : "Copy comment keywords"}</button>{/if}
            </div>
          </details>
        {/if}
      {/if}
    {/if}
  {/if}
</section>

<svelte:window onkeydown={onKey} />
{#if open !== null && stills[open]}
  <div class="lightbox" role="dialog" aria-modal="true" aria-label="Scene {stills[open].scene}">
    <button type="button" class="backdrop" aria-label="Close" onclick={() => (open = null)}></button>
    <figure>
      <img src={src(stills[open].file)} alt="Scene {stills[open].scene}" />
      <figcaption>
        <button type="button" disabled={open === 0} onclick={() => (open = Math.max(0, (open ?? 0) - 1))}>Previous</button>
        <span>Scene {stills[open].scene} of {stills.length} · {clock(stills[open].at)}</span>
        <button type="button" disabled={open === stills.length - 1} onclick={() => (open = Math.min(stills.length - 1, (open ?? 0) + 1))}>Next</button>
        <button type="button" onclick={() => (open = null)}>Close</button>
      </figcaption>
    </figure>
  </div>
{/if}

<style>
  .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  h2 { margin: 0; font-size: 17px; }
  .actions, .render { display: flex; justify-content: flex-end; align-items: center; gap: 8px; margin-top: 10px; }
  .grow { flex: 1; }
  .explain { background: var(--muted); border-radius: 8px; padding: 10px 14px; font-size: 14px; }
  .explain p { margin: 6px 0; }
  .stills { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px; margin-top: 12px; }
  .still { display: grid; gap: 4px; padding: 4px; border-radius: 8px; background: var(--muted); cursor: zoom-in; text-align: left; font-size: 12px; }
  .still img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 6px; }
  .lightbox { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; }
  .backdrop { position: absolute; inset: 0; background: rgb(0 0 0 / 0.75); border: 0; cursor: zoom-out; }
  figure { position: relative; margin: 0; width: min(92vw, 1400px); display: grid; gap: 8px; }
  figure img { width: 100%; border-radius: 8px; }
  figcaption { display: flex; gap: 8px; align-items: center; justify-content: center; color: white; }
  video { width: 100%; margin-top: 8px; border-radius: 8px; }
  .hint { color: var(--muted-foreground); font-size: 13px; }
  .good { color: var(--success); }
  .label { display: block; font-weight: 600; font-size: 14px; margin-top: 12px; }
  .chapters { background: var(--muted); padding: 10px; border-radius: 8px; font-size: 13px; white-space: pre-wrap; }
  .pill { font-size: 12px; padding: 3px 10px; border-radius: 99px; background: var(--muted); color: var(--muted-foreground); }
  .pill.approved { background: var(--success-surface); color: var(--success); }
  .pill.pending { background: var(--primary-surface); color: var(--primary-surface-foreground); }
  .pill.failed { background: var(--danger-surface); color: var(--danger-text); }
  .inside { margin-top: 8px; }
  .inside summary { cursor: pointer; color: var(--muted-foreground); font-size: 13px; }
</style>
