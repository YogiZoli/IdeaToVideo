<script lang="ts">
  // CallsEditor: how many comment calls a video has, where they sit, and the
  // keyword of each (docs/wizards/cta.md). Used by the CTA wizard and, per
  // video, at gate 1. `on` says which places have a call; a place that is on
  // but has no keyword yet makes its keywords pulse. Where the keyword has
  // segments of the Identity, the place is said by the narrator or played by
  // a segment (`modes`), never both; `chooseSegment` (gate 1) also picks
  // which one, else the least recently used comes next.
  import type { CtaMode, CtaSegment, CtaSlot, CtaState } from "../api";
  import KeywordPicker from "./KeywordPicker.svelte";

  let {
    options,
    slots = $bindable(),
    on = $bindable(),
    modes = $bindable(),
    segmentIds = $bindable(),
    segments = [],
    chooseSegment = false,
    compact = false,
  }: {
    options: CtaState["options"];
    slots: Record<CtaSlot, string | null>;
    on: Record<CtaSlot, boolean>;
    modes: Record<CtaSlot, CtaMode>;
    segmentIds?: Partial<Record<CtaSlot, string | null>>;
    segments?: CtaSegment[];
    chooseSegment?: boolean;
    compact?: boolean;
  } = $props();
  const segsOf = (k: string | null) => segments.filter((g) => g.keyword === k);
  // Which keywords have the Identity's segments: shown on the cards.
  const marks = $derived(Object.fromEntries([...new Set(segments.map((g) => g.keyword))].map((k) => [k, `${segsOf(k).length} clip${segsOf(k).length === 1 ? "" : "s"}`])));
  const segKeywords = $derived([...new Set(segments.map((g) => g.keyword))]);
  // The keywords of the other places stay marked while one place is open
  // (Zoltan, 2026-10-05: only the last pick stayed highlighted).
  const pickedElsewhere = (here: CtaSlot) => {
    const out: Record<string, string[]> = {};
    for (const s of SLOT_IDS) if (s !== here && on[s] && slots[s]) (out[slots[s]!] ??= []).push(options.slots[s].label);
    return out;
  };
  const playsSegment = (s: CtaSlot) => modes[s] === "segment" || (modes[s] !== "narrator" && segsOf(slots[s]).length > 0);

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
    if (slots[s] !== k && segmentIds) segmentIds[s] = null;
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
          {#if on[s] && slots[s] && segsOf(slots[s]).length}
            <div class="mode" role="radiogroup" aria-label="Who says the {options.slots[s].label.toLowerCase()} call">
              <label><input type="radio" name="mode-{s}" checked={!playsSegment(s)} onchange={() => (modes[s] = "narrator")} /> Narrator</label>
              <label><input type="radio" name="mode-{s}" checked={playsSegment(s)} onchange={() => (modes[s] = "segment")} /> My segment ({segsOf(slots[s]).length})</label>
            </div>
            {#if playsSegment(s) && chooseSegment && segmentIds && segsOf(slots[s]).length > 1}
              <select value={segmentIds[s] ?? ""} onchange={(e) => (segmentIds![s] = e.currentTarget.value || null)} aria-label="Which segment">
                <option value="">Next in turn</option>
                {#each segsOf(slots[s]) as g (g.id)}<option value={g.id}>{g.name} ({g.seconds} s)</option>{/each}
              </select>
            {/if}
          {:else if on[s] && slots[s] && segKeywords.length}
            <span class="hint">No segment for {slots[s]}: the narrator says it. Your segments are for {segKeywords.join(", ")}.</span>
          {/if}
          {#if !compact}<span class="hint">{options.slots[s].hint}</span>{/if}
        </div>
      {/each}
    </div>
    {#if shown}
      <p class="for">Keyword for the {options.slots[shown].label.toLowerCase()}:</p>
      <KeywordPicker keywords={options.keywords} temperatures={options.temperatures} value={slots[shown]} {compact} {marks} picked={pickedElsewhere(shown)} onpick={(k) => pick(shown!, k)} />
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
  .mode { display: flex; flex-wrap: wrap; gap: 10px; font-size: 13px; }
  .mode label { display: flex; gap: 4px; align-items: center; }
  .chip { justify-self: start; padding: 2px 10px; border-radius: 999px; border: 2px solid var(--dot, var(--border)); background: var(--dot, transparent); color: var(--on-dot, #fff); font-family: ui-monospace, "JetBrains Mono", monospace; font-weight: 700; }
  .chip.empty { background: none; color: inherit; border-style: dashed; font-family: inherit; font-weight: 400; }
  .for { margin: 4px 0 0; font-weight: 600; }
  .hint { font-size: 12px; color: var(--muted-foreground); }
  .compact .places { gap: 6px; }
  @media (max-width: 760px) { .places { grid-template-columns: 1fr; } }
</style>
