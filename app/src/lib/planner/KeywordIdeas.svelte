<script lang="ts">
  // KeywordIdeas (DECISIONS 64, 169): what people search for, from vidIQ with the
  // user's own key. On a video's Research tab, where one keyword can be chosen for
  // its script, and on Playlist, Keyword Research. Asks first: it uses vidIQ credits.
  import { untrack } from "svelte";
  import { ask } from "@tauri-apps/plugin-dialog";
  import type { AppState } from "../api";
  import { runner, errorText } from "../api";
  import { log } from "../logger";
  import ErrorBox from "../ErrorBox.svelte";

  type Kw = { keyword: string; monthlySearches: number | null; competition: number | null; score: number | null; growthPct: number | null };

  let { app, topic = "", chosen = null, onchoose, goto }: { app: AppState; topic?: string; chosen?: string | null; onchoose?: (keyword: string | null) => void; goto?: (page: "connections") => void } = $props();

  let q = $state(untrack(() => topic));
  let keywords = $state<Kw[]>([]);
  let busy = $state(false);
  let error = $state("");
  const hasKey = $derived(!!app.keys["vidiq"]);

  async function search() {
    if (!(await ask(`vidIQ keyword ideas for "${q.trim()}": one call. It uses vidIQ credits from your plan, no AI tokens. Go on?`, { title: "Keyword ideas", kind: "info" }))) return;
    busy = true;
    error = "";
    try {
      keywords = (await runner<{ keywords: Kw[] }>("keyword-ideas", { service: "vidiq", keyword: q.trim() })).keywords;
      log("keyword_ideas", { found: keywords.length });
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }
</script>

{#if !hasKey}
  <p class="hint">This needs your vidIQ key. <button type="button" class="link" onclick={() => goto?.("connections")}>Add it in Settings, Connections</button></p>
{:else}
  <form class="row" onsubmit={(e) => { e.preventDefault(); search(); }}>
    <input bind:value={q} aria-label="Topic to look up" placeholder="A topic or a phrase" />
    <button type="submit" disabled={busy || !q.trim()}>{busy ? "Asking vidIQ..." : "Keyword ideas"}</button>
  </form>
{/if}
{#if chosen}<p class="good">Chosen for the script: "{chosen}". {#if onchoose}<button type="button" class="link" onclick={() => onchoose?.(null)}>Remove it</button>{/if}</p>{/if}
{#if error}<ErrorBox message={error} context={{ step: "keyword-ideas" }} />{/if}
{#if keywords.length}
  <div class="box">
    <table>
      <thead><tr><th>Keyword</th><th>Monthly searches</th><th>Competition</th><th>Score</th>{#if onchoose}<th></th>{/if}</tr></thead>
      <tbody>
        {#each keywords.slice(0, 12) as k (k.keyword)}
          <tr class:on={chosen === k.keyword}>
            <td>{k.keyword}</td>
            <td>{k.monthlySearches?.toLocaleString("en-US") ?? ""}</td>
            <td>{k.competition ?? ""}</td>
            <td>{k.score ?? ""}</td>
            {#if onchoose}<td><button type="button" class="ghost" onclick={() => onchoose?.(chosen === k.keyword ? null : k.keyword)}>{chosen === k.keyword ? "Chosen" : "Use"}</button></td>{/if}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <p class="hint">Score: vidIQ's opportunity score (higher is better). Competition: how many videos target it (lower is easier).</p>
{/if}

<style>
  .row { display: flex; gap: 8px; align-items: center; }
  .row input { flex: 1; min-width: 0; }
  .box { max-height: 280px; overflow: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 6px; }
  th { text-align: left; color: var(--muted-foreground); font-weight: 600; padding: 4px; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: var(--surface); }
  td { padding: 4px; border-bottom: 1px solid var(--border); }
  tr.on { background: var(--primary-surface); }
  .hint { color: var(--muted-foreground); font-size: 13px; margin: 4px 0; }
  .good { color: var(--success); font-size: 13px; margin: 4px 0; }
  .link { border: none; background: none; padding: 0; color: var(--primary); text-decoration: underline; cursor: pointer; font-size: inherit; font-family: inherit; min-height: 0; }
</style>
