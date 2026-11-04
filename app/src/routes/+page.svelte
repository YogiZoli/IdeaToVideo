<script lang="ts">
  // App shell: first run shows the setup, afterwards the top menu (pages.ts,
  // DECISIONS 119, 168), the Identity menu and the Jobs list. "New Identity"
  // runs the setup's Identity steps (docs/identity.md 7).
  import { open } from "@tauri-apps/plugin-dialog";
  import { appState, saveSettings, setActiveIdentity, restoreSettings, errorText, runner, type AppState, type Config, type Job } from "$lib/api";
  import { installLogger, log, setScreen, setIdentity } from "$lib/logger";
  import { defaultConfig, cleanConfig } from "$lib/catalog";
  import { appFromConfig, identityFromConfig } from "$lib/identity";
  import { IDENTITY_STEPS, QUICK_SETUP } from "$lib/steps";
  import { setKeySources, refreshKeySources } from "$lib/keystate.svelte";
  import { PRODUCT, ONE_VIDEO } from "$lib/edition";
  import { MENUS, menuOf, firstPage, type PageId, type MenuId } from "$lib/pages";
  import type { TabId } from "$lib/tabs";
  import Onboarding from "$lib/Onboarding.svelte";
  import Projects from "$lib/Projects.svelte";
  import ProjectView from "$lib/ProjectView.svelte";
  import Settings from "$lib/Settings.svelte";
  import IdentityMenu from "$lib/IdentityMenu.svelte";
  import Jobs from "$lib/Jobs.svelte";
  import Home from "$lib/Home.svelte";
  import ChannelStudio from "$lib/channels/ChannelStudio.svelte";
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

  // The Health check at startup: silent unless something must be fixed. A problem with
  // the check itself is only a log line, it must never get in the way of the app.
  let healthIssues = $state(0);
  async function silentHealth(s: AppState) {
    try {
      const r = await runner<{ problems: number; items: { id: string; state: string }[] }>("health-check", { projectsDir: s.projectsDir, keys: s.keys });
      healthIssues = r.problems;
      log("health_check", { problems: r.problems, fix: r.items.filter((i) => i.state === "fix").map((i) => i.id) }, r.problems ? "warn" : "info");
    } catch (e) {
      log("health_check_failed", { error: errorText(e) }, "warn");
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
      else silentHealth(s);
    } catch (e) {
      fatal = errorText(e);
      log("fatal", { message: fatal }, "error");
    }
  }
  init();

  // The first setup is the short one; every step is one click away.
  let longSetup = $state(false);

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
  // one of the top menus
  function menu(m: MenuId) {
    if (m === "home") return show("home");
    if (m === "videos") return show("projects");
    return show("settings", view === "settings" && menuOf(settingsPage) === m ? settingsPage : firstPage(m));
  }
  const goto = (page: PageId) => show("settings", page);
  const current = $derived<MenuId>(view === "home" ? "home" : view === "settings" ? menuOf(settingsPage) : "videos");
  async function openProject(d: string) {
    await refreshKeys();
    openTab = null;
    projectDir = d;
  }
  // a video opened from outside its tabs, on one step (Publishing, Thumbnail)
  let openTab = $state<TabId | null>(null);
  async function openVideoAt(d: string, tab: TabId) {
    await refreshKeys();
    openTab = tab;
    view = "projects";
    projectDir = d;
  }
  // Your video's "Make the thumbnail": Publishing, Thumbnail, on this video
  let thumbnailVideo = $state<string | null>(null);
  function openThumbnail(d: string) {
    thumbnailVideo = d;
    return show("settings", "thumbnail");
  }

  // The Channels board (DECISIONS 127): a video of any Identity, opened in
  // its own Identity, on the step it is at.
  async function openFor(id: string, d: string) {
    try {
      if (id !== app?.identity?.id) {
        take(await setActiveIdentity(id));
        settingsEpoch++;
      }
      view = "projects";
      await openProject(d);
    } catch (e) {
      notice = errorText(e);
    }
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
    // the thumbnails are made on the Publishing menu
    if (j.project && j.command.startsWith("thumbnail-")) return openThumbnail(j.project);
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
    {#key longSetup}
      <Onboarding bind:config={draft} bind:keys only={longSetup ? undefined : QUICK_SETUP} save={saveFirst} done={take} newIdentity />
    {/key}
    <div class="restorebar"><button type="button" class="ghost" onclick={() => (longSetup = !longSetup)}>{longSetup ? "Short setup" : "Every setup step"}</button></div>
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
    {#if healthIssues}
      <div class="notice"><span>{healthIssues === 1 ? "One thing the app needs is not right." : `${healthIssues} things the app needs are not right.`}</span><button type="button" class="ghost" onclick={() => { healthIssues = 0; goto("health"); }}>Open Health check</button></div>
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
        <Settings {app} saved={take} startPage={settingsPage} {goto} {openVideoAt} {thumbnailVideo} />
      {/key}
    {:else if projectDir}
      {#key projectDir}
        <ProjectView {app} dir={projectDir} startTab={openTab} back={() => (projectDir = null)} saved={take} openPage={goto} {openThumbnail} />
      {/key}
    {:else if view === "home"}
      {#key app.identity.id}
        <ChannelStudio {app} {choose} saved={take} {openProject} {goto} />
        <Home {app} {goto} {openProject} {openFor} makeVideo={() => { startNew = true; view = "projects"; }} videos={() => show("projects")} />
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
  .brandbar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 10px 20px; border-bottom: 1px solid var(--border); background: var(--surface); }
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
