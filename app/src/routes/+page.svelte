<script lang="ts">
  // App shell: first run shows the setup, afterwards the Identity menu, the
  // Jobs list, ONE Videos and Settings. "New Identity" runs the setup's
  // Identity steps (docs/identity.md 7).
  import { open } from "@tauri-apps/plugin-dialog";
  import { appState, saveSettings, setActiveIdentity, importIdentity, restoreSettings, errorText, type AppState, type Config, type Job } from "$lib/api";
  import { installLogger, log, setScreen, setIdentity } from "$lib/logger";
  import { defaultConfig, cleanConfig } from "$lib/catalog";
  import { appFromConfig, identityFromConfig } from "$lib/identity";
  import { IDENTITY_STEPS } from "$lib/steps";
  import { setKeySources, refreshKeySources } from "$lib/keystate.svelte";
  import { PRODUCT, ONE_VIDEO } from "$lib/edition";
  import type { PageId } from "$lib/pages";
  import Onboarding from "$lib/Onboarding.svelte";
  import Projects from "$lib/Projects.svelte";
  import ProjectView from "$lib/ProjectView.svelte";
  import Settings from "$lib/Settings.svelte";
  import IdentityMenu from "$lib/IdentityMenu.svelte";
  import Jobs from "$lib/Jobs.svelte";
  import "../app.css";

  let app = $state<AppState | null>(null);
  let fatal = $state("");
  let view = $state<"projects" | "settings" | "new-identity">("projects");
  let projectDir = $state<string | null>(null);
  let notice = $state("");
  let settingsPage = $state<PageId>("identity");
  // a new Settings instance whenever the Identity changes from outside it
  let settingsEpoch = $state(0);

  // the setup wizards work on a draft until Finish saves it
  let draft = $state<Config>(defaultConfig());
  let keys = $state<Record<string, boolean>>({});

  function take(s: AppState) {
    app = s;
    keys = { ...s.keys };
    setKeySources(s.keySources);
    setIdentity(s.identity?.id ?? null);
    if (s.notice) {
      notice = s.notice;
      log("notice_shown", { message: s.notice }, "warn");
    }
  }

  installLogger();
  async function init() {
    try {
      const s = await appState();
      take(s);
      log("app_state", {
        onboarded: !!s.app?.onboarded,
        identities: s.identities.length,
        identity: s.identity?.id ?? null,
        tier: s.edition.tier,
        keys: s.keySources,
        backup: s.backupRoot ? { root: s.backupRoot, level: s.app?.backup?.level ?? 4, auto: s.app?.backup?.auto ?? true } : null,
        projectsDir: s.projectsDir,
        version: s.version,
      });
      if (!s.app?.onboarded || !s.identity) setScreen("setup");
    } catch (e) {
      fatal = errorText(e);
      log("fatal", { message: fatal }, "error");
    }
  }
  init();

  // A new computer: settings and Identities from a backup folder.
  let restoring = $state(false);
  let restoreError = $state("");
  async function restoreFromBackup() {
    const dir = await open({ directory: true, multiple: false });
    if (typeof dir !== "string") return;
    restoring = true;
    restoreError = "";
    try {
      take(await restoreSettings(dir));
      notice = `Restored from the backup. Add your API keys again in Settings: they are never in a backup.${notice ? " " + notice : ""}`;
      view = "projects";
    } catch (e) {
      restoreError = errorText(e);
    } finally {
      restoring = false;
    }
  }

  // Keys saved or removed in Settings count at once everywhere else (they
  // live in the system keychain, not in the settings file).
  async function refreshKeys() {
    if (!app) return;
    try {
      app = { ...app, keys: await refreshKeySources() };
    } catch {
      // keep the last known state
    }
  }
  async function show(v: "projects" | "settings", page: PageId = settingsPage) {
    settingsPage = page;
    if (v === "settings") settingsEpoch++;
    view = v;
    projectDir = null;
    await refreshKeys();
  }
  async function openProject(d: string) {
    await refreshKeys();
    projectDir = d;
  }

  async function choose(id: string) {
    if (id === app?.identity?.id) return show("projects");
    try {
      take(await setActiveIdentity(id));
      settingsEpoch++;
      projectDir = null;
      if (view === "new-identity") view = "projects";
    } catch (e) {
      notice = errorText(e);
    }
  }

  function newIdentity() {
    draft = { ...defaultConfig(), name: "", llm: { ...app!.app!.llm } };
    setScreen("new-identity");
    view = "new-identity";
    projectDir = null;
  }

  async function importOne() {
    const path = await open({ multiple: false, directory: false, filters: [{ name: "Identity", extensions: ["zip"] }] });
    if (typeof path !== "string") return;
    try {
      take(await importIdentity(path));
      notice = `Imported "${app?.identity?.name}". Its own API keys are not in the file: add them on its "AI and keys" page if it needs any.`;
      await show("settings", "identity");
    } catch (e) {
      notice = errorText(e);
    }
  }

  async function openJob(j: Job) {
    if (j.identity && j.identity !== app?.identity?.id) await choose(j.identity);
    view = "projects";
    if (j.project) await openProject(j.project);
  }

  // first run: the App settings and the first Identity, in one save
  const saveFirst = (c: Config) => saveSettings(appFromConfig(c, null), identityFromConfig(c, null, null));
  // New Identity: only the Identity; the core makes it the active one
  const saveNew = (c: Config) => saveSettings(null, identityFromConfig(cleanConfig(c), null, null));
</script>

{#if fatal}
  <main class="center"><p class="bad">{PRODUCT} could not start: {fatal}</p></main>
{:else if !app}
  <main class="center"><p class="muted">Starting...</p></main>
{:else if !app.app?.onboarded || !app.identity}
  <main>
    <div class="brandbar"><span class="name"><img src="/icon.png" alt="" />{PRODUCT}</span><span class="muted">Setup</span></div>
    <div class="restorebar">
      <span>New computer, with a backup from the old one?</span>
      <button type="button" disabled={restoring} onclick={restoreFromBackup}>{restoring ? "Restoring..." : "Restore from a backup"}</button>
      {#if restoreError}<span class="bad">{restoreError}</span>{/if}
    </div>
    <Onboarding bind:config={draft} bind:keys save={saveFirst} done={take} newIdentity />
  </main>
{:else}
  <main class="shell">
    <nav class="brandbar">
      <span class="name"><img src="/icon.png" alt="" />{PRODUCT}</span>
      <IdentityMenu
        {app}
        {choose}
        {newIdentity}
        duplicate={() => show("settings", "identity")}
        importIdentity={importOne}
        settings={() => show("settings", "identity")}
      />
      <button type="button" class:active={view === "projects"} onclick={() => show("projects")}>{ONE_VIDEO}</button>
      <button type="button" class:active={view === "settings"} onclick={() => show("settings", "identity")}>Settings</button>
      <Jobs {openJob} />
    </nav>
    {#if notice}
      <div class="notice"><span>{notice}</span><button type="button" class="ghost" onclick={() => (notice = "")}>Close</button></div>
    {/if}
    <div class="view">
    {#if view === "new-identity"}
      <Onboarding
        bind:config={draft}
        bind:keys
        only={IDENTITY_STEPS}
        save={saveNew}
        done={(s) => { take(s); view = "projects"; }}
        cancel={() => (view = "projects")}
        title="New Identity"
        newIdentity
      />
    {:else if view === "settings"}
      {#key settingsEpoch}
        <Settings {app} saved={take} startPage={settingsPage} />
      {/key}
    {:else if projectDir}
      {#key projectDir}
        <ProjectView {app} dir={projectDir} back={() => (projectDir = null)} />
      {/key}
    {:else}
      {#key app.identity.id}
        <Projects {app} {openProject} />
      {/key}
    {/if}
    </div>
  </main>
{/if}

<style>
  /* The top bar stays; each view scrolls in its own area, so a ONE Video's
     tabs and its action bar fit one screen (DECISIONS 85). */
  .shell { display: flex; flex-direction: column; height: 100vh; }
  .view { flex: 1; min-height: 0; overflow: auto; }
  .center { display: grid; place-items: center; min-height: 100vh; }
  .brandbar { display: flex; gap: 6px; align-items: center; padding: 10px 20px; border-bottom: 1px solid var(--border); background: var(--surface); }
  .brandbar { position: relative; }
  .brandbar::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 2px; background: var(--hairline); }
  .name { display: inline-flex; align-items: center; gap: 10px; margin-right: 18px; font-weight: 700; font-size: var(--text-lg); }
  .name img { width: 26px; height: 26px; }
  .brandbar > button { border: none; background: none; padding: 6px 12px; }
  .brandbar > button.active { background: var(--primary-surface); color: var(--primary-surface-foreground); font-weight: 600; }
  .restorebar { display: flex; gap: 12px; align-items: center; justify-content: flex-end; padding: 10px 24px 0; max-width: 1040px; margin: 0 auto; font-size: 14px; color: var(--muted-foreground); flex-wrap: wrap; }
  .notice { display: flex; gap: 12px; align-items: center; justify-content: space-between; padding: 10px 20px; background: var(--warning-surface); color: var(--warning-text); font-size: 14px; }
  .muted { color: var(--muted-foreground); }
  .bad { color: var(--danger-text); }
</style>
