<script lang="ts">
  // The start screen (docs/BUILD_PLAN.md, phase 1). Pick a channel; its locked
  // recipe says how; idea or script in, video out. A new video opens with its
  // run already going (ProjectView recipeRun) and stops at the existing Preview
  // step: approve, render, Publishing Card, Thumbnail, publishing app. The week
  // batch writes seven scripts for the channel and queues them.
  import { onDestroy } from "svelte";
  import { revealItemInDir } from "@tauri-apps/plugin-opener";
  import ErrorBox from "../ErrorBox.svelte";
  import RecipeEditor from "./RecipeEditor.svelte";
  import type { AppState } from "../api";
  import { runner, errorText, onProgress, saveSettings } from "../api";
  import { defaultConfig, cleanConfig, LANGUAGES } from "../catalog";
  import { identityFromConfig, roomForIdentity } from "../identity";
  import { llmFor } from "../llm";
  import { setScreen, log } from "../logger";
  import { fullPlanText } from "../edition";
  import { blocker, costLine, recipeLines, type ChannelState, type Recipe } from "./channels";

  let { app, choose, saved, openProject, goto }: { app: AppState; choose: (id: string) => void; saved: (s: AppState) => void; openProject: (dir: string) => void; goto: (page: "connections") => void } = $props();

  setScreen("channel");

  let st = $state<ChannelState | null>(null);
  let error = $state("");
  let editing = $state(false);
  let mode = $state<"idea" | "script">("idea");
  let text = $state("");
  let starting = $state(false);

  const config = $derived(app.config!);
  const aiProvider = $derived(llmFor(config, "script").provider);
  const language = $derived(config.channel.contentLanguage ?? "en");
  const stop = $derived(st ? blocker(st.recipe, app.keys, aiProvider, mode) : null);
  const room = $derived(roomForIdentity(app.identities.length, app.edition.identityLimit));

  async function load() {
    error = "";
    try {
      st = await runner<ChannelState>("channel-state", { projectsDir: app.projectsDir, identity: app.identity });
      editing = !st.saved;
    } catch (e) {
      error = errorText(e);
    }
  }
  $effect(() => {
    if (app.identity?.id) load();
  });

  // The Identity's narrator follows the recipe, so the Voice tab and the
  // comment-call clips read with the same voice.
  async function locked(r: Recipe) {
    editing = false;
    try {
      saved(await saveSettings(null, { ...app.identity!, narrator: { provider: r.voice.provider, voice: r.voice.voice } }));
    } catch (e) {
      error = errorText(e);
    }
    await load();
  }

  async function makeVideo() {
    if (!st || !text.trim() || starting) return;
    starting = true;
    error = "";
    try {
      const r = await runner<{ id: string; dir: string }>("channel-video-new", { projectsDir: app.projectsDir, identity: app.identity?.id, language, text, mode });
      await runner("autopilot-mark", { projectDir: r.dir, on: true });
      log("channel_video", { mode, preset: st.recipe.preset });
      text = "";
      openProject(r.dir);
    } catch (e) {
      error = errorText(e);
    } finally {
      starting = false;
    }
  }

  // ---- a new channel: a name and a language, the recipe comes next ---------------
  let creating = $state(false);
  let newName = $state("");
  let newLanguage = $state("en");
  let busyNew = $state(false);
  async function createChannel() {
    if (!newName.trim()) return;
    busyNew = true;
    error = "";
    try {
      const c = { ...defaultConfig(), name: newName.trim(), llm: { ...app.app!.llm }, channel: { ...defaultConfig().channel, contentLanguage: newLanguage }, narrator: newLanguage === "en" ? { provider: "kokoro" as const, voice: "am_michael" } : defaultConfig().narrator };
      saved(await saveSettings(null, identityFromConfig(cleanConfig(c), null, null)));
      creating = false;
      newName = "";
    } catch (e) {
      error = errorText(e);
    } finally {
      busyNew = false;
    }
  }

  // ---- week batch -------------------------------------------------------------------
  let theme = $state("");
  let batching = $state(false);
  let batchStep = $state("");
  let batchNote = $state("");
  const unlisten = onProgress((p) => {
    if (p.command !== "week-batch") return;
    const s = p.progress as { step?: string; n?: number; of?: number; title?: string; message?: string };
    if (s.step === "ideas") batchStep = "The AI is planning the week...";
    if (s.step === "batch-script") batchStep = `Script ${s.n} of ${s.of}: ${s.title}`;
    if (s.step === "retry" && s.message) batchStep = s.message;
  });
  onDestroy(() => unlisten.then((f) => f()));
  async function weekBatch() {
    batching = true;
    batchStep = "Starting...";
    batchNote = "";
    error = "";
    try {
      const r = await runner<{ written: number; failed: number }>("week-batch", { projectsDir: app.projectsDir, identity: app.identity?.id, llm: llmFor(config, "script"), channel: config.channel, name: app.identity?.name, theme, language });
      batchNote = `${r.written} scripts written and queued.${r.failed ? ` ${r.failed} failed: they are in the queue, open one to write it again.` : ""}`;
      theme = "";
      st = await runner<ChannelState>("channel-state", { projectsDir: app.projectsDir, identity: app.identity });
    } catch (e) {
      error = errorText(e);
    } finally {
      batching = false;
      batchStep = "";
    }
  }
  async function makeQueued(dir: string) {
    try {
      await runner("autopilot-mark", { projectDir: dir, on: true });
      openProject(dir);
    } catch (e) {
      error = errorText(e);
    }
  }
</script>

<div class="studio">
  <section class="card channels">
    <div class="head">
      <h1>Pick a channel</h1>
      <button type="button" disabled={!room} title={room ? "" : fullPlanText(app.edition)} onclick={() => (creating = !creating)}>{creating ? "Cancel" : "New channel"}</button>
    </div>
    <div class="cards">
      {#each app.identities as i (i.id)}
        <button type="button" class="channel" class:on={i.id === app.identity?.id} aria-pressed={i.id === app.identity?.id} onclick={() => i.id !== app.identity?.id && choose(i.id)}>{i.name}</button>
      {/each}
    </div>
    {#if creating}
      <div class="new">
        <label for="cname">Name</label>
        <input id="cname" bind:value={newName} placeholder="The channel's name" />
        <label for="clang">Language</label>
        <select id="clang" bind:value={newLanguage}>
          {#each LANGUAGES as l (l.code)}<option value={l.code}>{l.label}</option>{/each}
        </select>
        <button type="button" class="primary" disabled={busyNew || !newName.trim()} onclick={createChannel}>{busyNew ? "Making it..." : "Make the channel"}</button>
      </div>
    {/if}
  </section>

  {#if error}<ErrorBox message={error} context={{ step: "channel" }} />{/if}

  {#if !st}
    {#if !error}<p class="hint">Loading...</p>{/if}
  {:else if editing}
    <RecipeEditor {app} state={st} done={locked} cancel={st.saved ? () => (editing = false) : undefined} />
  {:else}
    <section class="card recipe">
      <div class="head">
        <h2>{app.identity?.name}: the recipe</h2>
        <button type="button" class="ghost" onclick={() => (editing = true)}>Change</button>
      </div>
      <dl>
        {#each recipeLines(st.recipe, st.presets, st.freeVoices) as l (l.label)}
          <div><dt>{l.label}</dt><dd>{l.value}</dd></div>
        {/each}
      </dl>
      <p class="hint">{costLine(st.recipe, aiProvider)}</p>
    </section>

    <section class="card make">
      <div class="tabs" role="tablist">
        <button type="button" role="tab" class:on={mode === "idea"} aria-selected={mode === "idea"} onclick={() => (mode = "idea")}>My idea</button>
        <button type="button" role="tab" class:on={mode === "script"} aria-selected={mode === "script"} onclick={() => (mode = "script")}>My script</button>
      </div>
      {#if mode === "idea"}
        <textarea rows="3" bind:value={text} aria-label="The idea" placeholder="What is the video about? One sentence is enough."></textarea>
      {:else}
        <textarea rows="10" bind:value={text} aria-label="The script" placeholder="Paste the whole script. A first line starting with # is its title; lines starting with ## are its parts."></textarea>
      {/if}
      {#if stop}
        <p class="stop">{stop.text} {#if stop.connections}<button type="button" class="link" onclick={() => goto("connections")}>Settings, Connections</button>{/if}</p>
      {/if}
      <div class="actions">
        <span class="hint">It stops at the preview for your approval. Nothing is ever published by itself.</span>
        <button type="button" class="primary big" disabled={starting || !text.trim() || !!stop} onclick={makeVideo}>{starting ? "Starting..." : "Make the video"}</button>
      </div>
    </section>

    <section class="card batch">
      <div class="head">
        <h2>Week batch</h2>
        <button type="button" disabled={batching || !app.keys[aiProvider]} onclick={weekBatch}>{batching ? "Writing..." : `Write ${st.week} scripts`}</button>
      </div>
      <p class="hint">{st.week} video ideas and their scripts for this channel, in one run, then queued here. No voice, no render, nothing published.{app.keys[aiProvider] ? "" : " Needs your AI key."}</p>
      <input bind:value={theme} disabled={batching} aria-label="Theme of the week" placeholder="This week's theme (optional)" />
      {#if batchStep}<p class="busy" role="status">{batchStep}</p>{/if}
      {#if batchNote}<p class="good">{batchNote}</p>{/if}
      {#if st.queue.length}
        <ol class="queue">
          {#each st.queue as q (q.dir)}
            <li>
              <span class="what"><b>{q.title}</b><span class="hint">{q.script === "failed" ? `The script failed: ${q.error ?? "no reason given"}` : q.status}</span></span>
              <button type="button" class="ghost" onclick={() => openProject(q.dir)}>Open</button>
              <button type="button" disabled={q.script === "failed"} onclick={() => makeQueued(q.dir)}>Make the video</button>
            </li>
          {/each}
        </ol>
      {/if}
    </section>

    {#if st.recipe.music.on && st.recipe.music.source === "own" && st.musicDir}
      <p class="hint">Your music: <button type="button" class="link" onclick={() => revealItemInDir(st!.musicDir!)}>open this channel's music folder</button></p>
    {/if}
  {/if}
</div>

<style>
  .studio { display: grid; gap: 16px; padding: 24px; max-width: 900px; margin: 0 auto; }
  .head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  h1 { margin: 0; font-size: 22px; }
  h2 { margin: 0; font-size: 17px; }
  .cards { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
  .channel { padding: 10px 18px; font-weight: 600; }
  .channel.on { background: var(--primary-surface); color: var(--primary-surface-foreground); border-color: var(--primary); }
  .new { display: grid; grid-template-columns: auto minmax(0, 1fr) auto minmax(0, 160px) auto; gap: 8px; align-items: center; margin-top: 12px; }
  .new label { font-size: 14px; font-weight: 600; }
  dl { margin: 12px 0 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px 16px; }
  dt { font-size: 12px; color: var(--muted-foreground); }
  dd { margin: 0; font-weight: 600; font-size: 14px; }
  .tabs { display: flex; gap: 6px; margin-bottom: 10px; }
  .tabs button { border: none; background: var(--muted); padding: 6px 14px; }
  .tabs button.on { background: var(--primary-surface); color: var(--primary-surface-foreground); font-weight: 600; }
  textarea, .batch input { width: 100%; box-sizing: border-box; }
  .actions { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 10px; }
  .big { font-size: 16px; padding: 10px 22px; white-space: nowrap; }
  .hint { font-size: 13px; color: var(--muted-foreground); margin: 6px 0 0; }
  .actions .hint { margin: 0; }
  .stop { font-size: 13px; color: var(--danger-text); margin: 8px 0 0; }
  .good { font-size: 13px; color: var(--success); margin: 8px 0 0; }
  .busy { font-size: 13px; margin: 8px 0 0; }
  .link { border: none; background: none; padding: 0; color: var(--primary); text-decoration: underline; cursor: pointer; font-size: inherit; font-family: inherit; min-height: 0; }
  .batch input { margin-top: 8px; }
  .queue { list-style: none; margin: 10px 0 0; padding: 0; display: grid; }
  .queue li { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 8px; align-items: center; padding: 8px 0; border-top: 1px solid var(--border); }
  .what { display: grid; gap: 2px; min-width: 0; }
  .what b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .what .hint { margin: 0; }
  @media (max-width: 980px) {
    dl { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
</style>
