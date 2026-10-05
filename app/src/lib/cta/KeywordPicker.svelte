<script lang="ts">
  // KeywordPicker: the 15 comment keywords in three rows, one per lead
  // temperature (docs/wizards/cta.md). The row is tinted lightly, each card a
  // deeper shade of the same colour, the chosen card wears the full colour and
  // breathes. While nothing is chosen, every card pulses gently to draw the eye
  // (MOTION.md: about 2 percent); with reduced motion nothing moves.
  import type { CtaKeyword, CtaTemperature } from "../api";

  let {
    keywords,
    temperatures,
    value = null,
    compact = false,
    marks = {},
    picked = {},
    onpick,
  }: {
    keywords: CtaKeyword[];
    temperatures: Record<string, CtaTemperature>;
    value?: string | null;
    compact?: boolean;
    marks?: Record<string, string>;
    /** Keywords chosen elsewhere (the other places), with their labels. */
    picked?: Record<string, string[]>;
    onpick: (keyword: string) => void;
  } = $props();

  // Always cold, warm, hot: the order the method goes (the map can arrive
  // sorted by name from the Rust core).
  const ORDER = ["cold", "warm", "hot"];
  const rows = $derived(ORDER.filter((id) => temperatures[id]).map((id) => ({ id, t: temperatures[id], words: keywords.filter((k) => k.temperature === id) })));
</script>

<div class="picker" class:waiting={!value && !Object.keys(picked).length} class:compact role="radiogroup" aria-label="Comment keyword">
  {#each rows as row (row.id)}
    <div class="row" style={`--dot: ${row.t.dot}; --surface: ${row.t.surface}; --ink: ${row.t.text}; --on-dot: ${row.id === "warm" ? "#1a1a1a" : "#ffffff"}`}>
      <div class="head">
        <b><span class="dot" aria-hidden="true"></span>{row.t.label.toUpperCase()}</b>
        <span>{row.t.meaning}</span>
      </div>
      <div class="cards">
        {#each row.words as k (k.keyword)}
          <button type="button" role="radio" aria-checked={value === k.keyword} class="kw" class:chosen={value === k.keyword} class:picked={value !== k.keyword && !!picked[k.keyword]} onclick={() => onpick(k.keyword)}>
            <span class="word">{k.keyword}</span>
            {#if !compact}<span class="gets">{k.gets}</span>{/if}
            {#if picked[k.keyword]}<span class="tag">{picked[k.keyword].join(", ")}</span>{/if}
            {#if marks[k.keyword]}<span class="mark">{marks[k.keyword]}</span>{/if}
          </button>
        {/each}
      </div>
    </div>
  {/each}
</div>

<style>
  .picker { display: grid; gap: 8px; }
  .row { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 8px; align-items: center; padding: 10px; border-radius: 10px; background: color-mix(in srgb, var(--surface) 55%, transparent); }
  .head { display: grid; gap: 2px; color: var(--ink); }
  .head b { display: flex; align-items: center; gap: 8px; font-size: 17px; letter-spacing: 0.06em; }
  .head span { font-size: 12px; font-weight: 600; }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--dot); }
  .cards { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
  .kw { display: grid; gap: 2px; align-content: center; text-align: left; min-height: 60px; padding: 8px 10px; border-radius: 8px; border: 2px solid transparent; background: var(--surface); color: #1a1a1a; font-weight: 400; cursor: pointer; }
  .compact .kw { min-height: 36px; padding: 4px 8px; }
  .compact .row { grid-template-columns: 90px minmax(0, 1fr); padding: 6px; }
  .compact .head span { display: none; }
  .kw:hover { border-color: var(--dot); }
  .kw:focus-visible { outline: 2px solid var(--dot); outline-offset: 2px; }
  .word { font-family: ui-monospace, "JetBrains Mono", monospace; font-weight: 700; font-size: 15px; }
  .gets { font-size: 12px; color: #444; }
  .kw.picked { border-color: var(--dot); background: color-mix(in srgb, var(--dot) 30%, var(--surface)); }
  .tag { justify-self: start; font-size: 11px; font-weight: 700; padding: 0 6px; border-radius: 999px; background: var(--dot); color: var(--on-dot); }
  .mark { justify-self: start; font-size: 11px; font-weight: 700; padding: 0 6px; border-radius: 999px; background: #1a1a1a; color: #fff; }
  .kw.chosen { background: var(--dot); border-color: var(--dot); color: var(--on-dot); animation: breathe 2.4s ease-in-out infinite; }
  .kw.chosen .gets { color: var(--on-dot); }
  .waiting .kw { animation: pulse 1.8s ease-in-out infinite; }
  @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.02); box-shadow: 0 0 0 2px color-mix(in srgb, var(--dot) 35%, transparent); } }
  @keyframes breathe { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--dot) 45%, transparent); } 50% { box-shadow: 0 0 0 5px color-mix(in srgb, var(--dot) 20%, transparent); } }
  @media (prefers-reduced-motion: reduce) { .kw, .waiting .kw, .kw.chosen { animation: none; } }
  @media (max-width: 760px) { .row { grid-template-columns: 1fr; } .cards { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
</style>
