<script lang="ts">
  // The channel's one recipe (runner/channels/recipe.mjs): engine, style, voice,
  // avatar, music, length. Asked once per channel; after Lock every video of
  // the channel is made with it and nothing here is asked again.
  import { convertFileSrc } from "@tauri-apps/api/core";
  import { untrack } from "svelte";
  import ErrorBox from "../ErrorBox.svelte";
  import type { AppState } from "../api";
  import { runner, errorText } from "../api";
  import { avatarLooks } from "../avatars";
  import PaidClips from "./PaidClips.svelte";
  import type { ChannelState, Recipe } from "./channels";

  let { app, state: st, done, cancel }: { app: AppState; state: ChannelState; done: (r: Recipe) => void; cancel?: () => void } = $props();

  // the editor works on a copy until Lock
  let r = $state<Recipe>(untrack(() => ({ broll: { on: false }, ...JSON.parse(JSON.stringify(st.recipe)) })));
  let busy = $state(false);
  let error = $state("");
  const language = $derived(app.config?.channel.contentLanguage ?? "en");
  const hasEleven = $derived(!!app.keys["elevenlabs"]);
  const hasHeygen = $derived(!!app.keys["heygen"]);
  const preset = $derived(st.presets.find((p) => p.id === r.preset));
  const presetsOfEngine = $derived(st.presets.filter((p) => p.engine === r.engine));

  // ElevenLabs voices of the account, when the channel uses that key
  let elevenVoices = $state<{ id: string; name: string }[]>([]);
  $effect(() => {
    if (r.voice.provider !== "elevenlabs" || !hasEleven || elevenVoices.length) return;
    runner<{ voices: { id: string; name: string }[] }>("list-voices", { narrator: { provider: "elevenlabs" } })
      .then((v) => (elevenVoices = v.voices))
      .catch((e) => (error = errorText(e)));
  });

  // Avatar looks, when the avatar is on
  let looks = $state<{ id: string; name: string }[]>([]);
  $effect(() => {
    if (!r.avatar.on || !hasHeygen || looks.length) return;
    avatarLooks()
      .then(({ own }) => (looks = own.flatMap((g) => g.looks.map((l) => ({ id: l.id, name: `${g.name}: ${l.name}` })))))
      .catch((e) => (error = errorText(e)));
  });

  // Engine and style belong together: a preset is one engine's.
  // The other direction's choices are kept, so switching back finds them.
  function chooseEngine(e: "script" | "recorded") {
    if (r.engine === e) return;
    const directions = { ...(r.directions ?? {}) };
    if (r.engine === "script") directions.script = { preset: r.preset, voice: r.voice, avatar: r.avatar, targetLengthMin: r.targetLengthMin };
    else directions.recorded = { preset: r.preset, recorded: r.recorded ?? { cutout: false, smoothCursor: true } };
    r.directions = directions;
    r.engine = e;
    if (e === "recorded") {
      r.preset = directions.recorded?.preset ?? st.presets.find((p) => p.engine === e)?.id ?? r.preset;
      r.recorded = directions.recorded?.recorded ?? { cutout: false, smoothCursor: true };
    } else {
      const side = directions.script;
      r.preset = side?.preset ?? st.presets.find((p) => p.engine === e)?.id ?? r.preset;
      r.voice = side?.voice ?? { provider: "kokoro", voice: st.freeVoices[0]?.id ?? "am_michael" };
      if (side) {
        r.avatar = side.avatar;
        r.targetLengthMin = side.targetLengthMin;
      }
    }
    sheet = "";
  }
  r.start ??= { text: "notes", research: false };

  // A style can say what suits it (its own pictures need no B-roll); the switch stays yours.
  function chooseStyle() {
    sheet = "";
    const wants = st.presets.find((p) => p.id === r.preset)?.defaults;
    if (wants?.broll !== undefined && r.broll) r.broll.on = wants.broll;
    if (wants?.research !== undefined) r.start = { text: "notes", ...r.start, research: wants.research };
    if (wants?.mood && r.music) r.music.mood = wants.mood;
  }

  function chooseKind(k: "kokoro" | "elevenlabs") {
    r.voice = k === "kokoro" ? { provider: "kokoro", voice: st.freeVoices[0]?.id ?? "am_michael" } : { provider: "elevenlabs", voice: "" };
    sample = "";
  }

  // a sample of the free voice (its model comes down the first time)
  let sample = $state("");
  let sampling = $state(false);
  async function hear() {
    sampling = true;
    error = "";
    try {
      const f = await runner<{ file: string }>("voice-sample", { narrator: { provider: "kokoro", voice: r.voice.voice }, language: "en" });
      sample = convertFileSrc(f.file);
    } catch (e) {
      error = errorText(e);
    } finally {
      sampling = false;
    }
  }

  // the style sheet PNG, made by code from the preset's tokens
  let sheet = $state("");
  let sheeting = $state(false);
  async function showSheet() {
    sheeting = true;
    error = "";
    try {
      const f = await runner<{ file: string }>("preset-stylesheet", { preset: r.preset });
      sheet = `${convertFileSrc(f.file)}?t=${Date.now()}`;
    } catch (e) {
      error = errorText(e);
    } finally {
      sheeting = false;
    }
  }

  async function lock() {
    busy = true;
    error = "";
    try {
      const name = r.voice.provider === "elevenlabs" ? elevenVoices.find((v) => v.id === r.voice.voice)?.name : undefined;
      const look = looks.find((l) => l.id === r.avatar.lookId)?.name;
      const saved = await runner<{ recipe: Recipe }>("recipe-save", { language, recipe: { ...r, voice: { ...r.voice, ...(name ? { name } : {}) }, avatar: { ...r.avatar, ...(look ? { name: look } : {}) } } });
      done(saved.recipe);
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }
</script>

<section class="card editor">
  <h2>{st.saved ? "Change this channel's recipe" : `Set the recipe of ${app.identity?.name}`}</h2>
  <p class="hint">Asked once. After this, every video of the channel is made the same way.</p>

  <div class="row">
    <span class="label">Direction</span>
    <div class="opts">
      <label><input type="radio" name="engine" checked={r.engine === "script"} onchange={() => chooseEngine("script")} /> Script to video: topic, notes or script in, video out</label>
      <label><input type="radio" name="engine" checked={r.engine === "recorded"} onchange={() => chooseEngine("recorded")} /> Edit a recording: your recording in, edited video out</label>
      <p class="hint">What the start screen begins with. Each video can take the other one. Its choices below are kept separately.</p>
    </div>
  </div>

  <div class="row">
    <label class="label" for="rpreset">Style</label>
    <div>
      <select id="rpreset" bind:value={r.preset} onchange={chooseStyle}>
        {#each presetsOfEngine as p (p.id)}<option value={p.id}>{p.label}</option>{/each}
      </select>
      {#if preset}<p class="hint">{preset.description}{r.engine === "script" ? ` ${preset.templates.length} scene templates.` : ""}</p>{/if}
      <button type="button" disabled={sheeting} onclick={showSheet}>{sheeting ? "Drawing the style sheet..." : "Show the style sheet"}</button>
      {#if sheet}<img class="sheet" src={sheet} alt="The style sheet of this preset" />{/if}
    </div>
  </div>

  {#if r.engine === "script"}
  <div class="row">
    <span class="label">Voice</span>
    <div>
      <div class="opts">
        <label><input type="radio" name="vkind" checked={r.voice.provider === "kokoro"} onchange={() => chooseKind("kokoro")} /> {st.voiceKinds.kokoro}</label>
        <label class:off={!hasEleven}><input type="radio" name="vkind" checked={r.voice.provider === "elevenlabs"} disabled={!hasEleven} onchange={() => chooseKind("elevenlabs")} /> {st.voiceKinds.elevenlabs}{hasEleven ? "" : " (add the key in Settings, Connections)"}</label>
      </div>
      {#if r.voice.provider === "kokoro"}
        <div class="inline">
          <select aria-label="Free voice" bind:value={r.voice.voice} onchange={() => (sample = "")}>
            {#each st.freeVoices as v (v.id)}<option value={v.id}>{v.name}{v.gender ? ` (${v.gender})` : ""}</option>{/each}
          </select>
          <button type="button" disabled={sampling} onclick={hear}>{sampling ? "Reading a sample..." : "Hear it"}</button>
        </div>
        {#if sample}<audio controls src={sample}></audio>{/if}
        <p class="hint">Reads English. The first time it downloads its model once, about 90 MB.</p>
      {:else}
        <select aria-label="ElevenLabs voice" bind:value={r.voice.voice}>
          <option value="">Choose a voice</option>
          {#if r.voice.voice && !elevenVoices.some((v) => v.id === r.voice.voice)}<option value={r.voice.voice}>{r.voice.name ?? r.voice.voice}</option>{/if}
          {#each elevenVoices as v (v.id)}<option value={v.id}>{v.name}</option>{/each}
        </select>
      {/if}
    </div>
  </div>

  <div class="row">
    <span class="label">Avatar</span>
    <div>
      <label><input type="checkbox" bind:checked={r.avatar.on} disabled={!hasHeygen} /> On{hasHeygen ? "" : " (add the HeyGen key in Settings, Connections)"}</label>
      {#if r.avatar.on}
        <select aria-label="Avatar look" bind:value={r.avatar.lookId}>
          <option value={null}>Choose a look</option>
          {#if r.avatar.lookId && !looks.some((l) => l.id === r.avatar.lookId)}<option value={r.avatar.lookId}>{r.avatar.name ?? "The look this channel uses"}</option>{/if}
          {#each looks as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
        </select>
        <p class="hint">HeyGen Avatar III, transparent, laid over the video as it comes: never cut, resized or moved. Uses your HeyGen credits; the price is asked first.</p>
      {/if}
    </div>
  </div>
  {/if}

  {#if preset?.recorded?.cutout}
    <div class="row">
      <span class="label">Person cut-out</span>
      <div>
        <label><input type="checkbox" checked={r.recorded?.cutout === true} onchange={(e) => (r.recorded = { smoothCursor: true, ...r.recorded, cutout: e.currentTarget.checked })} /> A big word sits behind your head</label>
        <p class="hint">A small Apache licensed model finds you in the picture, on this computer. It downloads once, about 26 MB, and takes a few seconds per big word.</p>
      </div>
    </div>
  {/if}

  {#if preset?.recorded?.zoom}
    <div class="row">
      <span class="label">Cursor</span>
      <div>
        <label><input type="checkbox" checked={r.recorded?.smoothCursor !== false} onchange={(e) => (r.recorded = { cutout: false, ...r.recorded, smoothCursor: e.currentTarget.checked })} /> Smooth cursor: the filmed one is painted out and drawn again</label>
      </div>
    </div>
  {/if}

  <div class="row">
    <span class="label">Music</span>
    <div>
      <label><input type="checkbox" bind:checked={r.music.on} /> On</label>
      {#if r.music.on}
        <div class="opts">
          <label><input type="radio" name="msrc" checked={r.music.source === "synth"} onchange={() => (r.music.source = "synth")} /> {st.musicSources.synth}</label>
          <label><input type="radio" name="msrc" checked={r.music.source === "own"} onchange={() => (r.music.source = "own")} /> {st.musicSources.own}</label>
        </div>
        {#if r.music.source === "synth"}
          <select aria-label="Mood" bind:value={r.music.mood}>
            {#each st.moods as m (m)}<option value={m}>{m}</option>{/each}
          </select>
        {:else}
          <p class="hint">{st.ownMusic.length ? `${st.ownMusic.length} files in this channel's music folder.` : "No files yet."} The folder appears when you lock the recipe: {st.musicDir}</p>
        {/if}
      {/if}
    </div>
  </div>

  {#if r.engine === "script" || preset?.recorded?.broll}
  <div class="row">
    <span class="label">B-roll</span>
    <div>
      <label><input type="checkbox" bind:checked={r.broll!.on} /> On: moving footage under the sentences that name something you can see</label>
      <p class="hint">Free sources first, in this order: public domain film, a free still moved in 2.5D on this computer, Pixabay. The Preview tab shows every clip with its license.</p>
      {#if r.broll?.on}<PaidClips {app} />{/if}
    </div>
  </div>
  {/if}

  {#if r.engine === "script"}
  <div class="row">
    <label class="label" for="rlen">Length</label>
    <div class="inline"><input id="rlen" type="number" min="1" max="30" bind:value={r.targetLengthMin} /> minutes</div>
  </div>
  {/if}

  <div class="row">
    <span class="label">Start</span>
    <div>
      <div class="opts">
        <label><input type="radio" name="stext" checked={r.start?.text !== "finished"} onchange={() => (r.start = { research: false, ...r.start, text: "notes" })} /> A pasted text is notes: turn it into a script</label>
        <label><input type="radio" name="stext" checked={r.start?.text === "finished"} onchange={() => (r.start = { research: false, ...r.start, text: "finished" })} /> A pasted text is a finished script: use it as it is</label>
      </div>
      <label><input type="checkbox" checked={r.start?.research === true || !!preset?.factChecked} disabled={!!preset?.factChecked} onchange={(e) => (r.start = { text: "notes", ...r.start, research: e.currentTarget.checked })} /> Research on{preset?.factChecked ? ", always: this style's scripts are fact-checked" : ""}</label>
      <p class="hint">What the start screen begins with. You can change both for one video there.</p>
    </div>
  </div>

  {#if error}<ErrorBox message={error} context={{ step: "recipe" }} />{/if}
  <div class="actions">
    {#if cancel}<button type="button" class="ghost" onclick={cancel}>Cancel</button>{/if}
    <button type="button" class="primary" disabled={busy} onclick={lock}>{busy ? "Saving..." : "Lock this recipe"}</button>
  </div>
</section>

<style>
  .editor { display: grid; gap: 14px; }
  h2 { margin: 0; font-size: 18px; }
  .row { display: grid; grid-template-columns: 90px minmax(0, 1fr); gap: 12px; align-items: start; padding-top: 12px; border-top: 1px solid var(--border); }
  .label { font-weight: 600; font-size: 14px; }
  .opts { display: grid; gap: 6px; margin-bottom: 8px; }
  .opts label, .row > div > label { font-size: 14px; display: flex; gap: 8px; align-items: center; }
  .off { color: var(--muted-foreground); }
  .inline { display: flex; gap: 8px; align-items: center; }
  input[type="number"] { width: 80px; }
  select { max-width: 420px; }
  audio { display: block; margin-top: 8px; width: 100%; max-width: 420px; }
  .sheet { display: block; margin-top: 10px; width: 100%; max-width: 640px; border: 1px solid var(--border); border-radius: 8px; }
  .hint { margin: 6px 0; font-size: 13px; color: var(--muted-foreground); }
  .actions { display: flex; justify-content: flex-end; gap: 8px; }
</style>
