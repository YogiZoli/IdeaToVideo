<script lang="ts">
  // One API key: paste, save to the OS keychain, test, remove. The value is
  // cleared from the input as soon as it is saved; the UI never reads it back.
  // Two levels (docs/identity.md 4): scope "app" edits the key for every
  // Identity; scope "identity" shows which key the active Identity uses (its
  // own, or the App's) and can give it its own.
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { setKey, deleteKey, runner, errorText, type KeyScope } from "./api";
  import { keySources, refreshKeySources } from "./keystate.svelte";
  import ErrorBox from "./ErrorBox.svelte";


  let {
    name,
    label,
    keyUrl,
    isSet = $bindable(false),
    test,
    scope = "app",
  }: {
    name: string;
    label: string;
    keyUrl?: string;
    isSet?: boolean;
    test?: () => Record<string, unknown> & { command: string };
    scope?: KeyScope;
  } = $props();

  let value = $state("");
  let busy = $state(false);
  let message = $state("");
  let ok = $state<boolean | null>(null);
  // scope identity: "Use a different key for this Identity" was clicked
  let override = $state(false);

  const src = $derived(keySources[name] ?? { app: scope === "app" && isSet, identity: false });
  // the key this field edits
  const here = $derived(scope === "app" ? src.app : src.identity);
  const showInput = $derived(scope === "app" || src.identity || !src.app || override);
  const badge = $derived(
    scope === "app" ? (src.app ? "Saved" : "Not set") : src.identity ? "Own key" : src.app ? "Using the App key" : "Not set",
  );

  async function refresh() {
    try {
      const keys = await refreshKeySources();
      isSet = !!keys[name];
    } catch {
      isSet = scope === "app" ? here : isSet;
    }
  }

  async function save() {
    busy = true;
    message = "";
    ok = null;
    try {
      await setKey(name, value, scope);
      value = "";
      override = false;
      await refresh();
      if (test) await runTest();
      else {
        ok = true;
        message = scope === "app" ? "Saved in the system keychain, for every Identity." : "Saved in the system keychain, only for this Identity.";
      }
    } catch (e) {
      ok = false;
      message = errorText(e);
    } finally {
      busy = false;
    }
  }

  async function runTest() {
    if (!test) return;
    busy = true;
    message = "Testing...";
    ok = null;
    try {
      const { command, ...request } = test();
      // the App page tests the App key even when this Identity has its own
      const r = await runner<{ ok: boolean; message: string }>(command, scope === "app" ? { ...request, keyScope: "app" } : request);
      ok = r.ok;
      message = r.message;
    } catch (e) {
      ok = false;
      message = errorText(e);
    } finally {
      busy = false;
    }
  }

  async function remove() {
    busy = true;
    try {
      await deleteKey(name, scope);
      await refresh();
      ok = null;
      message = scope === "identity" && src.app ? "Own key removed. This Identity uses the App key again." : "Key removed.";
    } catch (e) {
      ok = false;
      message = errorText(e);
    } finally {
      busy = false;
    }
  }
</script>

<div class="keyfield">
  <div class="row">
    <label for={`key-${name}-${scope}`}>{label} API key</label>
    <span class="badge" class:on={here || (scope === "identity" && src.app)}>{badge}</span>
    {#if keyUrl}
      <button type="button" class="link" onclick={() => openUrl(keyUrl)}>Get a key</button>
    {/if}
  </div>
  {#if scope === "identity"}
    <p class="msg">
      {#if src.identity}This Identity uses its own key, for example so that the costs go to the client's account.
      {:else if src.app}This Identity uses the key saved for all Identities (Settings, App, AI and keys).
      {:else}No key yet. A key saved here is only for this Identity. A key for every Identity goes in Settings, App, AI and keys.{/if}
    </p>
  {/if}
  {#if showInput}
    <div class="row">
      <input
        id={`key-${name}-${scope}`}
        type="password"
        autocomplete="off"
        spellcheck="false"
        placeholder={here ? "Paste a new key to replace the saved one" : "Paste your key"}
        bind:value
      />
      <button type="button" class="primary" disabled={busy || !value.trim()} onclick={save}>{test ? "Save and test" : "Save"}</button>
      {#if test && (here || (scope === "identity" && src.app))}
        <button type="button" disabled={busy} onclick={runTest} title="Checks that the saved key still works and has the permissions the app needs. Costs nothing.">Test again</button>
      {/if}
      {#if here}
        <button type="button" class="ghost" disabled={busy} onclick={remove}>{scope === "identity" ? "Remove own key" : "Remove"}</button>
      {/if}
      {#if override}
        <button type="button" class="ghost" disabled={busy} onclick={() => { override = false; value = ""; }}>Cancel</button>
      {/if}
    </div>
  {:else}
    <div class="row">
      {#if test}
        <button type="button" disabled={busy} onclick={runTest} title="Checks that the key works. Costs nothing.">Test the key</button>
      {/if}
      <button type="button" disabled={busy} onclick={() => (override = true)}>Use a different key for this Identity</button>
    </div>
  {/if}
  {#if message}
    {#if ok === false}
      <ErrorBox {message} context={{ step: `key:${name}` }} />
    {:else}
      <p class="msg" class:good={ok === true}>{message}</p>
    {/if}
  {/if}
</div>

<style>
  .keyfield { display: grid; gap: 6px; }
  .row { display: flex; gap: 8px; align-items: center; }
  .row input { flex: 1; }
  .badge { font-size: 12px; padding: 2px 8px; border-radius: 99px; background: var(--muted); color: var(--muted-foreground); }
  .badge.on { background: var(--success-surface); color: var(--success); }
  .msg { margin: 0; font-size: 13px; color: var(--muted-foreground); }
  .msg.good { color: var(--success); }
</style>
