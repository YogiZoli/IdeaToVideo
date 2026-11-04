<script lang="ts">
  // WizardMap (DECISIONS 170): one moving frame that shows what each wizard is about,
  // on each wizard's page and first screen. The one on screen is lit, in the picture
  // too. With `goto` the rows open their page.
  type Id = "cta" | "look" | "motion" | "scenes";
  let { current, goto }: { current: string; goto?: (id: Id) => void } = $props();

  const ROWS: { id: Id; name: string; what: string; text: string }[] = [
    { id: "cta", name: "CTA", what: "What it asks for", text: "The keyword viewers comment, and who says it." },
    { id: "look", name: "Design", what: "How it looks", text: "Colors, fonts and shapes." },
    { id: "motion", name: "Motion", what: "How it moves", text: "The change from one scene to the next, the background behind them, the camera." },
    { id: "scenes", name: "Scenes", what: "What is on screen", text: "Words, icons, pictures or video, and which kinds of scene." },
  ];
</script>

<section class="map" aria-label="What each wizard is about">
  <div class="frame on-{current}" aria-hidden="true">
    <div class="back"></div>
    <div class="scene"><b>Why it works</b><i></i><i></i></div>
    <span class="tag scenesTag">Scenes</span>
    <span class="tag lookTag">Design</span>
    <span class="tag motionTag">Motion</span>
    <span class="pill">Comment GUIDE</span>
  </div>
  <div class="rows">
    {#each ROWS as r (r.id)}
      <svelte:element this={goto ? "button" : "div"} {...goto ? { type: "button", onclick: () => goto(r.id) } : {}} class="row" class:lit={current === r.id}>
        <b>{r.name}: {r.what}</b>
        <span>{r.text}</span>
      </svelte:element>
    {/each}
  </div>
</section>

<style>
  .map { display: grid; grid-template-columns: minmax(0, 300px) minmax(0, 1fr); gap: 14px; align-items: center; padding: 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
  @media (max-width: 760px) { .map { grid-template-columns: 1fr; } }
  .rows { display: grid; gap: 4px; }
  .row { display: grid; gap: 1px; text-align: left; padding: 6px 10px; border: 1px solid transparent; border-radius: 8px; background: none; font-weight: 400; font-size: 13px; min-height: 0; justify-content: stretch; }
  .row b { font-size: 14px; }
  .row span { color: var(--muted-foreground); }
  .row.lit { background: var(--primary-surface); color: var(--primary-surface-foreground); border-color: var(--primary); }
  .row.lit span { color: inherit; }

  .frame { position: relative; aspect-ratio: 16 / 9; overflow: hidden; border-radius: 8px; background: #0b1b3a; }
  .back { position: absolute; inset: 0; background-image: radial-gradient(rgb(255 255 255 / 0.35) 1.2px, transparent 1.5px); background-size: 14px 14px; animation: move 8s linear infinite; }
  @keyframes move { to { background-position: 56px 28px; } }
  .scene { position: absolute; left: 16%; right: 16%; top: 18%; bottom: 30%; display: grid; align-content: center; justify-items: center; gap: 4px; border-radius: 6px; background: #fff; color: #1e3a8a; font-size: 13px; animation: push 5s ease-in-out infinite alternate; }
  @keyframes push { from { transform: scale(0.97); } to { transform: scale(1.04); } }
  .scene i { height: 4px; border-radius: 2px; background: #94a3b8; width: 56%; }
  .scene i:last-child { width: 36%; }
  .pill { position: absolute; left: 50%; bottom: 7%; transform: translateX(-50%); white-space: nowrap; padding: 2px 10px; border-radius: 999px; background: #dc2626; color: #fff; font-size: 11px; font-weight: 700; }
  .tag { display: none; position: absolute; padding: 1px 7px; border-radius: 4px; background: #fde047; color: #111; font-size: 11px; font-weight: 700; }
  .on-scenes .scenesTag { display: block; left: 16%; top: 6%; }
  .on-scenes .scene { outline: 3px solid #fde047; }
  .on-look .lookTag { display: block; left: 16%; top: 6%; }
  .on-look .scene { background: #fef3c7; color: #b45309; outline: 3px solid #fde047; }
  .on-look .pill { background: #b45309; }
  .on-motion .motionTag { display: block; left: 6%; top: 6%; }
  .on-motion .back { background-image: radial-gradient(#fde047 1.5px, transparent 1.8px); animation-duration: 3s; }
  .on-motion .scene { animation-duration: 1.4s; }
  .on-cta .pill { outline: 3px solid #fde047; animation: beat 1.4s ease-in-out infinite; }
  @keyframes beat { 50% { transform: translateX(-50%) scale(1.1); } }
  @media (prefers-reduced-motion: reduce) { .frame * { animation: none !important; } }
</style>
