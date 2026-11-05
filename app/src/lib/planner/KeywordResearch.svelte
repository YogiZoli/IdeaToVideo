<script lang="ts">
  // Playlist, Keyword Research (DECISIONS 175): the first step of a playlist. Topics in, one per
  // line, real search data out, from vidIQ with the user's own key. The result stays in the
  // Identity's folder, so the Playlist Planner on the next page reads it (runner/planner/index.mjs).
  // Asks first: it uses vidIQ credits. For one video the same data is on its Research tab (KeywordIdeas).
  import { onMount } from "svelte";
  import { ask } from "@tauri-apps/plugin-dialog";
  import type { AppState } from "../api";
  import { runner, errorText } from "../api";
  import { log } from "../logger";
  import ErrorBox from "../ErrorBox.svelte";
  import Progress from "../Progress.svelte";

  let { app, goto }: { app: AppState; goto: (id: "connections" | "planner") => void } = $props();

  type Kw = { keyword: string; volume: number | null; competition: number | null; score: number | null; seed?: string };
  type Saved = { seeds: string[]; keywords: Kw[]; failed: string[]; creditsUsed: number | null; at: string | null };

  const hasKey = $derived(!!app.keys["vidiq"]);
  let seedsText = $state("");
  let saved = $state<Saved | null>(null);
  let busy = $state("");
  let error = $state("");
  let note = $state("");

  onMount(async () => {
    try {
      const r = await runner<{ seeds: string[]; research: Saved | null }>("planner-start", { answers: {}, channel: app.config?.channel ?? {}, language: app.config?.channel.contentLanguage ?? "en" });
      saved = r.research;
      // what was searched last, else the Traffic Card's keywords
      seedsText = (r.research?.seeds?.length ? r.research.seeds : r.seeds).join("\n");
    } catch (e) {
      error = errorText(e);
    }
  });

  const seeds = $derived(seedsText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).slice(0, 10));

  async function research() {
    error = "";
    note = "";
    busy = "Checking your vidIQ credits...";
    try {
      const { credits } = await runner<{ credits: number | null }>("planner-balance", { service: "vidiq" });
      busy = "";
      const ok = await ask(`vidIQ keyword research for ${seeds.length} ${seeds.length === 1 ? "topic" : "topics"}: ${seeds.length} ${seeds.length === 1 ? "call" : "calls"}. It uses vidIQ credits from your plan${credits === null ? "" : `; you have ${credits} now`}. No AI tokens. Go on?`, { title: "Keyword research", kind: "info" });
      if (!ok) return;
      busy = "vidIQ is researching the keywords...";
      const r = await runner<{ keywords: Kw[]; failed: string[]; creditsUsed: number | null }>("planner-research", { service: "vidiq", seeds });
      saved = { seeds, keywords: r.keywords, failed: r.failed, creditsUsed: r.creditsUsed, at: new Date().toISOString() };
      note = `${r.keywords.length} keywords found${r.creditsUsed === null ? "" : `, ${r.creditsUsed} vidIQ credits used`}.${r.failed.length ? ` No data for: ${r.failed.map((f) => f.split(":")[0]).join(", ")}.` : ""}`;
      log("planner_research", { seeds: seeds.length, keywords: r.keywords.length, credits: r.creditsUsed });
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = "";
    }
  }
</script>

<section class="card">
  <p class="hint">What people really search for on YouTube, from vidIQ. Write one topic or phrase per line, at most 10. The result stays here for {app.identity?.name}, and the Playlist Planner builds its plan from it.</p>
  <textarea rows="5" bind:value={seedsText} aria-label="Topics to research" placeholder="sourdough for beginners" spellcheck="false"></textarea>
  {#if !hasKey}<p class="hint">This needs your vidIQ key. <button type="button" class="link" onclick={() => goto("connections")}>Add it in Settings, Connections</button></p>{/if}
  <div class="acts"><button type="button" class="primary" disabled={!!busy || !hasKey || !seeds.length} onclick={research}>Research {seeds.length} with vidIQ</button></div>
  {#if busy}<p class="hint">{busy}</p>{/if}
  {#if busy.startsWith("vidIQ")}<Progress command="planner-research" label="vidIQ is researching the keywords" reveal={false} />{/if}
  {#if note}<p class="good">{note}</p>{/if}
  {#if error}<ErrorBox message={error} context={{ step: "keyword-research" }} />{/if}
</section>

{#if saved}
  <section class="card">
    <div class="head">
      <h2>{saved.keywords.length} keywords{saved.at ? `, ${new Date(saved.at).toLocaleDateString()}` : ""}</h2>
      <button type="button" class="primary" onclick={() => goto("planner")}>Next: plan the playlist</button>
    </div>
    <div class="box">
      <table>
        <thead><tr><th>Keyword</th><th>Monthly searches</th><th>Competition</th><th>Score</th></tr></thead>
        <tbody>
          {#each saved.keywords as k (k.keyword)}
            <tr>
              <td>{k.keyword}</td>
              <td>{k.volume?.toLocaleString("en-US") ?? ""}</td>
              <td>{k.competition ?? ""}</td>
              <td>{k.score ?? ""}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="hint">Score: vidIQ's opportunity score, higher is better. Competition: how many videos target it, lower is easier.</p>
  </section>
{/if}

<style>
  textarea { width: 100%; box-sizing: border-box; margin-top: 8px; }
  .head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 8px; }
  h2 { margin: 0; font-size: 17px; }
  .acts { display: flex; gap: 6px; margin: 8px 0; flex-wrap: wrap; }
  .box { max-height: 420px; overflow: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 6px; }
  th { text-align: left; color: var(--muted-foreground); font-weight: 600; padding: 4px; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: var(--surface); }
  td { padding: 4px; border-bottom: 1px solid var(--border); }
  .hint { color: var(--muted-foreground); font-size: 13px; margin: 4px 0; }
  .good { color: var(--success); font-size: 13px; margin: 4px 0; }
  .link { border: none; background: none; padding: 0; color: var(--primary); text-decoration: underline; cursor: pointer; font-size: inherit; font-family: inherit; min-height: 0; }
</style>
