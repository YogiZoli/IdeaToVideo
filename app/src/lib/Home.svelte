<script lang="ts">
  // Home (D2, DECISIONS 119): "Ready to make videos?", one row per thing a
  // video needs, each Ready or Missing with a button to its place, then the
  // latest ONE Videos. The AI key, the voice key and the Identity are
  // needed; the three CTA keywords' clips and Publishing are not (without a
  // clip the narrator says the call; Publishing is marked Optional). When the
  // needed rows are ready, one main button: "Make a video". Above it the
  // Channels board (DECISIONS 127), when any Identity has a playlist.
  import { onMount } from "svelte";
  import type { AppState, CtaState, ProjectSummary } from "./api";
  import { runner } from "./api";
  import { LLM_PROVIDERS, narratorProvider, voiceNeedsKey } from "./catalog";
  import { ONE_VIDEO } from "./edition";
  import { setScreen } from "./logger";
  import type { PageId } from "./pages";
  import { effectiveSource, heygenReady, SOURCE_LABEL } from "./cta/clips";
  import ChannelsBoard from "./course/ChannelsBoard.svelte";

  let { app, goto, openProject, openFor, makeVideo, videos }: { app: AppState; goto: (page: PageId) => void; openProject: (dir: string) => void; openFor: (identityId: string, dir: string) => void; makeVideo: () => void; videos: () => void } = $props();

  setScreen("home");

  type Row = { id: string; label: string; detail: string; ready: boolean; optional?: boolean; action: string; go: () => void };

  let cta = $state<CtaState | null>(null);
  let recent = $state<ProjectSummary[] | null>(null);
  onMount(async () => {
    runner<CtaState>("cta-state", {}).then((s) => (cta = s)).catch(() => {});
    try {
      const all = (await runner<{ projects: ProjectSummary[] }>("list-projects", { projectsDir: app.projectsDir })).projects;
      recent = [...all].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 5);
    } catch {
      recent = [];
    }
  });

  const config = $derived(app.config!);
  const llm = $derived(LLM_PROVIDERS.find((p) => p.id === config.llm.provider) ?? LLM_PROVIDERS[0]);
  const voice = $derived(narratorProvider(config.narrator?.provider));
  const voiceLabel = $derived(voice === "elevenlabs" ? "ElevenLabs" : voice === "kokoro" ? "The free voice, no key" : "Gemini");
  const ch = $derived(config.channel ?? {});

  const needed = $derived<Row[]>([
    { id: "ai", label: "AI key", detail: `${llm.label}, for the scripts and the scene plans.`, ready: !!app.keys[config.llm.provider], action: "Connections", go: () => goto("connections") },
    { id: "voice", label: "Voice key", detail: `${voiceLabel}, for the narrator.`, ready: !voiceNeedsKey(voice) || !!app.keys[voice], action: "Connections", go: () => goto("connections") },
    { id: "identity", label: "Identity", detail: `${app.identity?.name}: ${ch.audience?.trim() ? "audience and channel set." : "who the videos are for is not set yet."}`, ready: !!app.identity && !!ch.audience?.trim(), action: "Channel & Audience", go: () => goto("channel") },
  ]);

  const heygen = $derived(heygenReady(app));
  const ctaRows = $derived<Row[]>(
    !cta
      ? []
      : (["start", "middle", "end"] as const)
          .map((slot) => ({ slot, k: (cta!.profile ?? cta!.start).slots[slot] }))
          .filter((x) => x.k)
          .map(({ slot, k }) => {
            const seg = cta!.segments.find((s) => s.keyword === k) ?? null;
            const src = effectiveSource((cta!.profile ?? cta!.start).modes?.[slot], seg, heygen);
            const ready = !!seg || src === "heygen";
            return {
              id: `cta-${slot}`,
              label: `CTA ${k}`,
              detail: seg ? `${SOURCE_LABEL[src]}, ${seg.seconds} s.` : src === "heygen" ? "HeyGen makes the clip with the next video." : "No clip: the narrator says it.",
              ready,
              optional: true,
              action: "Wizards, CTA",
              go: () => goto("cta"),
            };
          }),
  );

  const pubReady = $derived(!!app.app?.publishing?.url && !!app.keys["publishing"]);
  const publishing = $derived<Row>({ id: "publishing", label: "Publishing", detail: pubReady ? "Finished videos can be sent to your publishing app." : "Where a finished video's card goes. Not needed to make videos.", ready: pubReady, optional: true, action: "PDT Connection", go: () => goto("pdt") });

  const allReady = $derived(needed.every((r) => r.ready));
</script>

<div class="home">
  <ChannelsBoard {app} {openFor} />

  <section class="card ready">
    <div class="head">
      <h1>Ready to make videos?</h1>
      {#if allReady}<button type="button" class="primary big" onclick={makeVideo}>Make a video</button>{/if}
    </div>
    <p class="hint">{allReady ? "Everything a video needs is here." : "A few things first. Each button takes you to its place."}</p>
    <ul class="rows">
      {#each [...needed, ...ctaRows, publishing] as r (r.id)}
        <li class:ok={r.ready}>
          <span class="state" class:missing={!r.ready && !r.optional} class:opt={!r.ready && r.optional}>{r.ready ? "Ready" : r.optional && r.id === "publishing" ? "Optional" : "Missing"}</span>
          <span class="what"><b>{r.label}</b>{#if r.optional && r.id === "publishing" && r.ready} <span class="tag">Optional</span>{/if}<span class="detail">{r.detail}</span></span>
          <button type="button" class:primary={!r.ready && !r.optional} onclick={r.go}>{r.action}</button>
        </li>
      {/each}
    </ul>
  </section>

  <section class="card">
    <div class="head">
      <h2>Latest videos</h2>
      <button type="button" class="ghost" onclick={videos}>All {ONE_VIDEO}s</button>
    </div>
    {#if recent === null}
      <p class="hint">Loading...</p>
    {:else if !recent.length}
      <p class="hint">No {ONE_VIDEO} yet.</p>
    {:else}
      <ul class="recent">
        {#each recent as p (p.dir)}
          <li><button type="button" class="ghost item" onclick={() => openProject(p.dir)}><span class="t">{p.title}</span><span class="hint">{p.status}</span></button></li>
        {/each}
      </ul>
    {/if}
  </section>
</div>

<style>
  .home { display: grid; gap: 16px; padding: 24px; max-width: 900px; margin: 0 auto; }
  .head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  h1 { margin: 0; font-size: 22px; }
  h2 { margin: 0; font-size: 17px; }
  .big { font-size: 16px; padding: 10px 22px; }
  .rows, .recent { list-style: none; margin: 8px 0 0; padding: 0; display: grid; }
  .rows li { display: grid; grid-template-columns: 84px minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 10px 0; border-top: 1px solid var(--border); }
  .state { justify-self: start; font-size: 12px; font-weight: 600; padding: 2px 10px; border-radius: 99px; background: var(--success-surface); color: var(--success); }
  .state.missing { background: var(--danger-surface); color: var(--danger-text); }
  .state.opt { background: var(--muted); color: var(--muted-foreground); }
  .what { display: grid; gap: 2px; }
  .detail { font-size: 13px; color: var(--muted-foreground); }
  .tag { font-size: 11px; color: var(--muted-foreground); font-weight: 400; }
  .recent li { border-top: 1px solid var(--border); }
  .item { width: 100%; display: flex; justify-content: space-between; gap: 12px; text-align: left; border: none; padding: 10px 4px; }
  .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hint { font-size: 13px; color: var(--muted-foreground); margin: 0; }
</style>
