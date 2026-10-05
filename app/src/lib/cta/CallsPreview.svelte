<script lang="ts">
  // CallsPreview: the cheap preview of the comment calls (docs/wizards/cta.md):
  // where they sit on the video's timeline, roughly what the narrator says, and
  // a still of each call scene in the Identity's colours (cta-close: the call
  // line, the keyword on a button in its temperature). No render, no key.
  import type { CtaMode, CtaSegment, CtaSlot, CtaState } from "../api";

  let {
    options,
    look,
    slots,
    on,
    modes = { start: "auto", middle: "auto", end: "auto" },
    segments = [],
    offers,
  }: {
    options: CtaState["options"];
    look: CtaState["look"];
    slots: Record<CtaSlot, string | null>;
    on: Record<CtaSlot, boolean>;
    modes?: Record<CtaSlot, CtaMode>;
    segments?: CtaSegment[];
    offers: Record<string, string>;
  } = $props();

  const AT: Record<CtaSlot, number> = { start: 8, middle: 52, end: 88 };
  const calls = $derived(
    (["start", "middle", "end"] as CtaSlot[])
      .filter((s) => on[s] && slots[s])
      .map((s) => {
        const info = options.keywords.find((k) => k.keyword === slots[s])!;
        const segs = segments.filter((g) => g.keyword === info.keyword);
        return { slot: s, keyword: info.keyword, temperature: info.temperature, says: offers[info.keyword]?.trim() || info.gets, segment: modes[s] !== "narrator" && segs.length ? segs : null };
      }),
  );
</script>

{#if !calls.length}
  <p>No comment call: the video ends with the recap. Your landing page link goes into the YouTube description only.</p>
{:else}
  <div class="timeline" aria-label="Where the calls sit in the video">
    <span class="edge">0:00</span>
    <div class="bar">
      {#each calls as c (c.slot)}
        <span class="mark" style={`left: ${AT[c.slot]}%; --dot: ${options.temperatures[c.temperature].dot}; --on-dot: ${c.temperature === "warm" ? "#1a1a1a" : "#ffffff"}`}>{c.keyword}</span>
      {/each}
    </div>
    <span class="edge">end screen</span>
  </div>

  <h2>Roughly what the narrator says</h2>
  <ul class="says">
    {#each calls as c (c.slot)}
      {#if c.segment}
        <li><b>{options.slots[c.slot].label}:</b> your segment plays ({c.segment.map((g) => g.name).join(" or ")}); the narrator says no call here.</li>
      {:else}
        <li><b>{options.slots[c.slot].label}:</b> Comment {c.keyword} below and I'll send you {c.says}.</li>
      {/if}
    {/each}
  </ul>
  <p class="hint">The AI writes the real sentence in your video's language, around your topic. The keyword always stays in capitals, as it is.</p>

  <h2>On screen while the call is spoken</h2>
  <div class="stills">
    {#each calls.filter((c) => !c.segment) as c (c.slot)}
      <figure>
        <div class="frame" style={`background: ${look.bg}; color: ${look.fg}; font-family: ${look.font}`}>
          <span class="line">Comment {c.keyword} below</span>
          <span class="button" style={`background: ${look.buttons[c.temperature]}; color: ${look.bg}`}>{c.keyword}</span>
        </div>
        <figcaption>{options.slots[c.slot].label}, {options.temperatures[c.temperature].label.toLowerCase()}</figcaption>
      </figure>
    {/each}
  </div>
  <p class="hint">A still, close to the real scene. The button's colour is made dark enough that its text stays readable on your background.</p>
{/if}

<style>
  .timeline { display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: center; margin: 8px 0 24px; }
  .edge { font-size: 12px; color: var(--muted-foreground); }
  .bar { position: relative; height: 8px; border-radius: 4px; background: var(--border); }
  .mark { position: absolute; top: -9px; transform: translateX(-50%); padding: 2px 8px; border-radius: 999px; background: var(--dot); color: var(--on-dot); font: 700 12px ui-monospace, "JetBrains Mono", monospace; }
  h2 { margin: 12px 0 4px; font-size: 16px; }
  .says { margin: 0; padding-left: 18px; display: grid; gap: 4px; }
  .stills { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
  figure { margin: 0; display: grid; gap: 4px; }
  .frame { aspect-ratio: 16 / 9; display: grid; place-content: center; justify-items: center; gap: 10%; border-radius: 8px; border: 1px solid var(--border); container-type: inline-size; }
  .line { font-size: 6.5cqw; text-align: center; padding: 0 4cqw; font-weight: 700; letter-spacing: -0.01em; }
  .button { font-size: 5cqw; font-weight: 700; padding: 2.5cqw 6cqw; border-radius: 999px; }
  figcaption, .hint { font-size: 12px; color: var(--muted-foreground); }
</style>
