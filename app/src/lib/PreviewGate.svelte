<script lang="ts">
  // The Preview tab (gate "review" in the runner): build the video from the
  // approved scenes, check it (0 errors), and show one still per scene.
  // Zoltan, 2026-10-05: "how do I change a scene here, how do I give
  // feedback, like to Claude: you suggest X, I approve it or ask for Y?"
  // Click a still: the scene opens next to it, with what is said, the text on
  // screen (edit it), the other scenes of its kind (swap), and "Ask for a
  // change" in your own words (one small AI call). Changes collect; "Update
  // the preview" builds again with all of them (about a minute). A short
  // guide on the page says this, with or without changes.
  import { convertFileSrc } from "@tauri-apps/api/core";
  import ErrorBox from "./ErrorBox.svelte";
  import Advanced from "./Advanced.svelte";
  import Progress from "./Progress.svelte";
  import Needs from "./Needs.svelte";
  import type { AppState, Gate, Still } from "./api";
  import { runner, onProgress, errorText } from "./api";
  import { running } from "./work.svelte";
  import { onDestroy } from "svelte";
  import type { TabId } from "./tabs";
  import { llmFor } from "./llm";

  type Row = {
    index: number; start: number | null; duration: number | null; said: string; component: string; label: string; roleLabel: string;
    mainVar: string | null; mainText: string | null; shows: string; alternatives: { component: string; label: string }[];
    call: { keyword: string } | null;
  };
  type Table = { rows: Row[]; scenes?: { component: string; from: string; to?: string; vars: Record<string, unknown> }[] };

  let {
    app,
    dir,
    gates,
    stills = [],
    look = "blue-professional",
    changed,
    goto,
    render,
  }: {
    app: AppState;
    dir: string;
    gates: Record<string, Gate>;
    stills?: Still[];
    look?: string;
    changed: () => Promise<void>;
    goto: (t: TabId) => void;
    render: () => void;
  } = $props();

  const COMMANDS = ["build-video", "refill-scene", "save-scenes"];
  const job = $derived(running(dir, COMMANDS));
  const rendering = $derived(!!running(dir, ["render-video"]));
  let busy = $state(false);
  const locked = $derived(busy || !!job || rendering);

  const gate = $derived(gates.review);
  const scenesApproved = $derived(gates.scenes?.state === "approved");
  // scene edits made here leave the scene table "pending" (runner edited()):
  // the preview then waits for "Update the preview"
  const edited = $derived(gates.scenes?.state === "pending");
  const built = $derived(gate?.state === "pending" || gate?.state === "approved");
  const approved = $derived(gate?.state === "approved");

  let error = $state("");
  let step = $state("");
  let stamp = $state(Date.now());
  let table = $state<Table>({ rows: [] });
  let open = $state<number | null>(null); // index of the opened still
  let changes = $state(0);
  // the avatar step as it was before an edit here: edits reset it in the
  // runner, the update puts it back (the clips themselves stay)
  let avatarBefore = $state<string | null>(null);

  async function loadTable() {
    try {
      table = await runner<Table>("scene-table", { projectDir: dir });
    } catch {
      table = { rows: [] };
    }
  }
  $effect(() => {
    if (scenesApproved || edited) loadTable();
  });

  const unlisten = onProgress((p) => {
    const s = p.progress;
    if (p.command === "build-video") {
      step = ({ build: "Putting the scenes together...", lint: "Checking the video for errors...", check: "Checking layout, motion and contrast...", snapshots: `Taking ${s.frames ?? ""} stills...`, sheet: "Making the overview sheet..." } as Record<string, string>)[String(s.step)] ?? step;
    }
  });
  onDestroy(() => unlisten.then((f) => f()));

  const src = (f: string) => convertFileSrc(f) + `?t=${stamp}`;
  const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  // the scene a still shows: by its time
  const rowAt = (at: number) => table.rows.find((r) => r.start !== null && r.duration !== null && at >= r.start && at < r.start + Math.max(r.duration, 0.01) + 0.5) ?? null;
  const openRow = $derived(open !== null && stills[open] ? rowAt(stills[open].at) : null);

  let grid = $state<HTMLElement>();
  async function build() {
    busy = true;
    error = "";
    step = "Starting...";
    try {
      if (gates.scenes?.state !== "approved") await runner("approve-gate", { projectDir: dir, gate: "scenes" });
      if (avatarBefore === "approved") await runner("approve-gate", { projectDir: dir, gate: "avatar" });
      if (avatarBefore === "skipped") await runner("skip-gate", { projectDir: dir, gate: "avatar" });
      await runner("build-video", { projectDir: dir, look });
      changes = 0;
      avatarBefore = null;
      stamp = Date.now();
      await changed();
      await loadTable();
      setTimeout(() => grid?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
    } catch (e) {
      error = errorText(e);
      await changed();
    } finally {
      busy = false;
      step = "";
    }
  }

  async function approveAndRender() {
    busy = true;
    error = "";
    try {
      await runner("approve-gate", { projectDir: dir, gate: "review" });
      render();
      await changed();
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }

  // ---- the scene panel ------------------------------------------------
  let text = $state("");
  let wish = $state("");
  let panelNote = $state("");
  $effect(() => {
    // a new scene opened: its own text, an empty request
    text = openRow?.mainText ?? "";
    wish = "";
    panelNote = "";
  });

  async function edit(command: string, request: Record<string, unknown>, said: string) {
    if (!openRow) return;
    if (avatarBefore === null) avatarBefore = gates.avatar?.state ?? "todo";
    busy = true;
    error = "";
    panelNote = "";
    try {
      table = await runner<Table>(command, { projectDir: dir, ...request });
      changes += 1;
      panelNote = said;
      await changed();
    } catch (e) {
      panelNote = errorText(e);
    } finally {
      busy = false;
    }
  }
  function saveText() {
    const row = openRow!;
    const scenes = (table.scenes ?? []).map((s, i) => (i === row.index && row.mainVar ? { ...s, vars: { ...s.vars, [row.mainVar]: text } } : s));
    return edit("save-scenes", { scenes, look }, "Saved. Update the preview to see it.");
  }
  const swap = (component: string) => edit("refill-scene", { llm: llmFor(app.config, "scenes"), index: openRow!.index, component, look }, "Swapped. Update the preview to see it.");
  const askChange = () => edit("refill-scene", { llm: llmFor(app.config, "scenes"), index: openRow!.index, request: wish.trim(), look }, "Changed as you asked. Update the preview to see it.");

  function onKey(e: KeyboardEvent) {
    const i = open;
    if (i === null || (e.target as HTMLElement)?.closest?.("input, textarea, select")) return;
    if (e.key === "Escape") open = null;
    if (e.key === "ArrowRight") open = Math.min(stills.length - 1, i + 1);
    if (e.key === "ArrowLeft") open = Math.max(0, i - 1);
  }
</script>

<svelte:window onkeydown={onKey} />

<section class="card">
  <h2>5. Preview</h2>
  <p class="hint lead">A check before the render: the app builds your video and shows one picture per scene. The render takes minutes; a mistake is cheaper to catch here.</p>

  {#if !scenesApproved && !edited}
    <Needs text="The preview is built from the approved scenes. Approve the scenes first." tab="scenes" {goto} />
  {:else}
    <details class="guide" open={!built}>
      <summary>How to change things before the render</summary>
      <ol>
        <li><b>Click a picture.</b> The scene opens next to it: what is said, and what is on screen.</li>
        <li><b>Change it.</b> Edit the words on screen, pick another scene of the same kind, or tell the AI what you want in your own words, for example "make this a list of the three steps" or "mark the word FREE".</li>
        <li><b>Click "Update the preview".</b> All your changes go in at once, in about a minute, and the new pictures appear.</li>
        <li><b>Something else?</b> The spoken words: 1. Script. The voice or the music: 2. Voice and music. The avatar's place and size: 4. Avatar. Then come back here.</li>
      </ol>
    </details>

    {#if job === "build-video"}<Progress command="build-video" project={dir} label={step || "Building the preview"} />{/if}
    {#if error}<ErrorBox message={error} context={{ step: "review" }} />{:else if gate?.state === "failed" && gate.error}<ErrorBox message={`Last attempt failed: ${gate.error}`} context={{ step: "review" }} />{/if}
    {#if changes > 0}<p class="changes">You changed {changes} scene{changes > 1 ? "s" : ""}. Click "Update the preview" to see {changes > 1 ? "them" : "it"}.</p>{/if}

    {#if stills.length}
      <div class="stills" bind:this={grid}>
        {#each stills as s, i (s.file)}
          <button type="button" class="still" class:on={open === i} onclick={() => (open = i)} title="Scene {s.scene} at {clock(s.at)}: click to open">
            <img src={src(s.file)} alt="Scene {s.scene}" loading="lazy" />
            <span>Scene {s.scene} · {clock(s.at)}</span>
          </button>
        {/each}
      </div>
    {/if}

    <div class="actionbar">
      {#if approved && !changes}
        <span class="say"><b>Approved.</b> {rendering ? "The video is rendering on 6. Your video." : "Next: 6. Your video."}</span>
        <Advanced><button type="button" disabled={locked} onclick={build}>Build again</button></Advanced>
        <button type="button" class="primary" onclick={() => goto("video")}>Go to 6. Your video</button>
      {:else if changes > 0 || (edited && stills.length > 0)}
        <span class="say">Your changes are saved. The preview shows them after the update.</span>
        <button type="button" class="primary" disabled={locked} onclick={build}>Update the preview</button>
      {:else if built}
        <span class="say">Look at every picture: cut-off text, an empty picture, a wrong word? Then approve, and the render starts.</span>
        <Advanced><button type="button" disabled={locked} onclick={build}>Build again</button></Advanced>
        <button type="button" class="primary" disabled={locked} onclick={approveAndRender}>Approve and render</button>
      {:else}
        <span class="say">Building and checking takes about a minute.</span>
        <button type="button" class="primary" disabled={locked} onclick={build}>Build the preview (Recommended)</button>
      {/if}
    </div>
  {/if}
</section>

{#if open !== null && stills[open]}
  <div class="lightbox" role="dialog" aria-modal="true" aria-label="Scene {stills[open].scene}">
    <button type="button" class="backdrop" aria-label="Close" onclick={() => (open = null)}></button>
    <div class="sheet">
      <figure>
        <img src={src(stills[open].file)} alt="Scene {stills[open].scene}" />
        <figcaption>
          <button type="button" disabled={open === 0} onclick={() => (open = Math.max(0, (open ?? 0) - 1))}>Previous</button>
          <span>Scene {stills[open].scene} of {stills.length} · {clock(stills[open].at)}</span>
          <button type="button" disabled={open === stills.length - 1} onclick={() => (open = Math.min(stills.length - 1, (open ?? 0) + 1))}>Next</button>
        </figcaption>
      </figure>
      <aside>
        <div class="ahead"><b>Scene {stills[open].scene}</b><button type="button" class="ghost" onclick={() => (open = null)}>Close</button></div>
        {#if openRow}
          <p class="said">"{openRow.said}"</p>
          <p class="hint">{openRow.label}{openRow.roleLabel ? `, ${openRow.roleLabel}` : ""}</p>
          {#if openRow.call}
            <p class="hint">This is the comment call {openRow.call.keyword}: it always shows the keyword. Its words come from the script.</p>
          {:else}
            {#if openRow.mainVar}
              <label class="label" for="ontext">Text on screen</label>
              <div class="row">
                <input id="ontext" bind:value={text} disabled={locked} />
                <button type="button" disabled={locked || text === (openRow.mainText ?? "") || !text.trim()} onclick={saveText}>Save</button>
              </div>
            {:else}
              <p class="hint">On screen: {openRow.shows}</p>
            {/if}
            {#if openRow.alternatives.length}
              <label class="label" for="swapto">Another scene of this kind</label>
              <select id="swapto" value="" disabled={locked} onchange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; if (v) swap(v); }}>
                <option value="">Pick one...</option>
                {#each openRow.alternatives as a}<option value={a.component}>{a.label}</option>{/each}
              </select>
            {/if}
            <label class="label" for="wish">Ask for a change</label>
            <textarea id="wish" rows="3" bind:value={wish} disabled={locked} placeholder="In your own words, for example: make this a list of the three steps"></textarea>
            <div class="row end">
              <button type="button" class="primary" disabled={locked || !wish.trim()} onclick={askChange}>Ask the AI</button>
            </div>
            <p class="hint">One small AI call. The scene changes; the words that are spoken stay.</p>
          {/if}
          {#if job === "refill-scene" || job === "save-scenes"}<p class="hint">Working on it...</p>{/if}
          {#if panelNote}<p class="note">{panelNote}</p>{/if}
        {:else}
          <p class="hint">This picture is not a scene of the table: a CTA segment, your footage or the end screen.</p>
        {/if}
      </aside>
    </div>
  </div>
{/if}

<style>
  h2 { margin: 0 0 4px; font-size: 17px; }
  .lead { margin: 0 0 12px; }
  .guide { background: var(--muted); border-radius: 8px; padding: 8px 14px; font-size: 14px; }
  .guide summary { cursor: pointer; font-weight: 600; }
  .guide ol { margin: 8px 0 4px; padding-left: 20px; display: grid; gap: 4px; }
  .changes { margin: 10px 0 0; padding: 8px 12px; border-radius: 8px; background: var(--warning-surface); color: var(--warning-text); font-size: 14px; }
  .stills { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; margin-top: 12px; scroll-margin-top: 10px; }
  .still { display: grid; gap: 4px; padding: 4px; min-height: 0; border-radius: 8px; background: var(--muted); cursor: pointer; text-align: left; font-size: 12px; font-weight: 400; border: 2px solid transparent; }
  .still.on { border-color: var(--primary); }
  .still img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 6px; }
  .lightbox { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; }
  .backdrop { position: absolute; inset: 0; background: rgb(0 0 0 / 0.75); border: 0; border-radius: 0; cursor: zoom-out; }
  .sheet { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 12px; width: min(96vw, 1300px); max-height: 94vh; min-width: 0; }
  figure { margin: 0; display: grid; gap: 8px; align-content: center; }
  figure img { width: 100%; max-height: 80vh; object-fit: contain; border-radius: 8px; }
  figcaption { display: flex; gap: 8px; align-items: center; justify-content: center; color: white; }
  aside { background: var(--surface); border-radius: 10px; padding: 12px 14px; overflow: auto; display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; align-content: start; min-width: 0; }
  aside textarea, aside select { width: 100%; min-width: 0; }
  .ahead { display: flex; justify-content: space-between; align-items: center; }
  .said { margin: 0; font-style: italic; }
  .row { display: flex; gap: 6px; }
  .row input { flex: 1; min-width: 0; }
  .end { justify-content: flex-end; }
  .label { font-weight: 600; font-size: 13px; margin-top: 6px; }
  .note { margin: 0; font-size: 13px; color: var(--success); }
  .hint { color: var(--muted-foreground); font-size: 13px; margin: 0; }
  @media (max-width: 900px) { .sheet { grid-template-columns: 1fr; overflow: auto; } }
</style>
