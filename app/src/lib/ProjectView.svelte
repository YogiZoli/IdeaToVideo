<script lang="ts">
  // One project. Gate 1 (script): Recommended (the AI writes it), Custom (edit
  // by hand, save-script), Approve. Gates 2 to 4 have their own components.
  import { revealItemInDir } from "@tauri-apps/plugin-opener";
  import { ask } from "@tauri-apps/plugin-dialog";
  import { onDestroy, untrack } from "svelte";
  import ErrorBox from "./ErrorBox.svelte";
  import Progress from "./Progress.svelte";
  import VoiceGate from "./VoiceGate.svelte";
  import SceneGate from "./SceneGate.svelte";
  import DictionaryFindings from "./brand/DictionaryFindings.svelte";
  import ReviewGate from "./ReviewGate.svelte";
  import AvatarGate from "./AvatarGate.svelte";
  import type { AppState, Gate } from "./api";
  import { runner, onProgress, errorText } from "./api";
  import { narratorProvider } from "./catalog";
  import { setScreen, log } from "./logger";
  import ProjectBackup from "./ProjectBackup.svelte";

  let { app, dir: dirProp, back }: { app: AppState; dir: string; back: () => void } = $props();
  // The project this view was opened for, fixed: a long job (an avatar, a
  // render) keeps writing to it even if the user opens Settings meanwhile,
  // when the parent's project becomes null.
  const dir = untrack(() => dirProp);

  type Loaded = {
    project: { id: string; title: string; status: string; language: string; autopilot?: boolean; gates: Record<string, Gate> };
    brief: { targetLengthMin?: number } | null;
    scriptMarkdown: string | null;
    latestVideo: { file: string; chapters: string | null; srt: string | null } | null;
    stills: { scene: number; at: number; file: string }[];
    voiceInfo: { seconds: number; voLufs: number; finalLufs: number; musicGainDb: number | null; music: string | null; musicLabel?: string | null; words: number } | null;
  };

  const GATE_LABELS: [string, string][] = [
    ["script", "1. Script"],
    ["voice", "2. Voice and music"],
    ["scenes", "3. Scene table"],
    ["review", "4. Review"],
    ["avatar", "5. Avatar"],
  ];

  let data = $state<Loaded | null>(null);
  let draft = $state("");
  let length = $state(untrack(() => app.config?.defaults?.targetLengthMin ?? 8));
  let busy = $state(false);
  let step = $state("");
  let error = $state("");
  let notice = $state("");

  const script = $derived(data?.project.gates.script);
  const llmContext = $derived({ step: "script", provider: app.config?.llm.provider, model: app.config?.llm.model });
  const dirty = $derived(data?.scriptMarkdown != null && draft !== data.scriptMarkdown);

  // Does not clear `error`: a failed write-script reloads the project, and the
  // message must stay on screen.
  async function load() {
    try {
      data = await runner<Loaded>("load-project", { projectDir: dir });
      draft = data.scriptMarkdown ?? "";
      const name = dir.split(/[\\/]/).pop();
      setScreen(`video/${name}`);
      log("video_state", { video: name, status: data.project.status, gates: Object.fromEntries(Object.entries(data.project.gates).map(([k, g]) => [k, g.state])), autopilot: !!data.project.autopilot, hasVideo: !!data.latestVideo });
      if (data.brief?.targetLengthMin) length = data.brief.targetLengthMin;
    } catch (e) {
      error = errorText(e);
    }
  }
  $effect(() => {
    load();
  });

  const unlisten = onProgress((p) => {
    if (p.command !== "write-script") return;
    const s = p.progress.step;
    step = s === "repairing" ? "Fixing a few style problems..." : "Writing the script...";
  });
  onDestroy(() => {
    unlisten.then((f) => f());
  });

  // Optional (DECISIONS 64): keyword ideas from vidIQ for the title; the chosen
  // keyword goes into the script.
  type Kw = { keyword: string; monthlySearches: number | null; competition: number | null; score: number | null; growthPct: number | null };
  let keywords = $state<Kw[]>([]);
  let keyword = $state("");
  let kwBusy = $state(false);
  const canVidiq = $derived(!!app.keys["vidiq"] && app.config?.research?.vidiq !== false);
  async function keywordIdeas() {
    kwBusy = true;
    error = "";
    try {
      keywords = (await runner<{ keywords: Kw[] }>("keyword-ideas", { service: "vidiq", keyword: data!.project.title })).keywords;
    } catch (e) {
      error = errorText(e);
    } finally {
      kwBusy = false;
    }
  }

  async function writeRecommended() {
    if (data?.scriptMarkdown && !(await ask("Write a new script? The current one and every later gate will be replaced.", { title: "Write again", kind: "warning" }))) return;
    busy = true;
    error = "";
    notice = "";
    step = "Starting...";
    try {
      const r = await runner<{ words: number }>("write-script", {
        projectDir: dir,
        llm: app.config!.llm,
        input: { topic: data!.project.title, targetLengthMin: length, ...(keyword ? { keyword } : {}) },
        channel: app.config!.channel,
      });
      notice = `Script ready, ${r.words} words.`;
      await load();
    } catch (e) {
      error = errorText(e);
      await load();
    } finally {
      busy = false;
      step = "";
    }
  }

  async function saveCustom() {
    busy = true;
    error = "";
    try {
      await runner("save-script", { projectDir: dir, markdown: draft });
      notice = "Your edits are saved.";
      await load();
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }

  async function approve() {
    busy = true;
    error = "";
    try {
      if (dirty) await runner("save-script", { projectDir: dir, markdown: draft });
      await runner("approve-gate", { projectDir: dir, gate: "script" });
      notice = "Script approved.";
      await load();
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }

  // Autopilot (SPEC 6): every remaining gate in Recommended mode, each approved
  // as soon as it is made, then the render. The same runner commands as the
  // buttons below, one after the other, so each uses its own key. Stops at the
  // first error; that gate shows it.
  let pilot = $state("");
  let pilotCommand = $state("");
  let pilotError = $state("");

  async function autopilot() {
    if (!data) return;
    pilotError = "";
    busy = true;
    const gates = () => data!.project.gates;
    const approved = (g: string) => gates()[g]?.state === "approved";
    if (["script", "voice", "scenes", "review"].every(approved) && data.latestVideo) {
      notice = "Every step is done already. Render again at 4. Review and render if you want a new file.";
      busy = false;
      return;
    }
    const approveGate = async (gate: string) => {
      if (!approved(gate)) await runner("approve-gate", { projectDir: dir, gate });
      await load();
    };
    try {
      if (!approved("script")) {
        if (!data.scriptMarkdown) {
          pilot = "Writing the script";
          pilotCommand = "write-script";
          await runner("write-script", { projectDir: dir, llm: app.config!.llm, input: { topic: data.project.title, targetLengthMin: length }, channel: app.config!.channel });
          await load();
        }
        await approveGate("script");
      }
      if (!approved("voice")) {
        pilot = "Reading the script aloud and mixing";
        pilotCommand = "make-voice";
        const provider = narratorProvider(app.config?.narrator.provider);
        // Settings may hold a voice id or its name; the user's own voices come first
        const want = (app.config?.narrator.voice ?? "").trim();
        const list = (await runner<{ voices: { id: string; name: string }[] }>("list-voices", { narrator: { provider } })).voices;
        const voice =
          list.find((v) => v.id === want)?.id ??
          (want ? (list.find((v) => v.name.toLowerCase() === want.toLowerCase()) ?? list.find((v) => v.name.toLowerCase().includes(want.toLowerCase())))?.id : undefined) ??
          list[0]?.id ??
          null;
        if (!voice) throw new Error("No narrator voice is available. Pick one at 2. Voice and music.");
        await runner("make-voice", { projectDir: dir, narrator: { provider, voice }, music: null });
        // music (DECISIONS 62): ElevenLabs Music with a key, else none
        if (app.keys["elevenlabs"]) {
          pilot = "Adding the background music";
          pilotCommand = "make-music";
          await runner("make-music", { projectDir: dir, music: { provider: "elevenlabs" } });
        }
        await approveGate("voice");
      }
      if (!approved("scenes")) {
        pilot = "Planning the scenes";
        pilotCommand = "make-scenes";
        await runner("make-scenes", { projectDir: dir, llm: app.config!.llm, look: app.config?.brand?.preset ?? "blue-professional" });
        await approveGate("scenes");
      }
      if (!approved("review")) {
        pilot = "Building and checking the video";
        pilotCommand = "build-video";
        await runner("build-video", { projectDir: dir, look: app.config?.brand?.preset ?? "blue-professional" });
        await approveGate("review");
      }
      pilot = "Rendering the video";
      pilotCommand = "render-video";
      await runner("render-video", { projectDir: dir, quality: "standard" });
      await load();
      notice = "Autopilot finished: your video is at 4. Review and render.";
    } catch (e) {
      pilotError = `Autopilot stopped: ${errorText(e)}`;
      await load();
    } finally {
      busy = false;
      pilot = "";
    }
  }

  const stateLabel = (g?: Gate) =>
    ({ todo: "Not started", running: "Running", pending: "Waiting for your approval", approved: "Approved", skipped: "Skipped", failed: "Failed" })[g?.state ?? "todo"] ?? g?.state;
</script>

<div class="page">
  <header>
    <button type="button" class="ghost" onclick={back}>Back to the list</button>
    <span class="spacer"></span>
    <button type="button" onclick={() => revealItemInDir(dir + "/project.json")}>Open folder</button>
  </header>

  {#if !data}
    {#if error}<ErrorBox message={error} context={{ step: "load-project" }} />{:else}<p class="hint">Loading...</p>{/if}
  {:else}
    <h1>{data.project.title}</h1>
    <div class="status">
      <p class="hint">Status: <strong>{data.project.status}</strong>. Language: {data.project.language}.{data.project.autopilot ? " Autopilot on." : ""}</p>
      <span class="spacer"></span>
      <button type="button" disabled={busy} onclick={autopilot} title="Every remaining step with the recommended settings, then the render">Finish on Autopilot</button>
    </div>
    {#if pilot}{#key pilotCommand}<Progress command={pilotCommand} label={`Autopilot: ${pilot}`} provider={app.config?.narrator.provider} />{/key}{/if}
    {#if pilotError}<ErrorBox message={pilotError} context={{ step: "autopilot" }} />{/if}

    <ol class="gates">
      {#each GATE_LABELS as [id, label]}
        <li class={data.project.gates[id]?.state ?? "todo"}>
          <span>{label}</span>
          <span class="state">{id === "avatar" && (data.project.gates[id]?.state ?? "todo") === "todo" ? "Optional" : stateLabel(data.project.gates[id])}</span>
        </li>
      {/each}
    </ol>

    <section class="card">
      <div class="head">
        <h2>1. Script</h2>
        <span class="pill {script?.state}">{stateLabel(script)}{script?.mode ? `, ${script.mode}` : ""}</span>
      </div>

      <div class="controls">
        <label for="len">Length</label>
        <input id="len" type="number" min="1" max="30" bind:value={length} disabled={busy} />
        <span class="hint">minutes</span>
        <span class="spacer"></span>
        <button type="button" class="primary" disabled={busy} onclick={writeRecommended}>
          {data.scriptMarkdown ? "Write again (Recommended)" : "Write script (Recommended)"}
        </button>
      </div>

      {#if canVidiq}
        <div class="controls">
          <span class="hint">{keyword ? `Keyword for the script: "${keyword}"` : "Optional: pick a search keyword for the script."}</span>
          <span class="spacer"></span>
          <button type="button" disabled={kwBusy || busy} onclick={keywordIdeas}>{kwBusy ? "Asking vidIQ..." : "Keyword ideas (vidIQ)"}</button>
        </div>
        {#if keywords.length}
          <table class="kw">
            <thead><tr><th>Keyword</th><th>Monthly searches</th><th>Competition</th><th>Score</th><th></th></tr></thead>
            <tbody>
              {#each keywords.slice(0, 12) as k}
                <tr class:on={keyword === k.keyword}>
                  <td>{k.keyword}</td>
                  <td>{k.monthlySearches?.toLocaleString("en-US") ?? ""}</td>
                  <td>{k.competition ?? ""}</td>
                  <td>{k.score ?? ""}</td>
                  <td><button type="button" class="ghost" onclick={() => (keyword = keyword === k.keyword ? "" : k.keyword)}>{keyword === k.keyword ? "Chosen" : "Use"}</button></td>
                </tr>
              {/each}
            </tbody>
          </table>
          <p class="hint">Score: vidIQ's opportunity score (higher is better). Competition: how many videos target it (lower is easier).</p>
        {/if}
      {/if}
      {#if busy && step && !pilot}<Progress command="write-script" label={step} />{/if}
      {#if error}
        <ErrorBox message={error} context={llmContext} />
      {:else if script?.state === "failed" && script.error}
        <ErrorBox message={`Last attempt failed: ${script.error}`} context={llmContext} />
      {/if}
      {#if notice && !error}<p class="good">{notice}</p>{/if}

      {#if data.scriptMarkdown !== null || script?.state === "failed"}
        <label for="script" class="label">Script (you can edit it: Custom)</label>
        <textarea id="script" rows="22" bind:value={draft} disabled={busy} spellcheck="true"></textarea>
        <DictionaryFindings {dir} version={data.scriptMarkdown} only="script" />
        <div class="actions">
          <button type="button" disabled={busy || !dirty} onclick={saveCustom}>Save my edits</button>
          <button type="button" class="primary" disabled={busy || !draft.trim() || script?.state === "approved"} onclick={approve}>
            {script?.state === "approved" ? "Approved" : "Approve script"}
          </button>
        </div>
      {:else}
        <p class="hint">Click Write script. The AI uses your Audience, Brand Voice and landing page from Settings{data.brief ? ", and the Video Brief Card" : ""}.</p>
      {/if}
    </section>

    <VoiceGate {app} {dir} voiceInfo={data.voiceInfo} gate={data.project.gates.voice} scriptApproved={script?.state === "approved"} changed={load} />
    <SceneGate {app} {dir} gate={data.project.gates.scenes} voiceApproved={data.project.gates.voice?.state === "approved"} changed={load} />
    <AvatarGate {app} {dir} gate={data.project.gates.avatar} scenesApproved={data.project.gates.scenes?.state === "approved"} look={app.config?.brand?.preset ?? "blue-professional"} changed={load} />
    <ReviewGate {dir} gate={data.project.gates.review} scenesApproved={data.project.gates.scenes?.state === "approved"} latest={data.latestVideo} stills={data.stills} look={app.config?.brand?.preset ?? "blue-professional"} changed={load} />
    <ProjectBackup {app} {dir} />
  {/if}
</div>

<style>
  .page { padding: 24px; max-width: 900px; margin: 0 auto; display: grid; gap: 14px; }
  header, .status { display: flex; gap: 8px; align-items: center; }
  .status p { margin: 0; }
  .spacer { flex: 1; }
  h1 { margin: 0; }
  h2 { margin: 0; font-size: 17px; }
  .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  .gates { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
  .gates li { background: var(--muted); border-radius: 8px; padding: 8px 10px; display: grid; gap: 2px; font-size: 13px; font-weight: 600; }
  .gates .state { font-weight: 400; color: var(--muted-foreground); }
  .gates li.approved { background: var(--success-surface); }
  .gates li.pending { background: var(--primary-surface); }
  .gates li.failed { background: var(--danger-surface); }
  .pill { font-size: 12px; padding: 3px 10px; border-radius: 99px; background: var(--muted); color: var(--muted-foreground); }
  .pill.approved { background: var(--success-surface); color: var(--success); }
  .pill.pending { background: var(--primary-surface); color: var(--primary-surface-foreground); }
  .pill.failed { background: var(--danger-surface); color: var(--danger-text); }
  .controls { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
  .controls input { width: 70px; }
  .kw { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 6px; }
  .kw th { text-align: left; color: var(--muted-foreground); font-weight: 600; padding: 4px; border-bottom: 1px solid var(--border); }
  .kw td { padding: 4px; border-bottom: 1px solid var(--border); }
  .kw tr.on { background: var(--primary-surface); }
  .label { display: block; font-weight: 600; font-size: 14px; margin: 12px 0 6px; }
  textarea { width: 100%; font-family: var(--font-mono); font-size: 13px; line-height: 1.5; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px; }
  .hint { color: var(--muted-foreground); font-size: 13px; }
  .good { color: var(--success); }
  .bad { color: var(--danger-text); white-space: pre-wrap; }
</style>
