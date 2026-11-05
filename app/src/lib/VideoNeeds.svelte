<script lang="ts">
  // What a video of this Identity needs (D2, DECISIONS 119), on Settings, Health check since
  // DECISIONS 175: each row Ready or Missing with a button to its place. The AI key, the voice
  // key and the Identity are needed; the three CTA keywords' clips and Publishing are not
  // (without a clip the narrator says the call; Publishing is marked Optional).
  import { onMount } from "svelte";
  import type { AppState, CtaState } from "./api";
  import { runner } from "./api";
  import { LLM_PROVIDERS, narratorProvider, voiceNeedsKey } from "./catalog";
  import type { PageId } from "./pages";
  import { effectiveSource, heygenReady, SOURCE_LABEL } from "./cta/clips";

  let { app, goto }: { app: AppState; goto: (page: PageId) => void } = $props();

  type Row = { id: string; label: string; detail: string; ready: boolean; optional?: boolean; action: string; go: () => void };

  let cta = $state<CtaState | null>(null);
  onMount(() => {
    runner<CtaState>("cta-state", {}).then((s) => (cta = s)).catch(() => {});
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
</script>

<section class="card">
  <h2>What a video of {app.identity?.name} needs</h2>
  <p class="hint">For this Identity. Each button takes you to its place.</p>
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

<style>
  h2 { margin: 0; }
  .hint { color: var(--muted-foreground); font-size: 13px; }
  .rows { list-style: none; margin: 8px 0 0; padding: 0; display: grid; }
  .rows li { display: grid; grid-template-columns: 84px minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 10px 0; border-top: 1px solid var(--border); }
  .state { justify-self: start; font-size: 12px; font-weight: 600; padding: 2px 10px; border-radius: 99px; background: var(--success-surface); color: var(--success); }
  .state.missing { background: var(--danger-surface); color: var(--danger-text); }
  .state.opt { background: var(--muted); color: var(--muted-foreground); }
  .what { display: grid; gap: 2px; }
  .detail { font-size: 13px; color: var(--muted-foreground); }
  .tag { font-size: 11px; color: var(--muted-foreground); font-weight: 400; }
</style>
