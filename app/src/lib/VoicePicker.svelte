<script lang="ts">
  // The ElevenLabs voice for new videos (Settings), with the same cards as
  // the Voice and music tab (VoiceCards, DECISIONS 85): "My voices" and
  // "Library", a play button on every card. An old value typed by hand (a
  // name instead of an id) is matched by name when the list loads.
  import { runner, errorText } from "./api";
  import VoiceCards, { type Voice } from "./VoiceCards.svelte";

  // no fallback on the bindable: a config without a voice yet is undefined,
  // and a fallback there makes Svelte refuse the binding (props_invalid_value)
  let { voice = $bindable(), keySet, language = "en" }: { voice?: string | null; keySet: boolean; language?: string } = $props();

  let voices = $state<Voice[]>([]);
  let error = $state("");
  let loading = $state(false);

  async function load() {
    loading = true;
    error = "";
    try {
      voices = (await runner<{ voices: Voice[] }>("list-voices", { narrator: { provider: "elevenlabs" } })).voices;
      const want = (voice ?? "").trim().toLowerCase();
      if (!voices.some((v) => v.id === voice)) {
        const byName = want ? (voices.find((v) => v.name.toLowerCase() === want) ?? voices.find((v) => v.name.toLowerCase().includes(want))) : undefined;
        voice = byName?.id ?? voices[0]?.id ?? "";
      }
    } catch (e) {
      error = errorText(e);
    } finally {
      loading = false;
    }
  }
  $effect(() => {
    if (keySet) load();
  });
</script>

<div class="field">
  <span class="label">ElevenLabs voice</span>
  {#if !keySet}
    <p class="hint">Save your ElevenLabs key above, then your voices appear here.</p>
  {:else if loading}
    <p class="hint">Loading your voices...</p>
  {:else}
    <VoiceCards {voices} bind:value={voice} provider="elevenlabs" {language} />
    <p class="hint">Used for new videos. You can still change it per video on the Voice and music tab.</p>
  {/if}
  {#if error}<p class="bad">{error}</p>{/if}
</div>

<style>
  .field { display: grid; gap: 6px; margin-bottom: 14px; }
  .label { font-weight: 600; }
  .hint { color: var(--muted-foreground); font-size: 13px; margin: 0; }
  .bad { color: var(--danger-text); font-size: 13px; margin: 0; }
</style>
