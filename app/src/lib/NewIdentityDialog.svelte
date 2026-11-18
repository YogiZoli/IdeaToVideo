<script lang="ts">
  // The one way to make a new Identity (FIX_PLAN 2026-11-19, item 1, DECISIONS 187): a name, the
  // content language, and where it starts from: empty, or the settings of another Identity. Create
  // makes it the active one; the caller then opens its recipe on Home. Opened from the Identity
  // switch in the top bar and from Identity, Manage Identity. Nothing ever makes an Identity by itself.
  import type { AppState } from "./api";
  import { saveSettings, duplicateIdentity, errorText } from "./api";
  import { cleanConfig, defaultConfig, LANGUAGES } from "./catalog";
  import { identityFromConfig, roomForIdentity, newIdentityProblem } from "./identity";
  import { fullPlanText } from "./edition";

  let { app, done, cancel }: { app: AppState; done: (s: AppState) => void; cancel: () => void } = $props();

  let name = $state("");
  let language = $state("en");
  // "" = empty, else the id of the Identity whose settings are copied
  let from = $state("");
  let busy = $state(false);
  let error = $state("");
  const room = $derived(roomForIdentity(app.identities.length, app.edition.identityLimit));
  const problem = $derived(newIdentityProblem(name, app.identities.map((i) => i.name)));

  async function create() {
    if (problem || busy) return;
    busy = true;
    error = "";
    try {
      const n = name.trim();
      let s: AppState;
      if (!from) {
        const base = defaultConfig();
        const c = { ...base, name: n, llm: { ...app.app!.llm }, channel: { ...base.channel, contentLanguage: language }, narrator: language === "en" ? { provider: "kokoro" as const, voice: "am_michael" } : base.narrator };
        s = await saveSettings(null, identityFromConfig(cleanConfig(c), null, null));
      } else {
        // the copy: settings and files, never the videos, never the keys
        s = await duplicateIdentity(from, n, false);
        if (s.identity && s.identity.channel?.contentLanguage !== language) {
          s = await saveSettings(null, { ...s.identity, channel: { ...s.identity.channel, contentLanguage: language } });
        }
      }
      done(s);
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && !busy && cancel()} />

<div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && !busy && cancel()}>
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="new-identity-title">
    <h2 id="new-identity-title">New Identity</h2>
    {#if !room}
      <p class="hint">{fullPlanText(app.edition)}</p>
      <div class="row end"><button type="button" onclick={cancel}>Close</button></div>
    {:else}
      <label class="field">
        <span>Name</span>
        <!-- svelte-ignore a11y_autofocus -->
        <input bind:value={name} maxlength="80" autofocus placeholder="For example the channel's name" onkeydown={(e) => e.key === "Enter" && create()} />
      </label>
      <label class="field">
        <span>Content language</span>
        <select bind:value={language}>
          {#each LANGUAGES as l (l.code)}<option value={l.code}>{l.label}</option>{/each}
        </select>
      </label>
      <label class="field">
        <span>Start from</span>
        <select bind:value={from}>
          <option value="">Empty</option>
          {#each app.identities as i (i.id)}<option value={i.id}>Copy settings of {i.name}</option>{/each}
        </select>
      </label>
      <p class="hint">{from ? "The look, voice, recipe and texts are copied. The videos and the keys are not." : "A new Identity with the default settings."} You can rename it any time.</p>
      {#if name.trim() && problem}<p class="bad">{problem}</p>{/if}
      {#if error}<p class="bad">{error}</p>{/if}
      <div class="row end">
        <button type="button" class="ghost" disabled={busy} onclick={cancel}>Cancel</button>
        <button type="button" class="primary" disabled={busy || !!problem} onclick={create}>{busy ? "Creating..." : "Create"}</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; z-index: 50; background: rgb(0 0 0 / 0.35); display: grid; place-items: center; padding: 16px; }
  .dialog { width: min(460px, 100%); display: grid; gap: 12px; padding: 20px; border-radius: 12px; background: var(--surface); border: 1px solid var(--border); box-shadow: 0 12px 32px rgb(0 0 0 / 0.2); }
  h2 { margin: 0; font-size: 18px; }
  .field { display: grid; gap: 4px; font-size: 14px; }
  .field span { font-weight: 600; }
  .row { display: flex; gap: 8px; }
  .end { justify-content: flex-end; }
  .hint { margin: 0; font-size: 13px; color: var(--muted-foreground); }
  .bad { margin: 0; font-size: 13px; color: var(--danger-text); }
</style>
