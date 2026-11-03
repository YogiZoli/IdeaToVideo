<script lang="ts">
  // The Health check (docs/AUDIT_REPORT.md): keys, models, ffmpeg, the engine, disk
  // space and the internet. The same check runs silently at startup (+page.svelte) and
  // only speaks up when something must be fixed. Testing a key is its own button: it
  // asks each service, and an AI answer can cost a tiny amount.
  import { onMount } from "svelte";
  import ErrorBox from "./ErrorBox.svelte";
  import type { AppState } from "./api";
  import { runner, errorText } from "./api";
  import { LLM_PROVIDERS } from "./catalog";

  let { app, goto }: { app: AppState; goto?: (page: "connections") => void } = $props();

  type Item = { id: string; label: string; state: "ok" | "note" | "fix"; detail?: string; fix?: string };
  let items = $state<Item[] | null>(null);
  let error = $state("");
  let checking = $state(false);
  let at = $state("");

  async function check() {
    checking = true;
    error = "";
    try {
      const r = await runner<{ items: Item[]; at: string }>("health-check", { projectsDir: app.projectsDir, keys: app.keys });
      items = r.items;
      at = new Date(r.at).toLocaleTimeString();
    } catch (e) {
      error = errorText(e);
    } finally {
      checking = false;
    }
  }
  onMount(check);

  // ---- testing the saved keys ----------------------------------------------------
  type KeyResult = { id: string; label: string; ok: boolean; message: string };
  let testing = $state(false);
  let results = $state<KeyResult[]>([]);
  const SERVICES = [{ id: "elevenlabs", label: "ElevenLabs" }, { id: "heygen", label: "HeyGen" }, { id: "kie", label: "Kie AI" }, { id: "pixabay", label: "Pixabay" }];
  async function testKeys() {
    testing = true;
    results = [];
    for (const p of LLM_PROVIDERS.filter((x) => app.keys[x.id])) {
      const model = p.id === app.config?.llm.provider ? app.config.llm.model : undefined;
      try {
        const r = await runner<{ ok: boolean; message: string }>("test-llm", { provider: p.id, model });
        results = [...results, { id: p.id, label: p.label, ok: r.ok, message: r.message }];
      } catch (e) {
        results = [...results, { id: p.id, label: p.label, ok: false, message: errorText(e) }];
      }
    }
    for (const s of SERVICES.filter((x) => app.keys[x.id])) {
      try {
        const r = await runner<{ ok: boolean; message: string }>("test-service", { service: s.id });
        results = [...results, { ...s, ok: r.ok, message: r.message }];
      } catch (e) {
        results = [...results, { ...s, ok: false, message: errorText(e) }];
      }
    }
    testing = false;
  }
</script>

<section class="card">
  <div class="head">
    <h2>Health check</h2>
    <button type="button" disabled={checking} onclick={check}>{checking ? "Checking..." : "Check again"}</button>
  </div>
  <p class="hint">What the app needs on this computer. {at ? `Checked at ${at}.` : ""} It also runs silently when the app starts, and only speaks up when something must be fixed.</p>
  {#if error}<ErrorBox message={error} context={{ step: "health-check" }} />{/if}
  {#if items}
    <ul class="items">
      {#each items as i (i.id)}
        <li class={i.state}>
          <span class="state">{i.state === "ok" ? "OK" : i.state === "fix" ? "Fix" : "Note"}</span>
          <span class="label">{i.label}</span>
          <span class="text">{i.state === "ok" ? (i.detail ?? "") : i.fix}</span>
        </li>
      {/each}
    </ul>
  {:else if !error}
    <p class="hint">Checking...</p>
  {/if}
</section>

<section class="card">
  <h2>Test my keys</h2>
  <p class="hint">Asks each service whether your saved key works. A one-word AI answer can cost a tiny amount of your AI key's credits. The others are free.</p>
  <button type="button" disabled={testing} onclick={testKeys}>{testing ? "Testing..." : "Test my keys"}</button>
  {#if goto}<button type="button" class="link" onclick={() => goto("connections")}>Settings, Connections</button>{/if}
  {#if results.length}
    <ul class="items">
      {#each results as r (r.id)}
        <li class={r.ok ? "ok" : "fix"}>
          <span class="state">{r.ok ? "OK" : "Fix"}</span>
          <span class="label">{r.label}</span>
          <span class="text">{r.message}</span>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  h2 { margin: 0; }
  .hint { color: var(--muted-foreground); font-size: 13px; }
  .items { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 4px; }
  li { display: grid; grid-template-columns: 44px 200px 1fr; gap: 8px; padding: 6px 8px; border-radius: 8px; font-size: 13px; align-items: baseline; }
  .state { font-weight: 700; }
  .ok .state { color: var(--success); }
  .note { background: var(--warning-surface); color: var(--warning-text); }
  .fix { background: var(--danger-surface); color: var(--danger-text); }
  .text { color: inherit; }
  .ok .text { color: var(--muted-foreground); }
</style>
