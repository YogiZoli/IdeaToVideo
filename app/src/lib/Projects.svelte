<script lang="ts">
  // The active Identity's ONE Videos + New ONE Video (topic, length,
  // language, optional Video Brief Card JSON, validated by the runner before
  // anything is created). A ONE Video goes in the Identity's own folder.
  // A course (DECISIONS 121) is only a filter on this list: its lessons in
  // playlist order, each with its ONE Video's status. The work is still on
  // one video at a time.
  import { untrack } from "svelte";
  import type { AppState, ProjectSummary } from "./api";
  import { runner, errorText } from "./api";
  import { save as saveDialog } from "@tauri-apps/plugin-dialog";
  import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
  import type { Course } from "./course/course";
  import { playlistLink } from "./course/course";
  import { LANGUAGES } from "./catalog";
  import { ONE_VIDEO } from "./edition";
  import { setScreen } from "./logger";
  import ErrorBox from "./ErrorBox.svelte";
  import EngineBanner from "./EngineBanner.svelte";


  let { app, openProject, startNew = false }: { app: AppState; openProject: (dir: string) => void; startNew?: boolean } = $props();

  let projects = $state<ProjectSummary[]>([]);
  let loading = $state(true);
  let error = $state("");

  // Home's "Make a video" opens the list with the new ONE Video form open
  let showNew = $state(untrack(() => startNew));
  let title = $state("");
  let language = $state(untrack(() => app.config?.channel.contentLanguage ?? "en"));
  let autopilot = $state(untrack(() => app.config?.defaults?.autopilot ?? false));
  let brief = $state<Record<string, unknown> | null>(null);
  let briefName = $state("");
  let briefError = $state("");
  let creating = $state(false);

  setScreen("videos", { identity: untrack(() => app.identity?.id) });

  // "Restore from backup": this Identity's backed-up ONE Videos that are
  // not on this computer (docs/backup.md 5).
  type Backup = { path: string; title: string | null; projectId: string; at: string; level: number; here: boolean };
  let showRestore = $state(false);
  let backups = $state<Backup[] | null>(null);
  let restoring = $state("");
  async function openRestore() {
    showRestore = !showRestore;
    if (!showRestore) return;
    backups = null;
    error = "";
    try {
      backups = (await runner<{ backups: Backup[] }>("list-backups", { projectsDir: app.projectsDir })).backups;
    } catch (e) {
      error = errorText(e);
      showRestore = false;
    }
  }
  async function restore(b: Backup) {
    restoring = b.path;
    error = "";
    try {
      const r = await runner<{ dir: string; reset: boolean }>("restore-project", { projectsDir: app.projectsDir, path: b.path });
      showRestore = false;
      openProject(r.dir);
    } catch (e) {
      error = errorText(e);
    } finally {
      restoring = "";
    }
  }

  async function load() {
    loading = true;
    error = "";
    try {
      projects = (await runner<{ projects: ProjectSummary[] }>("list-projects", { projectsDir: app.projectsDir })).projects;
      courses = (await runner<{ courses: Course[] }>("course-list", { projectsDir: app.projectsDir })).courses;
      if (!courses.some((c) => c.slug === courseSlug)) courseSlug = "";
    } catch (e) {
      error = errorText(e);
    } finally {
      loading = false;
    }
  }

  // The course filter: "" shows every ONE Video.
  let courses = $state<Course[]>([]);
  let courseSlug = $state("");
  const course = $derived(courses.find((c) => c.slug === courseSlug) ?? null);
  const coursePlaylist = $derived(playlistLink(course?.playlist?.url));
  let exported = $state("");
  async function exportCourse() {
    if (!course) return;
    const file = await saveDialog({ title: "Export Course Content Structure", defaultPath: `${course.slug}-course-content-structure.json`, filters: [{ name: "Course Content Structure", extensions: ["json"] }] });
    if (typeof file !== "string") return;
    error = "";
    try {
      exported = (await runner<{ file: string }>("course-export", { projectsDir: app.projectsDir, slug: course.slug, file })).file;
    } catch (e) {
      error = errorText(e);
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
        identity: app.identity?.id,
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
    <div>
      <p class="for">{app.identity?.name}</p>
      <h1>{ONE_VIDEO}</h1>
    </div>
    <span class="actions-top">
      {#if app.backupRoot}<button type="button" onclick={openRestore}>{showRestore ? "Close" : "Restore from backup"}</button>{/if}
      <button type="button" class="primary" onclick={() => (showNew = !showNew)}>{showNew ? "Cancel" : `New ${ONE_VIDEO}`}</button>
    </span>
  </header>

  {#if showRestore}
    <section class="card">
      <h2>Restore from backup</h2>
      {#if backups === null}
        <p class="hint">Reading the backup folder...</p>
      {:else if backups.filter((b) => !b.here).length === 0}
        <p class="hint">Every backed-up {ONE_VIDEO} of {app.identity?.name} is already on this computer.</p>
      {:else}
        <p class="hint">Backed up, but not on this computer. Parts that were not in the backup (a lower level) can be made again at their step.</p>
        <ul class="list">
          {#each backups.filter((b) => !b.here) as b (b.path)}
            <li class="restore">
              <span class="title">{b.title ?? b.projectId}</span>
              <span class="date">level {b.level}, {new Date(b.at).toLocaleDateString()}</span>
              <button type="button" disabled={!!restoring} onclick={() => restore(b)}>{restoring === b.path ? "Restoring..." : "Restore"}</button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}

  {#if showNew}
    <section class="card new">
      <h2>New {ONE_VIDEO}</h2>
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
        <button type="button" class="primary" disabled={creating || (!title.trim() && !brief)} onclick={create}>Create {ONE_VIDEO}</button>
      </div>
    </section>
  {/if}

  {#if error}<ErrorBox message={error} context={{ step: "projects" }} />{/if}

  {#if loading}
    <p class="hint">Loading...</p>
  {:else if projects.length === 0}
    <section class="card empty">
      <p>No {ONE_VIDEO} for {app.identity?.name} yet. Click <strong>New {ONE_VIDEO}</strong> to start with a topic.</p>
      <p class="hint">They are saved in {app.projectsDir}</p>
    </section>
  {:else}
    {#if courses.length}
      <div class="filter">
        <label for="course">Course</label>
        <select id="course" bind:value={courseSlug} onchange={() => (exported = "")}>
          <option value="">All videos</option>
          {#each courses as c (c.slug)}<option value={c.slug}>{c.title}</option>{/each}
        </select>
      </div>
    {/if}
  {/if}

  {#if !loading && course}
    <section class="card course">
      <p class="hint plain">{course.lessons.length} {course.lessons.length === 1 ? "lesson" : "lessons"}, in playlist order. Work on one lesson at a time; upload them to YouTube in this order.
        {#if coursePlaylist}Playlist: <button type="button" class="link" onclick={() => openUrl(coursePlaylist)}>{coursePlaylist}</button>{:else}No playlist link yet.{/if}
      </p>
      <span class="actions-top">
        <button type="button" disabled={!course.hasFile} title={course.hasFile ? "The file as it came, unchanged: for the publishing app, or back to the Minicourse page" : "The file of this course is not on this computer any more"} onclick={exportCourse}>Export Course Content Structure</button>
      </span>
      {#if exported}<p class="good">Exported, unchanged. <button type="button" class="link" onclick={() => revealItemInDir(exported)}>Show in folder</button></p>{/if}
    </section>
    <ul class="list">
      {#each course.lessons as l (l.id)}
        <li>
          <button type="button" class="item lesson" disabled={!l.dir} title={l.dir ? "" : "This lesson has no ONE Video. Import the course again on Settings, Import & Export to make it."} onclick={() => l.dir && openProject(l.dir)}>
            <span class="pos">Lesson {l.position} of {course.lessons.length}</span>
            <span class="title">{l.videoTitle ?? l.title}</span>
            <span class="status">{l.status ?? "Not created"}</span>
          </button>
        </li>
      {/each}
    </ul>
  {:else if !loading && projects.length}
    <ul class="list">
      {#each projects as p}
        <li>
          <button type="button" class="item" onclick={() => openProject(p.dir)}>
            <span class="title">{p.title}{#if p.series}<span class="tag">Lesson {p.series.playlistPosition}{p.series.courseTitle ? `, ${p.series.courseTitle}` : ""}</span>{/if}</span>
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
  .for { margin: 0; font-size: 13px; color: var(--muted-foreground); }
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
  .actions-top { display: flex; gap: 8px; }
  .filter { display: flex; gap: 10px; align-items: center; }
  .filter select { max-width: 420px; }
  .course { display: grid; gap: 8px; }
  .plain { word-break: break-word; margin: 0; }
  .lesson { grid-template-columns: 130px 1fr 120px; }
  .pos { color: var(--muted-foreground); font-size: 14px; }
  .tag { display: block; font-weight: 400; font-size: 12px; color: var(--muted-foreground); }
  .link { border: none; background: none; padding: 0; color: var(--primary); text-decoration: underline; cursor: pointer; font-size: inherit; font-family: inherit; min-height: 0; }
  .restore { display: grid; grid-template-columns: 1fr 160px auto; gap: 12px; align-items: center; padding: 6px 0; }
</style>
