<script lang="ts">
  // Gate 2: Narrator Voice and music, approved as one artifact. Pick a voice
  // (with a sample) and a music source, make the voice, listen to the mix and
  // to the narration alone, approve. Music (DECISIONS 62): ElevenLabs Music
  // when the user has an ElevenLabs key (same service as the voice, made to
  // the video's length); without a key no music, or the user's own file.
  // Changing the music later mixes the same narration again; nothing is read
  // twice.
  import { convertFileSrc } from "@tauri-apps/api/core";
  import { open } from "@tauri-apps/plugin-dialog";
  import { onDestroy, untrack } from "svelte";
  import ErrorBox from "./ErrorBox.svelte";
  import Progress from "./Progress.svelte";
  import type { AppState, Gate } from "./api";
  import { runner, onProgress, errorText, importMusic } from "./api";
  import { narratorProvider } from "./catalog";

  type Info = { seconds: number; voLufs: number; finalLufs: number; musicGainDb: number | null; music: string | null; musicLabel?: string | null; words: number };
  type Voice = { id: string; name: string; own?: boolean; gender: string | null; accent: string | null; description: string | null; previewUrl: string | null; languages: string[] };

  let { app, dir, gate, scriptApproved, voiceInfo = null, changed }: { app: AppState; dir: string; gate?: Gate; scriptApproved: boolean; voiceInfo?: Info | null; changed: () => Promise<void> } = $props();

  const provider = $derived(narratorProvider(app.config?.narrator.provider));
  const hasKey = $derived(!!app.keys[provider]);
  const hasEleven = $derived(!!app.keys["elevenlabs"]);

  let voices = $state<Voice[]>([]);
  let voiceId = $state(untrack(() => app.config?.narrator.voice ?? ""));
  let busy = $state(false);
  let step = $state("");
  let error = $state("");
  let madeInfo = $state<Info | null>(null);
  const info = $derived(madeInfo ?? voiceInfo);
  let stamp = $state(Date.now()); // reloads the players after a new mix
  let sample = $state<string | null>(null);

  let kind = $state<"elevenlabs" | "file" | "none">(untrack(() => (app.keys["elevenlabs"] ? "elevenlabs" : "none")));
  let ownFile = $state<string | null>(null);
  let prompt = $state("");
  let usd = $state<number | null>(null);
  let musicCommand = $state("");

  const mixSrc = $derived(convertFileSrc(`${dir}/audio/vo_bgm.mp3`) + `?t=${stamp}`);
  const voSrc = $derived(convertFileSrc(`${dir}/audio/vo.mp3`) + `?t=${stamp}`);
  const made = $derived(gate?.state === "pending" || gate?.state === "approved");

  async function loadVoices() {
    if (!hasKey) return;
    try {
      const r = await runner<{ voices: Voice[] }>("list-voices", { narrator: { provider } });
      voices = r.voices;
      // Settings may hold the voice's name ("Zoltan BD") instead of its id:
      // find it by name, else start with the user's own voice (listed first).
      if (!voices.some((v) => v.id === voiceId)) {
        const want = voiceId.trim().toLowerCase();
        const byName = want ? (voices.find((v) => v.name.toLowerCase() === want) ?? voices.find((v) => v.name.toLowerCase().includes(want))) : undefined;
        voiceId = byName?.id ?? voices[0]?.id ?? "";
      }
    } catch (e) {
      error = errorText(e);
    }
  }
  loadVoices();

  async function loadMusic() {
    try {
      const est = await runner<{ usd: number; prompt: string }>("music-estimate", { seconds: voiceInfo?.seconds ?? 480 });
      if (!prompt) prompt = est.prompt;
      usd = voiceInfo?.seconds ? est.usd : null;
    } catch (e) {
      error = errorText(e);
    }
  }
  loadMusic();

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
      ownFile = await importMusic(dir, file);
      kind = "file";
    } catch (e) {
      error = errorText(e);
    }
  }

  const unlisten = onProgress((p) => {
    const s = p.progress;
    if (p.command === "set-music" || p.command === "make-music") {
      step = s.step === "music" ? "ElevenLabs is making the music..." : s.step === "mixing" ? "Mixing the voice and the music..." : step;
      return;
    }
    if (p.command !== "make-voice") return;
    step = s.step === "voice" ? `Reading part ${s.block} of ${s.of}${s.sentence ? `, sentence ${s.sentence} of ${s.sentences}` : ""}...` : s.step === "sentences" ? "Timing the sentences..." : s.step === "joining" ? "Joining the parts..." : s.step === "mixing" ? "Mixing, -14 LUFS..." : step;
  });
  onDestroy(() => unlisten.then((f) => f()));

  async function make() {
    busy = true;
    error = "";
    step = "Starting...";
    let ok = false;
    try {
      const r = await runner<{ info: Info }>("make-voice", { projectDir: dir, narrator: { provider, voice: voiceId }, music: null });
      madeInfo = r.info;
      stamp = Date.now();
      ok = true;
      await changed();
    } catch (e) {
      error = errorText(e);
      await changed();
    } finally {
      busy = false;
      step = "";
    }
    if (ok && kind !== "none") await applyMusic();
  }

  // Puts the chosen music under the existing narration.
  async function applyMusic() {
    busy = true;
    error = "";
    step = "Starting...";
    musicCommand = kind === "elevenlabs" ? "make-music" : "set-music";
    try {
      const r =
        kind === "elevenlabs"
          ? await runner<{ info: Info }>("make-music", { projectDir: dir, music: { provider: "elevenlabs", prompt } })
          : await runner<{ info: Info }>("set-music", { projectDir: dir, music: kind === "file" ? { kind, path: ownFile } : { kind: "none" } });
      madeInfo = r.info;
      stamp = Date.now();
      await changed();
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
      step = "";
      musicCommand = "";
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
        {#if voices.some((v) => v.own)}
          <optgroup label="Your voices">
            {#each voices.filter((v) => v.own) as v}<option value={v.id}>{v.name}{v.accent ? `, ${v.accent}` : ""}{v.gender ? `, ${v.gender}` : ""}</option>{/each}
          </optgroup>
        {/if}
        <optgroup label={provider === "elevenlabs" ? "ElevenLabs voices" : "Voices"}>
          {#each voices.filter((v) => !v.own) as v}<option value={v.id}>{v.name}{v.accent ? `, ${v.accent}` : ""}{v.gender ? `, ${v.gender}` : ""}</option>{/each}
        </optgroup>
      </select>
      <button type="button" onclick={playSample} disabled={!voiceId || sampling}>{sampling ? "Loading..." : "Play sample"}</button>
    </div>
    {#if sample}<audio controls autoplay src={sample}></audio>{/if}

    <fieldset class="music" disabled={busy}>
      <legend class="label">Background music</legend>
      <label class="choice"><input type="radio" bind:group={kind} value="elevenlabs" disabled={!hasEleven} /> Made for this video by ElevenLabs Music{hasEleven ? (usd !== null ? `, about $${usd.toFixed(2)} on your ElevenLabs plan` : ", paid on your ElevenLabs plan") : " (add your ElevenLabs key in Settings)"}</label>
      {#if kind === "elevenlabs"}
        <textarea rows="2" bind:value={prompt} aria-label="What the music should sound like"></textarea>
        <p class="hint">Describe the mood in English. Instrumental only. Commercial use needs a paid ElevenLabs plan.</p>
      {/if}
      {#if !hasEleven}<p class="hint">Without an ElevenLabs key there is no background music, unless you add your own file.</p>{/if}
      <label class="choice"><input type="radio" bind:group={kind} value="file" disabled={!ownFile} /> My own file{ownFile ? `: ${ownFile.replace("audio/", "")}` : ""}</label>
      <div class="row"><button type="button" onclick={chooseMusic}>Choose a music file</button></div>
      <label class="choice"><input type="radio" bind:group={kind} value="none" /> No music</label>
    </fieldset>

    <div class="actions">
      <button type="button" class="primary" disabled={busy || !voiceId} onclick={make}>{made ? "Make the voice again" : "Make voice (Recommended)"}</button>
    </div>
    {#if busy}{#key musicCommand}<Progress command={musicCommand || "make-voice"} label={step || "Making the voice"} {provider} />{/key}{/if}
    {#if error}<ErrorBox message={error} context={{ step: "voice", provider }} />{:else if gate?.state === "failed" && gate.error}<ErrorBox message={`Last attempt failed: ${gate.error}`} context={{ step: "voice", provider }} />{/if}

    {#if made}
      <div class="players">
        <div><span class="label">With music (this is what you approve)</span><audio controls src={mixSrc}></audio></div>
        <div><span class="label">Narration only</span><audio controls src={voSrc}></audio></div>
      </div>
      {#if info}<p class="hint">{info.seconds} s, {info.words} words, final {info.finalLufs} LUFS. Music: {info.musicLabel ?? (info.music ? info.music : "none")}{info.musicGainDb !== null && info.musicGainDb !== undefined ? `, ${info.musicGainDb} dB` : ""}.</p>{/if}
      <div class="actions">
        <button type="button" disabled={busy} onclick={applyMusic}>Use the selected music</button>
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
  .music { border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; display: grid; gap: 8px; margin: 0 0 10px; }
  .choice { display: flex; gap: 8px; align-items: center; font-size: 14px; }
  .music textarea { width: 100%; font-size: 13px; }
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
