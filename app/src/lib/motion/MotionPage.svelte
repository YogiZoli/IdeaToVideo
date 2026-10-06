<script lang="ts">
  // MotionPage: Settings, Identity, Motion. What the Identity's videos do
  // between and behind their scenes, and the way into the Motion wizard
  // (docs/wizards/motion.md 6).
  import { onMount } from "svelte";
  import type { MotionState } from "../api";
  import { runner, errorText } from "../api";
  import ErrorBox from "../ErrorBox.svelte";

  let { onopen, refresh = 0 }: { onopen: () => void; refresh?: number } = $props();

  let st = $state<MotionState | null>(null);
  let error = $state("");

  async function load() {
    try {
      st = await runner<MotionState>("motion-state", {});
    } catch (e) {
      error = errorText(e);
    }
  }
  onMount(load);
  $effect(() => {
    if (refresh) load();
  });

  const name = (list: { id: string; label: string }[] | undefined, id: string | undefined) => list?.find((x) => x.id === id)?.label ?? id ?? "";
  const tlabel = (n: string | null | undefined) => (n ? (st?.options.transitions.find((t) => t.name === n)?.label ?? n) : "");
</script>

{#if error}<ErrorBox message={error} context={{ step: "motion" }} />{/if}
<section class="card">
  <h2>How your videos move</h2>
  {#if !st}
    <p class="hint">Loading...</p>
  {:else if !st.profile}
    <p>No Motion profile yet: scenes change with a straight cut, the background is plain, the camera pushes in slowly through every scene, and the picture changes every 3 to 5 seconds.</p>
    <p class="hint">Recommended for your brand: {name(st.options.moods, st.recommended.mood)}. {st.recommended.reason ?? ""}</p>
  {:else}
    {@const p = st.profile}
    <p>Mood: {name(st.options.moods, p.transition.mood)}, {name(st.options.energies, p.transition.energy).toLowerCase()} energy. Scene changes: {tlabel(p.transition.primary)}{p.transition.accent ? `, ${tlabel(p.transition.accent)} at new sections` : ""}{p.transition.where === "sections" ? ", cuts inside a section" : ""}.</p>
    <p class="hint">Background: {name(st.options.backgrounds, p.background.type)}. Camera: {name(st.options.cameras, p.camera.move)}. Pace: {name(st.options.paces ?? [], p.pace ?? "balanced")}.{p.scenes.off.length ? ` Scene types turned off: ${p.scenes.off.length}.` : ""}{p.updatedAt ? ` Saved ${new Date(p.updatedAt).toLocaleDateString()}.` : ""}</p>
  {/if}
  <p class="hint">Every ONE Video of this Identity uses it from its next build.</p>
  <div class="row"><button type="button" class="primary" onclick={onopen}>Open Motion wizard</button></div>
</section>

<style>
  .row { display: flex; gap: 8px; }
</style>
