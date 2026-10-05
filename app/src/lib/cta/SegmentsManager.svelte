<script lang="ts">
  // SegmentsManager: the Identity's reusable comment-call segments
  // (docs/wizards/cta.md, DECISIONS 78). Each belongs to one keyword, at most
  // 30 s, at most 3 per keyword. Two ways in: upload a video (no key, no
  // cost), or make it here: the narrator reads the sentence, HeyGen makes a
  // full-frame avatar video on it (HeyGen credits).
  import { open } from "@tauri-apps/plugin-dialog";
  import type { AppState, CtaSegment, CtaState } from "../api";
  import { runner, errorText, importSegment } from "../api";
  import { log } from "../logger";
  import ErrorBox from "../ErrorBox.svelte";
  import KeywordPicker from "./KeywordPicker.svelte";

  let { app, options, segments = $bindable([]) }: { app: AppState; options: CtaState["options"]; segments?: CtaSegment[] } = $props();

  let keyword = $state<string | null>(null);
  let name = $state("");
  let text = $state("");
  let busy = $state("");
  let error = $state("");
  let notice = $state("");

  const info = $derived(options.keywords.find((k) => k.keyword === keyword) ?? null);
  const full = $derived(!!keyword && segments.filter((s) => s.keyword === keyword).length >= 3);
  const lookId = $derived(app.identity?.avatar?.lookId ?? app.config?.avatar?.lookId ?? null);
  const narrator = $derived(app.config?.narrator ?? null);
  const temp = (k: string) => options.temperatures[options.keywords.find((x) => x.keyword === k)?.temperature ?? "cold"];

  $effect(() => {
    if (info && !text) text = `Comment ${info.keyword} below and I'll send you ${info.gets}.`;
  });

  async function reload() {
    segments = (await runner<{ segments: CtaSegment[] }>("segments-list", {})).segments;
  }

  async function upload() {
    error = "";
    notice = "";
    const path = await open({ multiple: false, directory: false, filters: [{ name: "Video", extensions: ["mp4", "mov", "webm", "m4v"] }] });
    if (typeof path !== "string") return;
    busy = "Checking the video...";
    try {
      const file = await importSegment(path);
      const r = await runner<{ segment: CtaSegment }>("segment-add", { file, keyword, name });
      notice = `Added: ${r.segment.name}, ${r.segment.seconds} s.`;
      log("segment_added", { keyword, source: "upload", seconds: r.segment.seconds });
      name = "";
      await reload();
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = "";
    }
  }

  async function makeWithHeygen() {
    error = "";
    notice = "";
    try {
      busy = "The narrator reads the sentence...";
      const v = await runner<{ audio: string; seconds: number }>("segment-voice", { narrator, text, language: app.config?.channel.contentLanguage ?? "en" });
      busy = `HeyGen makes the video (${v.seconds} s). This takes a few minutes...`;
      const r = await runner<{ segment: CtaSegment }>("segment-make", { service: "heygen", lookId, audio: v.audio, keyword, name });
      notice = `Made with HeyGen: ${r.segment.name}, ${r.segment.seconds} s.`;
      log("segment_added", { keyword, source: "heygen", seconds: r.segment.seconds });
      name = "";
      await reload();
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = "";
    }
  }

  async function remove(id: string) {
    error = "";
    try {
      await runner("segment-remove", { id });
      log("segment_removed", {});
      await reload();
    } catch (e) {
      error = errorText(e);
    }
  }
</script>

<section class="card">
  <h2>Your segments</h2>
  <p class="hint">A short clip you record once, that says one comment call itself, for example a full-screen avatar: "Comment GUIDE below". At most 30 seconds, at most 3 per keyword. A place in the video then plays your segment instead of the narrator saying the call.</p>
  {#if error}<ErrorBox message={error} context={{ step: "cta" }} />{/if}
  {#if notice}<p class="good">{notice}</p>{/if}

  {#if segments.length}
    <ul class="list">
      {#each segments as s (s.id)}
        {@const t = temp(s.keyword)}
        <li>
          <span class="chip" style={`--dot: ${t.dot}; --on-dot: ${t.label === "Warm" ? "#1a1a1a" : "#ffffff"}`}>{s.keyword}</span>
          <b>{s.name}</b>
          <span class="hint">{s.seconds} s, {s.source === "heygen" ? "made with HeyGen" : "uploaded"}{s.lastUsedAt ? `, last used ${new Date(s.lastUsedAt).toLocaleDateString()}` : ", not used yet"}</span>
          <span class="spacer"></span>
          <button type="button" class="ghost" disabled={!!busy} onclick={() => remove(s.id)}>Remove</button>
        </li>
      {/each}
    </ul>
  {:else}
    <p>No segments yet.</p>
  {/if}

  <h3>Add a segment</h3>
  <p class="for">1. Which keyword does it say?</p>
  <KeywordPicker keywords={options.keywords} temperatures={options.temperatures} value={keyword} compact onpick={(k) => { keyword = k; text = ""; }} />
  {#if keyword}
    {#if full}
      <p class="hint">{keyword} already has 3 segments. Remove one to add another.</p>
    {:else}
      <label class="field"><span>2. Name (optional)</span><input type="text" maxlength="60" bind:value={name} placeholder={`${keyword} with my avatar`} /></label>
      <p class="for">3. Upload it, or make it here</p>
      <div class="row">
        <button type="button" class="primary" disabled={!!busy} onclick={upload}>Upload a video</button>
        <span class="hint">MP4, MOV or WebM, at most 30 s. No key, no cost.</span>
      </div>
      <div class="heygen">
        <label class="field"><span>The sentence it says</span><textarea rows="2" bind:value={text}></textarea></label>
        <div class="row">
          <button type="button" disabled={!!busy || !lookId || !narrator || !text.trim()} onclick={makeWithHeygen}>Make it with HeyGen</button>
          <span class="hint">{!lookId ? "Choose an avatar in Settings, Voice and avatar first." : "Your narrator voice reads it, HeyGen makes a full-frame avatar video on it. Uses HeyGen credits."}</span>
        </div>
      </div>
    {/if}
  {/if}
  {#if busy}<p class="hint">{busy}</p>{/if}
</section>

<style>
  .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .list li { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px solid var(--border); }
  .chip { padding: 2px 10px; border-radius: 999px; background: var(--dot); color: var(--on-dot); font: 700 13px ui-monospace, "JetBrains Mono", monospace; }
  .spacer { flex: 1; }
  .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .field { display: grid; gap: 4px; max-width: 640px; }
  .heygen { display: grid; gap: 8px; padding: 10px; border: 1px dashed var(--border); border-radius: 8px; max-width: 760px; }
  .for { margin: 8px 0 0; font-weight: 600; }
  h3 { margin: 16px 0 0; font-size: 15px; }
</style>
