<script lang="ts">
  // Settings: every onboarding field, editable any time (PRD 5), plus the
  // projects folder, split into sub-pages (pages.ts) so one shows at a time.
  // Each page can re-run its part of the setup wizard. Keys save
  // immediately; the rest on "Save settings".
  import { untrack } from "svelte";
  import { open } from "@tauri-apps/plugin-dialog";
  import type { Config, AppState } from "./api";
  import { saveConfig, errorText, deleteAllKeys, keyStatus } from "./api";
  import { ask } from "@tauri-apps/plugin-dialog";
  import { cleanConfig } from "./catalog";
  import { STEPS, recommendStep } from "./steps";
  import { SETTINGS_PAGES, type PageId } from "./pages";
  import ConfigSection from "./ConfigSection.svelte";
  import Onboarding from "./Onboarding.svelte";
  import ErrorBox from "./ErrorBox.svelte";


  let { app, saved }: { app: AppState; saved: (s: AppState) => void } = $props();

  // a working copy: edits stay local until "Save settings". $state.snapshot,
  // not structuredClone: a reactive proxy cannot be cloned (DataCloneError).
  let config = $state<Config>(untrack(() => $state.snapshot(app.config!) as Config));
  let keys = $state(untrack(() => ({ ...app.keys })));
  let busy = $state(false);
  let message = $state("");
  let error = $state("");
  let pageId = $state<PageId>("ai");
  let wizard = $state(false);
  const page = $derived(SETTINGS_PAGES.find((p) => p.id === pageId)!);

  function wizardDone(s: AppState) {
    saved(s);
    config = $state.snapshot(s.config!) as Config;
    wizard = false;
    message = "Settings saved.";
  }

  async function save() {
    busy = true;
    message = "";
    error = "";
    try {
      const s = await saveConfig(cleanConfig(config));
      saved(s);
      message = "Settings saved.";
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }

  async function recommend(id: "audience" | "brandVoice") {
    busy = true;
    error = "";
    try {
      config = await recommendStep(id, config);
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }

  async function removeAllKeys() {
    if (!(await ask("Remove every API key this app saved in the system keychain? You can add them again any time.", { title: "Remove all keys", kind: "warning" }))) return;
    busy = true;
    error = "";
    try {
      await deleteAllKeys();
      keys = await keyStatus();
      message = "All keys removed from the system keychain.";
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }

  async function chooseFolder() {
    const dir = await open({ directory: true, multiple: false });
    if (typeof dir === "string") config.projectsDir = dir;
  }
</script>

{#if wizard}
  <Onboarding bind:config bind:keys only={page.steps} done={wizardDone} cancel={() => (wizard = false)} />
{:else}
<div class="layout">
  <nav class="pages">
    {#each SETTINGS_PAGES as p}
      <button type="button" class:current={p.id === pageId} onclick={() => { pageId = p.id; message = ""; }}>{p.title}</button>
    {/each}
  </nav>
  <div class="page">
    <header>
      <h1>{page.title}</h1>
      <button type="button" class="primary" disabled={busy} onclick={save}>Save settings</button>
    </header>
    {#if message}<p class="good">{message}</p>{/if}
    {#if error}<ErrorBox message={error} context={{ step: "settings", provider: config.llm.provider, model: config.llm.model }} />{/if}

    {#if page.steps.length}
      <div class="rerun">
        <p class="hint">Want to rethink this part? The setup wizard walks you through it again, step by step.</p>
        <button type="button" disabled={busy} onclick={() => { message = ""; wizard = true; }}>Run setup for this part again</button>
      </div>
    {/if}

    {#each STEPS.filter((s) => page.steps.includes(s.id)) as s (s.id)}
      <section class="card">
        <div class="head">
          <h2>{s.title}</h2>
          {#if s.id === "audience" || s.id === "brandVoice"}
            <button type="button" disabled={busy} onclick={() => recommend(s.id as "audience" | "brandVoice")}>Use recommended</button>
          {/if}
        </div>
        <ConfigSection id={s.id} bind:config bind:keys />
      </section>
    {/each}

    {#if pageId === "ai"}
      <section class="card">
        <h2>Remove all keys</h2>
        <p class="hint">Keys are stored only in your system keychain. Remove them all here, for example before you uninstall.</p>
        <div class="row"><button type="button" disabled={busy} onclick={removeAllKeys}>Remove all keys</button></div>
      </section>
    {/if}

    {#if pageId === "general"}
      <section class="card">
        <h2>Projects folder</h2>
        <p class="hint">Now: {config.projectsDir || app.defaultProjectsDir}</p>
        <div class="row">
          <button type="button" onclick={chooseFolder}>Choose folder</button>
          {#if config.projectsDir}
            <button type="button" class="ghost" onclick={() => (config.projectsDir = null)}>Use default</button>
          {/if}
        </div>
      </section>

      <section class="card about">
        <h2>About</h2>
        <p>IdeaToVideo {app.version}. Built on HyperFrames by HeyGen (Apache-2.0).</p>
        <p>No support, no installation help.</p>
      </section>
    {/if}
  </div>
</div>
{/if}

<style>
  .layout { display: grid; grid-template-columns: 200px 1fr; gap: 24px; padding: 24px; max-width: 1040px; margin: 0 auto; }
  .pages { display: grid; gap: 2px; align-content: start; }
  .pages button { width: 100%; justify-content: flex-start; text-align: left; border: none; background: none; padding: 6px 10px; border-radius: 6px; }
  .pages .current { background: var(--primary-surface); color: var(--primary-surface-foreground); font-weight: 600; }
  .page { display: grid; gap: 16px; align-content: start; min-width: 0; }
  .rerun { display: flex; gap: 12px; align-items: center; justify-content: space-between; }
  .rerun .hint { margin: 0; word-break: normal; }
  .rerun button { white-space: nowrap; flex: none; }
  header { display: flex; justify-content: space-between; align-items: center; }
  h1 { margin: 0; }
  h2 { margin: 0 0 12px; font-size: 17px; }
  .head { display: flex; justify-content: space-between; align-items: center; }
  .row { display: flex; gap: 8px; }
  .hint { font-size: 13px; color: var(--muted-foreground); word-break: break-all; }
  .good { color: var(--success); margin: 0; }
  .about p { margin: 4px 0; color: var(--muted-foreground); }
</style>
