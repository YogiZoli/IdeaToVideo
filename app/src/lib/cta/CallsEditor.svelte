<script lang="ts">
  // CallsEditor: how many comment calls a video has, where they sit, and the
  // keyword of each (docs/wizards/cta.md). Used by the CTA wizard and, per
  // video, at gate 1. `on` says which places have a call; a place that is on
  // but has no keyword yet makes its keywords pulse.
  import type { CtaSlot, CtaState } from "../api";
  import KeywordPicker from "./KeywordPicker.svelte";

  let {
    options,
    slots = $bindable(),
    on = $bindable(),
    compact = false,
  }: {
    options: CtaState["options"];
    slots: Record<CtaSlot, string | null>;
    on: Record<CtaSlot, boolean>;
    compact?: boolean;
  } = $props();

  const SLOT_IDS: CtaSlot[] = ["start", "middle", "end"];
  const count = $derived(SLOT_IDS.filter((s) => on[s]).length);
  let open = $state<CtaSlot | null>(null);
  const shown = $derived(open && on[open] ? open : (SLOT_IDS.find((s) => on[s] && !slots[s]) ?? SLOT_IDS.find((s) => on[s]) ?? null));

  const info = (k: string | null) => options.keywords.find((x) => x.keyword === k) ?? null;
  const temp = (k: string | null) => (info(k) ? options.temperatures[info(k)!.temperature] : null);

  function setCount(n: number) {
    const places = options.placesForCount[String(n)];
    for (const s of SLOT_IDS) on[s] = places.includes(s);
    open = null;
  }
  function toggle(s: CtaSlot, value: boolean) {
    on[s] = value;
    open = value ? s : null;
  }
  // The chosen card shows its colour for a moment, then the next place that
  // still needs a keyword opens.
  let timer: ReturnType<typeof setTimeout> | null = null;
  function pick(s: CtaSlot, k: string) {
    slots[s] = k;
    open = s;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const next = SLOT_IDS.find((x) => x !== s && on[x] && !slots[x]);
      if (next && open === s) open = next;
    }, 700);
  }
</script>

<div class="editor" class:compact>
  <div class="line">
    <span class="label">Comment calls</span>
    <div class="seg" role="radiogroup" aria-label="How many comment calls">
      {#each [0, 1, 2, 3] as n (n)}
        <button type="button" role="radio" aria-checked={count === n} class:chosen={count === n} onclick={() => setCount(n)}>{n}</button>
      {/each}
    </div>
    <span class="hint">{count === 0 ? "No comment call in this video." : count === 3 ? "Start, middle and end." : "Pick the places below."}</span>
  </div>

  {#if count > 0}
    <div class="places">
      {#each SLOT_IDS as s (s)}
        {@const t = temp(slots[s])}
        <div class="place" class:off={!on[s]} class:open={shown === s && on[s]} style={t ? `--dot: ${t.dot}; --surface: ${t.surface}; --on-dot: ${info(slots[s])?.temperature === "warm" ? "#1a1a1a" : "#ffffff"}` : ""}>
          <label class="check"><input type="checkbox" checked={on[s]} onchange={(e) => toggle(s, e.currentTarget.checked)} /> <b>{options.slots[s].label}</b></label>
          {#if on[s]}
            <button type="button" class="chip" class:empty={!slots[s]} onclick={() => (open = s)}>{slots[s] ? `${slots[s]} (${t?.label})` : "Pick a keyword"}</button>
          {/if}
          {#if !compact}<span class="hint">{options.slots[s].hint}</span>{/if}
        </div>
      {/each}
    </div>
    {#if shown}
      <p class="for">Keyword for the {options.slots[shown].label.toLowerCase()}:</p>
      <KeywordPicker keywords={options.keywords} temperatures={options.temperatures} value={slots[shown]} {compact} onpick={(k) => pick(shown!, k)} />
    {/if}
  {/if}
</div>

<style>
  .editor { display: grid; gap: 10px; }
  .line { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
  .label { font-weight: 600; }
  .seg { display: inline-flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .seg button { border: none; border-radius: 0; padding: 4px 14px; background: none; }
  .seg button.chosen { background: var(--primary); color: var(--primary-foreground); font-weight: 600; }
  .places { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .place { display: grid; gap: 4px; align-content: start; padding: 10px; border: 1px solid var(--border); border-radius: 8px; background: color-mix(in srgb, var(--surface, transparent) 60%, transparent); }
  .place.open { outline: 2px solid var(--dot, var(--primary)); }
  .place.off { opacity: 0.6; }
  .check { display: flex; gap: 6px; align-items: center; }
  .chip { justify-self: start; padding: 2px 10px; border-radius: 999px; border: 2px solid var(--dot, var(--border)); background: var(--dot, transparent); color: var(--on-dot, #fff); font-family: ui-monospace, "JetBrains Mono", monospace; font-weight: 700; }
  .chip.empty { background: none; color: inherit; border-style: dashed; font-family: inherit; font-weight: 400; }
  .for { margin: 4px 0 0; font-weight: 600; }
  .hint { font-size: 12px; color: var(--muted-foreground); }
  .compact .places { gap: 6px; }
  @media (max-width: 760px) { .places { grid-template-columns: 1fr; } }
</style>
