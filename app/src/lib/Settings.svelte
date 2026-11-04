<script lang="ts">
  // The pages of the Playlist, Publishing, Wizards, Identity and Settings menus
  // (pages.ts, DECISIONS 119, 168): every onboarding field, editable any time (PRD 5), one
  // page at a time, the menu's pages on the left. A page edits the App
  // (every Identity) or the active Identity (docs/identity.md 2). Each page
  // can re-run its part of the setup wizard. Keys save immediately; the rest
  // on "Save settings".
  import { untrack } from "svelte";
  import { open, save as saveDialog, ask } from "@tauri-apps/plugin-dialog";
  import type { Config, AppState, AppConfig, Llm } from "./api";
  import { saveSettings, errorText, deleteAllKeys, duplicateIdentity, deleteIdentity } from "./api";
  import { cleanConfig, LLM_PROVIDERS, SERVICE_KEY_URLS } from "./catalog";
  import { STEPS, recommendStep } from "./steps";
  import { SETTINGS_PAGES, SUB_PAGES, MENU_NOTE, MENUS, menuOf, type PageId, type SubPage } from "./pages";
  import type { TabId } from "./tabs";
  import { identityFromConfig, roomForIdentity, copyName } from "./identity";
  import { planText, fullPlanText, PRODUCT } from "./edition";
  import { refreshKeySources } from "./keystate.svelte";
  import ConfigSection from "./ConfigSection.svelte";
  import AiSection from "./AiSection.svelte";
  import KeyField from "./KeyField.svelte";
  import ConnectionRow from "./ConnectionRow.svelte";
  import TransferPage from "./TransferPage.svelte";
  import Onboarding from "./Onboarding.svelte";
  import ErrorBox from "./ErrorBox.svelte";
  import BackupSettings from "./BackupSettings.svelte";
  import HealthCheck from "./HealthCheck.svelte";
  import LogCard from "./LogCard.svelte";
  import BrandWizard from "./brand/BrandWizard.svelte";
  import BrandMini from "./brand/BrandMini.svelte";
  import DictionaryPage from "./brand/DictionaryPage.svelte";
  import MotionWizard from "./motion/MotionWizard.svelte";
  import MotionPage from "./motion/MotionPage.svelte";
  import CtaWizard from "./cta/CtaWizard.svelte";
  import CtaPage from "./cta/CtaPage.svelte";
  import FootagePage from "./footage/FootagePage.svelte";
  import PhotosPanel from "./PhotosPanel.svelte";
  import ScenesPage from "./scenes/ScenesPage.svelte";
  import ScenesWizard from "./scenes/ScenesWizard.svelte";
  import { ensureFonts } from "./brand/fontsDom";
  import { runner, exportBrand, importBrand } from "./api";
  import TrafficCard from "./planner/TrafficCard.svelte";
  import PlaylistPlanner from "./planner/PlaylistPlanner.svelte";
  import CourseImport from "./course/CourseImport.svelte";
  import KeywordIdeas from "./planner/KeywordIdeas.svelte";
  import ThumbnailPage from "./publishing/ThumbnailPage.svelte";
  import PublishingCards from "./publishing/PublishingCards.svelte";
  import WizardMap from "./wizard/WizardMap.svelte";
  import type { BrandState, BrandCard } from "./api";
  import { log, setScreen, changedPaths } from "./logger";


  let { app, saved, startPage = "identity", goto, openVideoAt, thumbnailVideo = null }: { app: AppState; saved: (s: AppState) => void; startPage?: PageId; goto: (page: PageId) => void; openVideoAt: (dir: string, tab: TabId) => void; thumbnailVideo?: string | null } = $props();

  // working copies: edits stay local until "Save settings". $state.snapshot,
  // not structuredClone: a reactive proxy cannot be cloned (DataCloneError).
  const snap = <T,>(v: T): T => $state.snapshot(v) as T;
  const withBackup = (a: AppConfig): AppConfig => ({ ...a, backup: a.backup ?? {} });
  let appCfg = $state<AppConfig>(untrack(() => withBackup(snap(app.app!))));
  let config = $state<Config>(untrack(() => snap(app.config!)));
  let ownLlm = $state(untrack(() => !!app.identity?.llm));
  let identLlm = $state<Llm>(untrack(() => snap(app.identity?.llm ?? app.app!.llm)));
  // every key a field can bind to, false when not set (a bound prop with a
  // fallback must not get undefined)
  const KEY_NAMES = [...LLM_PROVIDERS.map((p) => p.id), "elevenlabs", "heygen", "kie", "pixabay", "unsplash", "vidiq", "publishing"];
  const allKeys = (k: Record<string, boolean>) => ({ ...Object.fromEntries(KEY_NAMES.map((n) => [n, false])), ...k });
  let keys = $state(untrack(() => allKeys(app.keys)));
  let busy = $state(false);
  let message = $state("");
  let error = $state("");
  let pageId = $state<PageId>(untrack(() => startPage));
  // the part of a big page on screen (pages.ts SUB_PAGES)
  let subId = $state("");
  const subs = $derived<SubPage[]>(SUB_PAGES[pageId] ?? []);
  const sub = $derived(subs.some((x) => x.id === subId) ? subId : (subs[0]?.id ?? ""));
  let wizard = $state(false);
  let brandWizard = $state(false);
  let motionWizard = $state(false);
  let scenesWizard = $state(false);
  let scenesSaved = $state(0);
  let motionSaved = $state(0);
  let ctaWizard = $state(false);
  let ctaSaved = $state(0);
  let brand = $state<BrandState | null>(null);

  // The Brand page: the Identity's card as it is now (docs/wizards/brand.md 5).
  async function loadBrand() {
    try {
      brand = await runner<BrandState>("brand-state", {});
      ensureFonts(brand);
    } catch (e) {
      error = errorText(e);
    }
  }
  $effect(() => {
    if (pageId === "look" && !brandWizard) untrack(() => loadBrand());
  });

  // The card as a file of its own (docs/wizards/brand.md 12): for another
  // Identity, another computer, or the user's other tools.
  async function exportCard() {
    const path = await saveDialog({ defaultPath: `${app.identity!.name}.brand.zip`, filters: [{ name: "Your look", extensions: ["zip"] }] });
    if (typeof path !== "string") return;
    await run(async () => {
      if (!brand) await loadBrand();
      if (!brand?.own) await runner("brand-save", { card: $state.snapshot(brand!.card) });
      const out = await exportBrand(path);
      message = `Exported to ${out}: your look and your logos.`;
      await loadBrand();
    });
  }

  // TransferPage's dialog picked the file: a look file (.zip, .json), not a .css
  async function importCard(path: string) {
    await run(async () => {
      const card = await importBrand(path);
      await runner("brand-save", { card: { ...card, name: app.identity?.name ?? card.name } });
      await loadBrand();
      // the light logo also stays where setup keeps it (identity.json brand.logo)
      const light = brand?.card.logo?.light;
      if (light && brand?.brandDir) {
        config.brand = { ...config.brand, logo: `${brand.brandDir}${brand.brandDir.includes("\\") ? "\\" : "/"}${light}` };
        after(await persist(), "Your look is imported. New videos of this Identity use it.");
      } else message = "Your look is imported. New videos of this Identity use it.";
    });
  }

  async function brandSaved(card: BrandCard, lightLogo: string | null) {
    brandWizard = false;
    await run(async () => {
      // the light logo also stays where setup keeps it (identity.json brand.logo)
      if (lightLogo && lightLogo !== config.brand?.logo) {
        config.brand = { ...config.brand, logo: lightLogo };
        after(await persist(), "Your look is saved. New videos of this Identity use it.");
      } else message = "Your look is saved. New videos of this Identity use it.";
      await loadBrand();
    });
  }
  const page = $derived(SETTINGS_PAGES.find((p) => p.id === pageId)!);
  const menu = $derived(menuOf(pageId));
  // a page of this menu opens here; one of another menu through the shell
  function openPage(id: PageId) {
    message = "";
    if (menuOf(id) === menu) {
      pageId = id;
      subId = "";
    } else goto(id);
  }
  function openSub(s: SubPage) {
    message = "";
    if (s.page) openPage(s.page);
    else subId = s.id;
  }
  // the page's save button and its "run setup again": only where that part has fields
  const NO_SAVE: PageId[] = ["look", "dictionary", "motion", "cta", "footage", "scenes", "transfer", "plan", "planner", "health", "courses", "thumbnail", "photos", "legal"];
  const hasFields = $derived(!NO_SAVE.includes(pageId) && !(pageId === "connections" && sub !== "ai"));

  let dupName = $state(untrack(() => copyName(app.identity?.name ?? "", app.identities.map((i) => i.name))));
  let dupKeys = $state(untrack(() => app.edition.copyKeysDefault));
  const room = $derived(roomForIdentity(app.identities.length, app.edition.identityLimit));

  function reset(s: AppState) {
    appCfg = withBackup(snap(s.app!));
    config = snap(s.config!);
    ownLlm = !!s.identity?.llm;
    identLlm = snap(s.identity?.llm ?? s.app!.llm);
    keys = allKeys(s.keys);
    dupName = copyName(s.identity?.name ?? "", s.identities.map((i) => i.name));
  }

  function after(s: AppState, text: string) {
    saved(s);
    reset(s);
    message = s.notice ? `${text} ${s.notice}` : text;
  }

  async function persist(c: Config = config): Promise<AppState> {
    const clean = cleanConfig({ ...c, llm: ownLlm ? identLlm : appCfg.llm });
    const identity = identityFromConfig(clean, app.identity, ownLlm ? snap(identLlm) : null);
    const projectsDir = appCfg.projectsDir?.trim() ? appCfg.projectsDir.trim() : null;
    const nextApp = { ...snap(appCfg), projectsDir };
    // which fields changed (values only for choices, never the user's texts)
    log("settings_save", { page: pageId, app: changedPaths(app.app, nextApp), identity: changedPaths(app.identity, identity) });
    return saveSettings(nextApp, identity);
  }

  $effect(() => {
    setScreen(`settings/${pageId}${wizard ? "/wizard" : ""}`, { identity: app.identity?.id });
  });

  async function run(work: () => Promise<void>) {
    busy = true;
    message = "";
    error = "";
    try {
      await work();
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }

  const save = () => run(async () => after(await persist(), "Settings saved."));

  // the wizard of one page: an App page edits the App's AI, the others the Identity
  function wizardSave(c: Config): Promise<AppState> {
    if (page.scope === "app") {
      appCfg.llm = { ...c.llm };
      return persist(config);
    }
    return persist(c);
  }

  function wizardDone(s: AppState) {
    after(s, "Settings saved.");
    wizard = false;
  }

  function recommend(id: "audience" | "brandVoice" | "profile") {
    return run(async () => {
      config = await recommendStep(id, config);
    });
  }

  async function removeAllKeys() {
    if (!(await ask("Remove every API key this app saved in the system keychain, for the App and every Identity? You can add them again any time.", { title: "Remove all keys", kind: "warning" }))) return;
    await run(async () => {
      await deleteAllKeys();
      keys = allKeys(await refreshKeySources());
      message = "All keys removed from the system keychain.";
    });
  }

  async function chooseFolder() {
    const dir = await open({ directory: true, multiple: false });
    if (typeof dir === "string") appCfg.projectsDir = dir;
  }

  const duplicate = () =>
    run(async () => {
      const s = await duplicateIdentity(app.identity!.id, dupName.trim() || copyName(app.identity!.name, []), dupKeys);
      after(s, `Made "${s.identity?.name}". You are now working in it. Change what is different, for example the name, the YouTube channel and the language.`);
      pageId = "identity";
    });

  async function remove() {
    const name = app.identity!.name;
    if (!(await ask(`Delete the Identity "${name}"? Its settings and its own keys are removed. Its videos stay on your disk, in the folder "${app.identity!.folder}".`, { title: "Delete Identity", kind: "warning" }))) return;
    await run(async () => {
      const s = await deleteIdentity(app.identity!.id);
      after(s, `"${name}" deleted. Its videos are still in their folder.`);
    });
  }
</script>

{#if brandWizard}
  <BrandWizard {app} onclose={() => (brandWizard = false)} onsaved={brandSaved} />
{:else if scenesWizard}
  <ScenesWizard {app} onclose={() => (scenesWizard = false)} onsaved={() => { scenesWizard = false; scenesSaved += 1; message = "Your scenes are saved. Every new scene plan of this Identity uses them."; }} />
{:else if motionWizard}
  <MotionWizard {app} onclose={() => (motionWizard = false)} onsaved={() => { motionWizard = false; motionSaved += 1; message = "Your motion is saved. Every ONE Video of this Identity uses it from its next build."; }} />
{:else if ctaWizard}
  <CtaWizard {app} onclose={() => (ctaWizard = false)} onsaved={() => { ctaWizard = false; ctaSaved += 1; message = "Your comment calls are saved. Every new script of this Identity uses them."; }} />
{:else if wizard}
  <Onboarding
    bind:config
    bind:keys
    only={page.steps}
    save={wizardSave}
    done={wizardDone}
    cancel={() => (wizard = false)}
    keyScope={page.scope === "app" ? "app" : "identity"}
    title={page.scope === "identity" ? app.identity?.name : "App"}
  />
{:else}
<div class="layout">
  <nav class="pages">
    <div class="group">
      <span class="gname">{menu === "identity" ? app.identity?.name : MENUS.find((m) => m.id === menu)?.title}</span>
      <span class="gnote">{MENU_NOTE[menu]}</span>
    </div>
    {#each SETTINGS_PAGES.filter((p) => p.menu === menu) as p}
      <button type="button" class:current={p.id === pageId && !subs.length} class:parent={p.id === pageId && !!subs.length} onclick={() => openPage(p.id)}>{p.title}</button>
      {#if p.id === pageId}
        {#each subs as x (x.id)}
          <button type="button" class="subpage" class:current={x.id === sub} onclick={() => openSub(x)}>{x.title}</button>
        {/each}
      {/if}
    {/each}
  </nav>
  <div class="page">
    <header>
      <div>
        <p class="for">{page.scope === "app" ? "For the whole app, every Identity" : `For: ${app.identity?.name}`}</p>
        <h1>{page.title}{#if subs.length}: {subs.find((x) => x.id === sub)?.title}{/if}</h1>
      </div>
      {#if hasFields}
        <button type="button" class="primary" disabled={busy} onclick={save}>Save settings</button>
      {/if}
    </header>
    {#if message}<p class="good">{message}</p>{/if}
    {#if error}<ErrorBox message={error} context={{ step: "settings", provider: config.llm.provider, model: config.llm.model }} />{/if}

    {#if ["look", "motion", "scenes", "cta"].includes(pageId)}
      <WizardMap current={pageId} goto={(id) => openPage(id)} />
    {/if}

    {#if page.steps.length && pageId !== "look" && hasFields}
      <div class="rerun">
        <p class="hint">Want to rethink this part? The setup wizard walks you through it again, step by step.</p>
        <button type="button" disabled={busy} onclick={() => { message = ""; wizard = true; }}>Run setup for this part again</button>
      </div>
    {/if}

    {#if pageId === "health"}
      <HealthCheck {app} goto={(id) => openPage(id)} />
    {:else if pageId === "connections"}
      {#if sub === "ai"}
        <section class="card">
          <p class="hint">The AI that writes the scripts, plans the scenes and the small texts, for every Identity.</p>
          <AiSection bind:llm={appCfg.llm} bind:keys keyScope="app" steps />
          <label class="radio own"><input type="checkbox" checked={ownLlm} onchange={(e) => (ownLlm = e.currentTarget.checked)} /> Use a different AI for this Identity ({app.identity?.name})</label>
          {#if ownLlm}
            <div class="inner"><AiSection bind:llm={identLlm} bind:keys keyScope="identity" steps /></div>
          {/if}
          <p class="hint">Save settings after changing the AI or the model. Keys are saved at once.</p>
        </section>
      {:else if sub === "providers"}
        <section class="card">
          <p class="hint">Gemini and the other AI providers, for example when one step of the script uses another model.</p>
          {#each LLM_PROVIDERS as p (p.id)}
            <ConnectionRow name={p.id} label={p.label} keyUrl={p.keyUrl} identityName={app.identity?.name} bind:isSet={keys[p.id]} test={() => ({ command: "test-llm", provider: p.id, model: p.id === appCfg.llm.provider ? appCfg.llm.model : p.model })} />
          {/each}
        </section>
      {:else if sub === "services"}
        <section class="card">
          <ConnectionRow name="elevenlabs" label="ElevenLabs" keyUrl={SERVICE_KEY_URLS.elevenlabs} hint="The narrator voice and the music." identityName={app.identity?.name} bind:isSet={keys.elevenlabs} test={() => ({ command: "test-service", service: "elevenlabs" })} />
          <ConnectionRow name="heygen" label="HeyGen" keyUrl={SERVICE_KEY_URLS.heygen} hint="Avatars, CTA clips and AI B-roll." identityName={app.identity?.name} bind:isSet={keys.heygen} test={() => ({ command: "test-service", service: "heygen" })} />
          <ConnectionRow name="kie" label="Kie AI" keyUrl={SERVICE_KEY_URLS.kie} hint="Optional: paid AI clips for hero moments, off until you turn them on in a channel's recipe. Nothing is spent without your yes on the Preview tab." identityName={app.identity?.name} bind:isSet={keys.kie} test={() => ({ command: "test-service", service: "kie" })} />
          <ConnectionRow name="pixabay" label="Pixabay" keyUrl={SERVICE_KEY_URLS.pixabay} hint="Free stock photos and videos (Pixabay Content License: a free license, not CC0; also commercially, no credit required)." identityName={app.identity?.name} bind:isSet={keys.pixabay} test={() => ({ command: "test-service", service: "pixabay" })} />
          <ConnectionRow name="unsplash" label="Unsplash Access Key" keyUrl={SERVICE_KEY_URLS.unsplash} hint="Better not to use it: its terms ask for a credit to the photographer, and your videos carry none. It stays off unless you turn it on in the Scenes wizard. Paste its Access Key, never the Secret key." identityName={app.identity?.name} bind:isSet={keys.unsplash} test={() => ({ command: "test-service", service: "unsplash" })} />
          <ConnectionRow name="vidiq" label="vidIQ" keyUrl={SERVICE_KEY_URLS.vidiq} hint="Optional: keyword data for your topics." identityName={app.identity?.name} bind:isSet={keys.vidiq} test={() => ({ command: "test-service", service: "vidiq" })} />
        </section>
      {:else}
        <section class="card">
          <p class="hint">Keys are stored only in your system keychain. This removes the keys for every Identity and every Identity's own keys, for example before you uninstall.</p>
          <div class="row"><button type="button" disabled={busy} onclick={removeAllKeys}>Remove all keys</button></div>
        </section>
      {/if}
    {:else if pageId === "pdt"}
      <section class="card">
        <h2>Publishing Dream Team</h2>
        <p class="hint">Where "Send to Publishing" on a finished video sends its publishing card: your publishing app's address and its token. The address starts with https:// (plain http only for localhost). The token is kept in your computer's keychain, never in a file. Save settings after changing the address.</p>
        <label class="field"><span>Address</span><input type="url" placeholder="https://..." value={appCfg.publishing?.url ?? ""} oninput={(e) => (appCfg.publishing = { url: e.currentTarget.value.trim() || null })} /></label>
        <KeyField name="publishing" label="Publishing token" scope="app" bind:isSet={keys.publishing} />
      </section>
      <PublishingCards {app} {openVideoAt} />
    {:else if pageId === "thumbnail"}
      <ThumbnailPage {app} video={thumbnailVideo} {openVideoAt} goto={(id) => openPage(id)} />
    {:else if pageId === "courses"}
      <section class="card">
        <p class="hint">A whole course or playlist as one file: from the Minicourse page, or from the Playlist Planner. It becomes one prepared video per entry.</p>
        <CourseImport {app} off={busy} />
      </section>
    {:else if pageId === "transfer"}
      <TransferPage {app} {busy} saved={(s, text) => after(s, text)} {importCard} exportCardFile={exportCard} />
    {:else if pageId === "folders"}
      <section class="card">
        <h2>Projects folder</h2>
        <p class="hint">Now: {appCfg.projectsDir || app.defaultProjectsDir}</p>
        <p class="hint">Every Identity has its own folder in it. This Identity's videos: {app.projectsDir}</p>
        <div class="row">
          <button type="button" onclick={chooseFolder}>Choose folder</button>
          {#if appCfg.projectsDir}
            <button type="button" class="ghost" onclick={() => (appCfg.projectsDir = null)}>Use default</button>
          {/if}
        </div>
      </section>
    {:else if pageId === "backup"}
      <BackupSettings {app} bind:backup={appCfg.backup!} />
    {:else if pageId === "plan"}
      <section class="card">
        <h2>{app.edition.tier}</h2>
        <p>{planText(app.edition, app.identities.length)}</p>
        <ul class="list">
          {#each app.identities as i}<li>{i.name}</li>{/each}
        </ul>
      </section>
    {:else if pageId === "legal"}
      <section class="card about">
        <h2>About</h2>
        <p>{PRODUCT} {app.version}. Built on HyperFrames by HeyGen (Apache-2.0).</p>
        <p>Design styles from open-design (Apache-2.0): colors, corners and shapes only. Style names describe a look only; not affiliated with or endorsed by the brands named. Fonts: SIL Open Font License (OFL-1.1), via fontsource.</p>
        <p>Also shipped: Node.js (MIT) and FFmpeg (GPL-3.0, a separate program; its source: git.ffmpeg.org and github.com/BtbN/FFmpeg-Builds). The full list with every license: THIRD-PARTY-NOTICES.md in the app's program folder.</p>
        <p>No support, no installation help.</p>
      </section>
      <LogCard initial={app.log} goto={(id) => openPage(id)} />
    {:else if pageId === "look"}
      <section class="card brand">
        <h2>Your videos' look</h2>
        {#if brand}
          <div class="brandrow">
            <div class="mini"><BrandMini card={brand.card} language={config.channel.contentLanguage ?? "en"} /></div>
            <div class="brandtext">
              <p>{brand.own ? `Your own look${brand.card.updatedAt ? `, saved ${new Date(brand.card.updatedAt).toLocaleDateString()}` : ""}${brand.card.source?.preset ? `, from ${brand.presets.find((p) => p.id === brand!.card.source?.preset)?.label ?? brand.card.source.preset}` : ""}.` : `The ${brand.presets.find((p) => p.id === brand!.card.source?.preset)?.label ?? "default"} preset. You have not set your own look yet.`}</p>
              <p class="hint">Fonts: {brand.card.fonts.display.family} for titles, {brand.card.fonts.body.family} for text.</p>
              <p class="hint">Saved with this Identity. Your other tools can read it too.</p>
              <div class="row"><button type="button" class="primary" disabled={busy} onclick={() => { message = ""; brandWizard = true; }}>Open Design wizard</button></div>
            </div>
          </div>
        {:else}
          <p class="hint">Loading...</p>
        {/if}
      </section>
      <p class="hint">Your look as a file, or a look from another design tool: <button type="button" class="link" onclick={() => openPage("transfer")}>Settings, Import & Export</button>.</p>
    {:else if pageId === "motion"}
      <MotionPage refresh={motionSaved} onopen={() => { message = ""; motionWizard = true; }} />
    {:else if pageId === "cta"}
      <CtaPage {app} refresh={ctaSaved} onopen={() => { message = ""; ctaWizard = true; }} goto={(id) => openPage(id)} />
    {:else if pageId === "scenes"}
      <ScenesPage refresh={scenesSaved} onopen={() => { message = ""; scenesWizard = true; }} goto={(id) => openPage(id)} />
    {:else if pageId === "footage"}
      <FootagePage {app} {sub} goto={(id) => openPage(id)} />
    {:else if pageId === "dictionary"}
      <DictionaryPage />
    {:else if pageId === "planner"}
      <PlaylistPlanner {app} goto={(id) => openPage(id)} />
    {:else if pageId === "research"}
      <section class="card">
        <p class="hint">What people search for on YouTube, from vidIQ with your own key. It feeds the <button type="button" class="link" onclick={() => openPage("planner")}>Playlist Planner</button>; for a single video the same search is on its Research tab.</p>
        <KeywordIdeas {app} goto={(id) => openPage(id)} />
      </section>
    {:else if pageId === "photos"}
      <section class="card">
        <h2>Your face on thumbnails</h2>
        <PhotosPanel />
        <p class="hint">The thumbnails themselves are made in <button type="button" class="link" onclick={() => openPage("thumbnail")}>Publishing, Thumbnail</button>.</p>
      </section>
    {:else if pageId === "channel"}
      <TrafficCard bind:config />
    {/if}

    {#each STEPS.filter((s) => page.scope === "identity" && page.steps.includes(s.id) && s.id !== "brand") as s (s.id)}
      <section class="card">
        <div class="head">
          <h2>{s.id === "name" ? "Name" : s.title}</h2>
          {#if s.id === "audience" || s.id === "brandVoice" || s.id === "profile"}
            <button type="button" disabled={busy} onclick={() => recommend(s.id as "audience" | "brandVoice" | "profile")}>Write it with AI</button>
          {/if}
        </div>
        <ConfigSection id={s.id} bind:config bind:keys keyScope="identity" />
      </section>
    {/each}

    {#if pageId === "identity"}
      <section class="card">
        <h2>Duplicate</h2>
        <p class="hint">A new Identity with the same settings, for example a second YouTube channel. The videos are not copied.</p>
        {#if room}
          <div class="row">
            <input bind:value={dupName} maxlength="80" aria-label="Name of the copy" />
            <button type="button" disabled={busy} onclick={duplicate}>Duplicate this Identity</button>
          </div>
          <label class="radio"><input type="checkbox" bind:checked={dupKeys} /> Copy this Identity's own keys</label>
        {:else}
          <p class="hint">{fullPlanText(app.edition)}</p>
        {/if}
      </section>
      <section class="card">
        <h2>Export and import</h2>
        <p class="hint">One file with this Identity's settings, logo and look, for another computer or another person: <button type="button" class="link" onclick={() => openPage("transfer")}>Settings, Import & Export</button>.</p>
      </section>
      <section class="card">
        <h2>Delete</h2>
        {#if app.identities.length > 1}
          <p class="hint">Removes this Identity's settings and own keys. Its videos stay on your disk.</p>
          <div class="row"><button type="button" class="ghost" disabled={busy} onclick={remove}>Delete this Identity</button></div>
        {:else}
          <p class="hint">This is the only Identity, so it cannot be deleted.</p>
        {/if}
      </section>
    {/if}
  </div>
</div>
{/if}

<style>
  .layout { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 24px; padding: 24px; max-width: 1060px; margin: 0 auto; }
  .pages { display: grid; gap: 2px; align-content: start; }
  .pages button { width: 100%; justify-content: flex-start; text-align: left; border: none; background: none; padding: 6px 10px; border-radius: 6px; }
  .pages .subpage { padding-left: 24px; font-size: 13px; }
  .pages .parent { font-weight: 600; }
  .pages .current { background: var(--primary-surface); color: var(--primary-surface-foreground); font-weight: 600; }
  .group { display: grid; padding: 12px 10px 4px; }
  .group:first-child { padding-top: 0; }
  .gname { font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; overflow-wrap: anywhere; }
  .gnote { font-size: 12px; color: var(--muted-foreground); }
  .page { display: grid; gap: 16px; align-content: start; min-width: 0; }
  .rerun { display: flex; gap: 12px; align-items: center; justify-content: space-between; }
  .rerun .hint { margin: 0; word-break: normal; }
  .rerun button { white-space: nowrap; flex: none; }
  header { display: flex; justify-content: space-between; align-items: center; }
  .for { margin: 0; font-size: 13px; color: var(--muted-foreground); }
  h1 { margin: 0; }
  h2 { margin: 0 0 12px; font-size: 17px; }
  .head { display: flex; justify-content: space-between; align-items: center; }
  .row { display: flex; gap: 8px; align-items: center; }
  .row input { flex: 1; }
  .radio { display: flex; gap: 6px; align-items: center; margin: 6px 0; }
  .inner { margin-top: 12px; }
  .list { margin: 8px 0 0; padding-left: 18px; color: var(--muted-foreground); }
  .hint { font-size: 13px; color: var(--muted-foreground); word-break: break-word; }
  .good { color: var(--success); margin: 0; }
  .about p { margin: 4px 0; color: var(--muted-foreground); }
  .brandrow { display: grid; grid-template-columns: minmax(0, 360px) 1fr; gap: 20px; align-items: start; }
  .brandtext p { margin: 0 0 8px; }
  .own { margin-top: 14px; font-weight: 600; }
  .field { display: grid; gap: 4px; margin-bottom: 12px; }
  .link { border: none; background: none; padding: 0; color: var(--primary); text-decoration: underline; cursor: pointer; font-size: inherit; font-family: inherit; min-height: 0; }
</style>
