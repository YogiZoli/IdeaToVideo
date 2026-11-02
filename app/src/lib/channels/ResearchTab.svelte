<script lang="ts">
  // The research brief (runner/research, docs/BUILD_PLAN.md phase 3): key facts,
  // numbers, dates, the check of the user's own text, what is missing, the sources.
  // Everything can be changed before the script; one click goes on. The sources go
  // into the Publishing Card for the user's own checking, never into the description.
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { onMount } from "svelte";
  import ErrorBox from "../ErrorBox.svelte";
  import Progress from "../Progress.svelte";
  import { runner, errorText, openSourceLink } from "../api";
  import { running } from "../work.svelte";
  import type { ResearchBrief } from "./channels";

  let { dir, busy = false, kind = "topic", made, goOn }: { dir: string; busy?: boolean; kind?: string; made: () => Promise<void>; goOn: () => void } = $props();

  const job = $derived(running(dir, ["research-make"]));
  let brief = $state<ResearchBrief | null>(null);
  let loaded = $state(false);
  let error = $state("");
  let working = $state(false);
  const off = $derived(busy || !!job || working);
  const SECTIONS = [
    { id: "facts", label: "Key facts" },
    { id: "numbers", label: "Numbers" },
    { id: "dates", label: "Dates" },
    { id: "missing", label: "Missing from your text" },
  ] as const;
  const VERDICT: Record<string, string> = { right: "Right", wrong: "Wrong", unclear: "Unclear" };

  async function load() {
    try {
      brief = (await runner<{ brief: ResearchBrief | null }>("research-state", { projectDir: dir })).brief;
    } catch (e) {
      error = errorText(e);
    }
    loaded = true;
  }
  onMount(load);
  // the run makes the brief while this tab is open
  let wasRunning = false;
  $effect(() => {
    const now = !!job;
    if (wasRunning && !now) load();
    wasRunning = now;
  });

  async function save() {
    if (!brief) return;
    error = "";
    try {
      brief = (await runner<{ brief: ResearchBrief }>("research-save", { projectDir: dir, brief: $state.snapshot(brief) })).brief;
      await made();
    } catch (e) {
      error = errorText(e);
    }
  }
  function removeRow(id: (typeof SECTIONS)[number]["id"], i: number) {
    brief![id] = brief![id].filter((_, k) => k !== i);
    save();
  }
  function addRow(id: (typeof SECTIONS)[number]["id"]) {
    brief![id] = [...brief![id], { text: "", source: null }];
  }
  function removeClaim(i: number) {
    brief!.claims = brief!.claims.filter((_, k) => k !== i);
    save();
  }
  function removeSource(i: number) {
    brief!.sources = brief!.sources.filter((_, k) => k !== i);
    save();
  }
  async function approve() {
    working = true;
    error = "";
    try {
      await save();
      await runner("research-approve", { projectDir: dir });
      await made();
      goOn();
    } catch (e) {
      error = errorText(e);
    } finally {
      working = false;
    }
  }
  const search = (q: string) => openUrl(`https://www.google.com/search?q=${encodeURIComponent(q)}`);
</script>

<section class="card research">
  <h2>Research brief</h2>
  {#if job}<Progress command="research-make" project={dir} label="The AI is researching" />{/if}
  {#if error}<ErrorBox message={error} context={{ step: "research" }} />{/if}

  {#if !brief}
    {#if loaded && !job}<p class="hint">No brief yet. Press Make the video at the top to start the research.</p>{/if}
  {:else}
    {#each brief.warnings ?? [] as w (w)}<p class="warn">{w}</p>{/each}
    {#if kind === "finished"}<p class="hint">Your script stays exactly as you wrote it. This only checks it: change the script yourself if a claim below is wrong.</p>{/if}

    {#if brief.claims.length}
      <h3>The check of your text</h3>
      <ul class="rows">
        {#each brief.claims as c, i (i)}
          <li class:bad={c.verdict === "wrong"} class:unsure={c.verdict === "unclear"}>
            <div class="grow">
              <p class="claim"><b>{VERDICT[c.verdict] ?? c.verdict}:</b> {c.claim}{#if c.source}<sup>{c.source}</sup>{/if}</p>
              <textarea rows="2" aria-label="Note on this claim" bind:value={c.note} disabled={off} onchange={save}></textarea>
            </div>
            <button type="button" class="ghost" disabled={off} onclick={() => removeClaim(i)}>Remove</button>
          </li>
        {/each}
      </ul>
    {/if}

    {#each SECTIONS as s (s.id)}
      {#if brief[s.id].length || s.id !== "missing"}
        <h3>{s.label}</h3>
        <ul class="rows">
          {#each brief[s.id] as row, i (i)}
            <li>
              <textarea class="grow" rows="2" aria-label={s.label} bind:value={row.text} disabled={off} onchange={save}></textarea>
              {#if row.source}<span class="src" title={brief.sources[row.source - 1]?.title ?? ""}>[{row.source}]</span>{/if}
              <button type="button" class="ghost" disabled={off} onclick={() => removeRow(s.id, i)}>Remove</button>
            </li>
          {/each}
        </ul>
        <button type="button" class="ghost small" disabled={off} onclick={() => addRow(s.id)}>Add a line</button>
      {/if}
    {/each}

    <h3>Sources ({brief.sources.length})</h3>
    <p class="hint">For your own checking. They go into the Publishing Card, never into the YouTube description.</p>
    <ol class="sources">
      {#each brief.sources as src, i (src.url)}
        <li>
          <button type="button" class="link" onclick={() => openSourceLink(dir, src.url).catch((e) => (error = errorText(e)))}>{src.title}</button>
          <button type="button" class="ghost small" disabled={off} onclick={() => removeSource(i)}>Remove</button>
        </li>
      {/each}
    </ol>
    {#if brief.queries?.length}
      <p class="hint">Searched on Google for:
        {#each brief.queries as q (q)}<button type="button" class="chip" onclick={() => search(q)}>{q}</button>{/each}
      </p>
    {/if}

    <div class="actions">
      {#if brief.state === "approved"}<span class="good">Approved. The script uses this brief.</span>{/if}
      <button type="button" class="primary big" disabled={off} onclick={approve}>{kind === "finished" ? "Looks right, go on" : "Use this brief, write the script"}</button>
    </div>
  {/if}
</section>

<style>
  .research { display: grid; gap: 8px; }
  h2 { margin: 0; font-size: 18px; }
  h3 { margin: 10px 0 0; font-size: 15px; }
  .rows { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .rows li { display: flex; gap: 8px; align-items: flex-start; padding: 2px 0; }
  .rows li.bad { border-left: 3px solid var(--danger-text); padding-left: 8px; }
  .rows li.unsure { border-left: 3px solid var(--warning-text); padding-left: 8px; }
  .grow { flex: 1; min-width: 0; box-sizing: border-box; width: 100%; font-size: 14px; }
  .claim { margin: 0 0 4px; font-size: 14px; }
  .src { font-size: 12px; color: var(--muted-foreground); padding-top: 8px; }
  .sources { margin: 0; padding-left: 22px; display: grid; gap: 4px; font-size: 14px; }
  .sources li { overflow-wrap: anywhere; }
  .link { border: none; background: none; padding: 0; color: var(--primary); text-decoration: underline; cursor: pointer; font-size: inherit; font-family: inherit; min-height: 0; text-align: left; }
  .chip { border: 1px solid var(--border); border-radius: 12px; padding: 1px 8px; margin: 2px 4px 0 0; font-size: 12px; min-height: 0; }
  .small { font-size: 12px; padding: 2px 8px; min-height: 0; justify-self: start; }
  .hint { margin: 2px 0; font-size: 13px; color: var(--muted-foreground); }
  .warn { margin: 0; padding: 8px 12px; border-radius: 8px; background: var(--warning-surface); color: var(--warning-text); font-size: 13px; }
  .good { font-size: 13px; color: var(--success); }
  .actions { display: flex; justify-content: flex-end; align-items: center; gap: 12px; margin-top: 12px; }
  .big { font-size: 16px; padding: 10px 22px; }
</style>
