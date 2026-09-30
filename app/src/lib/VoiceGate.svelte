<script lang="ts">
  // Gate 2: Narrator Voice and music, approved as one artifact (AUDIO.md).
  // Pick a voice (with a sample), optionally a music file, make it, listen to
  // the mix and to the narration alone, approve.
  import { convertFileSrc } from "@tauri-apps/api/core";
  import { open } from "@tauri-apps/plugin-dialog";
  import { onDestroy, untrack } from "svelte";
  import ErrorBox from "./ErrorBox.svelte";
  import type { AppState, Gate } from "./api";
  import { runner, onProgress, errorText, importMusic } from "./api";
  import { narratorProvider } from "./catalog";

  let { app, dir, gate, scriptApproved, changed }: { app: AppState; dir: string; gate?: Gate; scriptApproved: boolean; changed: () => Promise<void> } = $props();

  type Voice = { id: string; name: string; gender: string | null; accent: string | null; description: string | null; previewUrl: string | null; languages: string[] };
  type Info = { seconds: number; voLufs: number; finalLufs: number; musicGainDb: number | null; music: string | null; words: number };

  const provider = $derived(narratorProvider(app.config?.narrator.provider));
  const hasKey = $derived(!!app.keys[provider]);

  let voices = $state<Voice[]>([]);
  let voiceId = $state(untrack(() => app.config?.narrator.voice ?? ""));
  let music = $state<string | null>(null);
  let busy = $state(false);
  let step = $state("");
  let error = $state("");
  let info = $state<Info | null>(null);
  let stamp = $state(Date.now()); // reloads the players after a new mix
  let sample = $state<string | null>(null);

  const mixSrc = $derived(convertFileSrc(`${dir}/audio/vo_bgm.mp3`) + `?t=${stamp}`);
  const voSrc = $derived(convertFileSrc(`${dir}/audio/vo.mp3`) + `?t=${stamp}`);
  const made = $derived(gate?.state === "pending" || gate?.state === "approved");

  async function loadVoices() {
    if (!hasKey) return;
    try {
      const r = await runner<{ voices: Voice[] }>("list-voices", { narrator: { provider } });
      voices = r.voices;
      if (!voiceId && voices.length) voiceId = voices[0].id;
    } catch (e) {
      error = errorText(e);
    }
  }
  loadVoices();

  let sampling = $state(false);
  async function playSample() {
    const v = voices.find((x) => x.id === voiceId);
    if (!v) return;
    sampling = true;
    error = "";
    try {
      // ElevenLabs has ready-made previews; Gemini reads one short sentence
      const r = v.previewUrl
        ? await runner<{ file: string }>("voice-preview", { url: v.previewUrl })
        : await runner<{ file: string }>("voice-sample", { narrator: { provider, voice: voiceId }, language: app.config?.channel.contentLanguage ?? "en" });
      sample = convertFileSrc(r.file);
    } catch (e) {
      error = errorText(e);
    } finally {
      sampling = false;
    }
  }

  async function chooseMusic() {
    const file = await open({ multiple: false, filters: [{ name: "Music", extensions: ["mp3", "wav", "m4a", "aac", "ogg", "flac"] }] });
    if (typeof file !== "string") return;
    try {
      music = await importMusic(dir, file);
    } catch (e) {
      error = errorText(e);
    }
  }

  const unlisten = onProgress((p) => {
    if (p.command !== "make-voice") return;
    const s = p.progress;
    step = s.step === "voice" ? `Reading part ${s.block} of ${s.of}${s.sentence ? `, sentence ${s.sentence} of ${s.sentences}` : ""}...` : s.step === "sentences" ? "Timing the sentences..." : s.step === "joining" ? "Joining the parts..." : s.step === "mixing" ? "Mixing with the music, -14 LUFS..." : step;
  });
  onDestroy(() => unlisten.then((f) => f()));

  async function make() {
    busy = true;
    error = "";
    step = "Starting...";
    try {
      const r = await runner<{ info: Info }>("make-voice", { projectDir: dir, narrator: { provider, voice: voiceId }, music });
      info = r.info;
      stamp = Date.now();
      await changed();
    } catch (e) {
      error = errorText(e);
      await changed();
    } finally {
      busy = false;
      step = "";
    }
  }

  async function approve() {
    busy = true;
    try {
      await runner("approve-gate", { projectDir: dir, gate: "voice" });
      await changed();
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }
</script>

<section class="card">
  <div class="head">
    <h2>2. Voice and music</h2>
    {#if gate}<span class="pill {gate.state}">{gate.state}</span>{/if}
  </div>

  {#if !scriptApproved}
    <p class="hint">Approve the script first.</p>
  {:else if !hasKey}
    <p class="hint">
      {provider === "gemini" ? "The free voice uses a Gemini key. Add it in Settings, at Narrator Voice." : "Add your ElevenLabs key in Settings. You pay ElevenLabs directly; the free ElevenLabs plan does not allow commercial use."}
    </p>
  {:else}
    <div class="row">
      <label for="voice">Narrator Voice</label>
      <select id="voice" bind:value={voiceId} disabled={busy}>
        {#each voices as v}
          <option value={v.id}>{v.name}{v.accent ? `, ${v.accent}` : ""}{v.gender ? `, ${v.gender}` : ""}</option>
        {/each}
      </select>
      <button type="button" onclick={playSample} disabled={!voiceId || sampling}>{sampling ? "Loading..." : "Play sample"}</button>
    </div>
    {#if sample}<audio controls autoplay src={sample}></audio>{/if}

    <div class="row">
      <span class="label">Music</span>
      <span class="hint">{music ? music.replace("audio/", "") : "No music"}</span>
      <button type="button" onclick={chooseMusic} disabled={busy}>Use my own file</button>
      {#if music}<button type="button" class="ghost" onclick={() => (music = null)} disabled={busy}>No music</button>{/if}
    </div>
    <p class="hint">More music sources (ElevenLabs Music, HeyGen library, free tracks) come in the next test build.</p>

    <div class="actions">
      <button type="button" class="primary" disabled={busy || !voiceId} onclick={make}>{made ? "Make again" : "Make voice (Recommended)"}</button>
    </div>
    {#if busy && step}<p class="hint">{step}</p>{/if}
    {#if error}<ErrorBox message={error} context={{ step: "voice", provider }} />{:else if gate?.state === "failed" && gate.error}<ErrorBox message={`Last attempt failed: ${gate.error}`} context={{ step: "voice", provider }} />{/if}

    {#if made}
      <div class="players">
        <div><span class="label">With music (this is what you approve)</span><audio controls src={mixSrc}></audio></div>
        <div><span class="label">Narration only</span><audio controls src={voSrc}></audio></div>
      </div>
      {#if info}<p class="hint">{info.seconds} s, {info.words} words, final {info.finalLufs} LUFS{info.musicGainDb !== null ? `, music ${info.musicGainDb} dB` : ""}.</p>{/if}
      <div class="actions">
        <button type="button" class="primary" disabled={busy || gate?.state === "approved"} onclick={approve}>{gate?.state === "approved" ? "Approved" : "Approve voice and music"}</button>
      </div>
    {/if}
  {/if}
</section>

<style>
  .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  h2 { margin: 0; font-size: 17px; }
  .row { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
  .row select { flex: 1; }
  .label { font-weight: 600; font-size: 14px; }
  .players { display: grid; gap: 10px; margin-top: 12px; }
  .players div { display: grid; gap: 4px; }
  audio { width: 100%; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px; }
  .hint { color: var(--muted-foreground); font-size: 13px; }
  .pill { font-size: 12px; padding: 3px 10px; border-radius: 99px; background: var(--muted); color: var(--muted-foreground); }
  .pill.approved { background: var(--success-surface); color: var(--success); }
  .pill.pending { background: var(--primary-surface); color: var(--primary-surface-foreground); }
  .pill.failed { background: var(--danger-surface); color: var(--danger-text); }
</style>
