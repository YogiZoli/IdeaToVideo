<script lang="ts">
  // Settings: every onboarding field, editable any time (PRD 5), plus the
  // projects folder. Keys save immediately; the rest on "Save settings".
  import { untrack } from "svelte";
  import { open } from "@tauri-apps/plugin-dialog";
  import type { Config, AppState } from "./api";
  import { saveConfig, errorText } from "./api";
  import { cleanConfig } from "./catalog";
  import { STEPS, recommendStep } from "./steps";
  import ConfigSection from "./ConfigSection.svelte";

  let { app, saved }: { app: AppState; saved: (s: AppState) => void } = $props();

  // a working copy: edits stay local until "Save settings"
  let config = $state<Config>(untrack(() => structuredClone(app.config!)));
  let keys = $state(untrack(() => ({ ...app.keys })));
  let busy = $state(false);
  let message = $state("");
  let error = $state("");

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

  async function chooseFolder() {
    const dir = await open({ directory: true, multiple: false });
    if (typeof dir === "string") config.projectsDir = dir;
  }
</script>

<div class="page">
  <header>
    <h1>Settings</h1>
    <button type="button" class="primary" disabled={busy} onclick={save}>Save settings</button>
  </header>
  {#if message}<p class="good">{message}</p>{/if}
  {#if error}<p class="bad">{error}</p>{/if}

  {#each STEPS.filter((s) => s.id !== "import") as s}
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
    <p>Studio {app.version}. Built on HyperFrames by HeyGen (Apache-2.0).</p>
    <p>No support, no installation help.</p>
  </section>
</div>

<style>
  .page { padding: 24px; max-width: 820px; margin: 0 auto; display: grid; gap: 16px; }
  header { display: flex; justify-content: space-between; align-items: center; }
  h1 { margin: 0; }
  h2 { margin: 0 0 12px; font-size: 17px; }
  .head { display: flex; justify-content: space-between; align-items: center; }
  .row { display: flex; gap: 8px; }
  .hint { font-size: 13px; color: var(--muted); word-break: break-all; }
  .good { color: var(--good); margin: 0; }
  .bad { color: var(--bad); margin: 0; }
  .about p { margin: 4px 0; color: var(--muted); }
</style>
