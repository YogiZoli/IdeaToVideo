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
  <main class="center"><p class="bad">IdeaToVideo could not start: {fatal}</p></main>
{:else if !app}
  <main class="center"><p class="muted">Starting...</p></main>
{:else if !app.config?.onboarded}
  <main>
    <div class="brandbar"><span class="name"><img src="/icon.png" alt="" />IdeaToVideo</span><span class="muted">Setup</span></div>
    <Onboarding bind:config={draft} bind:keys done={updated} />
  </main>
{:else}
  <main>
    <nav class="brandbar">
      <span class="name"><img src="/icon.png" alt="" />IdeaToVideo</span>
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
  .brandbar { display: flex; gap: 6px; align-items: center; padding: 10px 20px; border-bottom: 1px solid var(--border); background: var(--surface); }
  .brandbar { position: relative; }
  .brandbar::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 2px; background: var(--hairline); }
  .name { display: inline-flex; align-items: center; gap: 10px; margin-right: 22px; font-weight: 700; font-size: var(--text-lg); }
  .name img { width: 26px; height: 26px; }
  .brandbar button { border: none; background: none; padding: 6px 12px; }
  .brandbar button.active { background: var(--primary-surface); color: var(--primary-surface-foreground); font-weight: 600; }
  .muted { color: var(--muted-foreground); }
  .bad { color: var(--danger-text); }
</style>
