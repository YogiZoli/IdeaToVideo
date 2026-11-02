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
  import ThumbnailTab from "./ThumbnailTab.svelte";
  import type { AppState, Gate, CtaSlot } from "./api";
  import { runner, errorText } from "./api";
  import { narratorProvider } from "./catalog";
  import { setScreen, log } from "./logger";
  import { work, running, track, measure, startWork, pilots } from "./work.svelte";
  import { TABS, tabStates, firstOpen, nextAfter, type TabId } from "./tabs";
  import { avatarLooks } from "./avatars";
  import { llmFor, describeLlm } from "./llm";
  import { ask } from "@tauri-apps/plugin-dialog";
  import type { Series } from "./course/course";
  import type { Recipe } from "./channels/channels";
  import { notifyDone } from "./notify";
  import { findBroll } from "./brollRun";

  // saved: new settings from a tab (the AI of a step, StepModel)
  let { app, dir: dirProp, back, saved, connections, openPage }: { app: AppState; dir: string; back: () => void; saved: (s: AppState) => void; connections?: () => void; openPage?: (page: "cta" | "connections" | "voice") => void } = $props();
  // The project this view was opened for, fixed: a long job (an avatar, a
  // render) keeps writing to it even if the user opens Settings meanwhile.
  const dir = untrack(() => dirProp);
  startWork();

  type Video = { file: string; seconds?: number; renderSeconds?: number; chapters: string | null; srt: string | null; chaptersNote?: string | null; cardFile?: string | null; comments?: string | null; syntheticMedia?: boolean };
  type Loaded = {
    project: { id: string; title: string; status: string; language: string; autopilot?: boolean; autopilotRun?: { at?: string }; render?: { state: string; at?: string; error?: string } | null; gates: Record<string, Gate>; series?: Series | null; recipe?: Recipe | null };
    brief: { targetLengthMin?: number } | null;
    scriptMarkdown: string | null;
    calls?: { slot: CtaSlot; keyword: string; temperature: string }[] | null;
    latestVideo: Video | null;
    stills: { scene: number; at: number; file: string }[];
    voiceInfo: { seconds: number; voLufs: number; finalLufs: number; musicGainDb: number | null; music: string | null; musicLabel?: string | null; words: number } | null;
    thumbnailChosen?: boolean;
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
        // a render that failed or was cut off before this view opened
        if (next.project.render?.state === "failed" && !renderError) renderError = next.project.render.error ?? "The last render did not finish.";
        // the app works ahead, for free (K10 b): the avatar list and its
        // pictures load now, so the Avatar tab opens at once
        if (hasHeygen && next.project.gates.avatar?.state !== "approved") avatarLooks().catch(() => {});
        // Autopilot was under way and got cut off (the window reloaded, the
        // app was closed): it goes on by itself, and says so (2026-10-06)
        if (next.project.autopilotRun && !pilots[dir]) resumePilot = true;
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

  const states = $derived(data ? tabStates(data.project.gates, !!data.latestVideo, hasHeygen, !!data.thumbnailChosen) : null);
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
  // project.json keeps a mark while it runs (autopilot-mark), so a run cut
  // off by a reload or a closed app goes on when the ONE Video opens again;
  // the app-wide `pilots` keeps a second one from starting meanwhile.
  const pilot = $derived(pilots[dir] ?? "");
  const setPilot = (label: string) => {
    if (label) pilots[dir] = label;
    else delete pilots[dir];
  };
  let pilotError = $state("");
  let pilotNote = $state("");
  let resumePilot = $state(false);
  // a cut-off Autopilot waits for the step still running, then goes on
  $effect(() => {
    if (resumePilot && data && !anyJob && !pilots[dir]) {
      resumePilot = false;
      if (data.project.recipe) {
        recipeRun();
        return;
      }
      pilotNote = "Autopilot was cut off (the window reloaded or the app was closed), so it goes on from where it stopped. Stop any step to end it.";
      log("autopilot_resumed", {});
      autopilot(true);
    }
  });
  // another view of this ONE Video runs the Autopilot: follow its steps
  $effect(() => {
    if (pilot) untrack(() => load());
  });
  async function autopilot(resumed = false) {
    if (!data || pilots[dir]) return;
    pilotError = "";
    if (!resumed) pilotNote = "";
    const gates = () => data!.project.gates;
    const approved = (g: string) => gates()[g]?.state === "approved";
    // made, waiting for approval: approved as it is, never made again (and
    // never paid twice) when a cut-off Autopilot goes on
    const made = (g: string) => gates()[g]?.state === "pending";
    const rendered = () => {
      const r = data?.project.render;
      return !!data?.latestVideo && r?.state === "done" && String(r.at ?? "") > String(gates().review?.at ?? "");
    };
    if (["script", "voice", "scenes", "review"].every(approved) && (rendered() || (!resumed && data.latestVideo))) {
      if (resumed) await runner("autopilot-mark", { projectDir: dir, on: false }).catch(() => {});
      else pilotError = "Every step is done already. Render again on the Your video tab if you want a new file.";
      return;
    }
    const approveGate = async (gate: string) => {
      if (!approved(gate)) await runner("approve-gate", { projectDir: dir, gate });
      await load();
    };
    setPilot("Starting");
    try {
      await runner("autopilot-mark", { projectDir: dir, on: true });
      if (!approved("script")) {
        if (!data.scriptMarkdown) {
          setPilot("Writing the script");
          show("script", "autopilot");
          await runner("write-script", { projectDir: dir, llm: llmFor(app.config, "script"), input: { topic: data.project.title, targetLengthMin: data.brief?.targetLengthMin ?? app.config?.defaults?.targetLengthMin ?? 8 }, channel: app.config!.channel });
          await load();
        }
        await approveGate("script");
      }
      if (!approved("voice") && made("voice")) await approveGate("voice");
      if (!approved("voice")) {
        setPilot("Reading the script aloud and mixing");
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
          setPilot("Adding the background music");
          await runner("make-music", { projectDir: dir, music: { provider: "elevenlabs" } });
        }
        await approveGate("voice");
      }
      if (!approved("scenes") && made("scenes")) await approveGate("scenes");
      if (!approved("scenes")) {
        setPilot("Planning the scenes");
        show("scenes", "autopilot");
        // its price first, like every paid AI call (DECISIONS 130)
        const cost = (await runner<{ text: string }>("scenes-estimate", { projectDir: dir, llm: llmFor(app.config, "scenes"), look })).text;
        if (!(await ask(`Autopilot plans the scenes next: the AI reads the whole scene catalog, then the code of the best scene types for every sentence. With ${describeLlm(llmFor(app.config, "scenes"))} this costs ${cost} from your AI key. Go on?`, { title: "Autopilot: plan the scenes", kind: "info" }))) throw new Error("you stopped it before the scene plan; nothing was spent on it");
        await runner("make-scenes", { projectDir: dir, llm: llmFor(app.config, "scenes"), look });
        await approveGate("scenes");
      }
      if (!approved("review") && made("review")) await approveGate("review");
      if (!approved("review")) {
        setPilot("Building the preview");
        show("preview", "autopilot");
        await runner("build-video", { projectDir: dir, look });
        const vcost = (await runner<{ text: string }>("visual-estimate", { projectDir: dir, llm: llmFor(app.config, "scenes") })).text;
        if (await ask(`The preview is built. Let the AI check every picture against what is said, and swap the scenes that do not fit? With ${describeLlm(llmFor(app.config, "scenes"))} this costs ${vcost} from your AI key. No: the video renders as it is.`, { title: "Autopilot: check the pictures", kind: "info" })) {
          setPilot("Checking the pictures");
          await runner("visual-check", { projectDir: dir, llm: llmFor(app.config, "scenes"), look });
        }
        await approveGate("review");
      }
      if (!rendered()) {
        setPilot("Rendering the video");
        await render("standard");
        if (renderError) throw new Error(renderError);
      }
      await runner("autopilot-mark", { projectDir: dir, on: false });
      pilotNote = "";
    } catch (e) {
      pilotError = `Autopilot stopped: ${errorText(e)}`;
      await runner("autopilot-mark", { projectDir: dir, on: false }).catch(() => {});
      await load().catch(() => {});
    } finally {
      setPilot("");
    }
  }
  // A channel video (docs/BUILD_PLAN.md): the locked recipe, step by step, with
  // the same commands as the tabs, up to the existing Preview step, which waits
  // for the user. Nothing is asked on the way but the avatar's price. A cut-off
  // run goes on from where it stopped; what is made is never made again.
  async function recipeRun() {
    if (!data?.project.recipe || pilots[dir]) return;
    const recipe = data.project.recipe;
    pilotError = "";
    pilotNote = "";
    const gates = () => data!.project.gates;
    const approved = (g: string) => gates()[g]?.state === "approved";
    const made = (g: string) => gates()[g]?.state === "pending";
    const approveGate = async (gate: string) => {
      if (!approved(gate)) await runner("approve-gate", { projectDir: dir, gate });
      await load();
    };
    const hasKey = (l: { provider: string }) => !!app.keys[l.provider];
    setPilot("Starting");
    try {
      await runner("autopilot-mark", { projectDir: dir, on: true });
      if (!approved("script")) {
        if (!data.scriptMarkdown) {
          setPilot("Writing the script");
          show("script", "recipe");
          await runner("write-script", { projectDir: dir, llm: llmFor(app.config, "script"), input: { topic: data.project.title, targetLengthMin: recipe.targetLengthMin }, channel: app.config!.channel });
          await load();
        }
        await approveGate("script");
      }
      // a pasted script: its title ideas and summary, for the Publishing Card
      if (hasKey(llmFor(app.config, "texts")) && gates().script?.mode === "custom") {
        const has = await runner<{ packaging: unknown }>("packaging-state", { projectDir: dir });
        if (!has.packaging) {
          setPilot("Writing the title and the summary");
          await runner("packaging-make", { projectDir: dir, llm: llmFor(app.config, "texts") }).catch((e) => log("packaging_failed", { error: errorText(e) }, "warn"));
        }
      }
      if (!approved("voice") && made("voice")) await approveGate("voice");
      if (!approved("voice")) {
        setPilot(recipe.voice.provider === "kokoro" ? "The free voice is reading the script" : "Reading the script aloud");
        show("voice", "recipe");
        await runner("make-voice", { projectDir: dir, narrator: { provider: recipe.voice.provider, voice: recipe.voice.voice }, music: null });
        if (recipe.music.on) {
          setPilot("Adding the music");
          await runner("make-music", { projectDir: dir, music: { provider: recipe.music.source, mood: recipe.music.mood } });
        }
        await approveGate("voice");
      }
      if (!approved("scenes") && made("scenes")) await approveGate("scenes");
      if (!approved("scenes")) {
        setPilot("Filling the scene templates");
        show("scenes", "recipe");
        const ai = llmFor(app.config, "scenes");
        if (hasKey(ai)) await runner("make-template-scenes", { projectDir: dir, llm: ai, look });
        else await runner("simple-template-scenes", { projectDir: dir, look });
        await approveGate("scenes");
      }
      const avatar = gates().avatar?.state;
      if (avatar !== "approved" && avatar !== "skipped") {
        if (recipe.avatar.on && recipe.avatar.lookId) {
          if (avatar !== "pending") {
            setPilot("Asking about the avatar");
            show("avatar", "recipe");
            const plan = await runner<{ estimate?: { low: number; high: number } }>("avatar-plan", { projectDir: dir, service: "heygen", engine: "avatar_iii" });
            const price = plan.estimate ? `about $${plan.estimate.low.toFixed(2)} to $${plan.estimate.high.toFixed(2)}` : "some";
            if (!(await ask(`This channel's recipe has the avatar on. HeyGen makes the opening and the closing with Avatar III, which costs ${price} of your HeyGen credits. Go on?`, { title: "The avatar", kind: "info" }))) throw new Error("you stopped it before the avatar; nothing was spent on it. Press Make the video to go on");
            setPilot("HeyGen is making the avatar");
            await runner("make-avatar", { projectDir: dir, service: "heygen", lookId: recipe.avatar.lookId, lookName: recipe.avatar.name ?? null, which: ["open", "close"], look, layout: { style: "overlay", position: "bottom-right", size: "medium" }, engine: "avatar_iii", lookEngines: [] });
            await load();
          }
          await approveGate("avatar");
        } else {
          await runner("skip-gate", { projectDir: dir, gate: "avatar" });
          await load();
        }
      }
      if (!approved("review") && !made("review")) {
        if (recipe.broll?.on) {
          show("scenes", "recipe");
          // the video goes on without it: a source that is down is only fewer clips
          await findBroll(dir, llmFor(app.config, "scenes"), app.keys, setPilot).catch((e) => {
            log("broll_engine_failed", { error: errorText(e) }, "warn");
            pilotNote = `The B-roll search stopped: ${errorText(e)}. You can start it again on the Preview tab.`;
          });
        }
        setPilot("Building the preview");
        show("preview", "recipe");
        await runner("build-video", { projectDir: dir, look });
        await load();
      }
      await runner("autopilot-mark", { projectDir: dir, on: false });
      show(approved("review") ? "video" : "preview", "recipe");
      notifyDone("Your preview is ready", data?.project.title ?? "");
    } catch (e) {
      pilotError = `The video stopped: ${errorText(e)}`;
      await runner("autopilot-mark", { projectDir: dir, on: false }).catch(() => {});
      await load().catch(() => {});
    } finally {
      setPilot("");
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
      {#if data.project.recipe}
        <button type="button" class="pilot" disabled={!!pilot || anyJob} onclick={() => recipeRun()} title="Every step of this channel's recipe, up to the preview.">{pilot ? `${pilot}...` : "Make the video"}</button>
      {:else}
        <button type="button" class="pilot" disabled={!!pilot || anyJob} onclick={() => autopilot()} title="Every remaining step with the recommended settings, then the render. Never adds an avatar.">{pilot ? `Autopilot: ${pilot}...` : "Finish on Autopilot"}</button>
      {/if}
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
    {#if pilotNote && pilot}<p class="note">{pilotNote}</p>{/if}
    {#if data.project.render?.state === "failed" && !running(dir, ["render-video"]) && active !== "video"}
      <p class="note">The last render did not finish: {data.project.render.error ?? "no reason given"} <button type="button" class="link" onclick={() => show("video", "render-failed")}>Open Your video</button></p>
    {/if}

    <div class="body" bind:this={body}>
      {#if active === "script"}
        <ScriptGate {app} {dir} {saved} title={data.project.title} gate={data.project.gates.script} markdown={data.scriptMarkdown} briefLength={data.brief?.targetLengthMin} hasBrief={!!data.brief} fromCourse={!!data.project.series} calls={data.calls ?? null} changed={load} goto={show} {openPage} />
      {:else if active === "voice"}
        <VoiceGate {app} {dir} voiceInfo={data.voiceInfo} gate={data.project.gates.voice} scriptApproved={data.project.gates.script?.state === "approved"} changed={load} goto={show} />
      {:else if active === "scenes"}
        <SceneGate {app} {dir} {saved} gate={data.project.gates.scenes} voiceApproved={data.project.gates.voice?.state === "approved"} changed={load} goto={show} next={nextAfter("scenes", hasHeygen)} />
      {:else if active === "avatar"}
        <AvatarGate {app} {dir} gate={data.project.gates.avatar} scenesApproved={data.project.gates.scenes?.state === "approved"} {look} changed={load} goto={show} />
      {:else if active === "preview"}
        <PreviewGate {app} {dir} gates={data.project.gates} stills={data.stills} {look} changed={load} goto={show} render={() => render("standard")} recipe={!!data.project.recipe} />
      {:else if active === "thumbnail"}
        <ThumbnailTab {app} {dir} hasVideo={!!data.latestVideo} changed={load} goto={show} {openPage} />
      {:else}
        <VideoTab {app} {dir} reviewApproved={data.project.gates.review?.state === "approved"} latest={data.latestVideo} title={data.project.title} series={data.project.series ?? null} {renderError} {render} goto={show} {connections} thumbnailChosen={!!data.thumbnailChosen} />
      {/if}
    </div>
  {/if}
</div>

<style>
  .page { height: 100%; display: grid; grid-template-rows: auto auto auto 1fr; max-width: 1100px; margin: 0 auto; padding: 10px 20px 0; gap: 8px; }
  header { display: flex; gap: 8px; align-items: center; min-width: 0; }
  /* D6: Autopilot where the eye goes, next to the title */
  .pilot { border-color: var(--primary); color: var(--primary); font-weight: 600; }
  h1 { flex: 1; margin: 0; font-size: 20px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .tabs { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; }
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
  /* no bottom padding: the action bar sticks to the very bottom edge */
  .body { min-height: 0; overflow: auto; padding: 4px 2px 0; scroll-padding-bottom: 90px; }
  .hint { color: var(--muted-foreground); font-size: 13px; }
  .note { margin: 0; padding: 8px 12px; border-radius: 8px; background: var(--warning-surface); color: var(--warning-text); font-size: 13px; }
  @media (max-width: 980px) {
    .tab { padding: 6px 8px; font-size: 12px; }
  }
</style>
