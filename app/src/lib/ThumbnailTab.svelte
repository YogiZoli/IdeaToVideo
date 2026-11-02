<script lang="ts">
  // ThumbnailTab: step 7, after Your video (DECISIONS 131). With my face or
  // no face; one button makes 3 variants with the Gemini key (the price is
  // asked first); each shows full size and at phone size; the words can be
  // changed for free; one is picked and goes into the Video Publishing Card,
  // so Send to Publishing carries it. Regenerate keeps the old pictures in
  // the video's thumbnail/older folder.
  import { onDestroy } from "svelte";
  import { ask } from "@tauri-apps/plugin-dialog";
  import { convertFileSrc } from "@tauri-apps/api/core";
  import ErrorBox from "./ErrorBox.svelte";
  import Progress from "./Progress.svelte";
  import PhotosPanel from "./PhotosPanel.svelte";
  import type { AppState } from "./api";
  import { runner, onProgress, errorText } from "./api";
  import { running } from "./work.svelte";
  import { log } from "./logger";
  import type { TabId } from "./tabs";

  type Variant = { slot: number; words: string; accent: number; picture: string; file: string; bytes: number; textRatio: number; accentRatio: number; withFace: boolean; model: string; test: boolean };
  type State = {
    withFace: boolean;
    model: string;
    variants: Variant[];
    chosen: { slot: number; words: string; test?: boolean } | null;
    chosenFile: string | null;
    spentUsd: number;
    photos: { name: string; file: string }[];
    models: { id: string; label: string; usdPerImage: number; test: boolean; free?: boolean }[];
    title: string;
    hasVideo: boolean;
    maxWords: number;
    errors?: { slot: number; message: string }[];
  };
  type Estimate = { usd: number; images: number; test?: boolean; text: string };

  let { app, dir, hasVideo, changed, goto, openPage }: { app: AppState; dir: string; hasVideo: boolean; changed: () => Promise<void>; goto: (id: TabId) => void; openPage?: (page: "cta" | "connections" | "voice") => void } = $props();

  const COMMANDS = ["thumbnail-make", "thumbnail-words"];
  const job = $derived(running(dir, COMMANDS));
  let st = $state<State | null>(null);
  let busy = $state(false);
  const locked = $derived(busy || !!job);
  let error = $state("");
  let note = $state("");
  let step = $state("");
  let stamp = $state(Date.now());
  let withFace = $state(false);
  let model = $state("");
  let photoCount = $state(0);
  let drafts = $state<Record<number, string>>({});

  const isTest = $derived(st?.models.find((m) => m.id === model)?.test ?? false);
  // the maker without AI: no key, no picture from Gemini
  const isFree = $derived(st?.models.find((m) => m.id === model)?.free ?? false);
  const noKeyNeeded = $derived(isTest || isFree);
  const hasKey = $derived(!!app.keys["gemini"]);
  const usd = (n: number) => `$${n.toFixed(2)}`;

  async function load() {
    try {
      st = await runner<State>("thumbnail-state", { projectDir: dir });
      withFace = st.withFace && st.photos.length > 0;
      model ||= st.model;
      photoCount = st.photos.length;
      drafts = Object.fromEntries(st.variants.map((v) => [v.slot, v.words]));
    } catch (e) {
      error = errorText(e);
    }
  }
  $effect(() => {
    if (dir) load();
  });
  let hadJob = false;
  $effect(() => {
    if (job) hadJob = true;
    else if (hadJob && !busy) {
      hadJob = false;
      stamp = Date.now();
      load();
    }
  });

  const unlisten = onProgress((p) => {
    if (p.command !== "thumbnail-make") return;
    const s = p.progress;
    if (s.step === "ideas") step = "Writing the words and picture ideas...";
    if (s.step === "repairing") step = "Fixing the words (at most 4 per picture)...";
    if (s.step === "picture") step = `${noKeyNeeded ? "Making picture" : "Gemini is drawing picture"} ${s.n} of ${s.of}...`;
    if (s.step === "compose") step = `Putting the words on picture ${s.n} of ${s.of}...`;
    if (s.step === "retry") step = typeof s.message === "string" ? s.message : "Gemini is busy, trying again...";
  });
  onDestroy(() => unlisten.then((f) => f()));

  async function make(slots: number[] | null = null) {
    error = "";
    note = "";
    let e: Estimate;
    try {
      e = (await runner<{ estimate: Estimate }>("thumbnail-estimate", { projectDir: dir, withFace, model, ...(slots ? { slots } : {}) })).estimate;
    } catch (x) {
      error = errorText(x);
      return;
    }
    const n = e.images;
    const label = st?.models.find((m) => m.id === model)?.label ?? model;
    const what = e.test
      ? `Make ${n} test thumbnail${n === 1 ? "" : "s"}? They are free test patterns, made on this computer.`
      : `Make ${n} thumbnail${n === 1 ? "" : "s"} ${withFace ? "with your face" : "with no face"}, with ${label}? It costs ${e.text}, paid with your Gemini key. ${slots ? "The old picture is kept in the video's thumbnail/older folder." : st?.variants.length ? "The pictures you have now are kept in the video's thumbnail/older folder." : ""}`;
    if (!(await ask(what, { title: "Thumbnails", kind: "info" }))) return;
    log("thumbnail_make", { images: n, usd: e.usd, face: withFace, model, test: !!e.test });
    busy = true;
    step = "Starting...";
    try {
      const r = await runner<State & { spent: number }>("thumbnail-make", { projectDir: dir, service: "gemini", withFace, model, ...(slots ? { slots } : {}) });
      st = r;
      drafts = Object.fromEntries(r.variants.map((v) => [v.slot, v.words]));
      stamp = Date.now();
      const failed = r.errors ?? [];
      note = `${n - failed.length} of ${n} made${e.test ? "" : `, about ${usd(r.spent)}`}.${failed.length ? ` Failed: ${failed.map((f) => `${f.slot} (${f.message})`).join("; ")}` : ""}`;
    } catch (x) {
      error = errorText(x);
      await load();
    } finally {
      busy = false;
      step = "";
    }
  }

  async function saveWords(v: Variant) {
    const words = (drafts[v.slot] ?? "").trim();
    if (!words || words === v.words) return;
    error = "";
    busy = true;
    step = "Putting the new words on the picture...";
    try {
      st = await runner<State>("thumbnail-words", { projectDir: dir, slot: v.slot, words });
      stamp = Date.now();
      log("thumbnail_words", { slot: v.slot });
      if (st.chosen?.slot === v.slot) note = "The words changed. Press Pick again to put this version in the publishing card.";
    } catch (x) {
      error = errorText(x);
    } finally {
      busy = false;
      step = "";
    }
  }

  async function pick(v: Variant) {
    error = "";
    try {
      const r = await runner<State & { cardFile: string | null }>("thumbnail-pick", { projectDir: dir, slot: v.slot });
      st = r;
      log("thumbnail_pick", { slot: v.slot, test: v.test });
      note = r.cardFile ? "Picked. It is in the publishing card now: Send to Publishing on the Your video tab sends it with the video's texts." : "Picked. Render the video, then it goes into the publishing card.";
      await changed();
    } catch (x) {
      error = errorText(x);
    }
  }

  const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
</script>

<section class="card">
  <h2>7. Thumbnail</h2>
  {#if !hasVideo}
    <p class="hint">Render the video first, then make its thumbnail here. <button type="button" class="link" onclick={() => goto("video")}>Open Your video</button></p>
  {:else if st}
    <p class="hint">Three thumbnails for "{st.title || "this video"}". The AI draws the picture; the app puts at most {st.maxWords} words on it in your Brand font and colours, with strong contrast, so it reads at phone size.</p>
    {#if job}<Progress command={job} project={dir} label={step || "Making the thumbnails"} />{:else if busy && step}<p class="hint">{step}</p>{/if}

    <div class="opts">
      <fieldset>
        <legend>Face</legend>
        <label class="radio"><input type="radio" name="face" value={true} bind:group={withFace} disabled={locked || photoCount === 0} /> With my face</label>
        <label class="radio"><input type="radio" name="face" value={false} bind:group={withFace} disabled={locked} /> No face</label>
      </fieldset>
      <label class="model">
        <span>Picture model</span>
        <select bind:value={model} disabled={locked}>
          {#each st.models as m (m.id)}<option value={m.id}>{m.label}{m.test ? "" : `, about $${m.usdPerImage.toFixed(3)} a picture`}</option>{/each}
        </select>
      </label>
    </div>
    {#if photoCount === 0}
      <p class="hint">"With my face" needs a photo of you, added once for this Identity:</p>
    {/if}
    {#if photoCount === 0 || withFace}
      <PhotosPanel compact changed={(n) => { photoCount = n; if (!n) withFace = false; }} />
    {/if}
    {#if !noKeyNeeded && !hasKey}
      <p class="warn">The thumbnails use your Gemini key, and none is saved. <button type="button" class="link" onclick={() => openPage?.("connections")}>Add it in Settings, Connections</button>. Picture models need billing turned on for the key in Google AI Studio.</p>
    {/if}

    <div class="bar">
      <button type="button" class="primary" disabled={locked || !st.title || (!noKeyNeeded && !hasKey) || (withFace && photoCount === 0)} onclick={() => make(null)}>{st.variants.length ? "Regenerate all 3" : "Make 3 thumbnails"}</button>
      {#if st.spentUsd > 0}<span class="hint">Spent on this video's thumbnails: about {usd(st.spentUsd)}</span>{/if}
    </div>
    {#if !st.title}<p class="warn">The video has no YouTube title yet. <button type="button" class="link" onclick={() => goto("script")}>Choose one on the Script tab</button>.</p>{/if}
    {#if note}<p class="saved">{note}</p>{/if}
    {#if error}<ErrorBox message={error} context={{ step: "thumbnail" }} />{/if}

    {#if st.variants.length}
      <ul class="variants">
        {#each st.variants as v (v.slot)}
          {@const picked = st.chosen?.slot === v.slot}
          <li class:picked>
            <img class="full" src={convertFileSrc(v.file) + `?t=${stamp}`} alt={`Thumbnail ${v.slot}: ${v.words}`} />
            <div class="side">
              <div class="phone">
                <span class="label">At phone size</span>
                <img class="small" src={convertFileSrc(v.file) + `?t=${stamp}`} alt="" />
              </div>
              <label class="words">
                <span>Words on the image ({wordCount(drafts[v.slot] ?? "")} of {st.maxWords})</span>
                <input bind:value={drafts[v.slot]} maxlength="28" disabled={locked} onkeydown={(e) => e.key === "Enter" && saveWords(v)} />
              </label>
              {#if (drafts[v.slot] ?? "").trim() !== v.words}
                <button type="button" disabled={locked || wordCount(drafts[v.slot] ?? "") > st.maxWords || !(drafts[v.slot] ?? "").trim()} onclick={() => saveWords(v)}>Use these words (free)</button>
              {/if}
              {#if v.test}<p class="hint">Test picture, not for a real video.</p>{/if}
              <div class="acts">
                <button type="button" class:primary={!picked} disabled={locked} onclick={() => pick(v)}>{picked ? "Picked, pick again" : "Pick this one"}</button>
                <button type="button" class="ghost" disabled={locked || (!noKeyNeeded && !hasKey) || (withFace && photoCount === 0)} onclick={() => make([v.slot])}>Regenerate</button>
              </div>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
    {#if st.chosen}
      <p class="hint">Picked: "{st.chosen.words}". <button type="button" class="link" onclick={() => goto("video")}>Send to Publishing on Your video</button></p>
    {/if}
  {:else if error}
    <ErrorBox message={error} context={{ step: "thumbnail" }} />
  {:else}
    <p class="hint">Loading...</p>
  {/if}
</section>

<style>
  .opts { display: flex; gap: 24px; flex-wrap: wrap; align-items: flex-end; margin: 8px 0; }
  fieldset { border: 0; padding: 0; margin: 0; display: flex; gap: 14px; align-items: center; }
  legend { font-weight: 600; margin-bottom: 4px; }
  .model { display: grid; gap: 4px; }
  .model span { font-weight: 600; }
  .bar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin: 10px 0; }
  .variants { list-style: none; padding: 0; margin: 12px 0 0; display: grid; gap: 14px; }
  .variants li { display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: 14px; padding: 10px; border: 2px solid var(--border); border-radius: 12px; }
  .variants li.picked { border-color: var(--primary); }
  .full { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 8px; }
  .side { display: grid; gap: 10px; align-content: start; }
  .phone { display: grid; gap: 4px; }
  .label, .words span { font-size: 12px; color: var(--muted-foreground); }
  /* the size of a thumbnail in YouTube's phone list */
  .small { width: 168px; height: 94px; object-fit: cover; border-radius: 4px; }
  .words { display: grid; gap: 4px; }
  .acts { display: flex; gap: 8px; flex-wrap: wrap; }
  @media (max-width: 860px) {
    .variants li { grid-template-columns: 1fr; }
  }
</style>
