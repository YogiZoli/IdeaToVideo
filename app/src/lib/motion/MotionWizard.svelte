<script lang="ts">
  // MotionWizard: the Identity's Motion profile (docs/motion-wizard.md, docs/
  // wizards/motion.md 6), in the shared WizardShell. Everything it offers is
  // HyperFrames' own: its transition registry and shader transitions, grouped
  // by its moods and energies, its background components, its camera rules.
  // The camera moves through every scene and the pace sets how often the
  // picture changes (Zoltan, 2026-10-06: a still frame reads as a slide). Saved as
  // <identity>/motion.json; every ONE Video of the Identity inherits it.
  import { onMount, onDestroy } from "svelte";
  import { convertFileSrc } from "@tauri-apps/api/core";
  import type { AppState, MotionProfile, MotionState, MotionPreview, MotionTransition } from "../api";
  import { runner, errorText } from "../api";
  import { log } from "../logger";
  import WizardShell from "../wizard/WizardShell.svelte";
  import ErrorBox from "../ErrorBox.svelte";
  import Demo from "../wizard/Demo.svelte";
  import WizardMap from "../wizard/WizardMap.svelte";

  let { app, onclose, onsaved }: { app: AppState; onclose: () => void; onsaved: (p: MotionProfile) => void } = $props();

  const STEPS = [
    { id: "start", title: "Start" },
    { id: "changes", title: "Scene changes" },
    { id: "background", title: "Background" },
    { id: "camera", title: "Camera" },
    { id: "captions", title: "Captions" },
    { id: "scenes", title: "Scene styles" },
    { id: "preview", title: "Preview and save" },
  ];
  const language = $derived(app.config?.channel.contentLanguage ?? "en");

  let st = $state<MotionState | null>(null);
  let profile = $state<MotionProfile | null>(null);
  let step = $state(0);
  let busy = $state(false);
  let error = $state("");
  let video = $state<MotionPreview | null>(null);
  let stamp = $state(Date.now());
  let elapsed = $state(0);
  let timer: ReturnType<typeof setInterval> | null = null;

  const moods = $derived(st?.options.moods ?? []);
  const mood = $derived(moods.find((m) => m.id === profile?.transition.mood));
  const label = (name: string | null) => (name ? (st?.options.transitions.find((t) => t.name === name)?.label ?? name) : "");
  const cssList = $derived(st?.options.transitions.filter((t) => t.kind !== "shader") ?? []);
  const shaderList = $derived(st?.options.transitions.filter((t) => t.kind === "shader") ?? []);
  const usesShader = $derived(!!profile && [profile.transition.primary, profile.transition.accent].some((n) => shaderList.some((t) => t.name === n)));
  const usesPush = $derived(!!profile && [profile.transition.primary, profile.transition.accent].includes("push-slide"));

  onMount(async () => {
    try {
      st = await runner<MotionState>("motion-state", {});
      profile = $state.snapshot(st.profile ?? st.start) as MotionProfile;
    } catch (e) {
      error = errorText(e);
    }
  });
  onDestroy(() => timer && clearInterval(timer));

  function useMood(id: string) {
    const m = moods.find((x) => x.id === id)!;
    profile!.transition = { ...profile!.transition, mood: id, primary: m.primary, accent: m.accent, energy: m.energy as MotionProfile["transition"]["energy"] };
    log("choice_changed", { field: "Motion mood", value: id });
  }

  function setOff(name: string, on: boolean) {
    const off = new Set(profile!.scenes.off);
    if (on) off.delete(name);
    else off.add(name);
    profile!.scenes.off = [...off];
  }
  const onCount = (role: string) => st!.options.scenes.find((r) => r.role === role)!.components.filter((c) => !profile!.scenes.off.includes(c.name)).length;

  function setStyle(component: string, id: string, value: string) {
    const style = { ...(profile!.scenes.style[component] ?? {}) };
    if (value === "") delete style[id];
    else style[id] = value === "true" ? true : value === "false" ? false : value;
    const all = { ...profile!.scenes.style, [component]: style };
    if (!Object.keys(style).length) delete all[component];
    profile!.scenes.style = all;
  }

  async function preview() {
    busy = true;
    error = "";
    elapsed = 0;
    timer = setInterval(() => (elapsed += 1), 1000);
    try {
      video = await runner<MotionPreview>("motion-preview", { profile: $state.snapshot(profile), language });
      stamp = Date.now();
      log("motion_preview", { seconds: video.renderSeconds, transitions: video.transitions.join(" ") });
    } catch (e) {
      error = errorText(e);
    } finally {
      if (timer) clearInterval(timer);
      timer = null;
      busy = false;
    }
  }

  async function save() {
    busy = true;
    error = "";
    try {
      const r = await runner<{ profile: MotionProfile }>("motion-save", { profile: $state.snapshot(profile) });
      log("motion_saved", { mood: r.profile.transition.mood, background: r.profile.background.type, camera: r.profile.camera.move, pace: r.profile.pace ?? "balanced", captions: r.profile.captions?.style ?? "off", off: r.profile.scenes.off.length });
      onsaved(r.profile);
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }

  const kindNote = (t: MotionTransition) => (t.kind === "shader" ? "shader" : "");
</script>

{#snippet transitionSelect(value: string | null, onchange: (v: string) => void, allowSame: boolean)}
  <select value={value ?? ""} onchange={(e) => onchange(e.currentTarget.value)}>
    {#if allowSame}<option value="">Same as the main one</option>{/if}
    {#if mood?.transitions.length}
      <optgroup label={`${mood.label} mood`}>
        {#each mood.transitions as t (t.name)}<option value={t.name}>{t.label}{kindNote(t) ? ` (${kindNote(t)})` : ""}</option>{/each}
      </optgroup>
    {/if}
    <optgroup label="Simple">
      {#each cssList as t (t.name)}<option value={t.name}>{t.label}</option>{/each}
    </optgroup>
    <optgroup label="Shader">
      {#each shaderList as t (t.name)}<option value={t.name}>{t.label}</option>{/each}
    </optgroup>
  </select>
{/snippet}

{#if !profile || !st}
  <div class="loading">
    {#if error}<ErrorBox message={error} context={{ step: "motion" }} />{:else}<p class="hint">Loading your motion...</p>{/if}
    <button type="button" onclick={onclose}>Close</button>
  </div>
{:else}
  <WizardShell title={`Motion wizard: ${app.identity?.name ?? ""}`} steps={STEPS} bind:step {busy} onsave={save} oncancel={onclose}>
    {#if error}<ErrorBox message={error} context={{ step: "motion" }} />{/if}

    {#if step === 0}
      <WizardMap current="motion" />
      <p class="lead">How your videos move: not what is on screen (that is the Scenes wizard), but how one scene turns into the next. Pick a mood: each picture shows its scene change. Background and camera come next.</p>
      {#if st.recommended.reason}<p class="good">Recommended for your brand: {moods.find((m) => m.id === st!.recommended.mood)?.label}. {st.recommended.reason}</p>{/if}
      <div class="gallery">
        {#each moods as m (m.id)}
          <button type="button" class="mood" class:chosen={profile.transition.mood === m.id} onclick={() => useMood(m.id)}>
            <Demo of={`transition:${m.primary}`} />
            <b>{m.label}{m.id === st.recommended.mood ? " (recommended)" : ""}</b>
            <span>{m.hint}</span>
            <span class="hint">{m.primary === "cut" ? "Cut" : label(m.primary)}{m.accent ? `, ${label(m.accent)} at new sections` : ""}</span>
          </button>
        {/each}
      </div>
      <h2>Energy</h2>
      <p class="hint">How fast one scene change happens. Watch how quickly A turns into B.</p>
      <div class="opts cards">
        {#each st.options.energies as e (e.id)}
          <label class="radio card demoCard">
            <Demo of={`energy:${e.id}`} />
            <span><input type="radio" name="energy" checked={profile.transition.energy === e.id} onchange={() => (profile!.transition.energy = e.id as MotionProfile["transition"]["energy"])} /> <b>{e.label}</b> <span class="hint">{e.seconds} s per change</span></span>
          </label>
        {/each}
      </div>
      <h2>Pace</h2>
      <p class="hint">How often the picture changes. Each sentence gets its own picture; slower paces join sentences that belong together. The pictures show the difference, faster than real time.</p>
      <div class="opts cards">
        {#each st.options.paces ?? [] as p (p.id)}
          <label class="radio card demoCard">
            <Demo of={`pace:${p.id}`} />
            <span><input type="radio" name="pace" checked={(profile.pace ?? "balanced") === p.id} onchange={() => (profile!.pace = p.id as MotionProfile["pace"])} /> <b>{p.label}{p.id === "balanced" ? " (recommended)" : ""}</b> <span class="hint">{p.picture}</span></span>
          </label>
        {/each}
      </div>
      <p class="hint">Moods, energies and transitions come from HyperFrames by HeyGen (Apache-2.0): its transition overview, its transition registry and its shader transitions.</p>
    {:else if step === 1}
      <p class="lead">One main change between related points, a different one where a new section starts. The last change is always a slow crossfade.</p>
      <div class="pick">
        <label class="field"><span>Main change</span>{#if profile.transition.primary}<Demo of={`transition:${profile.transition.primary}`} />{/if}{@render transitionSelect(profile.transition.primary, (v) => (profile!.transition.primary = v), false)}</label>
        <label class="field"><span>At the start and at a new section</span><Demo of={`transition:${profile.transition.accent ?? profile.transition.primary}`} />{@render transitionSelect(profile.transition.accent, (v) => (profile!.transition.accent = v || null), true)}</label>
        {#if usesPush}
          <label class="field"><span>Push direction</span>
            <select value={profile.transition.direction ?? "LEFT"} onchange={(e) => (profile!.transition.direction = e.currentTarget.value as "LEFT")}>
              {#each [["LEFT", "To the left"], ["RIGHT", "To the right"], ["UP", "Up"], ["DOWN", "Down"]] as [v, l] (v)}<option value={v}>{l}</option>{/each}
            </select>
          </label>
        {/if}
      </div>
      <h2>All of them</h2>
      <p class="hint">Each picture shows one scene (A) changing into the next (B). Click one to make it the main change. These pictures show the idea; the sample video on the last screen shows the real thing.</p>
      <div class="gallery">
        {#each st.options.transitions as t (t.name)}
          <button type="button" class="mood" class:chosen={profile.transition.primary === t.name} onclick={() => (profile!.transition.primary = t.name)}>
            <Demo of={`transition:${t.name}`} />
            <b>{t.label}</b>
            {#if t.kind === "shader"}<span class="hint">Renders slower</span>{/if}
          </button>
        {/each}
      </div>
      <h2>Where</h2>
      <label class="radio"><input type="radio" name="where" checked={profile.transition.where === "every"} onchange={() => (profile!.transition.where = "every")} /> At every scene change</label>
      <label class="radio"><input type="radio" name="where" checked={profile.transition.where === "sections"} onchange={() => (profile!.transition.where = "sections")} /> Only where a new section starts (cuts inside a section)</label>
      {#if usesShader}<p class="hint">Shader transitions are drawn on the graphics card while rendering. {st.options.shaderCost} Where no shader is chosen, the change also fades.</p>{/if}
    {:else if step === 2}
      <p class="lead">What moves behind your scenes. Plain is the calmest.</p>
      <div class="opts cards">
        {#each st.options.backgrounds as b (b.id)}
          {@const blocked = b.darkOnly && st.light}
          <label class="radio card demoCard" class:disabled={blocked}>
            <Demo of={`background:${b.id}`} />
            <span><input type="radio" name="bg" disabled={blocked} checked={profile.background.type === b.id} onchange={() => (profile!.background = { type: b.id as MotionProfile["background"]["type"], vars: {} })} /> <b>{b.label}</b></span>
            {#if b.id === "plain"}<span class="hint">Your brand's background color.</span>{/if}
            {#if b.id === "grain-field"}<span class="hint">A slow field of dots in your colors.</span>{/if}
            {#if b.id === "aurora-drift"}<span class="hint">Slow light over a deep blue base.{blocked ? " Needs a dark look: your look is light." : ""}</span>{/if}
            {#if b.cost}<span class="hint">{b.cost}</span>{/if}
          </label>
        {/each}
      </div>
    {:else if step === 3}
      <p class="lead">A slow camera move keeps every scene alive after it has landed, so nothing looks like a slide.</p>
      <div class="opts cards">
        {#each st.options.cameras as c (c.id)}
          <label class="radio card demoCard">
            <Demo of={`camera:${c.id}`} />
            <span><input type="radio" name="camera" checked={profile.camera.move === c.id} onchange={() => (profile!.camera = { move: c.id as MotionProfile["camera"]["move"] })} /> <b>{c.label}{c.id === "push" ? " (recommended)" : ""}</b></span>
            {#if c.id === "off"}<span class="hint">The scenes hold still once they have landed. Can look like a slide.</span>{/if}
            {#if c.id === "jitter"}<span class="hint">A tiny movement that keeps a held frame alive.</span>{/if}
            {#if c.id === "push"}<span class="hint">A slow push in with a gentle drift through the whole scene, never stopping.</span>{/if}
          </label>
        {/each}
      </div>
    {:else if step === 4}
      <p class="lead">Captions burned into the video: the narrator's words as they are spoken, the spoken word highlighted. Viewers who watch without sound read along. The captions file (.srt) for YouTube is made either way.</p>
      <label class="radio"><input type="checkbox" checked={(profile.spokenWord ?? "highlight") === "highlight"} onchange={(e) => (profile!.spokenWord = e.currentTarget.checked ? "highlight" : "off")} /> Highlight the spoken word in the scene's own text too (and no shaking headlines)</label>
      <p class="hint">Fifteen caption styles from HyperFrames by HeyGen, in your brand's font and colors. The calm ones suit explainers; the loud ones suit short, punchy videos.</p>
      <div class="capgrid">
        <label class="capcard" class:chosen={(profile.captions?.style ?? "off") === "off"}>
          <input type="radio" name="captions" checked={(profile.captions?.style ?? "off") === "off"} onchange={() => (profile!.captions = { style: "off" })} />
          <span class="capimg off">No captions</span>
          <b>Off</b>
          <span class="hint">Only the captions file.</span>
        </label>
        {#each st.options.captions ?? [] as c (c.id)}
          <label class="capcard" class:chosen={profile.captions?.style === c.id}>
            <input type="radio" name="captions" checked={profile.captions?.style === c.id} onchange={() => (profile!.captions = { style: c.id })} />
            {#if c.image}<img class="capimg" src={convertFileSrc(c.image)} alt="" />{:else}<span class="capimg"></span>{/if}
            <b>{c.label}{c.calm ? "" : " (loud)"}</b>
            <span class="hint">{c.hint}</span>
          </label>
        {/each}
      </div>
    {:else if step === 5}
      <p class="lead">How each scene type looks. Which scene types the AI may use is set in the Scenes wizard; the closing scenes in the CTA wizard.</p>
      {#each st.options.scenes as r (r.role)}
        <section class="role">
          <h2>{r.label} <span class="hint">{r.hint}</span></h2>
          {#each r.components as c (c.name)}
            {@const on = !profile.scenes.off.includes(c.name)}
            <div class="comp">
              <b>{c.label}{on ? "" : " (turned off in the Scenes wizard)"}</b>
              <span class="hint">{c.description}</span>
              {#if on}
                {#each c.style as v (v.id)}
                  <label class="field small"><span>{v.label}</span>
                    <select value={String(profile.scenes.style[c.name]?.[v.id] ?? "")} onchange={(e) => setStyle(c.name, v.id, e.currentTarget.value)}>
                      <option value="">Let the AI choose</option>
                      {#if v.options}{#each v.options as o (o.value)}<option value={o.value}>{o.label}</option>{/each}{:else if v.type === "boolean"}<option value="true">On</option><option value="false">Off</option>{/if}
                    </select>
                  </label>
                {/each}
              {/if}
            </div>
          {/each}
        </section>
      {/each}
    {:else}
      <p class="lead">A short sample video with your look and this motion, rendered on this computer. It takes about a minute.</p>
      <div class="row">
        <button type="button" class="primary" disabled={busy} onclick={preview}>{video ? "Render again" : "Render preview"}</button>
        {#if busy}<span class="hint">Rendering, {elapsed} s. The computer is working; this needs no key and costs nothing.</span>{/if}
      </div>
      {#if video}
        <!-- svelte-ignore a11y_media_has_caption -->
        <video controls autoplay src={`${convertFileSrc(video.file)}?v=${stamp}`}></video>
        <p class="hint">Rendered in {video.renderSeconds} s. Changes: {video.transitions.map((t) => label(t)).join(", ") || "cuts only"}.</p>
        {#each video.notes as n (n)}<p class="hint">{n}</p>{/each}
      {/if}
      <p class="hint">Save to use this motion for every new build of this Identity's videos.</p>
    {/if}
  </WizardShell>
{/if}

<style>
  .capgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
  .capcard { display: grid; gap: 4px; align-content: start; padding: 8px; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; }
  .capcard.chosen { border-color: var(--primary, currentColor); box-shadow: 0 0 0 1px var(--primary, currentColor); }
  .capcard input { position: absolute; opacity: 0; pointer-events: none; }
  .capimg { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 6px; background: var(--muted, #eee); display: grid; place-items: center; font-size: 13px; color: var(--muted-foreground); }
  .loading { padding: 24px; display: grid; gap: 12px; }
  .lead { margin: 0; }
  .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
  .mood { display: grid; grid-template-columns: minmax(0, 1fr); justify-items: stretch; justify-content: stretch; gap: 4px; text-align: left; align-content: start; padding: 12px; font-weight: 400; line-height: 1.35; }
  .mood .hint { font-size: 12px; color: var(--muted-foreground); }
  .mood.chosen, .card:has(input:checked) { outline: 2px solid var(--primary); }
  .opts { display: flex; flex-wrap: wrap; gap: 12px; }
  .demoCard { align-items: stretch; align-content: start; }
  .cards .card { display: grid; gap: 4px; padding: 12px; min-width: 200px; max-width: 280px; border: 1px solid var(--border); border-radius: 8px; }
  .card.disabled { opacity: 0.55; }
  .pick { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
  .field { display: grid; gap: 4px; }
  .field.small { grid-template-columns: 140px 1fr; align-items: center; margin-left: 24px; }
  .radio { display: flex; gap: 6px; align-items: center; }
  .role { display: grid; gap: 8px; }
  .role h2 .hint { font-weight: 400; font-size: 13px; margin-left: 8px; color: var(--muted-foreground); }
  .comp { display: grid; gap: 4px; padding: 8px 0; border-bottom: 1px solid var(--border); }
  .row { display: flex; gap: 8px; align-items: center; }
  video { width: 100%; max-width: 860px; border-radius: 8px; background: #000; }
  h2 { margin: 12px 0 0; font-size: 16px; }
</style>
