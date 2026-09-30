<script lang="ts">
  // One project. Phase 1 has gate 1 (script): Recommended (the AI writes it),
  // Custom (edit by hand, save-script), Approve. Later gates show their state.
  import { revealItemInDir } from "@tauri-apps/plugin-opener";
  import { ask } from "@tauri-apps/plugin-dialog";
  import { onDestroy, untrack } from "svelte";
  import ErrorBox from "./ErrorBox.svelte";
  import VoiceGate from "./VoiceGate.svelte";
  import type { AppState, Gate } from "./api";
  import { runner, onProgress, errorText } from "./api";

  let { app, dir, back }: { app: AppState; dir: string; back: () => void } = $props();

  type Loaded = {
    project: { id: string; title: string; status: string; language: string; autopilot?: boolean; gates: Record<string, Gate> };
    brief: { targetLengthMin?: number } | null;
    scriptMarkdown: string | null;
  };

  const GATE_LABELS: [string, string][] = [
    ["script", "1. Script"],
    ["voice", "2. Voice and music"],
    ["scenes", "3. Scene table"],
    ["review", "4. Review"],
    ["avatar", "5. Avatar"],
  ];

  let data = $state<Loaded | null>(null);
  let draft = $state("");
  let length = $state(untrack(() => app.config?.defaults?.targetLengthMin ?? 8));
  let busy = $state(false);
  let step = $state("");
  let error = $state("");
  let notice = $state("");

  const script = $derived(data?.project.gates.script);
  const llmContext = $derived({ step: "script", provider: app.config?.llm.provider, model: app.config?.llm.model });
  const dirty = $derived(data?.scriptMarkdown != null && draft !== data.scriptMarkdown);

  // Does not clear `error`: a failed write-script reloads the project, and the
  // message must stay on screen.
  async function load() {
    try {
      data = await runner<Loaded>("load-project", { projectDir: dir });
      draft = data.scriptMarkdown ?? "";
      if (data.brief?.targetLengthMin) length = data.brief.targetLengthMin;
    } catch (e) {
      error = errorText(e);
    }
  }
  $effect(() => {
    load();
  });

  const unlisten = onProgress((p) => {
    if (p.command !== "write-script") return;
    const s = p.progress.step;
    step = s === "repairing" ? "Fixing a few style problems..." : "Writing the script...";
  });
  onDestroy(() => {
    unlisten.then((f) => f());
  });

  async function writeRecommended() {
    if (data?.scriptMarkdown && !(await ask("Write a new script? The current one and every later gate will be replaced.", { title: "Write again", kind: "warning" }))) return;
    busy = true;
    error = "";
    notice = "";
    step = "Starting...";
    try {
      const r = await runner<{ words: number }>("write-script", {
        projectDir: dir,
        llm: app.config!.llm,
        input: { topic: data!.project.title, targetLengthMin: length },
        channel: app.config!.channel,
      });
      notice = `Script ready, ${r.words} words.`;
      await load();
    } catch (e) {
      error = errorText(e);
      await load();
    } finally {
      busy = false;
      step = "";
    }
  }

  async function saveCustom() {
    busy = true;
    error = "";
    try {
      await runner("save-script", { projectDir: dir, markdown: draft });
      notice = "Your edits are saved.";
      await load();
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }

  async function approve() {
    busy = true;
    error = "";
    try {
      if (dirty) await runner("save-script", { projectDir: dir, markdown: draft });
      await runner("approve-gate", { projectDir: dir, gate: "script" });
      notice = "Script approved.";
      await load();
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }

  const stateLabel = (g?: Gate) =>
    ({ todo: "Not started", running: "Running", pending: "Waiting for your approval", approved: "Approved", skipped: "Skipped", failed: "Failed" })[g?.state ?? "todo"] ?? g?.state;
</script>

<div class="page">
  <header>
    <button type="button" class="ghost" onclick={back}>All projects</button>
    <span class="spacer"></span>
    <button type="button" onclick={() => revealItemInDir(dir + "/project.json")}>Open folder</button>
  </header>

  {#if !data}
    {#if error}<ErrorBox message={error} context={{ step: "load-project" }} />{:else}<p class="hint">Loading...</p>{/if}
  {:else}
    <h1>{data.project.title}</h1>
    <p class="hint">Status: <strong>{data.project.status}</strong>. Language: {data.project.language}.{data.project.autopilot ? " Autopilot on." : ""}</p>

    <ol class="gates">
      {#each GATE_LABELS as [id, label]}
        <li class={data.project.gates[id]?.state ?? "todo"}>
          <span>{label}</span>
          <span class="state">{id === "script" || id === "voice" ? stateLabel(data.project.gates[id]) : "Next version"}</span>
        </li>
      {/each}
    </ol>

    <section class="card">
      <div class="head">
        <h2>1. Script</h2>
        <span class="pill {script?.state}">{stateLabel(script)}{script?.mode ? `, ${script.mode}` : ""}</span>
      </div>

      <div class="controls">
        <label for="len">Length</label>
        <input id="len" type="number" min="1" max="30" bind:value={length} disabled={busy} />
        <span class="hint">minutes</span>
        <span class="spacer"></span>
        <button type="button" class="primary" disabled={busy} onclick={writeRecommended}>
          {data.scriptMarkdown ? "Write again (Recommended)" : "Write script (Recommended)"}
        </button>
      </div>

      {#if busy && step}<p class="hint">{step} This usually takes under a minute.</p>{/if}
      {#if error}
        <ErrorBox message={error} context={llmContext} />
      {:else if script?.state === "failed" && script.error}
        <ErrorBox message={`Last attempt failed: ${script.error}`} context={llmContext} />
      {/if}
      {#if notice && !error}<p class="good">{notice}</p>{/if}

      {#if data.scriptMarkdown !== null || script?.state === "failed"}
        <label for="script" class="label">Script (you can edit it: Custom)</label>
        <textarea id="script" rows="22" bind:value={draft} disabled={busy} spellcheck="true"></textarea>
        <div class="actions">
          <button type="button" disabled={busy || !dirty} onclick={saveCustom}>Save my edits</button>
          <button type="button" class="primary" disabled={busy || !draft.trim() || script?.state === "approved"} onclick={approve}>
            {script?.state === "approved" ? "Approved" : "Approve script"}
          </button>
        </div>
      {:else}
        <p class="hint">Click Write script. The AI uses your Audience, Brand Voice and landing page from Settings{data.brief ? ", and the Video Brief Card" : ""}.</p>
      {/if}
    </section>

    <VoiceGate {app} {dir} gate={data.project.gates.voice} scriptApproved={script?.state === "approved"} changed={load} />
  {/if}
</div>

<style>
  .page { padding: 24px; max-width: 900px; margin: 0 auto; display: grid; gap: 14px; }
  header { display: flex; gap: 8px; align-items: center; }
  .spacer { flex: 1; }
  h1 { margin: 0; }
  h2 { margin: 0; font-size: 17px; }
  .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  .gates { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
  .gates li { background: var(--muted); border-radius: 8px; padding: 8px 10px; display: grid; gap: 2px; font-size: 13px; font-weight: 600; }
  .gates .state { font-weight: 400; color: var(--muted-foreground); }
  .gates li.approved { background: var(--success-surface); }
  .gates li.pending { background: var(--primary-surface); }
  .gates li.failed { background: var(--danger-surface); }
  .pill { font-size: 12px; padding: 3px 10px; border-radius: 99px; background: var(--muted); color: var(--muted-foreground); }
  .pill.approved { background: var(--success-surface); color: var(--success); }
  .pill.pending { background: var(--primary-surface); color: var(--primary-surface-foreground); }
  .pill.failed { background: var(--danger-surface); color: var(--danger-text); }
  .controls { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
  .controls input { width: 70px; }
  .label { display: block; font-weight: 600; font-size: 14px; margin: 12px 0 6px; }
  textarea { width: 100%; font-family: var(--font-mono); font-size: 13px; line-height: 1.5; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px; }
  .hint { color: var(--muted-foreground); font-size: 13px; }
  .good { color: var(--success); }
  .bad { color: var(--danger-text); white-space: pre-wrap; }
</style>
