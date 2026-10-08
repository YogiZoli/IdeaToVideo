<script lang="ts">
  // ScenesPage: Wizards, Scenes. What the Identity's videos show,
  // in short, the way into the Scenes wizard (DECISIONS 110), and the scene
  // packs (DECISIONS 107).
  import { onMount } from "svelte";
  import type { ScenesState } from "../api";
  import { runner, errorText } from "../api";
  import ErrorBox from "../ErrorBox.svelte";
  import PacksPage from "../packs/PacksPage.svelte";

  let { onopen, refresh = 0, goto }: { onopen: () => void; refresh?: number; goto?: (page: "transfer") => void } = $props();

  let st = $state<ScenesState | null>(null);
  let error = $state("");

  async function load() {
    try {
      st = await runner<ScenesState>("scenes-state", {});
    } catch (e) {
      error = errorText(e);
    }
  }
  onMount(load);
  $effect(() => {
    if (refresh) load();
  });
</script>

<section class="card">
  <h2>Your scenes</h2>
  {#if error}<ErrorBox message={error} context={{ step: "scenes" }} />{/if}
  {#if st}
    {@const p = st.profile}
    <p>{st.saved ? "" : "No Scenes profile yet: the balanced mix is used. "}Mix: {st.options.kinds.map((k) => `${k.label} ${p.mix[k.id]}%`).join(", ")}.</p>
    <p class="hint">Icons: {p.icons.families.map((f) => st!.options.icons.find((x) => x.id === f)?.label ?? f).join(", then ")}. Pictures and video from: {p.pictures.sources.length ? p.pictures.sources.map((s) => st!.options.sources.find((x) => x.id === s)?.label ?? s).join(", ") : "nowhere"}.{p.off.length ? ` Scene types turned off: ${p.off.length}.` : ""}</p>
  {:else if !error}
    <p class="hint">Loading...</p>
  {/if}
  <div class="row"><button type="button" class="primary" onclick={onopen}>Open Scenes wizard</button></div>
</section>
<PacksPage {goto} />

<style>
  .row { display: flex; gap: 8px; margin-top: 8px; }
  .hint { color: var(--muted-foreground); font-size: 13px; }
</style>
