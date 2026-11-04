<script lang="ts">
  // VideoCalls: gate 1's comment calls for one ONE Video (docs/wizards/cta.md).
  // By default the Identity's (Wizards, CTA); "Change for this
  // video" sets this video's own, which goes into the next Write script.
  // `own` is null while the Identity's calls apply. A new video starts from
  // the previous video's choice ("previously selected", cta-last.json).
  // `used` is what the current script was written with.
  // "Who says the calls" (Zoltan, 2026-10-08, DECISIONS 120): four choices
  // for this video, none chosen for you: your uploaded clips, HeyGen makes
  // new ones, the HeyGen clips made before, or no avatar (the narrator). A
  // choice that cannot work yet is greyed out, with a link to where it is
  // added.
  import { onMount } from "svelte";
  import type { AppState, CtaMode, CtaProfile, CtaSlot, CtaState } from "../api";
  import { heygenReady, priceText, callText } from "./clips";
  import { runner } from "../api";
  import { log } from "../logger";
  import CallsEditor from "./CallsEditor.svelte";

  let {
    app,
    own = $bindable(null),
    used = null,
    disabled = false,
    openPage,
  }: {
    app: AppState;
    openPage?: (page: "cta" | "connections" | "avatar") => void;
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
    }
    editing = true;
  }
  const complete = $derived(SLOT_IDS.every((s) => !on[s] || slots[s]));
  function apply() {
    own = {
      slots: Object.fromEntries(SLOT_IDS.map((s) => [s, on[s] ? slots[s] : null])) as Record<CtaSlot, string | null>,
      modes: { ...modes },
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
  // Who says the calls in this video
  type Who = "upload" | "heygen-new" | "previous" | "narrator";
  const WHO: { id: Who; label: string }[] = [
    { id: "upload", label: "My uploaded clips" },
    { id: "heygen-new", label: "HeyGen avatar, newly generated" },
    { id: "previous", label: "HeyGen avatar, previously used" },
    { id: "narrator", label: "No avatar" },
  ];
  const words = $derived(current ? SLOT_IDS.map((s) => current.slots[s]).filter((k): k is string => !!k) : []);
  const segs = $derived(st ? st.segments.filter((g) => words.includes(g.keyword)) : []);
  const hasKey = $derived(!!app.keys["heygen"]);
  const canHeygen = $derived(heygenReady(app));
  const can = $derived<Record<Who, boolean>>({
    upload: segs.some((g) => g.source === "upload"),
    "heygen-new": canHeygen,
    previous: hasKey && segs.some((g) => g.source !== "upload"),
    narrator: true,
  });
  const who = $derived.by<Who | null>(() => {
    if (!own?.modes) return null;
    const m = SLOT_IDS.filter((s) => own!.slots[s]).map((s) => own!.modes![s]);
    return m.length && m.every((x) => x === m[0]) && WHO.some((w) => w.id === m[0]) ? (m[0] as Who) : null;
  });
  const engine = $derived(app.identity?.avatar?.engine ?? app.config?.avatar?.engine ?? null);
  const price = $derived(st && words.length ? priceText(callText(words[0], st.options.keywords.find((k) => k.keyword === words[0])?.gets ?? "the details"), engine).replace(", made once and used in every video", "") : "");
  function choose(w: Who) {
    const base = current!;
    own = {
      slots: { ...base.slots },
      modes: Object.fromEntries(SLOT_IDS.map((s) => [s, w])) as Record<CtaSlot, CtaMode>,
      offers: { ...(base.offers ?? {}) },
      endScreen: base.endScreen ?? identity?.endScreen ?? 20,
    };
    previous = false;
    log("choice_changed", { field: "Who says the calls in this video", value: w });
  }
  const segList = (src: "upload" | "previous") => segs.filter((g) => (g.source === "upload") === (src === "upload")).map((g) => g.keyword).join(", ");

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
    <span class="hint">{previous ? "previously selected" : own ? "for this video" : "from Wizards, CTA"}</span>
    <span class="spacer"></span>
    {#if !editing}
      <button type="button" class="ghost" {disabled} onclick={edit}>Change for this video</button>
      {#if own}<button type="button" class="ghost" {disabled} onclick={reset}>Use the Identity's</button>{/if}
    {/if}
  </div>
  {#if words.length}
    <fieldset class="who" {disabled}>
      <legend>Who says the calls in this video?</legend>
      {#each WHO as w (w.id)}
        <label class="opt" class:off={!can[w.id]} class:on={who === w.id}>
          <input type="radio" name="who" checked={who === w.id} disabled={!can[w.id]} onchange={() => choose(w.id)} />
          <span class="txt">
            <b>{w.label}</b>
            {#if w.id === "upload"}
              {#if can.upload}<span class="hint">For {segList("upload")}. The others: the narrator.</span>
              {:else}<span class="hint">No uploaded clip for these keywords yet. <button type="button" class="link" onclick={() => openPage?.("cta")}>Add one in Wizards, CTA</button></span>{/if}
            {:else if w.id === "heygen-new"}
              {#if !hasKey}<span class="hint">You have not added a HeyGen key yet. <button type="button" class="link" onclick={() => openPage?.("connections")}>Add it here</button></span>
              {:else if !canHeygen}<span class="hint">Pick your HeyGen avatar first. <button type="button" class="link" onclick={() => openPage?.("avatar")}>Identity, AI Avatar</button></span>
              {:else}<span class="hint">Made with your key before the script is written, {price} a clip. Uses HeyGen credits. An uploaded clip is never replaced.</span>{/if}
            {:else if w.id === "previous"}
              {#if !hasKey}<span class="hint">Needs your HeyGen key. <button type="button" class="link" onclick={() => openPage?.("connections")}>Add it here</button></span>
              {:else if can.previous}<span class="hint">For {segList("previous")}. Free, already made.</span>
              {:else}<span class="hint">No HeyGen clip made before for these keywords.</span>{/if}
            {:else}
              <span class="hint">The narrator says the calls. No avatar, no cost.</span>
            {/if}
          </span>
        </label>
      {/each}
      {#if !who}<p class="hint">Nothing chosen yet: {own ? "this video's calls" : "the Identity's settings in Wizards, CTA"} apply.</p>{/if}
    </fieldset>
  {/if}
  {#if used && JSON.stringify(used.map((c) => `${c.slot}${c.keyword}`)) !== JSON.stringify(SLOT_IDS.filter((s) => current.slots[s]).map((s) => `${s}${current.slots[s]}`))}
    <p class="hint">The current script was written with {used.length ? used.map((c) => `${c.keyword} (${c.slot})`).join(", ") : "no comment calls"}. Write again to use the calls above.</p>
  {/if}
  {#if editing}
    <div class="box">
      <CallsEditor options={st.options} bind:slots bind:on bind:modes segments={st.segments} compact />
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
  .who { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 10px 0 0; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; }
  .who legend { font-weight: 600; padding: 0 4px; }
  .who > .hint { grid-column: 1 / -1; }
  .opt { display: flex; gap: 8px; align-items: flex-start; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; font-weight: 400; }
  .opt.on { border-color: var(--primary); background: var(--primary-surface); }
  .opt.off b { color: var(--muted-foreground); }
  .txt { display: grid; gap: 2px; }
  .link { border: none; background: none; padding: 0; color: var(--primary); text-decoration: underline; cursor: pointer; font-size: inherit; font-family: inherit; min-height: 0; }
  @media (max-width: 760px) { .who { grid-template-columns: 1fr; } }
</style>
