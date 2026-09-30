<script lang="ts">
  // The ElevenLabs voice for new videos, picked from the account's own list
  // (the user's clones first), with a sample to listen to. An old value typed
  // by hand (a name instead of an id) is matched by name when the list loads.
  import { convertFileSrc } from "@tauri-apps/api/core";
  import { runner, errorText } from "./api";

  type Voice = { id: string; name: string; own?: boolean; accent: string | null; gender: string | null; previewUrl: string | null };
  // no fallback on the bindable: a config without a voice yet is undefined,
  // and a fallback there makes Svelte refuse the binding (props_invalid_value)
  let { voice = $bindable(), keySet, language = "en" }: { voice?: string | null; keySet: boolean; language?: string } = $props();

  let voices = $state<Voice[]>([]);
  let error = $state("");
  let loading = $state(false);
  let sample = $state<string | null>(null);

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

  async function play() {
    const v = voices.find((x) => x.id === voice);
    if (!v) return;
    error = "";
    try {
      const r = v.previewUrl ? await runner<{ file: string }>("voice-preview", { url: v.previewUrl }) : await runner<{ file: string }>("voice-sample", { narrator: { provider: "elevenlabs", voice: v.id }, language });
      sample = convertFileSrc(r.file);
    } catch (e) {
      error = errorText(e);
    }
  }
  const label = (v: Voice) => `${v.name}${v.accent ? `, ${v.accent}` : ""}${v.gender ? `, ${v.gender}` : ""}`;
</script>

<div class="field">
  <label for="evoice">ElevenLabs voice</label>
  {#if !keySet}
    <p class="hint">Save your ElevenLabs key above, then your voices appear here.</p>
  {:else if loading}
    <p class="hint">Loading your voices...</p>
  {:else}
    <div class="row">
      <select id="evoice" value={voice ?? ""} onchange={(e) => (voice = (e.currentTarget as HTMLSelectElement).value)}>
        {#if voices.some((v) => v.own)}
          <optgroup label="Your voices">{#each voices.filter((v) => v.own) as v}<option value={v.id}>{label(v)}</option>{/each}</optgroup>
        {/if}
        <optgroup label="ElevenLabs voices">{#each voices.filter((v) => !v.own) as v}<option value={v.id}>{label(v)}</option>{/each}</optgroup>
      </select>
      <button type="button" onclick={play} disabled={!voice}>Play sample</button>
    </div>
    {#if sample}<audio controls autoplay src={sample}></audio>{/if}
    <p class="hint">Used for new videos. You can still change it per video at 2. Voice and music.</p>
  {/if}
  {#if error}<p class="bad">{error}</p>{/if}
</div>

<style>
  .field { display: grid; gap: 6px; margin-bottom: 14px; }
  .row { display: flex; gap: 8px; }
  .row select { flex: 1; }
  audio { width: 100%; }
  .hint { color: var(--muted-foreground); font-size: 13px; margin: 0; }
  .bad { color: var(--danger-text); font-size: 13px; margin: 0; }
</style>
