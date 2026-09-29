<script lang="ts">
  // One API key: paste, save to the OS keychain, test, remove. The value is
  // cleared from the input as soon as it is saved; the UI never reads it back.
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { setKey, deleteKey, runner, errorText } from "./api";
  import ErrorBox from "./ErrorBox.svelte";


  let {
    name,
    label,
    keyUrl,
    isSet = $bindable(false),
    test,
  }: {
    name: string;
    label: string;
    keyUrl?: string;
    isSet?: boolean;
    test?: () => Record<string, unknown> & { command: string };
  } = $props();

  let value = $state("");
  let busy = $state(false);
  let message = $state("");
  let ok = $state<boolean | null>(null);

  async function save() {
    busy = true;
    message = "";
    ok = null;
    try {
      await setKey(name, value);
      value = "";
      isSet = true;
      if (test) await runTest();
      else {
        ok = true;
        message = "Saved in the system keychain.";
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
      const r = await runner<{ ok: boolean; message: string }>(command, request);
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
      await deleteKey(name);
      isSet = false;
      ok = null;
      message = "Key removed.";
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
    <label for={`key-${name}`}>{label} API key</label>
    <span class="badge" class:on={isSet}>{isSet ? "Saved" : "Not set"}</span>
    {#if keyUrl}
      <button type="button" class="link" onclick={() => openUrl(keyUrl)}>Get a key</button>
    {/if}
  </div>
  <div class="row">
    <input
      id={`key-${name}`}
      type="password"
      autocomplete="off"
      spellcheck="false"
      placeholder={isSet ? "Paste a new key to replace the saved one" : "Paste your key"}
      bind:value
    />
    <button type="button" class="primary" disabled={busy || !value.trim()} onclick={save}>Save</button>
    {#if test}
      <button type="button" disabled={busy || !isSet} onclick={runTest}>Test key</button>
    {/if}
    {#if isSet}
      <button type="button" class="ghost" disabled={busy} onclick={remove}>Remove</button>
    {/if}
  </div>
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
