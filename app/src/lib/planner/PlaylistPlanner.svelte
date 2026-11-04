<script lang="ts">
  // Playlist, Playlist Planner (DECISIONS 127, 168): the YT Evergreen Flywheel for
  // the app's own user. Card or typed answers, seed keywords, vidIQ keyword
  // research, the AI's plan as a table the user edits and approves, then the
  // outline, and the Course Content Structure goes straight into the course
  // import ("Create N videos"). Every vidIQ and AI step asks first and says
  // what it uses. The file is the contract (runner/planner/index.mjs).
  import { onMount } from "svelte";
  import { ask } from "@tauri-apps/plugin-dialog";
  import type { AppState } from "../api";
  import { runner, errorText } from "../api";
  import { llmFor, describeLlm } from "../llm";
  import { log } from "../logger";
  import ErrorBox from "../ErrorBox.svelte";
  import type { CoursePreview, CourseResult } from "../course/course";
  import { videos } from "../course/course";
  import type { TrafficCard } from "./planner";

  let { app, goto }: { app: AppState; goto: (id: "channel" | "connections") => void } = $props();

  type Kw = { keyword: string; volume: number | null; competition: number | null; score: number | null; seed?: string };
  type Row = { position: number; title: string; keyword: string; volume: number | null; competition: number | null };
  type Context = Record<string, unknown>;

  const llm = $derived(llmFor(app.config, "texts"));
  const hasVidiq = $derived(!!app.keys["vidiq"]);
  const hasAi = $derived(!!app.keys[llm.provider]);
  const language = $derived(app.config?.channel.contentLanguage ?? "en");

  let card = $state<TrafficCard | null>(null);
  let answers = $state({ audience: "", promise: "", topic: "" });
  let seedsText = $state("");
  let context = $state<Context | null>(null);
  let keywords = $state<Kw[] | null>(null);
  let researchNote = $state("");
  let title = $state("");
  let promise = $state("");
  let why = $state("");
  let rows = $state<Row[] | null>(null);
  let preview = $state<CoursePreview | null>(null);
  let text = $state("");
  let result = $state<CourseResult | null>(null);
  let busy = $state("");
  let error = $state("");

  async function start() {
    error = "";
    try {
      const r = await runner<{ card: TrafficCard | null; seeds: string[]; context: Context }>("planner-start", { answers, channel: app.config?.channel ?? {}, language });
      card = r.card;
      context = r.context;
      // no card: what the Identity already knows is filled in, never typed twice
      if (!card) {
        answers.audience ||= app.config?.channel.audience ?? "";
        answers.topic ||= app.config?.channel.profile ?? "";
      }
      if (!seedsText.trim()) seedsText = r.seeds.join("\n");
    } catch (e) {
      error = errorText(e);
    }
  }
  onMount(start);

  const seeds = $derived(seedsText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).slice(0, 10));

  async function doResearch() {
    error = "";
    busy = "Checking your vidIQ credits...";
    try {
      await start();
      const { credits } = await runner<{ credits: number | null }>("planner-balance", { service: "vidiq" });
      busy = "";
      const ok = await ask(`vidIQ keyword research for ${seeds.length} seed ${seeds.length === 1 ? "keyword" : "keywords"}: ${seeds.length} ${seeds.length === 1 ? "call" : "calls"}. It uses vidIQ credits from your plan${credits === null ? "" : `; you have ${credits} now`}. No AI tokens. Go on?`, { title: "Keyword research", kind: "info" });
      if (!ok) return;
      busy = "vidIQ is researching the keywords...";
      const r = await runner<{ keywords: Kw[]; failed: string[]; creditsUsed: number | null }>("planner-research", { service: "vidiq", seeds });
      keywords = r.keywords;
      researchNote = `${r.keywords.length} keywords found${r.creditsUsed === null ? "" : `, ${r.creditsUsed} vidIQ credits used`}.${r.failed.length ? ` No data for: ${r.failed.map((f) => f.split(":")[0]).join(", ")}.` : ""}`;
      log("planner_research", { seeds: seeds.length, keywords: r.keywords.length, credits: r.creditsUsed });
      rows = null;
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = "";
    }
  }

  async function doPlan() {
    if (!keywords || !context) return;
    const ok = await ask(`The AI picks one video per strong keyword from ${keywords.length} keywords (usually 8 to 16) and says why. It uses AI tokens from your AI key (${describeLlm(llm)}, a few cents at most). No vidIQ credits. Go on?`, { title: "Plan the playlist", kind: "info" });
    if (!ok) return;
    error = "";
    busy = "The AI is planning the playlist...";
    try {
      const r = await runner<{ title: string; promise: string; why: string; rows: Row[] }>("planner-plan", { llm, context, keywords });
      title = r.title;
      promise = r.promise;
      why = r.why;
      rows = r.rows;
      preview = null;
      log("planner_plan", { videos: r.rows.length });
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = "";
    }
  }

  function move(i: number, by: number) {
    if (!rows) return;
    const j = i + by;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    rows = next.map((r, k) => ({ ...r, position: k + 1 }));
  }
  function remove(i: number) {
    if (!rows) return;
    rows = rows.filter((_, k) => k !== i).map((r, k) => ({ ...r, position: k + 1 }));
  }
  function add() {
    if (!rows || rows.length >= 16) return;
    rows = [...rows, { position: rows.length + 1, title: "", keyword: "", volume: null, competition: null }];
  }
  const known = $derived(new Map((keywords ?? []).map((k) => [k.keyword.toLowerCase(), k])));
  function keywordChanged(r: Row) {
    const k = known.get(r.keyword.trim().toLowerCase());
    r.volume = k?.volume ?? null;
    r.competition = k?.competition ?? null;
  }

  async function approve() {
    if (!rows || !context) return;
    const ok = await ask(`The AI writes the outline of ${videos(rows.length)}: hook, teach, do and review, 10 to 20 minutes each. It uses AI tokens from your AI key (${describeLlm(llm)}, a few cents at most). Then you see the import preview; nothing is made before you click Create. Go on?`, { title: "Approve the plan", kind: "info" });
    if (!ok) return;
    error = "";
    busy = "The AI is writing the outline...";
    try {
      const { outline } = await runner<{ outline: unknown[] }>("planner-outline", { llm, context, rows });
      text = (await runner<{ text: string }>("planner-build", { title, promise, audience: String(context.audience ?? ""), rows, outline })).text;
      preview = await runner<CoursePreview>("course-preview", { projectsDir: app.projectsDir, text });
      log("planner_outline", { videos: rows.length });
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = "";
    }
  }

  async function create() {
    if (!preview) return;
    error = "";
    busy = "Creating the videos...";
    try {
      result = await runner<CourseResult>("course-import", { projectsDir: app.projectsDir, text, identity: app.identity?.id, language });
      log("planner_import", { created: result.created, updated: result.updated });
      preview = null;
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = "";
    }
  }

  async function copyFile() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // no clipboard
    }
  }
</script>

<section class="card">
  <p class="lead">A plan for a whole playlist, not for one video: which videos to make, in what order, each on a keyword people really search for. The result is one prepared video per row on Videos, with nothing started yet.</p>
  <p class="hint">Four steps: what it is about, keyword research, the plan you can edit, the videos.</p>
</section>

<section class="card">
  <h2>1. What the playlist is about</h2>
  {#if card}
    <p class="good">From the Traffic Card of {app.identity?.name}: {card.keywords.length} keywords, {card.playlists.length} playlist ideas.</p>
  {:else}
    <p class="hint">No Traffic Card kept for {app.identity?.name}. <button type="button" class="link" onclick={() => goto("channel")}>Import it on Identity, YouTube Channel & Audience</button>, or check these three. What your Identity already says is filled in.</p>
  {/if}
  <div class="grid">
    <label>Audience <input bind:value={answers.audience} placeholder={card?.audience || "Who the videos are for"} /></label>
    <label>Promise <input bind:value={answers.promise} placeholder={card?.result || "What they can do after the playlist"} /></label>
    <label>Topic <input bind:value={answers.topic} placeholder={card?.topic || "The playlist's topic"} onchange={() => { if (!seedsText.trim()) start(); }} /></label>
  </div>
</section>

<section class="card">
  <h2>2. Keyword research</h2>
  <p class="hint">Seed keywords, one per line (at most 10). vidIQ researches each one with your vidIQ key.</p>
  <textarea rows="5" bind:value={seedsText} aria-label="Seed keywords" spellcheck="false"></textarea>
  {#if !hasVidiq}<p class="hint">Add your vidIQ key first: <button type="button" class="link" onclick={() => goto("connections")}>Settings, Connections</button>.</p>{/if}
  <div class="acts"><button type="button" class="primary" disabled={!!busy || !hasVidiq || !seeds.length} onclick={doResearch}>Research {seeds.length} with vidIQ</button></div>
  {#if researchNote}<p class="good">{researchNote}</p>{/if}
</section>

{#if keywords}
  <section class="card">
    <h2>3. The plan</h2>
    {#if !hasAi}<p class="hint">Add your AI key first: <button type="button" class="link" onclick={() => goto("connections")}>Settings, Connections</button>.</p>{/if}
    <div class="acts"><button type="button" class:primary={!rows} disabled={!!busy || !hasAi} onclick={doPlan}>{rows ? "Plan again" : "Plan the playlist"}</button></div>
    {#if rows}
      {#if why}<p class="why"><b>Why {videos(rows.length)}:</b> {why}</p>{/if}
      <div class="grid">
        <label>Playlist name <input bind:value={title} /></label>
        <label>Promise <input bind:value={promise} /></label>
      </div>
      <div class="scroll">
        <table>
          <thead><tr><th>#</th><th>Title</th><th>Keyword</th><th>Volume</th><th>Competition</th><th></th></tr></thead>
          <tbody>
            {#each rows as r, i (i)}
              <tr>
                <td>{r.position}</td>
                <td class="title"><input bind:value={r.title} aria-label={`Title of video ${r.position}`} maxlength="100" /></td>
                <td class="kw"><input bind:value={r.keyword} aria-label={`Keyword of video ${r.position}`} list="planner-keywords" onchange={() => keywordChanged(r)} /></td>
                <td class="n">{r.volume ?? ""}</td>
                <td class="n">{r.competition ?? ""}</td>
                <td><div class="row-acts">
                  <button type="button" class="ghost" disabled={i === 0} onclick={() => move(i, -1)} aria-label="Up">Up</button>
                  <button type="button" class="ghost" disabled={i === rows.length - 1} onclick={() => move(i, 1)} aria-label="Down">Down</button>
                  <button type="button" class="ghost" onclick={() => remove(i)}>Remove</button>
                </div></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <datalist id="planner-keywords">{#each keywords as k (k.keyword)}<option value={k.keyword}></option>{/each}</datalist>
      <div class="acts">
        <button type="button" class="ghost" disabled={rows.length >= 16} onclick={add}>Add a video</button>
        <button type="button" class="primary" disabled={!!busy || !hasAi || !rows.length || !title.trim() || rows.some((r) => !r.title.trim() || !r.keyword.trim())} onclick={approve}>Approve {videos(rows.length)}</button>
      </div>
    {/if}
  </section>
{/if}

{#if preview}
  <section class="card">
    <h2>4. Create the videos</h2>
    <p class="hint">{preview.course.title}: {videos(preview.lessons.length)}, in playlist order. The import only prepares: no AI, no voice, no HeyGen and no render starts by itself.</p>
    <ol>{#each preview.lessons as l (l.id)}<li value={l.position}>{l.title} <span class="hint">{l.minutes} min{l.exists ? ", already here: will be updated" : ""}</span></li>{/each}</ol>
    {#each preview.warnings as w}<p class="hint">{w}</p>{/each}
    <div class="acts">
      <button type="button" class="primary" disabled={!!busy} onclick={create}>Create {videos(preview.lessons.length)}</button>
      <button type="button" class="ghost" onclick={copyFile}>Copy the file</button>
    </div>
  </section>
{/if}

{#if result}<p class="good">{result.created} created, {result.updated} updated. They are on Videos, Course or playlist filter, and on the Home board.</p>{/if}
{#if busy}<p class="hint">{busy}</p>{/if}
{#if error}<ErrorBox message={error} context={{ step: "playlist-planner", provider: llm.provider, model: llm.model }} />{/if}

<style>
  .grid { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); margin-top: 8px; }
  .grid label { display: grid; gap: 4px; font-size: 13px; }
  textarea { width: 100%; box-sizing: border-box; }
  .acts { display: flex; gap: 6px; margin: 8px 0; flex-wrap: wrap; }
  .row-acts { display: flex; gap: 2px; white-space: nowrap; }
  .row-acts button { padding: 4px 6px; font-size: 12px; }
  td.title { width: 45%; }
  td.kw { width: 25%; }
  .scroll { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; color: var(--muted-foreground); padding: 6px; }
  td { padding: 4px 6px; border-top: 1px solid var(--border); }
  td input { width: 100%; box-sizing: border-box; }
  .n { white-space: nowrap; }
  .why { font-size: 13px; }
  .hint { font-size: 13px; color: var(--muted-foreground); margin: 0; }
</style>
