<script lang="ts">
  // VideoCalls: gate 1's comment calls for one ONE Video (docs/wizards/cta.md).
  // By default the Identity's (Settings, Identity, CTA); "Change for this
  // video" sets this video's own, which goes into the next Write script.
  // `own` is null while the Identity's calls apply. A new video starts from
  // the previous video's choice ("previously selected", cta-last.json).
  // `used` is what the current script was written with.
  import { onMount } from "svelte";
  import type { CtaMode, CtaProfile, CtaSlot, CtaState } from "../api";
  import { runner } from "../api";
  import { log } from "../logger";
  import CallsEditor from "./CallsEditor.svelte";

  let {
    own = $bindable(null),
    used = null,
    disabled = false,
  }: {
    own?: CtaProfile | null;
    used?: { slot: CtaSlot; keyword: string; temperature: string }[] | null;
    disabled?: boolean;
  } = $props();

  const SLOT_IDS: CtaSlot[] = ["start", "middle", "end"];
  let st = $state<CtaState | null>(null);
  let editing = $state(false);
  let slots = $state<Record<CtaSlot, string | null>>({ start: null, middle: null, end: null });
  let on = $state<Record<CtaSlot, boolean>>({ start: false, middle: false, end: false });
  let modes = $state<Record<CtaSlot, CtaMode>>({ start: "auto", middle: "auto", end: "auto" });
  let segmentIds = $state<Partial<Record<CtaSlot, string | null>>>({});
  let previous = $state(false);

  onMount(async () => {
    try {
      st = await runner<CtaState>("cta-state", {});
      if (!own && !used && st.last) {
        own = { ...st.last, endScreen: (st.profile ?? st.start).endScreen };
        previous = true;
      }
    } catch {
      st = null; // the gate still works with the Identity's calls; the runner reports a broken file at Write script
    }
  });

  const identity = $derived(st ? (st.profile ?? st.start) : null);
  const current = $derived(own ?? identity);

  function edit() {
    for (const s of SLOT_IDS) {
      slots[s] = current!.slots[s];
      on[s] = current!.slots[s] !== null;
      modes[s] = current!.modes?.[s] ?? "auto";
      segmentIds[s] = current!.segmentIds?.[s] ?? null;
    }
    editing = true;
  }
  const complete = $derived(SLOT_IDS.every((s) => !on[s] || slots[s]));
  function apply() {
    own = {
      slots: Object.fromEntries(SLOT_IDS.map((s) => [s, on[s] ? slots[s] : null])) as Record<CtaSlot, string | null>,
      modes: { ...modes },
      segmentIds: Object.fromEntries(SLOT_IDS.filter((s) => segmentIds[s]).map((s) => [s, segmentIds[s]])),
      offers: { ...(identity?.offers ?? {}) },
      endScreen: identity?.endScreen ?? 20,
    };
    previous = false;
    editing = false;
    log("choice_changed", { field: "Comment calls for this video", value: SLOT_IDS.map((s) => own!.slots[s] ?? "-").join(" ") });
  }
  function reset() {
    own = null;
    previous = false;
    editing = false;
  }
  const temp = (k: string) => st!.options.temperatures[st!.options.keywords.find((x) => x.keyword === k)?.temperature ?? "cold"];
</script>

{#if st && current}
  <div class="calls">
    <span class="label">Comment calls</span>
    {#each SLOT_IDS.filter((s) => current.slots[s]) as s (s)}
      {@const t = temp(current.slots[s]!)}
      <span class="chip" style={`--dot: ${t.dot}; --on-dot: ${t.label === "Warm" ? "#1a1a1a" : "#ffffff"}`}>{st.options.slots[s].label}: {current.slots[s]}{current.modes?.[s] !== "narrator" && st.segments.some((g) => g.keyword === current.slots[s]) ? " (your segment)" : ""}</span>
    {:else}
      <span class="hint">none</span>
    {/each}
    <span class="hint">{previous ? "previously selected" : own ? "for this video" : "from Settings, Identity, CTA"}</span>
    <span class="spacer"></span>
    {#if !editing}
      <button type="button" class="ghost" {disabled} onclick={edit}>Change for this video</button>
      {#if own}<button type="button" class="ghost" {disabled} onclick={reset}>Use the Identity's</button>{/if}
    {/if}
  </div>
  {#if used && JSON.stringify(used.map((c) => `${c.slot}${c.keyword}`)) !== JSON.stringify(SLOT_IDS.filter((s) => current.slots[s]).map((s) => `${s}${current.slots[s]}`))}
    <p class="hint">The current script was written with {used.length ? used.map((c) => `${c.keyword} (${c.slot})`).join(", ") : "no comment calls"}. Write again to use the calls above.</p>
  {/if}
  {#if editing}
    <div class="box">
      <CallsEditor options={st.options} bind:slots bind:on bind:modes bind:segmentIds segments={st.segments} chooseSegment compact />
      <div class="row">
        <button type="button" class="primary" disabled={!complete} onclick={apply}>Use for this video</button>
        <button type="button" onclick={() => (editing = false)}>Cancel</button>
        {#if !complete}<span class="hint">Pick a keyword for every place that is on.</span>{/if}
      </div>
    </div>
  {/if}
{/if}

<style>
  .calls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .label { font-weight: 600; }
  .chip { padding: 2px 10px; border-radius: 999px; background: var(--dot); color: var(--on-dot); font: 700 13px ui-monospace, "JetBrains Mono", monospace; }
  .spacer { flex: 1; }
  .box { display: grid; gap: 10px; padding: 12px; border: 1px solid var(--border); border-radius: 8px; }
  .row { display: flex; gap: 8px; align-items: center; }
  .hint { font-size: 12px; color: var(--muted-foreground); margin: 0; }
</style>
