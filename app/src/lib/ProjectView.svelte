<script lang="ts">
  // One ONE Video, as tabs (Zoltan, 2026-10-05, DECISIONS 85): one step on
  // screen at a time, the steps as clickable tabs on top. Each tab says in
  // one word where it stands: Done (green), Now (the next step to do, framed),
  // Next, Optional (the avatar). Every tab can be opened at any time; a tab
  // whose step needs an earlier one says so and links there. Approving a
  // step opens the next tab by itself. A job that runs shows its percent on
  // its tab, so it is visible from every other tab too.
  import { revealItemInDir } from "@tauri-apps/plugin-opener";
  import { untrack } from "svelte";
  import ErrorBox from "./ErrorBox.svelte";
  import ScriptGate from "./ScriptGate.svelte";
  import VoiceGate from "./VoiceGate.svelte";
  import SceneGate from "./SceneGate.svelte";
  import AvatarGate from "./AvatarGate.svelte";
  import PreviewGate from "./PreviewGate.svelte";
  import VideoTab from "./VideoTab.svelte";
  import type { AppState, Gate, CtaSlot } from "./api";
  import { runner, errorText } from "./api";
  import { narratorProvider } from "./catalog";
  import { setScreen, log } from "./logger";
  import { work, running, track, measure, startWork } from "./work.svelte";
  import { TABS, tabStates, firstOpen, nextAfter, type TabId } from "./tabs";
  import { avatarLooks } from "./avatars";
  import { notifyDone } from "./notify";

  let { app, dir: dirProp, back }: { app: AppState; dir: string; back: () => void } = $props();
  // The project this view was opened for, fixed: a long job (an avatar, a
  // render) keeps writing to it even if the user opens Settings meanwhile.
  const dir = untrack(() => dirProp);
  startWork();

  type Video = { file: string; seconds?: number; renderSeconds?: number; chapters: string | null; srt: string | null; chaptersNote?: string | null; publishFile?: string | null; comments?: string | null };
  type Loaded = {
    project: { id: string; title: string; status: string; language: string; autopilot?: boolean; gates: Record<string, Gate> };
    brief: { targetLengthMin?: number } | null;
    scriptMarkdown: string | null;
    calls?: { slot: CtaSlot; keyword: string; temperature: string }[] | null;
    latestVideo: Video | null;
    stills: { scene: number; at: number; file: string }[];
    voiceInfo: { seconds: number; voLufs: number; finalLufs: number; musicGainDb: number | null; music: string | null; musicLabel?: string | null; words: number } | null;
  };

  let data = $state<Loaded | null>(null);
  let error = $state("");
  let active = $state<TabId>("script");
  let body = $state<HTMLDivElement>();
  const hasHeygen = $derived(!!app.keys["heygen"]);
  const look = $derived(app.config?.brand?.preset ?? "blue-professional");

  function show(id: TabId, why = "click") {
    if (active !== id) log("tab", { tab: id, why });
    active = id;
    body?.scrollTo({ top: 0 });
  }

  // Approving a step opens the next tab (Zoltan: "as soon as it is approved,
  // it takes me to the next tab"). Only for a change seen in this view.
  let before: Record<string, string> | null = null;
  async function load() {
    try {
      const next = await runner<Loaded>("load-project", { projectDir: dir });
      const name = dir.split(/[\\/]/).pop();
      const states = Object.fromEntries(Object.entries(next.project.gates).map(([k, g]) => [k, g.state]));
      const first = data === null;
      data = next;
      if (first) {
        setScreen(`video/${name}`);
        log("video_state", { video: name, status: next.project.status, gates: states, autopilot: !!next.project.autopilot, hasVideo: !!next.latestVideo });
        active = firstOpen(next.project.gates, !!next.latestVideo, hasHeygen);
        // the app works ahead, for free (K10 b): the avatar list and its
        // pictures load now, so the Avatar tab opens at once
        if (hasHeygen && next.project.gates.avatar?.state !== "approved") avatarLooks().catch(() => {});
      } else if (before && !pilot) {
        const done = (g: string, s: Record<string, string>) => s[g] === "approved" || (g === "avatar" && s[g] === "skipped");
        for (const t of TABS) {
          if (t.gate && t.id === active && done(t.gate, states) && !done(t.gate, before)) show(nextAfter(t.id, hasHeygen), "approved");
        }
      }
      before = states;
    } catch (e) {
      error = errorText(e);
    }
  }
  load();

  const states = $derived(data ? tabStates(data.project.gates, !!data.latestVideo, hasHeygen) : null);
  // the percent of the job running for a tab, for its label
  function tabJob(cmds: string[]) {
    const c = running(dir, cmds);
    if (!c) return null;
    const t = track(dir, c);
    return t ? measure(t, work.now).percent : 0;
  }

  // Autopilot (SPEC 6): every remaining step in Recommended mode, each
  // approved as soon as it is made, then the render. The same runner
  // commands as the buttons, one after the other; the tab of the step at
  // work is shown, with its own progress bar. Stops at the first error.
  let pilot = $state("");
  let pilotError = $state("");
  async function autopilot() {
    if (!data) return;
    pilotError = "";
    const gates = () => data!.project.gates;
    const approved = (g: string) => gates()[g]?.state === "approved";
    if (["script", "voice", "scenes", "review"].every(approved) && data.latestVideo) {
      pilotError = "Every step is done already. Render again on the Your video tab if you want a new file.";
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
          show("script", "autopilot");
          await runner("write-script", { projectDir: dir, llm: app.config!.llm, input: { topic: data.project.title, targetLengthMin: data.brief?.targetLengthMin ?? app.config?.defaults?.targetLengthMin ?? 8 }, channel: app.config!.channel });
          await load();
        }
        await approveGate("script");
      }
      if (!approved("voice")) {
        pilot = "Reading the script aloud and mixing";
        show("voice", "autopilot");
        const provider = narratorProvider(app.config?.narrator.provider);
        // Settings may hold a voice id or its name; the user's own voices come first
        const want = (app.config?.narrator.voice ?? "").trim();
        const list = (await runner<{ voices: { id: string; name: string }[] }>("list-voices", { narrator: { provider } })).voices;
        const voice =
          list.find((v) => v.id === want)?.id ??
          (want ? (list.find((v) => v.name.toLowerCase() === want.toLowerCase()) ?? list.find((v) => v.name.toLowerCase().includes(want.toLowerCase())))?.id : undefined) ??
          list[0]?.id ??
          null;
        if (!voice) throw new Error("No narrator voice is available. Pick one on the Voice and music tab.");
        await runner("make-voice", { projectDir: dir, narrator: { provider, voice }, music: null });
        // music (DECISIONS 62): ElevenLabs Music with a key, else none
        if (app.keys["elevenlabs"]) {
          pilot = "Adding the background music";
          await runner("make-music", { projectDir: dir, music: { provider: "elevenlabs" } });
        }
        await approveGate("voice");
      }
      if (!approved("scenes")) {
        pilot = "Planning the scenes";
        show("scenes", "autopilot");
        await runner("make-scenes", { projectDir: dir, llm: app.config!.llm, look });
        await approveGate("scenes");
      }
      if (!approved("review")) {
        pilot = "Building the preview";
        show("preview", "autopilot");
        await runner("build-video", { projectDir: dir, look });
        await approveGate("review");
      }
      pilot = "Rendering the video";
      await render("standard");
      if (renderError) throw new Error(renderError);
    } catch (e) {
      pilotError = `Autopilot stopped: ${errorText(e)}`;
      await load();
    } finally {
      pilot = "";
    }
  }
  // The render belongs to the ONE Video, not to a tab: started from the
  // Preview ("Approve and render") or from Your video, it goes on whichever
  // tab is open, and its error waits on Your video.
  let renderError = $state("");
  async function render(quality = "standard") {
    renderError = "";
    show("video", "render");
    try {
      const r = await runner<{ seconds: number }>("render-video", { projectDir: dir, quality });
      notifyDone("Your video is ready", `${data?.project.title ?? ""}: ${Math.round(r.seconds)} s of video.`);
    } catch (e) {
      renderError = errorText(e);
    }
    await load();
  }
  const anyJob = $derived(!!running(dir, TABS.flatMap((t) => t.commands)));
</script>

<div class="page">
  <header>
    <button type="button" class="ghost" onclick={back}>Back to the list</button>
    <h1 title={data?.project.title}>{data?.project.title ?? ""}</h1>
    {#if data}
      <button type="button" disabled={!!pilot || anyJob} onclick={autopilot} title="Every remaining step with the recommended settings, then the render. Never adds an avatar.">{pilot ? `Autopilot: ${pilot}...` : "Finish on Autopilot"}</button>
      <button type="button" class="ghost" onclick={() => revealItemInDir(dir + "/project.json")}>Open folder</button>
    {/if}
  </header>

  {#if !data}
    <div class="body">{#if error}<ErrorBox message={error} context={{ step: "load-project" }} />{:else}<p class="hint">Loading...</p>{/if}</div>
  {:else}
    <nav class="tabs" aria-label="Steps">
      {#each TABS as t (t.id)}
        {@const st = states?.[t.id] ?? "next"}
        {@const pct = tabJob(t.commands)}
        <button type="button" class="tab {st}" class:open={active === t.id} aria-current={active === t.id ? "step" : undefined} onclick={() => show(t.id)}>
          <span class="name">{t.n}. {t.label}</span>
          <span class="word">{pct !== null ? `Running ${pct}%` : { done: "Done", now: "Now", next: "Next", optional: "Optional", failed: "Failed" }[st]}</span>
          {#if pct !== null}<span class="bar" style="width: {pct}%"></span>{/if}
        </button>
      {/each}
    </nav>
    {#if pilotError}<ErrorBox message={pilotError} context={{ step: "autopilot" }} />{/if}

    <div class="body" bind:this={body}>
      {#if active === "script"}
        <ScriptGate {app} {dir} title={data.project.title} gate={data.project.gates.script} markdown={data.scriptMarkdown} briefLength={data.brief?.targetLengthMin} hasBrief={!!data.brief} calls={data.calls ?? null} changed={load} />
      {:else if active === "voice"}
        <VoiceGate {app} {dir} voiceInfo={data.voiceInfo} gate={data.project.gates.voice} scriptApproved={data.project.gates.script?.state === "approved"} changed={load} goto={show} />
      {:else if active === "scenes"}
        <SceneGate {app} {dir} gate={data.project.gates.scenes} voiceApproved={data.project.gates.voice?.state === "approved"} changed={load} goto={show} next={nextAfter("scenes", hasHeygen)} />
      {:else if active === "avatar"}
        <AvatarGate {app} {dir} gate={data.project.gates.avatar} scenesApproved={data.project.gates.scenes?.state === "approved"} {look} changed={load} goto={show} />
      {:else if active === "preview"}
        <PreviewGate {app} {dir} gates={data.project.gates} stills={data.stills} {look} changed={load} goto={show} render={() => render("standard")} />
      {:else}
        <VideoTab {app} {dir} reviewApproved={data.project.gates.review?.state === "approved"} latest={data.latestVideo} title={data.project.title} {renderError} {render} goto={show} />
      {/if}
    </div>
  {/if}
</div>

<style>
  .page { height: 100%; display: grid; grid-template-rows: auto auto auto 1fr; max-width: 1100px; margin: 0 auto; padding: 10px 20px 0; gap: 8px; }
  header { display: flex; gap: 8px; align-items: center; min-width: 0; }
  h1 { flex: 1; margin: 0; font-size: 20px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .tabs { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 6px; }
  .tab { position: relative; overflow: hidden; display: grid; gap: 1px; justify-items: start; text-align: left; min-height: 0; padding: 7px 10px; border-radius: 10px; border: 2px solid transparent; background: var(--muted); font-size: 13px; }
  .tab .name { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
  .tab .word { font-weight: 400; font-size: 12px; color: var(--muted-foreground); }
  .tab.done { background: var(--success-surface); }
  .tab.done .word { color: var(--success); font-weight: 600; }
  .tab.now { border-color: var(--primary); background: var(--surface); }
  .tab.now .word { color: var(--primary); font-weight: 600; }
  .tab.optional { opacity: 0.7; }
  .tab.failed { background: var(--danger-surface); }
  .tab.failed .word { color: var(--danger-text); font-weight: 600; }
  /* the tab on screen: raised, joined to the page under it */
  .tab.open { box-shadow: 0 3px 0 0 var(--foreground); opacity: 1; }
  .bar { position: absolute; left: 0; bottom: 0; height: 3px; background: var(--primary); transition: width 0.5s linear; }
  .body { min-height: 0; overflow: auto; padding: 4px 2px 20px; scroll-padding-bottom: 90px; }
  .hint { color: var(--muted-foreground); font-size: 13px; }
  @media (max-width: 980px) {
    .tab { padding: 6px 8px; font-size: 12px; }
  }
</style>
