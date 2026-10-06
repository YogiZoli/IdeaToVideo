<script lang="ts">
  // BrandMini: the live picture of a Brand Identity Card, a 16:9 frame drawn
  // from its tokens with the shipped fonts. It changes on every click; the
  // real stills come from the Preview screen. No logo: logos never go into
  // the videos (Zoltan, 2026-10-02, K2); they are on the card for other tools.
  import type { BrandCard } from "../api";
  import { CORNERS, previewFamily, SAMPLE_LINE } from "../brand";

  let { card, language = "en", small = false }: { card: BrandCard; language?: string; small?: boolean } = $props();

  const c = $derived(card.colors);
  const radius = $derived(CORNERS[card.shape.corners] ?? 14);
  const cardStyle = $derived(
    card.shape.cards === "shadow"
      ? `box-shadow: 0 0.6cqw 2cqw rgba(0,0,0,0.18); border: none;`
      : card.shape.cards === "border"
        ? `border: 0.25cqw solid ${c.border};`
        : `border: none;`,
  );
  const title = $derived(card.nameplate?.name || card.name || "Your title");
</script>

<div class="mini" class:small style="--bg:{c.background}; --fg:{c.text}; --muted:{c.muted}; --surface:{c.surface}; --border:{c.border}; --p:{c.primary}; --s:{c.secondary}; --t:{c.tertiary}; --r:{radius / 19.2}cqw; --display:{previewFamily(card.fonts.display.family)}; --body:{previewFamily(card.fonts.body.family)}; --mono:{previewFamily(card.fonts.mono?.family ?? 'JetBrains Mono')}">
  <div class="frame" aria-label="Preview of the look">
    <span class="kicker">{card.nameplate?.title || "Your YouTube channel"}</span>
    <span class="title">{title}</span>
    <span class="line">{SAMPLE_LINE[language] ?? SAMPLE_LINE.en}</span>
    <div class="cards">
      <div class="card" style={cardStyle}><span class="num">42%</span><span class="lab">Primary</span></div>
      <div class="card" style={cardStyle}><span class="dot s"></span><span class="lab">Second</span></div>
      <div class="card" style={cardStyle}><span class="dot t"></span><span class="lab">Third</span></div>
    </div>
    <span class="button">Start now</span>
  </div>
</div>

<style>
  .mini { container-type: inline-size; width: 100%; }
  .frame {
    position: relative;
    aspect-ratio: 16 / 9;
    background: var(--bg);
    color: var(--fg);
    border-radius: 8px;
    overflow: hidden;
    padding: 4cqw 5cqw;
    display: grid;
    align-content: center;
    gap: 1.1cqw;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.08);
  }
  .kicker { font-family: var(--mono); font-size: 2cqw; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); }
  .title { font-family: var(--display); font-size: 6cqw; line-height: 1; font-weight: 700; overflow-wrap: anywhere; }
  .line { font-family: var(--body); font-size: 2.8cqw; color: var(--muted); }
  .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2cqw; margin-top: 1cqw; }
  .card { background: var(--surface); border-radius: var(--r); padding: 1.6cqw 2cqw; display: grid; gap: 0.6cqw; min-height: 9cqw; align-content: center; }
  .num { font-family: var(--display); font-size: 5cqw; font-weight: 700; color: var(--p); line-height: 1; }
  .lab { font-family: var(--body); font-size: 1.8cqw; color: var(--muted); }
  .dot { width: 4.5cqw; height: 4.5cqw; border-radius: 50%; }
  .dot.s { background: var(--s); }
  .dot.t { background: var(--t); }
  .button { justify-self: start; margin-top: 1cqw; background: var(--p); color: var(--bg); font-family: var(--body); font-weight: 600; font-size: 2.2cqw; padding: 1.2cqw 3cqw; border-radius: var(--r); }
</style>
