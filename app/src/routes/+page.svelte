<script lang="ts">
  // App shell: first run shows the setup, afterwards the top menu (Home,
  // Videos, Wizards, Identity, Settings; DECISIONS 119), the Identity menu
  // and the Jobs list. "New Identity" runs the setup's Identity steps
  // (docs/identity.md 7).
  import { open } from "@tauri-apps/plugin-dialog";
  import { appState, saveSettings, setActiveIdentity, restoreSettings, errorText, type AppState, type Config, type Job } from "$lib/api";
  import { installLogger, log, setScreen, setIdentity } from "$lib/logger";
  import { defaultConfig, cleanConfig } from "$lib/catalog";
  import { appFromConfig, identityFromConfig } from "$lib/identity";
  import { IDENTITY_STEPS } from "$lib/steps";
  import { setKeySources, refreshKeySources } from "$lib/keystate.svelte";
  import { PRODUCT, ONE_VIDEO } from "$lib/edition";
  import { MENUS, menuOf, firstPage, type PageId, type MenuId } from "$lib/pages";
  import Onboarding from "$lib/Onboarding.svelte";
  import Projects from "$lib/Projects.svelte";
  import ProjectView from "$lib/ProjectView.svelte";
  import Settings from "$lib/Settings.svelte";
  import IdentityMenu from "$lib/IdentityMenu.svelte";
  import Jobs from "$lib/Jobs.svelte";
  import Home from "$lib/Home.svelte";
  import "../app.css";

  let app = $state<AppState | null>(null);
  let fatal = $state("");
  let view = $state<"home" | "projects" | "settings" | "new-identity">("home");
  // Home's "Make a video": the list opens with the new ONE Video form
  let startNew = $state(false);
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
      view = "home";
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
  async function show(v: "home" | "projects" | "settings", page: PageId = settingsPage) {
    settingsPage = page;
    if (v === "settings") settingsEpoch++;
    if (v !== "projects") startNew = false;
    view = v;
    projectDir = null;
    await refreshKeys();
  }
  // one of the five top menus
  function menu(m: MenuId) {
    if (m === "home") return show("home");
    if (m === "videos") return show("projects");
    return show("settings", view === "settings" && menuOf(settingsPage) === m ? settingsPage : firstPage(m));
  }
  const goto = (page: PageId) => show("settings", page);
  const current = $derived<MenuId>(view === "home" ? "home" : view === "settings" ? menuOf(settingsPage) : "videos");
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
      if (view === "new-identity") view = "home";
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

  async function openJob(j: Job) {
    if (j.identity && j.identity !== app?.identity?.id) await choose(j.identity);
    view = "projects";
    if (j.project) await openProject(j.project);
  }

  // first run: the App settings and the first Identity, in one save
  const saveFirst = (c: Config) => saveSettings(appFromConfig(c, null), identityFromConfig(c, null, null));
  // New Identity: only the Identity; the core makes it the active one
  // a page that broke while drawing (the boundary above): into the log, in full
  function crashed(error: unknown) {
    const e = error as { message?: string; stack?: string };
    log("ui_crash", { message: errorText(error), stack: String(e?.stack ?? "").slice(0, 1500), view, project: projectDir }, "error");
  }
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
        settings={() => show("settings", "identity")}
      />
      {#each MENUS as m (m.id)}
        <button type="button" class:active={current === m.id} onclick={() => menu(m.id)}>{m.title}</button>
      {/each}
      <Jobs {openJob} />
    </nav>
    {#if notice}
      <div class="notice"><span>{notice}</span><button type="button" class="ghost" onclick={() => (notice = "")}>Close</button></div>
    {/if}
    <div class="view">
    <!-- A page that breaks while it draws never leaves a blank window: the
         top bar stays, the user reads what happened and can go on (2026-10-06). -->
    <svelte:boundary onerror={crashed}>
    {#if view === "new-identity"}
      <Onboarding
        bind:config={draft}
        bind:keys
        only={IDENTITY_STEPS}
        save={saveNew}
        done={(s) => { take(s); view = "home"; }}
        cancel={() => (view = "home")}
        title="New Identity"
        newIdentity
      />
    {:else if view === "settings"}
      {#key settingsEpoch}
        <Settings {app} saved={take} startPage={settingsPage} {goto} />
      {/key}
    {:else if projectDir}
      {#key projectDir}
        <ProjectView {app} dir={projectDir} back={() => (projectDir = null)} saved={take} connections={() => goto("connections")} />
      {/key}
    {:else if view === "home"}
      {#key app.identity.id}
        <Home {app} {goto} {openProject} makeVideo={() => { startNew = true; view = "projects"; }} videos={() => show("projects")} />
      {/key}
    {:else}
      {#key app.identity.id}
        <Projects {app} {openProject} {startNew} />
      {/key}
    {/if}
    {#snippet failed(error, reset)}
      <div class="crash">
        <h2>This page ran into a problem</h2>
        <p>Nothing was lost: every job keeps running, and your ONE Videos are saved. Try the page again, or go back to the list.</p>
        <p class="muted">{errorText(error)}</p>
        <div class="row">
          <button type="button" class="primary" onclick={reset}>Try again</button>
          <button type="button" onclick={() => { projectDir = null; view = "projects"; reset(); }}>Back to the {ONE_VIDEO} list</button>
        </div>
      </div>
    {/snippet}
    </svelte:boundary>
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
  .crash { max-width: 640px; margin: 48px auto; padding: 24px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); display: grid; gap: 12px; }
  .crash h2, .crash p { margin: 0; }
  .crash .row { display: flex; gap: 10px; flex-wrap: wrap; }
  .bad { color: var(--danger-text); }
</style>
