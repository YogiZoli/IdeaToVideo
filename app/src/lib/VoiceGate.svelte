<script lang="ts">
  // Gate 2: Narrator Voice and music, approved as one artifact. Pick a voice
  // (cards with a play button), a music source, make the voice, listen to
  // the mix and to the narration alone, approve. Music (DECISIONS 62):
  // ElevenLabs Music when the user has an ElevenLabs key (same service as the
  // voice, made to the video's length); without a key no music, or the
  // user's own file. Changing the music later mixes the same narration
  // again; nothing is read twice.
  import { convertFileSrc } from "@tauri-apps/api/core";
  import { open, ask } from "@tauri-apps/plugin-dialog";
  import { onDestroy, untrack } from "svelte";
  import ErrorBox from "./ErrorBox.svelte";
  import Advanced from "./Advanced.svelte";
  import Progress from "./Progress.svelte";
  import Needs from "./Needs.svelte";
  import VoiceCards, { type Voice } from "./VoiceCards.svelte";
  import type { AppState, Gate } from "./api";
  import { runner, onProgress, errorText, importMusic } from "./api";
  import { narratorProvider } from "./catalog";
  import { running } from "./work.svelte";
  import type { TabId } from "./tabs";

  type Info = { seconds: number; voLufs: number; finalLufs: number; musicGainDb: number | null; music: string | null; musicLabel?: string | null; words: number; inserts?: { keyword: string; seconds: number }[]; endScreen?: { seconds: number } | null };
  // The length in parts: the narration, the CTA segments, the end screen.
  const parts = (i: Info) => {
    const seg = (i.inserts ?? []).reduce((t, x) => t + x.seconds, 0);
    const end = i.endScreen?.seconds ?? 0;
    const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
    if (!seg && !end) return `${clock(i.seconds)}`;
    return `${clock(i.seconds)} in all: narration ${clock(i.seconds - seg - end)}${seg ? `, your CTA segments ${Math.round(seg)} s` : ""}${end ? `, end screen ${end} s` : ""}`;
  };

  let { app, dir, gate, scriptApproved, voiceInfo = null, changed, goto }: { app: AppState; dir: string; gate?: Gate; scriptApproved: boolean; voiceInfo?: Info | null; changed: () => Promise<void>; goto: (t: TabId) => void } = $props();

  const provider = $derived(narratorProvider(app.config?.narrator.provider));
  const hasKey = $derived(!!app.keys[provider]);
  const hasEleven = $derived(!!app.keys["elevenlabs"]);

  const COMMANDS = ["make-voice", "make-music", "set-music"];
  const job = $derived(running(dir, COMMANDS));
  let busy = $state(false);
  const locked = $derived(busy || !!job);

  let voices = $state<Voice[]>([]);
  let voiceId = $state(untrack(() => app.config?.narrator.voice ?? ""));
  let step = $state("");
  let error = $state("");
  let madeInfo = $state<Info | null>(null);
  const info = $derived(madeInfo ?? voiceInfo);
  let stamp = $state(Date.now()); // reloads the players after a new mix

  let kind = $state<"elevenlabs" | "file" | "none">(untrack(() => (app.keys["elevenlabs"] ? "elevenlabs" : "none")));
  let ownFile = $state<string | null>(null);
  let prompt = $state("");
  let usd = $state<number | null>(null);

  const mixSrc = $derived(convertFileSrc(`${dir}/audio/vo_bgm.mp3`) + `?t=${stamp}`);
  const voSrc = $derived(convertFileSrc(`${dir}/audio/vo.mp3`) + `?t=${stamp}`);
  const made = $derived(gate?.state === "pending" || gate?.state === "approved");
  const approved = $derived(gate?.state === "approved");

  // "Previously used" (per Identity, runner last-used): the voice this brand
  // used last is chosen, and the cards open only on "Choose another".
  let lastVoice = $state<string | null>(null);
  // ElevenLabs model (runner ELEVEN_MODELS): v4 the default since 2026-10-06, v2 older.
  const ELEVEN_MODELS: Record<string, string> = { eleven_v4: "Eleven v4 (recommended)", eleven_multilingual_v2: "Multilingual v2 (older)" };
  let voiceModel = $state("eleven_v4");
  let chooseOther = $state(false);
  const previous = $derived(!!lastVoice && voiceId === lastVoice);

  async function loadVoices() {
    if (!hasKey) return;
    try {
      const r = await runner<{ voices: Voice[] }>("list-voices", { narrator: { provider } });
      voices = r.voices;
      try {
        const used = (await runner<{ used: { voice?: { provider: string; voice: string; model?: string | null } } }>("last-used", {})).used.voice;
        if (used?.provider === provider && used.model && ELEVEN_MODELS[used.model]) voiceModel = used.model;
        if (used?.provider === provider && voices.some((v) => v.id === used.voice)) {
          lastVoice = used.voice;
          voiceId = used.voice;
        }
      } catch {
        // no memory yet: the Settings voice
      }
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

  let result = $state<HTMLElement>();
  const reveal = () => setTimeout(() => result?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);

  async function make() {
    if (made && !(await ask(`Read the whole script again? ${provider === "elevenlabs" ? "This uses ElevenLabs characters from your plan" : "This uses your Gemini key"}, and the scenes and the preview are made again after it.`, { title: "Make the voice again", kind: "warning" }))) return;
    busy = true;
    error = "";
    step = "Starting...";
    let ok = false;
    try {
      const r = await runner<{ info: Info }>("make-voice", { projectDir: dir, narrator: { provider, voice: voiceId, name: voices.find((v) => v.id === voiceId)?.name ?? null, ...(provider === "elevenlabs" ? { model: voiceModel } : {}) }, music: null });
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
    if (ok) reveal();
  }

  // Puts the chosen music under the existing narration.
  async function applyMusic() {
    busy = true;
    error = "";
    step = "Starting...";
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
  const progressLabel = $derived(job === "make-music" ? "Making the music" : job === "set-music" ? "Mixing the music" : "Making the voice");
</script>

<section class="card">
  <h2>2. Voice and music</h2>
  <p class="hint lead">The narrator reads your script, and the music goes under it. You listen to the result, then approve it.</p>

  {#if !scriptApproved}
    <Needs text="The voice reads the approved script. Approve the script first." tab="script" {goto} />
  {:else if !hasKey}
    <p class="hint">
      {provider === "gemini" ? "The free voice uses a Gemini key. Add it on Settings, Connections." : "Add your ElevenLabs key on Settings, Connections. You pay ElevenLabs directly; the free ElevenLabs plan does not allow commercial use."}
    </p>
  {:else}
    <div class="grid">
      <div>
        <span class="label">Narrator Voice</span>
        {#if previous && !chooseOther}
          <div class="row">
            <b>{voices.find((v) => v.id === voiceId)?.name ?? voiceId}</b>
            <span class="pill">previously used</span>
            <button type="button" class="ghost" disabled={locked} onclick={() => (chooseOther = true)}>Choose another</button>
          </div>
        {:else}
          <VoiceCards {voices} bind:value={voiceId} {provider} language={app.config?.channel.contentLanguage ?? "en"} disabled={locked} />
        {/if}
        {#if provider === "elevenlabs"}
          <div class="row">
            <label for="vmodel">Voice model</label>
            <select id="vmodel" bind:value={voiceModel} disabled={locked}>
              {#each Object.entries(ELEVEN_MODELS) as [id, label] (id)}<option value={id}>{label}</option>{/each}
            </select>
          </div>
          {#if voiceModel === "eleven_multilingual_v2"}<p class="hint">The older model. Eleven v4 reads more naturally in every language the app writes in. Your clones work with both.</p>{/if}
        {/if}
      </div>

      <fieldset class="music" disabled={locked}>
        <legend class="label">Background music</legend>
        <label class="choice"><input type="radio" bind:group={kind} value="elevenlabs" disabled={!hasEleven} /> Made for this video by ElevenLabs Music{hasEleven ? (usd !== null ? `, about $${usd.toFixed(2)}` : "") : " (needs an ElevenLabs key)"}</label>
        {#if kind === "elevenlabs"}
          <textarea rows="2" bind:value={prompt} aria-label="What the music should sound like"></textarea>
          <p class="hint">The mood, in English. Commercial use needs a paid ElevenLabs plan.</p>
        {/if}
        <label class="choice"><input type="radio" bind:group={kind} value="file" disabled={!ownFile} /> My own file{ownFile ? `: ${ownFile.replace("audio/", "")}` : ""}</label>
        <div><button type="button" onclick={chooseMusic}>Choose a music file</button></div>
        <label class="choice"><input type="radio" bind:group={kind} value="none" /> No music</label>
      </fieldset>
    </div>

    {#if job}<Progress command={job} project={dir} label={step || progressLabel} {provider} />{/if}
    {#if error}<ErrorBox message={error} context={{ step: "voice", provider }} />{:else if gate?.state === "failed" && gate.error}<ErrorBox message={`Last attempt failed: ${gate.error}`} context={{ step: "voice", provider }} />{/if}

    {#if made}
      <div class="players" bind:this={result}>
        <div><span class="label">With music (this is what you approve)</span><audio controls src={mixSrc}></audio></div>
        <div><span class="label">Narration only</span><audio controls src={voSrc}></audio></div>
      </div>
      {#if info}<p class="hint">{parts(info)}. {info.words} words, final {info.finalLufs} LUFS. Music: {info.musicLabel ?? (info.music ? info.music : "none")}{info.musicGainDb !== null && info.musicGainDb !== undefined ? `, ${info.musicGainDb} dB` : ""}.</p>{/if}
    {/if}

    <div class="actionbar">
      {#if approved}
        <span class="say"><b>Approved.</b> Next: 3. Scenes.</span>
        <Advanced>
          <button type="button" disabled={locked} onclick={make}>Make the voice again</button>
          <button type="button" disabled={locked} onclick={applyMusic}>Use the selected music</button>
        </Advanced>
        <button type="button" class="primary" onclick={() => goto("scenes")}>Go to 3. Scenes</button>
      {:else if made}
        <span class="say">Listen to it. Happy with it? Approve it, and the scenes come next.</span>
        <Advanced>
          <button type="button" disabled={locked} onclick={make}>Make the voice again</button>
          <button type="button" disabled={locked} onclick={applyMusic}>Use the selected music</button>
        </Advanced>
        <button type="button" class="primary" disabled={locked} onclick={approve}>Approve and continue</button>
      {:else}
        <span class="say">Pick a voice and the music, then make the voice. The bar shows how long it takes.</span>
        <button type="button" class="primary" disabled={locked || !voiceId} onclick={make}>Make voice (Recommended)</button>
      {/if}
    </div>
  {/if}
</section>

<style>
  h2 { margin: 0 0 4px; font-size: 17px; }
  .lead { margin: 0 0 12px; }
  .grid { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 16px; align-items: start; }
  @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
  .row { display: flex; gap: 8px; align-items: center; margin: 8px 0; }
  .row select { flex: 1; }
  .label { display: block; font-weight: 600; font-size: 14px; margin-bottom: 6px; }
  .music { border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; display: grid; gap: 8px; margin: 0; }
  .choice { display: flex; gap: 8px; align-items: center; font-size: 14px; }
  .music textarea { width: 100%; font-size: 13px; min-height: 0; height: 56px; padding: 6px 10px; }
  .music { gap: 4px; }
  .music button { min-height: 36px; padding: 4px 12px; font-size: 13px; }
  .players { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; scroll-margin-top: 10px; }
  .players div { display: grid; gap: 4px; }
  audio { width: 100%; }
  .hint { color: var(--muted-foreground); font-size: 13px; margin: 4px 0 0; }
  .pill { font-size: 12px; padding: 3px 10px; border-radius: 99px; background: var(--muted); color: var(--muted-foreground); }
</style>
