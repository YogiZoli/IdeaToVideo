<script lang="ts">
  // FootagePage: Identity, Footage (DECISIONS 82). The Identity's
  // own clips as B-roll: muted, under the narrator, in the scenes whose
  // sentences they fit. Each clip gets its cut points found and three
  // stills; the AI writes what is on it (the user can edit it), which is what
  // the scene planner matches to the narration. A long clip serves many
  // videos: every video takes the piece used least before, starting at a cut.
  import { llmFor } from "../llm";
  import { onMount } from "svelte";
  import { open } from "@tauri-apps/plugin-dialog";
  import { convertFileSrc } from "@tauri-apps/api/core";
  import type { AppState, FootageClip, FootageState } from "../api";
  import { runner, errorText, importFootage } from "../api";
  import { log } from "../logger";
  import ErrorBox from "../ErrorBox.svelte";
  import BrollSettings from "./BrollSettings.svelte";

  let { app, goto }: { app: AppState; goto?: (page: "connections") => void } = $props();

  let st = $state<FootageState | null>(null);
  let error = $state("");
  let busy = $state("");
  let saved = $state("");
  let drafts = $state<Record<string, string>>({});

  const llm = $derived(app.config ? llmFor(app.config, "texts") : null);
  const canDescribe = $derived(!!llm && llm.provider !== "deepseek");

  async function load() {
    try {
      st = await runner<FootageState>("footage-list", {});
      drafts = Object.fromEntries(st.clips.map((c) => [c.id, c.description]));
    } catch (e) {
      error = errorText(e);
    }
  }
  onMount(load);

  const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
  const usedIn = (c: FootageClip) => new Set(c.used.map((u) => u.project)).size;
  // AI B-roll clips (source "generated") have their own part of the page.
  const own = $derived((st?.clips ?? []).filter((c) => c.source !== "generated"));
  const generated = $derived((st?.clips ?? []).filter((c) => c.source === "generated"));
  const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString() : "");

  async function add() {
    error = "";
    saved = "";
    const picked = await open({ multiple: true, directory: false, filters: [{ name: "Video", extensions: ["mp4", "mov", "webm", "m4v"] }] });
    const paths = Array.isArray(picked) ? picked : typeof picked === "string" ? [picked] : [];
    if (!paths.length) return;
    let done = 0;
    for (const [i, p] of paths.entries()) {
      try {
        busy = `Adding ${i + 1} of ${paths.length}: finding its cuts and stills...`;
        const file = await importFootage(p);
        const r = await runner<{ clip: FootageClip }>("footage-add", { file });
        done += 1;
        log("footage_added", { seconds: r.clip.seconds, shots: r.clip.shots.length });
        if (canDescribe) {
          busy = `Adding ${i + 1} of ${paths.length}: the AI looks at it and writes what is on it...`;
          try {
            await runner("footage-describe", { id: r.clip.id, llm });
          } catch {
            // the clip is in; the description can be written by hand
          }
        }
      } catch (e) {
        error = errorText(e);
      }
    }
    busy = "";
    saved = done ? `Saved: ${done} clip${done === 1 ? "" : "s"}.${canDescribe ? "" : " Write what is on each one: the scene planner matches that to your narration."}` : "";
    await load();
  }

  async function describe(id: string) {
    error = "";
    busy = "The AI looks at the clip...";
    try {
      await runner("footage-describe", { id, llm });
      await load();
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = "";
    }
  }

  async function saveText(c: FootageClip) {
    try {
      await runner("footage-update", { id: c.id, description: drafts[c.id] ?? "" });
      saved = `Saved: ${c.name}.`;
      await load();
    } catch (e) {
      error = errorText(e);
    }
  }

  async function remove(id: string) {
    try {
      await runner("footage-remove", { id });
      await load();
    } catch (e) {
      error = errorText(e);
    }
  }

  async function setMode(mode: string) {
    try {
      await runner("footage-mode", { mode });
      log("choice_changed", { field: "Footage mode", value: mode });
      await load();
    } catch (e) {
      error = errorText(e);
    }
  }
</script>

{#if error}<ErrorBox message={error} context={{ step: "footage" }} />{/if}
<section class="card">
  <h2>Your footage</h2>
  <p class="hint">Your own video clips as B-roll, without their sound: the narrator speaks over them. The scene planner puts a clip under the sentences it fits, from what is on it. A long clip serves many videos: each video takes a different piece, always from the start of a shot.</p>
  {#if st}
    <div class="row">
      <span class="label">How it shows</span>
      {#each Object.entries(st.modes) as [id, text] (id)}
        <label class="radio"><input type="radio" name="fmode" checked={st.mode === id} onchange={() => setMode(id)} /> {text}{id === "scene" ? " (default)" : ""}</label>
      {/each}
    </div>
    <div class="row">
      <button type="button" class="primary" disabled={!!busy} onclick={add}>Add footage</button>
      <span class="hint">MP4, MOV or WebM, up to {st.maxSeconds / 60} minutes each. Pick several at once.{canDescribe ? " The AI writes what is on each clip; you can change it." : ""}</span>
    </div>
    {#if busy}<p class="busy">{busy}</p>{/if}
    {#if saved}<p class="saved">{saved}</p>{/if}

    {#if !own.length}
      <p>No footage yet.</p>
    {:else}
      <ul class="clips">
        {#each own as c (c.id)}
          <li>
            <div class="stills">
              {#each c.stills as s (s)}<img src={convertFileSrc(`${st.dir}/${s}`)} alt="" loading="lazy" />{/each}
            </div>
            <div class="info">
              <b>{c.name}</b>
              <span class="hint">{clock(c.seconds)}, {c.shots.length} shot{c.shots.length === 1 ? "" : "s"}, {usedIn(c) ? `used in ${usedIn(c)} video${usedIn(c) === 1 ? "" : "s"}` : "not used yet"}</span>
              <textarea rows="2" maxlength="400" placeholder="What is on it: the place, the people, what they do" bind:value={drafts[c.id]}></textarea>
              {#if !c.description}<span class="warn">Without a description the planner cannot choose this clip.</span>{/if}
              <div class="row">
                <button type="button" disabled={!!busy || (drafts[c.id] ?? "") === c.description} onclick={() => saveText(c)}>Save text</button>
                {#if canDescribe}<button type="button" class="ghost" disabled={!!busy} onclick={() => describe(c.id)}>Describe it for me</button>{/if}
                <span class="spacer"></span>
                <button type="button" class="ghost" disabled={!!busy} onclick={() => remove(c.id)}>Remove</button>
              </div>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  {:else}
    <p class="hint">Loading...</p>
  {/if}
</section>

<BrollSettings {app} />
<section class="card">
  <h2>Stock photos and videos</h2>
  <p class="hint">Free stock pictures and clips for your scenes (Pixabay, Unsplash), searched on the Scenes tab of a video. Their keys: {#if goto}<button type="button" class="link" onclick={() => goto("connections")}>Settings, Connections</button>{:else}Settings, Connections{/if}.</p>
</section>

{#if st && generated.length}
  <section class="card">
    <h2>AI B-roll library</h2>
    <p class="hint">Every clip AI made for your videos. A new video takes a fitting one from here first, for free, and orders only what is missing. The description is what the clip was made from; the planner matches it to your sentences.</p>
    <ul class="clips">
      {#each generated as c (c.id)}
        <li>
          <div class="stills">
            {#each c.stills as s (s)}<img src={convertFileSrc(`${st.dir}/${s}`)} alt="" loading="lazy" />{/each}
          </div>
          <div class="info">
            <b>{c.name}{#if c.generated?.test} <span class="tag">test clip</span>{/if}</b>
            <span class="hint">{c.generated?.label ?? "AI"}, {c.generated?.quality ?? ""}, {clock(c.seconds)}, made {day(c.generated?.at ?? c.createdAt)}{c.generated?.usd ? `, about ${c.generated.usd.toFixed(2)} USD` : ""}, {usedIn(c) ? `used in ${usedIn(c)} video${usedIn(c) === 1 ? "" : "s"}` : "not in a rendered video yet"}</span>
            <textarea rows="3" maxlength="400" bind:value={drafts[c.id]}></textarea>
            <div class="row">
              <button type="button" disabled={!!busy || (drafts[c.id] ?? "") === c.description} onclick={() => saveText(c)}>Save text</button>
              <span class="spacer"></span>
              <button type="button" class="ghost" disabled={!!busy} onclick={() => remove(c.id)}>Remove</button>
            </div>
          </div>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin: 8px 0; }
  .radio { display: flex; gap: 6px; align-items: center; }
  .clips { list-style: none; margin: 12px 0 0; padding: 0; display: grid; gap: 12px; }
  .clips li { display: grid; grid-template-columns: minmax(0, 300px) minmax(0, 1fr); gap: 12px; padding: 10px; border: 1px solid var(--border); border-radius: 8px; }
  .stills { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; align-content: start; }
  .stills img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 4px; background: var(--muted); }
  .info { display: grid; gap: 6px; align-content: start; }
  .spacer { flex: 1; }
  .busy { font-weight: 600; }
  .saved { padding: 10px 12px; border-radius: 8px; background: var(--success-surface, #e7f6ec); color: var(--success, #1f7a3a); font-weight: 600; }
  .warn { font-size: 12px; color: var(--danger-text, #a5161b); }
  .tag { display: inline-block; margin-left: 6px; padding: 0 8px; border-radius: 999px; font-size: 11px; font-weight: 600; background: var(--muted); color: var(--muted-foreground); }
  section.card + section.card { margin-top: 16px; }
  @media (max-width: 760px) { .clips li { grid-template-columns: 1fr; } }
  .link { border: none; background: none; padding: 0; color: var(--primary); text-decoration: underline; cursor: pointer; font-size: inherit; font-family: inherit; min-height: 0; }
</style>
