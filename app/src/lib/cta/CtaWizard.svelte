<script lang="ts">
  // CtaWizard: the Identity's comment calls (docs/wizards/cta.md), in the
  // shared WizardShell. Comment Routing: a viewer comments one keyword under
  // the video, its lead temperature (cold, warm, hot) says what they are ready
  // for, and whoever answers the comment sends the matching link. The app only
  // puts the keyword into the narration and on screen; it never answers
  // comments and keeps no link. Saved as <identity>/cta.json; every ONE Video
  // of the Identity inherits it and may set its own at gate 1.
  import { onMount } from "svelte";
  import type { AppState, CtaMode, CtaProfile, CtaSlot, CtaState } from "../api";
  import { runner, errorText } from "../api";
  import { log } from "../logger";
  import WizardShell from "../wizard/WizardShell.svelte";
  import ErrorBox from "../ErrorBox.svelte";
  import CallsEditor from "./CallsEditor.svelte";
  import CallsPreview from "./CallsPreview.svelte";

  let { app, onclose, onsaved }: { app: AppState; onclose: () => void; onsaved: (p: CtaProfile) => void } = $props();

  const STEPS = [
    { id: "calls", title: "Comment calls" },
    { id: "offers", title: "What they get" },
    { id: "preview", title: "Preview and save" },
  ];
  const SLOT_IDS: CtaSlot[] = ["start", "middle", "end"];

  let st = $state<CtaState | null>(null);
  let slots = $state<Record<CtaSlot, string | null>>({ start: null, middle: null, end: null });
  let on = $state<Record<CtaSlot, boolean>>({ start: true, middle: true, end: true });
  let modes = $state<Record<CtaSlot, CtaMode>>({ start: "auto", middle: "auto", end: "auto" });
  let offers = $state<Record<string, string>>({});
  let step = $state(0);
  let busy = $state(false);
  let error = $state("");

  const chosen = $derived([...new Set(SLOT_IDS.filter((s) => on[s] && slots[s]).map((s) => slots[s]!))]);
  const missing = $derived(SLOT_IDS.filter((s) => on[s] && !slots[s]));
  // A keyword whose every place plays the user's segment needs no wording:
  // the clip says it (Zoltan, 2026-10-05).
  const bySegment = (k: string) => {
    const places = SLOT_IDS.filter((s) => on[s] && slots[s] === k);
    return places.length > 0 && places.every((s) => modes[s] !== "narrator" && !!st?.segments.some((g) => g.keyword === k));
  };

  onMount(async () => {
    try {
      st = await runner<CtaState>("cta-state", {});
      // First time: every place on, nothing chosen, so the keywords pulse.
      if (st.profile) {
        for (const s of SLOT_IDS) {
          slots[s] = st.profile.slots[s];
          on[s] = st.profile.slots[s] !== null;
          modes[s] = st.profile.modes?.[s] ?? "auto";
        }
        offers = { ...st.profile.offers };
      }
    } catch (e) {
      error = errorText(e);
    }
  });

  function useDefault() {
    for (const s of SLOT_IDS) {
      slots[s] = st!.start.slots[s];
      on[s] = st!.start.slots[s] !== null;
    }
    log("choice_changed", { field: "CTA", value: "method default" });
  }

  async function save() {
    if (missing.length) {
      error = `Pick a keyword for the ${missing.map((s) => st!.options.slots[s].label.toLowerCase()).join(" and the ")}, or turn that place off.`;
      step = 0;
      return;
    }
    busy = true;
    error = "";
    try {
      const profile = { slots: Object.fromEntries(SLOT_IDS.map((s) => [s, on[s] ? slots[s] : null])), modes: $state.snapshot(modes), offers: $state.snapshot(offers), endScreen: st!.profile?.endScreen ?? st!.start.endScreen };
      const r = await runner<{ profile: CtaProfile }>("cta-save", { profile });
      log("cta_saved", { calls: SLOT_IDS.filter((s) => r.profile.slots[s]).length, start: r.profile.slots.start, middle: r.profile.slots.middle, end: r.profile.slots.end, offers: Object.keys(r.profile.offers).length });
      onsaved(r.profile);
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }
</script>

{#if !st}
  <div class="loading">
    {#if error}<ErrorBox message={error} context={{ step: "cta" }} />{:else}<p class="hint">Loading...</p>{/if}
    <button type="button" onclick={onclose}>Close</button>
  </div>
{:else}
  <WizardShell title={`CTA wizard: ${app.identity?.name ?? ""}`} steps={STEPS} bind:step {busy} onsave={save} oncancel={onclose}>
    {#if error}<ErrorBox message={error} context={{ step: "cta" }} />{/if}

    {#if step === 0}
      <p class="lead">The video asks viewers to comment one keyword. The keyword tells you how ready they are: cold wants a free resource, warm wants to learn more, hot is ready to buy. The method: cold at the start, warm in the middle, hot at the end.</p>
      <div class="row">
        <button type="button" onclick={useDefault}>Use the method: GUIDE, COURSE, TRIGGER</button>
      </div>
      <CallsEditor options={st.options} bind:slots bind:on bind:modes segments={st.segments} />
      {#if !st.segments.length}<p class="hint">Recorded a call once, for example with your avatar? Add it in Wizards, CTA: then a place can play it instead of the narrator.</p>{/if}
      <p class="hint">Someone has to answer the keyword comments with the link, by hand or with a tool. The video never shows or says a link for them.</p>
    {:else if step === 1}
      <p class="lead">What does a viewer get for each keyword? In your words, short. The narrator says it in the call. Leave it empty for the general wording.</p>
      {#if !chosen.length}
        <p class="hint">No keyword chosen yet.</p>
      {/if}
      {#each chosen as k (k)}
        {@const info = st.options.keywords.find((x) => x.keyword === k)!}
        {@const t = st.options.temperatures[info.temperature]}
        <label class="offer" style={`--dot: ${t.dot}; --surface: ${t.surface}`}>
          <span class="kw">{k}</span>
          {#if bySegment(k)}
            <span class="segsays">Your segment says it: nothing to write here.</span>
          {:else}
            <textarea rows="4" maxlength="600" placeholder={info.gets} value={offers[k] ?? ""} oninput={(e) => (offers[k] = e.currentTarget.value)}></textarea>
          {/if}
          <span class="hint">{t.label}</span>
        </label>
      {/each}
    {:else}
      <CallsPreview options={st.options} look={st.look} {slots} {on} {modes} segments={st.segments} {offers} />
      <p class="hint">Save to use these calls in every new script of this Identity. A single video can change them at gate 1.</p>
    {/if}
  </WizardShell>
{/if}

<style>
  .loading { padding: 24px; display: grid; gap: 12px; }
  .lead { margin: 0; }
  .row { display: flex; gap: 8px; align-items: center; }
  .offer { display: grid; grid-template-columns: 130px minmax(0, 1fr) 60px; gap: 10px; align-items: center; padding: 8px 10px; border-radius: 8px; background: color-mix(in srgb, var(--surface) 60%, transparent); }
  .segsays { font-size: 14px; color: var(--muted-foreground); }
  .kw { font-family: ui-monospace, "JetBrains Mono", monospace; font-weight: 700; color: var(--dot); }
  .hint { font-size: 12px; color: var(--muted-foreground); }
</style>
