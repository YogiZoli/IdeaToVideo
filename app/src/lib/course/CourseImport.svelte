<script lang="ts">
  // Course import (DECISIONS 121), on Settings, Import & Export: a Course
  // Content Structure from the Minicourse page, as a file or as pasted text
  // (its "Copy for IdeaToVideo" button). One parser reads both. A preview
  // comes first; the ONE Videos are made only after "Create". The import
  // only prepares: it calls no service and starts no step.
  import { onMount } from "svelte";
  import { open, save as saveDialog } from "@tauri-apps/plugin-dialog";
  import { revealItemInDir, openUrl } from "@tauri-apps/plugin-opener";
  import type { AppState } from "../api";
  import { runner, errorText } from "../api";
  import { log } from "../logger";
  import ErrorBox from "../ErrorBox.svelte";
  import type { Course, CoursePreview, CourseResult } from "./course";
  import { playlistLink, videos } from "./course";

  let { app, off = false }: { app: AppState; off?: boolean } = $props();

  let pasted = $state("");
  let source = $state<{ file: string } | { text: string } | null>(null);
  let preview = $state<CoursePreview | null>(null);
  let result = $state<CourseResult | null>(null);
  let error = $state("");
  let busy = $state(false);
  let exported = $state("");

  let courses = $state<Course[]>([]);
  let slug = $state("");
  async function loadCourses() {
    try {
      courses = (await runner<{ courses: Course[] }>("course-list", { projectsDir: app.projectsDir })).courses;
      if (!courses.some((c) => c.slug === slug)) slug = courses[0]?.slug ?? "";
    } catch {
      courses = [];
    }
  }
  onMount(loadCourses);

  async function look(from: { file: string } | { text: string }) {
    busy = true;
    error = "";
    result = null;
    preview = null;
    exported = "";
    try {
      preview = await runner<CoursePreview>("course-preview", { projectsDir: app.projectsDir, ...from });
      source = from;
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }

  async function pickFile() {
    const file = await open({ multiple: false, directory: false, filters: [{ name: "Course Content Structure", extensions: ["json"] }] });
    if (typeof file === "string") await look({ file });
  }

  async function create() {
    if (!source || !preview) return;
    busy = true;
    error = "";
    try {
      result = await runner<CourseResult>("course-import", { projectsDir: app.projectsDir, ...source, identity: app.identity?.id, language: app.config?.channel.contentLanguage ?? "en" });
      log("course_imported", { lessons: result.lessons.length, created: result.created, updated: result.updated, again: result.again });
      preview = null;
      source = null;
      pasted = "";
      await loadCourses();
      slug = result.course.slug;
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }

  function cancel() {
    preview = null;
    source = null;
  }

  async function exportFile() {
    const file = await saveDialog({ title: "Export Course Content Structure", defaultPath: `${slug}-course-content-structure.json`, filters: [{ name: "Course Content Structure", extensions: ["json"] }] });
    if (typeof file !== "string") return;
    error = "";
    try {
      exported = (await runner<{ file: string }>("course-export", { projectsDir: app.projectsDir, slug, file })).file;
      log("course_exported", {});
    } catch (e) {
      error = errorText(e);
    }
  }

  const link = $derived(playlistLink(preview?.playlist?.url));
  const list = (a: string[]) => a.join(", ");
</script>

<div class="r">
  <div><b>Course or playlist (Course Content Structure, .json)</b><span>A course from the Minicourse page or a playlist from the Playlist Planner becomes one prepared ONE Video per entry, for {app.identity?.name}. The import only prepares: no AI, no voice, no HeyGen and no render starts by itself.</span>
    {#if courses.length}<select bind:value={slug} aria-label="Course or playlist to export">{#each courses as c (c.slug)}<option value={c.slug}>{c.title}</option>{/each}</select>{/if}
  </div>
  <div class="acts"><button type="button" disabled={off || busy} onclick={pickFile}>Import</button><button type="button" disabled={off || busy || !slug} title={slug ? "The file as it came, unchanged: for the publishing app, or back to the Minicourse page" : "No course or playlist imported yet"} onclick={exportFile}>Export</button></div>
</div>
<div class="r paste">
  <div><b>Paste a course or playlist</b><span>On the Minicourse page click "Copy for IdeaToVideo", or copy the JSON from the Playlist Planner, then paste here.</span>
    <textarea rows="3" bind:value={pasted} placeholder="Paste the copied text here" aria-label="Paste a course or playlist" spellcheck="false"></textarea>
  </div>
  <div class="acts"><button type="button" disabled={off || busy || !pasted.trim()} onclick={() => look({ text: pasted })}>Preview</button></div>
</div>

{#if error}<ErrorBox message={error} context={{ step: "course-import" }} />{/if}
{#if exported}<p class="good">Course Content Structure exported, unchanged. <button type="button" class="link" onclick={() => revealItemInDir(exported)}>Show in folder</button></p>{/if}

{#if preview}
  <div class="box">
    <h3>{preview.course.title}</h3>
    <p class="meta">{preview.lessons.length} {preview.lessons.length === 1 ? "lesson" : "lessons"}, in playlist order.
      {#if link}Playlist: <button type="button" class="link" onclick={() => openUrl(link)}>{link}</button>{:else}No playlist link in the file.{/if}
    </p>
    <ol>
      {#each preview.lessons as l (l.id)}
        <li value={l.position}><span class="t">{l.title}</span><span class="m">{l.minutes ? `${l.minutes} min` : ""}</span><span class="m">{l.exists ? "Already here: will be updated" : "New"}</span></li>
      {/each}
    </ol>
    {#each preview.warnings as w}<p class="warn">{w}</p>{/each}
    <p class="meta">
      {#if preview.existingCount}This course is already here. {preview.newCount ? `${videos(preview.newCount)} will be created. ` : ""}In the other {preview.existingCount}, only the prefilled texts you have not changed by hand are updated. No video is made twice.{:else}One ONE Video is created per lesson, with the title, keyword, hook, script seed, CTA, YouTube title and description filled in.{/if}
    </p>
    <div class="acts">
      <button type="button" disabled={busy} onclick={cancel}>Cancel</button>
      <button type="button" class="primary" disabled={busy || off} onclick={create}>{busy ? "Working..." : preview.existingCount ? (preview.newCount ? `Create ${videos(preview.newCount)} and update ${preview.existingCount}` : `Update ${videos(preview.existingCount)}`) : `Create ${videos(preview.newCount)}`}</button>
    </div>
  </div>
{/if}

{#if result}
  <div class="box">
    <h3>{result.course.title}: {result.again ? "imported again" : "imported"}</h3>
    <p class="good">{videos(result.created)} created, {result.updated} updated, {result.unchanged} left as they were. Find them on Videos, under Course. Nothing was started: write each script when you are ready.</p>
    <ol>
      {#each result.lessons as l (l.id)}
        <li value={l.position}>
          <span class="t">{l.title}</span>
          <span class="m">{l.action === "created" ? "Created" : l.action === "updated" ? `Updated: ${list(l.updated)}` : "Nothing new"}{l.kept.length ? `. Left alone, you changed it: ${list(l.kept)}` : ""}{l.scriptKept ? ". The script is already written and was not touched" : ""}</span>
        </li>
      {/each}
    </ol>
    {#each result.gone as g (g.id)}<p class="warn">"{g.title}" ({g.id}) is no longer in the course file. Its ONE Video was left alone.</p>{/each}
    <p class="meta">The file is kept with the course, unchanged. <button type="button" class="link" onclick={() => revealItemInDir(result!.file)}>Show in folder</button></p>
  </div>
{/if}

<style>
  .r { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 12px 0; border-top: 1px solid var(--border); }
  .r.paste { align-items: end; }
  .r > div:first-child { display: grid; gap: 4px; }
  .r span { font-size: 13px; color: var(--muted-foreground); }
  .r select { max-width: 360px; }
  textarea { width: 100%; font-family: var(--font-mono, monospace); font-size: 12px; resize: vertical; }
  .acts { display: flex; gap: 8px; align-items: center; justify-content: flex-end; }
  .acts button { min-width: 84px; }
  .box { border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; margin: 4px 0 12px; display: grid; gap: 8px; }
  h3 { margin: 0; font-size: 16px; }
  ol { margin: 0; padding-left: 28px; display: grid; gap: 4px; }
  li { font-size: 14px; }
  .t { font-weight: 600; margin-right: 10px; }
  .m { color: var(--muted-foreground); font-size: 13px; margin-right: 10px; }
  .meta { margin: 0; font-size: 13px; color: var(--muted-foreground); word-break: break-word; }
  .warn { margin: 0; font-size: 13px; padding: 6px 10px; border-radius: 8px; background: var(--warning-surface, var(--muted)); }
  .good { color: var(--success); margin: 0; font-size: 14px; }
  .link { border: none; background: none; padding: 0; color: var(--primary); text-decoration: underline; cursor: pointer; font-size: inherit; font-family: inherit; min-height: 0; }
</style>
