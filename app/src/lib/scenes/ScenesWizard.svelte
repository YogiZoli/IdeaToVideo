<script lang="ts">
  // ScenesWizard: the Identity's Scenes profile (runner/scenes-profile.mjs,
  // DECISIONS 110), in the shared WizardShell. What is on screen: the mix of
  // words, icons, pictures and video; which built-in scene types the AI may
  // use; the imported scene packs; the icon sets; where pictures come from.
  // The Motion wizard keeps how it all moves (and the pace).
  import { onMount } from "svelte";
  import type { AppState, ScenesProfile, ScenesState, SceneKind } from "../api";
  import { runner, errorText } from "../api";
  import { log } from "../logger";
  import WizardShell from "../wizard/WizardShell.svelte";
  import ErrorBox from "../ErrorBox.svelte";
  import PacksPage from "../packs/PacksPage.svelte";

  let { app, onclose, onsaved }: { app: AppState; onclose: () => void; onsaved: (p: ScenesProfile) => void } = $props();

  const STEPS = [
    { id: "start", title: "Start" },
    { id: "mix", title: "Mix" },
    { id: "types", title: "Scene types" },
    { id: "packs", title: "Scene packs" },
    { id: "icons", title: "Icons" },
    { id: "pictures", title: "Pictures and video" },
    { id: "save", title: "Check and save" },
  ];

  let st = $state<ScenesState | null>(null);
  let profile = $state<ScenesProfile | null>(null);
  let step = $state(0);
  let busy = $state(false);
  let error = $state("");

  onMount(async () => {
    try {
      st = await runner<ScenesState>("scenes-state", {});
      profile = $state.snapshot(st.profile) as ScenesProfile;
    } catch (e) {
      error = errorText(e);
    }
  });

  const total = $derived(profile ? Object.values(profile.mix).reduce((a, b) => a + b, 0) : 0);
  const pct = (k: SceneKind) => (profile && total ? Math.round((profile.mix[k] * 100) / total) : 0);
  const hasPixabay = $derived(!!app.keys["pixabay"]);
  const pictureReady = $derived(!!profile && ((profile.pictures.sources.includes("pixabay") && hasPixabay) || (profile.pictures.sources.includes("footage") && (st?.options.footage ?? 0) > 0)));
  const videoReady = $derived(!!profile && profile.pictures.sources.some((s) => s === "footage" || s === "ai-broll") && (st?.options.footage ?? 0) > 0);

  function usePreset(id: string) {
    const p = st!.options.presets.find((x) => x.id === id)!;
    profile!.preset = id;
    profile!.mix = { ...p.mix };
    log("choice_changed", { field: "Scenes mix", value: id });
  }
  function setMix(k: SceneKind, v: number) {
    profile!.mix = { ...profile!.mix, [k]: v };
    profile!.preset = "custom";
  }
  const onCount = (role: string) => st!.options.roles.find((r) => r.role === role)!.components.filter((c) => !profile!.off.includes(c.name)).length;
  function setOn(name: string, on: boolean) {
    const off = new Set(profile!.off);
    if (on) off.delete(name);
    else off.add(name);
    profile!.off = [...off];
  }
  function setFamily(id: string, on: boolean) {
    const fams = profile!.icons.families.filter((f) => f !== id);
    profile!.icons = { families: on ? [...fams, id] : fams };
  }
  function moveFamily(id: string, by: number) {
    const fams = [...profile!.icons.families];
    const i = fams.indexOf(id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= fams.length) return;
    [fams[i], fams[j]] = [fams[j], fams[i]];
    profile!.icons = { families: fams };
  }
  function setSource(id: string, on: boolean) {
    const s = profile!.pictures.sources.filter((x) => x !== id);
    profile!.pictures = { sources: on ? [...s, id] : s };
  }

  async function save() {
    busy = true;
    error = "";
    try {
      const r = await runner<{ profile: ScenesProfile }>("scenes-save", { profile: $state.snapshot(profile) });
      log("scenes_saved", { preset: r.profile.preset, off: r.profile.off.length, families: r.profile.icons.families.join(" "), sources: r.profile.pictures.sources.join(" ") });
      onsaved(r.profile);
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }
</script>

{#snippet iconRow(paths: string[][])}
  <span class="icons">
    {#each paths as d, i (i)}
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{#each d as p, k (k)}<path d={p} />{/each}</svg>
    {/each}
  </span>
{/snippet}

{#if !profile || !st}
  <div class="loading">
    {#if error}<ErrorBox message={error} context={{ step: "scenes" }} />{:else}<p class="hint">Loading your scenes...</p>{/if}
    <button type="button" onclick={onclose}>Close</button>
  </div>
{:else}
  <WizardShell title={`Scenes wizard: ${app.identity?.name ?? ""}`} steps={STEPS} bind:step {busy} onsave={save} oncancel={onclose}>
    {#if error}<ErrorBox message={error} context={{ step: "scenes" }} />{/if}

    {#if step === 0}
      <p class="lead">What your videos show. The Brand wizard sets how things look, the Motion wizard how they move; this one sets what is on screen: words, icons and drawings, pictures and video, and which scene types the AI may pick.</p>
      <p class="hint">Pick a starting mix. You can fine-tune it on the next screen.</p>
      <div class="gallery">
        {#each st.options.presets as p (p.id)}
          <button type="button" class="card" class:chosen={profile.preset === p.id} onclick={() => usePreset(p.id)}>
            <b>{p.label}{p.id === "balanced" ? " (recommended)" : ""}</b>
            <span>{p.hint}</span>
            <span class="hint">{st.options.kinds.map((k) => `${k.label} ${p.mix[k.id]}%`).join(", ")}</span>
          </button>
        {/each}
      </div>
      <p class="hint">How often the picture changes (now: {st.options.pace}) is set in the Motion wizard.</p>
    {:else if step === 1}
      <p class="lead">The share of each kind of scene the AI aims for. A kind without a source is folded into the others for that video.</p>
      {#each st.options.kinds as k (k.id)}
        <label class="slider">
          <span class="lbl"><b>{k.label}</b> <span class="hint">{pct(k.id)}%</span></span>
          <input type="range" min="0" max="100" step="5" value={profile.mix[k.id]} oninput={(e) => setMix(k.id, Number(e.currentTarget.value))} />
        </label>
        {#if k.id === "image" && !pictureReady}<p class="warn">No picture source yet: add a free Pixabay key (Settings, Identity, Footage) or your own footage, and turn the source on under "Pictures and video".</p>{/if}
        {#if k.id === "video" && !videoReady}<p class="warn">No video source yet: add your own clips (Settings, Identity, Footage), or turn on AI B-roll there.</p>{/if}
      {/each}
      <p class="hint">Icons and drawings are always free: the app ships 8700 line icons.</p>
    {:else if step === 2}
      <p class="lead">The app's own scene types, by what they are for. Each kind keeps at least one. The closing scenes are set in the CTA wizard; how each type looks is set in the Motion wizard.</p>
      {#each st.options.roles as r (r.role)}
        <section class="role">
          <h2>{r.label} <span class="hint">{r.hint}</span></h2>
          {#each r.components as c (c.name)}
            {@const on = !profile.off.includes(c.name)}
            <label class="check"><input type="checkbox" checked={on} disabled={on && onCount(r.role) <= 1} onchange={(e) => setOn(c.name, e.currentTarget.checked)} /> {c.label}</label>
          {/each}
        </section>
      {/each}
    {:else if step === 3}
      <p class="lead">Scene packs add scene types someone designed. Import a pack file (.itvpack), choose its scene types, and decide whether it wears this Identity's Brand. Changes here are saved at once.</p>
      <PacksPage />
    {:else if step === 4}
      <p class="lead">The icon sets the drawings and icon scenes use, the first one preferred. All are free line icons.</p>
      {#each st.options.icons as f (f.id)}
        {@const on = profile.icons.families.includes(f.id)}
        <div class="fam">
          <label class="check"><input type="checkbox" checked={on} disabled={on && profile.icons.families.length <= 1} onchange={(e) => setFamily(f.id, e.currentTarget.checked)} /> <b>{f.label}</b> <span class="hint">{f.count} icons, {f.license}</span></label>
          {@render iconRow(f.sample)}
          {#if on}
            <span class="order">
              <button type="button" class="ghost" disabled={profile.icons.families.indexOf(f.id) === 0} onclick={() => moveFamily(f.id, -1)}>Up</button>
              <button type="button" class="ghost" disabled={profile.icons.families.indexOf(f.id) === profile.icons.families.length - 1} onclick={() => moveFamily(f.id, 1)}>Down</button>
              <span class="hint">{profile.icons.families.indexOf(f.id) === 0 ? "first choice" : `choice ${profile.icons.families.indexOf(f.id) + 1}`}</span>
            </span>
          {/if}
        </div>
      {/each}
      <p class="hint">A video never shows the same icon twice, and the next video prefers icons the last ones did not use.</p>
    {:else if step === 5}
      <p class="lead">Where pictures and video clips may come from.</p>
      {#each st.options.sources as s (s.id)}
        <label class="check src" class:later={s.later}>
          <input type="checkbox" disabled={s.later} checked={profile.pictures.sources.includes(s.id)} onchange={(e) => setSource(s.id, e.currentTarget.checked)} />
          <span><b>{s.label}</b>{s.later ? " (coming)" : ""}<br /><span class="hint">{s.hint}</span>
            {#if s.id === "footage"}<br /><span class="hint">{st.options.footage ? `${st.options.footage} clips in your library.` : "No clips yet."}</span>{/if}
            {#if s.id === "pixabay"}<br /><span class="hint">{hasPixabay ? "Key saved." : "No key yet."}</span>{/if}
          </span>
        </label>
      {/each}
    {:else}
      <p class="lead">Your scenes, in short.</p>
      <ul class="summary">
        <li><b>Mix:</b> {st.options.kinds.map((k) => `${k.label} ${pct(k.id)}%`).join(", ")}</li>
        <li><b>Scene types off:</b> {profile.off.length ? profile.off.map((n) => st!.options.roles.flatMap((r) => r.components).find((c) => c.name === n)?.label ?? n).join(", ") : "none"}</li>
        <li><b>Icons:</b> {profile.icons.families.map((f) => st!.options.icons.find((x) => x.id === f)?.label ?? f).join(", then ")}</li>
        <li><b>Pictures and video from:</b> {profile.pictures.sources.length ? profile.pictures.sources.map((s) => st!.options.sources.find((x) => x.id === s)?.label ?? s).join(", ") : "nowhere (words and icons only)"}</li>
      </ul>
      <p class="hint">Every new scene plan of this Identity uses it. Plan the scenes of a ONE Video again to see it there.</p>
    {/if}
  </WizardShell>
{/if}

<style>
  .loading { padding: 24px; display: grid; gap: 12px; }
  .lead { font-size: 16px; margin: 0 0 8px; }
  .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; }
  .card { display: grid; gap: 6px; text-align: left; padding: 12px; border: 1px solid var(--border); border-radius: 8px; background: none; font-weight: 400; }
  .card b { font-weight: 700; }
  .card.chosen { border-color: var(--primary, currentColor); box-shadow: 0 0 0 1px var(--primary, currentColor); }
  .slider { display: grid; gap: 4px; margin: 10px 0; }
  .slider input { width: 100%; max-width: 520px; }
  .lbl { display: flex; gap: 8px; align-items: baseline; }
  .warn { margin: 0 0 6px; font-size: 13px; color: var(--warning-text, #8a5a00); }
  .role { margin: 10px 0; }
  .role h2 { font-size: 15px; margin: 0 0 4px; }
  .check { display: flex; gap: 8px; align-items: flex-start; margin: 4px 0; }
  .fam { display: grid; gap: 6px; padding: 10px 0; border-bottom: 1px solid var(--border); }
  .icons { display: flex; gap: 10px; color: var(--foreground); }
  .order { display: flex; gap: 6px; align-items: center; }
  .src.later { opacity: 0.6; }
  .summary { display: grid; gap: 6px; padding-left: 18px; }
  .hint { color: var(--muted-foreground); font-size: 13px; }
</style>
