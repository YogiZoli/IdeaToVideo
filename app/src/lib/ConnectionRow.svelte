<script lang="ts">
  // One service on Settings, Connections (D3, DECISIONS 119): the key for
  // every Identity (name, state, Get a key, Test, save), and under it "Use a
  // different key for this Identity", which shows the active Identity's own
  // key. An Identity that already has its own key shows it ticked.
  import { ask } from "@tauri-apps/plugin-dialog";
  import { deleteKey, errorText } from "./api";
  import { keySources, refreshKeySources } from "./keystate.svelte";
  import KeyField from "./KeyField.svelte";

  let {
    name,
    label,
    keyUrl,
    test,
    hint = "",
    identityName = "",
    isSet = $bindable(false),
  }: {
    name: string;
    label: string;
    keyUrl?: string;
    test?: () => Record<string, unknown> & { command: string };
    hint?: string;
    identityName?: string;
    isSet?: boolean;
  } = $props();

  const hasOwn = $derived(!!keySources[name]?.identity);
  let asked = $state(false);
  const own = $derived(hasOwn || asked);
  let note = $state("");

  async function toggle(on: boolean) {
    note = "";
    if (on) {
      asked = true;
      return;
    }
    asked = false;
    if (!hasOwn) return;
    if (!(await ask(`Remove the own ${label} key of "${identityName}"? It uses the key for every Identity again.`, { title: "Own key", kind: "warning" }))) {
      asked = true;
      return;
    }
    try {
      await deleteKey(name, "identity");
      isSet = !!(await refreshKeySources())[name];
      note = "Own key removed. This Identity uses the key above.";
    } catch (e) {
      note = errorText(e);
    }
  }
</script>

<div class="conn">
  <KeyField {name} {label} {keyUrl} {test} {hint} scope="app" bind:isSet />
  <label class="own"><input type="checkbox" checked={own} onchange={(e) => toggle(e.currentTarget.checked)} /> Use a different key for this Identity{identityName ? ` (${identityName})` : ""}</label>
  {#if own}
    <div class="inner"><KeyField {name} label={`${label}, ${identityName || "this Identity"}'s own`} {test} scope="identity" own bind:isSet /></div>
  {/if}
  {#if note}<p class="msg">{note}</p>{/if}
</div>

<style>
  .conn { display: grid; gap: 8px; padding: 14px 0; border-top: 1px solid var(--border); }
  .own { display: flex; gap: 6px; align-items: center; font-size: 13px; color: var(--muted-foreground); font-weight: 400; }
  .inner { margin-left: 22px; padding-left: 12px; border-left: 2px solid var(--border); }
  .msg { margin: 0; font-size: 13px; color: var(--muted-foreground); }
</style>
