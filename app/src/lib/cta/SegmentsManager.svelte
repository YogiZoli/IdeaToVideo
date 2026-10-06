<script lang="ts">
  // SegmentsManager: the Identity's reusable comment-call segments
  // (docs/wizards/cta.md, DECISIONS 78). Each belongs to one keyword, at most
  // 30 s, at most 3 per keyword. Two ways in, kept apart on the page:
  //   A. upload a clip you recorded (no key, no cost); optionally write what
  //      it says, for the captions and the publishing data
  //   B. make it here: your narrator reads the sentence, HeyGen makes a
  //      full-frame avatar video on it (HeyGen credits)
  //   C. import a video already in your HeyGen account (made in its web
  //      app, or earlier): a read, no cost (DECISIONS 101)
  // Where a segment plays, the narrator says no call: nothing is said twice.
  import { tick } from "svelte";
  import { open } from "@tauri-apps/plugin-dialog";
  import type { AppState, CtaProfile, CtaSegment, CtaSlot, CtaState } from "../api";
  import { convertFileSrc } from "@tauri-apps/api/core";
  import { runner, errorText, importSegment } from "../api";
  import { avatarLooks } from "../avatars";
  import { chooseEngine } from "../avatarEngines";
  import { log } from "../logger";
  import ErrorBox from "../ErrorBox.svelte";
  import KeywordPicker from "./KeywordPicker.svelte";

  let { app, options, cta = null, segments = $bindable([]) }: { app: AppState; options: CtaState["options"]; cta?: CtaProfile | null; segments?: CtaSegment[] } = $props();

  // What a 30 s clip can say in full (runner/cta/segments.mjs SEGMENT_TEXT_MAX)
  const TEXT_MAX = 1500;
  let keyword = $state<string | null>(null);
  let name = $state("");
  let said = $state("");
  let text = $state("");
  let busy = $state("");
  let error = $state("");
  let added = $state<{ id: string; message: string } | null>(null);
  type HeygenVideo = { id: string; title: string; seconds: number | null; createdAt: number | string | null; image: string | null; tooLong: boolean; imported: boolean };
  let theirs = $state<HeygenVideo[] | null>(null);
  let pickedVideo = $state<string | null>(null);
  let search = $state("");

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
      const looks = await avatarLooks().catch(() => null);
      const lookEngines = looks ? [...looks.own.flatMap((g) => g.looks), ...looks.stock].find((l) => l.id === lookId)?.engines ?? [] : [];
      const r = await runner<{ segment: CtaSegment }>("segment-make", { service: "heygen", lookId, audio: v.audio, keyword, name, text, engine: chooseEngine(app.identity?.avatar?.engine ?? app.config?.avatar?.engine, lookEngines).engine, lookEngines });
      await done(r.segment, "made with HeyGen");
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = "";
    }
  }

  async function showTheirs() {
    error = "";
    busy = "Reading your HeyGen videos...";
    try {
      theirs = (await runner<{ videos: HeygenVideo[] }>("segment-import-list", { service: "heygen", title: search })).videos;
      pickedVideo = null;
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = "";
    }
  }

  async function importVideo() {
    error = "";
    added = null;
    const v = theirs?.find((x) => x.id === pickedVideo);
    if (!v) return;
    busy = "Downloading the video from HeyGen...";
    try {
      const r = await runner<{ segment: CtaSegment }>("segment-import", { service: "heygen", id: v.id, keyword, name, text: said });
      await done(r.segment, "imported from HeyGen");
      theirs = theirs?.map((x) => (x.id === v.id ? { ...x, imported: true } : x)) ?? null;
      pickedVideo = null;
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
          <span class="hint">{s.seconds} s, {s.source === "heygen" ? "made with HeyGen" : s.source === "heygen-import" ? "imported from HeyGen" : "uploaded"}{s.lastUsedAt ? `, last used ${new Date(s.lastUsedAt).toLocaleDateString()}` : ", not used yet"}{s.text ? `: "${s.text}"` : ""}</span>
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
          <label class="field"><span>What does it say? (optional, for the captions)</span><textarea rows="4" maxlength={TEXT_MAX} bind:value={said} placeholder={`Comment ${keyword} below and ...`}></textarea><span class="hint">{said.length} / {TEXT_MAX} characters, enough for the whole 30 s</span></label>
          <div class="row"><button type="button" class="primary" disabled={!!busy} onclick={upload}>Upload a video</button></div>
        </div>
        <div class="way">
          <b>B. Make it with HeyGen</b>
          <span class="hint">{!lookId ? "Choose an avatar in Settings, Voice and avatar first." : "Your narrator voice reads this sentence, HeyGen makes a full-frame avatar video on it. Uses HeyGen credits."}</span>
          <label class="field"><span>The sentence your avatar says</span><textarea rows="4" maxlength={TEXT_MAX} bind:value={text}></textarea><span class="hint">{text.length} / {TEXT_MAX} characters</span></label>
          <div class="row"><button type="button" disabled={!!busy || !lookId || !narrator || !text.trim()} onclick={makeWithHeygen}>Make it with HeyGen</button></div>
        </div>
      </div>
      <div class="way wide">
        <b>C. Import a video you already made in HeyGen</b>
        <span class="hint">Videos in your HeyGen account, made in its web app or earlier. Reading and downloading them costs nothing. Make the clip once, give it this keyword here, and it plays every time a comment call uses {keyword}. Only the videos HeyGen lists for the API appear: if yours is missing, download it in HeyGen and use A.</span>
        <div class="row"><input type="search" placeholder="Search by title (optional)" bind:value={search} onkeydown={(e) => e.key === "Enter" && showTheirs()} /><button type="button" disabled={!!busy} onclick={showTheirs}>{theirs ? "Search again" : "Show my HeyGen videos"}</button></div>
        {#if theirs}
          {#if theirs.length}
            <ul class="picks">
              {#each theirs as v (v.id)}
                <li class:on={pickedVideo === v.id} class:dim={v.tooLong || v.imported}>
                  <label>
                    <input type="radio" name="heygen-video" value={v.id} bind:group={pickedVideo} disabled={!!busy || v.tooLong} />
                    {#if v.image}<img src={convertFileSrc(v.image)} alt="" />{:else}<span class="noimg"></span>{/if}
                    <span class="meta"><b>{v.title || "Untitled"}</b><span class="hint">{v.createdAt && Number(v.createdAt) ? `${new Date(Number(v.createdAt) * 1000).toLocaleDateString()}, ` : ""}{v.seconds != null ? `${v.seconds} s` : "length unknown"}{v.tooLong ? `, longer than ${30} s: too long for a segment` : ""}{v.imported ? ", already imported" : ""}</span></span>
                  </label>
                </li>
              {/each}
            </ul>
            <label class="field"><span>What does it say? (optional, for the captions)</span><textarea rows="4" maxlength={TEXT_MAX} bind:value={said} placeholder={`Comment ${keyword} below and ...`}></textarea><span class="hint">{said.length} / {TEXT_MAX} characters, enough for the whole 30 s</span></label>
            <div class="row"><button type="button" class="primary" disabled={!!busy || !pickedVideo} onclick={importVideo}>Import as {keyword}</button></div>
          {:else}
            <p class="hint">{search.trim() ? "No finished video with this title." : "HeyGen listed no finished videos for this key. Download your clip in HeyGen and use A."}</p>
          {/if}
        {/if}
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
  .way.wide { grid-column: 1 / -1; }
  .picks { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; max-height: 280px; overflow: auto; }
  .picks li { border: 1px solid var(--border); border-radius: 8px; }
  .picks li.on { border-color: var(--primary, currentColor); }
  .picks li.dim { opacity: 0.6; }
  .picks label { display: flex; align-items: center; gap: 10px; padding: 6px 8px; cursor: pointer; }
  .picks img, .noimg { width: 72px; height: 41px; object-fit: cover; border-radius: 4px; background: var(--border); flex: none; }
  .meta { display: grid; }
  .way { display: grid; gap: 8px; align-content: start; padding: 12px; border: 1px solid var(--border); border-radius: 8px; }
  .for { margin: 8px 0 0; font-weight: 600; }
  .busy { font-weight: 600; }
  .saved { padding: 10px 12px; border-radius: 8px; background: var(--success-surface, #e7f6ec); color: var(--success, #1f7a3a); font-weight: 600; }
  h3 { margin: 16px 0 0; font-size: 15px; }
  @media (max-width: 760px) { .ways { grid-template-columns: 1fr; } }
</style>
