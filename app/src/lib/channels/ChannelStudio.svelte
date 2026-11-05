<script lang="ts">
  // The start screen (docs/BUILD_PLAN.md, phases 1 and 3). The active Identity's locked
  // recipe says how. Three choices, each starting from the recipe: the direction,
  // the text (empty for a topic, else a finished script or notes), and research. A
  // new video opens with its run already going (ProjectView recipeRun) and stops at
  // the brief, if there is one, then at the existing Preview step: approve, render,
  // Publishing Card, Thumbnail, publishing app. The week batch works with the same
  // choices, and queues what it writes.
  import { onDestroy, untrack } from "svelte";
  import { revealItemInDir } from "@tauri-apps/plugin-opener";
  import { open as pickFile } from "@tauri-apps/plugin-dialog";
  import { filesMissing } from "./recorded";
  import ErrorBox from "../ErrorBox.svelte";
  import Progress from "../Progress.svelte";
  import { running, startWork } from "../work.svelte";
  import RecipeEditor from "./RecipeEditor.svelte";
  import type { AppState } from "../api";
  import { runner, errorText, onProgress, saveSettings } from "../api";
  import { llmFor, aiWithKey } from "../llm";
  import { setScreen, log } from "../logger";
  import { blocker, costLine, recipeLines, recipeSide, RECIPE_HELP, type ChannelState, type Direction, type Recipe, type TextKind } from "./channels";

  let { app, saved, openProject, goto, only = "script" }: { app: AppState; saved: (s: AppState) => void; openProject: (dir: string) => void; goto: (page: "connections") => void; only?: Direction } = $props();

  setScreen(untrack(() => only) === "script" ? "home" : "edit");
  startWork();

  let st = $state<ChannelState | null>(null);
  let error = $state("");
  let editing = $state(false);
  // Home makes a video from a script, the Edit menu from a recording (DECISIONS 172)
  const direction = $derived<Direction>(only);
  let topic = $state("");
  let text = $state("");
  let kind = $state<TextKind>("notes");
  let research = $state(false);
  let starting = $state(false);

  const config = $derived(app.config!);
  const aiProvider = $derived((aiWithKey(llmFor(config, "script"), app.keys) ?? llmFor(config, "script")).provider);
  const language = $derived(config.channel.contentLanguage ?? "en");
  const side = $derived(st ? recipeSide(st.recipe, direction) : null);
  const hasText = $derived(!!text.trim());
  const mode = $derived<"idea" | "script" | "notes">(!hasText ? "idea" : kind === "finished" ? "script" : "notes");
  // a style whose scripts are always fact-checked: research stays on, the runner holds it to that too
  const factChecked = $derived(direction === "script" && !!st?.presets.find((p) => p.id === side?.preset)?.factChecked);
  const researching = $derived(research || factChecked);
  const stop = $derived(side ? blocker(side, app.keys, aiProvider, mode, researching, factChecked) : null);

  async function load() {
    error = "";
    try {
      st = await runner<ChannelState>("channel-state", { projectsDir: app.projectsDir, identity: app.identity });
      editing = !st.saved;
      // the recipe's defaults; one video can change them here
      kind = st.recipe.start?.text ?? "notes";
      research = st.recipe.start?.research === true;
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
      // a recording has its own voice: the Identity's narrator stays as it is
      if (r.voice.provider !== "recording") saved(await saveSettings(null, { ...app.identity!, narrator: { provider: r.voice.provider, voice: r.voice.voice } }));
    } catch (e) {
      error = errorText(e);
    }
    await load();
  }

  async function makeVideo() {
    if (!st || (!topic.trim() && !hasText) || starting) return;
    starting = true;
    error = "";
    try {
      const r = await runner<{ id: string; dir: string }>("channel-video-new", { projectsDir: app.projectsDir, identity: app.identity?.id, language, topic, text, textKind: kind, research: researching });
      await runner("autopilot-mark", { projectDir: r.dir, on: true });
      log("channel_video", { mode, research: researching, preset: side?.preset });
      topic = "";
      text = "";
      openProject(r.dir);
    } catch (e) {
      error = errorText(e);
    } finally {
      starting = false;
    }
  }

  // ---- a recording: its files in, the edited video out -------------------------------
  let files = $state<Record<string, string>>({});
  let recTitle = $state("");
  const card = $derived(st?.presets.find((p) => p.id === side?.preset));
  const missing = $derived(direction === "recorded" && side ? filesMissing(side.preset, files) : null);
  const VIDEO = [{ name: "Video", extensions: ["mp4", "mov", "m4v", "mkv", "webm", "avi"] }];
  async function pick(slot: string) {
    const f = await pickFile({ multiple: false, directory: false, filters: VIDEO });
    if (typeof f === "string") files = { ...files, [slot]: f };
  }
  const nameOf = (f: string) => f.split(/[\\/]/).pop();
  async function makeRecorded() {
    if (!st || missing || starting) return;
    starting = true;
    error = "";
    try {
      const r = await runner<{ id: string; dir: string }>("recorded-video-new", { projectsDir: app.projectsDir, identity: app.identity?.id, language, files, title: recTitle });
      await runner("autopilot-mark", { projectDir: r.dir, on: true });
      log("recorded_video", { preset: side?.preset, files: Object.keys(files) });
      files = {};
      recTitle = "";
      openProject(r.dir);
    } catch (e) {
      error = errorText(e);
    } finally {
      starting = false;
    }
  }

  // ---- week batch -------------------------------------------------------------------
  let theme = $state("");
  let pasted = $state("");
  let batching = $state(false);
  let batchStep = $state("");
  let batchNote = $state("");
  const batchJob = $derived(running(null, ["week-batch", "week-batch-local"]));
  const unlisten = onProgress((p) => {
    if (p.command !== "week-batch" && p.command !== "week-batch-local") return;
    const s = p.progress as { step?: string; n?: number; of?: number; title?: string; message?: string };
    if (s.step === "ideas") batchStep = "The AI is planning the week...";
    if (s.step === "batch-script") batchStep = `${researching ? "Research" : "Script"} ${s.n} of ${s.of}: ${s.title}`;
    if (s.step === "retry" && s.message) batchStep = s.message;
  });
  onDestroy(() => unlisten.then((f) => f()));
  async function weekBatch() {
    batching = true;
    batchStep = "Starting...";
    batchNote = "";
    error = "";
    try {
      // a finished script needs no AI, and no key; without one notes become drafts by hand
      const local = (!!pasted.trim() && kind === "finished" && !researching) || !app.keys[aiProvider];
      const r = await runner<{ written: number; failed: number }>(local ? "week-batch-local" : "week-batch", { projectsDir: app.projectsDir, identity: app.identity?.id, ...(local ? {} : { llm: aiWithKey(llmFor(config, "script"), app.keys) }), channel: config.channel, name: app.identity?.name, theme, language, pasted, textKind: kind, research });
      batchNote = `${r.written} ${researching ? "briefs ready, each waits for your click," : local ? "scripts" : "scripts written and"} queued.${r.failed ? ` ${r.failed} failed: they are in the queue, open one to do it again.` : ""}`;
      theme = "";
      pasted = "";
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
  {#if error}<ErrorBox message={error} context={{ step: "channel" }} />{/if}

  {#if !st}
    {#if !error}<p class="hint">Loading...</p>{/if}
  {:else if editing}
    <RecipeEditor {app} state={st} {direction} done={locked} cancel={st.saved ? () => (editing = false) : undefined} />
  {:else}
    {#if direction === "script"}
    <section class="card recipe">
      <div class="head">
        <div>
          <h2>The recipe of {app.identity?.name}</h2>
          <p class="hint">How every video of this Identity is made. You can change any of these.</p>
        </div>
        <button type="button" class="primary change" onclick={() => (editing = true)}>Change the recipe</button>
      </div>
      <div class="lines">
        {#each recipeLines(side ?? st.recipe, st.presets, st.freeVoices).filter((l) => l.label !== "Engine") as l (l.label)}
          <button type="button" class="line" title="Change the recipe" onclick={() => (editing = true)}>
            <span class="what-label">{l.label}</span>
            <b>{l.value}</b>
            <span class="what-help">{RECIPE_HELP[l.label] ?? ""}</span>
          </button>
        {/each}
      </div>
      <p class="hint">{costLine(side ?? st.recipe, aiProvider)}</p>
    </section>
    {/if}

    {#if !side}
      <section class="card direction">
        <p class="stop">This Identity has no voice for a script video yet. <button type="button" class="link" onclick={() => (editing = true)}>Change its recipe</button>, choose Script to video, and lock it once.</p>
      </section>
    {/if}

    {#if direction === "recorded"}
      <section class="card make">
        <h2>Your recording</h2>
        <p class="hint">Words, cuts and render all happen on this computer. Your files are read, never changed.</p>
        <p class="kind"><span>Kind of recording: <b>{card?.label ?? side?.preset}</b></span> <button type="button" onclick={() => (editing = true)}>Change the kind</button></p>
        <div class="slots">
          {#each card?.recorded?.slots ?? [] as s (s.id)}
            <div class="slot">
              <div class="what"><b>{s.label}</b><span class="hint">{files[s.id] ? nameOf(files[s.id]) : s.hint}</span></div>
              {#if files[s.id]}<button type="button" class="ghost" onclick={() => { const { [s.id]: _, ...rest } = files; files = rest; }}>Remove</button>{/if}
              <button type="button" onclick={() => pick(s.id)}>{files[s.id] ? "Change" : "Choose a file"}</button>
            </div>
          {/each}
        </div>
        <input bind:value={recTitle} aria-label="Working title" placeholder="Working title (optional)" />
        <p class="hint">What you type here stays. Empty: the file's name, and with an AI key the AI gives it a title from what you said.</p>
        <div class="actions">
          <span class="hint">{missing ?? "It stops at the preview for your approval. Nothing is ever published by itself."}</span>
          <button type="button" class="primary big" disabled={starting || !!missing} onclick={makeRecorded}>{starting ? "Starting..." : "Edit the recording"}</button>
        </div>
      </section>
    {:else if side}
    <section class="card make">
      <h2>A new video</h2>
      <label class="field" for="stopic">Topic or idea</label>
      <input id="stopic" bind:value={topic} placeholder={hasText ? "Optional: the title, or leave it to the AI" : "What is the video about? One sentence is enough."} />
      <label class="field" for="stext">Text <span class="hint">(optional)</span></label>
      <textarea id="stext" rows={hasText ? 10 : 3} bind:value={text} placeholder="Leave empty to give only the topic. Or paste a finished script, or your notes, for example a cleaned transcript from your phone."></textarea>
      {#if hasText}
        <div class="opts" role="radiogroup" aria-label="What this text is">
          <label><input type="radio" name="kind" checked={kind === "finished"} onchange={() => (kind = "finished")} /> Finished script, use as is</label>
          <label><input type="radio" name="kind" checked={kind === "notes"} onchange={() => (kind = "notes")} /> Notes, turn into a script</label>
        </div>
        <p class="hint">{kind === "finished" ? "A first line starting with # is its title; lines starting with ## are its parts." : `Keeps your ideas, opinions, stories and way of speaking, in this Identity's script structure.${research ? " Only the research can add a fact." : " It never adds a claim you did not make."}`}</p>
      {/if}
      <label class="research"><input type="checkbox" checked={researching} disabled={factChecked} onchange={(e) => (research = e.currentTarget.checked)} /> Research{factChecked ? ": always on for this style, its scripts are fact-checked" : ""}</label>
      <p class="hint">
        {#if !researching}Off: nothing is searched.
        {:else if kind === "finished" && hasText}Checks your script's claims and shows the sources. Your script stays exactly as it is.
        {:else}{aiProvider === "gemini" ? "Gemini searches the web" : "This AI cannot search the web here, so the brief comes from its memory and says so"}: key facts, numbers, dates, 3 to 8 sources.{hasText ? " It checks your claims and adds what is missing." : ""} You see and can change the brief before the script.{/if}
      </p>
      {#if stop}
        <p class="stop">{stop.text} {#if stop.connections}<button type="button" class="link" onclick={() => goto("connections")}>Settings, Connections</button>{/if}</p>
      {/if}
      <div class="actions">
        <span class="hint">It stops at the preview for your approval. Nothing is ever published by itself.</span>
        <button type="button" class="primary big" disabled={starting || (!topic.trim() && !hasText)} onclick={makeVideo}>{starting ? "Starting..." : "Make the video"}</button>
      </div>
    </section>
    {/if}

    {#if direction === "script" && side}
    <details class="card batch" open={!!st.queue.length || batching}>
      <summary><b>Week batch</b> <span class="hint">several videos in one run{st.queue.length ? `, ${st.queue.length} queued` : ""}</span></summary>
      <div class="head">
        <h2>Week batch</h2>
        <button type="button" disabled={batching || !(app.keys[aiProvider] || pasted.trim())} onclick={weekBatch}>{batching ? "Working..." : pasted.trim() ? "Make them all" : `Write ${st.week} scripts`}</button>
      </div>
      <p class="hint">{st.week} video ideas and their scripts for this Identity, or one video per text you paste, in one run, then queued here. No voice, no render, nothing published. It follows your choices above: {pasted.trim() ? (kind === "finished" ? "finished scripts" : "notes") : "topics"}, research {research ? "on, so each stops at its brief for your click" : "off"}.{app.keys[aiProvider] ? "" : " Needs your AI key, except for finished scripts."}</p>
      <input bind:value={theme} disabled={batching || !!pasted.trim()} aria-label="Theme of the week" placeholder="This week's theme (optional)" />
      <textarea rows="3" bind:value={pasted} disabled={batching} aria-label="Pasted texts" placeholder="Or paste up to 7 texts here, with a line of --- between them."></textarea>
      {#if batchStep}<p class="busy" role="status">{batchStep}</p>{/if}
      {#if batchJob}<Progress command={batchJob} label={batchStep || "Week batch"} reveal={false} />{/if}
      {#if batchNote}<p class="good">{batchNote}</p>{/if}
      {#if st.queue.length}
        <ol class="queue">
          {#each st.queue as q (q.dir)}
            <li>
              <span class="what"><b>{q.title}</b><span class="hint">{q.script === "failed" ? `The script failed: ${q.error ?? "no reason given"}` : q.research === "pending" ? "The brief is ready: one click goes on" : q.research === "none" ? "Research not done" : q.status}</span></span>
              <button type="button" class="ghost" onclick={() => openProject(q.dir)}>Open</button>
              <button type="button" disabled={q.script === "failed"} onclick={() => makeQueued(q.dir)}>Make the video</button>
            </li>
          {/each}
        </ol>
      {/if}
    </details>
    {/if}

    {#if st.recipe.music.on && st.recipe.music.source === "own" && st.musicDir}
      <p class="hint">Your music: <button type="button" class="link" onclick={() => revealItemInDir(st!.musicDir!)}>open this Identity's music folder</button></p>
    {/if}
  {/if}
</div>

<style>
  .studio { display: grid; gap: 16px; padding: 16px 24px 24px; max-width: 900px; margin: 0 auto; }
  .head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  details summary { cursor: pointer; }
  details .head { margin-top: 12px; }
  h2 { margin: 0; font-size: 17px; }
  .recipe .head { align-items: flex-start; }
  .change { flex: none; font-size: 15px; padding: 10px 20px; }
  .lines { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 14px 0 4px; }
  .line { display: grid; gap: 2px; justify-content: stretch; justify-items: start; text-align: left; white-space: normal; height: auto; min-height: 0; padding: 10px 12px; }
  .line b { font-size: 15px; overflow-wrap: anywhere; }
  .what-label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted-foreground); }
  .what-help { font-size: 12px; font-weight: 400; color: var(--muted-foreground); }
  .kind { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin: 8px 0 0; padding-top: 8px; font-size: 14px; }
  textarea, .batch input, .make > input { width: 100%; box-sizing: border-box; }
  .batch textarea { margin-top: 8px; }
  .make { display: grid; gap: 6px; }
  .field { font-size: 14px; font-weight: 600; margin-top: 4px; }
  .field .hint { font-weight: 400; }
  .opts { display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 14px; }
  .opts label, .research { display: flex; gap: 8px; align-items: center; font-size: 14px; }
  .research { font-weight: 600; margin-top: 6px; }
  .slots { display: grid; gap: 8px; margin: 10px 0; }
  .slot { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 8px; align-items: center; padding: 8px 0; border-top: 1px solid var(--border); }
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
    .lines { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
</style>
