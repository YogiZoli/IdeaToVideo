<script lang="ts">
  // CtaPage: Wizards, CTA. The comment calls of the Identity's videos and the
  // way into the CTA wizard (docs/wizards/cta.md). On top, large, the three
  // chosen keywords (by default GUIDE, COURSE, TRIGGER), each with where its
  // clip comes from (D5, DECISIONS 119, cta/clips.ts); the other twelve
  // keywords' clips under a closed "Other keywords".
  import { onMount } from "svelte";
  import type { AppState, CtaState, CtaSlot } from "../api";
  import { runner, errorText } from "../api";
  import { log } from "../logger";
  import ErrorBox from "../ErrorBox.svelte";
  import SegmentsManager from "./SegmentsManager.svelte";
  import HeygenImport from "./HeygenImport.svelte";
  import { SOURCE_LABEL, available, effectiveSource, heygenReady, modeFor, priceText, callText, type ClipSource } from "./clips";

  let { app, onopen, refresh = 0, goto }: { app: AppState; onopen: () => void; refresh?: number; goto?: (page: "avatar" | "connections") => void } = $props();

  // YouTube's end screen (DECISIONS 53): seconds left after the last call,
  // set here, not in the wizard.
  let endSaved = $state("");
  async function setEndScreen(value: number) {
    try {
      const base = st!.profile ?? st!.start;
      await runner("cta-save", { profile: { ...$state.snapshot(base), endScreen: value } });
      log("choice_changed", { field: "End screen seconds", value: String(value) });
      endSaved = "Saved.";
      await load();
    } catch (e) {
      error = errorText(e);
    }
  }

  let st = $state<CtaState | null>(null);
  let error = $state("");
  let sourceSaved = $state("");
  // the house three's add or replace form
  let editing = $state<string | null>(null);

  async function load() {
    try {
      st = await runner<CtaState>("cta-state", {});
    } catch (e) {
      error = errorText(e);
    }
  }
  onMount(load);
  $effect(() => {
    if (refresh) load();
  });

  const SLOT_IDS: CtaSlot[] = ["start", "middle", "end"];
  const heygen = $derived(heygenReady(app));
  const hasHeygenKey = $derived(!!app.keys["heygen"]);
  const engine = $derived(app.identity?.avatar?.engine ?? app.config?.avatar?.engine ?? null);
  const profile = $derived(st ? (st.profile ?? st.start) : null);
  const house = $derived(profile ? SLOT_IDS.filter((s) => profile.slots[s]).map((slot) => ({ slot, keyword: profile.slots[slot]! })) : []);
  const houseWords = $derived([...new Set(house.map((h) => h.keyword))]);
  const segOf = (k: string) => st?.segments.find((s) => s.keyword === k) ?? null;
  const info = (k: string) => st!.options.keywords.find((x) => x.keyword === k)!;
  const temp = (k: string) => st!.options.temperatures[info(k).temperature];

  async function setSource(slot: CtaSlot, src: ClipSource) {
    if (!st || !profile) return;
    error = "";
    sourceSaved = "";
    try {
      const modes = { ...(profile.modes ?? { start: "auto", middle: "auto", end: "auto" }), [slot]: modeFor(src) };
      await runner("cta-save", { profile: { ...$state.snapshot(profile), modes } });
      log("choice_changed", { field: `CTA clip ${slot}`, value: src });
      sourceSaved = `${profile.slots[slot]}: ${SOURCE_LABEL[src]}.`;
      await load();
    } catch (e) {
      error = errorText(e);
    }
  }

  async function remove(id: string) {
    error = "";
    try {
      await runner("segment-remove", { id });
      log("segment_removed", {});
      await load();
    } catch (e) {
      error = errorText(e);
    }
  }
</script>

{#if error}<ErrorBox message={error} context={{ step: "cta" }} />{/if}

{#if !st || !profile}
  <section class="card"><p class="hint">Loading...</p></section>
{:else}
  <section class="card">
    <div class="head">
      <h2>Your three keywords</h2>
      <button type="button" class="primary" onclick={onopen}>Open CTA wizard</button>
    </div>
    <p class="hint">{st.profile ? "Chosen in the CTA wizard." : "Not set yet, so the method's three apply."} Every new script of this Identity uses them; a single video can change them at gate 1. Where a keyword's clip plays, the narrator says nothing there.</p>
    {#if !house.length}<p>No comment calls in the videos.</p>{/if}
    <div class="house">
      {#each house as h (h.slot)}
        {@const seg = segOf(h.keyword)}
        {@const t = temp(h.keyword)}
        {@const can = available(seg, heygen)}
        {@const now = effectiveSource(profile.modes?.[h.slot], seg, heygen)}
        <div class="big" style={`--dot: ${t.dot}; --surface: ${t.surface}; --ink: ${t.text}`}>
          <span class="where">{st.options.slots[h.slot].label}</span>
          <span class="kw">{h.keyword}</span>
          <span class="gets">{profile.offers?.[h.keyword] ?? info(h.keyword).gets}, {t.label.toLowerCase()}</span>
          <label class="src">Clip
            <select value={now} onchange={(e) => setSource(h.slot, e.currentTarget.value as ClipSource)}>
              {#each ["upload", "previous", "heygen", "narrator"] as const as s (s)}
                <option value={s} disabled={!can[s]}>{SOURCE_LABEL[s]}{s === "heygen" && heygen && !seg ? ` (${priceText(callText(h.keyword, profile.offers?.[h.keyword] ?? info(h.keyword).gets), engine)})` : ""}</option>
              {/each}
            </select>
          </label>
          <span class="state">
            {#if seg}{seg.source === "upload" ? "Uploaded" : "HeyGen clip"}, {seg.seconds} s.
            {:else if now === "heygen"}HeyGen makes it when the next video's script is written, {priceText(callText(h.keyword, profile.offers?.[h.keyword] ?? info(h.keyword).gets), engine)}.
            {:else}No clip: the narrator says it, without an avatar.{/if}
          </span>
          {#if !hasHeygenKey}
            <span class="state">HeyGen options are greyed out: <button type="button" class="link" onclick={() => goto?.("connections")}>Connect HeyGen</button></span>
          {:else if !heygen && !seg}
            <span class="state">HeyGen needs an avatar look: <button type="button" class="link" onclick={() => goto?.("avatar")}>Identity, AI Avatar</button></span>
          {/if}
          <div class="acts">
            <button type="button" class="ghost" onclick={() => (editing = editing === h.keyword ? null : h.keyword)}>{seg ? "Replace clip" : "Add a clip"}</button>
            {#if seg}<button type="button" class="ghost" onclick={() => remove(seg.id)}>Delete clip</button>{/if}
          </div>
        </div>
      {/each}
    </div>
    {#if sourceSaved}<p class="good">Saved. {sourceSaved}</p>{/if}
    <SegmentsManager {app} options={st.options} cta={profile} bind:segments={st.segments} bind:keyword={editing} grid={false} {goto} />
  </section>

  <section class="card">
    <h2>A video from your HeyGen account</h2>
    <p class="hint">A video already in your HeyGen account becomes the clip of one comment keyword. Reading and downloading costs nothing.</p>
    <HeygenImport {app} />
  </section>

  <section class="card">
    <h2>YouTube end screen</h2>
    <p class="hint">Seconds left at the end of every video, after the last call, for the end screen elements you add in YouTube Studio (subscribe, next video). The last picture holds and the music fades out.</p>
    <label class="row">
      <select value={String(profile.endScreen ?? 20)} onchange={(e) => setEndScreen(Number(e.currentTarget.value))}>
        {#each [0, 5, 10, 15, 20] as v (v)}<option value={String(v)}>{v === 0 ? "No end screen" : `${v} seconds${v === 20 ? " (recommended)" : ""}`}</option>{/each}
      </select>
      {#if endSaved}<span class="hint">{endSaved}</span>{/if}
    </label>
  </section>

  <details class="card other">
    <summary><b>Other keywords</b> <span class="hint">the clips of the other {st.options.keywords.length - houseWords.length}</span></summary>
    <SegmentsManager {app} options={st.options} cta={profile} bind:segments={st.segments} except={houseWords} title="Clips of the other keywords" {goto} />
  </details>
{/if}

<style>
  .row { display: flex; gap: 8px; }
  .head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  h2 { margin: 0; font-size: 17px; }
  .house { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 12px; }
  @media (max-width: 860px) { .house { grid-template-columns: 1fr; } }
  .big { display: grid; gap: 6px; align-content: start; padding: 14px; border-radius: 12px; background: var(--surface); border: 2px solid var(--dot); }
  .where { font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink); }
  .kw { font: 800 26px ui-monospace, "JetBrains Mono", monospace; color: var(--ink); }
  .gets { font-size: 13px; color: var(--ink); }
  .src { display: grid; gap: 4px; font-size: 13px; font-weight: 600; color: var(--ink); }
  .src select { width: 100%; }
  .state { font-size: 12px; color: var(--ink); opacity: 0.85; }
  .acts { display: flex; gap: 6px; flex-wrap: wrap; }
  .acts button { padding: 2px 10px; font-size: 13px; }
  .hint { color: var(--muted-foreground); font-size: 13px; }
  .good { color: var(--success); margin: 8px 0 0; }
  .other summary { cursor: pointer; }
  .link { border: none; background: none; padding: 0; color: inherit; text-decoration: underline; cursor: pointer; font-size: inherit; font-family: inherit; min-height: 0; font-weight: 600; }
</style>
