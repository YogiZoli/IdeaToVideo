<script lang="ts">
  // The last tab, "Your video" (Zoltan, 2026-10-05, DECISIONS 85): the
  // render runs here (the Preview's "Approve and render" starts it), then the
  // finished video with everything to do with it: Download, a copy into the
  // Google Drive, OneDrive or Dropbox folder on this computer (no sign-in, no
  // API: the cloud's own app syncs it), Upload on YouTube (YouTube Studio
  // opens, the file is shown in its folder, the title, description and tags
  // are one click to copy; no Google sign-in from this app, DECISIONS 86),
  // the Video Publishing Card (Export card; DECISIONS 114), and the backup.
  // D7 (DECISIONS 119): the main button is "Send to Publishing"; the YouTube
  // texts stay open with Copy buttons; the files are in a closed "Files".
  import { convertFileSrc } from "@tauri-apps/api/core";
  import { revealItemInDir, openUrl } from "@tauri-apps/plugin-opener";
  import { save as saveDialog } from "@tauri-apps/plugin-dialog";
  import ErrorBox from "./ErrorBox.svelte";
  import Progress from "./Progress.svelte";
  import Needs from "./Needs.svelte";
  import ProjectBackup from "./ProjectBackup.svelte";
  import Advanced from "./Advanced.svelte";
  import type { AppState } from "./api";
  import { runner, errorText, exportCard, openPublishingLink, exportVideo, cloudFolders } from "./api";
  import { running } from "./work.svelte";
  import { log } from "./logger";
  import type { TabId } from "./tabs";
  import type { Series } from "./course/course";
  import { playlistLink } from "./course/course";

  type Youtube = { titles: string[]; title: string; summary: string; description: string; tags: string[] };
  type Video = { file: string; seconds?: number; renderSeconds?: number; srt?: string | null; chapters?: string | null; chaptersNote?: string | null; extrasError?: string; cardFile?: string | null; comments?: string | null; youtube?: Youtube | null; syntheticMedia?: boolean };

  let {
    app,
    dir,
    title,
    reviewApproved,
    latest,
    series = null,
    renderError = "",
    render,
    goto,
    connections,
  }: { app: AppState; dir: string; title: string; reviewApproved: boolean; latest: Video | null; series?: Series | null; renderError?: string; render: (quality: string) => void; goto: (t: TabId) => void; connections?: () => void } = $props();

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

  // YouTube: the packaging chosen at gate 1, the description by code
  // (DECISIONS 86).
  const yt = $derived(video?.youtube ?? null);
  let copied = $state("");
  async function copy(what: string, text: string) {
    await navigator.clipboard.writeText(text);
    copied = what;
    setTimeout(() => (copied = ""), 2000);
  }
  // One lesson of an imported course (DECISIONS 121): where it goes in the
  // course's playlist. The upload itself stays manual, in YouTube Studio.
  const playlist = $derived(playlistLink(series?.playlistUrl));
  function openYoutube() {
    if (!video) return;
    revealItemInDir(video.file);
    openUrl("https://studio.youtube.com/");
    log("youtube_open", {});
  }

  // Send to Publishing (DECISIONS 115): the card to the user's publishing
  // app. A sentence from the app (4xx) is shown as it is; no answer or a
  // server problem can be tried again.
  type Sent = { ok: boolean; retry?: boolean; message?: string; url?: string | null; updated?: boolean };
  let sent = $state<Sent | null>(null);
  let sending = $state(false);
  const pubUrl = $derived(app.app?.publishing?.url ?? "");
  const pubReady = $derived(!!pubUrl && !!app.keys["publishing"]);
  async function sendCard() {
    if (!video?.cardFile) return;
    sending = true;
    sent = null;
    try {
      sent = await runner<Sent>("card-send", { projectDir: dir, file: video.cardFile, url: pubUrl, service: "publishing" });
      log("card_sent", { ok: sent.ok, updated: !!sent.updated });
    } catch (e) {
      sent = { ok: false, retry: false, message: errorText(e) };
    } finally {
      sending = false;
    }
  }
  async function openSent() {
    if (!sent?.url) return;
    try {
      await openPublishingLink(sent.url);
    } catch (e) {
      sent = { ...sent, message: errorText(e) };
    }
  }

  let exported = $state("");
  async function exportData() {
    if (!video?.cardFile) return;
    const name = video.cardFile.split(/[\\/]/).pop()!;
    const path = await saveDialog({ defaultPath: name, filters: [{ name: "Publishing card", extensions: ["json"] }] });
    if (typeof path !== "string") return;
    try {
      exported = `Saved: ${await exportCard(video.cardFile, path)}`;
      log("card_exported", {});
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
          <button type="button" onclick={download}>Download</button>
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
        {#if series}
          <p class="playlist"><b>Playlist: position {series.playlistPosition}{series.playlistCount ? ` of ${series.playlistCount}` : ""}</b>{series.courseTitle ? ` in "${series.courseTitle}"` : ""}.
            {#if playlist}<button type="button" class="link" onclick={() => openUrl(playlist)}>{playlist}</button>{:else}This course has no playlist link yet.{/if}
            Upload the lessons in order, lesson 1 first, and add each one to the playlist at its position.</p>
        {/if}
        {#if video.syntheticMedia}<p class="synthetic">This video has AI-made B-roll clips. In the upload form, under "Altered or synthetic content", answer <b>Yes</b> if a clip looks real (a real-looking person, place or event). It is also noted in the publishing card.</p>{/if}
        {#if !yt}
          <p class="hint">No packaging yet: make the title, summary and tags on the Script tab, then the texts appear here.</p>
        {:else}
          <div class="copyrow"><span class="sub">Titles</span></div>
          {#each (yt.titles?.length ? yt.titles : [yt.title]) as t, i (i)}
            <div class="copyrow"><span>{t}{t === yt.title ? " (chosen)" : ""}</span><button type="button" class="ghost" onclick={() => copy(`title-${i}`, t)}>{copied === `title-${i}` ? "Copied" : "Copy"}</button></div>
          {/each}
          {#if yt.summary}
            <div class="copyrow top"><span class="sub">Summary</span><button type="button" class="ghost" onclick={() => copy("summary", yt.summary)}>{copied === "summary" ? "Copied" : "Copy"}</button></div>
            <p class="tags">{yt.summary}</p>
          {/if}
          <div class="copyrow top"><span class="sub">Description, with the chapters</span><button type="button" class="ghost" onclick={() => copy("description", yt.description)}>{copied === "description" ? "Copied" : "Copy"}</button></div>
          <pre>{yt.description}</pre>
          <div class="copyrow top"><span class="sub">Tags</span><button type="button" class="ghost" onclick={() => copy("tags", yt.tags.join(", "))}>{copied === "tags" ? "Copied" : "Copy"}</button></div>
          <p class="tags">{yt.tags.join(", ")}</p>
        {/if}
      </div>

      <details class="block">
        <summary class="label">Files</summary>
        <div class="row">
          <button type="button" class="ghost" onclick={() => revealItemInDir(video.file)}>Open MP4</button>
          {#if video.srt}<button type="button" class="ghost" onclick={() => revealItemInDir(video.srt!)}>Captions (.srt)</button>{/if}
          {#if video.chapters}<button type="button" class="ghost" onclick={() => revealItemInDir(video.file.replace(/\.mp4$/i, ".chapters.txt"))}>chapters.txt</button>{/if}
          {#if video.cardFile}<button type="button" class="ghost" onclick={() => revealItemInDir(video.cardFile!)}>Card (.card.json)</button>{/if}
          {#if video.cardFile}<button type="button" onclick={exportData}>Export card</button>{/if}
        </div>
        {#if exported}<p class="hint">{exported}</p>{/if}
      </details>

      {#if video.cardFile}
        <div class="block">
          <div class="bhead"><span class="label">Publishing</span></div>
          <p class="hint">The video's publishing card: chapters with times, the script, the comment keywords with their times, your landing page, and the title, summary and tags from the Script tab.</p>
          {#if !pubReady}<p class="hint">To send it, set the address and the token on {#if connections}<button type="button" class="link" onclick={connections}>Settings, Connections</button>{:else}Settings, Connections{/if}.</p>{/if}
          {#if sent?.ok}
            <p class="good">{sent.updated ? "Updated in Publishing." : "Sent to Publishing."} {#if sent.url}<button type="button" class="link" onclick={openSent}>{sent.url}</button>{/if}</p>
          {:else if sent}
            <p class="err">{sent.message}</p>
            {#if sent.retry}<button type="button" disabled={sending} onclick={sendCard}>Try again</button>{/if}
          {/if}
        </div>
      {/if}

      <details class="block">
        <summary class="label">Backup</summary>
        <ProjectBackup {app} {dir} />
      </details>
    {/if}

    <div class="actionbar">
      {#if rendering}
        <span class="say">Rendering. You can look at the other tabs, or close the window: the app keeps working in the corner of the taskbar.</span>
      {:else if video}
        <span class="say"><b>Your video is ready.</b> Send it to Publishing, or upload it with the texts above.</span>
      {:else}
        <span class="say">Render the approved preview into the final video.</span>
      {/if}
      {#if video && !rendering}
        <Advanced>
          <label class="q">Quality
            <select bind:value={quality}>
              <option value="draft">Draft (fast)</option>
              <option value="standard">Standard</option>
              <option value="high">High</option>
            </select>
          </label>
          <button type="button" disabled={!reviewApproved} onclick={() => render(quality)}>Render again</button>
        </Advanced>
        <button type="button" class="primary" disabled={!pubReady || sending || !video.cardFile} title={!video.cardFile ? "This video has no publishing card: render it again." : pubReady ? "" : "Set the address and the token on Settings, Connections"} onclick={sendCard}>{sending ? "Sending..." : "Send to Publishing"}</button>
      {:else}
        <label class="q">Quality
          <select bind:value={quality} disabled={rendering}>
            <option value="draft">Draft (fast)</option>
            <option value="standard">Standard</option>
            <option value="high">High</option>
          </select>
        </label>
        <button type="button" class="primary" disabled={rendering || !reviewApproved} onclick={() => render(quality)}>Render video</button>
      {/if}
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
  .synthetic { margin: 6px 0; padding: 8px 10px; border-radius: 8px; background: var(--warning-surface, var(--muted)); font-size: 13px; }
  .playlist .link { font: inherit; }
  .playlist { margin: 6px 0; padding: 8px 10px; border-radius: 8px; background: var(--muted); font-size: 13px; word-break: break-word; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .err { color: var(--danger, #b42318); font-weight: 600; }
  .link { background: none; border: none; padding: 0; color: var(--primary, #2563eb); text-decoration: underline; cursor: pointer; }
</style>
