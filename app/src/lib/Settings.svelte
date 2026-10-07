<script lang="ts">
  // Settings: every onboarding field, editable any time (PRD 5), split into
  // sub-pages (pages.ts) in two groups (docs/identity.md 7): "App", for every
  // Identity on this computer, and the active Identity's own pages. Each page
  // can re-run its part of the setup wizard. Keys save immediately; the rest
  // on "Save settings".
  import { untrack } from "svelte";
  import { open, save as saveDialog, ask } from "@tauri-apps/plugin-dialog";
  import type { Config, AppState, AppConfig, Llm } from "./api";
  import { saveSettings, errorText, deleteAllKeys, duplicateIdentity, deleteIdentity, exportIdentity } from "./api";
  import { cleanConfig, LLM_PROVIDERS, SERVICE_KEY_URLS } from "./catalog";
  import { STEPS, recommendStep } from "./steps";
  import { SETTINGS_PAGES, GROUP_NOTE, type PageId } from "./pages";
  import { identityFromConfig, roomForIdentity, copyName } from "./identity";
  import { planText, fullPlanText, PRODUCT } from "./edition";
  import { refreshKeySources } from "./keystate.svelte";
  import ConfigSection from "./ConfigSection.svelte";
  import AiSection from "./AiSection.svelte";
  import KeyField from "./KeyField.svelte";
  import Onboarding from "./Onboarding.svelte";
  import ErrorBox from "./ErrorBox.svelte";
  import BackupSettings from "./BackupSettings.svelte";
  import LogCard from "./LogCard.svelte";
  import BrandWizard from "./brand/BrandWizard.svelte";
  import BrandMini from "./brand/BrandMini.svelte";
  import DictionaryPage from "./brand/DictionaryPage.svelte";
  import MotionWizard from "./motion/MotionWizard.svelte";
  import MotionPage from "./motion/MotionPage.svelte";
  import CtaWizard from "./cta/CtaWizard.svelte";
  import CtaPage from "./cta/CtaPage.svelte";
  import FootagePage from "./footage/FootagePage.svelte";
  import ScenesPage from "./scenes/ScenesPage.svelte";
  import ScenesWizard from "./scenes/ScenesWizard.svelte";
  import { ensureFonts } from "./brand/fontsDom";
  import { runner, exportBrand, importBrand } from "./api";
  import type { BrandState, BrandCard } from "./api";
  import { log, setScreen, changedPaths } from "./logger";


  let { app, saved, startPage = "identity" }: { app: AppState; saved: (s: AppState) => void; startPage?: PageId } = $props();

  // working copies: edits stay local until "Save settings". $state.snapshot,
  // not structuredClone: a reactive proxy cannot be cloned (DataCloneError).
  const snap = <T,>(v: T): T => $state.snapshot(v) as T;
  const withBackup = (a: AppConfig): AppConfig => ({ ...a, backup: a.backup ?? {} });
  let appCfg = $state<AppConfig>(untrack(() => withBackup(snap(app.app!))));
  let config = $state<Config>(untrack(() => snap(app.config!)));
  let ownLlm = $state(untrack(() => !!app.identity?.llm));
  let identLlm = $state<Llm>(untrack(() => snap(app.identity?.llm ?? app.app!.llm)));
  let keys = $state(untrack(() => ({ ...app.keys })));
  let busy = $state(false);
  let message = $state("");
  let error = $state("");
  let pageId = $state<PageId>(untrack(() => startPage));
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
    const path = await saveDialog({ defaultPath: `${app.identity!.name}.brand.zip`, filters: [{ name: "Brand Identity Card", extensions: ["zip"] }] });
    if (typeof path !== "string") return;
    await run(async () => {
      if (!brand?.own) await runner("brand-save", { card: $state.snapshot(brand!.card) });
      const out = await exportBrand(path);
      message = `Exported to ${out}: the Brand Identity Card, its FRAME.md and the logos.`;
      await loadBrand();
    });
  }

  async function importCard() {
    const path = await open({ multiple: false, directory: false, filters: [{ name: "Brand Identity Card", extensions: ["zip", "json"] }] });
    if (typeof path !== "string") return;
    await run(async () => {
      const card = await importBrand(path);
      await runner("brand-save", { card: { ...card, name: app.identity?.name ?? card.name } });
      await loadBrand();
      // the light logo also stays where setup keeps it (identity.json brand.logo)
      const light = brand?.card.logo?.light;
      if (light && brand?.brandDir) {
        config.brand = { ...config.brand, logo: `${brand.brandDir}${brand.brandDir.includes("\\") ? "\\" : "/"}${light}` };
        after(await persist(), "Brand Identity Card imported. New videos of this Identity use it.");
      } else message = "Brand Identity Card imported. New videos of this Identity use it.";
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
  const GROUPS = ["app", "identity"] as const;
  const appProvider = $derived(LLM_PROVIDERS.find((p) => p.id === appCfg.llm.provider) ?? LLM_PROVIDERS[0]);

  let dupName = $state(untrack(() => copyName(app.identity?.name ?? "", app.identities.map((i) => i.name))));
  let dupKeys = $state(untrack(() => app.edition.copyKeysDefault));
  const room = $derived(roomForIdentity(app.identities.length, app.edition.identityLimit));

  function reset(s: AppState) {
    appCfg = withBackup(snap(s.app!));
    config = snap(s.config!);
    ownLlm = !!s.identity?.llm;
    identLlm = snap(s.identity?.llm ?? s.app!.llm);
    keys = { ...s.keys };
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
    if (page.group === "app") {
      appCfg.llm = { ...c.llm };
      return persist(config);
    }
    return persist(c);
  }

  function wizardDone(s: AppState) {
    after(s, "Settings saved.");
    wizard = false;
  }

  function recommend(id: "audience" | "brandVoice") {
    return run(async () => {
      config = await recommendStep(id, config);
    });
  }

  async function removeAllKeys() {
    if (!(await ask("Remove every API key this app saved in the system keychain, for the App and every Identity? You can add them again any time.", { title: "Remove all keys", kind: "warning" }))) return;
    await run(async () => {
      await deleteAllKeys();
      keys = await refreshKeySources();
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

  async function exportIt() {
    const path = await saveDialog({ defaultPath: `${app.identity!.name}.identity.zip`, filters: [{ name: "Identity", extensions: ["zip"] }] });
    if (typeof path !== "string") return;
    await run(async () => {
      const out = await exportIdentity(app.identity!.id, path);
      message = `Exported to ${out}. No API key is in the file.`;
    });
  }

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
    keyScope={page.group === "app" ? "app" : "identity"}
    title={page.group === "identity" ? app.identity?.name : "App"}
  />
{:else}
<div class="layout">
  <nav class="pages">
    {#each GROUPS as group}
      <div class="group">
        <span class="gname">{group === "app" ? "App" : app.identity?.name}</span>
        <span class="gnote">{GROUP_NOTE[group]}</span>
      </div>
      {#each SETTINGS_PAGES.filter((p) => p.group === group) as p}
        <button type="button" class:current={p.id === pageId} onclick={() => { pageId = p.id; message = ""; }}>{p.title}</button>
      {/each}
    {/each}
  </nav>
  <div class="page">
    <header>
      <div>
        <p class="for">{page.group === "app" ? "Settings for all Identities" : `Settings for: ${app.identity?.name}`}</p>
        <h1>{page.title}</h1>
      </div>
      {#if pageId !== "look" && pageId !== "dictionary" && pageId !== "motion" && pageId !== "cta" && pageId !== "footage"}
        <button type="button" class="primary" disabled={busy} onclick={save}>Save settings</button>
      {/if}
    </header>
    {#if message}<p class="good">{message}</p>{/if}
    {#if error}<ErrorBox message={error} context={{ step: "settings", provider: config.llm.provider, model: config.llm.model }} />{/if}

    {#if page.steps.length && pageId !== "look"}
      <div class="rerun">
        <p class="hint">Want to rethink this part? The setup wizard walks you through it again, step by step.</p>
        <button type="button" disabled={busy} onclick={() => { message = ""; wizard = true; }}>Run setup for this part again</button>
      </div>
    {/if}

    {#if pageId === "app-ai"}
      <section class="card">
        <h2>AI for every Identity</h2>
        <p class="hint">The default. An Identity can use a different AI on its own "AI and keys" page.</p>
        <AiSection bind:llm={appCfg.llm} bind:keys keyScope="app" steps />
      </section>
      <section class="card">
        <h2>Service keys for every Identity</h2>
        <p class="hint">An Identity can use its own key instead, for example a client's, so that the costs go to the client.</p>
        <div class="keys">
          <KeyField name="elevenlabs" label="ElevenLabs" scope="app" keyUrl={SERVICE_KEY_URLS.elevenlabs} bind:isSet={keys.elevenlabs} test={() => ({ command: "test-service", service: "elevenlabs" })} />
          <KeyField name="heygen" label="HeyGen" scope="app" keyUrl={SERVICE_KEY_URLS.heygen} bind:isSet={keys.heygen} test={() => ({ command: "test-service", service: "heygen" })} />
          <KeyField name="vidiq" label="vidIQ" scope="app" keyUrl={SERVICE_KEY_URLS.vidiq} bind:isSet={keys.vidiq} test={() => ({ command: "test-service", service: "vidiq" })} />
        </div>
      </section>
      <section class="card">
        <h2>Remove all keys</h2>
        <p class="hint">Keys are stored only in your system keychain. This removes the App keys and every Identity's own keys, for example before you uninstall.</p>
        <div class="row"><button type="button" disabled={busy} onclick={removeAllKeys}>Remove all keys</button></div>
      </section>
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
    {:else if pageId === "publishing"}
      <section class="card">
        <h2>Publishing connection</h2>
        <p class="hint">Where "Send to Publishing" on the Your video tab sends a finished video's publishing card: your publishing app's address and its token. The address starts with https:// (plain http only for localhost). The token is kept in your computer's keychain, never in a file.</p>
        <label class="field"><span>Address</span><input type="url" placeholder="https://..." value={appCfg.publishing?.url ?? ""} oninput={(e) => (appCfg.publishing = { url: e.currentTarget.value.trim() || null })} /></label>
        <KeyField name="publishing" label="Publishing token" scope="app" bind:isSet={keys.publishing} />
        <p class="hint">Save settings after changing the address.</p>
      </section>
    {:else if pageId === "general"}
      <section class="card about">
        <h2>About</h2>
        <p>{PRODUCT} {app.version}. Built on HyperFrames by HeyGen (Apache-2.0).</p>
        <p>Design styles from open-design (Apache-2.0): colors, corners and shapes only. Style names describe a look only; not affiliated with or endorsed by the brands named. Fonts: SIL Open Font License (OFL-1.1), via fontsource.</p>
        <p>Also shipped: Node.js (MIT) and FFmpeg (GPL-3.0, a separate program; its source: git.ffmpeg.org and github.com/BtbN/FFmpeg-Builds). The full list with every license: THIRD-PARTY-NOTICES.md in the app's program folder.</p>
        <p>No support, no installation help.</p>
      </section>
      <LogCard initial={app.log} />
    {:else if pageId === "look"}
      <section class="card brand">
        <h2>Your videos' look</h2>
        {#if brand}
          <div class="brandrow">
            <div class="mini"><BrandMini card={brand.card} language={config.channel.contentLanguage ?? "en"} /></div>
            <div class="brandtext">
              <p>{brand.own ? `Your own look${brand.card.updatedAt ? `, saved ${new Date(brand.card.updatedAt).toLocaleDateString()}` : ""}${brand.card.source?.preset ? `, from ${brand.presets.find((p) => p.id === brand!.card.source?.preset)?.label ?? brand.card.source.preset}` : ""}.` : `The ${brand.presets.find((p) => p.id === brand!.card.source?.preset)?.label ?? "default"} preset. You have not set your own look yet.`}</p>
              <p class="hint">Fonts: {brand.card.fonts.display.family} for titles, {brand.card.fonts.body.family} for text.</p>
              <p class="hint">Saved as this Identity's Brand Identity Card, the design source your other tools can read too.</p>
              <div class="row"><button type="button" class="primary" disabled={busy} onclick={() => { message = ""; brandWizard = true; }}>Open Brand wizard</button></div>
            </div>
          </div>
        {:else}
          <p class="hint">Loading...</p>
        {/if}
      </section>
      <section class="card">
        <h2>Brand Identity Card file</h2>
        <p class="hint">One file with this look (colors, fonts, shapes, name on screen) and the logos, for another Identity, another computer or your other tools. Import replaces this Identity's look.</p>
        <div class="row">
          <button type="button" disabled={busy || !brand} onclick={exportCard}>Export Brand Identity Card</button>
          <button type="button" disabled={busy} onclick={importCard}>Import Brand Identity Card</button>
        </div>
      </section>
    {:else if pageId === "motion"}
      <MotionPage refresh={motionSaved} onopen={() => { message = ""; motionWizard = true; }} />
    {:else if pageId === "cta"}
      <CtaPage {app} refresh={ctaSaved} onopen={() => { message = ""; ctaWizard = true; }} />
    {:else if pageId === "scenes"}
      <ScenesPage refresh={scenesSaved} onopen={() => { message = ""; scenesWizard = true; }} />
    {:else if pageId === "footage"}
      <FootagePage {app} />
    {:else if pageId === "dictionary"}
      <DictionaryPage />
    {:else if pageId === "identity-ai"}
      <section class="card">
        <h2>AI for this Identity</h2>
        <label class="radio"><input type="radio" name="ownllm" checked={!ownLlm} onchange={() => (ownLlm = false)} /> Use the App's AI ({appProvider.label}, {appCfg.llm.model})</label>
        <label class="radio"><input type="radio" name="ownllm" checked={ownLlm} onchange={() => (ownLlm = true)} /> Use a different AI for this Identity</label>
        {#if ownLlm}
          <div class="inner"><AiSection bind:llm={identLlm} bind:keys keyScope="identity" steps /></div>
        {/if}
      </section>
      <section class="card">
        <h2>Service keys of this Identity</h2>
        <p class="hint">Without its own key, this Identity uses the App key.</p>
        <div class="keys">
          <KeyField name="elevenlabs" label="ElevenLabs" scope="identity" keyUrl={SERVICE_KEY_URLS.elevenlabs} bind:isSet={keys.elevenlabs} test={() => ({ command: "test-service", service: "elevenlabs" })} />
          <KeyField name="heygen" label="HeyGen" scope="identity" keyUrl={SERVICE_KEY_URLS.heygen} bind:isSet={keys.heygen} test={() => ({ command: "test-service", service: "heygen" })} />
          <KeyField name="vidiq" label="vidIQ" scope="identity" keyUrl={SERVICE_KEY_URLS.vidiq} bind:isSet={keys.vidiq} test={() => ({ command: "test-service", service: "vidiq" })} />
        </div>
      </section>
    {/if}

    {#each STEPS.filter((s) => page.group === "identity" && page.steps.includes(s.id) && s.id !== "brand") as s (s.id)}
      <section class="card">
        <div class="head">
          <h2>{s.id === "name" ? "Name" : s.title}</h2>
          {#if s.id === "audience" || s.id === "brandVoice"}
            <button type="button" disabled={busy} onclick={() => recommend(s.id as "audience" | "brandVoice")}>Use recommended</button>
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
        <h2>Export</h2>
        <p class="hint">One file with this Identity's settings, logo and look, to start an Identity from it on another computer or for another person. API keys are never in it.</p>
        <div class="row"><button type="button" disabled={busy} onclick={exportIt}>Export Identity</button></div>
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
  .keys { display: grid; gap: 18px; }
  .radio { display: flex; gap: 6px; align-items: center; margin: 6px 0; }
  .inner { margin-top: 12px; }
  .list { margin: 8px 0 0; padding-left: 18px; color: var(--muted-foreground); }
  .hint { font-size: 13px; color: var(--muted-foreground); word-break: break-word; }
  .good { color: var(--success); margin: 0; }
  .about p { margin: 4px 0; color: var(--muted-foreground); }
  .brandrow { display: grid; grid-template-columns: minmax(0, 360px) 1fr; gap: 20px; align-items: start; }
  .brandtext p { margin: 0 0 8px; }
</style>
