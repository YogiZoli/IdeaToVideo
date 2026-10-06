<script lang="ts">
  // "AI: Claude Opus 5.5, High effort · Change" on the Script and Scenes
  // tabs (DECISIONS 89). Change opens the model and effort lists; Save writes
  // the choice into the Identity's settings, so the next video of this
  // Identity starts with it too (what was used last). An Identity that used
  // the App's AI gets its own AI settings from then on.
  import type { AppState, LlmStep, StepLlm } from "./api";
  import { saveSettings, errorText } from "./api";
  import { llmFor, describeLlm, withStep } from "./llm";
  import ModelPicker from "./ModelPicker.svelte";

  let { app, step, saved, disabled = false }: { app: AppState; step: LlmStep; saved: (s: AppState) => void; disabled?: boolean } = $props();

  const current = $derived(llmFor(app.config, step));
  let open = $state(false);
  let draft = $state<StepLlm>({ provider: "gemini", model: "" });
  let busy = $state(false);
  let error = $state("");

  function start() {
    draft = { ...current };
    error = "";
    open = true;
  }
  async function save() {
    if (!app.identity || !app.app) return;
    busy = true;
    error = "";
    try {
      const base = app.identity.llm ?? app.app.llm;
      saved(await saveSettings(null, { ...app.identity, llm: withStep(base, step, draft) }));
      open = false;
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }
</script>

<div class="line">
  <span>AI: <b>{describeLlm(current)}</b></span>
  {#if !open}<button type="button" class="link" {disabled} onclick={start}>Change</button>{/if}
</div>
{#if open}
  <div class="box">
    <ModelPicker bind:value={draft} id={`step-${step}`} keys={app.keys} compact />
    <div class="row">
      <span class="hint">Saved for this Identity: the next video starts with it too.</span>
      <button type="button" class="ghost" onclick={() => (open = false)}>Cancel</button>
      <button type="button" disabled={busy || !draft.model.trim()} onclick={save}>Save</button>
    </div>
    {#if error}<p class="bad">{error}</p>{/if}
  </div>
{/if}

<style>
  .line { display: flex; gap: 8px; align-items: center; font-size: 13px; color: var(--muted-foreground); margin: 0 0 8px; }
  .line b { color: var(--foreground); }
  .link { min-height: 0; padding: 0 4px; border: none; background: none; color: var(--primary); text-decoration: underline; font-size: 13px; font-weight: 400; }
  .box { display: grid; gap: 8px; padding: 10px 12px; margin-bottom: 10px; border: 1px solid var(--border); border-radius: 8px; }
  .row { display: flex; gap: 8px; align-items: center; justify-content: flex-end; }
  .row .hint { flex: 1; }
  .row button { min-height: 36px; padding: 4px 14px; }
  .hint { color: var(--muted-foreground); font-size: 13px; }
  .bad { color: var(--danger-text); font-size: 13px; margin: 0; }
</style>
