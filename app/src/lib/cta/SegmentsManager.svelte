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
  //   C. import a video already in your HeyGen account: on Settings, Import
  //      & Export (cta/HeygenImport.svelte, DECISIONS 101 and 119)
  // Where a segment plays, the narrator says no call: nothing is said twice.
  import { tick } from "svelte";
  import { open } from "@tauri-apps/plugin-dialog";
  import type { AppState, CtaProfile, CtaSegment, CtaSlot, CtaState } from "../api";
    import { runner, errorText, importSegment } from "../api";
  import { makeHeygenClip, callText } from "./clips";
  import { log } from "../logger";
  import ErrorBox from "../ErrorBox.svelte";

  let {
    app,
    options,
    cta = null,
    segments = $bindable([]),
    goto,
    except = [],
    grid = true,
    title = "Your segments",
    keyword = $bindable(null),
  }: {
    app: AppState;
    options: CtaState["options"];
    cta?: CtaProfile | null;
    segments?: CtaSegment[];
    goto?: (page: "transfer" | "voice") => void;
    /** Keywords shown elsewhere (the house three on the CTA page, D5). */
    except?: string[];
    /** false: no cards, only the add or replace form for `keyword`. */
    grid?: boolean;
    title?: string;
    keyword?: string | null;
  } = $props();

  // What a 30 s clip can say in full (runner/cta/segments.mjs SEGMENT_TEXT_MAX)
  const TEXT_MAX = 1500;
  let name = $state("");
  let said = $state("");
  let text = $state("");
  let busy = $state("");
  let error = $state("");
  let added = $state<{ id: string; message: string } | null>(null);

  const SLOT_IDS: CtaSlot[] = ["start", "middle", "end"];
  const info = $derived(options.keywords.find((k) => k.keyword === keyword) ?? null);
  const ORDER = ["cold", "warm", "hot"];
  const rows = $derived(ORDER.filter((id) => options.temperatures[id]).map((id) => ({ id, t: options.temperatures[id], words: options.keywords.filter((k) => k.temperature === id && !except.includes(k.keyword)) })));
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
    added = null;
  }
  // the sentence for HeyGen, whenever the keyword changes (here or outside)
  $effect(() => {
    const i = options.keywords.find((x) => x.keyword === keyword);
    text = i ? callText(i.keyword, cta?.offers?.[i.keyword] ?? i.gets) : "";
  });

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
      busy = "The narrator reads the sentence, then HeyGen makes the video. This takes a few minutes...";
      await done(await makeHeygenClip(app, keyword!, text, name), "made with HeyGen");
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

<section class="card" class:bare={!grid}>
  {#if grid}
  <h2>{title}</h2>
  <p class="hint">A short clip you record once, that says one comment call itself, for example a full-screen avatar: "Comment GUIDE below". At most 30 seconds, one per keyword. Wherever a comment call uses that keyword, your clip plays and the narrator says nothing there. A keyword without a segment is said by the narrator.</p>
  {#if Object.keys(inCta).length}<p class="hint">Outlined: the keywords your comment calls use now.</p>{/if}

  <div class="grid">
    {#each rows.filter((r) => r.words.length) as row (row.id)}
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
  {/if}
  {#if error}<ErrorBox message={error} context={{ step: "cta" }} />{/if}

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
          <span class="hint">{!lookId ? "Choose an avatar in Identity, Voice & Avatar first." : "Your narrator voice reads this sentence, HeyGen makes a full-frame avatar video on it. Uses HeyGen credits."}</span>
          <label class="field"><span>The sentence your avatar says</span><textarea rows="4" maxlength={TEXT_MAX} bind:value={text}></textarea><span class="hint">{text.length} / {TEXT_MAX} characters</span></label>
          <div class="row"><button type="button" disabled={!!busy || !lookId || !narrator || !text.trim()} onclick={makeWithHeygen}>Make it with HeyGen</button></div>
        </div>
      </div>
      <p class="hint">C. A video you already made in HeyGen: import it on <button type="button" class="link" onclick={() => goto?.("transfer")}>Settings, Import & Export</button>.</p>
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
  .link { border: none; background: none; padding: 0; color: var(--primary); text-decoration: underline; cursor: pointer; font-size: inherit; font-family: inherit; min-height: 0; }
  .way { display: grid; gap: 8px; align-content: start; padding: 12px; border: 1px solid var(--border); border-radius: 8px; }
  .for { margin: 8px 0 0; font-weight: 600; }
  .busy { font-weight: 600; }
  .saved { padding: 10px 12px; border-radius: 8px; background: var(--success-surface, #e7f6ec); color: var(--success, #1f7a3a); font-weight: 600; }
  h3 { margin: 16px 0 0; font-size: 15px; }
  .bare { border: none; padding: 0; background: none; box-shadow: none; }
  @media (max-width: 760px) { .ways { grid-template-columns: 1fr; } }
</style>
