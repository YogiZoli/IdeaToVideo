<script lang="ts">
  // Gate 3: the scene table. The AI plans one scene per sentence or group of
  // sentences (Recommended). Each row shows what is said, the scene in plain
  // words and what is on screen. The user can swap a row for another scene of
  // the same role (the AI refills that row), edit the main text (Custom), and
  // approve.
  import { onDestroy } from "svelte";
  import ErrorBox from "./ErrorBox.svelte";
  import Progress from "./Progress.svelte";
  import type { AppState, Gate } from "./api";
  import { runner, onProgress, errorText } from "./api";

  let { app, dir, gate, voiceApproved, changed }: { app: AppState; dir: string; gate?: Gate; voiceApproved: boolean; changed: () => Promise<void> } = $props();

  type Row = {
    index: number; from: string; to: string; start: number | null; duration: number | null; said: string;
    component: string; label: string; roleLabel: string; mainVar: string | null; mainText: string | null; shows: string;
    alternatives: { component: string; label: string }[];
  };
  type Scene = { component: string; from: string; to?: string; vars: Record<string, unknown> };
  type Table = { rows: Row[]; gaps: { at: string; need: string }[]; warnings: string[]; scenes?: Scene[] };

  let table = $state<Table>({ rows: [], gaps: [], warnings: [] });
  let edits = $state<Record<number, string>>({});
  let busy = $state(false);
  let step = $state("");
  let error = $state("");

  const llmContext = $derived({ step: "scenes", provider: app.config?.llm.provider, model: app.config?.llm.model });
  const dirty = $derived(Object.keys(edits).length > 0);
  // a table that does not fit the current voice (the voice was made again)
  const stale = $derived(table.rows.length > 0 && table.rows.some((r) => r.start === null));

  async function load() {
    try {
      table = await runner<Table>("scene-table", { projectDir: dir });
      edits = {};
    } catch (e) {
      error = errorText(e);
    }
  }
  $effect(() => {
    if (voiceApproved) load();
  });

  const unlisten = onProgress((p) => {
    if (p.command === "make-scenes") step = p.progress.step === "repairing" ? "Fixing a few problems in the plan..." : "Planning the scenes...";
    if (p.command === "refill-scene") step = "Filling in the new scene...";
  });
  onDestroy(() => unlisten.then((f) => f()));

  let current = $state("");

  async function run<T>(command: string, request: Record<string, unknown>, label: string) {
    busy = true;
    current = command === "save-scenes" ? "" : command;
    error = "";
    step = label;
    try {
      const r = await runner<T & Table>(command, { projectDir: dir, ...request });
      table = r;
      edits = {};
      await changed();
    } catch (e) {
      error = errorText(e);
      // a failed swap leaves the old scene: reload so the menu shows it again
      await load();
      await changed();
    } finally {
      busy = false;
      step = "";
    }
  }

  const look = $derived(app.config?.brand?.preset ?? "blue-professional");
  const plan = () => run("make-scenes", { llm: app.config!.llm, look }, "Starting...");
  const swap = (row: Row, component: string) => run("refill-scene", { llm: app.config!.llm, index: row.index, component, look }, "Filling in the new scene...");

  function save() {
    const scenes = (table.scenes ?? []).map((s, i) => {
      const row = table.rows[i];
      return i in edits && row.mainVar ? { ...s, vars: { ...s.vars, [row.mainVar]: edits[i] } } : s;
    });
    return run("save-scenes", { scenes }, "Saving...");
  }

  // An earlier error (a failed swap or plan) never blocks the approval of
  // the table on screen (Zoltan, 2026-10-01: the button did nothing). Only a
  // failed save of the user's own edits does.
  async function approve() {
    error = "";
    if (dirty) {
      await save();
      if (error) return;
    }
    busy = true;
    try {
      await runner("approve-gate", { projectDir: dir, gate: "scenes" });
      await changed();
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }

  const clock = (s: number | null) => (s === null ? "" : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`);
</script>

<section class="card">
  <div class="head">
    <h2>3. Scene table</h2>
    {#if gate}<span class="pill {gate.state}">{gate.state}{gate.mode ? `, ${gate.mode}` : ""}</span>{/if}
  </div>

  {#if !voiceApproved}
    <p class="hint">Approve the voice and music first.</p>
  {:else}
    <div class="actions">
      <span class="hint grow">The AI picks a scene for every sentence, from what the voice says. You can swap a scene or change its text.</span>
      <button type="button" class="primary" disabled={busy} onclick={plan}>{table.rows.length ? "Plan again" : "Plan scenes (Recommended)"}</button>
    </div>
    {#if busy && current}{#key current}<Progress command={current} label={step} />{/key}{/if}
    {#if error}<ErrorBox message={error} context={llmContext} />{:else if gate?.state === "failed" && gate.error}<ErrorBox message={`Last attempt failed: ${gate.error}`} context={llmContext} />{/if}
    {#if (error || gate?.state === "failed") && !stale && table.rows.length && gate?.state !== "approved"}
      <div class="keep">
        <p>Your earlier scene table is still here, and it fits the voice. You can approve it now, with no new AI call, or plan again later.</p>
        <button type="button" class="primary" disabled={busy} onclick={approve}>Approve this scene table</button>
      </div>
    {/if}

    {#if stale}
      <p class="warn">This scene table was made for an earlier voice, so it no longer fits. Click Plan again.</p>
    {:else if table.rows.length}
      <table>
        <thead><tr><th>Time</th><th>What is said</th><th>Scene</th><th>On screen</th></tr></thead>
        <tbody>
          {#each table.rows as row (row.index)}
            <tr>
              <td class="time">{clock(row.start)}<br /><span class="hint">{row.duration} s</span></td>
              <td class="said">{row.said}</td>
              <td>
                {#if row.alternatives.length}
                  <select value={row.component} disabled={busy} onchange={(e) => swap(row, (e.currentTarget as HTMLSelectElement).value)} aria-label="Scene {row.index + 1}">
                    <option value={row.component}>{row.label}</option>
                    {#each row.alternatives as a}<option value={a.component}>{a.label}</option>{/each}
                  </select>
                {:else}
                  {row.label}
                {/if}
                <div class="hint">{row.roleLabel}</div>
              </td>
              <td>
                {#if row.mainVar}
                  <input value={edits[row.index] ?? row.mainText ?? ""} disabled={busy} oninput={(e) => (edits[row.index] = (e.currentTarget as HTMLInputElement).value)} aria-label="Text of scene {row.index + 1}" />
                {:else}
                  {row.shows}
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>

      {#if table.warnings.length}
        <div class="warn">
          {#each table.warnings as w}<p>{w}</p>{/each}
          <p class="note">Notes only: they do not stop the approval.</p>
        </div>
      {/if}
      {#if table.gaps.length}<p class="hint">For {table.gaps.length} sentence{table.gaps.length > 1 ? "s" : ""} the AI would have liked a scene type the app does not have yet. This is noted in the project log.</p>{/if}

      {#if error}<ErrorBox message={error} context={llmContext} />{/if}
      <div class="actions">
        <button type="button" disabled={busy || !dirty} onclick={save}>Save my edits</button>
        <button type="button" class="primary" disabled={busy || gate?.state === "approved"} onclick={approve}>{gate?.state === "approved" ? "Approved" : "Approve scene table"}</button>
      </div>
    {/if}
  {/if}
</section>

<style>
  .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  h2 { margin: 0; font-size: 17px; }
  .actions { display: flex; justify-content: flex-end; align-items: center; gap: 8px; margin-top: 10px; }
  .grow { flex: 1; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
  th { text-align: left; font-weight: 600; color: var(--muted-foreground); padding: 6px; border-bottom: 1px solid var(--border); }
  td { padding: 6px; border-bottom: 1px solid var(--border); vertical-align: top; }
  td.time { white-space: nowrap; }
  td.said { max-width: 320px; }
  td select, td input { width: 100%; }
  .keep { display: flex; gap: 12px; align-items: center; justify-content: space-between; background: var(--success-surface); border-radius: 8px; padding: 10px 14px; }
  .keep p { margin: 0; }
  .note { opacity: 0.75; font-size: 12px; }
  .warn { margin-top: 10px; padding: 8px 10px; border-radius: 8px; background: var(--warning-surface, var(--muted)); font-size: 13px; }
  .warn p { margin: 2px 0; }
  .hint { color: var(--muted-foreground); font-size: 13px; }
  .pill { font-size: 12px; padding: 3px 10px; border-radius: 99px; background: var(--muted); color: var(--muted-foreground); }
  .pill.approved { background: var(--success-surface); color: var(--success); }
  .pill.pending { background: var(--primary-surface); color: var(--primary-surface-foreground); }
  .pill.failed { background: var(--danger-surface); color: var(--danger-text); }
</style>
