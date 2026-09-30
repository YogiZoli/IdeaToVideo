<script lang="ts">
  // Projects list + New video (topic, length, language, optional Video Brief
  // Card JSON, validated by the runner before anything is created).
  import { untrack } from "svelte";
  import type { AppState, ProjectSummary } from "./api";
  import { runner, errorText } from "./api";
  import { LANGUAGES } from "./catalog";
  import ErrorBox from "./ErrorBox.svelte";
  import EngineBanner from "./EngineBanner.svelte";


  let { app, openProject }: { app: AppState; openProject: (dir: string) => void } = $props();

  let projects = $state<ProjectSummary[]>([]);
  let loading = $state(true);
  let error = $state("");

  let showNew = $state(false);
  let title = $state("");
  let language = $state(untrack(() => app.config?.channel.contentLanguage ?? "en"));
  let autopilot = $state(untrack(() => app.config?.defaults?.autopilot ?? false));
  let brief = $state<Record<string, unknown> | null>(null);
  let briefName = $state("");
  let briefError = $state("");
  let creating = $state(false);

  async function load() {
    loading = true;
    error = "";
    try {
      projects = (await runner<{ projects: ProjectSummary[] }>("list-projects", { projectsDir: app.projectsDir })).projects;
    } catch (e) {
      error = errorText(e);
    } finally {
      loading = false;
    }
  }
  $effect(() => {
    load();
  });

  async function pickBrief(e: Event) {
    briefError = "";
    brief = null;
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    briefName = file.name;
    try {
      const data = JSON.parse(await file.text());
      const { errors } = await runner<{ errors: string[] }>("validate-brief", { brief: data });
      if (errors.length) {
        briefError = `This Video Brief Card is not valid: ${errors.slice(0, 3).join("; ")}`;
        return;
      }
      brief = data;
      if (!title && typeof data.title === "string") title = data.title;
      if (typeof data.language === "string") language = data.language;
    } catch (err) {
      briefError = err instanceof SyntaxError ? "The file is not valid JSON." : errorText(err);
    }
  }

  async function create() {
    creating = true;
    error = "";
    try {
      const r = await runner<{ id: string; dir: string }>("create-project", {
        projectsDir: app.projectsDir,
        title: title.trim(),
        language,
        brief,
        autopilot,
      });
      openProject(r.dir);
    } catch (e) {
      error = errorText(e);
    } finally {
      creating = false;
    }
  }

  const when = (iso: string) => (iso ? new Date(iso).toLocaleDateString() : "");
</script>

<div class="page">
  <EngineBanner />
  <header>
    <h1>Projects</h1>
    <button type="button" class="primary" onclick={() => (showNew = !showNew)}>{showNew ? "Cancel" : "New video"}</button>
  </header>

  {#if showNew}
    <section class="card new">
      <h2>New video</h2>
      <div class="field">
        <label for="topic">Topic or title</label>
        <input id="topic" bind:value={title} placeholder="Example: How to start a YouTube channel in 2026" />
      </div>
      <div class="grid">
        <div class="field">
          <label for="plang">Content language</label>
          <select id="plang" bind:value={language}>
            {#each LANGUAGES as l}<option value={l.code}>{l.label}</option>{/each}
          </select>
        </div>
        <div class="field">
          <label for="brief">Video Brief Card (optional)</label>
          <input id="brief" type="file" accept=".json,application/json" onchange={pickBrief} />
          {#if brief}<p class="good">{briefName} loaded.</p>{/if}
          {#if briefError}<p class="bad">{briefError}</p>{/if}
        </div>
      </div>
      <label class="check"><input type="checkbox" bind:checked={autopilot} /> Autopilot: approve every gate automatically</label>
      <div class="actions">
        <button type="button" class="primary" disabled={creating || (!title.trim() && !brief)} onclick={create}>Create project</button>
      </div>
    </section>
  {/if}

  {#if error}<ErrorBox message={error} context={{ step: "projects" }} />{/if}

  {#if loading}
    <p class="hint">Loading...</p>
  {:else if projects.length === 0}
    <section class="card empty">
      <p>No videos yet. Click <strong>New video</strong> to start with a topic.</p>
      <p class="hint">Projects are saved in {app.projectsDir}</p>
    </section>
  {:else}
    <ul class="list">
      {#each projects as p}
        <li>
          <button type="button" class="item" onclick={() => openProject(p.dir)}>
            <span class="title">{p.title}</span>
            <span class="status">{p.status}</span>
            <span class="date">{when(p.createdAt)}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .page { padding: 24px; max-width: 900px; margin: 0 auto; display: grid; gap: 16px; }
  header { display: flex; justify-content: space-between; align-items: center; }
  h1 { margin: 0; }
  h2 { margin: 0 0 12px; font-size: 17px; }
  .field { display: grid; gap: 6px; margin-bottom: 12px; }
  label { font-weight: 600; font-size: 14px; }
  .check { font-weight: 400; display: flex; gap: 6px; align-items: center; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .actions { display: flex; justify-content: flex-end; margin-top: 12px; }
  .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .item { width: 100%; display: grid; grid-template-columns: 1fr 120px 110px; gap: 12px; text-align: left; padding: 14px 16px; }
  .title { font-weight: 600; }
  .status, .date { color: var(--muted-foreground); font-size: 14px; }
  .hint { color: var(--muted-foreground); font-size: 13px; word-break: break-all; }
  .good { color: var(--success); margin: 0; font-size: 13px; }
  .bad { color: var(--danger-text); margin: 0; font-size: 13px; }
  .empty p { margin: 4px 0; }
</style>
