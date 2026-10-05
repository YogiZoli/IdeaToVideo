<script lang="ts">
  // The last tab, "Your video" (Zoltan, 2026-10-05, DECISIONS 85): the
  // render runs here (the Preview's "Approve and render" starts it), then the
  // finished video with everything to do with it: Download, a copy into the
  // Google Drive, OneDrive or Dropbox folder on this computer (no sign-in, no
  // API: the cloud's own app syncs it), Upload on YouTube (YouTube Studio
  // opens, the file is shown in its folder, the title, description and tags
  // are one click to copy; no Google sign-in from this app, DECISIONS 86),
  // the publishing data for the publishing tool, and the backup.
  import { convertFileSrc } from "@tauri-apps/api/core";
  import { revealItemInDir, openUrl } from "@tauri-apps/plugin-opener";
  import { save as saveDialog } from "@tauri-apps/plugin-dialog";
  import ErrorBox from "./ErrorBox.svelte";
  import Progress from "./Progress.svelte";
  import Needs from "./Needs.svelte";
  import ProjectBackup from "./ProjectBackup.svelte";
  import type { AppState } from "./api";
  import { runner, errorText, exportPublish, exportVideo, cloudFolders } from "./api";
  import { running } from "./work.svelte";
  import { log } from "./logger";
  import type { TabId } from "./tabs";

  type Youtube = { titles: string[]; title: string; summary: string; description: string; tags: string[] };
  type Video = { file: string; seconds?: number; renderSeconds?: number; srt?: string | null; chapters?: string | null; chaptersNote?: string | null; extrasError?: string; publishFile?: string | null; comments?: string | null; youtube?: Youtube | null };

  let {
    app,
    dir,
    title,
    reviewApproved,
    latest,
    renderError = "",
    render,
    goto,
  }: { app: AppState; dir: string; title: string; reviewApproved: boolean; latest: Video | null; renderError?: string; render: (quality: string) => void; goto: (t: TabId) => void } = $props();

  const rendering = $derived(!!running(dir, ["render-video"]));
  const video = $derived(latest);
  let quality = $state("standard");
  let error = $state("");
  let saved = $state("");

  const fileName = $derived(
    `${(title || "video")
      .replace(/[<>:"/\\|?*]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80)}.mp4`,
  );

  async function download() {
    if (!video) return;
    const path = await saveDialog({ defaultPath: fileName, filters: [{ name: "Video", extensions: ["mp4"] }] });
    if (typeof path !== "string") return;
    try {
      saved = `Saved: ${await exportVideo(video.file, path)}`;
      log("video_download", {});
    } catch (e) {
      error = errorText(e);
    }
  }

  let clouds = $state<{ label: string; path: string }[]>([]);
  cloudFolders()
    .then((c) => (clouds = c))
    .catch(() => {});
  async function toCloud(c: { label: string; path: string }) {
    if (!video) return;
    try {
      const out = await exportVideo(video.file, `${c.path}/IdeaToVideo/${fileName}`);
      saved = `Copied to ${c.label}: ${out}. ${c.label} uploads it by itself.`;
      log("video_to_cloud", { cloud: c.label });
    } catch (e) {
      error = errorText(e);
    }
  }

  // YouTube: the texts first (one small AI call, kept next to the video)
  let yt = $state<Youtube | null>(null);
  $effect(() => {
    yt = video?.youtube ?? null;
  });
  let ytBusy = $state(false);
  const ytJob = $derived(!!running(dir, ["youtube-texts"]));
  async function makeTexts() {
    if (!video) return;
    ytBusy = true;
    error = "";
    try {
      yt = await runner<Youtube>("youtube-texts", { projectDir: dir, file: video.file, llm: app.config!.llm });
    } catch (e) {
      error = errorText(e);
    } finally {
      ytBusy = false;
    }
  }
  let copied = $state("");
  async function copy(what: string, text: string) {
    await navigator.clipboard.writeText(text);
    copied = what;
    setTimeout(() => (copied = ""), 2000);
  }
  function openYoutube() {
    if (!video) return;
    revealItemInDir(video.file);
    openUrl("https://studio.youtube.com/");
    log("youtube_open", {});
  }

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
</script>

<section class="card">
  <h2>6. Your video</h2>

  {#if !reviewApproved && !video}
    <Needs text="The video is rendered from the approved preview. Approve the preview first." tab="preview" {goto} />
  {:else}
    {#if rendering}
      <Progress command="render-video" project={dir} label="Rendering your video" />
    {/if}
    {#if renderError}<ErrorBox message={renderError} context={{ step: "render" }} />{/if}
    {#if error}<ErrorBox message={error} context={{ step: "video" }} />{/if}

    {#if video && !rendering}
      {#if video.renderSeconds}<p class="good">Done: {video.seconds} s of video, rendered in {Math.round(video.renderSeconds / 60)} minute{Math.round(video.renderSeconds / 60) === 1 ? "" : "s"}.</p>{/if}
      <div class="main">
        <!-- svelte-ignore a11y_media_has_caption -->
        <video controls src={convertFileSrc(video.file)}></video>
        <div class="side">
          <span class="label">Keep it</span>
          <button type="button" class="primary" onclick={download}>Download</button>
          {#each clouds as c}<button type="button" onclick={() => toCloud(c)}>Save a copy to {c.label}</button>{/each}
          <button type="button" class="ghost" onclick={() => revealItemInDir(video.file)}>Show in folder</button>
          {#if saved}<p class="note">{saved}</p>{/if}
          {#if video.extrasError}<p class="hint">Captions and chapters could not be made: {video.extrasError}</p>{:else if video.srt}<p class="hint">The captions (.srt) go along with every copy.</p>{/if}
        </div>
      </div>

      <div class="block">
        <div class="bhead">
          <span class="label">Upload on YouTube</span>
          <button type="button" onclick={openYoutube}>Open YouTube Studio</button>
        </div>
        <p class="hint">YouTube Studio opens in your browser and the video is shown in its folder: drag it into the upload window. Copy the texts below into the upload form.</p>
        {#if !yt}
          <button type="button" disabled={ytBusy || ytJob} onclick={makeTexts}>{ytBusy || ytJob ? "Writing the texts..." : "Write title, description and tags (AI)"}</button>
        {:else}
          <span class="sub">Title (pick one)</span>
          {#each yt.titles as t}
            <div class="copyrow"><span>{t}</span><button type="button" class="ghost" onclick={() => copy(t, t)}>{copied === t ? "Copied" : "Copy"}</button></div>
          {/each}
          <div class="copyrow top"><span class="sub">Description, with the chapters</span><button type="button" class="ghost" onclick={() => copy("description", yt!.description)}>{copied === "description" ? "Copied" : "Copy"}</button></div>
          <pre>{yt.description}</pre>
          <div class="copyrow top"><span class="sub">Tags</span><button type="button" class="ghost" onclick={() => copy("tags", yt!.tags.join(", "))}>{copied === "tags" ? "Copied" : "Copy"}</button></div>
          <p class="tags">{yt.tags.join(", ")}</p>
          <button type="button" class="ghost" disabled={ytBusy || ytJob} onclick={makeTexts}>Write new ones</button>
        {/if}
      </div>

      <details class="block">
        <summary class="label">Publishing data and backup</summary>
        {#if video.publishFile}
          <p class="hint">For your publishing tool and your comment-reply tool: chapters with times, the script, the comment keywords with their times, your landing page.</p>
          <button type="button" onclick={exportData}>Export publishing data</button>
          {#if exported}<p class="hint">{exported}</p>{/if}
        {/if}
        <ProjectBackup {app} {dir} />
      </details>
    {/if}

    <div class="actionbar">
      {#if rendering}
        <span class="say">Rendering. You can look at the other tabs, or close the window: the app keeps working in the corner of the taskbar.</span>
      {:else if video}
        <span class="say"><b>Your video is ready.</b> Download it or upload it.</span>
      {:else}
        <span class="say">Render the approved preview into the final video.</span>
      {/if}
      <label class="q">Quality
        <select bind:value={quality} disabled={rendering}>
          <option value="draft">Draft (fast)</option>
          <option value="standard">Standard</option>
          <option value="high">High</option>
        </select>
      </label>
      <button type="button" class={video ? "" : "primary"} disabled={rendering || !reviewApproved} onclick={() => render(quality)}>{video ? "Render again" : "Render video"}</button>
    </div>
  {/if}
</section>

<style>
  h2 { margin: 0 0 10px; font-size: 17px; }
  .main { display: grid; grid-template-columns: minmax(0, 1fr) 240px; gap: 14px; align-items: start; }
  @media (max-width: 900px) { .main { grid-template-columns: 1fr; } }
  video { width: 100%; max-height: calc(100vh - 330px); min-height: 200px; border-radius: 8px; background: #000; }
  .side { display: grid; gap: 8px; }
  .block { margin-top: 14px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 10px; display: grid; gap: 6px; }
  .bhead { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .label { font-weight: 600; font-size: 14px; }
  .sub { font-weight: 600; font-size: 13px; }
  .copyrow { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 2px 0; border-bottom: 1px solid var(--border); font-size: 14px; }
  .copyrow.top { border: none; margin-top: 6px; }
  .copyrow button { min-height: 32px; }
  pre { margin: 0; background: var(--muted); padding: 10px; border-radius: 8px; font-size: 13px; white-space: pre-wrap; max-height: 200px; overflow: auto; }
  .tags { margin: 0; font-size: 13px; }
  summary { cursor: pointer; }
  .q { display: flex; gap: 6px; align-items: center; font-size: 13px; }
  .q select { min-height: 38px; padding: 4px 8px; }
  .good { color: var(--success); margin: 0 0 8px; }
  .note { color: var(--success); font-size: 13px; margin: 0; word-break: break-all; }
  .hint { color: var(--muted-foreground); font-size: 13px; margin: 0; }
</style>
