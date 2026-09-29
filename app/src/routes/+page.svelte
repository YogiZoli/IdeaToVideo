<script lang="ts">
  // App shell: first run shows onboarding, afterwards Projects / Settings.
  import { appState, errorText, type AppState, type Config } from "$lib/api";
  import { defaultConfig } from "$lib/catalog";
  import Onboarding from "$lib/Onboarding.svelte";
  import Projects from "$lib/Projects.svelte";
  import ProjectView from "$lib/ProjectView.svelte";
  import Settings from "$lib/Settings.svelte";
  import "../app.css";

  let app = $state<AppState | null>(null);
  let fatal = $state("");
  let view = $state<"projects" | "settings">("projects");
  let projectDir = $state<string | null>(null);

  // onboarding works on a draft until Finish saves it
  let draft = $state<Config>(defaultConfig());
  let keys = $state<Record<string, boolean>>({});

  async function init() {
    try {
      app = await appState();
      keys = { ...app.keys };
      if (app.config) draft = { ...defaultConfig(), ...app.config };
    } catch (e) {
      fatal = errorText(e);
    }
  }
  init();

  function updated(s: AppState) {
    app = s;
    keys = { ...s.keys };
  }
</script>

{#if fatal}
  <main class="center"><p class="bad">Studio could not start: {fatal}</p></main>
{:else if !app}
  <main class="center"><p class="muted">Starting...</p></main>
{:else if !app.config?.onboarded}
  <main>
    <div class="brandbar"><strong>Studio</strong><span class="muted">Setup</span></div>
    <Onboarding bind:config={draft} bind:keys done={updated} />
  </main>
{:else}
  <main>
    <nav class="brandbar">
      <strong>Studio</strong>
      <button type="button" class:active={view === "projects"} onclick={() => { view = "projects"; projectDir = null; }}>Projects</button>
      <button type="button" class:active={view === "settings"} onclick={() => { view = "settings"; projectDir = null; }}>Settings</button>
    </nav>
    {#if view === "settings"}
      <Settings {app} saved={updated} />
    {:else if projectDir}
      {#key projectDir}
        <ProjectView {app} dir={projectDir} back={() => (projectDir = null)} />
      {/key}
    {:else}
      <Projects {app} openProject={(d) => (projectDir = d)} />
    {/if}
  </main>
{/if}

<style>
  .center { display: grid; place-items: center; min-height: 100vh; }
  .brandbar { display: flex; gap: 6px; align-items: center; padding: 10px 20px; border-bottom: 1px solid var(--line); background: var(--panel); }
  .brandbar strong { margin-right: 18px; font-size: 16px; }
  .brandbar button { border: none; background: none; padding: 6px 12px; }
  .brandbar button.active { background: var(--accent-bg); color: var(--accent); font-weight: 600; }
  .muted { color: var(--muted); }
  .bad { color: var(--bad); }
</style>
