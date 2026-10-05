<script lang="ts" module>
  export type Voice = { id: string; name: string; own?: boolean; gender: string | null; accent: string | null; description?: string | null; previewUrl: string | null; languages?: string[] };
</script>

<script lang="ts">
  // The voice picker (Zoltan, 2026-10-05: no list several screens long, one
  // decision at a time, like HeyGen's own pickers). Two tabs, "My voices"
  // (the account's own and cloned voices) and "Library", a search, and one
  // card per voice with a play button, in a box of fixed height that scrolls
  // by itself. The chosen voice is said under the box.
  import { convertFileSrc } from "@tauri-apps/api/core";
  import { untrack } from "svelte";
  import { runner, errorText } from "./api";

  let {
    voices,
    value = $bindable(),
    provider,
    language = "en",
    disabled = false,
  }: { voices: Voice[]; value?: string | null; provider: string; language?: string; disabled?: boolean } = $props();

  const hasOwn = $derived(voices.some((v) => v.own));
  let tab = $state<"own" | "library">(untrack(() => (voices.find((v) => v.id === value)?.own === false || !voices.some((v) => v.own) ? "library" : "own")));
  let q = $state("");
  const shown = $derived(
    voices
      .filter((v) => (hasOwn ? (tab === "own" ? !!v.own : !v.own) : true))
      .filter((v) => !q.trim() || `${v.name} ${v.accent ?? ""} ${v.gender ?? ""} ${v.description ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())),
  );
  const chosen = $derived(voices.find((v) => v.id === value) ?? null);

  let playing = $state<string | null>(null);
  let loading = $state<string | null>(null);
  let error = $state("");
  let audio = $state<HTMLAudioElement>();
  async function play(v: Voice) {
    if (playing === v.id) {
      audio?.pause();
      playing = null;
      return;
    }
    loading = v.id;
    error = "";
    try {
      // ElevenLabs has ready-made previews; Gemini reads one short sentence
      const r = v.previewUrl
        ? await runner<{ file: string }>("voice-preview", { url: v.previewUrl })
        : await runner<{ file: string }>("voice-sample", { narrator: { provider, voice: v.id }, language });
      if (audio) {
        audio.src = convertFileSrc(r.file);
        await audio.play();
        playing = v.id;
      }
    } catch (e) {
      error = errorText(e);
    } finally {
      loading = null;
    }
  }
  const detail = (v: Voice) => [v.gender, v.accent].filter(Boolean).join(", ");
</script>

<div class="picker">
  <div class="top">
    {#if hasOwn}
      <div class="seg" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "own"} class:on={tab === "own"} onclick={() => (tab = "own")}>My voices</button>
        <button type="button" role="tab" aria-selected={tab === "library"} class:on={tab === "library"} onclick={() => (tab = "library")}>Library</button>
      </div>
    {/if}
    <input type="search" placeholder="Search voices" bind:value={q} aria-label="Search voices" />
  </div>
  <div class="box">
    {#each shown as v (v.id)}
      <div class="card" class:sel={v.id === value}>
        <button type="button" class="pick" {disabled} onclick={() => (value = v.id)} aria-pressed={v.id === value}>
          <span class="n">{v.name}</span>
          <span class="d">{detail(v) || (v.own ? "Your voice" : "")}</span>
        </button>
        <button type="button" class="play" onclick={() => play(v)} aria-label={`Listen to ${v.name}`}>{loading === v.id ? "..." : playing === v.id ? "Stop" : "Play"}</button>
      </div>
    {:else}
      <p class="hint">No voice matches.</p>
    {/each}
  </div>
  <p class="hint">Chosen: <b>{chosen ? `${chosen.name}${detail(chosen) ? `, ${detail(chosen)}` : ""}` : "none yet"}</b></p>
  {#if error}<p class="bad">{error}</p>{/if}
  <!-- svelte-ignore a11y_media_has_caption -->
  <audio bind:this={audio} onended={() => (playing = null)} hidden></audio>
</div>

<style>
  .picker { display: grid; gap: 8px; }
  .top { display: flex; gap: 8px; align-items: center; }
  .top input { flex: 1; min-height: 38px; padding: 6px 12px; }
  .seg { display: inline-flex; border: 1px solid var(--border); border-radius: 10px; padding: 2px; }
  .seg button { min-height: 34px; border: none; background: none; padding: 4px 12px; font-size: 13px; }
  .seg button.on { background: var(--primary-surface); color: var(--primary-surface-foreground); }
  .box { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 8px; max-height: 220px; overflow: auto; padding: 2px; align-content: start; }
  .card { display: flex; align-items: stretch; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); overflow: hidden; }
  .card.sel { border: 2px solid var(--primary); background: var(--primary-surface); }
  .pick { flex: 1; min-width: 0; display: grid; justify-items: start; gap: 0; border: none; background: none; padding: 8px 10px; min-height: 0; text-align: left; }
  .pick .n { font-weight: 600; font-size: 14px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pick .d { font-weight: 400; font-size: 12px; color: var(--muted-foreground); }
  .play { min-height: 0; border: none; border-left: 1px solid var(--border); border-radius: 0; padding: 0 12px; font-size: 12px; background: none; }
  .hint { color: var(--muted-foreground); font-size: 13px; margin: 0; }
  .bad { color: var(--danger-text); font-size: 13px; margin: 0; }
</style>
