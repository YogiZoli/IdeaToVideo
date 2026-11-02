<script lang="ts">
  // The Recording tab of a Recorded video (runner/recorded, docs/BUILD_PLAN.md
  // phase 2): how the words fit the recording, every cut with a way to put it
  // back, and the chapters and big words of the plan. A change here runs the steps
  // after it again from the same recording; nothing is transcribed twice.
  import ErrorBox from "../ErrorBox.svelte";
  import { runner, errorText, onProgress } from "../api";
  import { onDestroy } from "svelte";
  import { cutLine, checkLine, stepText, type RecordedState } from "./recorded";

  let { dir, busy, redo, changed }: { dir: string; busy: boolean; redo: () => void; changed: () => Promise<void> } = $props();

  let st = $state<RecordedState | null>(null);
  let error = $state("");
  let dirty = $state(false);
  let showAll = $state(false);
  let step = $state("");

  async function load() {
    try {
      st = await runner<RecordedState>("recorded-state", { projectDir: dir });
    } catch (e) {
      error = errorText(e);
    }
  }
  $effect(() => {
    if (!busy) load();
  });

  const unlisten = onProgress((p) => {
    if ((p as { project?: string | null }).project !== dir) return;
    const text = stepText(p.progress as { step?: string; percent?: number; n?: number; of?: number });
    if (text) step = text;
  });
  onDestroy(() => unlisten.then((f) => f()));

  async function toggle(id: string, on: boolean) {
    error = "";
    try {
      const cuts = await runner<RecordedState["cuts"]>("recorded-cut-set", { projectDir: dir, id, on });
      if (st) st = { ...st, cuts };
      dirty = true;
      await changed();
    } catch (e) {
      error = errorText(e);
    }
  }

  async function keepPauses(on: boolean) {
    error = "";
    try {
      const cuts = await runner<RecordedState["cuts"]>("recorded-cut-set", { projectDir: dir, keepPauses: on });
      if (st) st = { ...st, cuts };
      dirty = true;
      await changed();
    } catch (e) {
      error = errorText(e);
    }
  }

  async function savePlan(chapters: { sentence: string; title: string }[] | null, bigWords: string[] | null) {
    error = "";
    try {
      const r = await runner<{ plan: RecordedState["plan"] }>("recorded-plan-save", { projectDir: dir, ...(chapters ? { chapters } : {}), ...(bigWords ? { bigWords } : {}) });
      if (st) st = { ...st, plan: r.plan };
      dirty = true;
      await changed();
    } catch (e) {
      error = errorText(e);
    }
  }

  const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const KIND: Record<string, string> = { take: "Repeated take", filler: "Filler word", sound: "A sound with no word" };
  const marks = $derived(st?.cuts?.marks ?? []);
  const shown = $derived(showAll ? marks : marks.slice(0, 12));
</script>

<div class="tab">
  {#if error}<ErrorBox message={error} context={{ step: "recording" }} />{/if}

  {#if busy}
    <section class="card"><h2>Working on the recording</h2><p class="hint" role="status">{step || "Starting..."}</p></section>
  {/if}

  {#if st?.input}
    <section class="card">
      <h2>The recording</h2>
      <ul class="files">
        {#each Object.entries(st.input.files) as [slot, file] (slot)}
          <li><b>{slot}</b> <span class="path" title={file}>{file}</span>{#if st.input.voice === slot} <span class="hint">the voice</span>{/if}</li>
        {/each}
      </ul>
      {#each st.input.notes ?? [] as n (n)}<p class="hint">{n}</p>{/each}
    </section>
  {/if}

  {#if st?.cuts}
    <section class="card">
      <h2>What comes out</h2>
      <p class="big">{cutLine(st.cuts)}</p>
      <p class:warn={!st.cuts.check.ok} class="hint">{checkLine(st.cuts.check, st.after)}</p>
      {#if st.cuts.careful}<p class="warn hint">The words do not fit the sound well, so only named words are cut, no unnamed sounds. Look through the list.</p>{/if}
      <label class="line"><input type="checkbox" checked={st.cuts.keepPauses} onchange={(e) => keepPauses(e.currentTarget.checked)} /> Keep the pauses as they were</label>
      {#if marks.length}
        <ul class="marks">
          {#each shown as m (m.id)}
            <li class:off={!m.on}>
              <span class="time">{clock(m.start)}</span>
              <span class="kind">{KIND[m.kind] ?? m.kind}</span>
              <span class="said">{m.text || `${(m.end - m.start).toFixed(1)} s`}</span>
              <button type="button" class="ghost" disabled={busy} onclick={() => toggle(m.id, !m.on)}>{m.on ? "Put back" : "Cut again"}</button>
            </li>
          {/each}
        </ul>
        {#if marks.length > shown.length}<button type="button" class="link" onclick={() => (showAll = true)}>Show all {marks.length}</button>{/if}
      {:else}
        <p class="hint">No filler words or repeated takes found, only pauses.</p>
      {/if}
    </section>
  {/if}

  {#if st?.plan}
    <section class="card">
      <h2>On screen</h2>
      <h3>Chapters</h3>
      <ul class="plan">
        {#each st.plan.chapters as c (c.sentence)}
          <li>
            <span class="time">{clock(c.start)}</span>
            <input aria-label="Chapter title" value={c.title} disabled={busy} onchange={(e) => savePlan([{ sentence: c.sentence, title: e.currentTarget.value }], null)} />
          </li>
        {/each}
      </ul>
      {#if st.plan.bigWords.length}
        <h3>Big words</h3>
        <ul class="plan">
          {#each st.plan.bigWords as b (b.id)}
            <li>
              <span class="time">{clock(b.start)}</span>
              <span class="word">{b.text}</span>
              {#if b.behind}<span class="hint">behind your head</span>{/if}
              <button type="button" class="ghost" disabled={busy} onclick={() => savePlan(null, st!.plan!.bigWords.filter((x) => x.id !== b.id).map((x) => x.id))}>Remove</button>
            </li>
          {/each}
        </ul>
      {/if}
      {#if st.plan.layouts.length}<p class="hint">{st.plan.layouts.length} layouts, a change about every 8 seconds, each on a sentence.</p>{/if}
      {#if st.plan.beats.length}<p class="hint">{st.plan.beats.length} color beats.</p>{/if}
      {#if st.motion}<p class="hint">{st.motion.usable ? `Cursor followed: ${st.motion.clicks} clicks, ${st.motion.zooms.length} zooms.${st.motion.painted ? " It moves smoothly in the video." : ""}` : "The cursor could not be followed in this recording, so it stays as filmed and the view does not zoom."}</p>{/if}
    </section>
  {/if}

  {#if dirty}
    <div class="bar">
      <span class="hint">Changed. The video is made again from the same recording.</span>
      <button type="button" class="primary" disabled={busy} onclick={() => { dirty = false; redo(); }}>Apply the changes</button>
    </div>
  {/if}
</div>

<style>
  .tab { display: grid; gap: 14px; padding: 8px 0 24px; }
  h2 { margin: 0 0 8px; font-size: 17px; }
  h3 { margin: 12px 0 6px; font-size: 14px; }
  .big { margin: 0; font-size: 16px; font-weight: 600; }
  .hint { margin: 6px 0 0; font-size: 13px; color: var(--muted-foreground); }
  .warn { color: var(--warning-text); }
  .line { display: flex; gap: 8px; align-items: center; font-size: 14px; margin-top: 10px; }
  ul { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 4px; }
  .files li { font-size: 13px; display: flex; gap: 8px; align-items: baseline; min-width: 0; }
  .path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; color: var(--muted-foreground); }
  .marks li { display: grid; grid-template-columns: 48px 150px minmax(0, 1fr) auto; gap: 8px; align-items: center; padding: 4px 0; border-top: 1px solid var(--border); font-size: 13px; }
  .marks li.off { opacity: 0.55; }
  .said { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .time { color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
  .kind { font-weight: 600; }
  .plan li { display: flex; gap: 10px; align-items: center; font-size: 14px; }
  .plan input { flex: 1; min-width: 0; }
  .word { font-weight: 700; }
  .link { border: none; background: none; padding: 0; color: var(--primary); text-decoration: underline; cursor: pointer; font-size: 13px; min-height: 0; margin-top: 8px; }
  .bar { position: sticky; bottom: 0; display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 14px; border-radius: 10px; background: var(--surface); box-shadow: 0 -4px 14px rgba(0, 0, 0, 0.12); }
</style>
