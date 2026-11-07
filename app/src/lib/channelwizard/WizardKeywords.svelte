<script lang="ts">
  // WizardKeywords (DECISIONS 183): the wizard's Keywords screen. vidIQ research for EVERY typed
  // search (with related keywords), plus matching terms and questions for the main topic, and
  // rising keywords when ticked. One list, each keyword once, ranked by one rule (high searches,
  // low competition first). The user ticks what goes into the card. Asks first, with the credits.
  import { ask } from "@tauri-apps/plugin-dialog";
  import type { AppState } from "../api";
  import { runner, errorText } from "../api";
  import { log } from "../logger";
  import ErrorBox from "../ErrorBox.svelte";
  import Progress from "../Progress.svelte";

  export type WKw = { keyword: string; volume: number | null; competition: string; score: number | null; seed: string; keep?: boolean; mode?: string; below?: boolean; rank?: number | null };
  type Found = { keyword: string; monthlySearches: number | null; monthlyBelow?: boolean; competition: number | null; score: number | null; seed: string; mode: string; rank: number | null };

  let { app, searches, topic, country, keywords = $bindable(), onchange, goto }: { app: AppState; searches: string[]; topic: string; country: string; keywords: WKw[]; onchange: () => void; goto: (page: "connections") => void } = $props();

  const CREDITS_PER_CALL = 5; // vidIQ's price of one keyword research call, said in its tool list
  let rising = $state(false);
  let busy = $state("");
  let error = $state("");
  let note = $state("");
  const hasKey = $derived(!!app.keys["vidiq"]);
  const main = $derived(topic.trim() || searches[0] || "");
  const calls = $derived(searches.length + (main ? 2 + (rising ? 1 : 0) : 0));
  const kept = $derived(keywords.filter((k) => k.keep !== false).length);
  const MODE: Record<string, string> = { research: "related", matching_terms: "matching", questions: "question", rising: "rising" };

  async function run() {
    error = "";
    note = "";
    busy = "Checking your vidIQ credits...";
    try {
      const { credits } = await runner<{ credits: number | null }>("planner-balance", { service: "vidiq" });
      busy = "";
      const what = `${searches.length} ${searches.length === 1 ? "search" : "searches"} with related keywords, matching terms and questions for "${main}"${rising ? ", rising keywords" : ""}`;
      if (!(await ask(`vidIQ keyword research: ${what}. That is ${calls} calls, about ${calls * CREDITS_PER_CALL} vidIQ credits${credits === null ? "" : `; you have ${credits} now`}. No AI tokens. Go on?`, { title: "Keyword research", kind: "info" }))) return;
      busy = "vidIQ is researching every search...";
      const r = await runner<{ keywords: Found[]; failed: string[]; calls: number; creditsBefore: number | null; creditsAfter: number | null; creditsUsed: number | null }>("wizard-keywords", { service: "vidiq", searches, topic: main, country, rising });
      const old = new Map(keywords.map((k) => [k.keyword.toLowerCase(), k]));
      const next: WKw[] = r.keywords.map((k) => ({ keyword: k.keyword, volume: k.monthlySearches, below: !!k.monthlyBelow, competition: k.competition === null ? "" : String(k.competition), score: k.score, seed: k.seed, mode: k.mode, rank: k.rank, keep: old.get(k.keyword.toLowerCase())?.keep ?? true }));
      // a keyword kept from an earlier search that this one did not find stays, after the new ones
      for (const k of keywords) if (!next.some((n) => n.keyword.toLowerCase() === k.keyword.toLowerCase())) next.push(k);
      keywords = next;
      onchange();
      const used = r.creditsUsed === null ? "" : ` ${r.creditsUsed} vidIQ credits used${r.creditsAfter === null ? "" : `, ${r.creditsAfter} left`}.`;
      note = `${r.keywords.length} keywords from ${r.calls} calls.${used}${r.failed.length ? ` No data for: ${r.failed.map((f) => f.split(":")[0]).join(", ")}.` : ""}`;
      log("channel_wizard_keywords", { searches: searches.length, calls: r.calls, keywords: r.keywords.length, credits: r.creditsUsed });
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = "";
    }
  }

  function tick(k: WKw, on: boolean) {
    k.keep = on;
    keywords = [...keywords];
    onchange();
  }
  function all(on: boolean) {
    keywords = keywords.map((k) => ({ ...k, keep: on }));
    onchange();
  }
</script>

{#if !hasKey}
  <p class="hint">This needs your vidIQ key. <button type="button" class="link" onclick={() => goto("connections")}>Add it in Settings, Connections</button></p>
{:else if !searches.length && !main}
  <p class="hint">Type your searches on the Searches step first.</p>
{:else}
  <p class="hint">Looked up: {searches.length} {searches.length === 1 ? "search" : "searches"} ({searches.join(", ")}), and for "{main}" its matching terms and questions{country ? `, in ${country}` : ""}.</p>
  <div class="row">
    <label><input type="checkbox" bind:checked={rising} /> Also rising keywords for "{main}" (one more call)</label>
    <button type="button" disabled={!!busy || !calls} onclick={run}>{busy ? "Asking vidIQ..." : `Research all ${calls} in vidIQ`}</button>
  </div>
{/if}
{#if busy && !busy.startsWith("Checking")}<Progress command="wizard-keywords" label="vidIQ is researching every search" reveal={false} />{/if}
{#if note}<p class="good">{note}</p>{/if}
{#if error}<ErrorBox message={error} context={{ step: "wizard-keywords" }} />{/if}
{#if keywords.length}
  <p class="hint">Ranked by the searches a new channel can win: monthly searches times (100 minus competition), highest first. Every number is vidIQ's; an empty cell is unknown. {kept} of {keywords.length} ticked go into your card. <button type="button" class="link" onclick={() => all(true)}>Tick all</button> <button type="button" class="link" onclick={() => all(false)}>Untick all</button></p>
  <div class="box">
    <table>
      <thead><tr><th></th><th>Keyword</th><th>Monthly searches</th><th>Competition</th><th>Score</th><th>From</th></tr></thead>
      <tbody>
        {#each keywords as k (k.keyword)}
          <tr class:off={k.keep === false}>
            <td><input type="checkbox" aria-label={`Keep ${k.keyword}`} checked={k.keep !== false} onchange={(e) => tick(k, e.currentTarget.checked)} /></td>
            <td>{k.keyword}</td>
            <td>{k.volume === null ? "" : `${k.below ? "under " : ""}${k.volume.toLocaleString("en-US")}`}</td>
            <td>{k.competition}</td>
            <td>{k.score ?? ""}</td>
            <td class="from">{k.seed}{k.mode && MODE[k.mode] ? `, ${MODE[k.mode]}` : ""}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <p class="hint">Score: vidIQ's opportunity score (higher is better). Competition: 0 to 100, lower is easier.</p>
{/if}

<style>
  .row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; justify-content: space-between; }
  .box { max-height: 360px; overflow: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 6px; }
  th { text-align: left; color: var(--muted-foreground); font-weight: 600; padding: 4px; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: var(--surface); }
  td { padding: 4px; border-bottom: 1px solid var(--border); }
  td.from { color: var(--muted-foreground); }
  tr.off td { opacity: 0.5; }
  .hint { color: var(--muted-foreground); font-size: 13px; margin: 4px 0; }
  .good { color: var(--success); font-size: 13px; margin: 4px 0; }
  .link { border: none; background: none; padding: 0; color: var(--primary); text-decoration: underline; cursor: pointer; font-size: inherit; font-family: inherit; min-height: 0; }
</style>
