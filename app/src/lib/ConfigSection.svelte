<script lang="ts">
  // The fields of one onboarding step / Settings section, bound to the config.
  import { open } from "@tauri-apps/plugin-dialog";
  import type { Config } from "./api";
  import { importLogo, errorText } from "./api";
  import { LLM_PROVIDERS, LANGUAGES, SERVICE_KEY_URLS, GEMINI_VOICES, GEMINI_DEFAULT_VOICE, narratorProvider } from "./catalog";
  import type { StepId } from "./steps";
  import KeyField from "./KeyField.svelte";

  let {
    id,
    config = $bindable(),
    keys = $bindable(),
  }: { id: StepId; config: Config; keys: Record<string, boolean> } = $props();

  let logoError = $state("");
  const provider = $derived(LLM_PROVIDERS.find((p) => p.id === config.llm.provider) ?? LLM_PROVIDERS[0]);

  function pickProvider(pid: string) {
    const p = LLM_PROVIDERS.find((x) => x.id === pid)!;
    config.llm = { provider: p.id, model: p.model };
  }

  function pickLanguage(code: string) {
    config.channel.contentLanguage = code;
  }

  async function chooseLogo() {
    logoError = "";
    const path = await open({ multiple: false, directory: false, filters: [{ name: "Logo", extensions: ["png", "jpg", "jpeg", "svg", "webp"] }] });
    if (typeof path !== "string") return;
    try {
      config.brand = { ...config.brand, logo: await importLogo(path) };
    } catch (e) {
      logoError = errorText(e);
    }
  }

  const fileName = (p: string | null | undefined) => (p ? p.split(/[\\/]/).pop() : "");
</script>

{#if id === "ai"}
  <div class="field">
    <label for="provider">AI provider</label>
    <select id="provider" value={config.llm.provider} onchange={(e) => pickProvider(e.currentTarget.value)}>
      {#each LLM_PROVIDERS as p}<option value={p.id}>{p.label}</option>{/each}
    </select>
    {#if provider.note}<p class="hint">{provider.note}</p>{/if}
  </div>
  <div class="field">
    <label for="model">Model</label>
    <input id="model" bind:value={config.llm.model} placeholder="model name" spellcheck="false" />
    <p class="hint">Model names change often. You can edit this any time in Settings.</p>
  </div>
  {#key config.llm.provider}
    <KeyField
      name={config.llm.provider}
      label={provider.label}
      keyUrl={provider.keyUrl}
      bind:isSet={keys[config.llm.provider]}
      test={() => ({ command: "test-llm", provider: config.llm.provider, model: config.llm.model })}
    />
  {/key}
  <p class="warn">A ChatGPT Plus or Claude Pro subscription is not an API key. The API is a separate account with its own key.</p>
{:else if id === "brand"}
  <div class="field">
    <label for="preset">Brand preset</label>
    <input id="preset" bind:value={config.brand!.preset} spellcheck="false" />
    <p class="hint">The preset gallery comes in the next version. Until then the default is blue-professional.</p>
  </div>
  <div class="field">
    <span class="label">Logo</span>
    <div class="row">
      <button type="button" onclick={chooseLogo}>{config.brand?.logo ? "Change logo" : "Choose logo file"}</button>
      {#if config.brand?.logo}
        <span class="hint">{fileName(config.brand.logo)}</span>
        <button type="button" class="ghost" onclick={() => (config.brand = { ...config.brand, logo: null })}>Remove</button>
      {/if}
    </div>
    {#if logoError}<p class="bad">{logoError}</p>{/if}
  </div>
{:else if id === "audience"}
  <div class="field">
    <label for="audience">Audience</label>
    <textarea id="audience" rows="5" bind:value={config.channel.audience} placeholder="Example: first-time founders with no video experience who want customers from YouTube."></textarea>
  </div>
{:else if id === "brandVoice"}
  <div class="field">
    <label for="bv">Brand Voice</label>
    <textarea id="bv" rows="5" bind:value={config.channel.brandVoice} placeholder="Example: calm, direct, practical. Short sentences. No hype words."></textarea>
  </div>
{:else if id === "profile"}
  <div class="field">
    <label for="profile">Channel Profile</label>
    <textarea id="profile" rows="5" bind:value={config.channel.profile} placeholder="What your channel is about and what makes it different."></textarea>
  </div>
{:else if id === "youtube"}
  <div class="field">
    <label for="yt">YouTube channel URL</label>
    <input id="yt" type="url" bind:value={config.channel.youtubeUrl} placeholder="https://www.youtube.com/@yourchannel" />
  </div>
{:else if id === "landing"}
  <div class="field">
    <label for="landing">Landing URL</label>
    <input id="landing" type="url" bind:value={config.channel.landingUrl} placeholder="https://..." />
  </div>
  <div class="field">
    <label for="cta">What viewers get there</label>
    <input id="cta" bind:value={config.channel.ctaText} placeholder="Example: the free checklist" />
  </div>
{:else if id === "language"}
  <div class="field">
    <label for="lang">Content language</label>
    <select id="lang" value={config.channel.contentLanguage ?? "en"} onchange={(e) => pickLanguage(e.currentTarget.value)}>
      {#each LANGUAGES as l}<option value={l.code}>{l.label}</option>{/each}
    </select>
  </div>
{:else if id === "narrator"}
  <div class="field">
    <span class="label">Narrator Voice</span>
    <div class="row">
      <label class="radio"><input type="radio" name="narr" checked={narratorProvider(config.narrator.provider) === "gemini"} onchange={() => (config.narrator = { provider: "gemini", voice: GEMINI_DEFAULT_VOICE })} /> Free voice (Gemini)</label>
      <label class="radio"><input type="radio" name="narr" checked={config.narrator.provider === "elevenlabs"} onchange={() => (config.narrator = { provider: "elevenlabs", voice: "" })} /> ElevenLabs</label>
    </div>
  </div>
  {#if narratorProvider(config.narrator.provider) === "gemini"}
    {#if config.llm.provider !== "gemini"}
      <KeyField name="gemini" label="Gemini" keyUrl={LLM_PROVIDERS.find((p) => p.id === "gemini")?.keyUrl ?? ""} bind:isSet={keys.gemini} test={() => ({ command: "test-llm", provider: "gemini", model: "gemini-3.5-flash" })} />
    {/if}
    <div class="field">
      <label for="gvoice">Voice</label>
      <select id="gvoice" bind:value={config.narrator.voice}>
        {#each GEMINI_VOICES as v}<option value={v}>{v}</option>{/each}
      </select>
      <p class="hint">Uses your Gemini key, free within Google's limits. Speaks your content language, Hungarian too. You can listen to samples at the voice step of a video.</p>
    </div>
  {:else}
    <KeyField name="elevenlabs" label="ElevenLabs" keyUrl={SERVICE_KEY_URLS.elevenlabs} bind:isSet={keys.elevenlabs} test={() => ({ command: "test-service", service: "elevenlabs" })} />
    <div class="field">
      <label for="evoice">ElevenLabs voice ID</label>
      <input id="evoice" bind:value={config.narrator.voice} spellcheck="false" placeholder="from your ElevenLabs voice library" />
      <p class="hint">You pay ElevenLabs directly. The free ElevenLabs plan does not allow commercial use.</p>
    </div>
  {/if}
{:else if id === "heygen"}
  <KeyField name="heygen" label="HeyGen" keyUrl={SERVICE_KEY_URLS.heygen} bind:isSet={keys.heygen} test={() => ({ command: "test-service", service: "heygen" })} />
  <label class="radio"><input type="checkbox" bind:checked={config.avatar!.enabled} disabled={!keys.heygen} /> Add an avatar to my videos</label>
{:else if id === "vidiq"}
  <KeyField name="vidiq" label="vidIQ" keyUrl={SERVICE_KEY_URLS.vidiq} bind:isSet={keys.vidiq} />
  <label class="radio"><input type="checkbox" bind:checked={config.research!.vidiq} disabled={!keys.vidiq} /> Use vidIQ keyword data when available</label>
{:else if id === "import"}
  <p class="hint">The Planner app is not available yet. Skip this step, you can import later from Settings.</p>
{/if}

<style>
  .field { display: grid; gap: 6px; margin-bottom: 14px; }
  .label, label { font-weight: 600; font-size: 14px; }
  .radio { font-weight: 400; display: flex; gap: 6px; align-items: center; }
  .row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  .hint { margin: 0; font-size: 13px; color: var(--muted-foreground); }
  .warn { font-size: 13px; background: var(--warning-surface); color: var(--warning-text); padding: 8px 10px; border-radius: 6px; }
  .bad { color: var(--danger-text); font-size: 13px; margin: 0; }
</style>
