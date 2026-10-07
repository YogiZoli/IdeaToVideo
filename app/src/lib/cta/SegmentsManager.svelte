<script lang="ts">
  // SegmentsManager: the Identity's reusable comment-call segments
  // (docs/wizards/cta.md, DECISIONS 78). Each belongs to one keyword, at most
  // 30 s, at most one per keyword (Zoltan, 2026-10-07, D2): three rows (Cold,
  // Warm, Hot), five keyword cards each, with the segment's state, Replace and
  // Delete. A keyword without one is said by the narrator. Three ways in:
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
  const ORDER = ["cold", "warm", "hot"];
  const rows = $derived(ORDER.filter((id) => options.temperatures[id]).map((id) => ({ id, t: options.temperatures[id], words: options.keywords.filter((k) => k.temperature === id) })));
  const segOf = (k: string) => segments.find((s) => s.keyword === k) ?? null;
  const current = $derived(keyword ? segOf(keyword) : null);
  const stateOf = (s: CtaSegment | null) => (!s ? "none" : s.source === "upload" ? "uploaded" : "HeyGen");
  const lookId = $derived(app.identity?.avatar?.lookId ?? app.config?.avatar?.lookId ?? null);
  const narrator = $derived(app.config?.narrator ?? null);
  const temp = (k: string) => options.temperatures[options.keywords.find((x) => x.keyword === k)?.temperature ?? "cold"];
  // The keywords your comment calls use, marked in the picker.
  const inCta = $derived.by(() => {
    const out: Record<string, string[]> = {};
    for (const s of SLOT_IDS) if (cta?.slots[s]) (out[cta.slots[s]!] ??= []).push(options.slots[s].label);
    return out;
  });

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
    added = null;
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
  <p class="hint">A short clip you record once, that says one comment call itself, for example a full-screen avatar: "Comment GUIDE below". At most 30 seconds, one per keyword. Wherever a comment call uses that keyword, your clip plays and the narrator says nothing there. A keyword without a segment is said by the narrator.</p>
  {#if error}<ErrorBox message={error} context={{ step: "cta" }} />{/if}
  {#if Object.keys(inCta).length}<p class="hint">Outlined: the keywords your comment calls use now.</p>{/if}

  <div class="grid">
    {#each rows as row (row.id)}
      <div class="trow" style={`--dot: ${row.t.dot}; --surface: ${row.t.surface}; --ink: ${row.t.text}; --on-dot: ${row.id === "warm" ? "#1a1a1a" : "#ffffff"}`}>
        <b class="thead">{row.t.label}</b>
        <div class="cards">
          {#each row.words as k (k.keyword)}
            {@const g = segOf(k.keyword)}
            <div class="kcard" id={g ? `seg-${g.id}` : undefined} class:has={!!g} class:chosen={keyword === k.keyword} class:incta={!!inCta[k.keyword]} class:new={!!g && added?.id === g.id}>
              <span class="kw">{k.keyword}</span>
              <span class="state">{stateOf(g)}{g ? `, ${g.seconds} s` : ""}</span>
              <div class="acts">
                <button type="button" class="ghost" disabled={!!busy} onclick={() => choose(k.keyword)}>{g ? "Replace" : "Add"}</button>
                {#if g}<button type="button" class="ghost" disabled={!!busy} onclick={() => remove(g.id)}>Delete</button>{/if}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>

  {#if keyword}
    <h3>{current ? `Replace the ${keyword} segment` : `Add a segment for ${keyword}`}</h3>
    {#if current}<p class="hint">Now: {current.name}, {current.seconds} s{current.text ? `: "${current.text}"` : ""}. The new clip takes its place, the old one is deleted.</p>{/if}
      <label class="field"><span>Name (optional)</span><input type="text" maxlength="60" bind:value={name} placeholder={`${keyword} with my avatar`} /></label>
  <p class="for">Choose one way</p>
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
  {#if busy}<p class="busy">{busy}</p>{/if}
  {#if added}<p class="saved">{added.message}</p>{/if}
</section>

<style>
  .grid { display: grid; gap: 8px; }
  .trow { display: grid; grid-template-columns: 56px 1fr; gap: 8px; align-items: center; padding: 8px; border-radius: 8px; background: var(--surface); }
  .thead { color: var(--ink); }
  .cards { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
  .kcard { display: grid; gap: 4px; padding: 8px; border-radius: 8px; border: 1px solid color-mix(in srgb, var(--dot) 30%, transparent); background: var(--background, #fff); }
  .kcard.has { border-color: var(--dot); }
  .kcard.incta { outline: 2px dashed var(--dot); outline-offset: 1px; }
  .kcard.chosen { outline: 2px solid var(--dot); }
  .kcard.new { background: var(--success-surface, #e7f6ec); }
  .kw { font: 700 13px ui-monospace, "JetBrains Mono", monospace; color: var(--ink); }
  .kcard.has .kw { display: inline-block; justify-self: start; padding: 1px 8px; border-radius: 999px; background: var(--dot); color: var(--on-dot); }
  .state { font-size: 12px; color: var(--muted-foreground, #666); }
  .acts { display: flex; gap: 4px; flex-wrap: wrap; }
  .acts button { padding: 2px 8px; font-size: 12px; }
  @media (max-width: 760px) { .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
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
