<script lang="ts">
  // SegmentsManager: the Identity's reusable comment-call segments
  // (docs/wizards/cta.md, DECISIONS 78). Each belongs to one keyword, at most
  // 30 s, at most 3 per keyword. Two ways in, kept apart on the page:
  //   A. upload a clip you recorded (no key, no cost); optionally write what
  //      it says, for the captions and the publishing data
  //   B. make it here: your narrator reads the sentence, HeyGen makes a
  //      full-frame avatar video on it (HeyGen credits)
  // Where a segment plays, the narrator says no call: nothing is said twice.
  import { tick } from "svelte";
  import { open } from "@tauri-apps/plugin-dialog";
  import type { AppState, CtaProfile, CtaSegment, CtaSlot, CtaState } from "../api";
  import { runner, errorText, importSegment } from "../api";
  import { log } from "../logger";
  import ErrorBox from "../ErrorBox.svelte";
  import KeywordPicker from "./KeywordPicker.svelte";

  let { app, options, cta = null, segments = $bindable([]) }: { app: AppState; options: CtaState["options"]; cta?: CtaProfile | null; segments?: CtaSegment[] } = $props();

  let keyword = $state<string | null>(null);
  let name = $state("");
  let said = $state("");
  let text = $state("");
  let busy = $state("");
  let error = $state("");
  let added = $state<{ id: string; message: string } | null>(null);

  const SLOT_IDS: CtaSlot[] = ["start", "middle", "end"];
  const info = $derived(options.keywords.find((k) => k.keyword === keyword) ?? null);
  const full = $derived(!!keyword && segments.filter((s) => s.keyword === keyword).length >= 3);
  const lookId = $derived(app.identity?.avatar?.lookId ?? app.config?.avatar?.lookId ?? null);
  const narrator = $derived(app.config?.narrator ?? null);
  const temp = (k: string) => options.temperatures[options.keywords.find((x) => x.keyword === k)?.temperature ?? "cold"];
  // The keywords your comment calls use, marked in the picker.
  const inCta = $derived.by(() => {
    const out: Record<string, string[]> = {};
    for (const s of SLOT_IDS) if (cta?.slots[s]) (out[cta.slots[s]!] ??= []).push(options.slots[s].label);
    return out;
  });
  const clips = $derived(Object.fromEntries([...new Set(segments.map((g) => g.keyword))].map((k) => [k, `${segments.filter((g) => g.keyword === k).length} clip${segments.filter((g) => g.keyword === k).length === 1 ? "" : "s"}`])));

  function choose(k: string) {
    keyword = k;
    const i = options.keywords.find((x) => x.keyword === k);
    text = i ? `Comment ${i.keyword} below and I'll send you ${i.gets}.` : "";
    added = null;
  }

  async function done(seg: CtaSegment, how: string) {
    added = { id: seg.id, message: `Saved: ${seg.name}, ${seg.keyword}, ${seg.seconds} s, ${how}. It plays wherever a comment call uses ${seg.keyword}.` };
    log("segment_added", { keyword: seg.keyword, source: seg.source, seconds: seg.seconds, text: !!seg.text });
    name = "";
    said = "";
    segments = (await runner<{ segments: CtaSegment[] }>("segments-list", {})).segments;
    await tick();
    document.getElementById(`seg-${seg.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function upload() {
    error = "";
    added = null;
    const path = await open({ multiple: false, directory: false, filters: [{ name: "Video", extensions: ["mp4", "mov", "webm", "m4v"] }] });
    if (typeof path !== "string") return;
    busy = "Checking the video...";
    try {
      const file = await importSegment(path);
      const r = await runner<{ segment: CtaSegment }>("segment-add", { file, keyword, name, text: said });
      await done(r.segment, "uploaded");
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = "";
    }
  }

  async function makeWithHeygen() {
    error = "";
    added = null;
    try {
      busy = "The narrator reads the sentence...";
      const v = await runner<{ audio: string; seconds: number }>("segment-voice", { narrator, text, language: app.config?.channel.contentLanguage ?? "en" });
      busy = `HeyGen makes the video (${v.seconds} s). This takes a few minutes...`;
      const r = await runner<{ segment: CtaSegment }>("segment-make", { service: "heygen", lookId, audio: v.audio, keyword, name, text });
      await done(r.segment, "made with HeyGen");
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
      segments = (await runner<{ segments: CtaSegment[] }>("segments-list", {})).segments;
    } catch (e) {
      error = errorText(e);
    }
  }
</script>

<section class="card">
  <h2>Your segments</h2>
  <p class="hint">A short clip you record once, that says one comment call itself, for example a full-screen avatar: "Comment GUIDE below". At most 30 seconds, at most 3 per keyword. Wherever a comment call uses that keyword, your clip plays and the narrator says nothing there, so nothing is said twice.</p>
  {#if error}<ErrorBox message={error} context={{ step: "cta" }} />{/if}

  {#if segments.length}
    <ul class="list">
      {#each segments as s (s.id)}
        {@const t = temp(s.keyword)}
        <li id={`seg-${s.id}`} class:new={added?.id === s.id}>
          <span class="chip" style={`--dot: ${t.dot}; --on-dot: ${t.label === "Warm" ? "#1a1a1a" : "#ffffff"}`}>{s.keyword}</span>
          <b>{s.name}</b>
          <span class="hint">{s.seconds} s, {s.source === "heygen" ? "made with HeyGen" : "uploaded"}{s.lastUsedAt ? `, last used ${new Date(s.lastUsedAt).toLocaleDateString()}` : ", not used yet"}{s.text ? `: "${s.text}"` : ""}</span>
          {#if added?.id === s.id}<span class="newtag">Saved</span>{/if}
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
  {#if Object.keys(inCta).length}<p class="hint">Marked: the keywords your comment calls use now.</p>{/if}
  <KeywordPicker keywords={options.keywords} temperatures={options.temperatures} value={keyword} compact marks={clips} picked={inCta} onpick={choose} />
  {#if keyword}
    {#if full}
      <p class="hint">{keyword} already has 3 segments. Remove one to add another.</p>
    {:else}
      <label class="field"><span>2. Name (optional)</span><input type="text" maxlength="60" bind:value={name} placeholder={`${keyword} with my avatar`} /></label>
      <p class="for">3. Choose one way</p>
      <div class="ways">
        <div class="way">
          <b>A. Upload a clip you recorded</b>
          <span class="hint">MP4, MOV or WebM, at most 30 s. No key, no cost.</span>
          <label class="field"><span>What does it say? (optional, for the captions)</span><textarea rows="2" maxlength="400" bind:value={said} placeholder={`Comment ${keyword} below and ...`}></textarea></label>
          <div class="row"><button type="button" class="primary" disabled={!!busy} onclick={upload}>Upload a video</button></div>
        </div>
        <div class="way">
          <b>B. Make it with HeyGen</b>
          <span class="hint">{!lookId ? "Choose an avatar in Settings, Voice and avatar first." : "Your narrator voice reads this sentence, HeyGen makes a full-frame avatar video on it. Uses HeyGen credits."}</span>
          <label class="field"><span>The sentence your avatar says</span><textarea rows="2" maxlength="400" bind:value={text}></textarea></label>
          <div class="row"><button type="button" disabled={!!busy || !lookId || !narrator || !text.trim()} onclick={makeWithHeygen}>Make it with HeyGen</button></div>
        </div>
      </div>
    {/if}
  {/if}
  {#if busy}<p class="busy">{busy}</p>{/if}
  {#if added}<p class="saved">{added.message}</p>{/if}
</section>

<style>
  .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .list li { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border-bottom: 1px solid var(--border); border-radius: 6px; }
  .list li.new { background: var(--success-surface, #e7f6ec); }
  .newtag { font-size: 12px; font-weight: 700; color: var(--success, #1f7a3a); }
  .chip { padding: 2px 10px; border-radius: 999px; background: var(--dot); color: var(--on-dot); font: 700 13px ui-monospace, "JetBrains Mono", monospace; }
  .spacer { flex: 1; }
  .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .field { display: grid; gap: 4px; }
  .ways { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .way { display: grid; gap: 8px; align-content: start; padding: 12px; border: 1px solid var(--border); border-radius: 8px; }
  .for { margin: 8px 0 0; font-weight: 600; }
  .busy { font-weight: 600; }
  .saved { padding: 10px 12px; border-radius: 8px; background: var(--success-surface, #e7f6ec); color: var(--success, #1f7a3a); font-weight: 600; }
  h3 { margin: 16px 0 0; font-size: 15px; }
  @media (max-width: 760px) { .ways { grid-template-columns: 1fr; } }
</style>
